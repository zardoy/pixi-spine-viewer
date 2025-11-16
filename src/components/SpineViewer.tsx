import { useEffect, useRef, useState } from "react";
import * as PIXI from "pixi.js";
import { Spine } from "@esotericsoftware/spine-pixi-v8";
import { Controls } from "./Controls";
import { toast } from "sonner";
import { SpineFiles } from "../pages/Index";

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
  const [selectedAnimation, setSelectedAnimation] = useState<string>("");
  const [animations, setAnimations] = useState<string[]>([]);

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
          spine.scale.set(scale);

          app.stage.addChild(spine);
          spineRef.current = spine;

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
    if (spineRef.current && selectedAnimation) {
      spineRef.current.state.setAnimation(0, selectedAnimation, loop);
    }
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
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onBack]);

  return (
    <div className="min-h-screen flex flex-col bg-background">
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
        selectedAnimation={selectedAnimation}
        animations={animations}
        onAnimationChange={setSelectedAnimation}
        onBack={onBack}
      />
      <div ref={canvasRef} className="flex-1" />
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
