import { Spine as SpineInstance, Spine as SpineClass } from '@esotericsoftware/spine-pixi-v8';
import { SkeletonData } from '@esotericsoftware/spine-core';
import { SpineDisplay } from './SpineDisplay';

/**
 * File-based Spine loader that implements the SpineLoader interface
 * for use with the SpineBase component
 */
export class FileSpineLoader {
  private skeletonDataCache: Map<string, SkeletonData> = new Map();
  private loadingPromises: Map<string, Promise<void>> = new Map();

  constructor(
    private skeletonData: string | ArrayBuffer | Uint8Array,
    private atlasText: string,
    private imageFiles: File[]
  ) {}

  /**
   * Load skeleton data for a spine key (caches the result)
   */
  async loadSpine(spineKey: string): Promise<void> {
    // If already cached, return immediately
    if (this.skeletonDataCache.has(spineKey)) {
      return;
    }

    // If already loading, return the existing promise
    const existingPromise = this.loadingPromises.get(spineKey);
    if (existingPromise) {
      return existingPromise;
    }

    // Start loading
    const loadPromise = (async () => {
      try {
        const skeletonData = await SpineDisplay.loadSpineDataFromFiles(
          this.skeletonData,
          this.atlasText,
          this.imageFiles
        );
        this.skeletonDataCache.set(spineKey, skeletonData);
        this.loadingPromises.delete(spineKey);
      } catch (error) {
        this.loadingPromises.delete(spineKey);
        throw error;
      }
    })();

    this.loadingPromises.set(spineKey, loadPromise);
    return loadPromise;
  }

  /**
   * Create a new Spine instance from cached skeleton data
   */
  createSpine(spineKey: string, options?: any): SpineInstance {
    const skeletonData = this.skeletonDataCache.get(spineKey);
    if (!skeletonData) {
      throw new Error(`Skeleton data not loaded for key: ${spineKey}. Call loadSpine() first.`);
    }

    const spine = new SpineClass({
      skeletonData,
      ...options,
    });

    return spine;
  }

  /**
   * Get cached skeleton data (for accessing animations, skins, etc.)
   */
  getSkeletonData(spineKey: string): SkeletonData | undefined {
    return this.skeletonDataCache.get(spineKey);
  }
}
