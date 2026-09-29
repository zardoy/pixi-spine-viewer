import type { SpineOverrideController } from '../core/override/spineOverrideController'

/**
 * Tracks override changes for one control key and counts this component as a mounted consumer.
 *
 * Returns an accessor rather than a value because `$derived`/`$state` cannot be returned directly
 * from a function — read `.revision` inside the caller's own `$derived.by` to re-run it.
 */
export function useSpineOverrideRevision(
	controller: SpineOverrideController | undefined,
	control: string | undefined,
) {
	let revision = $state(0)

	$effect(() => {
		if (!controller || !control) return
		// setOverride refuses controls with no mounted consumer, so this registration is what
		// makes an override addressable at all.
		controller.mountControl(control)
		return () => controller.unmountControl(control)
	})

	$effect(() => {
		if (!controller || !control) return
		return controller.subscribe(() => {
			revision = controller.overrides[control]?.counter ?? -1
		})
	})

	return {
		get revision() {
			return revision
		},
	}
}
