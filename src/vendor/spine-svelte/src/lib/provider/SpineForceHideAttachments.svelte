<script lang="ts" module>
	import type { Snippet } from 'svelte';

	export type Props = {
		/** Hide attachments whose path/name starts with any of these prefixes (`setAttachment(null)`). */
		prefixes: string | readonly string[];
	};
</script>

<script lang="ts">
	import { getContextSpine, getContextSpineEventEmitter } from './context';
	import { applySpineForceHideAttachmentPrefixes } from './spineForceHideAttachments';

	const props: Props = $props();

	const spine = getContextSpine();
	const emitter = getContextSpineEventEmitter();

	$effect(() => {
		const prefixes = Array.isArray(props.prefixes) ? props.prefixes : [props.prefixes];
		const hide = () => applySpineForceHideAttachmentPrefixes(spine, prefixes);

		if (!emitter) {
			hide();
			return;
		}

		emitter.on('afterUpdateWorldTransforms', hide);
		return () => emitter.off('afterUpdateWorldTransforms', hide);
	});
</script>
