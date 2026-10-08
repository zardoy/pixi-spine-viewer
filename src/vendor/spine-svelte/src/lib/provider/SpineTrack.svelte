<script lang="ts" module>
	import * as SPINE_PIXI from '@esotericsoftware/spine-pixi-v8';
	import { AnimationState } from '@esotericsoftware/spine-core';

	import type { CrossfadeOptions } from '../core/crossfade/crossfadePlan';

	type SpineState = SPINE_PIXI.Spine['state'];
	type TrackEntry = SPINE_PIXI.TrackEntry;

	export type Props = Partial<TrackEntry> & {
		trackIndex: Parameters<SpineState['setAnimation']>[0];
		/** When omitted, uses the first animation in skeleton data. */
		animationName?: string;
		/**
		 * Cross-fade duration in seconds when switching animations. Default `0.3`.
		 * Set to `0` to cut instantly (skips mixing and clears the track immediately).
		 */
		mixDuration?: number;
		/**
		 * Pause between loop iterations (seconds) — SpineBase `loopDelay`.
		 * On track complete: `state.timeScale = 0`, then resume after the delay.
		 * Only applies when `loop` is true and delay &gt; 0.
		 */
		loopDelay?: number;
		/**
		 * When `true`: every time `timeScale` transitions from a non-zero value to `0`
		 * (i.e. the animation is frozen), the track is immediately snapped back to
		 * frame 0 so frozen symbols always show their idle start pose.
		 */
		resetToFrameZeroWhenFrozen?: boolean;
		/**
		 * Bump to force `setAnimation` even when `animationName` is unchanged (e.g. scatter
		 * `land` and `win` both use `activation`). Ignored when `undefined`.
		 */
		restartKey?: number | string;
		/** When set, used instead of `getContextSpine()` (avoids wrong ancestor context). */
		spine?: SPINE_PIXI.Spine;
		/** Dev: packed key this track expects — mismatch vs context is logged. */
		expectedPackedKey?: string;
		/** Board debug cell (owned path — no spine context). */
		debugCell?: import('./context').SpineDebugCell;
		/**
		 * SpineBase-style idle reset: bump to re-run `animationName` with mix. When frozen
		 * (`timeScale` 0), manually advances the mix to frame 0 (baked idle pose).
		 */
		resetCounter?: number;
		onMixToFrameZeroComplete?: () => void;
		/**
		 * Blend the rendered result between animations instead of Spine mixing (see
		 * `core/crossfade`). Only the main track (index 0) crossfades.
		 */
		crossfade?: CrossfadeOptions | null;
	};
</script>

<script lang="ts">
	import { onDestroy } from 'svelte';

	import { SpineCrossfader } from '../core/crossfade/SpineCrossfader';
	import { EMPTY_ANIMATION_NAME } from '../core/playback/spinePlaybackCore';
	import { shouldCrossfade } from '../core/crossfade/crossfadePlan';

	import { propsSyncEffect } from 'pixi-svelte';
	import { getContextSpine, getContextSpineAssetKey, getContextSpineDebugCell } from './context';

	const props: Props = $props();

	function spine(): SPINE_PIXI.Spine | undefined {
		if (props.spine) return props.spine;
		// Board symbols pass `expectedPackedKey` — never use ancestor context (wrong sibling spine).
		if (props.expectedPackedKey) return undefined;
		return getContextSpine();
	}

	let track = $state<TrackEntry | null>(null);
	let crossfader: SpineCrossfader | null = null;
	let crossfaderSpine: SPINE_PIXI.Spine | null = null;
	let lastAppliedRestartKey: number | string | undefined = undefined;
	let prevResetCounter: number | undefined = undefined;
	let mixAnimationFrame: number | null = null;
	let loopDelayTimeout: ReturnType<typeof setTimeout> | null = null;
	/** True only while *this* track holds `state.timeScale` at 0 for a loop delay. */
	let loopDelayFrozen = false;

	function cancelMixAnimationFrame() {
		if (mixAnimationFrame !== null) {
			cancelAnimationFrame(mixAnimationFrame);
			mixAnimationFrame = null;
		}
	}

	function clearLoopDelayPause() {
		if (loopDelayTimeout !== null) {
			clearTimeout(loopDelayTimeout);
			loopDelayTimeout = null;
		}
	}

	/** Undo a loop-delay freeze, if (and only if) this track caused it. */
	function releaseLoopDelayFreeze(s: SPINE_PIXI.Spine) {
		if (!loopDelayFrozen) return;
		loopDelayFrozen = false;
		if (s.state.timeScale === 0 && (props.timeScale ?? 1) !== 0) s.state.timeScale = 1;
	}

	/** SpineBase loopDelay: freeze `state.timeScale` between loop iterations. */
	function buildTrackListener(
		s: SPINE_PIXI.Spine,
		userListener: TrackEntry['listener'] | undefined,
	): TrackEntry['listener'] {
		const delaySec = props.loop && (props.loopDelay ?? 0) > 0 ? props.loopDelay! : 0;

		return {
			...(userListener ?? {}),
			complete: (trackEntry) => {
				// A track being crossfaded OUT (`mixingTo` set — this entry is mixing into
				// whatever replaced it) keeps its own listener alive and can still fire its own
				// `complete` if its animation happens to loop/finish during that mix-out window.
				// That's stale relative to whatever's actually driving playback now — e.g. a
				// looping `idle_2` completing a cycle right as it's replaced by a fresh
				// non-looping override reads, to that override's own `complete` handler, as if
				// the override itself had already finished after only a few hundred ms instead
				// of its real ~1.4s duration. Only the entry that ISN'T mixing out is real.
				if (trackEntry.trackIndex !== props.trackIndex || trackEntry.mixingTo) return;
				userListener?.complete?.(trackEntry);
				if (delaySec <= 0) return;
				clearLoopDelayPause();
				const resumeScale = props.timeScale ?? 1;
				if (resumeScale === 0) return;
				s.state.timeScale = 0;
				loopDelayFrozen = true;
				loopDelayTimeout = setTimeout(() => {
					loopDelayTimeout = null;
					loopDelayFrozen = false;
					if (!s.destroyed && s.state) {
						s.state.timeScale = props.timeScale ?? 1;
					}
				}, delaySec * 1000);
			},
		};
	}

	function flushTrackToFrameZero() {
		const s = spine();
		const t = track;
		if (!s?.state || !t) return;
		t.trackTime = 0;
		s.skeleton.setupPoseSlots();
		s.state.update(0);
		s.state.apply(s.skeleton);
		s.skeleton.updateWorldTransform(SPINE_PIXI.Physics.update);
		//@ts-ignore
		s.invalidatePose?.();
	}

	function advanceMixWhilePaused() {
		const mixDur = props.mixDuration ?? 0.3;
		if (mixDur <= 0) {
			flushTrackToFrameZero();
			props.onMixToFrameZeroComplete?.();
			return;
		}

		const advanceMix = () => {
			const s = spine();
			if (!s) {
				mixAnimationFrame = null;
				return;
			}

			const currentTrack = s.state.tracks[props.trackIndex];
			if (!currentTrack) {
				mixAnimationFrame = null;
				return;
			}

			const mixingFrom = currentTrack.mixingFrom;
			if (mixingFrom && currentTrack.mixTime < currentTrack.mixDuration) {
				const previousTimeScale = s.state.timeScale;
				s.state.timeScale = 1;
				const delta = 1 / 60;
				s.state.update(delta);
				s.state.apply(s.skeleton);
				s.skeleton.update(delta);
				s.skeleton.updateWorldTransform(SPINE_PIXI.Physics.update);
				s.state.timeScale = previousTimeScale;
				//@ts-ignore
				s.invalidatePose?.();
				mixAnimationFrame = requestAnimationFrame(advanceMix);
				return;
			}

			if (currentTrack.mixingFrom === null) {
				currentTrack.trackTime = 0;
				s.state.apply(s.skeleton);
				s.skeleton.updateWorldTransform(SPINE_PIXI.Physics.update);
			}
			mixAnimationFrame = null;
			//@ts-ignore
			s.invalidatePose?.();
			props.onMixToFrameZeroComplete?.();
		};

		mixAnimationFrame = requestAnimationFrame(advanceMix);
	}

	function resolveAnimationName(): string | null {
		if (props.animationName != null && props.animationName !== '') {
			return props.animationName;
		}
		const s = spine();
		if (!s?.state) return null;
		const first = s.state.data.skeletonData.animations[0]?.name;
		if (!first) {
			console.error('[SpineTrack] animationName omitted but skeleton has no animations');
			return null;
		}
		return first;
	}

	function applySetAnimationWithMix() {
		const s = spine();
		if (!s?.state) {
			console.warn('[SpineTrack] applySetAnimation skipped — no spine instance', {
				expectedPackedKey: props.expectedPackedKey ?? null,
				requestedAnimation: props.animationName ?? null,
				debugCell: getContextSpineDebugCell() ?? null,
			});
			return;
		}
		const animationName = resolveAnimationName();
		if (!animationName) return;

		const contextAssetKey = getContextSpineAssetKey() ?? null;
		const skeletonData = s.state.data.skeletonData;
		const availableAnimations = skeletonData?.animations?.map((animation) => animation.name) ?? [];
		const debugCell = props.debugCell ?? getContextSpineDebugCell();

		if (
			!props.spine &&
			props.expectedPackedKey &&
			contextAssetKey &&
			props.expectedPackedKey !== contextAssetKey
		) {
			console.error('[SpineTrack] context asset key mismatch', {
				expectedPackedKey: props.expectedPackedKey,
				contextAssetKey,
				requestedAnimation: animationName,
				skeletonDataName: skeletonData?.name ?? null,
				availableAnimations,
				debugCell: debugCell ?? null,
			});
		}

		const mixDur = props.mixDuration ?? 0.3;
		// A crossfade replaces the mix: it must capture the outgoing pose *before* the track is
		// emptied or replaced, so the decision is made up front.
		const isEmpty = animationName === EMPTY_ANIMATION_NAME;
		const fromName = s.state.tracks[props.trackIndex]?.animation?.name ?? null;
		// Any switch into or out of the empty pseudo-animation fades, whatever the configured trigger
		// (it keys no attachments, so `auto` would never pick it). Fading to nothing only reads as
		// a fade when the outgoing pose fades out, hence `dissolve` there.
		const involvesEmpty = isEmpty || fromName === EMPTY_ANIMATION_NAME;
		const crossfadeOptions =
			props.trackIndex !== 0 || !props.crossfade
				? null
				: involvesEmpty
					? {
							...props.crossfade,
							mode: isEmpty ? ('dissolve' as const) : props.crossfade.mode,
							trigger: 'always' as const,
							only: undefined,
						}
					: props.crossfade;
		const willCrossfade = shouldCrossfade({
			options: crossfadeOptions,
			data: skeletonData,
			from: fromName,
			to: animationName,
		});
		if (!willCrossfade && track && mixDur === 0) s.state.setEmptyAnimation(track.trackIndex, 0);

		if (!isEmpty && props.expectedPackedKey && !availableAnimations.includes(animationName)) {
			// Skeleton swap in progress — parent {#key ownedSpineData} will remount with correct data.
			return;
		}

		try {
			clearLoopDelayPause();
			// Clear any prior loop-delay freeze before starting a new clip. Gated on the freeze being
			// ours: a host that paused the spine (timeScale 0 via `paused`) must stay paused.
			releaseLoopDelayFreeze(s);
			const switchAnimation = (crossfading: boolean) => {
				if (isEmpty) {
					// Persist (infinite trackEnd) rather than `setEmptyAnimation`, whose entry is
					// disposed after one frame and would leave nothing to crossfade from later.
					track = s.state.setAnimation(props.trackIndex, AnimationState.emptyAnimation, false);
					track.trackEnd = Infinity;
					if (crossfading) track.mixDuration = 0;
					else if (mixDur > 0) track.mixDuration = mixDur;
					track.listener = buildTrackListener(s, props.listener);
					if (props.trackIndex === 0) s.visible = false;
					return;
				}
				if (props.trackIndex === 0) s.visible = true;
				track = s.state.setAnimation(props.trackIndex, animationName, props.loop);
				// Crossfading cuts underneath; plain switches keep the configured mix.
				if (crossfading) {
					if (track) track.mixDuration = 0;
				} else if (mixDur > 0 && track) {
					track.mixDuration = mixDur;
				}
				if (track) track.listener = buildTrackListener(s, props.listener);
			};

			if (willCrossfade) {
				if (!crossfader || crossfaderSpine !== s) {
					crossfader?.destroy();
					crossfader = new SpineCrossfader(s);
					crossfaderSpine = s;
				}
				crossfader.run(switchAnimation, crossfadeOptions, animationName, props.trackIndex);
			} else {
				crossfader?.finish();
				switchAnimation(false);
			}
		} catch (error) {
			console.error('[SpineTrack] setAnimation failed', error, {
				requestedAnimation: animationName,
				expectedPackedKey: props.expectedPackedKey ?? null,
				boundSpineProvided: props.spine != null,
				loadedAssetsKey: contextAssetKey,
				skeletonDataName: skeletonData?.name ?? null,
				availableAnimations,
				debugCell: debugCell ?? null,
			});
			return;
		}

		// Frozen resting idles mount with timeScale=0 — snap pose on first setAnimation (not only 1→0).
		if ((props.timeScale ?? 1) === 0 && props.resetToFrameZeroWhenFrozen && track) {
			flushTrackToFrameZero();
		}
	}

	$effect(() => {
		const boundSpine = props.spine;
		const restartKey = props.restartKey;
		if (props.expectedPackedKey && !boundSpine) return;

		const resolvedName = resolveAnimationName();
		const animChanged =
			props.trackIndex !== track?.trackIndex ||
			resolvedName !== track?.animation?.name;
		const restartRequested =
			restartKey !== undefined && restartKey !== lastAppliedRestartKey;

		if (animChanged || restartRequested) {
			if (restartKey !== undefined) lastAppliedRestartKey = restartKey;
			applySetAnimationWithMix();
		}
	});

	$effect(() => {
		const boundSpine = props.spine;
		const cur = props.resetCounter;
		if (cur === undefined) {
			prevResetCounter = undefined;
			return;
		}
		if (cur === prevResetCounter) return;
		if (props.expectedPackedKey && !boundSpine) return;
		prevResetCounter = cur;

		cancelMixAnimationFrame();

		const mixDur = props.mixDuration ?? 0.3;
		const wasPlaying = (props.timeScale ?? 1) !== 0;

		applySetAnimationWithMix();

		if (mixDur === 0) {
			flushTrackToFrameZero();
			if (!wasPlaying) props.onMixToFrameZeroComplete?.();
			return;
		}

		if (!wasPlaying) {
			advanceMixWhilePaused();
		}
	});

	propsSyncEffect({
		props,
		target: () => track,
		ignore: [
			'trackIndex',
			'animationName',
			'mixDuration',
			'loopDelay',
			'listener',
			'resetToFrameZeroWhenFrozen',
			'restartKey',
			'resetCounter',
			'onMixToFrameZeroComplete',
			'spine',
			'expectedPackedKey',
			'debugCell',
		],
	});

	// Keep loop-delay complete handler + user listener in sync without remounting the track.
	$effect(() => {
		const s = spine();
		const t = track;
		if (!s || !t) return;
		void props.loop;
		void props.loopDelay;
		void props.listener;
		t.listener = buildTrackListener(s, props.listener);
	});

	// Snap to frame 0 when the animation is frozen (timeScale 1 → 0).
	let prevWasFrozen = (props.timeScale ?? 1) === 0;
	$effect(() => {
		const frozen = (props.timeScale ?? 1) === 0;
		if (frozen && !prevWasFrozen && props.resetToFrameZeroWhenFrozen && track) {
			cancelMixAnimationFrame();
			clearLoopDelayPause();
			flushTrackToFrameZero();
		}
		prevWasFrozen = frozen;
	});

	onDestroy(() => {
		crossfader?.destroy();
		cancelMixAnimationFrame();
		clearLoopDelayPause();
		try {
			const s = spine();
			if (s && !s.destroyed && s.state) {
				releaseLoopDelayFreeze(s);
				s.state.setEmptyAnimation(props.trackIndex, 0);
			}
		} catch (e) {
			console.warn('[SpineTrack] onDestroy cleanup skipped', e);
		}
	});
</script>
