import type { Container } from 'pixi.js'
import type { AnySpine } from './spineRuntime'

interface BoneAppliedPose {
  a: number
  b: number
  c: number
  d: number
  worldX: number
  worldY: number
}

const SPINE_SLOT_OVERLAY_Z = 10_000

/** Match spine-pixi-v8 Spine.updateSlotObject bone matrix mapping. */
export function applyBoneAppliedPoseToContainer(
  applied: BoneAppliedPose,
  container: Container,
): void {
  const matrix = container.localTransform
  matrix.a = applied.a
  matrix.b = applied.c
  matrix.c = -applied.b
  matrix.d = -applied.d
  matrix.tx = applied.worldX
  matrix.ty = applied.worldY
  container.setFromMatrix(matrix)
}

/** Offset a bone's applied world pose by (offsetX, offsetY) expressed in the bone's local axes. */
function offsetBoneAppliedPose(
  applied: BoneAppliedPose,
  offsetX: number,
  offsetY: number,
): BoneAppliedPose {
  if (!offsetX && !offsetY) return applied
  return {
    ...applied,
    worldX: applied.worldX + applied.a * offsetX + applied.b * offsetY,
    worldY: applied.worldY + applied.c * offsetX + applied.d * offsetY,
  }
}

export function detachAttachmentTestMarker(spine: AnySpine, marker: Container): void {
  if (typeof spine.removeSlotObject === 'function') {
    try {
      spine.removeSlotObject(marker)
      return
    } catch {
      // not attached via addSlotObject
    }
  }
  marker.parent?.removeChild(marker)
}

function attachSlotOverlay(spine: AnySpine, marker: Container): void {
  marker.mask = null
  marker.includeInBuild = true
  marker.zIndex = SPINE_SLOT_OVERLAY_Z
  spine.sortableChildren = true
  spine.addChild(marker)
}

/** Sync marker to slot bone — for overlay mode (manual tick). */
export function syncAttachmentTestToSlot(
  spine: AnySpine,
  slotName: string,
  marker: Container,
): boolean {
  const slot = spine.skeleton.findSlot(slotName)
  if (!slot || !slot.bone.active) {
    marker.visible = false
    return false
  }

  const pose = slot.appliedPose
  const slotAlpha = spine.skeleton.color.a * pose.color.a
  const inDrawOrder = spine.skeleton.drawOrder.appliedPose.includes(slot)
  const visible = inDrawOrder && spine.alpha > 0 && slotAlpha > 0

  marker.visible = visible
  if (!visible) return false

  applyBoneAppliedPoseToContainer(slot.bone.appliedPose, marker)
  marker.alpha = slotAlpha
  return true
}

/** Inject at slot draw order via spine-pixi (above target slot, behind later slots). */
export function attachAttachmentTestToSlotDrawOrder(
  spine: AnySpine,
  slotName: string,
  marker: Container,
): boolean {
  const slot = spine.skeleton.findSlot(slotName)
  if (!slot) {
    console.warn('[AttachmentTest] slot not found:', slotName)
    return false
  }
  detachAttachmentTestMarker(spine, marker)
  spine.addSlotObject(slotName, marker, { followAttachmentTimeline: false })
  marker.visible = true
  console.debug('[AttachmentTest] slot draw-order follow:', slotName)
  return true
}

/** Overlay above all spine attachments (debug layer on top). */
export function attachAttachmentTestToSlotOverlay(
  spine: AnySpine,
  slotName: string,
  marker: Container,
): boolean {
  const slot = spine.skeleton.findSlot(slotName)
  if (!slot) {
    console.warn('[AttachmentTest] slot not found:', slotName)
    return false
  }
  detachAttachmentTestMarker(spine, marker)
  attachSlotOverlay(spine, marker)
  syncAttachmentTestToSlot(spine, slotName, marker)
  console.debug('[AttachmentTest] slot overlay follow:', slotName)
  return true
}

export function attachAttachmentTestToBone(
  spine: AnySpine,
  boneName: string,
  marker: Container,
  offsetX = 0,
  offsetY = 0,
): boolean {
  const bone = spine.skeleton.findBone(boneName)
  if (!bone) {
    console.warn('[AttachmentTest] bone not found:', boneName)
    return false
  }
  detachAttachmentTestMarker(spine, marker)
  attachSlotOverlay(spine, marker)
  applyBoneAppliedPoseToContainer(offsetBoneAppliedPose(bone.appliedPose, offsetX, offsetY), marker)
  marker.visible = true
  console.debug('[AttachmentTest] bone overlay follow:', boneName)
  return true
}

export function tickAttachmentTestBoneFollow(
  spine: AnySpine,
  boneName: string,
  marker: Container,
  offsetX = 0,
  offsetY = 0,
): void {
  const bone = spine.skeleton.findBone(boneName)
  if (!bone) return
  applyBoneAppliedPoseToContainer(offsetBoneAppliedPose(bone.appliedPose, offsetX, offsetY), marker)
}

export function tickAttachmentTestSlotFollow(
  spine: AnySpine,
  slotName: string,
  marker: Container,
): void {
  syncAttachmentTestToSlot(spine, slotName, marker)
}
