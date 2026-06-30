import { Container, Graphics } from 'pixi.js'
import { Physics, Vector2 } from '@esotericsoftware/spine-core'
import { applyAnimationAtTime, skeletonSetupPose } from './spineCompat'
import {
  createSpineFromData,
  loadSpineDataFromFiles as loadSpineDataFromFilesDual,
  type AnyAnimation,
  type AnySpine,
  type LoadedSpineData,
} from './spineRuntime'

export interface SpineDisplayOptions {
  width: number
  height: number
}

export interface AnimationViewport {
  x: number
  y: number
  width: number
  height: number
  padLeft: number
  padRight: number
  padTop: number
  padBottom: number
}

/**
 * SpineDisplay - Encapsulated PIXI.js v8 Spine animation display class
 *
 * This class handles the rendering and control of Spine animations using PIXI.js v8
 * and @esotericsoftware/spine-pixi-v8 (official Spine runtime).
 *
 * Usage:
 * ```typescript
 * const display = new SpineDisplay({ width: 800, height: 600 });
 * display.setSpine(spineInstance);
 * display.setAnimation('walk', true);
 * ```
 */
export class SpineDisplay extends Container {
  /** When true, logs load pipeline stages (image load, texture set, skeleton parse) for debugging. */
  static spineLoadDebug = false;

  private dimensions: { width: number; height: number }
  private initialGraphic: Graphics
  private spine: AnySpine | null = null;

  constructor(options: SpineDisplayOptions) {
    super()

    const { width, height } = options
    this.dimensions = { width, height }

    // Create initial background graphic
    this.initialGraphic = new Graphics()
    this.initialGraphic.rect(0, 0, this.dimensions.width, this.dimensions.height)
    this.initialGraphic.fill({ color: 0x000000, alpha: 0.9 })
    this.addChild(this.initialGraphic)
  }

  /**
   * Options for loading Spine from files
   */
  static loadSpineOptions: {
    /**
     * Control dark tint rendering mode:
     * - true: Force use dark tint batcher (supports two-color tinting, but may have blending issues)
     * - false: Force use default PIXI batcher (better blending, no two-color tinting)
     * - undefined: Auto-detect based on whether skeleton uses dark colors (default)
     */
    darkTint?: boolean
  } = {};

  /**
   * Helper: Load skeleton data from JSON, atlas text and image files.
   * This can be used from any PixiJS v8 application.
   *
   * @param json - The skeleton JSON content (string or parsed object)
   * @param atlasText - The atlas file content
   * @param imageFiles - Array of image files for the atlas
   * @returns Object with skeletonData and textureSources (for preloading to GPU via app.prepare.upload)
   */
  static async loadSpineDataFromFiles(
    json: string | Record<string, any> | ArrayBuffer | Uint8Array,
    atlasText: string,
    imageFiles: File[]
  ): Promise<LoadedSpineData> {
    const log = (msg: string) => SpineDisplay.spineLoadDebug && console.log(`[SpineDisplay] ${msg}`)
    return loadSpineDataFromFilesDual(json, atlasText, imageFiles, log)
  }

  /**
   * Helper: Load a Spine instance from JSON, atlas text and image files.
   * This can be used from any PixiJS v8 application.
   *
   * @param json - The skeleton JSON content (string or parsed object)
   * @param atlasText - The atlas file content
   * @param imageFiles - Array of image files for the atlas
   * @param options - Optional loading options
   */
  static async loadSpineFromFiles(
    json: string | Record<string, any> | ArrayBuffer | Uint8Array,
    atlasText: string,
    imageFiles: File[],
    options?: {
      /**
       * Control dark tint rendering:
       * - true: Force dark tint batcher (two-color tinting, may have blending issues with semi-transparent overlays)
       * - false: Force default PIXI batcher (better blending for overlays, no dark tint support)
       * - undefined: Auto-detect based on skeleton dark colors
       */
      darkTint?: boolean
      /**
       * Fixed bounds x position. If x, y, width, and height are all provided, a boundsProvider will be created.
       */
      boundsX?: number
      /**
       * Fixed bounds y position. If x, y, width, and height are all provided, a boundsProvider will be created.
       */
      boundsY?: number
      /**
       * Fixed bounds width. If x, y, width, and height are all provided, a boundsProvider will be created.
       */
      boundsWidth?: number
      /**
       * Fixed bounds height. If x, y, width, and height are all provided, a boundsProvider will be created.
       */
      boundsHeight?: number
    }
  ): Promise<AnySpine> {
    const { skeletonData } = await this.loadSpineDataFromFiles(json, atlasText, imageFiles)

    const darkTint = options?.darkTint ?? SpineDisplay.loadSpineOptions.darkTint

    return createSpineFromData(skeletonData, {
      darkTint,
      boundsX: options?.boundsX,
      boundsY: options?.boundsY,
      boundsWidth: options?.boundsWidth,
      boundsHeight: options?.boundsHeight,
    })
  }

  /**
   * Calculate the viewport (bounding box) for an animation by sampling it over time.
   * This matches the official Spine player's approach.
   * @param animation - Animation to calculate bounds for
   * @param spine - Spine instance
   * @param padding - Padding percentage (default 0.1 = 10%)
   */
  static calculateAnimationViewport(
    animation: AnyAnimation,
    spine: AnySpine,
    padding: number = 0.1
  ): AnimationViewport {
    const skeleton = spine.skeleton

    skeletonSetupPose(skeleton as never)

    const steps = 100
    const stepTime = animation.duration ? animation.duration / steps : 0
    let time = 0
    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity

    const offset = new Vector2()
    const size = new Vector2()

    for (let i = 0; i < steps; i++, time += stepTime) {
      skeletonSetupPose(skeleton as never)
      applyAnimationAtTime(skeleton as never, animation as never, time)
      skeleton.updateWorldTransform(Physics.update)
      skeleton.getBounds(offset, size, [])

      if (!isNaN(offset.x) && !isNaN(offset.y) && !isNaN(size.x) && !isNaN(size.y)) {
        minX = Math.min(offset.x, minX)
        maxX = Math.max(offset.x + size.x, maxX)
        minY = Math.min(offset.y, minY)
        maxY = Math.max(offset.y + size.y, maxY)
      }
    }

    // Validate bounds - if no valid bounds found, use default viewport
    if (!isFinite(minX) || !isFinite(maxX) || !isFinite(minY) || !isFinite(maxY)) {
      console.warn(`Animation "${animation.name}" has no valid bounds, using default viewport`)
      // Use a default viewport centered at origin
      return {
        x: -500,
        y: -500,
        width: 1000,
        height: 1000,
        padLeft: 100,
        padRight: 100,
        padTop: 100,
        padBottom: 100,
      }
    }

    const width = maxX - minX
    const height = maxY - minY

    // Ensure minimum dimensions to prevent division by zero
    const safeWidth = Math.max(width, 1)
    const safeHeight = Math.max(height, 1)

    const padLeft = safeWidth * padding
    const padRight = safeWidth * padding
    const padTop = safeHeight * padding
    const padBottom = safeHeight * padding

    return {
      x: minX,
      y: minY,
      width: safeWidth,
      height: safeHeight,
      padLeft,
      padRight,
      padTop,
      padBottom,
    }
  }

  /**
   * Calculate a viewport that encloses ALL animations on the skeleton.
   * Useful for stable camera/framing across animation changes.
   */
  static calculateMaxAnimationsViewport(
    spine: AnySpine,
    padding: number = 0.1
  ): AnimationViewport | null {
    const skeletonData = spine.skeleton?.data;
    const animations = skeletonData?.animations ?? [];
    if (!animations.length) return null;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    let padLeft = 0;
    let padRight = 0;
    let padTop = 0;
    let padBottom = 0;

    for (const anim of animations) {
      const vp = SpineDisplay.calculateAnimationViewport(anim, spine, padding);
      minX = Math.min(minX, vp.x);
      minY = Math.min(minY, vp.y);
      maxX = Math.max(maxX, vp.x + vp.width);
      maxY = Math.max(maxY, vp.y + vp.height);
      padLeft = Math.max(padLeft, vp.padLeft);
      padRight = Math.max(padRight, vp.padRight);
      padTop = Math.max(padTop, vp.padTop);
      padBottom = Math.max(padBottom, vp.padBottom);
    }

    if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) {
      return null;
    }

    return {
      x: minX,
      y: minY,
      width: Math.max(maxX - minX, 1),
      height: Math.max(maxY - minY, 1),
      padLeft,
      padRight,
      padTop,
      padBottom,
    };
  }

  /**
   * Set the current animation
   * @param name - Animation name to play
   * @param loop - Whether the animation should loop (default: false)
   */
  setAnimation(name: string, loop: boolean = false): void {
    if (this.spine) {
      this.spine.state.setAnimation(0, name, loop)
    }
  }

  /**
   * Get list of available animations
   * @returns Array of animation names
   */
  getAnimations(): string[] {
    if (this.spine && this.spine.skeleton.data.animations) {
      return this.spine.skeleton.data.animations.map((anim: any) => anim.name)
    }
    return []
  }

  /**
   * Set the animation playback speed (time scale)
   * @param scale - Speed multiplier (1.0 = normal speed, 0.5 = half speed, 2.0 = double speed)
   */
  setTimeScale(scale: number): void {
    if (this.spine) {
      this.spine.state.timeScale = scale
    }
  }

  /**
   * Set the opacity/alpha of the spine animation
   * @param alpha - Alpha value (0.0 = transparent, 1.0 = opaque)
   */
  setAlpha(alpha: number): void {
    if (this.spine) {
      this.spine.alpha = alpha
    }
  }

  /**
   * Set the scale of the spine animation
   * @param scale - Scale multiplier (1.0 = normal size, 0.5 = half size, 2.0 = double size)
   */
  setScale(scale: number): void {
    if (this.spine) {
      this.spine.scale.set(scale)
    }
  }

  /**
   * Pause the current animation
   */
  pause(): void {
    if (this.spine) {
      this.spine.autoUpdate = false
    }
  }

  /**
   * Resume the current animation
   */
  resume(): void {
    if (this.spine) {
      this.spine.autoUpdate = true
    }
  }

  /**
   * Stop and reset the current animation
   */
  stop(): void {
    if (this.spine) {
      this.spine.state.clearTracks()
    }
  }

  /**
   * Get the current animation name
   */
  getCurrentAnimation(): string | null {
    if (this.spine && this.spine.state) {
      const track = this.spine.state.tracks[0]
      return track && track.animation ? track.animation.name : null
    }
    return null
  }

  /**
   * Clean up and destroy the spine instance
   */
  destroySpine(): void {
    if (this.spine) {
      this.spine.destroy()
      this.spine = null
    }
  }

  /**
   * Get the spine instance (for advanced usage)
   */
  getSpine(): AnySpine | null {
    return this.spine
  }

  /**
   * Update dimensions and reposition spine
   */
  updateDimensions(width: number, height: number): void {
    this.dimensions = { width, height }

    // Update background graphic
    this.initialGraphic.clear()
    this.initialGraphic.rect(0, 0, width, height)
    this.initialGraphic.fill({ color: 0x000000, alpha: 0.9 })

    // Reposition spine if it exists
    if (this.spine) {
      this.spine.x = width / 2
      this.spine.y = height / 2
    }
  }
}
