import { proxy } from 'valtio';
import { Container, Application as PIXIApplication } from 'pixi.js';
import { Spine } from '@esotericsoftware/spine-pixi-v8';
import { AnimationViewport } from '../lib/SpineDisplay';
import { SpineFiles } from '../pages/Index';

export interface SyncedDirHandles {
  jsonHandle: FileSystemFileHandle;
  atlasHandle: FileSystemFileHandle;
  imageHandles: FileSystemFileHandle[];
}

export interface SpineViewerState {
  refs: {
    container: Container | null;
    app: PIXIApplication | null;
    spine: Spine | null;
    stressTestRunning: boolean;
    perfSpines: Spine[];
    spineData: { skeletonData: string | ArrayBuffer; atlasText: string } | null;
    imageFiles: File[] | null;
    currentViewport: AnimationViewport | null;
    previousViewport: AnimationViewport | null;
    viewportTransitionStart: number;
    /** Raw handles (ref-wrapped to avoid proxy breaking getFile() this context) */
    syncedDirHandles: SyncedDirHandles | null;
  };

  ui: {
    isPlaying: boolean;
    loop: boolean;
    speed: number;
    scale: number;
    timeline: number;
    timelineDuration: number;
    debugBones: boolean;
    debugBounds: boolean;
    selectedAnimation: string;
    previousAnimation: string;
    animations: string[];
    /** Second spine animations */
    secondAnimations: string[];
    /** Second spine animation (null = follow first spine) */
    secondSelectedAnimation: string | null;
    selectedSkin: string;
    skins: string[];
    infoPanelPos: { x: number; y: number };
    fps: number;
    fpsRendered: number;
    backgroundColor: string;
    mixTime: number;
    spinePosition: { x: number; y: number };
    /** Positioning mode: 'auto' or 'manual' */
    positioningMode: 'auto' | 'manual';
    /** Manual mode settings */
    manualPosition: { x: number; y: number };
    manualGuideSize: { width: number; height: number };
    attachmentTestPanelVisible: boolean;
    attachmentTestPanelPos: { x: number; y: number };
    selectedAttachmentSlot: string;
    availableAttachmentSlots: string[];
    resetCounter: number;
    mountCount: number;
    particleGeneratorPanelVisible: boolean;
    particleGeneratorPanelPos: { x: number; y: number } | null;
    showSpawnBounds: boolean;
    spawnBounds: { x: [number, number]; y: [number, number] } | null;
  };

  files: SpineFiles | null;
  /** Second spine files for comparison */
  secondFiles: SpineFiles | null;
  /** Offset for second spine (x, y, scale) */
  secondSpineOffset: { x: number; y: number; scale: number };
  /** Opacity for second spine (0-1) */
  secondSpineOpacity: number;
  /** When true, we poll for JSON changes and reload on change (handles in refs.syncedDirHandles) */
  syncedDir: boolean | null;
  /** When reloading from synced dir, preserve this animation */
  reloadPreserveAnimation: string | null;
}

export const initialState: SpineViewerState = {
  refs: {
    container: null,
    app: null,
    spine: null,
    stressTestRunning: false,
    perfSpines: [],
    spineData: null,
    imageFiles: null,
    currentViewport: null,
    previousViewport: null,
    viewportTransitionStart: 0,
    syncedDirHandles: null,
  },
  ui: {
    isPlaying: true,
    loop: true,
    speed: 1.0,
    scale: 1.0,
    timeline: 0,
    timelineDuration: 0,
    debugBones: false,
    debugBounds: false,
    selectedAnimation: '',
    previousAnimation: '',
    animations: [],
    secondAnimations: [],
    secondSelectedAnimation: null,
    selectedSkin: '',
    skins: [],
    infoPanelPos: { x: 0, y: 0 },
    fps: 0,
    fpsRendered: 0,
    backgroundColor: '#1a1625',
    mixTime: 0.25,
    spinePosition: { x: 0, y: 0 },
    positioningMode: 'auto',
    manualPosition: { x: 100, y: 100 },
    manualGuideSize: { width: 800, height: 600 },
    attachmentTestPanelVisible: false,
    attachmentTestPanelPos: { x: 0, y: 0 },
    selectedAttachmentSlot: '',
    availableAttachmentSlots: [],
    resetCounter: 0,
    mountCount: 0,
    particleGeneratorPanelVisible: false,
    particleGeneratorPanelPos: null,
    showSpawnBounds: false,
    spawnBounds: null,
  },
  files: null,
  secondFiles: null,
  secondSpineOffset: { x: 0, y: 0, scale: 1 },
  secondSpineOpacity: 1,
  syncedDir: null,
  reloadPreserveAnimation: null,
};

export const spineViewerStore = proxy<SpineViewerState>(structuredClone(initialState));

export function resetSpineViewerState(): void {
  const fresh = structuredClone(initialState);
  Object.assign(spineViewerStore.refs, fresh.refs);
  Object.assign(spineViewerStore.ui, fresh.ui);
  spineViewerStore.files = fresh.files;
  spineViewerStore.secondFiles = fresh.secondFiles;
  spineViewerStore.secondSpineOffset = fresh.secondSpineOffset;
  spineViewerStore.secondSpineOpacity = fresh.secondSpineOpacity;
  spineViewerStore.syncedDir = fresh.syncedDir;
  spineViewerStore.reloadPreserveAnimation = fresh.reloadPreserveAnimation;
}

(window as any).spineViewerStore = spineViewerStore;
(window as any).state = spineViewerStore;
