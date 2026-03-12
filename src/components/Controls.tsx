import { Play, Pause, X, Copy, Rewind, Lock, Unlock } from "lucide-react";
import { Button } from "./ui/button";
import { ToggleIconButton } from "./ToggleIconButton";
import { Checkbox } from "./ui/checkbox";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Slider } from "./ui/slider";
import { Card } from "./ui/card";
import { NumericField } from "./NumericField";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { useSnapshot } from "valtio";
import { spineViewerStore, applyActionAfterAnimSwitch } from "../store/spineViewerStore";
import { getAnimationKeyframeTimes, getAnimationEvents } from "../lib/animationUtils";

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
  const spine = spineViewerStore.refs.spine;
  const anim = spine?.skeleton?.data?.findAnimation?.(ui.selectedAnimation);
  const animEvents = anim ? getAnimationEvents(anim as Parameters<typeof getAnimationEvents>[0]) : [];
  return (
    <Card className="p-6 rounded-none border-x-0 border-t-0 border-b border-border relative">
      <div className="flex flex-col gap-6">
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
              id="increaseResetOnAnimSwitch"
              checked={ui.increaseResetCounterOnAnimSwitch}
              onCheckedChange={(val) => { spineViewerStore.ui.increaseResetCounterOnAnimSwitch = Boolean(val); }}
            />
            <Label htmlFor="increaseResetOnAnimSwitch" className="cursor-pointer flex items-center gap-1.5">
              Increase reset on anim switch
              {ui.increaseResetCounterOnAnimSwitch && (
                <span className="text-xs text-muted-foreground font-mono">({ui.resetCounter})</span>
              )}
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
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">
              Scale: {Math.round(ui.scale * 100)}%
            </Label>
            <div className="flex items-center gap-2 min-w-48">
              <Slider
                value={[ui.scale]}
                onValueChange={(value) => { spineViewerStore.ui.scale = value[0]; }}
                min={0.1}
                max={1.5}
                step={0.05}
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
        </div>

        <div className="flex items-center gap-6">
          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">Animation (Q: prev, ,/. keyframes)</Label>
            <div className="flex items-center gap-1">
              <Select value={ui.selectedAnimation} onValueChange={(val) => {
                if (ui.selectedAnimation && ui.selectedAnimation !== val) {
                  spineViewerStore.ui.previousAnimation = ui.selectedAnimation;
                }
                spineViewerStore.ui.selectedAnimation = val;
                applyActionAfterAnimSwitch();
              }}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Select animation" />
                </SelectTrigger>
                <SelectContent>
                  {ui.animations.map((animName, index) => (
                    <SelectItem key={animName} value={animName}>
                      {index < 9 ? `${index + 1}. ` : ""}{animName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {animEvents.length > 0 && (
                <Select
                  value=""
                  onValueChange={(val) => {
                    const t = parseFloat(val);
                    if (!isNaN(t)) {
                      spineViewerStore.ui.timeline = t;
                      spineViewerStore.ui.isPlaying = false;
                    }
                  }}
                >
                  <SelectTrigger className="w-32 text-xs" title="Go to event">
                    <SelectValue placeholder="Go to event…" />
                  </SelectTrigger>
                  <SelectContent>
                    {animEvents.map((ev) => (
                      <SelectItem key={`${ev.name}-${ev.time}`} value={String(ev.time)}>
                        {ev.name} @ {ev.time.toFixed(2)}s
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          <div className="space-y-2">
            <Label className="text-xs text-muted-foreground">After anim switch</Label>
            <Select
              value={ui.actionAfterAnimSwitch}
              onValueChange={(val: 'same state' | 'force play' | 'force pause') => {
                spineViewerStore.ui.actionAfterAnimSwitch = val;
              }}
            >
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="same state">Same state</SelectItem>
                <SelectItem value="force play">Force play</SelectItem>
                <SelectItem value="force pause">Force pause</SelectItem>
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
          <div className="flex items-center gap-2">
            <Checkbox
              id="loop"
              checked={ui.loop}
              onCheckedChange={(val) => { spineViewerStore.ui.loop = Boolean(val); }}
            />
            <Label htmlFor="loop" className="cursor-pointer text-xs">
              Loop
            </Label>
          </div>

          {state.secondFiles && ui.secondAnimations.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Second Animation</Label>
              <Select
                value={ui.secondSelectedAnimation || ui.selectedAnimation}
                onValueChange={(val) => {
                  // If selecting the same as first, set to null to follow first
                  if (val === ui.selectedAnimation) {
                    spineViewerStore.ui.secondSelectedAnimation = null;
                  } else {
                    spineViewerStore.ui.secondSelectedAnimation = val;
                  }
                  applyActionAfterAnimSwitch();
                }}
              >
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Select animation" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ui.selectedAnimation}>
                    Follow First ({ui.selectedAnimation})
                  </SelectItem>
                  {ui.secondAnimations.map((anim, index) => (
                    <SelectItem key={anim} value={anim}>
                      {index < 9 ? `${index + 1}. ` : ""}{anim}
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
                id="guideBounds"
                checked={ui.guideBoundsEnabled}
                onCheckedChange={(val: boolean) => { spineViewerStore.ui.guideBoundsEnabled = Boolean(val); }}
              />
              <Label htmlFor="guideBounds" className="cursor-pointer text-xs">
                Guide border
              </Label>
            </div>
            {/* Positioning Mode */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Positioning</Label>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    id="positioning-auto"
                    name="positioning"
                    checked={ui.positioningMode === 'auto'}
                    onChange={() => { spineViewerStore.ui.positioningMode = 'auto'; }}
                    className="cursor-pointer"
                  />
                  <Label htmlFor="positioning-auto" className="cursor-pointer text-xs flex items-center gap-1.5">
                    Auto
                    <ToggleIconButton
                      active={ui.autoViewportLock}
                      onClick={() => { spineViewerStore.ui.autoViewportLock = !spineViewerStore.ui.autoViewportLock; }}
                      title="Lock viewport to all animations"
                      iconWhenActive={Lock}
                      iconWhenInactive={Unlock}
                    />
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    id="positioning-manual"
                    name="positioning"
                    checked={ui.positioningMode === 'manual'}
                    onChange={() => { spineViewerStore.ui.positioningMode = 'manual'; }}
                    className="cursor-pointer"
                  />
                  <Label htmlFor="positioning-manual" className="cursor-pointer text-xs">
                    Manual
                  </Label>
                </div>
              </div>
            </div>

          {/* Manual positioning controls */}
          {ui.positioningMode === 'manual' && (
            <div className="space-y-2 pl-4 border-l-2 border-border">
              <div className="flex gap-2">
                <NumericField
                  id="manual-x"
                  label="X"
                  value={ui.manualPosition.x}
                  onChange={(val) => { spineViewerStore.ui.manualPosition.x = val; }}
                  className="space-y-1 min-w-[5.5rem]"
                  inputClassName="w-24"
                />
                <NumericField
                  id="manual-y"
                  label="Y"
                  value={ui.manualPosition.y}
                  onChange={(val) => { spineViewerStore.ui.manualPosition.y = val; }}
                  className="space-y-1 min-w-[5.5rem]"
                  inputClassName="w-24"
                />
                <NumericField
                  id="guide-width"
                  label="Width"
                  value={ui.manualGuideSize.width}
                  onChange={(val) => { spineViewerStore.ui.manualGuideSize.width = val; }}
                  className="space-y-1 min-w-[5.5rem]"
                  inputClassName="w-24"
                />
                <NumericField
                  id="guide-height"
                  label="Height"
                  value={ui.manualGuideSize.height}
                  onChange={(val) => { spineViewerStore.ui.manualGuideSize.height = val; }}
                  className="space-y-1 min-w-[5.5rem]"
                  inputClassName="w-24"
                />
              </div>
            </div>
          )}
          </div>

          {/* Unload second spine button */}
          {state.secondFiles && (
            <div className="space-y-2">
              <Button
                onClick={() => {
                  spineViewerStore.secondFiles = null;
                  spineViewerStore.secondSpineOffset = { x: 0, y: 0, scale: 1 };
                  spineViewerStore.secondSpineOpacity = 1;
                  spineViewerStore.ui.secondSelectedAnimation = null;
                  spineViewerStore.ui.secondAnimations = [];
                }}
                variant="outline"
                size="sm"
                className="w-full"
              >
                <X className="w-3 h-3 mr-2" />
                Unload Second Spine
              </Button>
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground">
                Speed: {ui.speed.toFixed(2)}x
              </Label>
              <Button
                onClick={() => { spineViewerStore.ui.isReversed = !spineViewerStore.ui.isReversed; }}
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0"
                title={ui.isReversed ? "Forward" : "Reverse"}
              >
                <Rewind className={`w-4 h-4 ${ui.isReversed ? "rotate-180" : ""}`} />
              </Button>
            </div>
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
