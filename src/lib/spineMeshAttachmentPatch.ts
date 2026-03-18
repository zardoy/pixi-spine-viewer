/**
 * Defensive patch for Spine mesh attachments with invalid bone indices.
 *
 * Some Spine assets have mesh attachments that reference bone indices outside
 * the skeleton's bone array (e.g. corrupted export, version mismatch). This
 * causes "Cannot read properties of undefined (reading 'a')" in
 * VertexAttachment.computeWorldVertices.
 *
 * This patch wraps the method to catch the error, fill vertices with zeros,
 * and log a warning. The mesh will render collapsed but the spine won't crash.
 */
import { VertexAttachment } from '@esotericsoftware/spine-core'

const original = VertexAttachment.prototype.computeWorldVertices

VertexAttachment.prototype.computeWorldVertices = function (
  slot: Parameters<typeof original>[0],
  start: Parameters<typeof original>[1],
  count: Parameters<typeof original>[2],
  worldVertices: Parameters<typeof original>[3],
  offset: Parameters<typeof original>[4],
  stride: Parameters<typeof original>[5]
): void {
  try {
    original.call(this, slot, start, count, worldVertices, offset, stride)
  } catch (e) {
    const end = offset + (count >> 1) * stride
    for (let w = offset; w < end; w += stride) {
      worldVertices[w] = 0
      worldVertices[w + 1] = 0
    }
    let alerted = false
    if (typeof console !== 'undefined') {
      const slotName = slot?.data?.name ?? 'unknown'
      const attName = (this as { name?: string }).name ?? 'unknown'
      const msg = `[Spine] Mesh attachment "${attName}" on slot "${slotName}" has invalid bone indices. ` +
        `The mesh may not render correctly. This is usually a Spine export issue.` + (e as Error).message
        if (!alerted) {
          alerted = true
          alert(msg)
        }
      console.warn(msg)
    }
  }
}
