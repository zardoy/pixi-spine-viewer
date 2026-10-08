<script lang="ts">
	import { onMount, onDestroy, type Snippet } from 'svelte';

	import { getContextApp } from '../context.svelte';

	import InitialiseApplication from './InitialiseApplication.svelte';
	import InitialiseParent from './InitialiseParent.svelte';
	import AssetsLoader from './AssetsLoader.svelte';

	type Props = {
		children: Snippet;
		resizeTo?: HTMLElement | null;
		/** Opt out when several `App` roots share a page — see `InitialiseApplication`. */
		resetAssets?: boolean;
		/** Opt out when the host owns `stateApp` beyond this root's lifetime. */
		resetOnDestroy?: boolean;
		/** Fixed canvas size — see `InitialiseApplication`. */
		size?: { width: number; height: number };
		backgroundColor?: string;
		backgroundAlpha?: number;
		/** Forwarded to `PIXI.Application.init` — see `InitialiseApplication`. */
		antialias?: boolean;
		/** Overrides the capped device pixel ratio — pixel-exact exports want a fixed 1. */
		resolution?: number;
	};

	const props: Props = $props();
	const context = getContextApp();

	// Only clear on teardown — onMount reset duplicated HMR destroy+mount and forced a full slots reload.
	onDestroy(() => {
		if (props.resetOnDestroy ?? true) context.stateApp.reset();
	});
</script>

<InitialiseApplication
	resizeTo={props.resizeTo}
	resetAssets={props.resetAssets}
	size={props.size}
	backgroundColor={props.backgroundColor}
	backgroundAlpha={props.backgroundAlpha}
	antialias={props.antialias}
	resolution={props.resolution}
>
	<InitialiseParent>
		<AssetsLoader>
			{@render props.children()}
		</AssetsLoader>
	</InitialiseParent>
</InitialiseApplication>
