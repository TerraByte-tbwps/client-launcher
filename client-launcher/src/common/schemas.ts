import { z } from 'zod';

/**
 * Zod type wrappers for use with form inputs
 */
const f = {
	boolean: (defaultValue?: boolean) =>
		z.boolean().nullish().default(!!defaultValue),
	number: (defaultValue?: number, val?: (v: z.ZodNumber) => z.ZodNumber) =>
		z.preprocess(
			v =>
				v === '' || v === undefined
					? defaultValue ?? null
					: typeof v === 'string'
					? Number(v)
					: v,
			(val?.(z.number()) ?? z.number()).nullish()
		)
};

export const PreferencesSchema = z.object({
	isPortable: z.boolean().optional(),
	clientDir: z.string().optional(),
	reopenLauncher: f.boolean(),
	cleanWdb: f.boolean(true),
	rememberPosition: f.boolean(),
	windowPosition: z
		.object({
			x: z.number(),
			y: z.number(),
			width: z.number(),
			height: z.number()
		})
		.nullish(),
	plusEnabled: f.boolean(false),
	optionalPatches: z.array(z.string()).default([])
});
export type PreferencesSchema = z.infer<typeof PreferencesSchema>;
