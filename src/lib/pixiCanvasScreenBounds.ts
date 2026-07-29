/** Label for frame-bounds overlay (Pixi canvas logical pixels). */
export function formatBoundsCanvasLabel(
  canvasX: number,
  canvasY: number,
  canvasW: number,
  canvasH: number,
  skeletonW: number,
  skeletonH: number,
): string {
  return `${skeletonW.toFixed(1)}×${skeletonH.toFixed(1)} sk\n${canvasW.toFixed(0)}×${canvasH.toFixed(0)} @ ${canvasX.toFixed(0)},${canvasY.toFixed(0)}`
}
