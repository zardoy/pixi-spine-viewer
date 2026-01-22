import '@pixi/layout'
import { useEffect, useRef, useState } from "react";
import { Container, Graphics, Text } from "pixi.js";
import { Physics } from "@esotericsoftware/spine-core";
import { Application, useExtend, useApplication } from "@pixi/react";
import { useSnapshot, ref } from "valtio";
import { SpineDisplay } from "../lib/SpineDisplay";
import { SpineDebugRenderer } from '../lib/SpineDebugRenderer';
import { toast } from "sonner";
import { spineViewerStore } from "../store/spineViewerStore";
import { SpineBase } from "../lib/SpineBase";
import { FileSpineLoader } from "../lib/FileSpineLoader";
import { Spine as SpineInstance } from "@esotericsoftware/spine-pixi-v8";

const SPINE_KEY = 'viewer-spine'; // Single key for the viewer

const PixiAppContent = () => {
  // useExtend must be used within Application context
  useExtend({ Container, Graphics, Text });

  const app = useApplication();
  const state = useSnapshot(spineViewerStore);
  const containerRef = useRef<Container>(null);
  const spineRef = useRef<SpineInstance | null>(null);
  const fileSpineLoaderRef = useRef<FileSpineLoader | null>(null);
  const [isLoaderReady, setIsLoaderReady] = useState(false);
  const viewportTransitionTime = 0.25;
  const boundsGraphicsRef = useRef<Graphics | null>(null);
  const boundsTextRef = useRef<Text | null>(null);

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

  // Initialize file loader and load files
  useEffect(() => {
    console.log('[PixiApp] Init loader effect:', {
      hasFiles: !!state.files,
      isLoaderReady,
      files: state.files ? 'present' : 'null'
    });

    if (!state.files || isLoaderReady) {
      console.log('[PixiApp] Skipping init loader:', { hasFiles: !!state.files, isLoaderReady });
      return;
    }

    const initLoader = async () => {
      try {
        console.log('[PixiApp] Starting loader initialization...');
        const files = spineViewerStore.files!;

        // Read atlas and skeleton file (JSON or binary .skel)
        console.log('[PixiApp] Reading files...');
        const atlasText = await files.atlasFile.text();

        // Detect if skeleton file is binary (.skel) or JSON
        const isSkelFile = files.jsonFile.name.toLowerCase().endsWith('.skel');
        let skeletonData: string | ArrayBuffer;

        if (isSkelFile) {
          skeletonData = await files.jsonFile.arrayBuffer();
          console.log('[PixiApp] Detected .skel binary file');
        } else {
          skeletonData = await files.jsonFile.text();
          console.log('[PixiApp] Detected .json text file');
        }

        spineViewerStore.refs.spineData = { skeletonData, atlasText };
        spineViewerStore.refs.imageFiles = ref(files.imageFiles);

        // Create file-based spine loader
        console.log('[PixiApp] Creating FileSpineLoader...');
        const loader = new FileSpineLoader(skeletonData, atlasText, files.imageFiles);
        fileSpineLoaderRef.current = loader;

        // Load skeleton data
        console.log('[PixiApp] Loading skeleton data...');
        await loader.loadSpine(SPINE_KEY);
        console.log('[PixiApp] Skeleton data loaded, setting isLoaderReady to true');

        setIsLoaderReady(true);
        console.log('[PixiApp] Loader initialization complete');
      } catch (error) {
        console.error('[PixiApp] Error initializing spine loader:', error);
        toast.error('Failed to load Spine files: ' + (error as Error).message);
      }
    };

    void initLoader();
  }, [state.files, isLoaderReady]);

  // Sync spineRef to store - handled in handleSpineLoaded callback instead

  const wasSpineLoaded = useRef(false)

  // Handle spine loaded - extract animations/skins and do initial setup
  const handleSpineLoaded = (spine: SpineInstance) => {
    if (wasSpineLoaded.current) {
      return;
    }
    wasSpineLoaded.current = true;

    console.log('[PixiApp] handleSpineLoaded called', {
      hasApp: !!app.app,
      appScreen: app.app ? { width: app.app.screen.width, height: app.app.screen.height } : null,
      spineState: spine.state.timeScale,
      currentTrack: spine.state.tracks[0]?.animation?.name
    });

    // Sync spine to store (use the spine instance directly from callback)
    spineViewerStore.refs.spine = ref(spine);

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

      // Use URL animation if valid, otherwise use first
      const initialAnimation = urlAnimation && availableAnimations.includes(urlAnimation)
        ? urlAnimation
        : availableAnimations[0];

      if (availableAnimations.length > 0 && initialAnimation) {
        const anim = data.findAnimation?.(initialAnimation);

        if (anim) {
          // Calculate viewport for first animation
          const viewport = SpineDisplay.calculateAnimationViewport(anim, spine, 0.1);
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

            console.log('Auto-fit scale:', fitScale, 'Viewport:', viewport);
          } else {
            console.warn('Invalid scale calculated, using default scale 1.0');
            spineViewerStore.ui.scale = 1.0;
            spineViewerStore.ui.spinePosition = {
              x: app.app.screen.width / 2,
              y: app.app.screen.height / 2,
            };
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
      if (!spineViewerStore.refs.spine || !app.app) return;

      // Update timeline (loop resets are handled by handleAnimationComplete callback)
      const track = spineViewerStore.refs.spine.state.tracks[0];
      if (track) {
        spineViewerStore.ui.timeline = track.getAnimationTime();
      }

      // Update FPS from ticker
      if (app.app.ticker) {
        const currentFps = app.app.ticker.FPS ?? 0;
        spineViewerStore.ui.fps = currentFps;
      }

      // Handle smooth viewport transitions on animation change
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
  }, [app.app, state.refs.spine]); // Watch for spine changes using snapshot

  // Update animation when selected animation changes
  useEffect(() => {
    const spine = spineViewerStore.refs.spine;
    if (!spine || !state.ui.selectedAnimation || !app.app) return;

    const spineState = spine.state;

    // Add null checks for skeleton
    if (!spine.skeleton || !spine.skeleton.data) {
      console.warn('Skeleton not ready for animation switch');
      return;
    }

    const data: any = spine.skeleton.data;
    const anim = data.findAnimation?.(state.ui.selectedAnimation);

    if (anim) {
      spineViewerStore.ui.timelineDuration = anim.duration ?? 0;
      spineViewerStore.ui.timeline = 0;

      // Calculate viewport BEFORE setting animation (official Spine player approach)
      // This temporarily modifies the skeleton, but setAnimation will restore it
      const newViewport = SpineDisplay.calculateAnimationViewport(anim, spine, 0.1);

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

        // Update position immediately (ticker will handle smooth interpolation)
        const viewportCenterX = newViewport.x + newViewport.width / 2;
        const viewportCenterY = newViewport.y + newViewport.height / 2;
        const scale = spineViewerStore.ui.scale;
        if (app.app) {
          spineViewerStore.ui.spinePosition = {
            x: app.app.screen.width / 2 - viewportCenterX * scale,
            y: app.app.screen.height / 2 - viewportCenterY * scale,
          };
        }

        console.log('Animation switched to:', state.ui.selectedAnimation, 'New viewport:', newViewport);
      } else {
        console.warn('Invalid viewport calculated for animation:', state.ui.selectedAnimation, newViewport);
        // Keep current viewport, don't transition
      }

      // Now set the animation - this restores skeleton to proper state
      if (state.ui.smoothSwitch && !state.ui.loop) {
        // Queue next animation after current non-looping one
        spineState.addAnimation(0, state.ui.selectedAnimation, state.ui.loop, 0);
      } else {
        spineState.setAnimation(0, state.ui.selectedAnimation, state.ui.loop);
      }

      // Immediately apply the new animation state to prevent visual glitch
      // Update with delta 0 to just apply the initial pose of the new animation
      spineState.update(0);
      spineState.apply(spine.skeleton);
      spine.skeleton.updateWorldTransform(Physics.update);
    }
    // Intentionally NOT depending on smoothSwitch to avoid resetting animation when toggled
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.ui.selectedAnimation, state.ui.loop]);

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
    let cancelled = false;

    (async () => {
      if (cancelled || !spineViewerStore.refs.spine) return;

      if (state.ui.debugBones) {
        const currentSpine = spineViewerStore.refs.spine;
        if (!(currentSpine.debug instanceof SpineDebugRenderer)) {
          currentSpine.debug = new SpineDebugRenderer();
        }
      } else {
        const currentSpine = spineViewerStore.refs.spine;
        // Only clear debug if it's our debug renderer
        if (currentSpine && currentSpine.debug instanceof SpineDebugRenderer) {
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

  // Handle animation complete (fires even when looping) - memoized to prevent re-renders
  const handleAnimationComplete = () => {
    if (!spineViewerStore.ui.loop) {
      spineViewerStore.ui.isPlaying = false;
    }
    spineViewerStore.ui.timeline = 0;
  }

  // Use position from store (updated in ticker for smooth transitions)
  const position = state.ui.spinePosition;

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
    <pixiContainer ref={containerRef}>
      <SpineBase
      // key={count}

        spine={SPINE_KEY}
        animation={state.ui.selectedAnimation}
        loop={state.ui.loop}
        timeScale={state.ui.speed}
        playing={state.ui.isPlaying}
        startPlaying={state.ui.isPlaying}
        skin={state.ui.selectedSkin}
        mixTime={state.ui.mixTime}
        scale={{ x: state.ui.scale, y: state.ui.scale }}
        x={position.x}
        y={position.y}
        spineLoader={fileSpineLoaderRef.current}
        spineRef={spineRef}
        onSpineLoaded={handleSpineLoaded}
        onCurrentAnimComplete={handleAnimationComplete}
        layout={undefined}
      />
    </pixiContainer>
  );
};

export const PixiApp = () => {
  const canvasWrapperRef = useRef<HTMLDivElement>(null);
  const state = useSnapshot(spineViewerStore);

  // Convert hex background color to number
  const bgColor = state.ui.backgroundColor.replace('#', '');
  const backgroundColor = parseInt(bgColor, 16);

  return (
    <div ref={canvasWrapperRef} className="flex-1">
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
