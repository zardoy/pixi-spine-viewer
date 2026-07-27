import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Application } from "@pixi/react";
import { Card } from "./ui/card";
import { Button } from "./ui/button";
import { Label } from "./ui/label";
import { Checkbox } from "./ui/checkbox";
import { Slider } from "./ui/slider";
import { toast } from "sonner";
import { fetchSpineFilesFromUrl } from "../lib/urlFetcher";
import { SpineFiles } from "../pages/Index";
import { Sparkles, Loader2, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { spineViewerStore } from "../store/spineViewerStore";
import { CHECKERBOARD_CSS } from "../lib/checkerboardBackground";
import { fetchAndLoadSpinePreview, loadLocalSpinePreview } from "../lib/spinePreviewLoader";
import {
  getSortedPngUrlsFromEntry,
  spineKeyFromMapPath,
  resolveSpineBoundsData,
} from "../lib/spinesMapHelpers";
import type { LocalSpineEntry } from "../lib/localSpineFolderScan";
import { pruneSpineMapTileModels, clearAllSpineMapTileModels } from "../lib/spineMapTileModel";
import type { SpineEntry, SpineAction } from "../types/spinesMap";
import { SpineMapTilePixi, SpineMapTileChrome, SpineMapTilePlaceholder } from "./SpineMapTile";
import type { FileSpineLoader } from "../lib/FileSpineLoader";

export type { SpineEntry, SpineAction } from "../types/spinesMap";

/** Default square tile size; grid paginates to fit the screen. */
const DEFAULT_TILE = 400;
const GAP = 16;
const MIN_TILE = 160;
const MAX_TILE = 640;

/** Build a windowed list of page numbers (0-based) around the current page. */
function buildPageWindow(current: number, total: number, span = 2): number[] {
  const pages: number[] = [];
  const start = Math.max(0, current - span);
  const end = Math.min(total - 1, current + span);
  for (let i = start; i <= end; i++) pages.push(i);
  return pages;
}

type LoaderMap = Record<
  string,
  FileSpineLoader | { error: string } | "loading" | undefined
>;

interface SpinesMapViewerProps {
  spinesMapUrl?: string;
  localSpines?: LocalSpineEntry[];
  folderLabel?: string;
  onSpineSelect: (files: SpineFiles) => void;
  onBack?: () => void;
}

function localEntryToSpineEntry(entry: LocalSpineEntry): SpineEntry {
  return {
    name: entry.name,
    path: entry.path,
    json: `local:${entry.path}/skeleton`,
    atlas: `local:${entry.path}/atlas`,
    png: `local:${entry.path}/png`,
  };
}

export const SpinesMapViewer = ({
  spinesMapUrl,
  localSpines,
  folderLabel,
  onSpineSelect,
  onBack,
}: SpinesMapViewerProps) => {
  const [spines, setSpines] = useState<SpineEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadingSpine, setLoadingSpine] = useState<string | null>(null);
  const [loaders, setLoaders] = useState<LoaderMap>({});
  const [boundsFollowAnim, setBoundsFollowAnim] = useState(false);
  const [tileSize, setTileSize] = useState(DEFAULT_TILE);
  const [cols, setCols] = useState(1);
  const [rows, setRows] = useState(1);
  const [page, setPage] = useState(0);
  const [focusedSpinePath, setFocusedSpinePath] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const sidebarListRef = useRef<HTMLDivElement>(null);
  const spineItemRefs = useRef<Map<string, HTMLButtonElement>>(new Map());
  const cell = tileSize + GAP;
  const localFilesByPath = useMemo(() => {
    const map = new Map<string, SpineFiles>();
    for (const entry of localSpines ?? []) {
      map.set(entry.path, entry.files);
    }
    return map;
  }, [localSpines]);

  useEffect(() => {
    if (localSpines) {
      setLoading(true);
      setError(null);
      setSpines(localSpines.map(localEntryToSpineEntry));
      setLoading(false);
      return;
    }

    if (!spinesMapUrl) {
      setSpines([]);
      setLoading(false);
      return;
    }

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
  }, [spinesMapUrl, localSpines]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const compute = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      setCols(Math.max(1, Math.floor((w + GAP) / cell)));
      setRows(Math.max(1, Math.floor((h + GAP) / cell)));
    };

    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [cell]);

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
      const localFiles = localFilesByPath.get(spine.path);
      const loadPromise = localFiles
        ? loadLocalSpinePreview(localFiles, key)
        : fetchAndLoadSpinePreview(spine.json, spine.atlas, pngUrls, key);
      void loadPromise
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
  }, [spines, localFilesByPath]);

  const pageSize = Math.max(1, cols * rows);
  const totalPages = Math.max(1, Math.ceil(spines.length / pageSize));

  // Keep the current page in range whenever the layout (page size) changes.
  useEffect(() => {
    setPage((p) => Math.min(p, totalPages - 1));
  }, [totalPages]);

  const pageSpines = useMemo(
    () => spines.slice(page * pageSize, page * pageSize + pageSize),
    [spines, page, pageSize],
  );

  const goToPage = useCallback(
    (nextPage: number) => {
      const clamped = Math.max(0, Math.min(totalPages - 1, nextPage));
      setPage(clamped);
      const firstOnPage = spines[clamped * pageSize];
      if (firstOnPage) {
        setFocusedSpinePath(firstOnPage.path);
      }
    },
    [spines, pageSize, totalPages],
  );

  const goToSpineIndex = useCallback(
    (index: number) => {
      if (index < 0 || index >= spines.length) return;
      const targetPage = Math.floor(index / pageSize);
      setPage(targetPage);
      const spine = spines[index];
      setFocusedSpinePath(spine.path);
      requestAnimationFrame(() => {
        spineItemRefs.current.get(spine.path)?.scrollIntoView({ block: 'nearest' });
      });
    },
    [spines, pageSize],
  );

  useEffect(() => {
    if (!focusedSpinePath) return;
    spineItemRefs.current.get(focusedSpinePath)?.scrollIntoView({ block: 'nearest' });
  }, [page, focusedSpinePath]);

  useEffect(() => {
    if (spines.length === 0) {
      setFocusedSpinePath(null);
      return;
    }
    if (!focusedSpinePath || !spines.some((s) => s.path === focusedSpinePath)) {
      setFocusedSpinePath(spines[0].path);
    }
  }, [spines, focusedSpinePath]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goToPage(page - 1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        goToPage(page + 1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [goToPage, page]);

  const gridW = cols * cell - GAP;
  const gridH = rows * cell - GAP;

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
    const localFiles = localFilesByPath.get(spine.path);
    let loadingToastId: string | number | undefined;

    try {
      setLoadingSpine(spine.name);

      if (!localFiles) {
        loadingToastId = toast.loading(`Loading ${spine.name}...`);
      }

      let spineFiles: SpineFiles;

      if (localFiles) {
        spineFiles = localFiles;
      } else {
        const sortedPngUrls = getSortedPngUrlsFromEntry(spine);
        const files = await fetchSpineFilesFromUrl(spine.json, spine.atlas, sortedPngUrls);
        spineFiles = {
          jsonFile: files.jsonFile,
          atlasFile: files.atlasFile,
          imageFiles: files.imageFiles,
        };

        const params = new URLSearchParams();
        params.set("jsonUrl", spine.json);
        params.set("atlasUrl", spine.atlas);
        sortedPngUrls.forEach((url, index) => {
          params.set(index === 0 ? "pngUrl" : `pngUrl${index + 1}`, url);
        });
        window.history.pushState({}, "", `?${params.toString()}`);
      }

      if (loadingToastId !== undefined) {
        toast.dismiss(loadingToastId);
      }

      spineViewerStore.ui.particleGeneratorPanelVisible = false;
      onSpineSelect(spineFiles);
    } catch (err) {
      if (loadingToastId !== undefined) {
        toast.error(
          err instanceof Error ? err.message : 'Failed to load spine',
          { id: loadingToastId },
        );
      } else {
        const errorMessage = err instanceof Error ? err.message : 'Failed to load spine';
        toast.error(errorMessage);
      }
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
    <div className="flex h-screen overflow-hidden bg-gradient-to-br from-background via-background to-secondary">
      <aside
        className="flex w-56 shrink-0 flex-col border-r border-border bg-card/50 md:w-64"
        aria-label="Spine list"
      >
        <div className="shrink-0 border-b border-border p-3">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Spines
          </p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {spines.length} total
          </p>
          <div className="mt-3 flex items-center gap-1">
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-8 w-8 shrink-0"
              aria-label="Previous page"
              disabled={page <= 0}
              onClick={() => goToPage(page - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="min-w-0 flex-1 text-center text-xs text-muted-foreground">
              Page {page + 1} / {totalPages}
            </span>
            <Button
              type="button"
              variant="outline"
              size="icon"
              className="h-8 w-8 shrink-0"
              aria-label="Next page"
              disabled={page >= totalPages - 1}
              onClick={() => goToPage(page + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div ref={sidebarListRef} className="min-h-0 flex-1 overflow-y-auto p-2">
          <ul className="flex flex-col gap-0.5">
            {spines.map((spine, index) => {
              const spinePage = Math.floor(index / pageSize);
              const isOnCurrentPage = spinePage === page;
              const isFocused = spine.path === focusedSpinePath;
              const loaderState = loaders[spine.path];
              const hasError =
                loaderState != null &&
                loaderState !== 'loading' &&
                typeof loaderState === 'object' &&
                'error' in loaderState;

              return (
                <li key={spine.path}>
                  <button
                    type="button"
                    ref={(el) => {
                      if (el) spineItemRefs.current.set(spine.path, el);
                      else spineItemRefs.current.delete(spine.path);
                    }}
                    className={[
                      'w-full rounded-md px-2.5 py-2 text-left text-sm transition-colors',
                      isFocused
                        ? 'bg-primary text-primary-foreground'
                        : isOnCurrentPage
                          ? 'bg-muted text-foreground'
                          : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
                      hasError && !isFocused ? 'text-destructive/80' : '',
                    ].join(' ')}
                    onClick={() => goToSpineIndex(index)}
                    title={spine.path}
                  >
                    <span className="line-clamp-2 break-words leading-snug">{spine.name}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-hidden p-4">
      <Card className="shrink-0 p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {onBack ? (
              <Button type="button" variant="outline" size="sm" onClick={onBack}>
                Back
              </Button>
            ) : null}
            <Sparkles className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-bold">Spines Explorer</h1>
            <span className="text-sm text-muted-foreground">
              {spines.length} spine{spines.length !== 1 ? "s" : ""}
              {folderLabel ? ` · ${folderLabel}` : ""}
            </span>
          </div>

          {/* Pagination controls */}
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              aria-label="First page"
              disabled={page <= 0}
              onClick={() => goToPage(0)}
            >
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              aria-label="Previous page"
              disabled={page <= 0}
              onClick={() => goToPage(page - 1)}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            {buildPageWindow(page, totalPages).map((p) => (
              <Button
                key={p}
                variant={p === page ? "default" : "outline"}
                size="icon"
                className="h-8 w-8 text-xs"
                aria-label={`Page ${p + 1}`}
                aria-current={p === page ? "page" : undefined}
                onClick={() => goToPage(p)}
              >
                {p + 1}
              </Button>
            ))}
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              aria-label="Next page"
              disabled={page >= totalPages - 1}
              onClick={() => goToPage(page + 1)}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              aria-label="Last page"
              disabled={page >= totalPages - 1}
              onClick={() => goToPage(totalPages - 1)}
            >
              <ChevronsRight className="h-4 w-4" />
            </Button>
            <span className="ml-2 text-xs text-muted-foreground">
              Page {page + 1} / {totalPages}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="flex min-w-[14rem] items-center gap-2 rounded-md border border-border px-3 py-1.5">
              <Label className="shrink-0 text-sm">Tile {tileSize}px</Label>
              <Slider
                value={[tileSize]}
                onValueChange={(value) => setTileSize(value[0])}
                min={MIN_TILE}
                max={MAX_TILE}
                step={20}
                className="w-24"
              />
              <span className="shrink-0 text-xs text-muted-foreground">
                {cols}×{rows} ({pageSize}/page)
              </span>
            </div>

            <div className="flex items-center gap-2 rounded-md border border-border px-3 py-1.5">
              <Checkbox
                id="bounds-follow-anim"
                checked={boundsFollowAnim}
                onCheckedChange={(v) => setBoundsFollowAnim(v === true)}
              />
              <Label htmlFor="bounds-follow-anim" className="cursor-pointer text-sm leading-snug">
                Fit bounds to current animation
              </Label>
            </div>
          </div>
        </div>
      </Card>

      <Card className="flex min-h-0 flex-1 overflow-hidden p-3">
        <div
          ref={containerRef}
          className="flex h-full w-full items-center justify-center overflow-hidden rounded-md border border-border bg-muted/20"
        >
          <div className="relative" style={{ width: gridW, height: gridH }}>
            <div
              className="absolute left-0 top-0 z-0 overflow-hidden rounded-sm"
              style={{
                width: gridW,
                height: gridH,
                background: CHECKERBOARD_CSS,
              }}
            >
              <Application
                width={gridW}
                height={gridH}
                backgroundAlpha={0}
                antialias
                resolution={1}
                autoDensity={false}
              >
                {pageSpines.map((spine, i) => {
                  const L = loaders[spine.path];
                  if (!isReadyLoader(L)) return null;
                  const col = i % cols;
                  const row = Math.floor(i / cols);
                  const spineKey = spineKeyFromMapPath(spine.path);
                  const boundsData = resolveSpineBoundsData(
                    spine,
                    L.getSkeletonData(spineKey)?.name,
                  );
                  return (
                    <SpineMapTilePixi
                      key={spine.path}
                      spine={spine}
                      loader={L}
                      spineKey={spineKey}
                      tileW={tileSize}
                      tileH={tileSize}
                      pixiX={col * cell}
                      pixiY={row * cell}
                      boundsFollowAnim={boundsFollowAnim}
                      boundsData={boundsData}
                    />
                  );
                })}
              </Application>
            </div>

            <div
              className="pointer-events-none absolute left-0 top-0 z-10"
              style={{ width: gridW, height: gridH }}
            >
              {pageSpines.map((spine, i) => {
                const L = loaders[spine.path];
                const col = i % cols;
                const row = Math.floor(i / cols);
                const left = col * cell;
                const top = row * cell;
                if (L === "loading" || L === undefined) {
                  return (
                    <SpineMapTilePlaceholder
                      key={`ph-${spine.path}`}
                      spine={spine}
                      left={left}
                      top={top}
                      tileW={tileSize}
                      tileH={tileSize}
                      status="loading"
                    />
                  );
                }
                if (L && typeof L === "object" && "error" in L) {
                  return (
                    <SpineMapTilePlaceholder
                      key={`ph-${spine.path}`}
                      spine={spine}
                      left={left}
                      top={top}
                      tileW={tileSize}
                      tileH={tileSize}
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
                    tileW={tileSize}
                    tileH={tileSize}
                    left={left}
                    top={top}
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
