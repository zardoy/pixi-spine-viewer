<script lang="ts" module>
	import type { Snippet } from 'svelte';

	export type Props = { children: Snippet };
</script>

<script lang="ts">
	import * as PIXI from 'pixi.js';
	import { onDestroy } from 'svelte';

	import { getContextSpine, setContextSpineEventEmitter } from '../context.svelte';
	import { getFramePipeline, FRAME_PHASE } from '../spineFramePipeline';

	const props: Props = $props();
	const spine = getContextSpine();
	const spineEventEmitter = new PIXI.EventEmitter();

	spine.beforeUpdateWorldTransforms = () => spineEventEmitter.emit('beforeUpdateWorldTransforms');

	// Register instead of assigning: the `after` hook is shared with force-hide/mix-rule passes.
	const removeAfter = getFramePipeline(spine).add(
		() => spineEventEmitter.emit('afterUpdateWorldTransforms'),
		FRAME_PHASE.EMIT,
	);
	onDestroy(removeAfter);

	setContextSpineEventEmitter(spineEventEmitter);
</script>

{@render props.children()}
