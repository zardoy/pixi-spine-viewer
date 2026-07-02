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

export function attachAttachmentTestToSlot(
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
  console.debug('[AttachmentTest] following slot:', slotName, {
    bone: slot.bone.data.name,
    worldX: slot.bone.appliedPose.worldX,
    worldY: slot.bone.appliedPose.worldY,
  })
  return true
}

export function attachAttachmentTestToBone(
  spine: AnySpine,
  boneName: string,
  marker: Container,
): boolean {
  const bone = spine.skeleton.findBone(boneName)
  if (!bone) {
    console.warn('[AttachmentTest] bone not found:', boneName)
    return false
  }
  detachAttachmentTestMarker(spine, marker)
  spine.addChild(marker)
  applyBoneAppliedPoseToContainer(bone.appliedPose, marker)
  marker.visible = true
  console.debug('[AttachmentTest] following bone:', boneName, {
    worldX: bone.appliedPose.worldX,
    worldY: bone.appliedPose.worldY,
  })
  return true
}

export function tickAttachmentTestBoneFollow(
  spine: AnySpine,
  boneName: string,
  marker: Container,
): void {
  const bone = spine.skeleton.findBone(boneName)
  if (!bone) return
  applyBoneAppliedPoseToContainer(bone.appliedPose, marker)
}
