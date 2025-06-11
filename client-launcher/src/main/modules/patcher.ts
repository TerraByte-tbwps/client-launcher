import path from 'path';

import { screen } from 'electron';
import fs from 'fs-extra';

import Preferences from '~main/modules/preferences';
import { isNotUndef } from '~common/utils';
import Logger from '~main/modules/logger';

export const patchConfig = async () => {
	const { clientDir, plusEnabled } = Preferences.data;
	if (!clientDir) return;

	// Patch WoW.exe
	const exePath = path.join(clientDir, 'WoW.exe');
	const buffer = await fs.readFile(exePath);
	buffer.write(plusEnabled ? '12341' : '12340', 0x5f3a00, 6);
	buffer.writeUInt16LE(plusEnabled ? 12341 : 12340, 0x4c99f0);

	// SIG & MD5 Protection Remover
	(
		[
			[0x1f41bf, 0xeb],
			[0x415a25, 0xeb],
			[0x415a3f, 0x03],
			[0x415a95, 0x03],
			[0x415b46, 0xeb],
			[0x415b5f, [0xb8, 0x03, 0x00, 0x00, 0x00, 0xeb, 0xed]],
			[0x4c99f0, 0x35],
			[0x5f3a04, 0x31]
		] as [number, number | number[]][]
	).forEach(([offset, value]) => {
		if (Array.isArray(value)) {
			value.forEach((v, i) => buffer.writeUInt8(v, offset + i));
		} else {
			buffer.writeUInt8(value, offset);
		}
	});

	await fs.writeFile(exePath, buffer);

	await fs.remove(path.join(clientDir, 'Data', 'enUs', 'realmlist.wtf'));
	await fs.ensureDir(path.join(clientDir, 'WTF'));

	const configPath = path.join(clientDir, 'WTF', 'Config.wtf');
	const raw = (await fs.exists(configPath))
		? await fs.readFile(configPath, { encoding: 'utf-8' })
		: '';
	await fs.remove(configPath);

	const configWtf = Object.fromEntries(
		raw
			.split('\n')
			.map(l => {
				const [_, k, v] = l.match(/SET (\w+) "(.+)"/) ?? [];
				return !k || !v ? undefined : [k, v];
			})
			.filter(isNotUndef)
	);

	const primaryDisplay = screen.getPrimaryDisplay();
	const { width, height } = primaryDisplay.bounds;

	const realmInfo = plusEnabled
		? {
				realmList: 'centurionpvp.com',
				patchList: 'centurionpvp.com',
				realmName: 'Legionnaire Plus'
		  }
		: {
				realmList: 'centurionpvp.com',
				patchList: 'centurionpvp.com',
				realmName: 'The Best WotLK Realm'
		  };

	const parsed = {
		// Defaults
		gxResolution: `${width}x${height}`,
		// gxColorBits: primaryDisplay.colorDepth,
		// gxDepthBits: primaryDisplay.colorDepth,
		// gxRefresh: 60,
		// gxMultisample: 8,
		// gxMultisampleQuality: 0,
		// gxTripleBuffer: 1,
		// anisotropic: 16,
		// frillDensity: 48,
		// fullAlpha: 1,
		// SmallCull: 0.01,
		// DistCull: 888.8,
		// shadowLevel: 0,
		// trilinear: 1,
		// specular: 1,
		// pixelShaders: 1,
		// M2UsePixelShaders: 1,
		// particleDensity: 1,
		// unitDrawDist: 300,
		// weatherDensity: 3,
		// movieSubtitle: 1,
		// minimapZoom: 0,
		// minimapInsideZoom: 0,
		// SoundZoneMusicNoDelay: 1,
		// Parsed config
		...configWtf,
		// Realm list
		...realmInfo,
		// Mandatory
		hwDetect: 0, // Skip hardware change detection
		gxWindow: 1, // Maximized windowed mode
		gxMaximize: 1, // Maximized windowed mode
		gxCursor: 1, // Hardware cursor
		// M2UseShaders: 1, // Vertex animation shader
		checkAddonVersion: 0 // Load out of date addons
	};

	await fs.writeFile(
		configPath,
		Object.entries(parsed)
			.filter(v => v[1] !== undefined && v[1] !== null)
			.map(l => `SET ${l[0]} "${l[1]}"`)
			.join('\n')
	);
	Logger.log('Config.wtf successfully patched');
};
