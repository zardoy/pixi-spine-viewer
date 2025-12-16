import { Play, Pause, X } from "lucide-react";
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

interface ControlsProps {
  isPlaying: boolean;
  onPlayPause: () => void;
  loop: boolean;
  onLoopChange: (loop: boolean) => void;
  speed: number;
  onSpeedChange: (speed: number) => void;
  scale: number;
  onScaleChange: (scale: number) => void;
  timeline: number;
  timelineDuration: number;
  onTimelineChange: (time: number) => void;
  smoothSwitch: boolean;
  onSmoothSwitchChange: (value: boolean) => void;
  debugBones: boolean;
  onDebugBonesChange: (value: boolean) => void;
  selectedAnimation: string;
  animations: string[];
  onAnimationChange: (animation: string) => void;
  selectedSkin: string;
  skins: string[];
  onSkinChange: (skin: string) => void;
  onBack: () => void;
}

const SPEED_PRESETS = [0.25, 0.5, 1.0, 1.5, 2.0];

export const Controls = ({
  isPlaying,
  onPlayPause,
  loop,
  onLoopChange,
  speed,
  onSpeedChange,
  scale,
  onScaleChange,
  timeline,
  timelineDuration,
  onTimelineChange,
  smoothSwitch,
  onSmoothSwitchChange,
  debugBones,
  onDebugBonesChange,
  selectedAnimation,
  animations,
  onAnimationChange,
  selectedSkin,
  skins,
  onSkinChange,
  onBack,
}: ControlsProps) => {
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
            onClick={onPlayPause}
            size="lg"
            className="gap-2 font-semibold min-w-32"
          >
            {isPlaying ? (
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
              checked={loop}
              onCheckedChange={onLoopChange}
            />
            <Label htmlFor="loop" className="cursor-pointer">
              Loop
            </Label>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Animation</Label>
            <Select value={selectedAnimation} onValueChange={onAnimationChange}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Select animation" />
              </SelectTrigger>
              <SelectContent>
                {animations.map((anim, index) => (
                  <SelectItem key={anim} value={anim}>
                    {index < 9 ? `${index + 1}. ` : ""}{anim}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {skins.length > 1 && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Skin (C to cycle)</Label>
              <Select value={selectedSkin} onValueChange={onSkinChange}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Select skin" />
                </SelectTrigger>
                <SelectContent>
                  {skins.map((skin) => (
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
                id="smoothSwitch"
                checked
                onCheckedChange={(val: boolean) => onSmoothSwitchChange(Boolean(val))}
                disabled
              />
              <Label htmlFor="smoothSwitch" className="cursor-pointer text-xs">
                Smooth switch (queue)
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="debugBones"
                checked={debugBones}
                onCheckedChange={(val: boolean) => onDebugBonesChange(Boolean(val))}
              />
              <Label htmlFor="debugBones" className="cursor-pointer text-xs">
                Debug bones / attachments (T)
              </Label>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">
              Speed: {speed.toFixed(2)}x
            </Label>
            <div className="flex gap-2">
              {SPEED_PRESETS.map((preset) => (
                <Button
                  key={preset}
                  onClick={() => onSpeedChange(preset)}
                  variant={speed === preset ? "default" : "outline"}
                  size="sm"
                  className="min-w-14"
                >
                  {preset}x
                </Button>
              ))}
            </div>
            <div className="flex items-center gap-2 min-w-48">
              <Slider
                value={[speed]}
                onValueChange={(value) => onSpeedChange(value[0])}
                min={0.1}
                max={3.0}
                step={0.1}
                className="flex-1"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">
              Timeline: {timelineDuration > 0 ? `${timeline.toFixed(2)}s / ${timelineDuration.toFixed(2)}s` : "N/A"}
            </Label>
            <div className="flex items-center gap-2 min-w-48">
              <Slider
                value={[Math.min(timeline, timelineDuration || 0)]}
                onValueChange={(value) => onTimelineChange(value[0])}
                min={0}
                max={timelineDuration || 0}
                step={timelineDuration ? timelineDuration / 200 : 0.01}
                className="flex-1"
                disabled={timelineDuration <= 0}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">
              Scale: {Math.round(scale * 100)}%
            </Label>
            <div className="flex items-center gap-2 min-w-48">
              <Slider
                value={[scale]}
                onValueChange={(value) => onScaleChange(value[0])}
                min={0.1}
                max={5.0}
                step={0.1}
                className="flex-1"
              />
              <Input
                type="number"
                value={Math.round(scale * 100)}
                onChange={(e) => onScaleChange(Number(e.target.value) / 100)}
                className="w-20"
                min={10}
                max={500}
              />
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
};
