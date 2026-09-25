<script lang="ts" module>
	export type Props = {
		mode?: SpineRenderMode
		/** Extra filters kept alongside the render-mode filter. */
		filters?: Filter[]
		/** When set, used instead of the nearest spine context. */
		spine?: AnySpine
	}

	import type { Filter } from 'pixi.js'
	import type { SpineRenderMode } from '../core/visibility/spineRenderModes'
	import type { AnySpine } from '../core/runtime/spineRuntime'
</script>

<script lang="ts">
	import { getContextSpine } from 'pixi-svelte'

	import { getRenderModeFilter } from '../core/visibility/spineRenderModes'

	const props: Props = $props()
	const spine = props.spine ?? getContextSpine()

	$effect(() => {
		const modeFilter = getRenderModeFilter(props.mode)
		const extra = props.filters ?? []
		const merged = modeFilter ? [...extra, modeFilter] : extra

		spine.filters = merged.length ? merged : []
		return () => {
			spine.filters = []
		}
	})
</script>
