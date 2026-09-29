<script lang="ts" module>
	export type Props = {
		spine: AnySpine
		assetKey?: string
		onMounted?: (detail: SpineLoadedDetail) => void
	}

	import type { AnySpine } from '../core/runtime/spineRuntime'
	import type { SpineLoadedDetail } from '../types'
</script>

<script lang="ts">
	import { onMount } from 'svelte'

	const props: Props = $props()

	// onMount, not render: the callback hands out a live instance and must fire exactly once.
	onMount(() => {
		props.onMounted?.({ spine: props.spine, assetKey: props.assetKey })
	})
</script>
