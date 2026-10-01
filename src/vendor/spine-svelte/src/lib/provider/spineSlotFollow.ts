import type * as PIXI from 'pixi.js';
import type { Spine } from '@esotericsoftware/spine-pixi-v8';

/** zIndex for slot overlays — above spine batch, below app UI unless raised further. */
export const SPINE_SLOT_OVERLAY_Z = 10_000;

/** zIndex for slot mounts drawn behind the spine attachment batch. */
export const SPINE_SLOT_BEHIND_Z = -10_000;

export type SyncSlotContainerOptions = {
	followAttachmentTimeline?: boolean;
	followSlotColor?: boolean;
	/** Default true — follow bone even when slot is alpha 0 / off draw order. */
	alwaysShow?: boolean;
};

/**
 * Mirror spine-pixi-v8 Spine.updateSlotObject, but for a container rendered as a
 * normal spine child (includeInBuild) so it draws above all batched attachments.
 */
export function syncContainerToSlotBone(
	spine: Spine,
	slotName: string,
	container: PIXI.Container,
	options: SyncSlotContainerOptions = {},
): boolean {
	const slot = spine.skeleton.findSlot(slotName);
	if (!slot || !slot.bone.active) {
		container.visible = false;
		return false;
	}

	const followAttachmentTimeline = options.followAttachmentTimeline ?? false;
	const pose = slot.appliedPose;
	const slotAlpha = spine.skeleton.color.a * pose.color.a;
	const inDrawOrder = spine.skeleton.drawOrder.appliedPose.includes(slot);
	const followOk = followAttachmentTimeline ? Boolean(pose.attachment) : true;
	const alwaysShow = options.alwaysShow ?? true;
	const visible = alwaysShow
		? spine.alpha > 0
		: inDrawOrder && followOk && spine.alpha > 0 && slotAlpha > 0;

	container.visible = visible;
	if (!visible) return false;

	const applied = slot.bone.appliedPose;
	const matrix = container.localTransform;
	matrix.a = applied.a;
	matrix.b = applied.c;
	matrix.c = -applied.b;
	matrix.d = -applied.d;
	matrix.tx = applied.worldX;
	matrix.ty = applied.worldY;
	container.setFromMatrix(matrix);
	container.alpha = alwaysShow ? 1 : slotAlpha;

	if (options.followSlotColor) {
		container.tint =
			((255 * spine.skeleton.color.r * pose.color.r) << 16) |
			((255 * spine.skeleton.color.g * pose.color.g) << 8) |
			(255 * spine.skeleton.color.b * pose.color.b);
	}

	return true;
}

export function attachSlotOverlay(
	spine: Spine,
	slotName: string,
	container: PIXI.Container,
): void {
	container.mask = null;
	container.includeInBuild = true;
	container.zIndex = SPINE_SLOT_OVERLAY_Z;
	spine.sortableChildren = true;
	spine.addChild(container);
}

export function detachSlotOverlay(spine: Spine, container: PIXI.Container): void {
	container.removeFromParent();
	container.mask = null;
}

export function attachSlotBehind(
	spine: Spine,
	_slotName: string,
	container: PIXI.Container,
	zIndexOffset = 0,
): void {
	container.mask = null;
	container.includeInBuild = true;
	container.zIndex = SPINE_SLOT_BEHIND_Z + zIndexOffset;
	spine.sortableChildren = true;
	spine.addChild(container);
}

export function detachSlotBehind(_spine: Spine, container: PIXI.Container): void {
	container.removeFromParent();
	container.mask = null;
}
