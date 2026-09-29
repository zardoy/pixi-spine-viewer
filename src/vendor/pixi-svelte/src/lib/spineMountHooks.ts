import type * as SPINE_PIXI from '@esotericsoftware/spine-pixi-v8';

export type SpineMountHook = (spine: SPINE_PIXI.Spine) => void | (() => void);
export type SpineConstructTimingHook = (ms: number) => void;

const hooks = new Set<SpineMountHook>();
let constructTimingHook: SpineConstructTimingHook | null = null;

/** Optional game/runtime hook when a Pixi `Spine` is mounted via pixi-svelte providers. */
export function addSpineMountHook(hook: SpineMountHook): () => void {
	hooks.add(hook);
	return () => hooks.delete(hook);
}

/** Dev-only: time each `new Spine()` in BaseSpineProvider (ES module exports are not patchable). */
export function setSpineConstructTimingHook(hook: SpineConstructTimingHook | null): void {
	constructTimingHook = hook;
}

export function notifySpineConstructed(ms: number): void {
	constructTimingHook?.(ms);
}

/** Run registered mount hooks; returns a combined cleanup. */
export function notifySpineMounted(spine: SPINE_PIXI.Spine): () => void {
	const cleanups: Array<() => void> = [];
	for (const hook of hooks) {
		const cleanup = hook(spine);
		if (typeof cleanup === 'function') cleanups.push(cleanup);
	}
	return () => {
		for (const cleanup of cleanups) cleanup();
	};
}
