<script lang="ts">
	import type { Snippet } from 'svelte';
	import * as SPINE_PIXI from '@esotericsoftware/spine-pixi-v8';

	import {
		setContextSpine,
		setContextSpineAssetKey,
		setContextSpineDebugCell,
		type SpineDebugCell,
	} from '../context.svelte';

	type Props = {
		spine: SPINE_PIXI.Spine;
		assetKey?: string;
		debugCell?: SpineDebugCell;
		children: Snippet;
	};

	const { spine, assetKey, debugCell, children }: Props = $props();

	// Re-bind context on a dedicated child so snippet-rendered descendants see this spine.
	if (assetKey) setContextSpineAssetKey(assetKey);
	if (debugCell) setContextSpineDebugCell(debugCell);
	setContextSpine(spine);
</script>

{@render children()}
