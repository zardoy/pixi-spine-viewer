import { useSnapshot } from 'valtio'
import { Button } from '@/components/ui/button'
import { Slider } from '@/components/ui/slider'
import { spineViewerStore } from '@/store/spineViewerStore'

const SPEED_MIN = 0.1
const SPEED_MAX = 3
const SPEED_STEP = 0.1
const SPEED_DEFAULT = 1

function formatSpeed(speed: number): string {
  return `${speed.toFixed(1)}x`
}

export function NewUiSpeedControl() {
  const { ui } = useSnapshot(spineViewerStore)

  return (
    <div className="absolute left-3 top-3 z-20 flex items-center gap-1.5 rounded-md border border-border/80 bg-background/90 px-1.5 py-1 shadow-md backdrop-blur-sm">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-6 shrink-0 px-1.5 text-[11px] font-medium tabular-nums"
        title="Reset speed to 1x"
        onClick={() => {
          spineViewerStore.ui.speed = SPEED_DEFAULT
        }}
      >
        1x
      </Button>
      <Slider
        value={[ui.speed]}
        onValueChange={(value) => {
          spineViewerStore.ui.speed = value[0]
        }}
        min={SPEED_MIN}
        max={SPEED_MAX}
        step={SPEED_STEP}
        className="w-20"
        aria-label="Playback speed"
      />
      <span className="w-8 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
        {formatSpeed(ui.speed)}
      </span>
    </div>
  )
}
