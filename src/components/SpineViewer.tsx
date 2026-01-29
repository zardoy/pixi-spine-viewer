import { useEffect, useRef } from "react";
import { Controls } from "./Controls";
import { toast } from "sonner";
import { SpineFiles } from "../pages/Index";
import { Button } from './ui/button';
import { SpineDisplay } from "../lib/SpineDisplay";
import { PixiApp } from "./PixiApp";
import { useSnapshot, ref } from "valtio";
import { spineViewerStore } from "../store/spineViewerStore";
import { AttachmentTestPanel } from "./AttachmentTestPanel";

interface SpineViewerProps {
  files: SpineFiles;
  onBack: () => void;
}

export const SpineViewer = ({ files, onBack }: SpineViewerProps) => {
  const state = useSnapshot(spineViewerStore);

  // Set files in store on mount, wrapped in ref() to prevent proxying (File objects need proper this context)
  useEffect(() => {
    spineViewerStore.files = ref(files);
    return () => {
      // Cleanup: clear files when component unmounts
      spineViewerStore.files = null;
    };
  }, [files]);

  // Parse URL parameters on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlAnimation = params.get('animation');
    const urlSkin = params.get('skin');
    const urlTime = params.get('time');
    const urlBg = params.get('bg');

    if (urlAnimation) {
      spineViewerStore.ui.selectedAnimation = urlAnimation;
    }
    if (urlSkin) {
      spineViewerStore.ui.selectedSkin = urlSkin;
    }
    if (urlTime !== null) {
      const time = parseFloat(urlTime);
      if (!isNaN(time)) {
        spineViewerStore.ui.timeline = time;
        spineViewerStore.ui.isPlaying = false; // Pause if time is specified
      }
    }
    if (urlBg) {
      spineViewerStore.ui.backgroundColor = urlBg;
    }
  }, []);

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if Ctrl/Cmd is pressed (allow browser shortcuts)
      if (e.ctrlKey || e.metaKey) {
        return;
      }

      if (e.code === "Space") {
        e.preventDefault();
        spineViewerStore.ui.isPlaying = !spineViewerStore.ui.isPlaying;
        return;
      }
      if (e.code === "KeyR") {
        e.preventDefault();
        onBack();
      } else if (e.code === "KeyT") {
        e.preventDefault();
        spineViewerStore.ui.debugBones = !spineViewerStore.ui.debugBones;
      } else if (e.code === "KeyS") {
        if (state.ui.selectedAnimation) {
          e.preventDefault();
          spineViewerStore.ui.resetCounter += 1;
          spineViewerStore.ui.timeline = 0;
        }
      } else if (e.code.startsWith("Digit")) {
        const digit = parseInt(e.code.replace("Digit", ""), 10);
        if (!Number.isNaN(digit) && digit >= 1 && digit <= 9) {
          const index = digit - 1;
          const anim = state.ui.animations[index];
          if (anim && anim !== state.ui.selectedAnimation) {
            e.preventDefault();
            // Store current animation as previous before switching
            if (state.ui.selectedAnimation) {
              spineViewerStore.ui.previousAnimation = state.ui.selectedAnimation;
            }
            spineViewerStore.ui.selectedAnimation = anim;
          }
        }
      } else if (e.code === "KeyQ") {
        // Switch to previous animation
        if (state.ui.previousAnimation && state.ui.previousAnimation !== state.ui.selectedAnimation) {
          e.preventDefault();
          const prevAnim = state.ui.previousAnimation;
          spineViewerStore.ui.previousAnimation = state.ui.selectedAnimation;
          spineViewerStore.ui.selectedAnimation = prevAnim;
        }
      } else if (e.code === "KeyC") {
        // Cycle through skins with 'C' key
        if (state.ui.skins.length > 1) {
          e.preventDefault();
          const currentIndex = state.ui.skins.indexOf(state.ui.selectedSkin);
          const nextIndex = (currentIndex + 1) % state.ui.skins.length;
          spineViewerStore.ui.selectedSkin = state.ui.skins[nextIndex];
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [onBack, state.ui.animations, state.ui.skins, state.ui.loop, state.ui.selectedAnimation, state.ui.selectedSkin]);

  const handleCopyUrl = () => {
    const params = new URLSearchParams();
    if (state.ui.selectedAnimation) params.set('animation', state.ui.selectedAnimation);
    if (state.ui.selectedSkin) params.set('skin', state.ui.selectedSkin);
    if (state.ui.timeline > 0) params.set('time', state.ui.timeline.toFixed(3));
    if (state.ui.backgroundColor !== '#1a1625') params.set('bg', state.ui.backgroundColor);

    const url = `${window.location.origin}${window.location.pathname}?${params.toString()}`;
    navigator.clipboard.writeText(url).then(() => {
      toast.success('URL copied to clipboard');
    }).catch(() => {
      toast.error('Failed to copy URL');
    });
  };

  return (
    <div className="min-h-screen flex flex-col bg-background relative">
      <Controls
        onCopyUrl={handleCopyUrl}
        onBack={onBack}
      />
      <PixiApp />

      {/* Draggable info panel */}
      <InfoPanel />

      {/* Draggable attachment test panel */}
      <AttachmentTestPanel />
    </div>
  );
};

const InfoPanel = () => {
  const state = useSnapshot(spineViewerStore);
  const draggingRef = useRef(false);
  const dragOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const pos = state.ui.infoPanelPos;

  const handleMouseDown = (e: React.PointerEvent<HTMLDivElement>) => {
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
    spineViewerStore.ui.infoPanelPos = {
      x: e.clientX - dragOffsetRef.current.x,
      y: e.clientY - dragOffsetRef.current.y,
    };
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

  const spine = spineViewerStore.refs.spine;
  const skeletonName = spine?.skeleton?.data?.name ?? "N/A";
  const bones = spine?.skeleton?.bones?.length ?? 0;
  const slots = spine?.skeleton?.slots?.length ?? 0;
  const totalSkins = spine?.skeleton?.data?.skins?.length ?? 0;
  const currentSkinName = spine?.skeleton?.skin?.name ?? "default";

  let timelineCount = 0;
  if (spine && state.ui.selectedAnimation) {
    const data: any = spine.skeleton.data as any;
    const anim = data.findAnimation?.(state.ui.selectedAnimation);
    if (anim) {
      timelineCount = anim.timelines?.length ?? 0;
    }
  }

  const files = spineViewerStore.files;
  if (!files) return null;

  return (
    <div
      className="fixed z-20 bg-card/95 text-xs text-card-foreground border border-border rounded-md shadow-lg p-3 space-y-2 cursor-move"
      style={{ bottom: 16, right: 16, transform: `translate(${pos.x}px, ${pos.y}px)` }}
      onPointerDown={handleMouseDown}
    >
      <div className="font-semibold text-xs mb-1">Spine Info</div>
      <div className="space-y-1 text-[11px]">
        <div>Skeleton: {skeletonName}</div>
        <div>Animation: {state.ui.selectedAnimation || "None"}</div>
        <div>Bones / Slots: {bones} / {slots}</div>
        <div>Skins: {currentSkinName} / {totalSkins}</div>
        <div>Animation Timelines: {timelineCount}</div>
        <div>FPS: {state.ui.fps.toFixed(1)}</div>
      </div>
      <div className="flex flex-wrap gap-2 mt-2">
        <Button
          size="sm"
          variant="outline"
          onClick={() => openFileInNewTab(files.jsonFile)}
        >
          Open Skeleton
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
            // Run stress test
            (async () => {
              if (spineViewerStore.refs.stressTestRunning) return;
              const app = spineViewerStore.refs.app;
              const spineData = spineViewerStore.refs.spineData;
              const imageFiles = spineViewerStore.refs.imageFiles;

              if (!app || !spineData || !imageFiles) {
                toast.warning("Viewer not ready for stress test");
                return;
              }

              spineViewerStore.refs.stressTestRunning = true;
              const { skeletonData, atlasText } = spineData;

              try {
                for (let i = 0; i < 100; i++) {
                  const tempSpine = await SpineDisplay.loadSpineFromFiles(
                    skeletonData,
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
                spineViewerStore.refs.stressTestRunning = false;
              }
            })();
          }}
        >
          Stress test (100× reload)
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={(e) => {
            e.stopPropagation();
            // Run performance test
            (async () => {
              const app = spineViewerStore.refs.app;
              const spineData = spineViewerStore.refs.spineData;
              const imageFiles = spineViewerStore.refs.imageFiles;

              if (!app || !spineData || !imageFiles) {
                toast.warning("Viewer not ready for performance test");
                return;
              }

              const { skeletonData, atlasText } = spineData;

              // Clear previous perf test spines
              if (spineViewerStore.refs.perfSpines.length) {
                for (const s of spineViewerStore.refs.perfSpines) {
                  app.stage.removeChild(s);
                  s.destroy();
                }
                spineViewerStore.refs.perfSpines = [];
              }

              try {
                const count = 50;
                const columns = 10;
                const rows = Math.ceil(count / columns);

                for (let i = 0; i < count; i++) {
                  const clone = await SpineDisplay.loadSpineFromFiles(
                    skeletonData,
                    atlasText,
                    imageFiles
                  );

                  const col = i % columns;
                  const row = Math.floor(i / columns);

                  clone.x = (app.screen.width / columns) * (col + 0.5);
                  clone.y = (app.screen.height / rows) * (row + 0.5);

                  const animName =
                    state.ui.selectedAnimation || (state.ui.animations.length ? state.ui.animations[0] : "");
                  if (animName) {
                    clone.state.setAnimation(0, animName, state.ui.loop);
                  }

                  app.stage.addChild(clone);
                  // Wrap each Spine in ref() to prevent proxying
                  const currentPerfSpines = spineViewerStore.refs.perfSpines;
                  spineViewerStore.refs.perfSpines = [...currentPerfSpines, ref(clone)];
                }

                toast.success("Performance test: 50 instances added");
              } catch (err) {
                console.error("Performance test failed:", err);
                toast.error("Performance test failed, see console for details");
              }
            })();
          }}
        >
          Perf test (50× instances)
        </Button>
      </div>
    </div>
  );
};
