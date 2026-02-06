import { useEffect, useState } from "react";
import { Card } from "./ui/card";
import { Button } from "./ui/button";
import { toast } from "sonner";
import { fetchSpineFilesFromUrl } from "../lib/urlFetcher";
import { SpineFiles } from "../pages/Index";
import { Sparkles, Loader2 } from "lucide-react";
import { SpinePreview } from "./SpinePreview";

export interface SpineEntry {
  name: string;
  path: string;
  json: string;
  atlas: string;
  png: string;
}

interface SpinesMapViewerProps {
  spinesMapUrl: string;
  onSpineSelect: (files: SpineFiles) => void;
}

export const SpinesMapViewer = ({ spinesMapUrl, onSpineSelect }: SpinesMapViewerProps) => {
  const [spines, setSpines] = useState<SpineEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadingSpine, setLoadingSpine] = useState<string | null>(null);

  useEffect(() => {
    const loadSpinesMap = async () => {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch(spinesMapUrl);
        if (!response.ok) {
          throw new Error(`Failed to fetch spines map: ${response.statusText}`);
        }
        const data = await response.json();
        if (!Array.isArray(data)) {
          throw new Error("Spines map must be an array");
        }
        setSpines(data);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : "Failed to load spines map";
        setError(errorMessage);
        toast.error(errorMessage);
      } finally {
        setLoading(false);
      }
    };

    loadSpinesMap();
  }, [spinesMapUrl]);

  const handleSpineClick = async (spine: SpineEntry) => {
    try {
      setLoadingSpine(spine.name);
      toast.loading(`Loading ${spine.name}...`);

      // Download spine files from URLs (pass PNG URL explicitly)
      const files = await fetchSpineFilesFromUrl(spine.json, spine.atlas, spine.png);

      const spineFiles: SpineFiles = {
        jsonFile: files.jsonFile,
        atlasFile: files.atlasFile,
        imageFiles: files.imageFiles,
      };

      toast.dismiss();
      toast.success(`Loaded ${spine.name}`);
      
      // Update URL to include spine URLs as params (pushState for browser back/forward)
      const params = new URLSearchParams();
      params.set("jsonUrl", encodeURIComponent(spine.json));
      params.set("atlasUrl", encodeURIComponent(spine.atlas));
      params.set("pngUrl", encodeURIComponent(spine.png));
      window.history.pushState({}, "", `?${params.toString()}`);
      
      onSpineSelect(spineFiles);
    } catch (err) {
      toast.dismiss();
      const errorMessage = err instanceof Error ? err.message : "Failed to load spine";
      toast.error(errorMessage);
    } finally {
      setLoadingSpine(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-background via-background to-secondary">
        <Card className="max-w-2xl w-full p-12 text-center">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
            <p className="text-muted-foreground">Loading spines map...</p>
          </div>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-gradient-to-br from-background via-background to-secondary">
        <Card className="max-w-2xl w-full p-12 text-center">
          <div className="space-y-4">
            <p className="text-destructive font-semibold">Error loading spines map</p>
            <p className="text-muted-foreground">{error}</p>
            <Button onClick={() => window.location.reload()} variant="outline">
              Reload
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-6 bg-gradient-to-br from-background via-background to-secondary">
      <div className="max-w-6xl mx-auto">
        <Card className="p-6 mb-6">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-5 h-5 text-primary" />
            <h1 className="text-2xl font-bold">Spines Map</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Found {spines.length} spine{spines.length !== 1 ? "s" : ""}
          </p>
        </Card>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {spines.map((spine) => (
            <Card
              key={spine.path}
              className="p-4 hover:border-primary/50 transition-colors cursor-pointer flex flex-col"
              onClick={() => handleSpineClick(spine)}
            >
              <div className="space-y-2 flex-1 flex flex-col">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold text-lg">{spine.name}</h3>
                  {loadingSpine === spine.name && (
                    <Loader2 className="w-4 h-4 animate-spin text-primary" />
                  )}
                </div>
                <p className="text-sm text-muted-foreground font-mono">{spine.path}</p>
                
                {/* Spine Preview */}
                <div className="flex-1 min-h-[200px] my-2">
                  <SpinePreview
                    jsonUrl={spine.json}
                    atlasUrl={spine.atlas}
                    pngUrl={spine.png}
                    className="w-full h-full"
                  />
                </div>

                <Button
                  className="w-full"
                  variant="outline"
                  disabled={loadingSpine !== null}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSpineClick(spine);
                  }}
                >
                  {loadingSpine === spine.name ? "Loading..." : "View Spine"}
                </Button>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
};
