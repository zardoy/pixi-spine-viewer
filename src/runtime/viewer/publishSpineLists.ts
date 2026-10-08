import {
	collectSkinDrawableAttachmentPaths,
	collectSlotDrawableAttachmentPaths,
	getSkeletonDrawOrderSlots,
	isDrawableAttachment,
	isRegionLikeAttachment,
	slotGetAttachment,
	type AnySpine,
} from 'spine-svelte'
import { spineViewerStore } from '../../store/spineViewerStore'

/**
 * Publish what the attachment panels offer to pick from — slots, bones and texture paths of the
 * spine as it is now. Pass null/destroyed to clear them.
 */
export function publishSpineLists(spine: AnySpine | null): void {
	const { ui } = spineViewerStore

	if (!spine || (spine as { destroyed?: boolean }).destroyed) {
		ui.availableAttachmentSlots = []
		ui.availableBones = []
		ui.availableTextureAttachmentPaths = []
		return
	}

	const drawOrderSlots = getSkeletonDrawOrderSlots(spine.skeleton) as { data: { name: string } }[]
	ui.availableAttachmentSlots = Array.from(new Set(drawOrderSlots.map((slot) => slot.data.name)))
	ui.availableBones = spine.skeleton.bones.map((bone: { data: { name: string } }) => bone.data.name)

	const paths = new Set<string>([
		...collectSkinDrawableAttachmentPaths(spine),
		...collectSlotDrawableAttachmentPaths(spine.skeleton),
	])
	for (const slot of drawOrderSlots) {
		const attachment = slotGetAttachment(slot)
		if (attachment && isDrawableAttachment(attachment)) {
			const path =
				(isRegionLikeAttachment(attachment) ? attachment.path : undefined) ??
				(attachment as { name: string }).name
			if (path) paths.add(path)
		}
	}
	ui.availableTextureAttachmentPaths = Array.from(paths).sort()
}
