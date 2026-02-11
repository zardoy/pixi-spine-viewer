import { useEffect, useState, useRef } from "react";
import { Application, useExtend } from "@pixi/react";
import { Container } from "pixi.js";
import { SpineBase } from "../lib/SpineBase";
import { FileSpineLoader } from "../lib/FileSpineLoader";
import { SpineOverrideController } from "../lib/SpineOverrideController";
import { fetchSpineFilesFromUrl } from "../lib/urlFetcher";
import { SPINE_EXAMPLES } from "../lib/spineExamples";
import { Button } from "./ui/button";
import { Card } from "./ui/card";
import { toast } from "sonner";
import { ArrowLeft, Play } from "lucide-react";

const SPINE_KEY = 'override-playground-spine';
const OWL_EXAMPLE = SPINE_EXAMPLES.find(ex => ex.name.includes('Owl'))!;
const OVERRIDE_KEY = 'test-override';

export const OverridePlayground = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [fileSpineLoader, setFileSpineLoader] = useState<FileSpineLoader | null>(null);
  const [isLoaderReady, setIsLoaderReady] = useState(false);
  const canvasWrapperRef = useRef<HTMLDivElement>(null);
  const overrideControllerRef = useRef(new SpineOverrideController());
  const [log, setLog] = useState<string[]>([]);
  const [availableAnimations, setAvailableAnimations] = useState<string[]>([]);

  const addLog = (message: string) => {
    setLog(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${message}`]);
  };

  // Load owl example
  useEffect(() => {
    const loadOwl = async () => {
      try {
        setIsLoading(true);
        toast.loading('Loading owl example...');
        const files = await fetchSpineFilesFromUrl(OWL_EXAMPLE.jsonUrl, OWL_EXAMPLE.atlasUrl);

        const atlasText = await files.atlasFile.text();
        const isSkelFile = files.jsonFile.name.toLowerCase().endsWith('.skel');
        const skeletonData = isSkelFile
          ? await files.jsonFile.arrayBuffer()
          : await files.jsonFile.text();

        const loader = new FileSpineLoader(skeletonData, atlasText, files.imageFiles);
        await loader.loadSpine(SPINE_KEY);

        // Get available animations
        const skelData = loader.getSkeletonData(SPINE_KEY);
        if (skelData) {
          const anims = skelData.animations.map(a => a.name);
          setAvailableAnimations(anims);
          addLog(`Loaded with animations: ${anims.join(', ')}`);
        }

        setFileSpineLoader(loader);
        setIsLoaderReady(true);
        setIsLoading(false);
        toast.dismiss();
        toast.success('Owl example loaded');
      } catch (error) {
        setIsLoading(false);
        toast.dismiss();
        toast.error('Failed to load owl example: ' + (error instanceof Error ? error.message : 'Unknown error'));
      }
    };

    loadOwl();
  }, []);

  const handlePlayAnimation = (animIndex: number) => {
    const animation = availableAnimations[animIndex];
    if (!animation) return;

    addLog(`Setting override: ${animation}`);

    const start = Date.now();
    overrideControllerRef.current.setOverride(OVERRIDE_KEY, {
      animation,
      loop: false,
      onFinished: () => {
        const duration = Date.now() - start;
        addLog(`✓ Animation "${animation}" completed in ${duration}ms`);
        toast.success(`Animation completed: ${animation}`);
      },
    });
  };

  const handleClearOverride = () => {
    const controller = overrideControllerRef.current;
    const entry = controller.getOverride(OVERRIDE_KEY);
    if (entry) {
      controller.clearOverride(OVERRIDE_KEY, entry.counter);
      addLog('Override cleared manually');
      toast.info('Override cleared');
    }
  };

  const handleBack = () => {
    window.history.pushState({}, '', window.location.pathname);
    window.location.reload();
  };

  if (isLoading || !isLoaderReady || !fileSpineLoader) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <p className="text-muted-foreground">Loading owl example...</p>
        </div>
      </div>
    );
  }

  const baseAnimation = availableAnimations[0] || 'idle';

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar with controls */}
      <div className="w-80 border-r p-4 space-y-4 overflow-y-auto">
        <Button variant="outline" onClick={handleBack} className="w-full">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>

        <Card className="p-4">
          <h2 className="text-lg font-semibold mb-3">Override Controller Demo</h2>
          <p className="text-sm text-muted-foreground mb-4">
            This demo shows how animation overrides work. The base animation plays,
            but you can override it at any time. When the override completes, it returns to base.
          </p>

          <div className="space-y-2">
            <div className="text-sm font-medium">Base Animation: {baseAnimation}</div>

            <div className="border-t pt-3 mt-3">
              <div className="text-sm font-medium mb-2">Play Override:</div>
              <div className="space-y-1">
                {availableAnimations.slice(1).map((anim, idx) => (
                  <Button
                    key={anim}
                    size="sm"
                    variant="outline"
                    onClick={() => handlePlayAnimation(idx + 1)}
                    className="w-full"
                  >
                    <Play className="w-3 h-3 mr-2" />
                    {anim}
                  </Button>
                ))}
              </div>
            </div>

            <Button
              size="sm"
              variant="destructive"
              onClick={handleClearOverride}
              className="w-full mt-3"
            >
              Clear Override
            </Button>
          </div>
        </Card>

        <Card className="p-4">
          <h3 className="text-sm font-semibold mb-2">Event Log</h3>
          <div className="text-xs font-mono space-y-1 max-h-64 overflow-y-auto">
            {log.length === 0 ? (
              <div className="text-muted-foreground">No events yet</div>
            ) : (
              log.map((entry, idx) => (
                <div key={idx} className="text-muted-foreground">{entry}</div>
              ))
            )}
          </div>
        </Card>

        <Card className="p-4">
          <h3 className="text-sm font-semibold mb-2">How It Works</h3>
          <div className="text-xs text-muted-foreground space-y-2">
            <p>
              1. <strong>Base Animation:</strong> Always playing (looped)
            </p>
            <p>
              2. <strong>Override:</strong> Click any animation to override
            </p>
            <p>
              3. <strong>Completion:</strong> Override completes → returns to base
            </p>
            <p>
              4. <strong>Chain Overrides:</strong> Click multiple animations rapidly
              to see how the controller handles it correctly
            </p>
          </div>
        </Card>
      </div>

      {/* Canvas area */}
      <div ref={canvasWrapperRef} className="flex-1">
        <Application
          backgroundColor={0x1a1a1a}
          resizeTo={canvasWrapperRef}
          antialias
          resolution={window.devicePixelRatio || 1}
          autoDensity
        >
          <OverridePlaygroundContent
            loader={fileSpineLoader}
            baseAnimation={baseAnimation}
            overrideController={overrideControllerRef.current}
            onLog={addLog}
          />
        </Application>
      </div>
    </div>
  );
};

const OverridePlaygroundContent = ({
  loader,
  baseAnimation,
  overrideController,
  onLog,
}: {
  loader: FileSpineLoader;
  baseAnimation: string;
  overrideController: SpineOverrideController;
  onLog: (message: string) => void;
}) => {
  useExtend({ Container });

  const handleAnimComplete = (animName: string, resetCounter: number) => {
    onLog(`onCurrentAnimComplete: ${animName}, resetCounter: ${resetCounter}`);
  };

  return (
    <SpineBase
      spine={SPINE_KEY}
      animation={baseAnimation}
      loop={true}
      paused={false}
      spineLoader={loader}
      x={400}
      y={300}
      // overrideKey={OVERRIDE_KEY}
      // overrideController={overrideController}
      onCurrentAnimComplete={handleAnimComplete as any}
    />
  );
};
