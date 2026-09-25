import type { AnySpine } from '../runtime/spineRuntime'
import { getSkeletonDrawOrderSlots, slotGetAttachment, slotSetAlpha, slotSyncAlphaFromPose } from '../runtime/spineSlot'
import { isDrawableAttachment, isRegionLikeAttachment } from '../runtime/spineAttachments'

export type ForceHideAttachmentsOptions = {
	/** Hide every drawable attachment — leaves only debug/wireframe overlays visible. */
	wireframe?: boolean
	/** Hide when the attachment path or name starts with any of these. */
	prefixes?: readonly string[] | null
	/** Hide when the attachment path or name equals any of these. */
	exact?: readonly string[] | null
}

export function hasForceHideWork(options: ForceHideAttachmentsOptions): boolean {
	return Boolean(options.wireframe || options.prefixes?.length || options.exact?.length)
}

/**
 * Hide attachments by zeroing slot alpha so the batcher skips them.
 *
 * Alpha rather than `setAttachment(null)` because the attachment must stay in place for the
 * animation's own timelines; and un-hiding restores from the slot's unmixed pose rather than a
 * hardcoded 1, so an animation's alpha timeline keeps working through the toggle.
 *
 * Must run after any attachment-mix pass — see FRAME_PHASE in pixi-svelte.
 */
export function applyForceHideAttachments(
	spine: AnySpine,
	options: ForceHideAttachmentsOptions,
): void {
	const { wireframe, prefixes, exact } = options
	const hasPrefixes = Boolean(prefixes?.length)
	const hasExact = Boolean(exact?.length)
	if (!wireframe && !hasPrefixes && !hasExact) return

	const drawOrder = getSkeletonDrawOrderSlots(spine.skeleton)
	const slots = drawOrder.length > 0 ? drawOrder : [...spine.skeleton.slots]

	for (const slot of slots) {
		const attachment = slotGetAttachment(slot)
		if (!attachment || !isDrawableAttachment(attachment)) continue

		if (wireframe) {
			slotSetAlpha(slot, 0)
			continue
		}

		const name = (attachment as { name: string }).name
		const path = (isRegionLikeAttachment(attachment) ? attachment.path : undefined) ?? name

		const matches =
			(hasPrefixes &&
				prefixes!.some((p) => (path && path.startsWith(p)) || (name && name.startsWith(p)))) ||
			(hasExact && exact!.some((p) => path === p || name === p))

		if (matches) slotSetAlpha(slot, 0)
		else slotSyncAlphaFromPose(slot)
	}
}
