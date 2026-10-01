<script lang="ts" module>
	export type Props = {
		/** Hide attachments whose path/name starts with any of these. */
		prefixes?: readonly string[] | null
		/** Hide attachments whose path/name matches exactly. */
		exact?: readonly string[] | null
		/** Hide every drawable attachment, leaving only debug overlays. */
		wireframe?: boolean
		/** When set, used instead of the nearest spine context. */
		spine?: AnySpine
	}

	import type { AnySpine } from '../core/runtime/spineRuntime'
</script>

<script lang="ts">
	import { getContextSpine, getFramePipeline, FRAME_PHASE } from '../provider'

	import { applyForceHideAttachments } from '../core/visibility/forceHideAttachments'

	const props: Props = $props()
	const spine = props.spine ?? getContextSpine()

	$effect(() => {
		// Read reactively so the task picks up prop changes on the next frame.
		const options = {
			prefixes: props.prefixes,
			exact: props.exact,
			wireframe: props.wireframe,
		}
		return getFramePipeline(spine).add(
			(target) => applyForceHideAttachments(target, options),
			FRAME_PHASE.FORCE_HIDE,
		)
	})
</script>
