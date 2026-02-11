import { useEffect, useState, useRef } from "react";
import { Application } from "@pixi/react";
import { Container } from "pixi.js";
import { SpineBase } from "../lib/SpineBase";
import { FileSpineLoader } from "../lib/FileSpineLoader";
import { fetchSpineFilesFromUrl } from "../lib/urlFetcher";
import { SPINE_EXAMPLES } from "../lib/spineExamples";
import { Button } from "./ui/button";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { useExtend } from "@pixi/react";

const SPINE_KEY = 'playground-spine';
const OWL_EXAMPLE = SPINE_EXAMPLES.find(ex => ex.name.includes('Owl'))!;

export const Playground = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [fileSpineLoader, setFileSpineLoader] = useState<FileSpineLoader | null>(null);
  const [isLoaderReady, setIsLoaderReady] = useState(false);
  const canvasWrapperRef = useRef<HTMLDivElement>(null);

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

  const skeletonData = fileSpineLoader.getSkeletonData(SPINE_KEY);
  const firstAnim = skeletonData?.animations?.[0];
  const animName = firstAnim?.name ?? '';

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="p-4 border-b">
        <Button variant="outline" onClick={handleBack}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
      </div>
      <div ref={canvasWrapperRef} className="flex-1">
        <Application
          backgroundColor={0x1a1a1a}
          resizeTo={canvasWrapperRef}
          antialias
          resolution={window.devicePixelRatio || 1}
          autoDensity
        >
          <PlaygroundContent loader={fileSpineLoader} animName={animName} />
        </Application>
      </div>
    </div>
  );
};

const PlaygroundContent = ({ loader, animName }: { loader: FileSpineLoader; animName: string }) => {
  useExtend({ Container });

  return (
    <SpineBase
      spine={SPINE_KEY}
      animation={animName}
      loop={false}
      paused={false}
      spineLoader={loader}
      x={400}
      y={300}
    />
  );
};
