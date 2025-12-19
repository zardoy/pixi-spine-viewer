import { Spine, AABBRectangleBoundsProvider } from '@esotericsoftware/spine-pixi-v8';
import { Container, Graphics, ImageSource } from 'pixi.js';
import { TextureAtlas, AtlasAttachmentLoader, SkeletonJson, SkeletonData, Animation, MixBlend, MixDirection, Physics, Vector2 } from '@esotericsoftware/spine-core';
import { SpineTexture } from '@esotericsoftware/spine-pixi-v8';

export interface SpineDisplayOptions {
  width: number;
  height: number;
}

export interface AnimationViewport {
  x: number;
  y: number;
  width: number;
  height: number;
  padLeft: number;
  padRight: number;
  padTop: number;
  padBottom: number;
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
  private dimensions: { width: number; height: number };
  private initialGraphic: Graphics;
  private spine: Spine | null = null;

  constructor(options: SpineDisplayOptions) {
    super();

    const { width, height } = options;
    this.dimensions = { width, height };

    // Create initial background graphic
    this.initialGraphic = new Graphics();
    this.initialGraphic.rect(0, 0, this.dimensions.width, this.dimensions.height);
    this.initialGraphic.fill({ color: 0x000000, alpha: 0.9 });
    this.addChild(this.initialGraphic);
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
    darkTint?: boolean;
  } = {};

  /**
   * Helper: Load skeleton data from JSON, atlas text and image files.
   * This can be used from any PixiJS v8 application.
   *
   * @param json - The skeleton JSON content (string or parsed object)
   * @param atlasText - The atlas file content
   * @param imageFiles - Array of image files for the atlas
   */
  static async loadSpineDataFromFiles(
    json: string | Record<string, any>,
    atlasText: string,
    imageFiles: File[]
  ): Promise<SkeletonData> {
    // Create texture atlas from atlas text
    const textureAtlas = new TextureAtlas(atlasText);

    // For each atlas page, find or fallback to an image file, then attach via SpineTexture
    for (const page of textureAtlas.pages) {
      const pageFile =
        imageFiles.find(f => f.name === page.name) ||
        imageFiles.find(f => f.name.toLowerCase().includes(page.name.toLowerCase().split('.')[0]));

      const fileToUse = pageFile || imageFiles[0];
      if (!fileToUse) {
        console.error('No image files provided for Spine atlas.');
        continue;
      }

      try {
        const url = URL.createObjectURL(fileToUse);

        const img = new Image();
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve();
          img.onerror = reject;
          img.crossOrigin = 'anonymous';
          img.src = url;
        });

        // IMPORTANT: Respect the atlas page's pma (premultiplied alpha) flag!
        // If pma is true, the texture is already premultiplied, use 'premultiplied-alpha'
        // If pma is false, PIXI should premultiply on upload (this is the default)
        // This is critical for correct blending of semi-transparent textures!
        const alphaMode = page.pma ? 'premultiplied-alpha' : 'premultiply-alpha-on-upload';

        // Create ImageSource with correct alphaMode for proper blending
        const imageSource = new ImageSource({
          resource: img,
          alphaMode: alphaMode as any,
        });

        const spineTex = SpineTexture.from(imageSource);
        page.setTexture(spineTex);

        URL.revokeObjectURL(url);
      } catch (err) {
        console.error(`Failed to load image for atlas page ${page.name}:`, err);
      }
    }

    const atlasLoader = new AtlasAttachmentLoader(textureAtlas);
    const skeletonJson = new SkeletonJson(atlasLoader);
    const jsonData = typeof json === 'string' ? JSON.parse(json) : json;
    const skeletonData = skeletonJson.readSkeletonData(jsonData);

    return skeletonData;
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
    json: string | Record<string, any>,
    atlasText: string,
    imageFiles: File[],
    options?: {
      /**
       * Control dark tint rendering:
       * - true: Force dark tint batcher (two-color tinting, may have blending issues with semi-transparent overlays)
       * - false: Force default PIXI batcher (better blending for overlays, no dark tint support)
       * - undefined: Auto-detect based on skeleton dark colors
       */
      darkTint?: boolean;
      /**
       * Fixed bounds x position. If x, y, width, and height are all provided, a boundsProvider will be created.
       */
      boundsX?: number;
      /**
       * Fixed bounds y position. If x, y, width, and height are all provided, a boundsProvider will be created.
       */
      boundsY?: number;
      /**
       * Fixed bounds width. If x, y, width, and height are all provided, a boundsProvider will be created.
       */
      boundsWidth?: number;
      /**
       * Fixed bounds height. If x, y, width, and height are all provided, a boundsProvider will be created.
       */
      boundsHeight?: number;
    }
  ): Promise<Spine> {
    const skeletonData = await this.loadSpineDataFromFiles(json, atlasText, imageFiles);

    // Use darkTint option from parameter, fallback to static option, or undefined for auto-detect
    const darkTint = options?.darkTint ?? SpineDisplay.loadSpineOptions.darkTint;

    // Create bounds provider if all bounds values are provided
    let boundsProvider;
    if (
      options?.boundsX !== undefined &&
      options?.boundsY !== undefined &&
      options?.boundsWidth !== undefined &&
      options?.boundsHeight !== undefined
    ) {
      boundsProvider = new AABBRectangleBoundsProvider(
        options.boundsX,
        options.boundsY,
        options.boundsWidth,
        options.boundsHeight
      );
    }

    const spine = new Spine({
      skeletonData,
      darkTint, // undefined = auto-detect, false = disable for better blending, true = force enable
      boundsProvider,
    });

    return spine;
  }

  /**
   * Calculate the viewport (bounding box) for an animation by sampling it over time.
   * This matches the official Spine player's approach.
   * @param animation - Animation to calculate bounds for
   * @param spine - Spine instance
   * @param padding - Padding percentage (default 0.1 = 10%)
   */
  static calculateAnimationViewport(
    animation: Animation,
    spine: Spine,
    padding: number = 0.1
  ): AnimationViewport {
    const skeleton = spine.skeleton;

    // Note: We temporarily modify the skeleton to calculate bounds.
    // The caller should set the desired animation immediately after this
    // to restore the skeleton to the correct state.
    skeleton.setToSetupPose();

    const steps = 100;
    const stepTime = animation.duration ? animation.duration / steps : 0;
    let time = 0;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    const offset = new Vector2();
    const size = new Vector2();

    // Sample animation at 100 different time points to find bounding box
    for (let i = 0; i < steps; i++, time += stepTime) {
      animation.apply(skeleton, time, time, false, [], 1, MixBlend.setup, MixDirection.mixIn);
      skeleton.updateWorldTransform(Physics.update);
      skeleton.getBounds(offset, size, []);

      if (!isNaN(offset.x) && !isNaN(offset.y) && !isNaN(size.x) && !isNaN(size.y)) {
        minX = Math.min(offset.x, minX);
        maxX = Math.max(offset.x + size.x, maxX);
        minY = Math.min(offset.y, minY);
        maxY = Math.max(offset.y + size.y, maxY);
      }
    }

    // Validate bounds - if no valid bounds found, use default viewport
    if (!isFinite(minX) || !isFinite(maxX) || !isFinite(minY) || !isFinite(maxY)) {
      console.warn(`Animation "${animation.name}" has no valid bounds, using default viewport`);
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
      };
    }

    const width = maxX - minX;
    const height = maxY - minY;

    // Ensure minimum dimensions to prevent division by zero
    const safeWidth = Math.max(width, 1);
    const safeHeight = Math.max(height, 1);

    const padLeft = safeWidth * padding;
    const padRight = safeWidth * padding;
    const padTop = safeHeight * padding;
    const padBottom = safeHeight * padding;

    return {
      x: minX,
      y: minY,
      width: safeWidth,
      height: safeHeight,
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
      this.spine.state.setAnimation(0, name, loop);
    }
  }

  /**
   * Get list of available animations
   * @returns Array of animation names
   */
  getAnimations(): string[] {
    if (this.spine && this.spine.skeleton.data.animations) {
      return this.spine.skeleton.data.animations.map((anim: any) => anim.name);
    }
    return [];
  }

  /**
   * Set the animation playback speed (time scale)
   * @param scale - Speed multiplier (1.0 = normal speed, 0.5 = half speed, 2.0 = double speed)
   */
  setTimeScale(scale: number): void {
    if (this.spine) {
      this.spine.state.timeScale = scale;
    }
  }

  /**
   * Set the opacity/alpha of the spine animation
   * @param alpha - Alpha value (0.0 = transparent, 1.0 = opaque)
   */
  setAlpha(alpha: number): void {
    if (this.spine) {
      this.spine.alpha = alpha;
    }
  }

  /**
   * Set the scale of the spine animation
   * @param scale - Scale multiplier (1.0 = normal size, 0.5 = half size, 2.0 = double size)
   */
  setScale(scale: number): void {
    if (this.spine) {
      this.spine.scale.set(scale);
    }
  }

  /**
   * Pause the current animation
   */
  pause(): void {
    if (this.spine) {
      this.spine.autoUpdate = false;
    }
  }

  /**
   * Resume the current animation
   */
  resume(): void {
    if (this.spine) {
      this.spine.autoUpdate = true;
    }
  }

  /**
   * Stop and reset the current animation
   */
  stop(): void {
    if (this.spine) {
      this.spine.state.clearTracks();
    }
  }

  /**
   * Get the current animation name
   */
  getCurrentAnimation(): string | null {
    if (this.spine && this.spine.state) {
      const track = this.spine.state.tracks[0];
      return track && track.animation ? track.animation.name : null;
    }
    return null;
  }

  /**
   * Clean up and destroy the spine instance
   */
  destroySpine(): void {
    if (this.spine) {
      this.spine.destroy();
      this.spine = null;
    }
  }

  /**
   * Get the spine instance (for advanced usage)
   */
  getSpine(): Spine | null {
    return this.spine;
  }

  /**
   * Update dimensions and reposition spine
   */
  updateDimensions(width: number, height: number): void {
    this.dimensions = { width, height };

    // Update background graphic
    this.initialGraphic.clear();
    this.initialGraphic.rect(0, 0, width, height);
    this.initialGraphic.fill({ color: 0x000000, alpha: 0.9 });

    // Reposition spine if it exists
    if (this.spine) {
      this.spine.x = width / 2;
      this.spine.y = height / 2;
    }
  }
}
