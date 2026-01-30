import { proxy } from 'valtio';
import { Container, Application as PIXIApplication } from 'pixi.js';
import { Spine } from '@esotericsoftware/spine-pixi-v8';
import { AnimationViewport } from '../lib/SpineDisplay';
import { SpineFiles } from '../pages/Index';

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
    selectedSkin: string;
    skins: string[];
    infoPanelPos: { x: number; y: number };
    fps: number;
    backgroundColor: string;
    mixTime: number;
    spinePosition: { x: number; y: number };
    autocenter: boolean;
    attachmentTestPanelVisible: boolean;
    attachmentTestPanelPos: { x: number; y: number };
    selectedAttachmentSlot: string;
    availableAttachmentSlots: string[];
    resetCounter: number;
  };

  files: SpineFiles | null;
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
    selectedSkin: '',
    skins: [],
    infoPanelPos: { x: 0, y: 0 },
    fps: 0,
    backgroundColor: '#1a1625',
    mixTime: 0.25,
    spinePosition: { x: 0, y: 0 },
    autocenter: true,
    attachmentTestPanelVisible: false,
    attachmentTestPanelPos: { x: 0, y: 0 },
    selectedAttachmentSlot: '',
    availableAttachmentSlots: [],
    resetCounter: 0,
  },
  files: null,
};

export const spineViewerStore = proxy<SpineViewerState>(structuredClone(initialState));

export function resetSpineViewerState(): void {
  const fresh = structuredClone(initialState);
  Object.assign(spineViewerStore.refs, fresh.refs);
  Object.assign(spineViewerStore.ui, fresh.ui);
  spineViewerStore.files = fresh.files;
}

(window as any).spineViewerStore = spineViewerStore;
(window as any).state = spineViewerStore;
