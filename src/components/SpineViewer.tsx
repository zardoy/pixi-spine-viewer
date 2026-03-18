import { useEffect, useRef, useState } from "react";
import { Controls } from "./Controls";
import { toast } from "sonner";
import { SpineFiles } from "../pages/Index";
import { Button } from './ui/button';
import { Input } from "./ui/input";
import { SpineDisplay } from "../lib/SpineDisplay";
import { PixiApp } from "./PixiApp";
import { useSnapshot, ref } from "valtio";
import { spineViewerStore, resetSpineViewerState, applyActionAfterAnimSwitch } from "../store/spineViewerStore";
import { getAnimationKeyframeTimes } from "../lib/animationUtils";
import { AttachmentTestPanel } from "./AttachmentTestPanel";
import { ParticleGeneratorPanel } from "./ParticleGeneratorPanel";
import JSZip from "jszip";
import { Download, Sparkles, Wrench } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@radix-ui/react-dropdown-menu";
import { skeletonDataToJson, parseAtlasRegions, downloadAttachmentAsImage } from "../spine-toolbox";

interface SpineViewerProps {
  files: SpineFiles;
  onBack: () => void;
}

const GENERATOR_BREAKPOINT_PX = 768;

export const SpineViewer = ({ files, onBack }: SpineViewerProps) => {
  const snapshot = useSnapshot(spineViewerStore);
  const [isNarrow, setIsNarrow] = useState(() => typeof window !== "undefined" && window.innerWidth < GENERATOR_BREAKPOINT_PX);

  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${GENERATOR_BREAKPOINT_PX - 1}px)`);
    const handler = () => setIsNarrow(mq.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  // Set files in store on mount, wrapped in ref() to prevent proxying (File objects need proper this context)
  useEffect(() => {
    spineViewerStore.files = ref(files);
    spineViewerStore.ui.selectedSkeleton = files.jsonFile.name.replace(/\.(json|skel)$/i, '');
    spineViewerStore.ui.availableSkeletonNames = files.skeletonFiles?.map((f) =>
      f.name.replace(/\.(json|skel)$/i, '')
    ) ?? [];
    // Clear second files when first files change
    spineViewerStore.secondFiles = null;
    spineViewerStore.secondSpineOffset = { x: 0, y: 0, scale: 1 };
    spineViewerStore.secondSpineOpacity = 1;
    spineViewerStore.ui.secondSelectedAnimation = null;
    spineViewerStore.ui.secondAnimations = [];
    return () => {
      resetSpineViewerState();
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
      // Don't intercept when typing in inputs
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      if (e.code === "Space") {
        e.preventDefault();
        spineViewerStore.ui.isPlaying = !spineViewerStore.ui.isPlaying;
        return;
      }
      if (e.code === "KeyR") {
        e.preventDefault();
        if (e.shiftKey) {
          // Shift+R: Remount SpineBase components
          spineViewerStore.ui.mountCount = (spineViewerStore.ui.mountCount || 0) + 1;
        } else {
          // R (without shift): Go back
          onBack();
        }
      } else if (e.code === "KeyT") {
        e.preventDefault();
        spineViewerStore.ui.debugBones = !spineViewerStore.ui.debugBones;
      } else if (e.code === "KeyS") {
        if (spineViewerStore.ui.selectedAnimation) {
          e.preventDefault();
          spineViewerStore.ui.resetCounter += 1;
          spineViewerStore.ui.timeline = 0;
        }
      } else if (e.code.startsWith("Digit")) {
        const digit = parseInt(e.code.replace("Digit", ""), 10);
        if (!Number.isNaN(digit) && digit >= 1 && digit <= 9) {
          const index = digit - 1;
          const anim = spineViewerStore.ui.animations[index];
          if (anim && anim !== spineViewerStore.ui.selectedAnimation) {
            e.preventDefault();
            // Store current animation as previous before switching
            if (spineViewerStore.ui.selectedAnimation) {
              spineViewerStore.ui.previousAnimation = spineViewerStore.ui.selectedAnimation;
            }
            spineViewerStore.ui.selectedAnimation = anim;
            applyActionAfterAnimSwitch();
          }
        }
      } else if (e.code === "KeyQ") {
        // Switch to previous animation
        if (spineViewerStore.ui.previousAnimation && spineViewerStore.ui.previousAnimation !== spineViewerStore.ui.selectedAnimation) {
          e.preventDefault();
          const prevAnim = spineViewerStore.ui.previousAnimation;
          spineViewerStore.ui.previousAnimation = spineViewerStore.ui.selectedAnimation;
          spineViewerStore.ui.selectedAnimation = prevAnim;
          applyActionAfterAnimSwitch();
        }
      } else if (e.code === "KeyC") {
        // Cycle through skins with 'C' key
        if (spineViewerStore.ui.skins.length > 1) {
          e.preventDefault();
          const currentIndex = spineViewerStore.ui.skins.indexOf(spineViewerStore.ui.selectedSkin);
          const nextIndex = (currentIndex + 1) % spineViewerStore.ui.skins.length;
          spineViewerStore.ui.selectedSkin = spineViewerStore.ui.skins[nextIndex];
        }
      } else if (e.code === "Comma") {
        // Previous keyframe
        const spine = spineViewerStore.refs.spine;
        const anim = spine?.skeleton?.data?.findAnimation?.(spineViewerStore.ui.selectedAnimation);
        if (anim) {
          const keyframes = getAnimationKeyframeTimes(anim as Parameters<typeof getAnimationKeyframeTimes>[0]);
          const current = spineViewerStore.ui.timeline;
          const idx = keyframes.findIndex((t) => t >= current) - 1;
          if (idx >= 0 && keyframes[idx] !== undefined) {
            e.preventDefault();
            spineViewerStore.ui.timeline = keyframes[idx];
            spineViewerStore.ui.isPlaying = false;
          }
        }
      } else if (e.code === "Period") {
        // Next keyframe
        const spine = spineViewerStore.refs.spine;
        const anim = spine?.skeleton?.data?.findAnimation?.(spineViewerStore.ui.selectedAnimation);
        if (anim) {
          const keyframes = getAnimationKeyframeTimes(anim as Parameters<typeof getAnimationKeyframeTimes>[0]);
          const current = spineViewerStore.ui.timeline;
          const idx = keyframes.findIndex((t) => t > current);
          if (idx >= 0 && keyframes[idx] !== undefined) {
            e.preventDefault();
            spineViewerStore.ui.timeline = keyframes[idx];
            spineViewerStore.ui.isPlaying = false;
          }
        }
      } else if (e.code === "KeyN") {
        // Add custom event at current time
        const animName = spineViewerStore.ui.selectedAnimation;
        const time = spineViewerStore.ui.timeline;
        if (animName && time >= 0) {
          e.preventDefault();
          const cur = spineViewerStore.ui.customEvents[animName] ?? {};
          const eventName = prompt("Enter event name", `customEvent_${Object.keys(cur).length}`);
          if (!eventName) return
          spineViewerStore.ui.customEvents = {
            ...spineViewerStore.ui.customEvents,
            [animName]: { ...cur, [eventName]: time },
          };
          toast.success(`Custom event "${eventName}" at ${time.toFixed(2)}s`);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, []);

  const handleCopyUrl = () => {
    const params = new URLSearchParams();
    if (snapshot.ui.selectedAnimation) params.set('animation', snapshot.ui.selectedAnimation);
    if (snapshot.ui.selectedSkin) params.set('skin', snapshot.ui.selectedSkin);
    if (snapshot.ui.timeline > 0) params.set('time', snapshot.ui.timeline.toFixed(3));
    if (snapshot.ui.backgroundColor !== '#404040') params.set('bg', snapshot.ui.backgroundColor);

    const url = `${window.location.origin}${window.location.pathname}?${params.toString()}`;
    navigator.clipboard.writeText(url).then(() => {
      toast.success('URL copied to clipboard');
    }).catch(() => {
      toast.error('Failed to copy URL');
    });
  };

  // Handle drag and drop for second spine
  useEffect(() => {
    const handleDrop = async (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      const dataTransfer = e.dataTransfer;
      if (!dataTransfer) return;
      const files = Array.from(dataTransfer.files);

      if (files.length === 0) return;

      // Check if we already have a first spine loaded
      if (!snapshot.files) {
        toast.warning('Please load first spine before dropping second one');
        return;
      }

      // Process files for second spine
      try {
        // Extract ZIP files if any
        const zipFiles = files.filter(f => f.name.endsWith('.zip'));
        let allFiles = [...files];

        for (const zipFile of zipFiles) {
          try {
            toast.loading(`Extracting ${zipFile.name}...`);
            const zip = new JSZip();
            const zipContent = await zip.loadAsync(zipFile);
            const extractedFiles: File[] = [];

            for (const filename in zipContent.files) {
              const zipEntry = zipContent.files[filename];
              if (zipEntry.dir) continue;
              const blob = await zipEntry.async("blob");
              const file = new File([blob], filename, { type: blob.type || "application/octet-stream" });
              extractedFiles.push(file);
            }

            allFiles = allFiles.filter(f => f !== zipFile);
            allFiles.push(...extractedFiles);
            toast.dismiss();
          } catch (error) {
            toast.dismiss();
            toast.error(error instanceof Error ? error.message : 'Failed to extract ZIP file');
            return;
          }
        }

        // Find skeleton files, atlas, and image files
        const skeletonFiles = allFiles.filter(f => f.name.endsWith('.json') || f.name.endsWith('.skel'));
        const atlasFile = allFiles.find(f => f.name.endsWith('.atlas') || f.name.endsWith('.atlas.txt'));
        const imageFiles = allFiles.filter(f =>
          f.type.startsWith("image/") ||
          f.name.match(/\.(png|jpg|jpeg|webp)$/i)
        );

        if (skeletonFiles.length === 0) {
          toast.error("No .json or .skel file found in dropped files.");
          return;
        }

        if (!atlasFile) {
          toast.error("No .atlas file found in dropped files.");
          return;
        }

        if (imageFiles.length === 0) {
          toast.error("No image files found in dropped files.");
          return;
        }

        if (skeletonFiles.length > 1) {
          spineViewerStore.pendingSkeletonSelection = ref({ skeletonFiles, atlasFile, imageFiles }) as any;
          spineViewerStore.ui.skeletonSelectModalOpen = true;
          spineViewerStore.skeletonSelectOnSelect = ref((files: SpineFiles) => {
            spineViewerStore.secondFiles = ref(files);
            toast.success(`Second spine loaded: ${files.jsonFile.name}`);
          }) as any;
          return;
        }

        const skeletonFile = skeletonFiles[0];
        const secondFiles: SpineFiles = {
          jsonFile: skeletonFile,
          atlasFile,
          imageFiles,
        };

        spineViewerStore.secondFiles = ref(secondFiles);
        toast.success(`Second spine loaded: ${skeletonFile.name}`);
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Failed to process dropped files');
      }
    };

    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
    };

    window.addEventListener('drop', handleDrop);
    window.addEventListener('dragover', handleDragOver);

    return () => {
      window.removeEventListener('drop', handleDrop);
      window.removeEventListener('dragover', handleDragOver);
    };
  }, [snapshot.files]);

  // Keyboard handlers for spine positioning and scaling
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept if Ctrl/Cmd is pressed or if typing in input
      if (e.ctrlKey || e.metaKey) return;
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;

      const step = e.altKey ? 10 : 1; // Alt for larger steps
      const scaleStep = e.shiftKey ? 0.1 : 0.01;

      let changed = false;

      if (snapshot.secondFiles) {
        // Second spine is loaded - control second spine offset
        if (e.code === "ArrowLeft") {
          e.preventDefault();
          spineViewerStore.secondSpineOffset.x -= step;
          changed = true;
        } else if (e.code === "ArrowRight") {
          e.preventDefault();
          spineViewerStore.secondSpineOffset.x += step;
          changed = true;
        } else if (e.code === "ArrowUp") {
          e.preventDefault();
          spineViewerStore.secondSpineOffset.y -= step;
          changed = true;
        } else if (e.code === "ArrowDown") {
          e.preventDefault();
          spineViewerStore.secondSpineOffset.y += step;
          changed = true;
        } else if (e.code === "BracketLeft") { // [ key
          e.preventDefault();
          spineViewerStore.secondSpineOffset.scale = Math.max(0.01, spineViewerStore.secondSpineOffset.scale - scaleStep);
          changed = true;
        } else if (e.code === "BracketRight") { // ] key
          e.preventDefault();
          spineViewerStore.secondSpineOffset.scale = Math.min(10, spineViewerStore.secondSpineOffset.scale + scaleStep);
          changed = true;
        } else if (e.code === "Slash") { // / key
          e.preventDefault();
          // Toggle opacity between 1.0 and 0.5
          spineViewerStore.secondSpineOpacity = spineViewerStore.secondSpineOpacity === 0.5 ? 1.0 : 0.5;
          console.log(`Second spine opacity: ${spineViewerStore.secondSpineOpacity}`);
        }
        if (changed) {
          console.log(`[Second Spine] x:${spineViewerStore.secondSpineOffset.x}, y:${spineViewerStore.secondSpineOffset.y}, scale:${spineViewerStore.secondSpineOffset.scale}`);
        }
      } else {
        // No second spine - control first spine container position/scale
        if (e.code === "ArrowLeft") {
          e.preventDefault();
          spineViewerStore.ui.spinePosition.x -= step;
          changed = true;
        } else if (e.code === "ArrowRight") {
          e.preventDefault();
          spineViewerStore.ui.spinePosition.x += step;
          changed = true;
        } else if (e.code === "ArrowUp") {
          e.preventDefault();
          spineViewerStore.ui.spinePosition.y -= step;
          changed = true;
        } else if (e.code === "ArrowDown") {
          e.preventDefault();
          spineViewerStore.ui.spinePosition.y += step;
          changed = true;
        } else if (e.code === "BracketLeft") { // [ key
          e.preventDefault();
          spineViewerStore.ui.scale = Math.max(0.01, spineViewerStore.ui.scale - scaleStep);
          changed = true;
        } else if (e.code === "BracketRight") { // ] key
          e.preventDefault();
          spineViewerStore.ui.scale = Math.min(10, spineViewerStore.ui.scale + scaleStep);
          changed = true;
        }
        if (changed) {
          console.log(`[First Spine] x:${spineViewerStore.ui.spinePosition.x}, y:${spineViewerStore.ui.spinePosition.y}, scale:${spineViewerStore.ui.scale}`);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [snapshot.secondFiles]);

  const showGenerator = snapshot.ui.particleGeneratorPanelVisible;
  const showGeneratorInline = showGenerator && !isNarrow;
  const showGeneratorModal = showGenerator && isNarrow;

  const openGenerator = () => {
    spineViewerStore.ui.particleGeneratorPanelVisible = true;
    const params = new URLSearchParams(window.location.search);
    params.set("generator", "1");
    window.history.replaceState({}, "", `${window.location.pathname}?${params.toString()}`);
  };

  const closeGenerator = () => {
    spineViewerStore.ui.particleGeneratorPanelVisible = false;
    const params = new URLSearchParams(window.location.search);
    params.delete("generator");
    const qs = params.toString();
    window.history.replaceState({}, "", qs ? `${window.location.pathname}?${qs}` : window.location.pathname);
  };

  const previewArea = (
    <div className="flex flex-col flex-1 min-h-0 relative">
      <div className="flex-shrink-0 max-h-[260px] overflow-y-auto border-b border-border bg-background/95">
        <Controls onCopyUrl={handleCopyUrl} onBack={onBack} />
      </div>
      <div className="flex-1 min-h-0 relative">
        <PixiApp />
      </div>
    </div>
  );

  const previewWithFab = (
    <div className="flex flex-col flex-1 min-h-0 relative">
      <div className="flex-shrink-0 max-h-[260px] overflow-y-auto border-b border-border bg-background/95">
        <Controls onCopyUrl={handleCopyUrl} onBack={onBack} />
      </div>
      <div className="flex-1 min-h-0 relative">
        <PixiApp />
        {isNarrow && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); openGenerator(); }}
            className="absolute bottom-4 left-4 z-20 h-12 w-12 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center hover:bg-primary/90"
            title="Open particle generator"
          >
            <Sparkles className="w-6 h-6" />
          </button>
        )}
      </div>
    </div>
  );

  return (
    <div className="h-screen flex flex-col md:flex-row bg-background relative">
      {/* Split: left = generator (desktop), right = preview */}
      {showGeneratorInline && (
        <aside className="hidden md:flex md:flex-col md:w-[380px] md:shrink-0 md:border-r md:border-border md:bg-card/50 md:overflow-y-auto">
          <div className="p-3 sticky top-0 bg-card/95 border-b border-border z-10">
            <span className="font-semibold text-sm">Particle Generator</span>
          </div>
          <div className="p-3 flex-1">
            <ParticleGeneratorPanel
              embedded
              onFilesGenerated={(f) => { spineViewerStore.files = ref(f); }}
            />
          </div>
        </aside>
      )}

      <div className="flex flex-col flex-1 min-w-0 h-full">
        {showGeneratorInline ? previewArea : previewWithFab}
      </div>

      {/* Draggable info panel */}
      <InfoPanel />

      {/* Fullscreen attachment download modal */}
      <AttachmentDownloadModal />

      {/* Draggable attachment test panel */}
      <AttachmentTestPanel />

      {/* Mobile: generator in modal */}
      {showGeneratorModal && (
        <div
          className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm md:hidden flex items-stretch justify-end"
          onClick={closeGenerator}
        >
          <div
            className="w-full max-w-md bg-card border-l border-border shadow-xl overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-3 border-b border-border flex items-center justify-between">
              <span className="font-semibold">Particle Generator</span>
              <Button variant="ghost" size="sm" onClick={closeGenerator}>×</Button>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              <ParticleGeneratorPanel
                embedded
                onClose={closeGenerator}
                onFilesGenerated={(f) => { spineViewerStore.files = ref(f); }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const InfoPanel = () => {
  const state = useSnapshot(spineViewerStore);
  const draggingRef = useRef(false);
  const [atlasRegions, setAtlasRegions] = useState<{ name: string; index: number }[]>([]);
  const dragOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const pos = state.ui.infoPanelPos;

  // Parse atlas regions when files change (for "Download attachment" submenu)
  useEffect(() => {
    console.log('InfoPanel useEffect');
    const files = spineViewerStore.files;
    if (!files) {
      setAtlasRegions([]);
      return;
    }
    files.atlasFile.text().then((atlasText) => {
      const regions = parseAtlasRegions(atlasText);
      setAtlasRegions(
        regions.map((r) => ({ name: r.name, index: r.index }))
      );
    }).catch(() => setAtlasRegions([]));
  }, [state.files]);

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

  /**
   * Parse atlas file to extract image filenames referenced in it
   */
  const parseAtlasImageNames = async (atlasFile: File): Promise<string[]> => {
    const atlasText = await atlasFile.text();
    const lines = atlasText.split('\n');
    const imageNames: string[] = [];

    // Atlas format: first line of each page is the image filename
    // Pages are separated by empty lines
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      // If line looks like a filename (ends with .png, .jpg, etc.) and next line starts with "size:"
      if (line && (line.endsWith('.png') || line.endsWith('.jpg') || line.endsWith('.jpeg') || line.endsWith('.webp'))) {
        const nextLine = i + 1 < lines.length ? lines[i + 1].trim() : '';
        if (nextLine.startsWith('size:')) {
          imageNames.push(line);
        }
      }
    }

    return imageNames.length > 0 ? imageNames : [atlasFile.name.replace('.atlas', '.png')];
  };

  /**
   * Download spine files as ZIP with images named as in atlas
   */
  const handleDownloadZip = async () => {
    if (!files) return;

    try {
      toast.loading('Creating ZIP archive...');

      const zip = new JSZip();

      // Add JSON file
      const jsonContent = await files.jsonFile.arrayBuffer();
      zip.file(files.jsonFile.name, jsonContent);

      // Add Atlas file
      const atlasContent = await files.atlasFile.arrayBuffer();
      zip.file(files.atlasFile.name, atlasContent);

      // Parse atlas to get image names
      const imageNames = await parseAtlasImageNames(files.atlasFile);

      // Add image files with names from atlas
      // If we have multiple images, map them to atlas names
      // If single image, use first atlas name
      for (let i = 0; i < files.imageFiles.length; i++) {
        const imageFile = files.imageFiles[i];
        const imageName = imageNames[i] || imageFile.name;
        const imageContent = await imageFile.arrayBuffer();
        zip.file(imageName, imageContent);
      }

      // Add custom.json if custom events were recorded (N key)
      const customEvents = spineViewerStore.ui.customEvents;
      if (Object.keys(customEvents).length > 0) {
        zip.file("custom.json", JSON.stringify({ customEvents }, null, 2));
      }

      // Generate ZIP blob
      const zipBlob = await zip.generateAsync({ type: 'blob' });

      // Create download link
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${files.jsonFile.name.replace(/\.(json|skel)$/i, '')}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.dismiss();
      toast.success('ZIP downloaded successfully');
    } catch (error) {
      toast.dismiss();
      toast.error(error instanceof Error ? error.message : 'Failed to create ZIP');
      console.error('Error creating ZIP:', error);
    }
  };

  /**
   * Download ZIP with skeleton converted from .skel to .json
   */
  const handleDownloadZipWithSkelToJson = async () => {
    if (!files) return;
    const spine = spineViewerStore.refs.spine;
    const isSkel = files.jsonFile.name.toLowerCase().endsWith('.skel');
    if (!isSkel) {
      toast.info('Skeleton is already JSON. Use regular Download ZIP.');
      return;
    }
    if (!spine || spine.destroyed || !spine.skeleton?.data) {
      toast.error('Spine not loaded. Cannot convert.');
      return;
    }

    try {
      toast.loading('Converting skel→JSON and creating ZIP...');
      const zip = new JSZip();
      const jsonObj = skeletonDataToJson(spine.skeleton.data);
      const jsonStr = JSON.stringify(jsonObj, null, 2);
      const jsonName = files.jsonFile.name.replace(/\.skel$/i, '.json');
      zip.file(jsonName, jsonStr);

      const atlasContent = await files.atlasFile.arrayBuffer();
      zip.file(files.atlasFile.name, atlasContent);

      const imageNames = await parseAtlasImageNames(files.atlasFile);
      for (let i = 0; i < files.imageFiles.length; i++) {
        const imageFile = files.imageFiles[i];
        const imageName = imageNames[i] || imageFile.name;
        const imageContent = await imageFile.arrayBuffer();
        zip.file(imageName, imageContent);
      }

      const customEvents = spineViewerStore.ui.customEvents;
      if (Object.keys(customEvents).length > 0) {
        zip.file("custom.json", JSON.stringify({ customEvents }, null, 2));
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${files.jsonFile.name.replace(/\.(json|skel)$/i, '')}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.dismiss();
      toast.success('ZIP with JSON skeleton downloaded');
    } catch (error) {
      toast.dismiss();
      toast.error(error instanceof Error ? error.message : 'Conversion failed');
      console.error('Error converting skel to JSON:', error);
    }
  };

  const spine = spineViewerStore.refs.spine;
  const isDestroyed = spine ? spine.destroyed : true;
  const skeletonName = !isDestroyed && spine?.skeleton?.data?.name ? spine.skeleton.data.name : "N/A";
  const bones = !isDestroyed && spine?.skeleton?.bones ? spine.skeleton.bones.length : 0;
  const slots = !isDestroyed && spine?.skeleton?.slots ? spine.skeleton.slots.length : 0;
  const totalSkins = !isDestroyed && spine?.skeleton?.data?.skins ? spine.skeleton.data.skins.length : 0;
  const currentSkinName = !isDestroyed && spine?.skeleton?.skin?.name ? spine.skeleton.skin.name : "default";

  let timelineCount = 0;
  if (!isDestroyed && spine && state.ui.selectedAnimation) {
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
        <div>FPS: <span ref={(el) => { if (el) (window as any).__fpsRef = el; }}>{state.ui.fps.toFixed(1)}</span></div>
        <div>FPS Rendered: {state.ui.fpsRendered}</div>
        {state.ui.frameTimeMs != null && (
          <div>Frame: {state.ui.frameTimeMs.toFixed(1)} ms</div>
        )}
        {state.ui.memoryMB != null && (
          <div>Memory: {state.ui.memoryMB.toFixed(1)} MB</div>
        )}
      </div>
      <div className="flex flex-wrap gap-2 mt-2">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" className="gap-1">
              Open
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[160px] bg-popover text-popover-foreground border border-border rounded-md shadow-md p-1 z-50">
            <DropdownMenuItem
              onClick={() => openFileInNewTab(files.jsonFile)}
              className="cursor-pointer rounded-sm px-2 py-1.5 text-sm"
            >
              Skeleton
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => openFileInNewTab(files.atlasFile)}
              className="cursor-pointer rounded-sm px-2 py-1.5 text-sm"
            >
              Atlas
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => files.imageFiles.forEach(openFileInNewTab)}
              className="cursor-pointer rounded-sm px-2 py-1.5 text-sm"
            >
              Texture{files.imageFiles.length > 1 ? "s" : ""}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          size="sm"
          variant="outline"
          onClick={handleDownloadZip}
          className="gap-1"
        >
          <Download className="w-3 h-3" />
          Download ZIP
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" variant="outline" className="gap-1">
              <Wrench className="w-3 h-3" />
              Toolbox
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-[220px] bg-popover text-popover-foreground border border-border rounded-md shadow-md p-1 z-50">
            <DropdownMenuItem
              onClick={handleDownloadZipWithSkelToJson}
              className="cursor-pointer rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
            >
              Download ZIP with skel→JSON
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                if (atlasRegions.length === 0) {
                  toast.warning("No regions in atlas");
                  return;
                }
                spineViewerStore.ui.attachmentDownloadModalOpen = true;
              }}
              className="cursor-pointer rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
            >
              Download attachment as PNG
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
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

const AttachmentDownloadModal = () => {
  const state = useSnapshot(spineViewerStore);
  const [atlasRegions, setAtlasRegions] = useState<{ name: string; index: number }[]>([]);
  const [search, setSearch] = useState("");
  const searchRef = useRef<HTMLInputElement | null>(null);

  const open = state.ui.attachmentDownloadModalOpen;

  useEffect(() => {
    if (!open) return;
    const files = spineViewerStore.files;
    if (!files) {
      setAtlasRegions([]);
      return;
    }
    files.atlasFile
      .text()
      .then((atlasText) => {
        const regions = parseAtlasRegions(atlasText);
        setAtlasRegions(
          regions.map((r) => ({ name: r.name, index: r.index }))
        );
      })
      .catch(() => setAtlasRegions([]));
  }, [open]);

  useEffect(() => {
    if (open) {
      setSearch("");
      if (searchRef.current) {
        searchRef.current.focus();
      }
    }
  }, [open]);

  const files = spineViewerStore.files;
  if (!open || !files) return null;

  const filteredRegions =
    search.trim().length === 0
      ? atlasRegions
      : atlasRegions.filter((r) =>
          r.name.toLowerCase().includes(search.trim().toLowerCase())
        );

  return (
    <div
      className="fixed inset-0 z-40 bg-background/90 backdrop-blur-sm flex items-center justify-center"
      onClick={() => {
        spineViewerStore.ui.attachmentDownloadModalOpen = false;
      }}
    >
      <div
        className="w-full h-full max-w-3xl mx-auto bg-card text-card-foreground border border-border shadow-xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex flex-col gap-1">
            <span className="font-semibold text-sm">Download attachment as PNG</span>
            <span className="text-xs text-muted-foreground">
              Select an atlas region to export as an image.
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => {
              spineViewerStore.ui.attachmentDownloadModalOpen = false;
            }}
          >
            ×
          </Button>
        </div>
        <div className="px-4 py-3 border-b border-border flex items-center gap-2">
          <Input
            ref={searchRef}
            placeholder="Filter attachments..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 text-xs"
          />
          <div className="text-[11px] text-muted-foreground">
            {atlasRegions.length} total, {filteredRegions.length} shown
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-2 py-2">
          {atlasRegions.length === 0 ? (
            <div className="px-2 py-4 text-xs text-muted-foreground">
              No regions in atlas.
            </div>
          ) : filteredRegions.length === 0 ? (
            <div className="px-2 py-4 text-xs text-muted-foreground">
              No regions match this filter.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {filteredRegions.map((r) => (
                <Button
                  key={r.index >= 0 ? `${r.name}-${r.index}` : r.name}
                  variant="outline"
                  size="sm"
                  className="justify-between text-xs"
                  onClick={async () => {
                    try {
                      toast.loading(`Downloading ${r.name}...`);
                      const atlasText = await files.atlasFile.text();
                      await downloadAttachmentAsImage(
                        atlasText,
                        files.imageFiles,
                        r.name,
                        r.index
                      );
                      toast.dismiss();
                      toast.success(`Downloaded ${r.name}.png`);
                      spineViewerStore.ui.attachmentDownloadModalOpen = false;
                    } catch (err) {
                      toast.dismiss();
                      toast.error(err instanceof Error ? err.message : "Download failed");
                    }
                  }}
                >
                  <span className="truncate mr-2">
                    {r.name}
                    {r.index >= 0 ? ` (${r.index})` : ""}
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    Click to download
                  </span>
                </Button>
              ))}
            </div>
          )}
        </div>
        <div className="px-4 py-2 border-t border-border flex items-center justify-between text-[11px] text-muted-foreground">
          <span>Click outside or × to close</span>
          <span>Atlas regions from current file</span>
        </div>
      </div>
    </div>
  );
};
