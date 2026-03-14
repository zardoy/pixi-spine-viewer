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
    /** JS heap used in MB (Chrome only) */
    memoryMB: number | null;
    /** Average frame time in ms (computed every second from ticker) */
    frameTimeMs: number | null;
    backgroundColor: string;
    mixTime: number;
    spinePosition: { x: number; y: number };
    /** Positioning mode: 'auto' or 'manual' */
    positioningMode: 'auto' | 'manual';
    /** Manual mode settings */
    manualPosition: { x: number; y: number };
    manualGuideSize: { width: number; height: number };
    /** Guide rect position (fixed); spine offset by manualPosition from this */
    manualGuidePosition: { x: number; y: number };
    /** When true, render the yellow guide border (auto + manual). */
    guideBoundsEnabled: boolean;
    /** When true, auto mode uses max viewport over all animations (lock). */
    autoViewportLock: boolean;
    attachmentTestPanelVisible: boolean;
    attachmentTestPanelPos: { x: number; y: number };
    selectedAttachmentSlot: string;
    availableAttachmentSlots: string[];
    attachmentDownloadModalOpen: boolean;
    resetCounter: number;
    /** When true, increment resetCounter whenever the selected animation changes (so animation starts from beginning with mix). */
    increaseResetCounterOnAnimSwitch: boolean;
    /** When true, play animation in reverse. */
    isReversed: boolean;
    /** After switching animation: keep current play state, or force play/pause. */
    actionAfterAnimSwitch: 'same state' | 'force play' | 'force pause';
    mountCount: number;
    particleGeneratorPanelVisible: boolean;
    particleGeneratorPanelPos: { x: number; y: number } | null;
    showSpawnBounds: boolean;
    spawnBounds: { x: [number, number]; y: [number, number] } | null;
    /** Custom events added via N key: { animationName: { eventName: time } } */
    customEvents: Record<string, Record<string, number>>;
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
    memoryMB: null,
    frameTimeMs: null,
    backgroundColor: '#404040',
    mixTime: 0.25,
    spinePosition: { x: 0, y: 0 },
    positioningMode: 'auto',
    manualPosition: { x: 0, y: 0 },
    manualGuideSize: { width: 800, height: 600 },
    manualGuidePosition: { x: 0, y: 0 },
    guideBoundsEnabled: false,
    autoViewportLock: false,
    attachmentTestPanelVisible: false,
    attachmentTestPanelPos: { x: 0, y: 0 },
    selectedAttachmentSlot: '',
    availableAttachmentSlots: [],
    attachmentDownloadModalOpen: false,
    resetCounter: 0,
    increaseResetCounterOnAnimSwitch: false,
    isReversed: false,
    actionAfterAnimSwitch: 'same state',
    mountCount: 0,
    particleGeneratorPanelVisible: false,
    particleGeneratorPanelPos: null,
    showSpawnBounds: false,
    spawnBounds: null,
    customEvents: {},
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

/** Apply playback state after animation switch based on actionAfterAnimSwitch. */
export function applyActionAfterAnimSwitch(): void {
  const action = spineViewerStore.ui.actionAfterAnimSwitch;
  if (action === 'force play') spineViewerStore.ui.isPlaying = true;
  else if (action === 'force pause') spineViewerStore.ui.isPlaying = false;
}

(window as any).spineViewerStore = spineViewerStore;
(window as any).state = spineViewerStore;
