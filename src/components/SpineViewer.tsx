import { useEffect, useRef, useState } from "react";
import * as PIXI from "pixi.js";
import { Spine } from "@esotericsoftware/spine-pixi-v8";
import { Controls } from "./Controls";
import { toast } from "sonner";
import { SpineFiles } from "../pages/Index";
import { Button } from './ui/button';

interface SpineViewerProps {
  files: SpineFiles;
  onBack: () => void;
}

export const SpineViewer = ({ files, onBack }: SpineViewerProps) => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<PIXI.Application | null>(null);
  const spineRef = useRef<Spine | null>(null);
  const hasInitializedRef = useRef<boolean>(false);

  const [isPlaying, setIsPlaying] = useState(true);
  const [loop, setLoop] = useState(true);
  const [speed, setSpeed] = useState(1.0);
  const [opacity, setOpacity] = useState(1.0);
  const [scale, setScale] = useState(1.0);
  const [smoothSwitch, setSmoothSwitch] = useState(false);
  const [selectedAnimation, setSelectedAnimation] = useState<string>("");
  const [animations, setAnimations] = useState<string[]>([]);
  const [infoPanelPos, setInfoPanelPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const draggingRef = useRef(false);
  const dragOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

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

        // Read atlas and JSON
        const atlasText = await files.atlasFile.text();
        const jsonText = await files.jsonFile.text();

        // Load Spine using official spine-pixi-v8
        try {
          const spine = await loadSpineFromFiles(
            jsonText,
            atlasText,
            files.imageFiles
          );

          // Position spine in center
          spine.x = app.screen.width / 2;
          spine.y = app.screen.height / 2;

          app.stage.addChild(spine);
          spineRef.current = spine;

          // Auto-fit scale to view
          try {
            const bounds = spine.getBounds();
            if (bounds.width > 0 && bounds.height > 0) {
              const padding = 0.8;
              const scaleX = (app.screen.width * padding) / bounds.width;
              const scaleY = (app.screen.height * padding) / bounds.height;
              const fitScale = Math.min(scaleX, scaleY);
              spine.scale.set(fitScale);
              setScale(fitScale);
              console.log('Auto-fit scale:', fitScale);
            }
          } catch (err) {
            console.warn('Failed to auto-fit scale:', err);
          }

          // Get available animations
          const availableAnimations = spine.skeleton.data.animations.map((anim: any) => anim.name);
          console.log('Available animations:', availableAnimations);
          setAnimations(availableAnimations);

          if (availableAnimations.length > 0) {
            const firstAnimation = availableAnimations[0];
            setSelectedAnimation(firstAnimation);
            spine.state.setAnimation(0, firstAnimation, true);
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
    if (!spineRef.current || !selectedAnimation) return;
    const state = spineRef.current.state;

    if (smoothSwitch && !loop) {
      // Queue next animation after current non-looping one
      state.addAnimation(0, selectedAnimation, loop, 0);
    } else {
      state.setAnimation(0, selectedAnimation, loop);
    }
  }, [selectedAnimation, loop, smoothSwitch]);

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

  // Update opacity
  useEffect(() => {
    if (spineRef.current) {
      spineRef.current.alpha = opacity;
    }
  }, [opacity]);

  // Update scale
  useEffect(() => {
    if (spineRef.current) {
      spineRef.current.scale.set(scale);
    }
  }, [scale]);

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Space") {
        e.preventDefault();
        setIsPlaying((prev) => !prev);
      } else if (e.code === "KeyR") {
        e.preventDefault();
        onBack();
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
  }, [onBack]);

  return (
    <div className="min-h-screen flex flex-col bg-background relative">
      <Controls
        isPlaying={isPlaying}
        onPlayPause={() => setIsPlaying(!isPlaying)}
        loop={loop}
        onLoopChange={setLoop}
        speed={speed}
        onSpeedChange={setSpeed}
        opacity={opacity}
        onOpacityChange={setOpacity}
        scale={scale}
        onScaleChange={setScale}
        smoothSwitch={smoothSwitch}
        onSmoothSwitchChange={setSmoothSwitch}
        selectedAnimation={selectedAnimation}
        animations={animations}
        onAnimationChange={setSelectedAnimation}
        onBack={onBack}
      />
      <div ref={canvasRef} className="flex-1" />

      {/* Draggable info panel */}
      <InfoPanel
        spine={spineRef.current}
        speed={speed}
        scale={scale}
        opacity={opacity}
        loop={loop}
        smoothSwitch={smoothSwitch}
        animations={animations}
        selectedAnimation={selectedAnimation}
        files={files}
        pos={infoPanelPos}
        setPos={setInfoPanelPos}
      />
    </div>
  );
};

interface InfoPanelProps {
  spine: Spine | null;
  speed: number;
  scale: number;
  opacity: number;
  loop: boolean;
  smoothSwitch: boolean;
  animations: string[];
  selectedAnimation: string;
  files: SpineFiles;
  pos: { x: number; y: number };
  setPos: (pos: { x: number; y: number }) => void;
}

const InfoPanel = ({
  spine,
  speed,
  scale,
  opacity,
  loop,
  smoothSwitch,
  animations,
  selectedAnimation,
  files,
  pos,
  setPos,
}: InfoPanelProps) => {
  const draggingRef = useRef(false);
  const dragOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const handleMouseDown = (e: React.MouseEvent) => {
    draggingRef.current = true;
    dragOffsetRef.current = {
      x: e.clientX - pos.x,
      y: e.clientY - pos.y,
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
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
    window.removeEventListener("mousemove", handleMouseMove);
    window.removeEventListener("mouseup", handleMouseUp);
  };

  const openFileInNewTab = (file: File) => {
    const url = URL.createObjectURL(file);
    window.open(url, "_blank");
  };

  const skeletonName = spine?.skeleton?.data?.name ?? "N/A";
  const bones = spine?.skeleton?.bones?.length ?? 0;
  const slots = spine?.skeleton?.slots?.length ?? 0;

  return (
    <div
      className="fixed z-20 bg-card/95 text-xs text-card-foreground border border-border rounded-md shadow-lg p-3 space-y-2 cursor-move"
      style={{ bottom: 16, right: 16, transform: `translate(${pos.x}px, ${pos.y}px)` }}
      onMouseDown={handleMouseDown}
    >
      <div className="font-semibold text-xs mb-1">Spine Info</div>
      <div className="space-y-1 text-[11px]">
        <div>Skeleton: {skeletonName}</div>
        <div>Animation: {selectedAnimation || "None"}</div>
        <div>Bones / Slots: {bones} / {slots}</div>
        <div>Animations: {animations.length}</div>
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
      <div className="text-[10px] text-muted-foreground mt-1">
        Hotkeys: 1–9 animations, Space play/pause, R close
      </div>
    </div>
  );
};

/**
 * Load Spine from files using @esotericsoftware/spine-pixi-v8
 */
async function loadSpineFromFiles(
  jsonText: string,
  atlasText: string,
  imageFiles: File[]
): Promise<Spine> {
  // Import core spine classes and SpineTexture bridge
  const { TextureAtlas, AtlasAttachmentLoader, SkeletonJson } = await import('@esotericsoftware/spine-core');
  const { SpineTexture } = await import('@esotericsoftware/spine-pixi-v8');

  // Create texture atlas from atlas text (no callback, per runtime API)
  const textureAtlas = new TextureAtlas(atlasText);

  // Load images as Pixi textures and connect them to atlas pages
  // We assume one image per page; map by filename
  for (const page of textureAtlas.pages) {
    // Find matching file by name
    const pageFile =
      imageFiles.find(f => f.name === page.name) ||
      imageFiles.find(f => f.name.toLowerCase().includes(page.name.toLowerCase().split('.')[0]));

    if (!pageFile) {
      console.warn(`No image file found for atlas page ${page.name}, using first image as fallback.`);
    }

    const fileToUse = pageFile || imageFiles[0];

    if (!fileToUse) {
      console.error('No image files provided for Spine atlas.');
      continue;
    }

    try {
      const url = URL.createObjectURL(fileToUse);

      // Load image manually
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = reject;
        img.crossOrigin = 'anonymous';
        img.src = url;
      });

      // Create Pixi texture & SpineTexture
      const pixiTexture = PIXI.Texture.from(img);
      const spineTex = SpineTexture.from(pixiTexture.source);

      // Attach to atlas page (this also sets region.texture)
      page.setTexture(spineTex);

      URL.revokeObjectURL(url);
    } catch (err) {
      console.error(`Failed to load image for atlas page ${page.name}:`, err);
    }
  }

  // Create attachment loader and skeleton JSON parser
  const atlasLoader = new AtlasAttachmentLoader(textureAtlas);
  const skeletonJson = new SkeletonJson(atlasLoader);
  const skeletonData = skeletonJson.readSkeletonData(JSON.parse(jsonText));

  // Create and return Spine instance
  const spine = new Spine(skeletonData);
  return spine;
}
