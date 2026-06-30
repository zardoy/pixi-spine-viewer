import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useSnapshot } from "valtio";
import { spineViewerStore } from "../store/spineViewerStore";
import { Button } from "./ui/button";
import {
  findAtlasPageImage,
  getAtlasPageAabb,
  parseAtlasPageNames,
  parseAtlasRegions,
  type AtlasRegionInfo,
} from "../spine-toolbox";

interface AtlasPageData {
  pageName: string;
  imageFile: File;
  regions: AtlasRegionInfo[];
}

function findRegionAtPoint(
  regions: AtlasRegionInfo[],
  atlasX: number,
  atlasY: number
): AtlasRegionInfo | null {
  for (let i = regions.length - 1; i >= 0; i--) {
    const { x, y, width, height } = getAtlasPageAabb(regions[i]);
    if (atlasX >= x && atlasX < x + width && atlasY >= y && atlasY < y + height) {
      return regions[i];
    }
  }
  return null;
}

function RegionPopover({
  region,
  clientX,
  clientY,
}: {
  region: AtlasRegionInfo;
  clientX: number;
  clientY: number;
}) {
  const { x, y, width, height } = getAtlasPageAabb(region);
  const offset = 12;
  const style: React.CSSProperties = {
    position: "fixed",
    left: clientX + offset,
    top: clientY + offset,
    zIndex: 60,
    pointerEvents: "none",
  };

  return createPortal(
    <div
      style={style}
      className="rounded-md border border-border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground shadow-lg max-w-xs"
    >
      <div className="font-medium truncate">{region.name}</div>
      <div className="text-[10px] text-muted-foreground font-mono mt-0.5">
        atlas: {x}, {y}, {width}, {height}
      </div>
      {region.degrees !== 0 && (
        <div className="text-[10px] text-muted-foreground">
          stored {region.degrees}° in slot (atlas rect is axis-aligned)
        </div>
      )}
      {region.index >= 0 && (
        <div className="text-[10px] text-muted-foreground">index: {region.index}</div>
      )}
    </div>,
    document.body
  );
}

function AtlasPageViewer({
  pageName,
  imageFile,
  regions,
}: {
  pageName: string;
  imageFile: File;
  regions: AtlasRegionInfo[];
}) {
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [naturalSize, setNaturalSize] = useState({ w: 0, h: 0 });
  const [hovered, setHovered] = useState<AtlasRegionInfo | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [displaySize, setDisplaySize] = useState({ w: 0, h: 0 });
  const imgRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    const url = URL.createObjectURL(imageFile);
    setImgUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [imageFile]);

  useEffect(() => {
    const img = imgRef.current;
    if (!img) return;
    const update = () => setDisplaySize({ w: img.clientWidth, h: img.clientHeight });
    const ro = new ResizeObserver(update);
    ro.observe(img);
    update();
    return () => ro.disconnect();
  }, [imgUrl]);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0 || naturalSize.w <= 0) return;

    const displayX = e.clientX - rect.left;
    const displayY = e.clientY - rect.top;
    const atlasX = (displayX / rect.width) * naturalSize.w;
    const atlasY = (displayY / rect.height) * naturalSize.h;

    setHovered(findRegionAtPoint(regions, atlasX, atlasY));
    setMousePos({ x: e.clientX, y: e.clientY });
  };

  const highlightStyle = (
    region: AtlasRegionInfo,
    displayW: number,
    displayH: number
  ): React.CSSProperties | undefined => {
    if (naturalSize.w <= 0 || naturalSize.h <= 0 || displayW <= 0 || displayH <= 0) {
      return undefined;
    }
    const scaleX = displayW / naturalSize.w;
    const scaleY = displayH / naturalSize.h;
    const { x, y, width, height } = getAtlasPageAabb(region);
    return {
      left: x * scaleX,
      top: y * scaleY,
      width: width * scaleX,
      height: height * scaleY,
    };
  };

  return (
    <div className="border border-border rounded-md bg-muted/30 overflow-hidden">
      <div className="px-3 py-2 border-b border-border bg-card/80 flex items-center justify-between gap-2">
        <span className="text-xs font-medium truncate">{pageName}</span>
        <span className="text-[10px] text-muted-foreground shrink-0">
          {regions.length} region{regions.length === 1 ? "" : "s"}
        </span>
      </div>
      <div className="p-3 flex justify-center">
        <div
          className="relative inline-block max-w-full cursor-crosshair"
          onMouseMove={handleMouseMove}
          onMouseLeave={() => setHovered(null)}
        >
          {imgUrl && (
            <img
              ref={imgRef}
              src={imgUrl}
              alt={pageName}
              className="max-w-full h-auto block"
              draggable={false}
              onLoad={(e) => {
                const img = e.currentTarget;
                setNaturalSize({ w: img.naturalWidth, h: img.naturalHeight });
                setDisplaySize({ w: img.clientWidth, h: img.clientHeight });
              }}
            />
          )}
          {naturalSize.w > 0 &&
            regions.map((r) => {
              const isHovered =
                hovered?.name === r.name &&
                hovered?.index === r.index &&
                hovered?.pageName === r.pageName;
              const style = highlightStyle(r, displaySize.w, displaySize.h);
              if (!style) return null;
              return (
                <div
                  key={r.index >= 0 ? `${r.name}-${r.index}` : r.name}
                  className={`absolute pointer-events-none border ${
                    isHovered
                      ? "border-primary bg-primary/25 z-10"
                      : "border-transparent"
                  }`}
                  style={{ ...style, transform: "none" }}
                />
              );
            })}
        </div>
      </div>
      {hovered && (
        <RegionPopover region={hovered} clientX={mousePos.x} clientY={mousePos.y} />
      )}
    </div>
  );
}

export function AtlasExplorerModal() {
  const state = useSnapshot(spineViewerStore);
  const open = state.ui.atlasExplorerModalOpen;
  const [pages, setPages] = useState<AtlasPageData[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) {
      setPages([]);
      return;
    }

    const files = spineViewerStore.files;
    if (!files) {
      setPages([]);
      return;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const atlasText = await files.atlasFile.text();
        const regions = parseAtlasRegions(atlasText);
        const pageOrder = parseAtlasPageNames(atlasText);
        const pageNames =
          pageOrder.length > 0
            ? pageOrder
            : [...new Set(regions.map((r) => r.pageName))];

        const byPage = new Map<string, AtlasRegionInfo[]>();
        for (const r of regions) {
          const list = byPage.get(r.pageName) ?? [];
          list.push(r);
          byPage.set(r.pageName, list);
        }

        const result: AtlasPageData[] = [];
        for (const pageName of pageNames) {
          const imageFile = findAtlasPageImage(pageName, files.imageFiles);
          if (!imageFile) continue;
          result.push({
            pageName,
            imageFile,
            regions: byPage.get(pageName) ?? [],
          });
        }

        if (!cancelled) setPages(result);
      } catch {
        if (!cancelled) setPages([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, state.files]);

  const totalRegions = useMemo(
    () => pages.reduce((sum, p) => sum + p.regions.length, 0),
    [pages]
  );

  if (!open) return null;

  const close = () => {
    spineViewerStore.ui.atlasExplorerModalOpen = false;
  };

  return (
    <div
      className="fixed inset-0 z-40 bg-background/90 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={close}
    >
      <div
        className="w-full max-w-4xl max-h-full bg-card text-card-foreground border border-border shadow-xl flex flex-col rounded-lg overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border shrink-0">
          <div className="flex flex-col gap-0.5">
            <span className="font-semibold text-sm">Explore atlas</span>
            <span className="text-xs text-muted-foreground">
              Hover regions to see names and bounds. {pages.length} page
              {pages.length === 1 ? "" : "s"}, {totalRegions} region
              {totalRegions === 1 ? "" : "s"}.
            </span>
          </div>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={close}>
            ×
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
          {loading ? (
            <div className="text-xs text-muted-foreground py-8 text-center">
              Loading atlas…
            </div>
          ) : pages.length === 0 ? (
            <div className="text-xs text-muted-foreground py-8 text-center">
              No atlas pages found.
            </div>
          ) : (
            pages.map((page) => (
              <AtlasPageViewer
                key={page.pageName}
                pageName={page.pageName}
                imageFile={page.imageFile}
                regions={page.regions}
              />
            ))
          )}
        </div>

        <div className="px-4 py-2 border-t border-border text-[11px] text-muted-foreground shrink-0">
          Click outside or × to close
        </div>
      </div>
    </div>
  );
}
