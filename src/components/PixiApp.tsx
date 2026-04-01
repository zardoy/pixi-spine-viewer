import '@pixi/layout';
import { useEffect, useRef, useState, useCallback } from "react";
import { Container, Graphics, Text } from "pixi.js";
import { Physics, RegionAttachment, MeshAttachment } from "@esotericsoftware/spine-core";
import { Application, useExtend, useApplication } from "@pixi/react";
import { useSnapshot, ref } from "valtio";
import { SpineDisplay } from "../lib/SpineDisplay";
import { SpineDebugRenderer } from '../lib/SpineDebugRenderer';
import { toast } from "sonner";
import { spineViewerStore } from "../store/spineViewerStore";
import { setGlobalDebugMode, SpineBase } from "../lib/SpineBase";
import { FileSpineLoader } from "../lib/FileSpineLoader";
import { Spine as SpineInstance } from "@esotericsoftware/spine-pixi-v8";
import { globalController } from '@/components/globalController';

setGlobalDebugMode('texture-sizes')

const SPINE_KEY = 'viewer-spine'; // Single key for the viewer
const SECOND_SPINE_KEY = 'viewer-spine-2'; // Key for second spine

const PixiAppContent = () => {
  // useExtend must be used within Application context
  useExtend({ Container, Graphics, Text });

  const app = useApplication();
  const state = useSnapshot(spineViewerStore);
  const containerRef = useRef<Container>(null);
  const spinesContainerRef = useRef<Container>(null); // Shared container for both spines (scale applied here)
  const spineRef = useRef<SpineInstance | null>(null);
  const fileSpineLoaderRef = useRef<FileSpineLoader | null>(null);
  const secondFileSpineLoaderRef = useRef<FileSpineLoader | null>(null);
  const [isLoaderReady, setIsLoaderReady] = useState(false);
  const [isSecondLoaderReady, setIsSecondLoaderReady] = useState(false);
  const viewportTransitionTime = 0.25;
  const boundsGraphicsRef = useRef<Graphics | null>(null);
  const boundsTextRef = useRef<Text | null>(null);
  const spawnBoundsGraphicsRef = useRef<Graphics | null>(null);
  const guideGraphicsRef = useRef<Graphics | null>(null);
  const attachmentTestGraphicsRef = useRef<Graphics | null>(null);
  const wasSpineLoaded = useRef(false);
  const lastPositioningModeRef = useRef<'auto' | 'manual' | undefined>(undefined);
  const fpsCounterRef = useRef<number>(0);
  const fpsLastSecondRef = useRef<number>(performance.now());
  const frameTimeSumRef = useRef<number>(0);

  // Sync container ref to store (wrapped in ref() to prevent proxying)
  useEffect(() => {
    if (containerRef.current) {
      spineViewerStore.refs.container = ref(containerRef.current);
    }
  }, []);

  // Expose app instance to store (wrapped in ref() to prevent proxying)
  useEffect(() => {
    if (app.app) {
      spineViewerStore.refs.app = ref(app.app);
    }
  }, [app.app]);

  // Reset loader when files become null (user goes back)
  useEffect(() => {
    if (!state.files && isLoaderReady) {
      console.log('[PixiApp] Files cleared, resetting loader');
      setIsLoaderReady(false);
      fileSpineLoaderRef.current = null;
    }
  }, [state.files, isLoaderReady]);

  // Reset second loader when secondFiles become null
  useEffect(() => {
    if (!state.secondFiles && isSecondLoaderReady) {
      console.log('[PixiApp] Second files cleared, resetting second loader');
      setIsSecondLoaderReady(false);
      secondFileSpineLoaderRef.current = null;
    }
  }, [state.secondFiles, isSecondLoaderReady]);

  // Initialize file loader and load files (re-runs when files change, e.g. synced dir reload)
  useEffect(() => {
    if (!state.files) return;

    wasSpineLoaded.current = false;
    setIsLoaderReady(false);

    const initLoader = async () => {
      try {
        console.log('[PixiApp] Starting loader initialization...');
        const files = spineViewerStore.files!;

        // Read atlas
        console.log('[PixiApp] Reading files...');
        const atlasText = await files.atlasFile.text();

        const isMultiSkeleton = files.skeletonFiles && files.skeletonFiles.length > 1;
        let loader: FileSpineLoader;

        if (isMultiSkeleton) {
          loader = new FileSpineLoader(files, atlasText);
          spineViewerStore.refs.spineData = { skeletonData: '', atlasText };
          spineViewerStore.refs.imageFiles = ref(files.imageFiles);
        } else {
          const isSkelFile = files.jsonFile.name.toLowerCase().endsWith('.skel');
          const skeletonData = isSkelFile
            ? await files.jsonFile.arrayBuffer()
            : await files.jsonFile.text();
          spineViewerStore.refs.spineData = { skeletonData, atlasText };
          spineViewerStore.refs.imageFiles = ref(files.imageFiles);
          loader = new FileSpineLoader(skeletonData, atlasText, files.imageFiles);
        }

        fileSpineLoaderRef.current = loader;

        // Load skeleton data (use "key/skeleton" format when multi)
        const spineKeyToLoad =
          isMultiSkeleton && state.ui.selectedSkeleton
            ? `${SPINE_KEY}/${state.ui.selectedSkeleton}`
            : SPINE_KEY;
        console.log('[PixiApp] Loading skeleton data...', spineKeyToLoad);
        await loader.loadSpine(spineKeyToLoad);
        console.log('[PixiApp] Skeleton data loaded, setting isLoaderReady to true');

        setIsLoaderReady(true);
        console.log('[PixiApp] Loader initialization complete');
      } catch (error) {
        console.error('[PixiApp] Error initializing spine loader:', error);
        toast.error('Failed to load Spine files: ' + (error as Error).message);
      }
    };

    void initLoader();
  }, [state.files, state.ui.selectedSkeleton]);

  // Initialize second file loader and load second files
  useEffect(() => {
    if (!state.secondFiles) return;

    setIsSecondLoaderReady(false);

    const initSecondLoader = async () => {
      try {
        console.log('[PixiApp] Starting second loader initialization...');
        const files = spineViewerStore.secondFiles!;

        // Read atlas and skeleton file (JSON or binary .skel)
        console.log('[PixiApp] Reading second files...');
        const atlasText = await files.atlasFile.text();

        // Detect if skeleton file is binary (.skel) or JSON
        const isSkelFile = files.jsonFile.name.toLowerCase().endsWith('.skel');
        let skeletonData: string | ArrayBuffer;

        if (isSkelFile) {
          skeletonData = await files.jsonFile.arrayBuffer();
          console.log('[PixiApp] Detected .skel binary file for second spine');
        } else {
          skeletonData = await files.jsonFile.text();
          console.log('[PixiApp] Detected .json text file for second spine');
        }

        // Create file-based spine loader for second spine
        console.log('[PixiApp] Creating second FileSpineLoader...');
        const loader = new FileSpineLoader(skeletonData, atlasText, files.imageFiles);
        secondFileSpineLoaderRef.current = loader;

        // Load skeleton data
        console.log('[PixiApp] Loading second skeleton data...');
        await loader.loadSpine(SECOND_SPINE_KEY);
        console.log('[PixiApp] Second skeleton data loaded, setting isSecondLoaderReady to true');

        // Extract animations from second spine
        const secondSkeletonData = loader.getSkeletonData(SECOND_SPINE_KEY);
        if (secondSkeletonData) {
          const secondAnimations = secondSkeletonData.animations.map((anim: any) => anim.name);
          spineViewerStore.ui.secondAnimations = secondAnimations;
          console.log('[PixiApp] Second spine animations:', secondAnimations);
        }

        setIsSecondLoaderReady(true);
        console.log('[PixiApp] Second loader initialization complete');
      } catch (error) {
        console.error('[PixiApp] Error initializing second spine loader:', error);
        toast.error('Failed to load second Spine files: ' + (error as Error).message);
      }
    };

    void initSecondLoader();
  }, [state.secondFiles]);

  // Poll for JSON changes when synced directory is open
  useEffect(() => {
    const synced = spineViewerStore.refs.syncedDirHandles;
    if (!synced) return;

    let lastJsonHash = "";
    const pollMs = 1000;

    const poll = async () => {
      try {
        const jsonFile = await synced.jsonHandle.getFile();
        const isSkel = jsonFile.name.toLowerCase().endsWith(".skel");
        let hash: string;
        if (isSkel) {
          hash = `${(await jsonFile.arrayBuffer()).byteLength}:binary`;
        } else {
          const text = await jsonFile.text();
          hash = `${text.length}:${text.slice(0, 200)}`;
        }
        if (lastJsonHash && lastJsonHash !== hash) {
          const currentAnim = spineViewerStore.ui.selectedAnimation;
          spineViewerStore.reloadPreserveAnimation = currentAnim || null;

          const jsonFileFresh = await synced.jsonHandle.getFile();
          const atlasFile = await synced.atlasHandle.getFile();
          const imageFiles = await Promise.all(
            synced.imageHandles.map((h) => h.getFile())
          );
          spineViewerStore.files = ref({
            jsonFile: jsonFileFresh,
            atlasFile,
            imageFiles,
          });
          toast.success("Spine reloaded (JSON changed)");
        }
        lastJsonHash = hash;
      } catch (err) {
        console.warn("[Synced dir] Read error:", err);
      }
    };

    const id = setInterval(poll, pollMs);
    poll(); // Initial read to set lastJsonHash
    return () => clearInterval(id);
  }, [state.syncedDir]);

  // Handle spine loaded - extract animations/skins and do initial setup
  const handleSpineLoaded = (spine: SpineInstance) => {
    if (wasSpineLoaded.current) {
      return;
    }
    wasSpineLoaded.current = true;
    lastPositioningModeRef.current = state.ui.positioningMode;

    console.log('[PixiApp] handleSpineLoaded called', {
      hasApp: !!app.app,
      appScreen: app.app ? { width: app.app.screen.width, height: app.app.screen.height } : null,
      spineState: spine.state.timeScale,
      currentTrack: spine.state.tracks[0]?.animation?.name
    });

    // Sync spine to store (use the spine instance directly from callback)
    spineViewerStore.refs.spine = ref(spine);
    (globalThis as any).spine = spine;

    if (!app.app) {
      console.warn('[PixiApp] handleSpineLoaded: app.app is null, returning early');
      return;
    }

    try {
      // Get available animations and skins
      const data: any = spine.skeleton.data;
      const availableAnimations = data.animations.map((anim: any) => anim.name);
      const availableSkins = data.skins.map((skin: any) => skin.name);
      console.log('[PixiApp] Available animations:', availableAnimations);
      console.log('[PixiApp] Available skins:', availableSkins);

      spineViewerStore.ui.animations = availableAnimations;
      spineViewerStore.ui.skins = availableSkins;

      // Check URL params for initial values
      const params = new URLSearchParams(window.location.search);
      const urlAnimation = params.get('animation');
      const urlSkin = params.get('skin');
      const urlTime = params.get('time');

      // Use preserved animation (synced reload), URL, or first
      const preserve = spineViewerStore.reloadPreserveAnimation;
      const initialAnimation =
        preserve && availableAnimations.includes(preserve)
          ? preserve
          : urlAnimation && availableAnimations.includes(urlAnimation)
            ? urlAnimation
            : availableAnimations[0];
      spineViewerStore.reloadPreserveAnimation = null;

      if (availableAnimations.length > 0 && initialAnimation) {
        const anim = data.findAnimation?.(initialAnimation);

        if (anim) {
          if (state.ui.positioningMode === 'auto') {
            // Calculate viewport for first animation (or max over all if locked)
            const viewport =
              spineViewerStore.ui.autoViewportLock
                ? SpineDisplay.calculateMaxAnimationsViewport(spine, 0.1) ??
                  SpineDisplay.calculateAnimationViewport(anim, spine, 0.1)
                : SpineDisplay.calculateAnimationViewport(anim, spine, 0.1);
            spineViewerStore.refs.currentViewport = viewport;

            // Calculate scale to fit viewport in screen
            const viewportWidth = viewport.width + viewport.padLeft + viewport.padRight;
            const viewportHeight = viewport.height + viewport.padTop + viewport.padBottom;

            const scaleX = app.app.screen.width / viewportWidth;
            const scaleY = app.app.screen.height / viewportHeight;
            const fitScale = Math.min(scaleX, scaleY);

            // Validate scale before applying
            if (isFinite(fitScale) && fitScale > 0) {
              spineViewerStore.ui.scale = fitScale;

              // Calculate and store initial position
              const viewportCenterX = viewport.x + viewport.width / 2;
              const viewportCenterY = viewport.y + viewport.height / 2;
              spineViewerStore.ui.spinePosition = {
                x: app.app.screen.width / 2 - viewportCenterX * fitScale,
                y: app.app.screen.height / 2 - viewportCenterY * fitScale,
              };

              // Also store guide rect based on this viewport so manual/auto share same visual bounds.
              spineViewerStore.ui.manualGuideSize = {
                width: viewportWidth,
                height: viewportHeight,
              };
              const pos = spineViewerStore.ui.spinePosition;
              spineViewerStore.ui.manualGuidePosition = {
                x: pos.x,
                y: pos.y,
              };
              // Keep manualPosition equal to the auto-computed spine position for perfect initial switch
              spineViewerStore.ui.manualPosition = { x: pos.x, y: pos.y };

              console.log('Auto-fit scale:', fitScale, 'Viewport:', viewport);
            } else {
              console.warn('Invalid scale calculated, using default scale 1.0');
              spineViewerStore.ui.scale = 1.0;
              spineViewerStore.ui.spinePosition = {
                x: app.app.screen.width / 2,
                y: app.app.screen.height / 2,
              };
            }
          } else {
            // Manual mode - center guide; manualPosition is the absolute position
            spineViewerStore.ui.scale = 1.0;
            const gw = state.ui.manualGuideSize.width;
            const gh = state.ui.manualGuideSize.height;
            const guideX = app.app.screen.width / 2 - gw / 2;
            const guideY = app.app.screen.height / 2 - gh / 2;
            spineViewerStore.ui.manualGuidePosition = {
              x: guideX,
              y: guideY,
            };
            spineViewerStore.ui.manualPosition = { x: guideX, y: guideY };
            spineViewerStore.ui.spinePosition = { x: guideX, y: guideY };
            spineViewerStore.refs.currentViewport = null;
          }

          console.log('[PixiApp] Setting selectedAnimation to:', initialAnimation);
          spineViewerStore.ui.selectedAnimation = initialAnimation;
          spineViewerStore.ui.timelineDuration = anim.duration ?? 0;
          console.log('[PixiApp] Store state after setting animation:', {
            selectedAnimation: spineViewerStore.ui.selectedAnimation,
            isPlaying: spineViewerStore.ui.isPlaying,
            scale: spineViewerStore.ui.scale,
            position: spineViewerStore.ui.spinePosition
          });

          // Set timeline from URL if provided (will be applied after animation is set)
          // Only pause if time is explicitly specified in URL and > 0 (0 means start, so don't pause)
          if (urlTime !== null && urlTime !== '') {
            const initialTime = parseFloat(urlTime);
            if (!isNaN(initialTime) && initialTime > 0 && initialTime <= (anim.duration ?? 0)) {
              spineViewerStore.ui.timeline = initialTime;
              spineViewerStore.ui.isPlaying = false;
              console.log('[PixiApp] URL time parameter detected:', initialTime, 'pausing animation');

              // Apply timeline immediately
              const track = spine.state.tracks[0];
              if (track) {
                track.trackTime = initialTime;
                track.trackEnd = initialTime;
                spine.state.apply(spine.skeleton);
                spine.skeleton.updateWorldTransform(Physics.update);
              }
            } else {
              // Invalid or 0 time - just reset to 0 and keep playing
              spineViewerStore.ui.timeline = 0;
              spineViewerStore.ui.isPlaying = true;
              console.log('[PixiApp] URL time parameter invalid or 0, starting from beginning');
            }
          } else {
            // No URL time parameter - start from beginning and play
            spineViewerStore.ui.timeline = 0;
            spineViewerStore.ui.isPlaying = true;
            console.log('[PixiApp] No URL time parameter, starting from beginning with playing=true');
          }
        }

        // Set skin from URL if valid, otherwise default
        if (availableSkins.length > 0) {
          const initialSkin = urlSkin && availableSkins.includes(urlSkin)
            ? urlSkin
            : availableSkins.find((s: string) => s === 'default') || availableSkins[0];
          spineViewerStore.ui.selectedSkin = initialSkin;
        }

        toast.success(`Loaded Spine animation with ${availableAnimations.length} animation(s)`);
      } else {
        toast.warning('Spine loaded but no animations found');
      }
    } catch (error) {
      console.error('Error in handleSpineLoaded:', error);
    }
  };

  // Track timeline, FPS, and handle viewport transitions
  useEffect(() => {
    if (!app.app || !state.refs.spine) return;

    const update = () => {
      const spine = spineViewerStore.refs.spine;
      if (!spine || !app.app) return;

      // Skip if spine is destroyed
      if ((spine as any).destroyed) return;

      // Update timeline (loop resets are handled by handleAnimationComplete callback)
      const track = spine.state.tracks[0];
      if (track) {
        const trackTime = track.getAnimationTime();
        if (spineViewerStore.ui.isPlaying) {
          spineViewerStore.ui.timeline = trackTime;
        }
      }

      // FPS is updated via ref in separate effect (see below)

      // Handle smooth viewport transitions on animation change (only when auto mode is enabled)
      if (spineViewerStore.ui.positioningMode !== 'auto') {
        return; // Skip viewport logic when in manual mode
      }

      const currentViewport = spineViewerStore.refs.currentViewport;
      const previousViewport = spineViewerStore.refs.previousViewport;

      if (currentViewport && previousViewport) {
        const elapsed = (performance.now() - spineViewerStore.refs.viewportTransitionStart) / 1000;
        const transitionAlpha = Math.min(elapsed / viewportTransitionTime, 1);

        if (transitionAlpha < 1) {
          // Interpolate between previous and current viewport
          const prev = previousViewport;
          const curr = currentViewport;

          const prevWidth = prev.width + prev.padLeft + prev.padRight;
          const prevHeight = prev.height + prev.padTop + prev.padBottom;

          const currWidth = curr.width + curr.padLeft + curr.padRight;
          const currHeight = curr.height + curr.padTop + curr.padBottom;

          // Interpolate viewport dimensions
          const interpWidth = prevWidth + (currWidth - prevWidth) * transitionAlpha;
          const interpHeight = prevHeight + (currHeight - prevHeight) * transitionAlpha;

          // Calculate scale to fit interpolated viewport
          const scaleX = app.app.screen.width / interpWidth;
          const scaleY = app.app.screen.height / interpHeight;
          const fitScale = Math.min(scaleX, scaleY);

          // Validate scale before applying
          if (isFinite(fitScale) && fitScale > 0) {
            spineViewerStore.ui.scale = fitScale;

            // Calculate and store interpolated position
            const prevCenterX = prev.x + prev.width / 2;
            const prevCenterY = prev.y + prev.height / 2;
            const currCenterX = curr.x + curr.width / 2;
            const currCenterY = curr.y + curr.height / 2;

            const interpCenterX = prevCenterX + (currCenterX - prevCenterX) * transitionAlpha;
            const interpCenterY = prevCenterY + (currCenterY - prevCenterY) * transitionAlpha;

            spineViewerStore.ui.spinePosition = {
              x: app.app.screen.width / 2 - interpCenterX * fitScale,
              y: app.app.screen.height / 2 - interpCenterY * fitScale,
            };
          }
        } else {
          // Transition complete, clear previous viewport and update final position
          spineViewerStore.refs.previousViewport = null;

          // Update final position
          if (currentViewport && app.app) {
            const viewportCenterX = currentViewport.x + currentViewport.width / 2;
            const viewportCenterY = currentViewport.y + currentViewport.height / 2;
            const scale = spineViewerStore.ui.scale;
            spineViewerStore.ui.spinePosition = {
              x: app.app.screen.width / 2 - viewportCenterX * scale,
              y: app.app.screen.height / 2 - viewportCenterY * scale,
            };
          }
        }
      } else {
        // No transition, just update position based on current viewport
        if (currentViewport && app.app) {
          const viewportCenterX = currentViewport.x + currentViewport.width / 2;
          const viewportCenterY = currentViewport.y + currentViewport.height / 2;
          const scale = spineViewerStore.ui.scale;
          spineViewerStore.ui.spinePosition = {
            x: app.app.screen.width / 2 - viewportCenterX * scale,
            y: app.app.screen.height / 2 - viewportCenterY * scale,
          };
        }
      }
    };

    app.app.ticker.add(update);

    return () => {
      if (app.app?.ticker) {
        app.app.ticker.remove(update);
      }
    };
  }, [app.app, state.refs.spine, state.ui.positioningMode]); // Watch for spine changes and positioning mode

  // FPS and frame time: measure each frame via ticker, average every second
  useEffect(() => {
    if (!app.app) return;

    const updateFps = () => {
      const ticker = app.app?.ticker;
      if (!ticker) return;

      const currentFps = ticker.FPS ?? 0;

      // Update ref for frequent DOM updates (no React re-render)
      const fpsElement = (window as any).__fpsRef;
      if (fpsElement) {
        fpsElement.textContent = currentFps.toFixed(1);
      }

      // Accumulate frame time (elapsedMS = raw ms per frame, uncapped)
      const elapsedMS = (ticker as { elapsedMS?: number }).elapsedMS ?? ticker.deltaMS * (1000 / 60);
      frameTimeSumRef.current += elapsedMS;
      fpsCounterRef.current++;

      const now = performance.now();
      if (now - fpsLastSecondRef.current >= 1000) {
        const count = fpsCounterRef.current;
        spineViewerStore.ui.fpsRendered = count;
        spineViewerStore.ui.frameTimeMs = count > 0 ? frameTimeSumRef.current / count : null;
        fpsCounterRef.current = 0;
        frameTimeSumRef.current = 0;
        fpsLastSecondRef.current = now;
        const mem = (performance as unknown as { memory?: { usedJSHeapSize?: number } }).memory?.usedJSHeapSize;
        spineViewerStore.ui.memoryMB = typeof mem === 'number' ? mem / 1024 / 1024 : null;
      }
    };

    app.app.ticker.add(updateFps);

    return () => {
      if (app.app?.ticker) {
        app.app.ticker.remove(updateFps);
      }
    };
  }, [app.app]);

  // Update animation when selected animation changes
  useEffect(() => {
    const spine = spineViewerStore.refs.spine;
    if (!spine || !state.ui.selectedAnimation || !app.app) return;

    // Skip if spine is destroyed
    if ((spine as any).destroyed) return;

    const spineState = spine.state;

    // Add null checks for skeleton
    if (!spine.skeleton || !spine.skeleton.data) {
      console.warn('Skeleton not ready for animation switch');
      return;
    }

    const data: any = spine.skeleton.data;
    const anim = data.findAnimation?.(state.ui.selectedAnimation);

    if (anim) {
      // Callers (Controls, SpineViewer keyboard) already set previousAnimation before
      // changing selectedAnimation. Only handle increaseResetCounterOnAnimSwitch here.
      if (state.ui.previousAnimation && state.ui.previousAnimation !== state.ui.selectedAnimation) {
        if (state.ui.increaseResetCounterOnAnimSwitch) {
          spineViewerStore.ui.resetCounter += 1;
        }
      }

      spineViewerStore.ui.timelineDuration = anim.duration ?? 0;
      spineViewerStore.ui.timeline = 0;

      // Only calculate viewport if auto mode is enabled
      if (state.ui.positioningMode === 'auto') {
        // Calculate viewport BEFORE setting animation (official Spine player approach)
        // This temporarily modifies the skeleton, but setAnimation will restore it
        const newViewport =
          spineViewerStore.ui.autoViewportLock
            ? SpineDisplay.calculateMaxAnimationsViewport(spine, 0.1) ??
              SpineDisplay.calculateAnimationViewport(anim, spine, 0.1)
            : SpineDisplay.calculateAnimationViewport(anim, spine, 0.1);

        // Validate viewport before storing
        const isValidViewport =
          isFinite(newViewport.x) &&
          isFinite(newViewport.y) &&
          isFinite(newViewport.width) &&
          isFinite(newViewport.height) &&
          newViewport.width > 0 &&
          newViewport.height > 0;

        if (isValidViewport) {
          // Store previous viewport for transition
          spineViewerStore.refs.previousViewport = spineViewerStore.refs.currentViewport;
          spineViewerStore.refs.currentViewport = newViewport;
          spineViewerStore.refs.viewportTransitionStart = performance.now();

          // Update position immediately (ticker will handle smooth interpolation) - only in auto mode
          const viewportCenterX = newViewport.x + newViewport.width / 2;
          const viewportCenterY = newViewport.y + newViewport.height / 2;
          const scale = spineViewerStore.ui.scale;
          if (app.app && spineViewerStore.ui.positioningMode === 'auto') {
            spineViewerStore.ui.spinePosition = {
              x: app.app.screen.width / 2 - viewportCenterX * scale,
              y: app.app.screen.height / 2 - viewportCenterY * scale,
            };
          }

          // Keep guide rect (and manualPosition) in sync with auto-computed viewport
          if (app.app && spineViewerStore.ui.positioningMode === 'auto') {
            const viewportWidth = newViewport.width + newViewport.padLeft + newViewport.padRight;
            const viewportHeight = newViewport.height + newViewport.padTop + newViewport.padBottom;
            spineViewerStore.ui.manualGuideSize = {
              width: viewportWidth,
              height: viewportHeight,
            };
            const pos = spineViewerStore.ui.spinePosition;
            spineViewerStore.ui.manualGuidePosition = {
              x: pos.x,
              y: pos.y,
            };
            spineViewerStore.ui.manualPosition = { x: pos.x, y: pos.y };
          }

          console.log('Animation switched to:', state.ui.selectedAnimation, 'New viewport:', newViewport);
        } else {
          console.warn('Invalid viewport calculated for animation:', state.ui.selectedAnimation, newViewport);
          // Keep current viewport, don't transition
        }
      } else {
        // Manual mode - don't update viewport
        spineViewerStore.refs.currentViewport = null;
        spineViewerStore.refs.previousViewport = null;
      }

      // Animation switch is handled by SpineBase via animation prop change.
      // SpineBase automatically applies instant reset behavior when mixTime === 0.
    }
    // Intentionally NOT depending on loop - loop changes handled by SpineBase (track.loop only, no reset)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.ui.selectedAnimation, state.ui.positioningMode, state.ui.autoViewportLock]);

  // Update skin when selected skin changes - handled by SpineBase via skin prop

  // Update play/pause state - handled by SpineBase via playing prop

  // Update speed - handled by SpineBase via timeScale prop

  // Update scale - handled by SpineBase via scale prop

  // Update mix time - handled by SpineBase via mixTime prop

  // Update background color
  useEffect(() => {
    if (app.app) {
      // Convert hex to number for PIXI
      const hex = state.ui.backgroundColor.replace('#', '');
      const color = parseInt(hex, 16);
      app.app.renderer.background.color = color;
    }
  }, [state.ui.backgroundColor, app.app]);

  // Debug bones / attachments
  useEffect(() => {
    const spine = spineViewerStore.refs.spine;
    if (!spine) return;

    // Skip if spine is destroyed
    if ((spine as any).destroyed) return;

    let cancelled = false;

    (async () => {
      const currentSpine = spineViewerStore.refs.spine;
      if (cancelled || !currentSpine) return;
      if ((currentSpine as any).destroyed) return;

      if (state.ui.debugBones) {
        if (!(currentSpine.debug instanceof SpineDebugRenderer)) {
          currentSpine.debug = new SpineDebugRenderer();
        }
      } else {
        // Only clear debug if it's our debug renderer
        if (currentSpine.debug instanceof SpineDebugRenderer) {
          currentSpine.debug = undefined;
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [state.ui.debugBones]);

  // Debug bounds - create/remove graphics and text
  useEffect(() => {
    if (!containerRef.current || !state.ui.debugBounds) {
      // Remove graphics if debug bounds is disabled
      if (boundsGraphicsRef.current && containerRef.current) {
        containerRef.current.removeChild(boundsGraphicsRef.current);
        boundsGraphicsRef.current.destroy();
        boundsGraphicsRef.current = null;
      }
      if (boundsTextRef.current && containerRef.current) {
        containerRef.current.removeChild(boundsTextRef.current);
        boundsTextRef.current.destroy();
        boundsTextRef.current = null;
      }
      return;
    }

    // Create graphics for bounds border
    if (!boundsGraphicsRef.current && containerRef.current) {
      const graphics = new Graphics();
      containerRef.current.addChild(graphics);
      boundsGraphicsRef.current = graphics;
    }

    // Create text for bounds dimensions
    if (!boundsTextRef.current && containerRef.current) {
      const text = new Text({
        text: '',
        style: {
          fontSize: 12,
          fill: 0xff0000,
          fontWeight: 'bold',
        },
      });
      containerRef.current.addChild(text);
      boundsTextRef.current = text;
    }

    return () => {
      if (boundsGraphicsRef.current && containerRef.current) {
        containerRef.current.removeChild(boundsGraphicsRef.current);
        boundsGraphicsRef.current.destroy();
        boundsGraphicsRef.current = null;
      }
      if (boundsTextRef.current && containerRef.current) {
        containerRef.current.removeChild(boundsTextRef.current);
        boundsTextRef.current.destroy();
        boundsTextRef.current = null;
      }
    };
  }, [state.ui.debugBounds]);

  // Update debug bounds rendering
  useEffect(() => {
    if (!app.app || !state.ui.debugBounds) return;

    const updateBounds = () => {
      const spine = spineViewerStore.refs.spine;
      const graphics = boundsGraphicsRef.current;
      const text = boundsTextRef.current;

      if (!spine || !graphics || !text || !containerRef.current) return;

      // Skip if spine is destroyed
      if ((spine as any).destroyed) {
        graphics.clear();
        text.text = '';
        return;
      }

      try {
        // Use the Spine class's built-in bounds property which is already properly calculated
        // This is in skeleton local coordinate space
        const spineBounds = spine.bounds;

        if (!spineBounds || spineBounds.minX === Infinity || spineBounds.maxX === -Infinity) {
          graphics.clear();
          text.text = '';
          return;
        }

        // Calculate local bounds dimensions
        const localX = spineBounds.minX;
        const localY = spineBounds.minY;
        const localWidth = spineBounds.maxX - spineBounds.minX;
        const localHeight = spineBounds.maxY - spineBounds.minY;

        if (!isFinite(localX) || !isFinite(localY) || !isFinite(localWidth) || !isFinite(localHeight)) {
          graphics.clear();
          text.text = '';
          return;
        }

        // The Spine instance is inside SpineBase's container which has:
        // - position: spineViewerStore.ui.spinePosition (x, y)
        // - scale: spineViewerStore.ui.scale
        // The boundsGraphics is added to containerRef which is the parent of SpineBase's container
        // So we need to transform the local bounds through the container's transform
        const containerX = spineViewerStore.ui.spinePosition.x;
        const containerY = spineViewerStore.ui.spinePosition.y;
        const containerScale = spineViewerStore.ui.scale;

        // Transform local bounds to containerRef's coordinate space
        const boundsX = containerX + localX * containerScale;
        const boundsY = containerY + localY * containerScale;
        const boundsWidth = localWidth * containerScale;
        const boundsHeight = localHeight * containerScale;

        // Draw red border rectangle
        graphics.clear();
        graphics.rect(boundsX, boundsY, boundsWidth, boundsHeight);
        graphics.stroke({ color: 0xff0000, width: 2 });

        // Update text with dimensions (in skeleton local space, not scaled)
        text.text = `${localWidth.toFixed(1)} × ${localHeight.toFixed(1)}`;
        text.x = boundsX;
        text.y = boundsY - 16; // Position text above the top-left corner
      } catch (err) {
        console.error('Error updating debug bounds:', err);
        graphics.clear();
        text.text = '';
      }
    };

    // Update on every frame
    app.app.ticker.add(updateBounds);

    return () => {
      if (app.app?.ticker) {
        app.app.ticker.remove(updateBounds);
      }
    };
  }, [app.app, state.ui.debugBounds]);

  // Spawn bounds - create/remove graphics for particle generator spawn area
  useEffect(() => {
    if (!containerRef.current || !state.ui.showSpawnBounds || !state.ui.spawnBounds) {
      if (spawnBoundsGraphicsRef.current && containerRef.current) {
        containerRef.current.removeChild(spawnBoundsGraphicsRef.current);
        spawnBoundsGraphicsRef.current.destroy();
        spawnBoundsGraphicsRef.current = null;
      }
      return;
    }

    if (!spawnBoundsGraphicsRef.current && containerRef.current) {
      const graphics = new Graphics();
      containerRef.current.addChild(graphics);
      spawnBoundsGraphicsRef.current = graphics;
    }

    return () => {
      if (spawnBoundsGraphicsRef.current && containerRef.current) {
        containerRef.current.removeChild(spawnBoundsGraphicsRef.current);
        spawnBoundsGraphicsRef.current.destroy();
        spawnBoundsGraphicsRef.current = null;
      }
    };
  }, [state.ui.showSpawnBounds, state.ui.spawnBounds]);

  // Update spawn bounds rendering
  useEffect(() => {
    if (!app.app || !state.ui.showSpawnBounds || !state.ui.spawnBounds) return;

    const updateSpawnBounds = () => {
      const graphics = spawnBoundsGraphicsRef.current;
      if (!graphics || !containerRef.current) return;

      try {
        const spawnBounds = state.ui.spawnBounds!;
        const [minX, maxX] = spawnBounds.x;
        const [minY, maxY] = spawnBounds.y;
        const width = maxX - minX;
        const height = maxY - minY;

        // Transform spawn bounds to screen space (spawn bounds are in skeleton local space)
        const containerX = spineViewerStore.ui.spinePosition.x;
        const containerY = spineViewerStore.ui.spinePosition.y;
        const containerScale = spineViewerStore.ui.scale;

        const boundsX = containerX + minX * containerScale;
        const boundsY = containerY + minY * containerScale;
        const boundsWidth = width * containerScale;
        const boundsHeight = height * containerScale;

        // Draw green border rectangle
        graphics.clear();
        graphics.rect(boundsX, boundsY, boundsWidth, boundsHeight);
        graphics.stroke({ color: 0x00ff00, width: 2 });
      } catch (err) {
        console.error('Error updating spawn bounds:', err);
        graphics.clear();
      }
    };

    app.app.ticker.add(updateSpawnBounds);

    return () => {
      if (app.app?.ticker) {
        app.app.ticker.remove(updateSpawnBounds);
      }
    };
  }, [app.app, state.ui.showSpawnBounds, state.ui.spawnBounds, state.ui.spinePosition, state.ui.scale]);

  // Handle animation complete (fires even when looping)
  // Note: onCurrentAnimComplete doesn't provide parameters, so we use current store values
  const handleAnimationComplete = useCallback(() => {
    const currentAnimation = spineViewerStore.ui.selectedAnimation;
    console.log('animation complete', currentAnimation);

    if (!spineViewerStore.ui.loop) {
      spineViewerStore.ui.isPlaying = false;
      // Keep timeline at end (last frame) so animationProgress stays at 1; don't reset to 0
      spineViewerStore.ui.timeline = spineViewerStore.ui.timelineDuration;
    } else {
      spineViewerStore.ui.timeline = 0;
    }
  }, [state.ui.loop, state.ui.selectedAnimation]);

  // Keyboard handler for 'Y' key to toggle attachment test panel, 'U' for attachment hide panel
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "KeyY" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        spineViewerStore.ui.attachmentTestPanelVisible = !spineViewerStore.ui.attachmentTestPanelVisible;
      }
      if (e.code === "KeyU" && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        spineViewerStore.ui.attachmentHidePanelVisible = !spineViewerStore.ui.attachmentHidePanelVisible;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Create/remove attachment test graphics; add to spine container so SpineBase can set x/y via attachmentsFollow
  useEffect(() => {
    const showPanel = state.ui.attachmentTestPanelVisible;
    const spine = state.refs.spine;

    if (showPanel && spine) {
      // Skip if spine is destroyed
      if ((spine as any).destroyed) return;

      const container = spine.parent;
      if (container && !attachmentTestGraphicsRef.current) {
        const graphics = new Graphics();
        graphics.rect(-5, -5, 10, 10);
        graphics.fill({ color: 0xff0000, alpha: 0.8 });
        container.addChild(graphics);
        attachmentTestGraphicsRef.current = graphics;
      }
    } else {
      if (attachmentTestGraphicsRef.current) {
        const g = attachmentTestGraphicsRef.current;
        g.parent?.removeChild(g);
        g.destroy();
        attachmentTestGraphicsRef.current = null;
      }
    }

    return () => {
      if (attachmentTestGraphicsRef.current) {
        const g = attachmentTestGraphicsRef.current;
        g.parent?.removeChild(g);
        g.destroy();
        attachmentTestGraphicsRef.current = null;
      }
    };
  }, [state.ui.attachmentTestPanelVisible, state.refs.spine]);

  // Hide marker when no slot/bone selected
  useEffect(() => {
    if (attachmentTestGraphicsRef.current) {
      const hasTarget =
        (state.ui.attachmentFollowMode === 'slot' && !!state.ui.selectedAttachmentSlot) ||
        (state.ui.attachmentFollowMode === 'bone' && !!state.ui.selectedAttachmentBone);
      attachmentTestGraphicsRef.current.visible = !!hasTarget;
    }
  }, [state.ui.attachmentFollowMode, state.ui.selectedAttachmentSlot, state.ui.selectedAttachmentBone]);

  // Update available attachment slots, bones, and texture paths in store when spine changes
  useEffect(() => {
    const spine = state.refs.spine;
    if (spine) {
      if ((spine as any).destroyed) {
        spineViewerStore.ui.availableAttachmentSlots = [];
        spineViewerStore.ui.availableBones = [];
        spineViewerStore.ui.availableTextureAttachmentPaths = [];
        return;
      }
      const slots = Array.from(new Set(spine.skeleton.drawOrder.map(slot => slot.data.name)));
      spineViewerStore.ui.availableAttachmentSlots = slots;
      const bones = spine.skeleton.bones.map(b => b.data.name);
      spineViewerStore.ui.availableBones = bones;
      const pathsSet = new Set<string>();
      for (const slot of spine.skeleton.drawOrder) {
        const att = slot.getAttachment();
        if (att && (att instanceof RegionAttachment || att instanceof MeshAttachment)) {
          const path = (att as RegionAttachment).path ?? att.name;
          if (path) pathsSet.add(path);
        }
      }
      spineViewerStore.ui.availableTextureAttachmentPaths = Array.from(pathsSet).sort();
    } else {
      spineViewerStore.ui.availableAttachmentSlots = [];
      spineViewerStore.ui.availableBones = [];
      spineViewerStore.ui.availableTextureAttachmentPaths = [];
    }
  }, [state.refs.spine, state.ui.selectedAnimation, state.ui.selectedSkin]);

  // Sync manual position to spinePosition when in manual mode (manualPosition is absolute)
  useEffect(() => {
    if (state.ui.positioningMode === 'manual') {
      spineViewerStore.ui.spinePosition = {
        x: state.ui.manualPosition.x,
        y: state.ui.manualPosition.y
      };
    }
  }, [state.ui.positioningMode, state.ui.manualPosition.x, state.ui.manualPosition.y]);

  // Use position from store (updated in ticker for smooth transitions when auto mode is enabled)
  const position = state.ui.spinePosition;

  // When switching from auto to manual: use auto-computed values as default (no spine remount)
  useEffect(() => {
    const prevMode = lastPositioningModeRef.current;
    lastPositioningModeRef.current = state.ui.positioningMode;

    if (prevMode === 'auto' && state.ui.positioningMode === 'manual') {
      const viewport = spineViewerStore.refs.currentViewport;
      const pos = spineViewerStore.ui.spinePosition;
      spineViewerStore.ui.manualGuidePosition = { x: pos.x, y: pos.y };
      spineViewerStore.ui.manualPosition = { x: pos.x, y: pos.y };
      if (viewport && app.app) {
        const w = viewport.width + viewport.padLeft + viewport.padRight;
        const h = viewport.height + viewport.padTop + viewport.padBottom;
        spineViewerStore.ui.manualGuideSize = { width: w, height: h };
      }
    }
  }, [state.ui.positioningMode]);

  // const [count, setCount] = useState(0)
  // useEffect(() => {
  //   const interval = setInterval(() => {
  //     setCount(count => count + 1)
  //   }, 100)
  //   return () => clearInterval(interval)
  // }, [])

  if (!fileSpineLoaderRef.current || !isLoaderReady) {
    console.log('[PixiApp] Not rendering SpineBase yet:', {
      hasLoader: !!fileSpineLoaderRef.current,
      isLoaderReady
    });
    return <pixiContainer ref={containerRef} />;
  }

  return (
    <>
      <pixiContainer ref={containerRef}>
        {/* Shared container for both spines - scale is applied here */}
        <pixiContainer
          ref={spinesContainerRef}
          x={position.x}
          y={position.y}
          scale={{ x: state.ui.scale, y: state.ui.scale }}
        >
          <SpineBase
            key={`spine-${state.ui.mountCount}`}
            spine={
              state.files?.skeletonFiles && state.files.skeletonFiles.length > 1 && state.ui.selectedSkeleton
                ? `${SPINE_KEY}/${state.ui.selectedSkeleton}`
                : SPINE_KEY
            }
            animation={state.ui.selectedAnimation}
            loop={state.ui.loop}
            timeScale={state.ui.speed}
            playing={state.ui.isPlaying}
            startPlaying={state.ui.isPlaying}
            startPlayingNoReset={true}
            reverse={state.ui.isReversed}
            skin={state.ui.selectedSkin}
            mixTime={state.ui.mixTime}
            resetCounter={state.ui.resetCounter}
            animationProgress={
              !state.ui.isPlaying && state.ui.timelineDuration > 0
                ? state.ui.timeline / state.ui.timelineDuration
                : undefined
            }
            scale={{ x: 1, y: 1 }}
            scaleAnimationDuration={0}
            x={0}
            y={0}
            spineLoader={fileSpineLoaderRef.current}
            spineRef={spineRef}
            onSpineLoaded={handleSpineLoaded}
            onCurrentAnimComplete={handleAnimationComplete}
            attachmentsFollow={
              (state.ui.attachmentFollowMode === 'slot' && state.ui.selectedAttachmentSlot)
                ? [{ slotName: state.ui.selectedAttachmentSlot, ref: attachmentTestGraphicsRef }]
                : (state.ui.attachmentFollowMode === 'bone' && state.ui.selectedAttachmentBone)
                  ? [{ boneName: state.ui.selectedAttachmentBone, ref: attachmentTestGraphicsRef }]
                  : []
            }
            forceHideAttachmentExact={
              state.ui.hiddenAttachmentPaths.length > 0
                ? [...state.ui.hiddenAttachmentPaths]
                : undefined
            }
            layout={undefined}
            globalController={globalController as any}
            control="spine"
          />
          {/* Second spine - positioned with offset from first spine */}
          {secondFileSpineLoaderRef.current && isSecondLoaderReady && (
            <pixiContainer alpha={state.secondSpineOpacity}>
              <SpineBase
                key={`spine-2-${state.ui.mountCount}`}
                spine={SECOND_SPINE_KEY}
                animation={state.ui.secondSelectedAnimation || state.ui.selectedAnimation}
                loop={state.ui.loop}
                timeScale={state.ui.speed}
                playing={state.ui.isPlaying}
                startPlaying={state.ui.isPlaying}
                startPlayingNoReset={true}
                reverse={state.ui.isReversed}
                skin={state.ui.selectedSkin}
                mixTime={state.ui.mixTime}
                resetCounter={state.ui.resetCounter}
                scale={{ x: state.secondSpineOffset.scale, y: state.secondSpineOffset.scale }}
                scaleAnimationDuration={0}
                x={state.secondSpineOffset.x}
                y={state.secondSpineOffset.y}
                spineLoader={secondFileSpineLoaderRef.current}
                onSpineLoaded={(spine) => {
                  // Extract animations from second spine when it loads
                  const data: any = spine.skeleton.data;
                  const secondAnimations = data.animations.map((anim: any) => anim.name);
                  spineViewerStore.ui.secondAnimations = secondAnimations;
                  console.log('[PixiApp] Second spine loaded, animations:', secondAnimations);
                }}
                onCurrentAnimComplete={handleAnimationComplete}
                layout={undefined}
              />
            </pixiContainer>
          )}
        </pixiContainer>
        {/* Yellow guide border (auto + manual; manual mode just changes how it's computed) */}
        {state.ui.guideBoundsEnabled && (
          <pixiGraphics
            ref={guideGraphicsRef}
            draw={(g) => {
              g.clear();
              const gp = state.ui.manualGuidePosition;
              g.rect(
                gp.x,
                gp.y,
                state.ui.manualGuideSize.width * state.ui.scale,
                state.ui.manualGuideSize.height * state.ui.scale
              );
              g.stroke({ color: 0xffff00, width: 2 });
            }}
          />
        )}
      </pixiContainer>
    </>
  );
};

export const PixiApp = () => {
  const canvasWrapperRef = useRef<HTMLDivElement>(null);
  const state = useSnapshot(spineViewerStore);

  // Convert hex background color to number
  const bgColor = state.ui.backgroundColor.replace('#', '');
  const backgroundColor = parseInt(bgColor, 16);

  return (
    <div ref={canvasWrapperRef} className="h-full w-full">
      <Application
        backgroundColor={backgroundColor}
        resizeTo={canvasWrapperRef}
        antialias
        resolution={window.devicePixelRatio || 1}
        autoDensity
      >
        <PixiAppContent />
      </Application>
    </div>
  );
};
