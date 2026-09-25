/**
 * Defensive patch for Spine mesh attachments with invalid bone indices.
 */
import { VertexAttachment } from '@esotericsoftware/spine-core'

const original = VertexAttachment.prototype.computeWorldVertices

VertexAttachment.prototype.computeWorldVertices = function (
  this: { name?: string },
  ...args: unknown[]
): void {
  try {
    original.apply(this, args as never)
  } catch (e) {
    const slot = args[0] as { data?: { name?: string } } | undefined
    const worldVertices = (args.length >= 7 ? args[4] : args[1]) as ArrayLike<number> | undefined
    const offset = (args.length >= 7 ? args[5] : args[2]) as number | undefined
    const stride = (args.length >= 7 ? args[6] : args[3]) as number | undefined
    const count = (args.length >= 7 ? args[3] : undefined) as number | undefined

    if (worldVertices && offset != null && stride != null) {
      const vertexCount = count != null ? count >> 1 : 4
      const end = offset + vertexCount * stride
      for (let w = offset; w < end; w += stride) {
        ;(worldVertices as number[])[w] = 0
        ;(worldVertices as number[])[w + 1] = 0
      }
    }

    const slotName = slot?.data?.name ?? 'unknown'
    const attName = this.name ?? 'unknown'
    console.warn(
      `[Spine] Mesh attachment "${attName}" on slot "${slotName}" has invalid bone indices. ` +
        `The mesh may not render correctly. This is usually a Spine export issue.` +
        (e as Error).message,
    )
  }
}
