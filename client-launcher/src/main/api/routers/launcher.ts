import path from 'path';
import { spawn } from 'child_process';

import fs from 'fs-extra';

import Preferences from '~main/modules/preferences';
import { mainWindow } from '~main/index';
import Logger from '~main/modules/logger';
import { isGameRunning } from '~main/modules/updater';
import { patchConfig } from '~main/modules/patcher';

import { createTRPCRouter, publicProcedure } from '../trpc';

export const launcherRouter = createTRPCRouter({
	start: publicProcedure.mutation(async () => {
		const { cleanWdb, reopenLauncher, clientDir } = Preferences.data;
		if (!clientDir) return false;

		const clientPath = path.join(clientDir, 'WoW.exe');
		Logger.log(`Launching ${clientPath}...`);
		if (await isGameRunning()) return false;

		if (cleanWdb) {
			Logger.log('Cleaning up WDB...');
			await fs.remove(path.join(clientPath, 'WDB'));
		}

		// Make sure config.wtf is correct
		Logger.log('Checking Config.wtf...');
		await patchConfig();

		Logger.log('Launching WoW...');
		const process = spawn(clientPath, { detached: !reopenLauncher });

		if (!reopenLauncher) {
			mainWindow?.close();
			return true;
		}

		mainWindow?.hide();
		process.on('exit', () => {
			Logger.log('WoW stopped');
			mainWindow?.show();
		});
		return true;
	})
});
