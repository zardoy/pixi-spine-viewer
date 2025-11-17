import * as PIXI from 'pixi.js';
import { Spine } from '@esotericsoftware/spine-pixi-v8';
import { Container, Graphics } from 'pixi.js';
import { TextureAtlas, AtlasAttachmentLoader, SkeletonJson, Animation, MixBlend, MixDirection, Physics, Vector2 } from '@esotericsoftware/spine-core';
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
   * Helper: Load a Spine instance from JSON, atlas text and image files.
   * This can be used from any PixiJS v8 application.
   */
  static async loadSpineFromFiles(
    jsonText: string,
    atlasText: string,
    imageFiles: File[]
  ): Promise<Spine> {

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

        const pixiTexture = PIXI.Texture.from(img);
        const spineTex = SpineTexture.from(pixiTexture.source);

        page.setTexture(spineTex);

        URL.revokeObjectURL(url);
      } catch (err) {
        console.error(`Failed to load image for atlas page ${page.name}:`, err);
      }
    }

    const atlasLoader = new AtlasAttachmentLoader(textureAtlas);
    const skeletonJson = new SkeletonJson(atlasLoader);
    const skeletonData = skeletonJson.readSkeletonData(JSON.parse(jsonText));

    return new Spine(skeletonData);
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

    const width = maxX - minX;
    const height = maxY - minY;
    const padLeft = width * padding;
    const padRight = width * padding;
    const padTop = height * padding;
    const padBottom = height * padding;

    return {
      x: minX,
      y: minY,
      width,
      height,
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
