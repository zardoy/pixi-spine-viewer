import type { Asset, Assets, SpineSrc } from './types';

export type CreateAssetSpines = Record<string, string>;

export type CreateAssetOpts = {
	img?: string;
	atlas?: string;
	rawAtlas?: string;
	spine?: string;
	spines?: CreateAssetSpines;
	preload?: boolean;
	scale?: number;
	font?: string;
};

const toScale = (scale: number | undefined) => scale ?? 2;

const spineSrc = (rawAtlas: string, skeleton: string, scale: number): SpineSrc => ({
	atlas: rawAtlas,
	skeleton,
	scale,
});

/** Build asset descriptor(s) for Vite-imported paths/strings (static/assets index.ts pattern). */
export function createAsset(opts: CreateAssetOpts): Asset | Assets {
	const preload = opts.preload;
	const scale = toScale(opts.scale);

	if (opts.spines) {
		if (opts.rawAtlas == null) throw new Error('createAsset: spines requires rawAtlas');
		const out: Assets = {};
		for (const [key, skel] of Object.entries(opts.spines)) {
			out[key] = {
				type: 'spine',
				src: spineSrc(String(opts.rawAtlas), String(skel), scale),
				preload,
			};
		}
		return out;
	}

	if (opts.spine != null && opts.rawAtlas != null) {
		return {
			type: 'spine',
			src: spineSrc(String(opts.rawAtlas), String(opts.spine), scale),
			preload,
		};
	}

	if (opts.img != null && opts.atlas != null) {
		return { type: 'sprites', src: String(opts.atlas), preload };
	}

	if (opts.img != null && opts.font != null) {
		return {
			type: 'font',
			src: String(opts.img),
			preload,
		};
	}

	if (opts.img != null) {
		return { type: 'sprite', src: String(opts.img), preload };
	}

	throw new Error('createAsset: unsupported or incomplete options');
}
