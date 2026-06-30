/**
 * Attachment helpers for Spine 4.3.
 */
import {
  ClippingAttachment,
  MeshAttachment,
  PathAttachment,
  RegionAttachment,
} from '@esotericsoftware/spine-core'
import { getSkeletonDrawOrderSlots, slotGetAttachment, slotGetPose } from './spineSlot'

export function isRegionLikeAttachment(att: unknown): att is {
  computeWorldVertices: (...args: unknown[]) => void
  width: number
  height: number
  path?: string
  name: string
  region?: { originalWidth?: number; originalHeight?: number; width?: number; height?: number }
} {
  return (
    att != null &&
    typeof (att as { computeWorldVertices?: unknown }).computeWorldVertices === 'function' &&
    typeof (att as { width?: unknown }).width === 'number' &&
    typeof (att as { height?: unknown }).height === 'number'
  )
}

export function isMeshLikeAttachment(att: unknown): att is {
  computeWorldVertices: (...args: unknown[]) => void
  worldVerticesLength: number
  path?: string
  name: string
  region?: { originalWidth?: number; originalHeight?: number; width?: number; height?: number }
} {
  return (
    att != null &&
    typeof (att as { computeWorldVertices?: unknown }).computeWorldVertices === 'function' &&
    typeof (att as { worldVerticesLength?: unknown }).worldVerticesLength === 'number'
  )
}

export function isDrawableAttachment(att: unknown): boolean {
  return isRegionLikeAttachment(att) || isMeshLikeAttachment(att)
}

export function isRegionAttachment(att: unknown): boolean {
  return att instanceof RegionAttachment
}

export function isMeshAttachment(att: unknown): boolean {
  return att instanceof MeshAttachment
}

export function isClippingAttachment(att: unknown): boolean {
  return att instanceof ClippingAttachment
}

export function isPathAttachment(att: unknown): boolean {
  return att instanceof PathAttachment
}

export function computeRegionWorldVertices(
  attachment: { computeWorldVertices: (...args: unknown[]) => void; getOffsets?: (pose: unknown) => number[] },
  slot: unknown,
  _skeleton: unknown,
  vertices: Float32Array,
  offset: number,
  stride: number,
): void {
  const offsets = attachment.getOffsets?.(slotGetPose(slot))
  if (!offsets) return
  attachment.computeWorldVertices(slot, offsets, vertices, offset, stride)
}

export function computeMeshWorldVertices(
  attachment: { computeWorldVertices: (...args: unknown[]) => void; worldVerticesLength: number },
  slot: unknown,
  skeleton: unknown,
  vertices: Float32Array,
  offset: number,
  stride: number,
): void {
  attachment.computeWorldVertices(
    skeleton,
    slot,
    0,
    attachment.worldVerticesLength,
    vertices,
    offset,
    stride,
  )
}

export function computeDrawableAttachmentBounds(
  attachment: unknown,
  slot: unknown,
  skeleton: unknown,
): { minX: number; minY: number; maxX: number; maxY: number } | null {
  if (isRegionLikeAttachment(attachment)) {
    const vertices = new Float32Array(8)
    computeRegionWorldVertices(attachment, slot, skeleton, vertices, 0, 2)
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (let j = 0; j < 8; j += 2) {
      minX = Math.min(minX, vertices[j])
      maxX = Math.max(maxX, vertices[j])
      minY = Math.min(minY, vertices[j + 1])
      maxY = Math.max(maxY, vertices[j + 1])
    }
    return { minX, minY, maxX, maxY }
  }

  if (isMeshLikeAttachment(attachment)) {
    const vertices = new Float32Array(attachment.worldVerticesLength)
    computeMeshWorldVertices(attachment, slot, skeleton, vertices, 0, 2)
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
    for (let j = 0; j < vertices.length; j += 2) {
      minX = Math.min(minX, vertices[j])
      maxX = Math.max(maxX, vertices[j])
      minY = Math.min(minY, vertices[j + 1])
      maxY = Math.max(maxY, vertices[j + 1])
    }
    return { minX, minY, maxX, maxY }
  }

  return null
}

function attachmentPath(att: unknown): string | null {
  if (!isDrawableAttachment(att)) return null
  const path = (isRegionLikeAttachment(att) ? att.path : undefined) ?? (att as { name: string }).name
  return path || null
}

/** Drawable attachment paths from active skin (setup pose), for UI lists. */
export function collectSkinDrawableAttachmentPaths(spine: {
  skeleton: { skin?: { getAttachments(): Iterable<{ attachment: unknown }> } | null; data: { defaultSkin?: { getAttachments(): Iterable<{ attachment: unknown }> } | null } }
}): string[] {
  const paths = new Set<string>()
  const skin = spine.skeleton.skin ?? spine.skeleton.data.defaultSkin
  if (!skin) return []
  for (const entry of skin.getAttachments()) {
    const path = attachmentPath(entry.attachment)
    if (path) paths.add(path)
  }
  return Array.from(paths).sort()
}

/** Drawable attachment paths currently on slots in draw order. */
export function collectSlotDrawableAttachmentPaths(skeleton: unknown): string[] {
  const paths = new Set<string>()
  for (const slot of getSkeletonDrawOrderSlots(skeleton)) {
    const path = attachmentPath(slotGetAttachment(slot))
    if (path) paths.add(path)
  }
  return Array.from(paths).sort()
}
