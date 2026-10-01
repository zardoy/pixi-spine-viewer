<script lang="ts" module>
	export type SpineNodeChildArgs = { spine: AnySpine }

	export type Props = {
		/** Loader key. Also the asset key reported to `pixi-svelte` context. */
		key: string
		/** Supplies the skeleton. Omit when passing `spineData` directly. */
		loader?: SpineLoaderApi
		/** Pre-resolved skeleton, used instead of asking the loader. */
		spineData?: AnySkeletonData

		// Placement
		x?: number
		y?: number
		scale?: number | { x: number; y: number }
		anchor?: number | { x: number; y: number }
		blendMode?: BlendModes
		zIndex?: number

		// Playback
		animation?: string
		loop?: boolean
		paused?: boolean
		timeScale?: number
		reverse?: boolean
		/** 0–1 position within the current animation. */
		animationProgress?: number
		/** Cross-fade seconds. `0` cuts instantly. */
		mixTime?: number
		mixTimeRules?: readonly MixTimeRule[]
		/**
		 * Pause between loop iterations, in seconds.
		 *
		 * Only honoured where `pixi-svelte`'s `SpineTrack` supports it; older vendored copies
		 * silently lack the prop. Passing it there is a no-op, so use `SpineTrack` directly if you
		 * need loop delay on a base that hasn't been synced yet.
		 */
		loopDelay?: number
		/**
		 * Snap the track back to frame 0 whenever `timeScale` drops to 0, so a frozen spine always
		 * shows its start pose. Needs a `pixi-svelte` whose `SpineTrack` declares the prop.
		 */
		resetToFrameZeroWhenFrozen?: boolean
		/** Bump to replay the current animation. */
		resetCounter?: number
		/** Bump to re-trigger `animation` even when the name is unchanged. */
		restartKey?: number | string
		/** Track-0 listener. Composed with the override listener when `overrides` is set. */
		listener?: SpineTrackListener | null

		// Appearance
		skin?: string | readonly string[]
		renderMode?: SpineRenderMode
		textureWireframeMode?: boolean
		forceHideAttachment?: readonly string[] | null
		forceHideAttachmentExact?: readonly string[] | null
		attachmentMixRules?: readonly AttachmentMixRule[]

		/** Per-instance debug cell reported to `pixi-svelte`'s spine debug overlay. */
		debugCell?: SpineDebugCell

		/** Draw this spine's bounding frame — usable in a real game build, not just the viewer. */
		debugBounds?: SpineBoundsOverlayMode | false
		/** Animation sampled for the max-bounds frame. Defaults to what's playing. */
		debugBoundsAnimation?: string

		/** Imperative animation overrides. Requires `control`. */
		overrides?: SpineOverrideController
		/** Key this instance answers to within `overrides`. */
		control?: string

		onSpineLoaded?: (detail: SpineLoadedDetail) => void
		onLoadError?: (error: unknown) => void
		children?: Snippet<[SpineNodeChildArgs]>
	}

	import type { Snippet } from 'svelte'
	import type { SpineOverrideController } from '../core/override/spineOverrideController'
	import type { SpineBoundsOverlayMode } from '../dev/SpineBoundsOverlay.svelte'
	import type { AttachmentMixRule } from '../core/playback/attachmentMixRules'
	import type { MixTimeRule } from '../core/playback/spinePlaybackCore'
	import type { SpineRenderMode } from '../core/visibility/spineRenderModes'
	import type { AnySkeletonData, AnySpine } from '../core/runtime/spineRuntime'
	import type { SpineLoadedDetail, SpineLoaderApi, SpineTrackListener } from '../types'
	import type { BlendModes } from 'pixi-svelte'
	import type { SpineDebugCell } from '../provider/context'
</script>

<script lang="ts">
	import { getContextApp } from 'pixi-svelte'
	import SpineProvider from '../provider/SpineProvider.svelte'
	import SpineTrack from '../provider/SpineTrack.svelte'

	import SpineAttachmentMix from './SpineAttachmentMix.svelte'
	import SpineAttachmentVisibility from './SpineAttachmentVisibility.svelte'
	import SpineMounted from './SpineMounted.svelte'
	import SpineOverrideBind from './SpineOverrideBind.svelte'
	import SpinePlaybackExtras from './SpinePlaybackExtras.svelte'
	import SpineRenderModeApply from './SpineRenderModeApply.svelte'
	import SpineSkin from './SpineSkin.svelte'
	import SpineBoundsOverlay from '../dev/SpineBoundsOverlay.svelte'
	import { spineSvelteConfig } from '../configure'
	import { useSpineOverrideRevision } from '../state/useSpineOverride.svelte'

	const props: Props = $props()
	const context = getContextApp()

	let skeletonData = $state<AnySkeletonData | undefined>(props.spineData)

	$effect(() => {
		if (props.spineData) {
			skeletonData = props.spineData
			return
		}

		const loader = props.loader
		const key = props.key
		if (!loader) return

		let cancelled = false

		void (async () => {
			try {
				await loader.loadSpine(key)
				if (cancelled) return

				// Push textures to the GPU before the first frame; Pixi otherwise uploads lazily
				// and the skeleton's first rendered frame can come out blank.
				const sources = loader.getTextureSourcesForPreload?.(key)
				const prepare = context.stateApp.pixiApplication?.renderer?.prepare
				if (sources?.length && prepare) await prepare.upload(sources)
				if (cancelled) return

				skeletonData = loader.getSkeletonData?.(key)
			} catch (error) {
				if (cancelled) return
				spineSvelteConfig().warn(`[spine-svelte] failed to load "${key}"`, error)
				props.onLoadError?.(error)
			}
		})()

		return () => {
			cancelled = true
		}
	})

	const hideprefixes = $derived(props.forceHideAttachment ?? null)

	/**
	 * When neither `spineData` nor `loader` is given, `SpineProvider` resolves `key` from the
	 * app's `loadedAssets` — the path games use, where an external pipeline publishes skeletons.
	 */
	const resolvesItself = $derived(Boolean(props.spineData) || Boolean(props.loader))


	const overrideRevision = useSpineOverrideRevision(props.overrides, props.control)

	const playback = $derived.by(() => {
		// Read the revision so this re-derives whenever an override is set or cleared.
		void overrideRevision.revision

		const base = {
			animationName: props.animation,
			skinName: Array.isArray(props.skin) ? undefined : (props.skin as string | undefined),
			playbackLoop: props.loop,
			playbackLoopDelay: props.loopDelay,
		}

		if (!props.overrides || !props.control) {
			return {
				animationName: base.animationName,
				animation2Name: undefined as string | undefined,
				skinName: base.skinName,
				playbackLoop: props.loop ?? false,
				playbackLoop2: false,
				playbackLoopDelay: props.loopDelay ?? 0,
				resetCounter: props.resetCounter,
			}
		}

		const merged = props.overrides.getPlayback(props.control, base)
		return { ...merged, resetCounter: merged.resetCounter ?? props.resetCounter }
	})

	/**
	 * Spread rather than named, because older vendored `pixi-svelte` copies don't declare
	 * `loopDelay` on `SpineTrack` and naming it there is a type error.
	 */
	const loopDelayProp = $derived(
		playback.playbackLoopDelay ? { loopDelay: playback.playbackLoopDelay } : {},
	)

	// Spread for the same reason as `loopDelayProp`: only newer `pixi-svelte` copies declare it.
	const frozenResetProp = $derived(
		props.resetToFrameZeroWhenFrozen ? { resetToFrameZeroWhenFrozen: true } : {},
	)

	const effectiveSkin = $derived(
		Array.isArray(props.skin) ? props.skin : (playback.skinName ?? props.skin),
	)

	const trackListener = $derived.by(() => {
		void overrideRevision.revision
		const controller = props.overrides
		const control = props.control
		if (!controller || !control) return props.listener

		const entry = controller.overrides[control]
		if (!entry) return props.listener

		return {
			complete: (trackEntry: Parameters<NonNullable<SpineTrackListener['complete']>>[0]) => {
				props.listener?.complete?.(trackEntry)
				// A clip that is mixing out was interrupted — completing on it would resolve the
				// override that just replaced it.
				if (trackEntry.mixingTo) return
				controller.handleTrackComplete(control, trackEntry.trackIndex)
			},
			event: (trackEntry: Parameters<NonNullable<SpineTrackListener['event']>>[0], event: Parameters<NonNullable<SpineTrackListener['event']>>[1]) => {
				props.listener?.event?.(trackEntry, event)
				entry.override.onAnimationEvent?.({ name: event.data.name })
			},
		}
	})

	// Drop track 1 when a layered override goes away, or its last pose would stick.
	$effect(() => {
		void overrideRevision.revision
		if (playback.animation2Name) return
		const spine = props.control ? props.overrides?.spineRefs[props.control] : null
		if (spine?.state?.tracks[1]) spine.state.clearTrack(1)
	})
</script>

{#if skeletonData || !resolvesItself}
	<SpineProvider
		key={props.key}
		spineDataOverride={skeletonData}
		x={props.x}
		y={props.y}
		scale={props.scale}
		anchor={props.anchor}
		blendMode={props.blendMode}
		zIndex={props.zIndex}
		debugCell={props.debugCell}
	>
		{#snippet children({ spine })}
			<SpineMounted {spine} assetKey={props.key} onMounted={props.onSpineLoaded} />

			{#if props.overrides && props.control}
				<SpineOverrideBind controller={props.overrides} control={props.control} {spine} />
			{/if}

			{#if effectiveSkin !== undefined}
				<SpineSkin {spine} skinName={effectiveSkin} resolve />
			{/if}

			<SpineTrack
				{spine}
				{...loopDelayProp}
				trackIndex={0}
				animationName={playback.animationName}
				loop={playback.playbackLoop}
				mixDuration={props.mixTime}
				resetCounter={playback.resetCounter}
				restartKey={props.restartKey}
				listener={trackListener}
				{...frozenResetProp}
			/>

			{#if playback.animation2Name}
				<SpineTrack
					{spine}
					trackIndex={1}
					animationName={playback.animation2Name}
					loop={playback.playbackLoop2}
					mixDuration={props.mixTime}
					listener={trackListener}
				/>
			{/if}

			<SpinePlaybackExtras
				{spine}
				paused={props.paused}
				timeScale={props.timeScale}
				animationProgress={props.animationProgress}
				reverse={props.reverse}
				mixTime={props.mixTime}
				mixTimeRules={props.mixTimeRules}
			/>

			{#if props.attachmentMixRules?.length}
				<SpineAttachmentMix {spine} rules={props.attachmentMixRules} />
			{/if}

			{#if hideprefixes || props.forceHideAttachmentExact || props.textureWireframeMode}
				<SpineAttachmentVisibility
					{spine}
					prefixes={hideprefixes}
					exact={props.forceHideAttachmentExact}
					wireframe={props.textureWireframeMode}
				/>
			{/if}

			{#if props.renderMode && props.renderMode !== 'normal'}
				<SpineRenderModeApply {spine} mode={props.renderMode} />
			{/if}

			{#if props.debugBounds}
				<SpineBoundsOverlay
					{spine}
					mode={props.debugBounds}
					animationName={props.debugBoundsAnimation}
					skinName={typeof props.skin === 'string' ? props.skin : undefined}
				/>
			{/if}

			{@render props.children?.({ spine })}
		{/snippet}
	</SpineProvider>
{/if}
