import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Application } from "@pixi/react";
import { Card } from "./ui/card";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { Checkbox } from "./ui/checkbox";
import { toast } from "sonner";
import { fetchSpineFilesFromUrl } from "../lib/urlFetcher";
import { SpineFiles } from "../pages/Index";
import { Sparkles, Loader2 } from "lucide-react";
import { spineViewerStore } from "../store/spineViewerStore";
import { fetchAndLoadSpinePreview } from "../lib/spinePreviewLoader";
import { getSortedPngUrlsFromEntry, spineKeyFromMapPath } from "../lib/spinesMapHelpers";
import { pruneSpineMapTileModels, clearAllSpineMapTileModels } from "../lib/spineMapTileModel";
import type { SpineEntry, SpineAction } from "../types/spinesMap";
import { SpineMapTilePixi, SpineMapTileChrome, SpineMapTilePlaceholder } from "./SpineMapTile";
import type { FileSpineLoader } from "../lib/FileSpineLoader";

export type { SpineEntry, SpineAction } from "../types/spinesMap";

const TILE_W = 300;
const CANVAS_H = 200;
const CHROME_H = 188;
const GAP = 16;
const CELL_W = TILE_W + GAP;
const CELL_H = CHROME_H + CANVAS_H + GAP;

type LoaderMap = Record<
  string,
  FileSpineLoader | { error: string } | "loading" | undefined
>;

interface SpinesMapViewerProps {
  spinesMapUrl: string;
  onSpineSelect: (files: SpineFiles) => void;
}

export const SpinesMapViewer = ({ spinesMapUrl, onSpineSelect }: SpinesMapViewerProps) => {
  const [spines, setSpines] = useState<SpineEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadingSpine, setLoadingSpine] = useState<string | null>(null);
  const [loaders, setLoaders] = useState<LoaderMap>({});
  const [boundsFollowAnim, setBoundsFollowAnim] = useState(false);
  const [cols, setCols] = useState(1);
  const containerRef = useRef<HTMLDivElement>(null);

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

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const compute = () => {
      const w = el.clientWidth;
      const c = Math.max(1, Math.floor((w + GAP) / CELL_W));
      setCols(c);
    };

    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const valid = new Set(spines.map((s) => s.path));
    pruneSpineMapTileModels(valid);
  }, [spines]);

  useEffect(() => () => clearAllSpineMapTileModels(), []);

  useEffect(() => {
    if (spines.length === 0) {
      setLoaders({});
      return;
    }

    const initial: LoaderMap = {};
    for (const s of spines) {
      initial[s.path] = "loading";
    }
    setLoaders(initial);

    let cancelled = false;

    for (const spine of spines) {
      const pngUrls = getSortedPngUrlsFromEntry(spine);
      const key = spineKeyFromMapPath(spine.path);
      void fetchAndLoadSpinePreview(spine.json, spine.atlas, pngUrls, key)
        .then((loader) => {
          if (cancelled) return;
          setLoaders((prev) => ({ ...prev, [spine.path]: loader }));
        })
        .catch((err) => {
          if (cancelled) return;
          const message = err instanceof Error ? err.message : "Load failed";
          setLoaders((prev) => ({ ...prev, [spine.path]: { error: message } }));
        });
    }

    return () => {
      cancelled = true;
    };
  }, [spines]);

  const rows = useMemo(() => Math.max(1, Math.ceil(spines.length / cols)), [spines.length, cols]);
  const gridW = cols * CELL_W - GAP;
  const gridH = rows * CELL_H - GAP;

  const handleActionClick = async (
    spine: SpineEntry,
    actionName: string,
    action: SpineAction,
    e: React.MouseEvent,
  ) => {
    e.stopPropagation();

    try {
      if (action.type === "fetch") {
        toast.loading(`Executing ${actionName}...`);
        const response = await fetch(action.url);

        if (!response.ok) {
          throw new Error(`Action failed: ${response.statusText} (${response.status})`);
        }

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

      const sortedPngUrls = getSortedPngUrlsFromEntry(spine);

      const files = await fetchSpineFilesFromUrl(spine.json, spine.atlas, sortedPngUrls);

      const spineFiles: SpineFiles = {
        jsonFile: files.jsonFile,
        atlasFile: files.atlasFile,
        imageFiles: files.imageFiles,
      };

      toast.dismiss();
      toast.success(`Loaded ${spine.name}`);

      const params = new URLSearchParams();
      params.set("jsonUrl", encodeURIComponent(spine.json));
      params.set("atlasUrl", encodeURIComponent(spine.atlas));
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

  const isReadyLoader = useCallback(
    (v: LoaderMap[string]): v is FileSpineLoader => {
      return v != null && v !== "loading" && !("error" in v);
    },
    [],
  );

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
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Sparkles className="w-5 h-5 text-primary" />
                <h1 className="text-2xl font-bold">Spines Map</h1>
              </div>
              <p className="text-sm text-muted-foreground">
                Found {spines.length} spine{spines.length !== 1 ? "s" : ""}
              </p>
            </div>
            <div className="flex items-center gap-2 rounded-md border border-border px-3 py-2">
              <Checkbox
                id="bounds-follow-anim"
                checked={boundsFollowAnim}
                onCheckedChange={(v) => setBoundsFollowAnim(v === true)}
              />
              <Label htmlFor="bounds-follow-anim" className="text-sm cursor-pointer leading-snug">
                Fit preview bounds to current animation
              </Label>
            </div>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            When off, bounds use each entry&apos;s <code className="rounded bg-muted px-1">boundsAnimation</code>{" "}
            (or the skeleton&apos;s first animation). Single WebGL context for all previews.
          </p>
        </Card>

        <Card className="p-4 overflow-hidden">
          <div ref={containerRef} className="w-full max-h-[85vh] overflow-y-auto rounded-md border border-border bg-muted/20">
            <div
              className="relative mx-auto"
              style={{ width: gridW, height: gridH }}
            >
              <div
                className="absolute left-0 top-0 z-0 overflow-hidden rounded-sm"
                style={{ width: gridW, height: gridH }}
              >
                <Application
                  width={gridW}
                  height={gridH}
                  backgroundColor={0x2a2a2a}
                  backgroundAlpha={1}
                  antialias
                  resolution={1}
                  autoDensity={false}
                >
                  {spines.map((spine, i) => {
                    const L = loaders[spine.path];
                    if (!isReadyLoader(L)) return null;
                    const col = i % cols;
                    const row = Math.floor(i / cols);
                    const pixiX = col * CELL_W;
                    const pixiY = row * CELL_H + CHROME_H;
                    return (
                      <SpineMapTilePixi
                        key={spine.path}
                        spine={spine}
                        loader={L}
                        spineKey={spineKeyFromMapPath(spine.path)}
                        tileW={TILE_W}
                        canvasH={CANVAS_H}
                        pixiX={pixiX}
                        pixiY={pixiY}
                        boundsFollowAnim={boundsFollowAnim}
                      />
                    );
                  })}
                </Application>
              </div>

              <div
                className="pointer-events-none absolute left-0 top-0 z-10"
                style={{ width: gridW, height: gridH }}
              >
                {spines.map((spine, i) => {
                  const L = loaders[spine.path];
                  const col = i % cols;
                  const row = Math.floor(i / cols);
                  const chromeLeft = col * CELL_W;
                  const chromeTop = row * CELL_H;
                  if (L === "loading" || L === undefined) {
                    return (
                      <SpineMapTilePlaceholder
                        key={`ph-${spine.path}`}
                        spine={spine}
                        chromeLeft={chromeLeft}
                        chromeTop={chromeTop}
                        tileW={TILE_W}
                        tileTotalH={CHROME_H + CANVAS_H}
                        status="loading"
                      />
                    );
                  }
                  if (L && typeof L === "object" && "error" in L) {
                    return (
                      <SpineMapTilePlaceholder
                        key={`ph-${spine.path}`}
                        spine={spine}
                        chromeLeft={chromeLeft}
                        chromeTop={chromeTop}
                        tileW={TILE_W}
                        tileTotalH={CHROME_H + CANVAS_H}
                        status={{ error: L.error }}
                      />
                    );
                  }
                  if (!isReadyLoader(L)) return null;
                  return (
                    <SpineMapTileChrome
                      key={`chrome-${spine.path}`}
                      spine={spine}
                      loader={L}
                      spineKey={spineKeyFromMapPath(spine.path)}
                      tileW={TILE_W}
                      chromeH={CHROME_H}
                      chromeLeft={chromeLeft}
                      chromeTop={chromeTop}
                      onOpenViewer={(e) => {
                        e.stopPropagation();
                        void handleSpineClick(spine);
                      }}
                      viewerLoading={loadingSpine === spine.name}
                      onActionClick={(name, action, ev) =>
                        void handleActionClick(spine, name, action, ev)
                      }
                    />
                  );
                })}
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};
