import { useEffect, useState, useRef } from "react";
import { Application, useExtend } from "@pixi/react";
import { SpineBase } from "../lib/SpineBase";
import { FileSpineLoader } from "../lib/FileSpineLoader";
import { Container } from "pixi.js";
import { Loader2 } from "lucide-react";

interface SpinePreviewProps {
  jsonUrl: string;
  atlasUrl: string;
  pngUrl: string;
  className?: string;
}

export const SpinePreview = ({ jsonUrl, atlasUrl, pngUrl, className }: SpinePreviewProps) => {
  const [loader, setLoader] = useState<FileSpineLoader | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const loadSpine = async () => {
      try {
        setLoading(true);
        setError(null);

        // Fetch all files
        const [jsonResponse, atlasResponse, pngResponse] = await Promise.all([
          fetch(jsonUrl),
          fetch(atlasUrl),
          fetch(pngUrl),
        ]);

        if (!jsonResponse.ok || !atlasResponse.ok || !pngResponse.ok) {
          throw new Error("Failed to fetch spine files");
        }

        if (cancelled) return;

        const [jsonBlob, atlasBlob, pngBlob] = await Promise.all([
          jsonResponse.blob(),
          atlasResponse.blob(),
          pngResponse.blob(),
        ]);

        if (cancelled) return;

        // Convert to File objects
        const jsonFile = new File([jsonBlob], "spine.json", { type: "application/json" });
        const atlasFile = new File([atlasBlob], "spine.atlas", { type: "text/plain" });
        const pngFile = new File([pngBlob], "spine.png", { type: "image/png" });

        // Read skeleton data
        const isSkelFile = jsonUrl.toLowerCase().endsWith('.skel');
        const skeletonData = isSkelFile
          ? await jsonFile.arrayBuffer()
          : await jsonFile.text();
        const atlasText = await atlasFile.text();

        if (cancelled) return;

        // Create loader
        const spineLoader = new FileSpineLoader(skeletonData, atlasText, [pngFile]);
        await spineLoader.loadSpine("preview");

        if (cancelled) return;

        setLoader(spineLoader);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : "Failed to load spine");
        setLoading(false);
      }
    };

    loadSpine();

    return () => {
      cancelled = true;
    };
  }, [jsonUrl, atlasUrl, pngUrl]);

  if (loading) {
    return (
      <div className={`flex items-center justify-center bg-muted/50 ${className || ""}`} style={{ minHeight: '200px' }}>
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !loader) {
    return (
      <div className={`flex items-center justify-center bg-muted/50 text-muted-foreground text-sm ${className || ""}`} style={{ minHeight: '200px' }}>
        {error || "Failed to load"}
      </div>
    );
  }

  return (
    <div className={`bg-muted/50 rounded overflow-hidden ${className || ""}`} style={{ minHeight: '200px', width: '100%' }}>
      <Application
        width={300}
        height={200}
        backgroundAlpha={0}
        antialias={true}
        autoDensity={true}
        resolution={window.devicePixelRatio || 1}
      >
        <SpinePreviewContent loader={loader} />
      </Application>
    </div>
  );
};

const SpinePreviewContent = ({ loader }: { loader: FileSpineLoader }) => {
  // useExtend must be used within Application context
  useExtend({ Container });

  return (
    <SpineBase
      spine="preview"
      spineLoader={loader}
      loop={true}
      playing={true}
      // animation and skin default to first available (when not specified)
      scale={{ x: 0.5, y: 0.5 }}
      x={150}
      y={100}
    />
  );
};
