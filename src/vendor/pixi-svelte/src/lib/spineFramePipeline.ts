import type { Spine } from '@esotericsoftware/spine-pixi-v8';

/**
 * Ordering of per-frame tasks run after `state.apply()`.
 *
 * Load-bearing: FORCE_HIDE must run after MIX_RULES, or a `duringMix: 'from'` rule re-attaches
 * an attachment that force-hide already removed this frame.
 */
export const FRAME_PHASE = {
	/** Pre-existing hook captured at install time, plus stray assignments. */
	INHERITED: -10,
	EMIT: 0,
	MIX_RULES: 10,
	FORCE_HIDE: 20,
	FOLLOW: 30,
	DEBUG: 40,
} as const;

export type FramePhase = (typeof FRAME_PHASE)[keyof typeof FRAME_PHASE];

type FrameTask = (spine: Spine) => void;

type Entry = {
	fn: FrameTask;
	phase: number;
	/** Tie-breaker so same-phase tasks keep registration order. */
	seq: number;
};

export type SpineFramePipeline = {
	add: (fn: FrameTask, phase?: number) => () => void;
};

type Patched = Spine & { __framePipeline?: SpineFramePipeline };

const installed = new WeakMap<Spine, SpineFramePipeline>();

/**
 * Take sole ownership of `spine.afterUpdateWorldTransforms` and expose an ordered task list.
 *
 * Without this, the hook is a single slot that every feature assigns to — pixi-svelte's
 * `SpineEventEmitterProvider` assigned it outright while other code chained it, so whichever ran
 * second silently disabled the first.
 */
export function getFramePipeline(spine: Spine): SpineFramePipeline {
	const existing = installed.get(spine);
	if (existing) return existing;

	const entries: Entry[] = [];
	let seq = 0;
	let sorted = true;

	const inherited = spine.afterUpdateWorldTransforms;

	const add: SpineFramePipeline['add'] = (fn, phase = FRAME_PHASE.EMIT) => {
		const entry: Entry = { fn, phase, seq: seq++ };
		entries.push(entry);
		sorted = false;
		return () => {
			const i = entries.indexOf(entry);
			if (i !== -1) entries.splice(i, 1);
		};
	};

	const run = (target: Spine) => {
		if (!sorted) {
			entries.sort((a, b) => a.phase - b.phase || a.seq - b.seq);
			sorted = true;
		}
		// Snapshot: a task may unsubscribe itself or register another mid-run.
		for (const entry of [...entries]) entry.fn(target);
	};

	const pipeline: SpineFramePipeline = { add };

	if (typeof inherited === 'function') add(inherited, FRAME_PHASE.INHERITED);

	Object.defineProperty(spine, 'afterUpdateWorldTransforms', {
		configurable: true,
		enumerable: true,
		get: () => run,
		// Absorb rather than replace: a plain assignment would drop every registered task, and
		// absorbing matches what callers that chain the hook already expect.
		set: (fn: FrameTask) => {
			if (fn === run) return;
			if (typeof fn === 'function') add(fn, FRAME_PHASE.INHERITED);
		},
	});

	(spine as Patched).__framePipeline = pipeline;
	installed.set(spine, pipeline);
	return pipeline;
}
