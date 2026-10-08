<script lang="ts" module>
	import type { Container } from 'pixi.js'

	export type Props = {
		/** Called once, with the pixi container this component sits inside. */
		onReady: (container: Container) => void
	}
</script>

<script lang="ts">
	import { getContextParent } from 'pixi-svelte'
	import { onMount } from 'svelte'

	const { onReady }: Props = $props()
	const parent = getContextParent()

	// `pixi-svelte`'s Container doesn't expose its instance; the nearest parent context is it.
	onMount(() => onReady(parent.parent))
</script>
