<script lang="ts" module>
	import type { ViewerStageState } from '../state/viewerStageState.svelte'

	export type Props = { stage: ViewerStageState }
</script>

<script lang="ts">
	import { Container, Graphics, getContextApp, setSpineAtlasMipmapsEnabled } from 'pixi-svelte'
	import { RendererType, type Container as PixiContainer, type WebGLRenderer } from 'pixi.js'
	import { onDestroy, untrack } from 'svelte'
	import { toast } from 'sonner'
	import { ref } from 'valtio'
	import {
		EMPTY_ANIMATION_NAME,
		SpineDebugRenderer,
		consumePixiWebGLDrawCalls,
		getPixiWebGLGpuTimeMaxMs,
		immediateUpdate,
		installPixiWebGLRendererStats,
		isCheckerBackground,
		isPixiWebGLGpuTimerSupported,
		tickPixiWebGLGpuTimeAggregation,
		type AnySpine,
		type CrossfadeOptions,
		type SpineLoadedDetail,
	} from 'spine-svelte'
	import { SpineNode } from 'spine-svelte/components'
	import { CheckerboardBackground, OriginAxes, panZoom } from 'spine-svelte/dev'
	import { onTick, TICK_PRIORITY } from 'spine-svelte/state'

	import type { FileSpineLoader } from '../../lib/FileSpineLoader'
	import { spineViewerStore } from '../../store/spineViewerStore'
	import { FpsMonitor } from './fpsMonitor'
	import { LoadingToast } from './loadingToast'
	import PixiHandle from './PixiHandle.svelte'
	import { publishSpineLists } from './publishSpineLists'
	import {
		AttachmentTestMarker,
		BoundsOverlay,
		SizeBonesOverlay,
		SpawnBoundsOverlay,
		readAttachmentTestOptions,
	} from './screenOverlays'
	import {
		SECOND_SPINE_KEY,
		SPINE_KEY,
		loadPrimarySpine,
		loadSecondSpine,
		primarySpineKey,
	} from './spineFilesLoader'
	import { startSyncedDirPoll } from './syncedDirPoll'
	import {
		completeSpineLoadedSetup,
		onSelectedAnimationChanged,
		refitForAutoViewportSettings,
		tickTimelineAndViewport,
	} from './viewportCamera'

	const { stage }: Props = $props()
	const context = getContextApp()
	const store = spineViewerStore

	const app = $derived(context.stateApp.pixiApplication)
	const ui = $derived(stage.ui)

	const loadingToast = new LoadingToast()
	const fps = new FpsMonitor()

	/** Unscaled screen-space root: debug overlays and the guide frame live here. */
	let root = $state.raw<PixiContainer>()
	/** Zoomed/panned world: checkerboard, origin axes and the spines live here. */
	let world = $state.raw<PixiContainer>()

	let loaded = $state.raw<{ loader: FileSpineLoader; key: string } | null>(null)
	let secondLoader = $state.raw<FileSpineLoader | null>(null)
	let spine = $state.raw<AnySpine | null>(null)

	/** World scale, mirrored so the origin axes can keep a 1px line at any zoom. */
	let worldScale = $state(1)

	let wasSpineLoaded = false
	let userIsPanning = false

	let boundsOverlay = $state.raw<BoundsOverlay>()
	let spawnOverlay = $state.raw<SpawnBoundsOverlay>()
	let sizeBonesOverlay = $state.raw<SizeBonesOverlay>()
	const attachmentTest = new AttachmentTestMarker()

	const isDestroyed = (s: AnySpine | null | undefined) =>
		!s || (s as { destroyed?: boolean }).destroyed === true

	function screenSize() {
		try {
			const screen = app?.renderer ? app.screen : undefined
			return screen ? { width: screen.width, height: screen.height } : null
		} catch {
			return null
		}
	}

	// ── Store hand-off ────────────────────────────────────────────────────────────────────
	// Re-run on `files` too: resetSpineViewerState() nulls these when a new file replaces the old.
	$effect(() => {
		void stage.files
		if (!app || !root) return
		store.refs.container = ref(root)
		store.refs.app = ref(app)
	})

	onDestroy(() => {
		loadingToast.clear()
		attachmentTest.destroy()
		store.refs.container = null
		store.refs.app = null
		store.refs.spine = null
		store.refs.fileSpineLoader = null
		store.refs.secondFileSpineLoader = null
	})

	// ── Loading ───────────────────────────────────────────────────────────────────────────
	$effect(() => {
		const files = stage.files
		const selectedSkeleton = stage.ui.selectedSkeleton

		untrack(() => {
			loaded = null
			spine = null
			wasSpineLoaded = false
			store.refs.spine = null
			store.ui.loadError = null
			if (!files) store.refs.fileSpineLoader = null
		})

		if (!files) {
			loadingToast.clear()
			return
		}

		let cancelled = false
		loadingToast.start(`Loading ${files.jsonFile.name}...`)

		loadPrimarySpine(files, selectedSkeleton)
			.then((loader) => {
				if (!cancelled) loaded = { loader, key: primarySpineKey(files, selectedSkeleton) }
			})
			.catch((error: unknown) => {
				if (cancelled) return
				const message = error instanceof Error ? error.message : 'Unknown error'
				console.error('[Viewer] Error initializing spine loader:', error)
				store.ui.loadError = message
				store.ui.animations = []
				store.ui.skins = []
				store.ui.selectedAnimation = ''
				loadingToast.finish(`Failed to load spine: ${message}`, 'error')
			})

		return () => {
			cancelled = true
			loadingToast.clear()
		}
	})

	$effect(() => {
		const files = stage.secondFiles
		untrack(() => {
			secondLoader = null
			if (!files) store.refs.secondFileSpineLoader = null
		})
		if (!files) return

		let cancelled = false
		loadSecondSpine(files)
			.then((loader) => {
				if (!cancelled) secondLoader = loader
			})
			.catch((error: unknown) => {
				if (cancelled) return
				console.error('[Viewer] Error initializing second spine loader:', error)
				toast.error('Failed to load second Spine files: ' + (error as Error).message)
			})
		return () => {
			cancelled = true
		}
	})

	$effect(() => {
		void stage.syncedDir
		return startSyncedDirPoll()
	})

	function handleSpineLoaded({ spine: instance }: SpineLoadedDetail) {
		spine = instance
		store.refs.spine = ref(instance)
		;(globalThis as { spine?: AnySpine }).spine = instance

		if (wasSpineLoaded) return

		const screen = screenSize()
		if (!screen) {
			loadingToast.finish('Spine loaded but renderer is not ready', 'warning')
			return
		}
		wasSpineLoaded = true
		if (!completeSpineLoadedSetup(instance, screen, loadingToast)) wasSpineLoaded = false
	}

	function handleSecondSpineLoaded({ spine: instance }: SpineLoadedDetail) {
		store.ui.secondAnimations = instance.skeleton.data.animations.map((animation) => animation.name)
	}

	// Fires on every loop pass too, hence the loop/duration checks.
	const trackListener = {
		complete: () => {
			const track = store.refs.spine?.state?.tracks?.[0]
			// The empty pseudo-animation "completes" instantly; that must not pause playback.
			if (track?.animation?.name === EMPTY_ANIMATION_NAME) return
			const duration = track?.animation?.duration ?? store.ui.timelineDuration

			if (store.ui.loop) {
				store.ui.timeline = 0
				return
			}

			const trackTime = track?.trackTime ?? store.ui.timeline
			if (duration > 0 && trackTime < duration - 1 / 30) return

			store.ui.isPlaying = false
			store.ui.timeline = store.ui.timelineDuration
		},
	}

	// ── Per-frame ─────────────────────────────────────────────────────────────────────────
	$effect(() => {
		if (!app || app.renderer.type !== RendererType.WEBGL) return
		const uninstall = installPixiWebGLRendererStats(app.renderer as WebGLRenderer)
		store.ui.gpuTimerSupported = isPixiWebGLGpuTimerSupported()
		if (!store.ui.gpuTimerSupported) store.ui.gpuTimeMs = null
		return uninstall
	})

	onTick(() => {
		store.ui.drawCalls = consumePixiWebGLDrawCalls()
		if (!store.ui.gpuTimerSupported) return
		tickPixiWebGLGpuTimeAggregation()
		const gpuMax = getPixiWebGLGpuTimeMaxMs()
		if (gpuMax !== null) store.ui.gpuTimeMs = gpuMax
	}, TICK_PRIORITY.STATS)

	onTick(() => {
		const screen = screenSize()
		if (screen) tickTimelineAndViewport(screen, userIsPanning)
	})

	onTick(() => {
		if (app) fps.tick(app.ticker)
	})

	onTick(() => {
		if (!world || userIsPanning) return
		const { scale, manualPosition } = store.ui

		if (world.x !== manualPosition.x || world.y !== manualPosition.y) {
			world.position.set(manualPosition.x, manualPosition.y)
		}
		if (world.scale.x !== scale) world.scale.set(scale)
		syncAxesScale(world.scale.x)
	})

	onTick(() => {
		boundsOverlay?.tick(store.refs.spine)
		spawnOverlay?.tick()
		sizeBonesOverlay?.tick(store.refs.spine)
	})

	onTick(() => {
		if (!store.ui.attachmentTestPanelVisible) return
		attachmentTest.tick(store.refs.spine, readAttachmentTestOptions(store.ui))
	})

	function syncAxesScale(scale: number) {
		const safe = Math.max(scale, 0.01)
		if (Math.abs(worldScale - safe) >= 1e-4) worldScale = safe
	}

	// ── Pan & zoom ────────────────────────────────────────────────────────────────────────
	$effect(() => {
		if (!app || !world) return
		const canvas = app.canvas
		let gestureStartScale = world.scale.x

		const action = panZoom(canvas, {
			target: () => world,
			onInteractingChange: (interacting) => {
				userIsPanning = interacting
				if (interacting && world) gestureStartScale = world.scale.x
			},
			onChange: ({ scale }) => {
				// A drag moves the camera; only a wheel gesture changes zoom, and that is what pins it.
				if (scale !== gestureStartScale) store.ui.userScaleOverride = true
				syncAxesScale(scale)
			},
			onCommit: ({ x, y, scale }) => {
				store.ui.manualPosition = { x, y }
				store.ui.spinePosition = { x, y }
				store.ui.scale = scale
				store.ui.userPositionOverride = true
			},
		})

		return () => {
			action.destroy()
			canvas.style.cursor = ''
			userIsPanning = false
		}
	})

	// ── Camera & animation ────────────────────────────────────────────────────────────────
	$effect(() => {
		void stage.ui.selectedAnimation
		void stage.ui.autoViewportMode
		untrack(() => {
			const current = store.refs.spine
			const screen = screenSize()
			if (current && screen && !isDestroyed(current)) onSelectedAnimationChanged(current, screen)
		})
	})

	$effect(() => {
		void stage.ui.autoViewportMode
		void stage.ui.autoViewportAnimation
		void stage.ui.animations
		untrack(() => {
			const current = store.refs.spine
			const screen = screenSize()
			if (current && screen && !isDestroyed(current)) refitForAutoViewportSettings(current, screen)
		})
	})

	// With instant switches there is no mix to play through, so show the new first frame at once —
	// otherwise a paused spine would keep drawing the old pose.
	$effect(() => {
		void stage.ui.selectedAnimation
		void stage.ui.resetCounter
		untrack(() => {
			const current = spine
			const instant = !stage.ui.mixTimeEnabled || stage.ui.mixTime === 0
			if (current && !isDestroyed(current) && instant) immediateUpdate(current, true)
		})
	})

	// Turning loop off mid-clip: wrap the elapsed time into the clip, so it plays on from where it
	// is instead of snapping to the end because `trackTime` has run past the duration.
	let previousLoop = untrack(() => stage.ui.loop)
	$effect(() => {
		const loop = stage.ui.loop
		if (previousLoop && !loop) {
			untrack(() => {
				const track = spine && !isDestroyed(spine) ? spine.state.tracks[0] : null
				const duration = track?.animation?.duration ?? 0
				if (track && duration > 0) {
					let time = track.trackTime % duration
					// Exactly on the loop boundary: stay on the last frame rather than rewinding.
					if (time < 1e-4 && track.trackTime > 0) time = duration
					track.trackTime = time
				}
			})
		}
		previousLoop = loop
	})

	// Pressing play on a finished one-shot restarts it, as media players do.
	let previousPlaying = untrack(() => stage.ui.isPlaying)
	$effect(() => {
		const playing = stage.ui.isPlaying
		if (playing && !previousPlaying) {
			untrack(() => {
				const track = spine && !isDestroyed(spine) ? spine.state.tracks[0] : null
				if (track && !track.loop && track.getAnimationTime() === track.animationEnd) {
					store.ui.resetCounter += 1
				}
			})
		}
		previousPlaying = playing
	})

	// ── Appearance ────────────────────────────────────────────────────────────────────────
	$effect(() => {
		const background = app?.renderer?.background
		if (!background) return
		const color = stage.ui.backgroundColor
		if (isCheckerBackground(color)) {
			background.alpha = 0
			return
		}
		background.alpha = 1
		background.color = parseInt(color.replace('#', ''), 16)
	})

	// QA toggle for texture minification. The atlas-source lookup (registered once in main.tsx)
	// reads the loader refs, so this only flips the policy once the textures exist.
	$effect(() => {
		if (!loaded) return
		void stage.ui.mountCount
		setSpineAtlasMipmapsEnabled(SPINE_KEY, stage.ui.mipmapsEnabled)
	})

	$effect(() => {
		if (!secondLoader) return
		setSpineAtlasMipmapsEnabled(SECOND_SPINE_KEY, stage.ui.mipmapsEnabled)
	})

	$effect(() => {
		const current = spine
		void stage.ui.mountCount
		const blendMode = stage.ui.blendMode
		if (!current || isDestroyed(current)) return

		// Spine draws each slot with slot.data.blendMode (0 normal, 1 additive, 2 multiply, 3 screen).
		const modes = { normal: 0, add: 1, multiply: 2, screen: 3 } as const
		const slots = current.skeleton.data.slots as unknown as { blendMode: number; __origBlend?: number }[]
		for (const slot of slots) {
			slot.__origBlend ??= slot.blendMode
			slot.blendMode = blendMode === 'original' ? slot.__origBlend : modes[blendMode]
		}
	})

	$effect(() => {
		const current = spine
		const debugBones = stage.ui.debugBones
		if (!current || isDestroyed(current)) return

		if (debugBones) {
			if (!(current.debug instanceof SpineDebugRenderer)) current.debug = new SpineDebugRenderer()
		} else if (current.debug instanceof SpineDebugRenderer) {
			current.debug = undefined
		}
	})

	// ── Debug overlays ────────────────────────────────────────────────────────────────────
	$effect(() => {
		if (!root) return
		const bounds = new BoundsOverlay(root)
		const spawn = new SpawnBoundsOverlay(root)
		boundsOverlay = bounds
		spawnOverlay = spawn
		const sizeBones = new SizeBonesOverlay(root)
		sizeBonesOverlay = sizeBones
		return () => {
			sizeBones.destroy()
			sizeBonesOverlay = undefined
			bounds.destroy()
			spawn.destroy()
			boundsOverlay = undefined
			spawnOverlay = undefined
		}
	})

	$effect(() => {
		boundsOverlay?.setModes(stage.ui.debugBoundsLive, stage.ui.debugBoundsMax)
	})

	$effect(() => {
		spawnOverlay?.setEnabled(stage.ui.showSpawnBounds && !!stage.ui.spawnBounds)
	})

	// The attachment test panel's marker. Three steps, in this order: make/drop it, point it at the
	// chosen slot or bone, restyle it.
	$effect(() => {
		attachmentTest.setVisible(stage.ui.attachmentTestPanelVisible, spine)
	})

	$effect(() => {
		const current = spine
		if (!current || !stage.ui.attachmentTestPanelVisible) return
		return attachmentTest.attach(current, readAttachmentTestOptions(stage.ui))
	})

	$effect(() => {
		attachmentTest.setStyle(stage.ui.attachmentTestBoxBlue, stage.ui.attachmentTestBoxLarge)
	})

	// Feed the slot/bone/texture pickers.
	$effect(() => {
		const current = spine
		void stage.ui.selectedAnimation
		void stage.ui.selectedSkin
		publishSpineLists(current)
	})

	// ── Template values ───────────────────────────────────────────────────────────────────
	const isChecker = $derived(isCheckerBackground(ui.backgroundColor))

	const hiddenPaths = $derived(
		ui.hiddenAttachmentPaths.length > 0 ? [...ui.hiddenAttachmentPaths] : undefined,
	)

	const mixTime = $derived(ui.mixTimeEnabled ? ui.mixTime : 0)

	const crossfade = $derived<CrossfadeOptions | null>(
		ui.crossfadeMode === 'off'
			? null
			: { duration: ui.crossfadeDuration, mode: ui.crossfadeMode, trigger: ui.crossfadeTrigger },
	)

	// While paused the timeline scrubber owns the pose; while playing the clip does.
	const animationProgress = $derived(
		!ui.isPlaying && ui.timelineDuration > 0 ? ui.timeline / ui.timelineDuration : undefined,
	)
</script>

<Container>
	<PixiHandle onReady={(container) => (root = container)} />

	<!-- Camera. Pan/zoom mutate this directly; the store catches up when the gesture settles. -->
	<Container sortableChildren>
		<PixiHandle onReady={(container) => (world = container)} />

		{#if isChecker}
			<CheckerboardBackground />
		{/if}

		{#if ui.debugOriginAxes && loaded}
			<OriginAxes scale={worldScale} />
		{/if}

		{#if loaded}
			{#key ui.mountCount}
				<SpineNode
					key={loaded.key}
					loader={loaded.loader}
					animation={ui.selectedAnimation}
					loop={ui.loop}
					timeScale={ui.speed}
					paused={!ui.isPlaying}
					reverse={ui.isReversed}
					skin={ui.selectedSkin}
					{mixTime}
					{crossfade}
					resetCounter={ui.resetCounter}
					{animationProgress}
					forceHideAttachmentExact={hiddenPaths}
					listener={trackListener}
					onSpineLoaded={handleSpineLoaded}
				/>
			{/key}
		{/if}

		{#if secondLoader}
			<!-- Second spine, offset from the first and optionally translucent. -->
			<Container alpha={stage.secondSpineOpacity}>
				{#key ui.mountCount}
					<SpineNode
						key={SECOND_SPINE_KEY}
						loader={secondLoader}
						animation={ui.secondSelectedAnimation || ui.selectedAnimation}
						loop={ui.loop}
						timeScale={ui.speed}
						paused={!ui.isPlaying}
						reverse={ui.isReversed}
						skin={ui.selectedSkin}
						{mixTime}
						{crossfade}
						resetCounter={ui.resetCounter}
						x={stage.secondSpineOffset.x}
						y={stage.secondSpineOffset.y}
						scale={stage.secondSpineOffset.scale}
						listener={trackListener}
						onSpineLoaded={handleSecondSpineLoaded}
					/>
				{/key}
			</Container>
		{/if}
	</Container>

	<!-- Yellow guide frame: the camera's target framing, in screen space. -->
	{#if ui.guideBoundsEnabled}
		<Graphics
			draw={(graphics) => {
				const position = ui.manualGuidePosition
				graphics.rect(
					position.x,
					position.y,
					ui.manualGuideSize.width * ui.scale,
					ui.manualGuideSize.height * ui.scale,
				)
				graphics.stroke({ color: 0xffff00, width: 2 })
			}}
		/>
	{/if}
</Container>
