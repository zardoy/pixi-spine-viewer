import { Spine as SpineInstance, Spine as SpineClass } from '@esotericsoftware/spine-pixi-v8';
import { SkeletonData } from '@esotericsoftware/spine-core';
import type { TextureSource } from 'pixi.js';
import { SpineDisplay } from './SpineDisplay';
import type { SpineFiles } from '../pages/Index';

function skeletonNameFromFile(f: File): string {
  return f.name.replace(/\.(json|skel)$/i, '');
}

/**
 * File-based Spine loader that implements the SpineLoader interface
 * for use with the SpineBase component. Supports single or multiple skeletons (shared atlas).
 */
export class FileSpineLoader {
  private skeletonDataCache: Map<string, SkeletonData> = new Map();
  private textureSourcesCache: Map<string, TextureSource[]> = new Map();
  private loadingPromises: Map<string, Promise<void>> = new Map();

  private mode: 'single' | 'multi';
  private skeletonData?: string | ArrayBuffer | Uint8Array;
  private skeletonFiles?: File[];
  private atlasText: string;
  private imageFiles: File[];
  private defaultSkeletonName?: string;

  /** When true, logs load pipeline stages. Set before loadSpine. */
  static debugLoad = false;

  constructor(
    skeletonDataOrFiles: string | ArrayBuffer | Uint8Array | SpineFiles,
    atlasTextOrUndefined?: string,
    imageFilesOrUndefined?: File[]
  ) {
    if (typeof skeletonDataOrFiles === 'object' && skeletonDataOrFiles !== null && 'jsonFile' in skeletonDataOrFiles) {
      const files = skeletonDataOrFiles as SpineFiles;
      this.mode = files.skeletonFiles && files.skeletonFiles.length > 1 ? 'multi' : 'single';
      this.atlasText = atlasTextOrUndefined!;
      this.imageFiles = files.imageFiles;
      if (this.mode === 'multi') {
        this.skeletonFiles = files.skeletonFiles!;
        this.defaultSkeletonName = skeletonNameFromFile(files.jsonFile);
      } else {
        this.skeletonData = files.jsonFile as unknown as string | ArrayBuffer;
      }
    } else {
      this.mode = 'single';
      this.skeletonData = skeletonDataOrFiles as string | ArrayBuffer | Uint8Array;
      this.atlasText = atlasTextOrUndefined!;
      this.imageFiles = imageFilesOrUndefined!;
    }
  }

  private cacheKey(spineKey: string, skeleton?: string): string {
    return skeleton ? `${spineKey}:${skeleton}` : spineKey;
  }

  /**
   * Load skeleton data for a spine key (caches the result).
   * Spine key can be "key" or "key/skeleton" for multi-skeleton (skeleton = filename without ext).
   */
  async loadSpine(spineKey: string): Promise<void> {
    const [baseKey, skeleton] = spineKey.includes('/') ? spineKey.split('/', 2) : [spineKey, undefined];
    const key = this.cacheKey(baseKey, skeleton);
    if (this.skeletonDataCache.has(key)) return;

    const existingPromise = this.loadingPromises.get(key);
    if (existingPromise) return existingPromise;

    if (FileSpineLoader.debugLoad) {
      SpineDisplay.spineLoadDebug = true;
    }

    const loadPromise = (async () => {
      try {
        let data: string | ArrayBuffer | Uint8Array;
        if (this.mode === 'multi' && this.skeletonFiles) {
          const name = skeleton || this.defaultSkeletonName;
          const file = this.skeletonFiles.find((f) => skeletonNameFromFile(f) === name);
          if (!file) throw new Error(`Skeleton not found: ${name}`);
          const isSkel = file.name.toLowerCase().endsWith('.skel');
          data = isSkel ? await file.arrayBuffer() : await file.text();
        } else {
          data = this.skeletonData!;
        }
        const result = await SpineDisplay.loadSpineDataFromFiles(
          data,
          this.atlasText,
          this.imageFiles
        );
        this.skeletonDataCache.set(key, result.skeletonData);
        this.textureSourcesCache.set(key, result.textureSources);
        this.loadingPromises.delete(key);
        if (FileSpineLoader.debugLoad) {
          console.log(`[FileSpineLoader] Cached ${result.textureSources.length} texture source(s) for preload`);
        }
      } catch (error) {
        this.loadingPromises.delete(key);
        throw error;
      } finally {
        SpineDisplay.spineLoadDebug = false;
      }
    })();

    this.loadingPromises.set(key, loadPromise);
    return loadPromise;
  }

  getTextureSourcesForPreload(spineKey: string): TextureSource[] | undefined {
    const [baseKey, skeleton] = spineKey.includes('/') ? spineKey.split('/', 2) : [spineKey, undefined];
    const key = this.cacheKey(baseKey, skeleton);
    return this.textureSourcesCache.get(key);
  }

  createSpine(spineKey: string, options?: Record<string, unknown>): {
    spine: SpineInstance
    x?: number
    y?: number
    scale?: number
  } {
    const [baseKey, skeleton] = spineKey.includes('/') ? spineKey.split('/', 2) : [spineKey, undefined];
    const key = this.cacheKey(baseKey, skeleton);
    const skeletonData = this.skeletonDataCache.get(key);
    if (!skeletonData) {
      throw new Error(`Skeleton data not loaded for key: ${key}. Call loadSpine() first.`);
    }
    const spine = new SpineClass({ skeletonData, ...options });
    return { spine };
  }

  getSkeletonData(spineKey: string): SkeletonData | undefined {
    const [baseKey, skeleton] = spineKey.includes('/') ? spineKey.split('/', 2) : [spineKey, undefined];
    const key = this.cacheKey(baseKey, skeleton);
    return this.skeletonDataCache.get(key);
  }

  /** When multi-skeleton, returns list of skeleton names (filename without ext). */
  getAvailableSkeletonNames(): string[] | null {
    if (this.mode !== 'multi' || !this.skeletonFiles) return null;
    return this.skeletonFiles.map(skeletonNameFromFile);
  }
}
