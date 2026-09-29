<script lang="ts" module>
	export type Props = {
		/** One skin name, or several combined (e.g. an identity skin plus a mode skin). */
		skinName: string | readonly string[]
		/** Resolve through the host's preference order when the name is missing/empty. */
		resolve?: boolean
		/** When set, used instead of the nearest spine context. */
		spine?: AnySpine
	}

	import type { AnySpine } from '../core/runtime/spineRuntime'
</script>

<script lang="ts">
	import { Skin } from '@esotericsoftware/spine-core'
	import { getContextSpine } from 'pixi-svelte'

	import { resolveSkinName, skeletonApplySkin } from '../core/runtime/spineCompat'

	const props: Props = $props()
	const spine = props.spine ?? getContextSpine()

	$effect(() => {
		const requested = (
			Array.isArray(props.skinName) ? props.skinName : [props.skinName as string]
		).filter(Boolean)

		const data = spine.skeleton.data

		if (requested.length === 0) {
			if (!props.resolve) return
			const fallback = resolveSkinName(data)
			const skin = fallback ? data.findSkin(fallback) : null
			if (skin) skeletonApplySkin(spine, skin)
			return
		}

		const skins = requested.map((name) => data.findSkin(name)).filter((skin) => skin != null)
		if (skins.length === 0) return

		if (skins.length === 1) {
			skeletonApplySkin(spine, skins[0])
			return
		}

		// Several skins touching different slots — merge rather than letting the last one win.
		const combined = new Skin('combined')
		for (const skin of skins) combined.addSkin(skin)
		skeletonApplySkin(spine, combined)
	})
</script>
