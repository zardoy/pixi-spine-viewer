import type { AnySpine } from '../runtime/spineRuntime'
import { spineSvelteConfig } from '../../configure'
import { seekTrackProgress } from '../playback/spinePlaybackCore'

export type SpineAnimationOverride = {
	animation?: string
	/** Layered animation on track 1. */
	animation2?: string
	skin?: string
	loop?: boolean
	loop2?: boolean
	loopDelay?: number
	onAnimationEvent?: (event: { name: string }) => void
}

export type SetOverrideOptions = {
	/** Store the override even when no spine with this control is mounted yet. */
	allowUnmounted?: boolean
}

export type OverrideEntry = {
	override: SpineAnimationOverride & { resetCounter?: number }
	counter: number
	timestamp: number
	resolve: (completed: boolean) => void
}

export type BasePlayback = {
	animationName?: string
	skinName?: string
	playbackLoop?: boolean
	playbackLoopDelay?: number
}

export type MergedPlayback = {
	animationName: string | undefined
	animation2Name: string | undefined
	skinName: string | undefined
	playbackLoop: boolean
	playbackLoop2: boolean
	playbackLoopDelay: number
	resetCounter: number | undefined
	/** Changes whenever the active override changes — use it to retrigger derivations. */
	revision: number
}

function deferred(): { promise: Promise<boolean>; resolve: (value: boolean) => void } {
	let resolve!: (value: boolean) => void
	const promise = new Promise<boolean>((r) => {
		resolve = r
	})
	return { promise, resolve }
}

/**
 * Imperative, awaitable animation overrides layered on top of a spine's normal playback.
 *
 * Solves the "play a one-shot clip over a looping idle, then fall back" problem, including the
 * awkward parts: spamming a trigger must not strand the state machine, an interrupted override
 * resolves `false` rather than hanging, and a completion arriving from a clip that is already
 * mixing out must be ignored.
 *
 * Deliberately store-agnostic — it keeps its own listener list instead of depending on a
 * reactivity library, so the same class works from Svelte, React or plain TS. Call
 * {@link SpineOverrideController.subscribe} to drive whatever the host uses.
 */
export class SpineOverrideController<TConfig extends Record<string, string> = Record<string, string>> {
	readonly overrides: Record<string, OverrideEntry | undefined> = {}
	readonly promise: Record<string, Promise<boolean>> = {}
	readonly spineRefs: Record<string, AnySpine | null> = {}

	private globalCounter = 0
	private mountedCount: Record<string, number | undefined> = {}
	private resetCounterByKey: Record<string, number> = {}
	private listeners = new Set<() => void>()

	constructor(private debug = false) {}

	/** Notified whenever an override is set or cleared. Returns an unsubscribe function. */
	subscribe(listener: () => void): () => void {
		this.listeners.add(listener)
		return () => {
			this.listeners.delete(listener)
		}
	}

	private notify(): void {
		for (const listener of [...this.listeners]) listener()
	}

	registerSpineRef(control: string, spine: AnySpine | null): void {
		this.spineRefs[control] = spine
	}

	mountControl(control: string): void {
		this.mountedCount[control] = (this.mountedCount[control] ?? 0) + 1
	}

	unmountControl(control: string): void {
		this.mountedCount[control] = Math.max(0, (this.mountedCount[control] ?? 0) - 1)
	}

	isMounted(control: string): boolean {
		return (this.mountedCount[control] ?? 0) > 0
	}

	setAnimationProgress(control: string, progress: number, trackIndex = 0): void {
		const spine = this.spineRefs[control]
		if (!spine?.state) return
		seekTrackProgress(spine, progress, trackIndex)
	}

	clearOverride<TKey extends keyof TConfig>(overrideKey: TKey): void {
		const key = String(overrideKey)
		const entry = this.overrides[key]
		if (!entry) return
		// Interrupted, not completed.
		entry.resolve(false)
		delete this.overrides[key]
		this.notify()
	}

	/** Resolves `true` when the clip finished, `false` if something replaced or cleared it. */
	setOverride<TKey extends keyof TConfig>(
		overrideKey: TKey,
		next: SpineAnimationOverride,
		options?: SetOverrideOptions,
	): Promise<boolean> {
		const key = String(overrideKey)

		if (!options?.allowUnmounted && !this.isMounted(key)) {
			spineSvelteConfig().warn(
				`[SpineOverrideController] control "${key}" is not mounted; skipping override "${next.animation}"`,
			)
			return Promise.resolve(true)
		}

		// Any prior override for this key loses — resolve it so its awaiter unblocks.
		this.overrides[key]?.resolve(false)

		this.globalCounter++
		const { promise, resolve } = deferred()

		const override: OverrideEntry['override'] = { ...next }
		// A primary-track override must retrigger track 0 even when the animation name is
		// unchanged, so bump a per-key counter that the track component watches.
		if (next.animation != null && next.animation !== '') {
			this.resetCounterByKey[key] = (this.resetCounterByKey[key] ?? 100) + 1
			override.resetCounter = this.resetCounterByKey[key]
		}

		this.overrides[key] = {
			override,
			counter: this.globalCounter,
			timestamp: Date.now(),
			resolve,
		}
		this.promise[key] = promise

		if (this.debug) {
			spineSvelteConfig().log(
				`[SpineOverrideController] set "${key}" counter=${this.globalCounter}`,
			)
		}

		this.notify()
		return promise
	}

	awaitAnimation<TKey extends keyof TConfig>(controlKey: TKey): Promise<boolean> {
		return this.promise[String(controlKey)] ?? Promise.resolve(true)
	}

	hasOverride<TKey extends keyof TConfig>(controlKey: TKey): boolean {
		return this.overrides[String(controlKey)] != null
	}

	getActiveKeys(): string[] {
		return Object.keys(this.overrides).filter((key) => this.overrides[key] != null)
	}

	clearAll(): void {
		for (const key of this.getActiveKeys()) {
			this.overrides[key]?.resolve(false)
			delete this.overrides[key]
		}
		this.notify()
	}

	/** Base playback props with any active override folded in. */
	getPlayback<TKey extends keyof TConfig>(controlKey: TKey, base: BasePlayback): MergedPlayback {
		const entry = this.overrides[String(controlKey)]

		if (!entry) {
			return {
				animationName: base.animationName,
				animation2Name: undefined,
				skinName: base.skinName,
				playbackLoop: base.playbackLoop ?? true,
				playbackLoop2: false,
				playbackLoopDelay: base.playbackLoopDelay ?? 0,
				resetCounter: undefined,
				revision: 0,
			}
		}

		const { override, counter } = entry
		const hasPrimary = override.animation != null && override.animation !== ''

		/*
		 * When a primary animation override is active, loop/loopDelay come from the override
		 * alone. Inheriting the base idle's `loop: true` would start another iteration of the
		 * override clip before its completion clears the entry, so it would never fall back.
		 */
		return {
			animationName: hasPrimary ? override.animation : base.animationName,
			animation2Name:
				override.animation2 != null && override.animation2 !== '' ? override.animation2 : undefined,
			skinName: override.skin ?? base.skinName,
			playbackLoop: hasPrimary ? (override.loop ?? false) : (override.loop ?? base.playbackLoop ?? true),
			playbackLoop2: override.loop2 ?? false,
			playbackLoopDelay: hasPrimary
				? (override.loopDelay ?? 0)
				: (override.loopDelay ?? base.playbackLoopDelay ?? 0),
			resetCounter: override.resetCounter,
			revision: counter,
		}
	}

	/**
	 * Complete the override for `control`, if this track is the one it was waiting on.
	 *
	 * Callers must skip track entries that are mixing out (`trackEntry.mixingTo`), otherwise an
	 * interrupted clip resolves the override that just replaced it.
	 */
	handleTrackComplete(control: string, trackIndex: number): void {
		const entry = this.overrides[control]
		if (!entry) return

		const { override, resolve } = entry
		if (override.animation2 || override.animation) {
			if (trackIndex === 1 && !override.animation2) return
			if (trackIndex === 0 && !override.animation) return
			// A looping override never completes on its own; it ends when cleared.
			if (trackIndex === 0 && override.loop) return
		}

		resolve(true)
		delete this.overrides[control]
		this.notify()
	}
}
