import type { Graphics } from 'pixi.js'

/** Axis length in skeleton/world units (same space as the editor origin). */
const AXIS_EXTENT = 20_000

/**
 * Draw Spine-editor-style origin axes at skeleton (0, 0).
 * +X is right (dark red), +Y is up on screen / editor space (dark green).
 * `lineWidth` should be ~1 / viewScale so the overlay stays screen-sized while zooming.
 */
export function drawOriginAxes(
  g: Graphics,
  options: { lineWidth?: number } = {},
): void {
  const lineWidth = options.lineWidth ?? 1

  g.clear()

  g.moveTo(-AXIS_EXTENT, 0)
  g.lineTo(AXIS_EXTENT, 0)
  g.stroke({ color: 0x8b3a3a, width: lineWidth, alpha: 0.7 })

  g.moveTo(0, -AXIS_EXTENT)
  g.lineTo(0, AXIS_EXTENT)
  g.stroke({ color: 0x3a6b45, width: lineWidth, alpha: 0.7 })

  g.circle(0, 0, Math.max(1.6 * lineWidth, 1.4))
  g.fill({ color: 0xffffff, alpha: 0.85 })
}
