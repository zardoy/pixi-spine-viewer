<script lang="ts" module>
	export type Props = {
		rules: readonly AttachmentMixRule[]
		/** When set, used instead of the nearest spine context. */
		spine?: AnySpine
	}

	import type { AttachmentMixRule } from '../core/playback/attachmentMixRules'
	import type { AnySpine } from '../core/runtime/spineRuntime'
</script>

<script lang="ts">
	import { getContextSpine, getFramePipeline, FRAME_PHASE } from 'pixi-svelte'

	import {
		applyAttachmentMixRules,
		hasFromRule,
		snapshotFromAttachments,
		type FromAttachmentSnapshot,
	} from '../core/playback/attachmentMixRules'

	const props: Props = $props()
	const spine = props.spine ?? getContextSpine()

	/**
	 * Refreshed every frame while no mix is running, so when one starts the most recent value is
	 * already the pre-switch state.
	 *
	 * The alternative — snapshotting at the `setAnimation` call — couples this to whichever
	 * component drives playback and breaks if the two run in the wrong order. By the time a mix is
	 * visible the outgoing attachment name is gone from the skeleton, so it cannot be read late.
	 */
	let snapshot: FromAttachmentSnapshot | null = null

	$effect(() => {
		const rules = props.rules
		if (!rules.length) return

		const needsSnapshot = hasFromRule(rules)

		return getFramePipeline(spine).add((target) => {
			const { mixing } = applyAttachmentMixRules(target, rules, snapshot)
			if (!mixing && needsSnapshot) snapshot = snapshotFromAttachments(target, rules)
		}, FRAME_PHASE.MIX_RULES)
	})
</script>
