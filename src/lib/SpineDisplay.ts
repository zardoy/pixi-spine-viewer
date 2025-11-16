import * as PIXI from 'pixi.js';
import { Spine } from '@esotericsoftware/spine-pixi-v8';
import { Container, Graphics } from 'pixi.js';

export interface SpineDisplayOptions {
  width: number;
  height: number;
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
   * Set the Spine instance to display
   * @param spine - The Spine instance
   */
  setSpine(spine: Spine): void {
    if (this.spine) {
      this.removeChild(this.spine);
    }

    this.spine = spine;
    // Center the spine animation
    this.spine.x = this.dimensions.width / 2;
    this.spine.y = this.dimensions.height / 2;
    this.addChild(this.spine);
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
