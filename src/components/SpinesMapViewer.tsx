import { useEffect, useState } from "react";
import { Card } from "./ui/card";
import { Button } from "./ui/button";
import { toast } from "sonner";
import { fetchSpineFilesFromUrl } from "../lib/urlFetcher";
import { SpineFiles } from "../pages/Index";
import { Sparkles, Loader2, MoreVertical } from "lucide-react";
import { SpinePreview } from "./SpinePreview";
import { spineViewerStore } from "../store/spineViewerStore";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@radix-ui/react-dropdown-menu";

export interface SpineAction {
  type: "fetch";
  url: string;
}

export interface SpineEntry {
  name: string;
  path: string;
  json: string;
  atlas: string;
  png: string;
  actions?: Record<string, SpineAction>;
  // Support multiple PNG keys: png2, png3, etc.
  [key: string]: string | Record<string, SpineAction> | undefined;
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

  const handleActionClick = async (
    spine: SpineEntry,
    actionName: string,
    action: SpineAction,
    e: React.MouseEvent
  ) => {
    e.stopPropagation(); // Prevent card click

    try {
      if (action.type === "fetch") {
        toast.loading(`Executing ${actionName}...`);
        const response = await fetch(action.url);

        if (!response.ok) {
          throw new Error(`Action failed: ${response.statusText} (${response.status})`);
        }

        // Try to parse as JSON, but don't fail if it's not
        let result: unknown;
        const contentType = response.headers.get("content-type");
        if (contentType?.includes("application/json")) {
          result = await response.json();
        } else {
          result = await response.text();
        }

        toast.dismiss();
        toast.success(`${actionName} completed successfully`);
        console.log(`Action "${actionName}" result:`, result);
      } else {
        toast.error(`Unknown action type: ${(action as SpineAction).type}`);
      }
    } catch (err) {
      toast.dismiss();
      const errorMessage = err instanceof Error ? err.message : "Failed to execute action";
      toast.error(errorMessage);
    }
  };

  const handleSpineClick = async (spine: SpineEntry) => {
    try {
      setLoadingSpine(spine.name);
      toast.loading(`Loading ${spine.name}...`);

      // Collect all PNG keys (png, png2, png3, etc.)
      const pngUrls: string[] = [];
      for (const [key, value] of Object.entries(spine)) {
        if (key.startsWith('png') && typeof value === 'string' && value) {
          // Sort: png, png2, png3, etc. (png comes before png2 lexicographically, but we want numeric order)
          pngUrls.push(value);
        }
      }
      // Sort by key name to ensure png, png2, png3 order
      const pngKeys = Object.keys(spine).filter(k => k.startsWith('png') && typeof spine[k] === 'string').sort((a, b) => {
        const numA = a === 'png' ? 0 : parseInt(a.replace('png', '')) || 0;
        const numB = b === 'png' ? 0 : parseInt(b.replace('png', '')) || 0;
        return numA - numB;
      });
      const sortedPngUrls = pngKeys.map(k => spine[k] as string).filter(Boolean);

      // Download spine files from URLs (pass all PNG URLs)
      const files = await fetchSpineFilesFromUrl(spine.json, spine.atlas, sortedPngUrls);

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
      // Add all PNG URLs as separate params
      sortedPngUrls.forEach((url, index) => {
        params.set(index === 0 ? "pngUrl" : `pngUrl${index + 1}`, encodeURIComponent(url));
      });
      window.history.pushState({}, "", `?${params.toString()}`);
      
      spineViewerStore.ui.particleGeneratorPanelVisible = false;
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
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground font-mono">{spine.path}</p>
                  {spine.actions && Object.keys(spine.actions).length > 0 && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="min-w-[200px] bg-popover text-popover-foreground border border-border rounded-md shadow-md p-1 z-50">
                        {Object.entries(spine.actions).map(([actionName, action]) => (
                          <DropdownMenuItem
                            key={actionName}
                            className="cursor-pointer px-2 py-1.5 text-sm rounded-sm hover:bg-accent hover:text-accent-foreground"
                            onClick={(e) => handleActionClick(spine, actionName, action, e)}
                          >
                            {actionName}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
                
                {/* Spine Preview */}
                <div className="flex-1 min-h-[200px] my-2">
                  <SpinePreview
                    jsonUrl={spine.json}
                    atlasUrl={spine.atlas}
                    pngUrls={Object.keys(spine)
                      .filter(k => k.startsWith('png') && typeof spine[k] === 'string')
                      .sort((a, b) => {
                        const numA = a === 'png' ? 0 : parseInt(a.replace('png', '')) || 0;
                        const numB = b === 'png' ? 0 : parseInt(b.replace('png', '')) || 0;
                        return numA - numB;
                      })
                      .map(k => spine[k] as string)
                      .filter(Boolean)}
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
