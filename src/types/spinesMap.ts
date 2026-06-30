export interface SpineAction {
  type: "fetch";
  url: string;
}

/** Axis-aligned bounding box in skeleton space. */
export interface SpineAabb {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Pre-computed preview placement for a single skeleton key. When present the
 * tile uses this AABB to fit/centre the spine instead of recomputing bounds
 * from the animation. Mirrors the screenshot tool's saved bounds payload.
 */
export interface SpineBoundsData {
  mode?: string;
  outputScale?: number;
  aabb?: SpineAabb;
  position?: { x: number; y: number; scale: number };
  sourceFilename?: string;
  animation?: string;
  frame?: number;
}

/** Map of skeleton key (e.g. "phoenix") → saved bounds/position data. */
export type SpineBoundsMap = Record<string, SpineBoundsData>;

export interface SpineEntry {
  name: string;
  path: string;
  json: string;
  atlas: string;
  png: string;
  actions?: Record<string, SpineAction>;
  /** Initial preview animation when valid; otherwise first animation. */
  defaultAnimation?: string;
  /** Initial preview skin when valid; otherwise first skin. */
  defaultSkin?: string;
  /** Animation used for max bounds when “fit to current animation” is off. */
  boundsAnimation?: string;
  /** Optional saved bounds/position data, keyed by skeleton name. */
  bounds?: SpineBoundsMap;
  // Support multiple PNG keys: png2, png3, etc.
  [key: string]: string | Record<string, SpineAction> | SpineBoundsMap | undefined;
}
