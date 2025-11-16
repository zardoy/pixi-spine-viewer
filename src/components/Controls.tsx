import { Play, Pause, SkipBack, ArrowLeft, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Card } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ControlsProps {
  isPlaying: boolean;
  onPlayPause: () => void;
  loop: boolean;
  onLoopChange: (loop: boolean) => void;
  speed: number;
  onSpeedChange: (speed: number) => void;
  opacity: number;
  onOpacityChange: (opacity: number) => void;
  scale: number;
  onScaleChange: (scale: number) => void;
  selectedAnimation: string;
  animations: string[];
  onAnimationChange: (animation: string) => void;
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
  opacity,
  onOpacityChange,
  scale,
  onScaleChange,
  selectedAnimation,
  animations,
  onAnimationChange,
  onBack,
}: ControlsProps) => {
  return (
    <Card className="p-6 rounded-none border-x-0 border-t-0 border-b border-border relative">
      <div className="flex flex-wrap gap-6 items-center justify-between">
        <div className="flex items-center gap-4">
          <Button onClick={onBack} variant="outline" size="sm" className="gap-2">
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>
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
                {animations.map((anim) => (
                  <SelectItem key={anim} value={anim}>
                    {anim}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
              Opacity: {Math.round(opacity * 100)}%
            </Label>
            <div className="flex items-center gap-2 min-w-48">
              <Slider
                value={[opacity]}
                onValueChange={(value) => onOpacityChange(value[0])}
                min={0}
                max={1}
                step={0.05}
                className="flex-1"
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
