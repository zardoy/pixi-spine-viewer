<script lang="ts" module>
	export type Props = {
		/** Camera scale — line width is divided by it so the axes stay 1px on screen. */
		scale?: number
	}
</script>

<script lang="ts">
	import { Graphics } from 'pixi-svelte'

	import { drawOriginAxes } from './originAxes'

	const props: Props = $props()

	const lineWidth = $derived(1 / Math.max(props.scale ?? 1, 1e-4))
</script>

<Graphics zIndex={-10_000} draw={(graphics) => drawOriginAxes(graphics, { lineWidth })} />
