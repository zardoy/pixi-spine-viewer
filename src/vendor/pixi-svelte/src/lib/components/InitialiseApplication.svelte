<script lang="ts">
	/// <reference path="vite/client" />
	import * as PIXI from 'pixi.js'
	import { onMount, onDestroy, tick, type Snippet } from 'svelte'
	import { devicePixelRatio } from 'svelte/reactivity/window'

	import { cappedDevicePixelRatio, awaitAllDocumentFontsLoaded } from '../utils.svelte'
	import { getContextApp } from '../context.svelte'

	type Props = {
		children: Snippet
		/** When set, Pixi resizes to this element instead of the window (docked dev panels). */
		resizeTo?: HTMLElement | null
		/**
		 * `PIXI.Assets` is global, so a host with several `App` roots on one page must opt out or
		 * each new root wipes its siblings' cache.
		 */
		resetAssets?: boolean
		/** Fixed canvas size. When set, the app does not track `resizeTo` at all. */
		size?: { width: number; height: number }
		/** Defaults to opaque black — the caller recolours once its loading screen is gone. */
		backgroundColor?: string
		backgroundAlpha?: number
		/** Defaults to Pixi's own default (off). Tooling that draws vector overlays wants it on. */
		antialias?: boolean
		/** Defaults to the device pixel ratio, capped. */
		resolution?: number
	}

	const props: Props = $props()
	const context = getContextApp()

	let wrap = $state<HTMLDivElement | undefined>(undefined)
	let initialised = $state(false)
	/** Pixi `ResizePlugin` only listens to `window` `resize` — observe element `resizeTo` ourselves. */
	let resizeToObserver: ResizeObserver | null = null

	const initialiseApplication = async () => {
		for (let attempt = 0; attempt < 20 && !wrap; attempt += 1) {
			await tick()
		}
		if (!wrap) {
			throw new Error('InitialiseApplication: wrapper element not bound after tick()')
		}

		// Vite HMR remounts this component often; resetting the global cache wipes slots-engine
		// assets while GameInner may still be on screen → bridge reload + stale GPU refs.
		const hot = import.meta.hot
		if (props.resetAssets ?? true) {
			if (!hot) {
				PIXI.Assets.reset()
			} else {
				const hotData = hot.data as { pixiAssetsResetOnce?: boolean }
				if (!hotData.pixiAssetsResetOnce) {
					PIXI.Assets.reset()
					hotData.pixiAssetsResetOnce = true
				}
			}
		}

		await awaitAllDocumentFontsLoaded()

		const resizeTarget = props.resizeTo ?? window
		if (props.resizeTo && !props.size) {
			for (
				let attempt = 0;
				attempt < 40 && props.resizeTo.clientWidth < 1;
				attempt += 1
			) {
				await tick()
			}
		}

		const app = new PIXI.Application<PIXI.Renderer<HTMLCanvasElement>>()
		await app.init({
			autoDensity: true,
			// Black until the caller says loading is done — the app sets its own colour then
			// (LOTC: `Stage.svelte`). A coloured canvas would show through the loading screen.
			backgroundColor: props.backgroundColor ?? '#000000',
			backgroundAlpha: props.backgroundAlpha ?? 1,
			hello: true,
			multiView: false,
			antialias: props.antialias ?? false,
			clearBeforeRender: true,
			// Dev: keep GL buffer for canvas.toDataURL (B screenshots — see devCanvasScreenshot).
			// preserveDrawingBuffer: import.meta.env.DEV_MODE,
			// Default Pixi order is WebGL → WebGPU → canvas. Forcing WebGPU first breaks
			// canvas-backed `FillGradient` textures in some builds (solid fill instead of ramp).
			resolution: props.resolution ?? cappedDevicePixelRatio(devicePixelRatio.current),
			...(props.size
				? { width: props.size.width, height: props.size.height }
				: { resizeTo: resizeTarget }),
		})

		if (!wrap) {
			app.destroy()
			throw new Error('InitialiseApplication: unmounted before canvas could attach')
		}
		context.stateApp.pixiApplication = app
		wrap.appendChild(app.canvas)

		if (props.resizeTo instanceof HTMLElement && !props.size) {
			const queueResize = () => {
				app.queueResize?.() ?? app.resize?.()
			}
			resizeToObserver = new ResizeObserver(queueResize)
			resizeToObserver.observe(props.resizeTo)
		}

		if (import.meta.env.DEV_MODE && typeof globalThis !== 'undefined') {
			const g = globalThis as typeof globalThis & {
				PIXI?: typeof PIXI
				__PIXI_APP__?: PIXI.Application
			}
			g.PIXI = PIXI
			g.__PIXI_APP__ = app
		}

		// to prevent that you can't scroll the page with touch on the canvas. https://github.com/pixijs/pixijs/issues/4824
		app.renderer.events.autoPreventDefault = false
		app.renderer.canvas.style.touchAction = 'auto'
	}

	onMount(async () => {
		try {
			if (!initialised) await initialiseApplication()
			initialised = true
		} catch (error) {
			console.error(error)
		}
	})

	onDestroy(() => {
		resizeToObserver?.disconnect()
		resizeToObserver = null

		const app = context.stateApp.pixiApplication
		if (app) {
			if (import.meta.env.DEV_MODE && typeof globalThis !== 'undefined') {
				const g = globalThis as typeof globalThis & { __PIXI_APP__?: PIXI.Application }
				if (g.__PIXI_APP__ === app) {
					g.__PIXI_APP__ = undefined
				}
			}
			app.destroy()
		}
	})
</script>

<div class="pixi-app-root" bind:this={wrap}>
	{#if initialised}
		{@render props.children()}
	{/if}
</div>

<style>
	.pixi-app-root {
		display: block;
		width: 100%;
		height: 100%;
		min-width: 0;
		min-height: 0;
		overflow: hidden;
		position: relative;
	}

	.pixi-app-root :global(canvas) {
		display: block;
		max-width: 100%;
	}
</style>
