<script lang="ts" module>
	export type Props = {
		cellSize?: number
		extent?: number
	}
</script>

<script lang="ts">
	import { Graphics } from 'pixi-svelte'

	import { drawCheckerboardGrid } from './checkerboardBackground'

	const props: Props = $props()
</script>

<!--
	World-space, so it pans and zooms with the content rather than sitting behind a static
	viewport. zIndex keeps it under everything else in the same container.
-->
<Graphics
	zIndex={-20_000}
	draw={(graphics) => drawCheckerboardGrid(graphics, { cellSize: props.cellSize, extent: props.extent })}
/>
