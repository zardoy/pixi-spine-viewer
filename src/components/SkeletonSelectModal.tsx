import { useEffect, useRef, useState } from "react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { SpineFiles } from "../pages/Index";
import type { PendingSkeletonSelection } from "../pages/Index";
import { spineViewerStore } from "../store/spineViewerStore";
import { toast } from "sonner";

interface SkeletonSelectModalProps {
  pending: PendingSkeletonSelection;
  onSelect: (files: SpineFiles) => void;
  onClose: () => void;
}

/** Fullscreen modal to pick which skeleton (.skel/.json) to load when multiple share an atlas. */
export const SkeletonSelectModal = ({ pending, onSelect, onClose }: SkeletonSelectModalProps) => {
  const [search, setSearch] = useState("");
  const [selecting, setSelecting] = useState(false);
  const searchRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setSearch("");
    setSelecting(false);
    if (searchRef.current) {
      searchRef.current.focus();
    }
  }, [pending]);

  const { skeletonFiles, atlasFile, imageFiles } = pending;
  const filtered =
    search.trim().length === 0
      ? skeletonFiles
      : skeletonFiles.filter((f: File) =>
          f.name.toLowerCase().includes(search.trim().toLowerCase())
        );

  const handleSelect = async (jsonFile: File) => {
    if (selecting) return;
    setSelecting(true);

    const files: SpineFiles = {
      jsonFile,
      atlasFile,
      imageFiles,
      skeletonFiles: skeletonFiles.length > 1 ? Array.from(skeletonFiles) : undefined,
    };
    spineViewerStore.ui.selectedSkeleton = jsonFile.name.replace(/\.(json|skel)$/i, '');
    spineViewerStore.ui.availableSkeletonNames = Array.from(skeletonFiles).map((f) =>
      f.name.replace(/\.(json|skel)$/i, '')
    );

    try {
      onSelect(files);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to load skeleton');
      setSelecting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-40 bg-background/90 backdrop-blur-sm flex items-center justify-center"
      onClick={onClose}
    >
      <div
        className="w-full h-full max-w-3xl mx-auto bg-card text-card-foreground border border-border shadow-xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex flex-col gap-1">
            <span className="font-semibold text-sm">Select skeleton to load</span>
            <span className="text-xs text-muted-foreground">
              Multiple .skel/.json files found with shared atlas. Choose which skeleton to load.
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={onClose}
          >
            ×
          </Button>
        </div>
        <div className="px-4 py-3 border-b border-border flex items-center gap-2">
          <Input
            ref={searchRef}
            placeholder="Filter skeletons..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 text-xs"
          />
          <div className="text-[11px] text-muted-foreground">
            {skeletonFiles.length} total, {filtered.length} shown
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-2 py-2">
          {filtered.length === 0 ? (
            <div className="px-2 py-4 text-xs text-muted-foreground">
              No skeletons match this filter.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {(filtered as File[]).map((f) => (
                <Button
                  key={f.name}
                  variant="outline"
                  size="sm"
                  className="justify-between text-xs"
                  onClick={() => handleSelect(f)}
                >
                  <span className="truncate mr-2">{f.name}</span>
                  <span className="text-[10px] text-muted-foreground">
                    Click to load
                  </span>
                </Button>
              ))}
            </div>
          )}
        </div>
        <div className="px-4 py-2 border-t border-border flex items-center justify-between text-[11px] text-muted-foreground">
          <span>Click outside or × to close</span>
          <span>Shared atlas + images</span>
        </div>
      </div>
    </div>
  );
};
