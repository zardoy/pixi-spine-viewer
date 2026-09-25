<script lang="ts" module>
	export type Props = {
		controller: SpineOverrideController
		control: string
		spine: AnySpine
	}

	import type { SpineOverrideController } from '../core/override/spineOverrideController'
	import type { AnySpine } from '../core/runtime/spineRuntime'
</script>

<script lang="ts">
	const props: Props = $props()

	// Gives the controller a live instance so imperative helpers (progress seeking, track
	// clearing) can reach this spine by control key.
	$effect(() => {
		props.controller.registerSpineRef(props.control, props.spine)
		return () => props.controller.registerSpineRef(props.control, null)
	})
</script>
