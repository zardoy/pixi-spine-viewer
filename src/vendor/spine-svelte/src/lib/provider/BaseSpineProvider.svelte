<script lang="ts" module>
	import type { Snippet } from 'svelte';
	import * as SPINE_PIXI from '@esotericsoftware/spine-pixi-v8';

	import type { OverwriteCursor } from 'pixi-svelte';
	import type { SpineDebugCell } from './context';

	export type Props = OverwriteCursor<Omit<SPINE_PIXI.SpineOptions, 'children'>> & {
		spineData: SPINE_PIXI.SkeletonData;
		/** Packed `loadedAssets` / loader key — for SpineTrack debug and context isolation. */
		assetKey?: string;
		debugCell?: SpineDebugCell;
		children: Snippet<[{ spine: SPINE_PIXI.Spine; assetKey?: string }]>;
	};
</script>

<script lang="ts">
	import { onMount } from 'svelte';
	import { propsSyncEffect } from 'pixi-svelte';
	import { getContextParent } from 'pixi-svelte';
	import { notifySpineConstructed, notifySpineMounted } from './spineMountHooks';
	import SpineSubtree from './SpineSubtree.svelte';

	const props: Props = $props();
	const parentContext = getContextParent();
	const spineConstructT0 = performance.now();
	const spine = new SPINE_PIXI.Spine({ skeletonData: props.spineData });
	notifySpineConstructed(performance.now() - spineConstructT0);

	propsSyncEffect({ props, target: spine, ignore: ['children', 'assetKey', 'spineData'] });

	parentContext.addToParent(spine);

	onMount(() => {
		// A new Spine has never been updated: its track and skin are set by child effects but only
		// applied on the next ticker update. That update runs on `Ticker.shared`, which Pixi's app
		// ticker does not wait for, so a mount that lands before this frame's render is drawn once
		// in its un-posed state (blank for rigs that reveal attachments from animations). Apply
		// the pose now so the first render already shows it.
		if (!spine.destroyed) spine.update(0);
		return notifySpineMounted(spine);
	});
</script>

<SpineSubtree {spine} assetKey={props.assetKey} debugCell={props.debugCell}>
	{#snippet children()}
		{@render props.children({ spine, assetKey: props.assetKey })}
	{/snippet}
</SpineSubtree>
