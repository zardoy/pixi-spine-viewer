import { useRef } from "react";
import { Label } from "./ui/label";
import { Checkbox } from "./ui/checkbox";
import { Button } from "./ui/button";
import { X } from "lucide-react";
import { useSnapshot } from "valtio";
import { spineViewerStore } from "../store/spineViewerStore";

export const AttachmentHidePanel = () => {
  const state = useSnapshot(spineViewerStore);
  const draggingRef = useRef(false);
  const dragOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const pos = state.ui.attachmentHidePanelPos;
  const paths = state.ui.availableTextureAttachmentPaths;
  const hidden = new Set(state.ui.hiddenAttachmentPaths);

  const handleMouseDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    if (target.closest("button") || target.closest('[role="checkbox"]')) {
      return;
    }
    draggingRef.current = true;
    dragOffsetRef.current = {
      x: e.clientX - pos.x,
      y: e.clientY - pos.y,
    };
    window.addEventListener("pointermove", handleMouseMove);
    window.addEventListener("pointerup", handleMouseUp);
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!draggingRef.current) return;
    spineViewerStore.ui.attachmentHidePanelPos = {
      x: e.clientX - dragOffsetRef.current.x,
      y: e.clientY - dragOffsetRef.current.y,
    };
  };

  const handleMouseUp = () => {
    draggingRef.current = false;
    window.removeEventListener("pointermove", handleMouseMove);
    window.removeEventListener("pointerup", handleMouseUp);
  };

  const togglePath = (path: string, checked: boolean) => {
    const prev = spineViewerStore.ui.hiddenAttachmentPaths;
    if (checked) {
      spineViewerStore.ui.hiddenAttachmentPaths = prev.filter((p) => p !== path);
    } else {
      spineViewerStore.ui.hiddenAttachmentPaths = prev.includes(path)
        ? prev
        : [...prev, path];
    }
  };

  if (!state.ui.attachmentHidePanelVisible) {
    return null;
  }

  return (
    <div
      className="fixed z-30 bg-card/95 text-card-foreground border border-border rounded-md shadow-lg p-4 space-y-3 cursor-move min-w-[280px] max-h-[70vh] flex flex-col"
      style={{
        top: 16,
        left: 16,
        transform: `translate(${pos.x}px, ${pos.y}px)`,
      }}
      onPointerDown={handleMouseDown}
    >
      <div className="flex items-center justify-between shrink-0">
        <div className="font-semibold text-sm">Hide Attachments (U)</div>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          onClick={(e) => {
            e.stopPropagation();
            spineViewerStore.ui.attachmentHidePanelVisible = false;
          }}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      <Label className="text-xs text-muted-foreground shrink-0">
        Uncheck to hide texture attachment
      </Label>
      <div
        className="overflow-y-auto space-y-2 min-h-0"
        onClick={(e) => e.stopPropagation()}
      >
        {paths.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            No texture attachments (load a spine)
          </p>
        ) : (
          paths.map((path) => (
            <label
              key={path}
              className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 rounded px-1 -mx-1 py-0.5"
            >
              <Checkbox
                checked={!hidden.has(path)}
                onCheckedChange={(checked) =>
                  togglePath(path, checked === true)
                }
              />
              <span className="text-xs truncate" title={path}>
                {path}
              </span>
            </label>
          ))
        )}
      </div>
    </div>
  );
};
