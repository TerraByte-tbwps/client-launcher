import path from 'node:path';
import { exec, spawn } from 'node:child_process';
import os from 'node:os';

import fetch from 'node-fetch';
import fs from 'fs-extra';
import yauzl from 'yauzl-promise';
import { app } from 'electron';
import { autoUpdater } from 'electron-updater';
import logger from 'electron-log';

import { mainWindow } from '~main/index';
import { formatDuration, formatFileSize } from '~common/utils';
import { FileMap } from '~common/constants';

import Logger from './logger';
import Preferences from './preferences';
import Observable from './observable';
import resumableFetch, { type FetchProgress } from './resumableFetch';

logger.transports.file.level = 'info';
autoUpdater.logger = logger;
autoUpdater.autoDownload = false;
autoUpdater.disableWebInstaller = true;

const ServerUrl = 'http://thebestwowprivateserver.com/downloads/';

// const isReadOnly = async (filePath: string) => {
// 	try {
// 		const { mode } = await fs.stat(filePath);
// 		return !(mode & fs.constants.S_IWUSR);
// 	} catch (e) {
// 		return false;
// 	}
// };

const execAsync = (commands: Partial<Record<NodeJS.Platform, string>>) => {
	const command = commands[os.platform()];
	if (!command) return Promise.resolve(undefined);
	return new Promise<string | undefined>(resolve => {
		exec(command, (error, stdout) => {
			if (error) resolve(undefined);
			else resolve(stdout);
		});
	});
};

const getAvailableDiskSpace = async (clientPath?: string) => {
	const response = await execAsync({
		win32:
			'%SYSTEMROOT%\\System32\\WindowsPowerShell\\v1.0\\powershell.exe -command "Get-PSDrive -PSProvider FileSystem | Select-Object Name, @{n=\'Free\';e={($_.Free / 1GB)}}"'
	});
	if (!response) return Infinity;
	const drive = clientPath?.split(':')[0] ?? 'C';
	const space = parseFloat(
		response
			.split('\n')
			.find(l => l.trim().startsWith(drive))
			?.split(/\s+/)?.[1] ?? '0'
	);
	return space * 1024 ** 3;
};

export const isGameRunning = async () => {
	const response = await execAsync({
		win32: '%SYSTEMROOT%\\System32\\tasklist.exe'
	});
	if (!response) return false;
	return response.toLowerCase().includes('wow.exe');
};

const fetchFile = async (
	filePath: string,
	progressCb?: (p: FetchProgress) => void
) => {
	try {
		await fs.ensureDir(path.join(Preferences.userDataDir, 'downloads'));
		const downloadPath = path.join(
			Preferences.userDataDir,
			'downloads',
			filePath
		);
		await resumableFetch(
			`${ServerUrl}patches/${filePath}`,
			downloadPath,
			progressCb,
			{
				throttle: 500
			}
		);
		return downloadPath;
	} catch (e) {
		Logger.log(`Failed to download ${filePath}`, 'error', e);
		throw Error(`Failed to download ${filePath}`);
	}
};

const fetchSize = async (filePath: string) => {
	try {
		const response = await fetch(`${ServerUrl}patches/${filePath}`, {
			method: 'HEAD'
		});
		return parseInt(response.headers.get('content-length') ?? '0');
	} catch (e) {
		Logger.log(`Failed to download ${filePath}`, 'error', e);
		throw Error(`Failed to download ${filePath}`);
	}
};

const fetchVersion = async (filePath: string) => {
	try {
		const response = await fetch(`${ServerUrl}patches/${filePath}`);
		return response.text();
	} catch (e) {
		Logger.log(`Failed to download ${filePath}`, 'error', e);
		throw Error(`Failed to download ${filePath}`);
	}
};

type UpdaterState =
	| 'needsValidation'
	| 'verifying'
	| 'serverUnreachable'
	| 'noClient'
	| 'launcherOutdated'
	| 'updateAvailable'
	| 'updating'
	| 'upToDate'
	| 'failed';

export type UpdaterStatus = {
	state: UpdaterState;
	progress?: number;
	message?: string;
};

class UpdaterClass extends Observable<UpdaterStatus> {
	#versionCache: Record<string, string> = {};
	#fileCache: Record<string, string[]> = {};

	#loadCache = async (clientDir: string) => {
		await fs.ensureDir(path.join(clientDir, '.launcher'));

		const versionCache = path.join(clientDir, '.launcher', 'update-cache.json');
		this.#versionCache = (await fs.exists(versionCache))
			? await fs.readJSON(versionCache)
			: {};

		const fileCache = path.join(clientDir, '.launcher', 'file-cache.json');
		this.#fileCache = (await fs.exists(fileCache))
			? await fs.readJSON(fileCache)
			: {};
	};

	#saveCache = async (clientDir: string) => {
		await fs.ensureDir(path.join(clientDir, '.launcher'));

		const versionCache = path.join(clientDir, '.launcher', 'update-cache.json');
		await fs.writeJSON(versionCache, this.#versionCache, { spaces: 2 });

		const fileCache = path.join(clientDir, '.launcher', 'file-cache.json');
		await fs.writeJSON(fileCache, this.#fileCache, { spaces: 2 });
	};

	protected _value: UpdaterStatus = { state: 'needsValidation' };

	get status() {
		return this._value;
	}

	private set status(v: UpdaterStatus) {
		this._value = v;
		this._notifyObservers(v);
		if (this.status.state === 'failed') {
			mainWindow?.setProgressBar(1, { mode: 'error' });
		} else if (this.status.progress === 1) {
			mainWindow?.setProgressBar(0);
		} else {
			mainWindow?.setProgressBar(this.status.progress ?? 0, {
				mode: this.status.progress === -1 ? 'indeterminate' : 'normal'
			});
		}
	}

	invalidate() {
		this.status = { state: 'needsValidation' };
	}

	async updateLauncher() {
		const { clientDir, isPortable } = Preferences.data;
		if (!clientDir) return;

		Logger.log(`Downloading launcher update...`);
		this.status = {
			state: 'updating',
			progress: -1,
			message: `Downloading new launcher...`
		};
		if (isPortable) {
			const newPath = await fetchFile(
				`CenturionLauncher.exe`,
				(p: FetchProgress) => {
					const progress =
						(p.done + p.initialPartial) / (p.total + p.initialPartial);
					const percent = Math.round(progress * 100);
					const elapsed = (Date.now() - p.startedAt) / 1000;
					const rate = p.done / elapsed;
					const eta = formatDuration(p.total / rate - elapsed);
					this.status = {
						state: 'updating',
						progress,
						message: `Downloading launcher update... ${percent}% (${eta} remaining)`
					};
				}
			);

			const scriptPath = path.join(clientDir, 'update-script.bat');
			const oldPath = path.join(clientDir, 'CenturionLauncher.exe');

			const updateScript = `
	@echo off
	setlocal
	echo Preparing to update the launcher. Please wait...
	timeout /t 5
	echo Updating the launcher...
	move /y "${newPath}" "${oldPath}"
	echo Update successful! Starting the new launcher...
	start "" "${oldPath}"
	endlocal
		`;

			await fs.writeFile(scriptPath, updateScript);
			Logger.log(`Running update script...`);
			const child = spawn('cmd.exe', ['/c', scriptPath], {
				detached: true,
				stdio: 'ignore'
			});
			child.unref();
			app.quit();
		} else {
			autoUpdater.on(
				'download-progress',
				({ percent, bytesPerSecond, total, transferred }) => {
					const eta = formatDuration((total - transferred) / bytesPerSecond);
					this.status = {
						state: 'updating',
						progress: percent / 100,
						message: `Downloading launcher update... ${percent.toFixed(
							0
						)}% (${eta} remaining)`
					};
				}
			);
			await autoUpdater.downloadUpdate();
			Logger.log(`Running update script...`);
			autoUpdater.quitAndInstall();
		}
	}

	async verify() {
		const { clientDir, optionalPatches, plusEnabled, isPortable } =
			Preferences.data;
		try {
			if (
				this.status?.state === 'verifying' ||
				this.status?.state === 'updating'
			)
				return;

			if (!clientDir || !(await Preferences.isValidClientDir(clientDir))) {
				this.status = { state: 'noClient' };
				return;
			}

			if (isPortable) {
				await fs.remove(path.join(clientDir, 'update-script.bat'));
				const version = await fetchVersion('latest.yml');
				if (version.match(/version: (.*)/)?.[1] !== app.getVersion()) {
					this.status = { state: 'launcherOutdated' };
					return;
				}
			} else {
				try {
					const update = await autoUpdater.checkForUpdates();
					if (update) {
						this.status = { state: 'launcherOutdated' };
						return;
					}
				} catch (e) {
					Logger.log(`Failed to check for launcher updates`, 'error', e);
				}
			}

			if (os.platform() === 'win32' && clientDir.length > 220) {
				this.status = {
					state: 'failed',
					message:
						'Path to current install location is too long and may cause issues.'
				};
				return;
			}

			if (await isGameRunning()) {
				this.status = {
					state: 'failed',
					message: 'Please close WoW first, before updating.'
				};
				return;
			}

			Logger.log(`Verifying client files at ${path.join(clientDir)}...`);
			this.status = {
				state: 'verifying',
				progress: -1,
				message: 'Looking for updates...'
			};

			await this.#loadCache(clientDir);
			let toDownload = 0;

			for (const [name, meta] of Object.entries(FileMap)) {
				const version = await fetchVersion(`${name}.version`);

				const cachePath = path.join(
					clientDir,
					'.launcher',
					'cached',
					name,
					version
				);

				// Check unused optional
				if (
					(meta.plus && !plusEnabled) ||
					(meta.optional && !optionalPatches.includes(name))
				) {
					if (this.#versionCache[name]) {
						// Move files to cache
						await fs.ensureDir(cachePath);
						for (const file of this.#fileCache[name] ?? []) {
							try {
								await fs.move(
									path.join(clientDir, meta.extractPath, file),
									path.join(cachePath, file)
								);
							} catch (e) {
								console.error(e);
							}
						}
						delete this.#versionCache[name];
					}
					continue;
				}

				// Check version
				if (this.#versionCache[name] === version) continue;

				if (await fs.exists(cachePath)) {
					// Move files from cache
					for (const file of this.#fileCache[name] ?? []) {
						try {
							await fs.move(
								path.join(cachePath, file),
								path.join(clientDir, meta.extractPath, file)
							);
						} catch (e) {
							console.error(e);
						}
					}
					this.#versionCache[name] = version;
					await fs.remove(cachePath);
					continue;
				}

				// Remove old cached versions
				await fs.remove(path.dirname(cachePath));

				// Add to download
				Logger.log(`New ${name} version available: ${version}`);
				delete this.#versionCache[name];
				toDownload += await fetchSize(`${name}.zip`);
			}

			await this.#saveCache(clientDir);

			if (toDownload !== 0) {
				const availableSpace = await getAvailableDiskSpace(clientDir);
				if (toDownload > availableSpace) {
					this.status = {
						state: 'failed',
						message: `Not enough disk space. Required: ${formatFileSize(
							toDownload
						)}, Available: ${formatFileSize(availableSpace)}`
					};
					return;
				}
			}

			this.status =
				toDownload !== 0
					? { state: 'updateAvailable', message: formatFileSize(toDownload) }
					: { state: 'upToDate', progress: 1 };
		} catch (e) {
			const message =
				e instanceof Error ? e.message : 'Unexpected error occurred';
			Logger.log(`Verification failed: ${message}`, 'error', e);
			this.status = { state: 'failed', message };
		}
	}

	async update(force?: boolean) {
		const { clientDir, optionalPatches, plusEnabled } = Preferences.data;
		try {
			if (
				this.status?.state === 'verifying' ||
				this.status?.state === 'updating'
			)
				return;

			if (!clientDir || !(await Preferences.isValidClientDir(clientDir))) {
				this.status = { state: 'noClient' };
				return;
			}

			if (await isGameRunning()) {
				this.status = {
					state: 'failed',
					message: 'Please close WoW first, before updating.'
				};
				return;
			}

			if (force) {
				await fs.remove(path.join(Preferences.userDataDir, 'downloads'));
			}

			Logger.log(`Updating client files at ${path.join(clientDir)}...`);
			this.status = {
				state: 'updating',
				progress: -1,
				message: 'Preparing files...'
			};

			const extractArchive = async (
				name: string,
				file: string,
				filePath: string,
				shouldCache: boolean
			) => {
				let finished = false;
				const archive = await yauzl.open(file);
				try {
					for await (const entry of archive) {
						Logger.log(`Extracting "${entry.filename}"...`);
						if (entry.filename.endsWith('/')) {
							await fs.ensureDir(path.join(filePath, entry.filename));
						} else {
							const dest = path.join(filePath, entry.filename);
							await fs.ensureDir(path.dirname(dest));
							const readStream = await entry.openReadStream();
							const writeStream = fs.createWriteStream(dest);
							await new Promise((resolve, reject) => {
								readStream.pipe(writeStream);
								writeStream.on('finish', resolve);
								writeStream.on('error', reject);
							});

							if (!shouldCache) continue;
							if (!this.#fileCache[name]) this.#fileCache[name] = [];
							this.#fileCache[name].push(entry.filename);
						}
					}
					finished = true;
				} finally {
					await archive.close();
					if (finished) {
						Logger.log(`Removing "${file}"...`);
						await fs.remove(file);
					}
				}
			};

			for (const [name, meta] of Object.entries(FileMap)) {
				if (meta.plus && !plusEnabled) continue;
				if (meta.optional && !optionalPatches.includes(name)) continue;

				if (this.#versionCache[name] && !force) continue;

				Logger.log(`Downloading ${name} files...`);
				const file = await fetchFile(`${name}.zip`, (p: FetchProgress) => {
					const progress =
						(p.done + p.initialPartial) / (p.total + p.initialPartial);
					const percent = Math.round(progress * 100);
					const elapsed = (Date.now() - p.startedAt) / 1000;
					const rate = p.done / elapsed;
					const eta = formatDuration(p.total / rate - elapsed);
					this.status = {
						state: 'updating',
						progress,
						message: `Downloading ${name}... ${percent}% (${eta} remaining)`
					};
				});

				this.status = {
					state: 'updating',
					progress: -1,
					message: `Extracting ${name}...`
				};
				await extractArchive(
					name,
					file,
					path.join(clientDir, meta.extractPath),
					!!meta.plus || !!meta.optional
				);

				this.#versionCache[name] = await fetchVersion(`${name}.version`);
				await this.#saveCache(clientDir);
			}

			this.status = { state: 'upToDate', progress: 1 };
		} catch (e) {
			const message =
				e instanceof Error ? e.message : 'Unexpected error occurred';
			Logger.log(`Update failed: ${message}`, 'error', e);
			this.status = { state: 'failed', message };
		}
	}
}

const Updater = new UpdaterClass();
export default Updater;
