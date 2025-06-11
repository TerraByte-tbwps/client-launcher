export const FileMap: Record<
	string,
	{
		extractPath: string;
		plus?: true;
		optional?: true;
		label?: string;
		description?: string;
	}
> = {
	['addons']: { extractPath: 'Interface/Addons' },
	['patch-enUS-7']: { extractPath: 'Data/enUS' },
	['patch-enUS-8']: { extractPath: 'Data/enUS', plus: true },
	['hd-creatures']: {
		extractPath: 'Data',
		optional: true,
		label: 'HD Creatures',
		description: 'Higher resolution retail creature models'
	},
	['hd-textures']: {
		extractPath: 'Data',
		optional: true,
		label: 'HD Textures',
		description: 'Higher resolution retail textures'
	},
	['hd-spells']: {
		extractPath: 'Data',
		optional: true,
		label: 'HD Spells',
		description: 'Higher resolution retail spell visuals'
	},
	['hd-bgs']: {
		extractPath: 'Data',
		optional: true,
		label: 'HD Battlegrounds',
		description: 'Higher detail retail battleground maps'
	},
	['hd-misc']: {
		extractPath: 'Data',
		optional: true,
		label: 'HD Interface',
		description: 'Shadowlands style user interface'
	}
};
