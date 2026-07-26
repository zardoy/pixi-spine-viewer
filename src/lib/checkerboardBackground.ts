import type { Graphics } from 'pixi.js';

/** Background color stored in UI state when checker preset is selected. */
export const CHECKER_BG_COLOR = '#2a2a2a';

/** Fixed screen-space checker (e.g. map grid thumbnails). */
export const CHECKERBOARD_CSS =
  'repeating-conic-gradient(#2a2a2a 0% 25%, #1a1a1a 0% 50%) 0 0 / 20px 20px';

/** One checker square in skeleton/world units (scales with spine `ui.scale`). */
export const CHECKER_CELL_WORLD = 100;

const CHECKER_LIGHT = 0x2a2a2a;
const CHECKER_DARK = 0x1a1a1a;

export function isCheckerBackground(color: string): boolean {
  return color.toLowerCase() === CHECKER_BG_COLOR;
}

/** Draw a world-space checker grid centered on the skeleton origin. */
export function drawCheckerboardGrid(
  g: Graphics,
  options: { cellSize?: number; extent?: number } = {},
): void {
  const cellSize = options.cellSize ?? CHECKER_CELL_WORLD;
  const extent = options.extent ?? 20_000;
  const half = extent / 2;
  const cols = Math.ceil(extent / cellSize);

  g.clear();
  for (let row = 0; row < cols; row++) {
    for (let col = 0; col < cols; col++) {
      const isLight = (row + col) % 2 === 0;
      g.rect(-half + col * cellSize, -half + row * cellSize, cellSize, cellSize);
      g.fill({ color: isLight ? CHECKER_LIGHT : CHECKER_DARK });
    }
  }
}
