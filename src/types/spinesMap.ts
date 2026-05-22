export interface SpineAction {
  type: "fetch";
  url: string;
}

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
  // Support multiple PNG keys: png2, png3, etc.
  [key: string]: string | Record<string, SpineAction> | undefined;
}
