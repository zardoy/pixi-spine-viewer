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
import { Checkbox } from "./ui/checkbox";
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
    if (target.closest('button') || target.closest('[role="combobox"]') || target.closest('[role="checkbox"]')) {
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
        <Label className="text-xs text-muted-foreground">Select target (bone or slot)</Label>
        <Select
          value={
            state.ui.attachmentFollowMode === 'bone' && state.ui.selectedAttachmentBone
              ? `bone/${state.ui.selectedAttachmentBone}`
              : state.ui.attachmentFollowMode === 'slot' && state.ui.selectedAttachmentSlot
                ? `slot/${state.ui.selectedAttachmentSlot}`
                : ''
          }
          onValueChange={(value) => {
            if (!value) return;
            if (value.startsWith('bone/')) {
              spineViewerStore.ui.attachmentFollowMode = 'bone';
              spineViewerStore.ui.selectedAttachmentBone = value.slice(5);
              spineViewerStore.ui.selectedAttachmentSlot = '';
            } else if (value.startsWith('slot/')) {
              spineViewerStore.ui.attachmentFollowMode = 'slot';
              spineViewerStore.ui.selectedAttachmentSlot = value.slice(5);
              spineViewerStore.ui.selectedAttachmentBone = '';
            }
          }}
        >
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select target..." />
          </SelectTrigger>
          <SelectContent>
            {state.ui.availableBones.length === 0 && state.ui.availableAttachmentSlots.length === 0 ? (
              <SelectItem value="" disabled>No bones or slots available</SelectItem>
            ) : (
              <>
                {state.ui.availableBones.map((bone) => (
                  <SelectItem key={`bone-${bone}`} value={`bone/${bone}`}>
                    bone/{bone}
                  </SelectItem>
                ))}
                {state.ui.availableAttachmentSlots.map((slot) => (
                  <SelectItem key={`slot-${slot}`} value={`slot/${slot}`}>
                    slot/{slot}
                  </SelectItem>
                ))}
              </>
            )}
          </SelectContent>
        </Select>
        <div className="flex flex-col gap-2 pt-1 border-t border-border">
          <div className="flex items-center gap-2">
            <Checkbox
              id="attachmentTestBlue"
              checked={state.ui.attachmentTestBoxBlue}
              onCheckedChange={(v) => {
                spineViewerStore.ui.attachmentTestBoxBlue = v === true;
              }}
            />
            <Label htmlFor="attachmentTestBlue" className="cursor-pointer text-xs">
              Blue box
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="attachmentTestLarge"
              checked={state.ui.attachmentTestBoxLarge}
              onCheckedChange={(v) => {
                spineViewerStore.ui.attachmentTestBoxLarge = v === true;
              }}
            />
            <Label htmlFor="attachmentTestLarge" className="cursor-pointer text-xs">
              2× size
            </Label>
          </div>
          {state.ui.attachmentFollowMode === 'slot' && (
            <div className="flex items-center gap-2">
              <Checkbox
                id="attachmentTestDrawOrder"
                checked={state.ui.attachmentTestUseSpineDrawOrder}
                onCheckedChange={(v) => {
                  spineViewerStore.ui.attachmentTestUseSpineDrawOrder = v === true;
                }}
              />
              <Label htmlFor="attachmentTestDrawOrder" className="cursor-pointer text-xs leading-snug">
                Spine draw order (above target slot only)
              </Label>
            </div>
          )}
        </div>
        {((state.ui.attachmentFollowMode === 'slot' && state.ui.selectedAttachmentSlot) ||
          (state.ui.attachmentFollowMode === 'bone' && state.ui.selectedAttachmentBone)) && (
          <div className="text-xs text-muted-foreground pt-1">
            {state.ui.attachmentTestBoxBlue ? "Blue" : "Red"} box will follow:{" "}
            <span className="font-medium">
              {state.ui.attachmentFollowMode === 'bone'
                ? `bone/${state.ui.selectedAttachmentBone}`
                : `slot/${state.ui.selectedAttachmentSlot}`}
            </span>
            {state.ui.attachmentFollowMode === 'slot' && (
              <span className="block mt-0.5">
                {state.ui.attachmentTestUseSpineDrawOrder
                  ? 'Rendered in spine draw order.'
                  : 'Rendered on top of all attachments.'}
              </span>
            )}
            {state.ui.attachmentFollowMode === 'bone' && (
              <span className="block mt-0.5">Bone follow always renders on top.</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
