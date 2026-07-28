import { useState } from 'react'
import { useSnapshot } from 'valtio'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { spineViewerStore } from '@/store/spineViewerStore'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

export function NewUiPerfStats() {
  const [collapsed, setCollapsed] = useState(false)
  const state = useSnapshot(spineViewerStore)
  const spine = spineViewerStore.refs.spine
  const isDestroyed = !spine || spine.destroyed

  const bones = !isDestroyed && spine?.skeleton?.bones ? spine.skeleton.bones.length : 0
  const slots = !isDestroyed && spine?.skeleton?.slots ? spine.skeleton.slots.length : 0

  let timelineCount = 0
  if (!isDestroyed && spine && state.ui.selectedAnimation) {
    const anim = spine.skeleton.data.findAnimation(state.ui.selectedAnimation)
    timelineCount = (anim as { timelines?: unknown[] } | null)?.timelines?.length ?? 0
  }

  return (
    <div
      className={cn(
        'absolute right-3 top-3 z-20 max-w-[14rem] rounded-lg border border-border/80 bg-background/90 text-sm shadow-md backdrop-blur-sm',
        collapsed ? 'p-1.5' : 'p-3',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Stats
        </span>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0"
          onClick={() => setCollapsed((v) => !v)}
          aria-expanded={!collapsed}
        >
          {collapsed ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronUp className="h-3.5 w-3.5" />}
        </Button>
      </div>

      {!collapsed && (
        <div className="mt-2 space-y-1 text-[13px] tabular-nums text-muted-foreground">
          <div className="flex justify-between gap-3">
            <span>FPS</span>
            <span className="text-foreground">{state.ui.fps.toFixed(1)}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span>Rendered</span>
            <span className="text-foreground">{state.ui.fpsRendered}</span>
          </div>
          {state.ui.frameTimeMs != null && (
            <div className="flex justify-between gap-3">
              <span>Frame</span>
              <span className="text-foreground">{state.ui.frameTimeMs.toFixed(1)} ms</span>
            </div>
          )}
          <div className="flex justify-between gap-3">
            <span>Draw calls</span>
            <span className="font-bold text-red-600">{state.ui.drawCalls}</span>
          </div>
          {state.ui.gpuTimerSupported && state.ui.gpuTimeMs != null && (
            <div className="flex justify-between gap-3">
              <span>GPU</span>
              <span className="text-foreground">{state.ui.gpuTimeMs.toFixed(2)} ms</span>
            </div>
          )}
          <div className="flex justify-between gap-3">
            <span>Bones / Slots</span>
            <span className="text-foreground">
              {bones} / {slots}
            </span>
          </div>
          <div className="flex justify-between gap-3">
            <span>Timelines</span>
            <span className="text-foreground">{timelineCount}</span>
          </div>
        </div>
      )}
    </div>
  )
}
