import { Play, Pause, X, Copy } from "lucide-react";
import { Button } from "./ui/button";
import { Checkbox } from "./ui/checkbox";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Slider } from "./ui/slider";
import { Card } from "./ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { useSnapshot } from "valtio";
import { spineViewerStore } from "../store/spineViewerStore";

interface ControlsProps {
  onCopyUrl: () => void;
  onBack: () => void;
}

const SPEED_PRESETS = [0.25, 0.5, 1.0, 1.5, 2.0];

export const Controls = ({
  onCopyUrl,
  onBack,
}: ControlsProps) => {
  const state = useSnapshot(spineViewerStore);
  const { ui } = state;
  return (
    <Card className="p-6 rounded-none border-x-0 border-t-0 border-b border-border relative">
      <div className="flex flex-wrap gap-6 items-center justify-between">
        <div className="flex items-center gap-4">
          <Button
            onClick={onBack}
            variant="ghost"
            size="sm"
            className="gap-2 text-muted-foreground hover:text-foreground"
            title="Close preview (R)"
          >
            <X className="w-4 h-4" />
            Close (R)
          </Button>
          <Button
            onClick={() => { spineViewerStore.ui.isPlaying = !spineViewerStore.ui.isPlaying; }}
            size="lg"
            className="gap-2 font-semibold min-w-32"
          >
            {ui.isPlaying ? (
              <>
                <Pause className="w-5 h-5" />
                Pause
              </>
            ) : (
              <>
                <Play className="w-5 h-5" />
                Play
              </>
            )}
          </Button>
          <div className="flex items-center gap-2">
            <Checkbox
              id="loop"
              checked={ui.loop}
              onCheckedChange={(val) => { spineViewerStore.ui.loop = Boolean(val); }}
            />
            <Label htmlFor="loop" className="cursor-pointer">
              Loop
            </Label>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor="bgColor" className="text-xs text-muted-foreground whitespace-nowrap">
              BG:
            </Label>
            <Input
              id="bgColor"
              type="color"
              value={ui.backgroundColor}
              onChange={(e) => { spineViewerStore.ui.backgroundColor = e.target.value; }}
              className="w-16 h-8 cursor-pointer"
              title="Background color"
            />
          </div>
          <Button
            onClick={onCopyUrl}
            variant="outline"
            size="sm"
            className="gap-2"
            title="Copy URL with current settings"
          >
            <Copy className="w-4 h-4" />
            Copy URL
          </Button>
        </div>

        <div className="flex items-center gap-6">
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Animation (Q: prev)</Label>
            <Select value={ui.selectedAnimation} onValueChange={(val) => {
              if (ui.selectedAnimation && ui.selectedAnimation !== val) {
                spineViewerStore.ui.previousAnimation = ui.selectedAnimation;
              }
              spineViewerStore.ui.selectedAnimation = val;
            }}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Select animation" />
              </SelectTrigger>
              <SelectContent>
                {ui.animations.map((anim, index) => (
                  <SelectItem key={anim} value={anim}>
                    {index < 9 ? `${index + 1}. ` : ""}{anim}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {ui.skins.length > 1 && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Skin (C to cycle)</Label>
              <Select value={ui.selectedSkin} onValueChange={(val) => { spineViewerStore.ui.selectedSkin = val; }}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Select skin" />
                </SelectTrigger>
                <SelectContent>
                  {ui.skins.map((skin) => (
                    <SelectItem key={skin} value={skin}>
                      {skin}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Checkbox
                id="debugBones"
                checked={ui.debugBones}
                onCheckedChange={(val: boolean) => { spineViewerStore.ui.debugBones = Boolean(val); }}
              />
              <Label htmlFor="debugBones" className="cursor-pointer text-xs">
                Debug bones / attachments (T)
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="debugBounds"
                checked={ui.debugBounds}
                onCheckedChange={(val: boolean) => { spineViewerStore.ui.debugBounds = Boolean(val); }}
              />
              <Label htmlFor="debugBounds" className="cursor-pointer text-xs">
                Debug bounds
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="autocenter"
                checked={ui.autocenter}
                onCheckedChange={(val: boolean) => { spineViewerStore.ui.autocenter = Boolean(val); }}
              />
              <Label htmlFor="autocenter" className="cursor-pointer text-xs">
                Auto center
              </Label>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">
              Speed: {ui.speed.toFixed(2)}x
            </Label>
            <div className="flex gap-2">
              {SPEED_PRESETS.map((preset) => (
                <Button
                  key={preset}
                  onClick={() => { spineViewerStore.ui.speed = preset; }}
                  variant={ui.speed === preset ? "default" : "outline"}
                  size="sm"
                  className="min-w-14"
                >
                  {preset}x
                </Button>
              ))}
            </div>
            <div className="flex items-center gap-2 min-w-48">
              <Slider
                value={[ui.speed]}
                onValueChange={(value) => { spineViewerStore.ui.speed = value[0]; }}
                min={0.1}
                max={3.0}
                step={0.1}
                className="flex-1"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">
              Timeline: {ui.timelineDuration > 0 ? `${ui.timeline.toFixed(2)}s / ${ui.timelineDuration.toFixed(2)}s` : "N/A"}
            </Label>
            <div className="flex items-center gap-2 min-w-48">
              <Slider
                value={[Math.min(ui.timeline, ui.timelineDuration || 0)]}
                onValueChange={(value) => { spineViewerStore.ui.timeline = value[0]; }}
                min={0}
                max={ui.timelineDuration || 0}
                step={ui.timelineDuration ? ui.timelineDuration / 200 : 0.01}
                className="flex-1"
                disabled={ui.timelineDuration <= 0}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">
              Scale: {Math.round(ui.scale * 100)}%
            </Label>
            <div className="flex items-center gap-2 min-w-48">
              <Slider
                value={[ui.scale]}
                onValueChange={(value) => { spineViewerStore.ui.scale = value[0]; }}
                min={0.1}
                max={5.0}
                step={0.1}
                className="flex-1"
              />
              <Input
                type="number"
                value={Math.round(ui.scale * 100)}
                onChange={(e) => { spineViewerStore.ui.scale = Number(e.target.value) / 100; }}
                className="w-20"
                min={10}
                max={500}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">
              Mix Time: {ui.mixTime.toFixed(2)}s
            </Label>
            <div className="flex items-center gap-2 min-w-48">
              <Slider
                value={[ui.mixTime]}
                onValueChange={(value) => { spineViewerStore.ui.mixTime = value[0]; }}
                min={0}
                max={2.0}
                step={0.01}
                className="flex-1"
              />
              <Input
                type="number"
                value={ui.mixTime.toFixed(2)}
                onChange={(e) => { spineViewerStore.ui.mixTime = Number(e.target.value); }}
                className="w-20"
                min={0}
                max={2}
                step={0.01}
              />
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
};
