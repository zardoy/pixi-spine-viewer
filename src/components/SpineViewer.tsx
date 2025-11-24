import { useEffect, useRef, useState } from "react";
import * as PIXI from "pixi.js";
import { Spine } from "@esotericsoftware/spine-pixi-v8";
import { Physics } from "@esotericsoftware/spine-core";
import { Controls } from "./Controls";
import { toast } from "sonner";
import { SpineFiles } from "../pages/Index";
import { Button } from './ui/button';
import { SpineDisplay, AnimationViewport } from "../lib/SpineDisplay";
import { SpineDebugRenderer } from '../lib/SpineDebugRenderer';

interface SpineViewerProps {
  files: SpineFiles;
  onBack: () => void;
}

export const SpineViewer = ({ files, onBack }: SpineViewerProps) => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<PIXI.Application | null>(null);
  const spineRef = useRef<Spine | null>(null);
  const hasInitializedRef = useRef<boolean>(false);
  const stressTestRunningRef = useRef<boolean>(false);
  const perfSpinesRef = useRef<Spine[]>([]);
  const spineDataRef = useRef<{ jsonText: string; atlasText: string } | null>(null);
  const imageFilesRef = useRef<File[] | null>(null);

  const [isPlaying, setIsPlaying] = useState(true);
  const [loop, setLoop] = useState(true);
  const [speed, setSpeed] = useState(1.0);
  const [scale, setScale] = useState(1.0);
  const [smoothSwitch, setSmoothSwitch] = useState(false);
  const [timeline, setTimeline] = useState(0);
  const [timelineDuration, setTimelineDuration] = useState(0);
  const [debugBones, setDebugBones] = useState(false);
  const [selectedAnimation, setSelectedAnimation] = useState<string>("");
  const [animations, setAnimations] = useState<string[]>([]);
  const [infoPanelPos, setInfoPanelPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [fps, setFps] = useState(0);

  // Viewport transition state (for smooth animation switching)
  const currentViewportRef = useRef<AnimationViewport | null>(null);
  const previousViewportRef = useRef<AnimationViewport | null>(null);
  const viewportTransitionStartRef = useRef<number>(0);
  const viewportTransitionTime = 0.25; // 250ms, matching official Spine player default
  const defaultMixTime = 0.25; // Default animation mix/crossfade time

  // Initialize PixiJS and load Spine data
  useEffect(() => {
    if (hasInitializedRef.current) return;
    hasInitializedRef.current = true;

    const initPixi = async () => {
      if (!canvasRef.current) return;

      try {
        // Create PIXI application (v8 uses async init)
        const app = new PIXI.Application();
        await app.init({
          background: '#1a1625',
          resizeTo: canvasRef.current,
          antialias: true,
          resolution: window.devicePixelRatio || 1,
          autoDensity: true,
        });

        if (!canvasRef.current) return;
        canvasRef.current.appendChild(app.canvas);
        appRef.current = app;

        console.log('PIXI Application v8 initialized');

        // Create blob URLs for the files
        const jsonUrl = URL.createObjectURL(files.jsonFile);
        const atlasUrl = URL.createObjectURL(files.atlasFile);

        console.log('Loading Spine data...');
        console.log('JSON:', files.jsonFile.name);
        console.log('Atlas:', files.atlasFile.name);
        console.log('Images:', files.imageFiles.map(f => f.name).join(', '));

        // Read atlas and JSON (also cache for debug tools)
        const atlasText = await files.atlasFile.text();
        const jsonText = await files.jsonFile.text();
        spineDataRef.current = { jsonText, atlasText };
        imageFilesRef.current = files.imageFiles;

        // Load Spine using encapsulated helper (SpineDisplay)
        try {
          const spine = await SpineDisplay.loadSpineFromFiles(
            jsonText,
            atlasText,
            files.imageFiles
          );

          // Position spine in center
          spine.x = app.screen.width / 2;
          spine.y = app.screen.height / 2;

          app.stage.addChild(spine);
          spineRef.current = spine;

          // Set default mix time for smooth animation transitions
          const stateData = spine.state.data;
          stateData.defaultMix = defaultMixTime;

          // Get available animations
          const data: any = spine.skeleton.data;
          const availableAnimations = data.animations.map((anim: any) => anim.name);
          console.log('Available animations:', availableAnimations);
          setAnimations(availableAnimations);

          if (availableAnimations.length > 0) {
            const firstAnimation = availableAnimations[0];
            const anim = data.findAnimation?.(firstAnimation);

            if (anim) {
              // Calculate viewport for first animation
              const viewport = SpineDisplay.calculateAnimationViewport(anim, spine, 0.1);
              currentViewportRef.current = viewport;

              // Calculate scale to fit viewport in screen
              const viewportWidth = viewport.width + viewport.padLeft + viewport.padRight;
              const viewportHeight = viewport.height + viewport.padTop + viewport.padBottom;

              const scaleX = app.screen.width / viewportWidth;
              const scaleY = app.screen.height / viewportHeight;
              const fitScale = Math.min(scaleX, scaleY);

              // Validate scale before applying
              if (isFinite(fitScale) && fitScale > 0) {
                spine.scale.set(fitScale);
                setScale(fitScale);

                // Center the spine based on viewport
                const viewportCenterX = viewport.x + viewport.width / 2;
                const viewportCenterY = viewport.y + viewport.height / 2;
                spine.x = app.screen.width / 2 - viewportCenterX * fitScale;
                spine.y = app.screen.height / 2 - viewportCenterY * fitScale;

                console.log('Auto-fit scale:', fitScale, 'Viewport:', viewport);
              } else {
                console.warn('Invalid scale calculated, using default scale 1.0');
                spine.scale.set(1.0);
                setScale(1.0);
                spine.x = app.screen.width / 2;
                spine.y = app.screen.height / 2;
              }

              setSelectedAnimation(firstAnimation);
              spine.state.setAnimation(0, firstAnimation, true);
              setTimelineDuration(anim.duration ?? 0);
              setTimeline(0);
            }

            toast.success(`Loaded Spine animation with ${availableAnimations.length} animation(s)`);
          } else {
            toast.warning('Spine loaded but no animations found');
          }

          // Clean up blob URLs
          URL.revokeObjectURL(jsonUrl);
          URL.revokeObjectURL(atlasUrl);

        } catch (error) {
          console.error('Error loading Spine data:', error);
          toast.error('Failed to load Spine animation: ' + (error as Error).message);
        }

      } catch (err) {
        console.error("Error initializing PixiJS:", err);
        toast.error("Failed to initialize animation viewer");
      }
    };

    initPixi();

    return () => {
      hasInitializedRef.current = false;

      if (spineRef.current) {
        spineRef.current.destroy();
      }

      // Clean up any performance test spines
      if (appRef.current && perfSpinesRef.current.length) {
        const app = appRef.current;
        for (const s of perfSpinesRef.current) {
          app.stage.removeChild(s);
          s.destroy();
        }
        perfSpinesRef.current = [];
      }

      if (appRef.current) {
        try {
          appRef.current.destroy(true);
        } catch (err) {
          console.error("Error destroying PixiJS app:", err);
        }
      }
    };
  }, []);

  // Update animation when selected animation changes
  useEffect(() => {
    if (!spineRef.current || !selectedAnimation || !appRef.current) return;
    const spine = spineRef.current;
    const state = spine.state;

    // Add null checks for skeleton
    if (!spine.skeleton || !spine.skeleton.data) {
      console.warn('Skeleton not ready for animation switch');
      return;
    }

    const data: any = spine.skeleton.data;
    const anim = data.findAnimation?.(selectedAnimation);

    if (anim) {
      setTimelineDuration(anim.duration ?? 0);
      setTimeline(0);

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
        previousViewportRef.current = currentViewportRef.current;
        currentViewportRef.current = newViewport;
        viewportTransitionStartRef.current = performance.now();
        console.log('Animation switched to:', selectedAnimation, 'New viewport:', newViewport);
      } else {
        console.warn('Invalid viewport calculated for animation:', selectedAnimation, newViewport);
        // Keep current viewport, don't transition
      }

      // Now set the animation - this restores skeleton to proper state
      if (smoothSwitch && !loop) {
        // Queue next animation after current non-looping one
        state.addAnimation(0, selectedAnimation, loop, 0);
      } else {
        state.setAnimation(0, selectedAnimation, loop);
      }

      // Immediately apply the new animation state to prevent visual glitch
      // Update with delta 0 to just apply the initial pose of the new animation
      state.update(0);
      state.apply(spine.skeleton);
      spine.skeleton.updateWorldTransform(Physics.update);
    }
    // Intentionally NOT depending on smoothSwitch to avoid resetting animation when toggled
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAnimation, loop]);

  // Update play/pause state
  useEffect(() => {
    if (spineRef.current) {
      spineRef.current.autoUpdate = isPlaying;
    }
  }, [isPlaying]);

  // Update speed
  useEffect(() => {
    if (spineRef.current) {
      spineRef.current.state.timeScale = speed;
    }
  }, [speed]);

  // Update scale (manual user adjustment)
  useEffect(() => {
    if (spineRef.current) {
      // Manual scale override - just set the scale directly
      spineRef.current.scale.set(scale);
    }
  }, [scale]);

  // Track timeline, FPS, and handle viewport transitions
  useEffect(() => {
    if (!appRef.current || !spineRef.current) return;
    const app = appRef.current;
    const spine = spineRef.current;
    let lastTimeline = -1;
    const lastFpsUpdate = 0;
    const frameCount = 0;
    const fpsTimeAccumulator = 0;

    const update = (deltaTime?: number) => {
      if (!spineRef.current || !appRef.current) return;

      // Update timeline
      const track = spineRef.current.state.tracks[0];
      if (track) {
        const t = track.trackTime ?? (track as any).time ?? 0;
        // Handle loop reset: if timeline jumps backwards significantly, it's a loop
        const timelineDiff = t - lastTimeline;
        const isLoopReset = timelineDiff < -0.5 && lastTimeline > 0.5;

        // Update if significant change OR if it's a loop reset
        if (isLoopReset || Math.abs(timelineDiff) > 0.01) {
          lastTimeline = t;
          setTimeline(t);
        }
      }

      // Update FPS from ticker
      if (app.ticker) {
        const currentFps = app.ticker.FPS ?? 0;
        setFps(currentFps);
      }

      // Handle smooth viewport transitions on animation change
      if (currentViewportRef.current && previousViewportRef.current) {
        const elapsed = (performance.now() - viewportTransitionStartRef.current) / 1000;
        const transitionAlpha = Math.min(elapsed / viewportTransitionTime, 1);

        if (transitionAlpha < 1) {
          // Interpolate between previous and current viewport
          const prev = previousViewportRef.current;
          const curr = currentViewportRef.current;

          const prevWidth = prev.width + prev.padLeft + prev.padRight;
          const prevHeight = prev.height + prev.padTop + prev.padBottom;
          const prevCenterX = prev.x + prev.width / 2;
          const prevCenterY = prev.y + prev.height / 2;

          const currWidth = curr.width + curr.padLeft + curr.padRight;
          const currHeight = curr.height + curr.padTop + curr.padBottom;
          const currCenterX = curr.x + curr.width / 2;
          const currCenterY = curr.y + curr.height / 2;

          // Interpolate viewport dimensions
          const interpWidth = prevWidth + (currWidth - prevWidth) * transitionAlpha;
          const interpHeight = prevHeight + (currHeight - prevHeight) * transitionAlpha;
          const interpCenterX = prevCenterX + (currCenterX - prevCenterX) * transitionAlpha;
          const interpCenterY = prevCenterY + (currCenterY - prevCenterY) * transitionAlpha;

          // Calculate scale to fit interpolated viewport
          const scaleX = app.screen.width / interpWidth;
          const scaleY = app.screen.height / interpHeight;
          const fitScale = Math.min(scaleX, scaleY);

          // Validate scale before applying
          if (isFinite(fitScale) && fitScale > 0) {
            spine.scale.set(fitScale);
            setScale(fitScale);

            // Center based on interpolated viewport
            spine.x = app.screen.width / 2 - interpCenterX * fitScale;
            spine.y = app.screen.height / 2 - interpCenterY * fitScale;
          }
        } else {
          // Transition complete, clear previous viewport
          previousViewportRef.current = null;
        }
      }
    };

    // PIXI v8 ticker callback receives the ticker object
    // deltaTime is in seconds, deltaMS is in milliseconds
    const tickerCallback = (ticker: PIXI.Ticker) => {
      const deltaTime = ticker.deltaMS ?? (ticker.deltaTime ? ticker.deltaTime * 1000 : 0);
      update(deltaTime);
    };

    app.ticker.add(tickerCallback);

    return () => {
      // app.ticker may be nulled by Application.destroy, so guard it
      if (app.ticker) {
        app.ticker.remove(tickerCallback);
      }
    };
  }, [viewportTransitionTime, appRef.current]);

  // Debug bones / attachments
  useEffect(() => {
    if (!spineRef.current) return;
    let cancelled = false;

    (async () => {
      if (cancelled || !spineRef.current) return;

      if (debugBones) {
        const spine = spineRef.current;
        if (!(spine.debug instanceof SpineDebugRenderer)) {
          spine.debug = new SpineDebugRenderer();
        }
      } else {
        const spine = spineRef.current;
        // Only clear debug if it's our debug renderer
        if (spine && spine.debug instanceof SpineDebugRenderer) {
          spine.debug = undefined;
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [debugBones]);

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        setIsPlaying((prev) => !prev);
      } else if (e.code === "KeyR") {
        e.preventDefault();
        onBack();
      } else if (e.code === "KeyT") {
        e.preventDefault();
        setDebugBones((prev) => !prev);
      } else if (e.code === "KeyS") {
        // Restart current animation from start
        if (spineRef.current && selectedAnimation) {
          e.preventDefault();
          const state = spineRef.current.state;
          state.setAnimation(0, selectedAnimation, loop);
          setTimeline(0);
        }
      } else if (e.code.startsWith("Digit")) {
        const digit = parseInt(e.code.replace("Digit", ""), 10);
        if (!Number.isNaN(digit) && digit >= 1 && digit <= 9) {
          const index = digit - 1;
          const anim = animations[index];
          if (anim) {
            e.preventDefault();
            setSelectedAnimation(anim);
          }
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onBack, animations, loop, selectedAnimation]);

  const runStressTest = async () => {
    if (stressTestRunningRef.current) return;
    if (!appRef.current || !spineDataRef.current || !imageFilesRef.current) {
      toast.warning("Viewer not ready for stress test");
      return;
    }

    stressTestRunningRef.current = true;
    const app = appRef.current;
    const { jsonText, atlasText } = spineDataRef.current;
    const imageFiles = imageFilesRef.current;

    try {
      for (let i = 0; i < 100; i++) {
        const tempSpine = await SpineDisplay.loadSpineFromFiles(
          jsonText,
          atlasText,
          imageFiles
        );
        tempSpine.x = app.screen.width / 2;
        tempSpine.y = app.screen.height / 2;
        app.stage.addChild(tempSpine);

        app.render();

        app.stage.removeChild(tempSpine);
        tempSpine.destroy();
      }
      toast.success("Stress test (100x reload) completed");
    } catch (err) {
      console.error("Stress test failed:", err);
      toast.error("Stress test failed, see console for details");
    } finally {
      stressTestRunningRef.current = false;
    }
  };

  const runPerformanceTest = async () => {
    if (!appRef.current || !spineDataRef.current || !imageFilesRef.current) {
      toast.warning("Viewer not ready for performance test");
      return;
    }

    const app = appRef.current;
    const { jsonText, atlasText } = spineDataRef.current;
    const imageFiles = imageFilesRef.current;

    // Clear previous perf test spines
    if (perfSpinesRef.current.length) {
      for (const s of perfSpinesRef.current) {
        app.stage.removeChild(s);
        s.destroy();
      }
      perfSpinesRef.current = [];
    }

    try {
      const count = 50;
      const columns = 10;
      const rows = Math.ceil(count / columns);

      for (let i = 0; i < count; i++) {
        const clone = await SpineDisplay.loadSpineFromFiles(
          jsonText,
          atlasText,
          imageFiles
        );

        const col = i % columns;
        const row = Math.floor(i / columns);

        clone.x = (app.screen.width / columns) * (col + 0.5);
        clone.y = (app.screen.height / rows) * (row + 0.5);

        const animName =
          selectedAnimation || (animations.length ? animations[0] : "");
        if (animName) {
          clone.state.setAnimation(0, animName, loop);
        }

        app.stage.addChild(clone);
        perfSpinesRef.current.push(clone);
      }

      toast.success("Performance test: 50 instances added");
    } catch (err) {
      console.error("Performance test failed:", err);
      toast.error("Performance test failed, see console for details");
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-background relative">
      <Controls
        timeline={timeline}
        timelineDuration={timelineDuration}
        onTimelineChange={setTimeline}
        isPlaying={isPlaying}
        onPlayPause={() => setIsPlaying(!isPlaying)}
        loop={loop}
        onLoopChange={setLoop}
        speed={speed}
        onSpeedChange={setSpeed}
        scale={scale}
        onScaleChange={setScale}
        smoothSwitch={smoothSwitch}
        onSmoothSwitchChange={setSmoothSwitch}
        debugBones={debugBones}
        onDebugBonesChange={setDebugBones}
        selectedAnimation={selectedAnimation}
        animations={animations}
        onAnimationChange={setSelectedAnimation}
        onBack={onBack}
      />
      <div ref={canvasRef} className="flex-1" />

      {/* Draggable info panel */}
      <InfoPanel
        spine={spineRef.current}
        scale={scale}
        loop={loop}
        smoothSwitch={smoothSwitch}
        selectedAnimation={selectedAnimation}
        files={files}
        pos={infoPanelPos}
        setPos={setInfoPanelPos}
        fps={fps}
        onStressTest={runStressTest}
        onPerformanceTest={runPerformanceTest}
      />
    </div>
  );
};

interface InfoPanelProps {
  spine: Spine | null;
  scale: number;
  loop: boolean;
  smoothSwitch: boolean;
  selectedAnimation: string;
  files: SpineFiles;
  pos: { x: number; y: number };
  setPos: (pos: { x: number; y: number }) => void;
  fps: number;
  onStressTest: () => void;
  onPerformanceTest: () => void;
}

const InfoPanel = ({
  spine,
  selectedAnimation,
  files,
  pos,
  setPos,
  fps,
  onStressTest,
  onPerformanceTest,
}: InfoPanelProps) => {
  const draggingRef = useRef(false);
  const dragOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const handleMouseDown = (e: React.MouseEvent) => {
    draggingRef.current = true;
    dragOffsetRef.current = {
      x: e.clientX - pos.x,
      y: e.clientY - pos.y,
    };
    window.addEventListener("pointermove", handleMouseMove);
    window.addEventListener("pointerup", handleMouseUp);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!draggingRef.current) return;
    setPos({
      x: e.clientX - dragOffsetRef.current.x,
      y: e.clientY - dragOffsetRef.current.y,
    });
  };

  const handleMouseUp = () => {
    draggingRef.current = false;
    window.removeEventListener("pointermove", handleMouseMove);
    window.removeEventListener("pointerup", handleMouseUp);
  };

  const openFileInNewTab = (file: File) => {
    const url = URL.createObjectURL(file);
    window.open(url, "_blank");
  };

  const skeletonName = spine?.skeleton?.data?.name ?? "N/A";
  const bones = spine?.skeleton?.bones?.length ?? 0;
  const slots = spine?.skeleton?.slots?.length ?? 0;
  const totalSkins = spine?.skeleton?.data?.skins?.length ?? 0;
  const currentSkinName = spine?.skeleton?.skin?.name ?? "default";

  let timelineCount = 0;
  if (spine && selectedAnimation) {
    const data: any = spine.skeleton.data as any;
    const anim = data.findAnimation?.(selectedAnimation);
    if (anim) {
      timelineCount = anim.timelines?.length ?? 0;
    }
  }

  return (
    <div
      className="fixed z-20 bg-card/95 text-xs text-card-foreground border border-border rounded-md shadow-lg p-3 space-y-2 cursor-move"
      style={{ bottom: 16, right: 16, transform: `translate(${pos.x}px, ${pos.y}px)` }}
      onPointerDown={handleMouseDown}
    >
      <div className="font-semibold text-xs mb-1">Spine Info</div>
      <div className="space-y-1 text-[11px]">
        <div>Skeleton: {skeletonName}</div>
        <div>Animation: {selectedAnimation || "None"}</div>
        <div>Bones / Slots: {bones} / {slots}</div>
        <div>Skins: {currentSkinName} / {totalSkins}</div>
        <div>Animation Timelines: {timelineCount}</div>
        <div>FPS: {fps.toFixed(1)}</div>
      </div>
      <div className="flex flex-wrap gap-2 mt-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => openFileInNewTab(files.jsonFile)}
        >
          Open JSON
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => openFileInNewTab(files.atlasFile)}
        >
          Open Atlas
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => files.imageFiles.forEach(openFileInNewTab)}
        >
          Open Texture{files.imageFiles.length > 1 ? "s" : ""}
        </Button>
      </div>
      <div className="flex flex-wrap gap-2 mt-2">
        <Button
          size="sm"
          variant="destructive"
          onClick={(e) => {
            e.stopPropagation();
            onStressTest();
          }}
        >
          Stress test (100× reload)
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={(e) => {
            e.stopPropagation();
            onPerformanceTest();
          }}
        >
          Perf test (50× instances)
        </Button>
      </div>
    </div>
  );
};

// Spine loading is now encapsulated in SpineDisplay.loadSpineFromFiles
