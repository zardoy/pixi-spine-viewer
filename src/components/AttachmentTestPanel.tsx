import { useRef } from "react";
import { Label } from "./ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Button } from "./ui/button";
import { X } from "lucide-react";
import { useSnapshot } from "valtio";
import { spineViewerStore } from "../store/spineViewerStore";

export const AttachmentTestPanel = () => {
  const state = useSnapshot(spineViewerStore);
  const draggingRef = useRef(false);
  const dragOffsetRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const pos = state.ui.attachmentTestPanelPos;

  const handleMouseDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Don't start drag if clicking on interactive elements
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('[role="combobox"]')) {
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
    spineViewerStore.ui.attachmentTestPanelPos = {
      x: e.clientX - dragOffsetRef.current.x,
      y: e.clientY - dragOffsetRef.current.y,
    };
  };

  const handleMouseUp = () => {
    draggingRef.current = false;
    window.removeEventListener("pointermove", handleMouseMove);
    window.removeEventListener("pointerup", handleMouseUp);
  };

  // Don't render if panel is not visible
  if (!state.ui.attachmentTestPanelVisible) {
    return null;
  }

  return (
    <div
      className="fixed z-30 bg-card/95 text-card-foreground border border-border rounded-md shadow-lg p-4 space-y-3 cursor-move min-w-[280px]"
      style={{
        top: 16,
        left: 16,
        transform: `translate(${pos.x}px, ${pos.y}px)`,
      }}
      onPointerDown={handleMouseDown}
    >
      <div className="flex items-center justify-between">
        <div className="font-semibold text-sm">Attachment Test (Y)</div>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          onClick={(e) => {
            e.stopPropagation();
            spineViewerStore.ui.attachmentTestPanelVisible = false;
          }}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="space-y-2" onClick={(e) => e.stopPropagation()}>
        <Label className="text-xs text-muted-foreground">Select Attachment Slot</Label>
        <Select
          value={state.ui.selectedAttachmentSlot}
          onValueChange={(value) => {
            spineViewerStore.ui.selectedAttachmentSlot = value;
          }}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select slot..." />
          </SelectTrigger>
          <SelectContent>
            {state.ui.availableAttachmentSlots.length === 0 ? (
              <SelectItem value="" disabled>No slots available</SelectItem>
            ) : (
              state.ui.availableAttachmentSlots.map((slot) => (
                <SelectItem key={slot} value={slot}>
                  {slot}
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
        {state.ui.selectedAttachmentSlot && (
          <div className="text-xs text-muted-foreground pt-1">
            Red box will follow: <span className="font-medium">{state.ui.selectedAttachmentSlot}</span>
          </div>
        )}
      </div>
    </div>
  );
};
