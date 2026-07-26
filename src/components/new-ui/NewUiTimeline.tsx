import { useMemo } from 'react'
import { useSnapshot } from 'valtio'
import { spineViewerStore } from '@/store/spineViewerStore'
import { getAnimationEvents, getAnimationKeyframeTimes } from '@/lib/animationUtils'
import { Slider } from '@/components/ui/slider'
import { cn } from '@/lib/utils'

export function NewUiTimeline() {
  const { ui } = useSnapshot(spineViewerStore)
  const spine = spineViewerStore.refs.spine

  const { keyframes, events } = useMemo(() => {
    if (!spine || !ui.selectedAnimation) {
      return { keyframes: [] as number[], events: [] as { name: string; time: number }[] }
    }
    const anim = spine.skeleton?.data?.findAnimation?.(ui.selectedAnimation)
    if (!anim) return { keyframes: [], events: [] }
    return {
      keyframes: getAnimationKeyframeTimes(anim as Parameters<typeof getAnimationKeyframeTimes>[0]),
      events: getAnimationEvents(anim as Parameters<typeof getAnimationEvents>[0]),
    }
  }, [spine, ui.selectedAnimation, ui.timelineDuration])

  const duration = ui.timelineDuration || 0
  const timeline = Math.min(ui.timeline, duration || ui.timeline)
  const pct = duration > 0 ? (timeline / duration) * 100 : 0

  const markers = useMemo(() => {
    const times = new Map<number, 'keyframe' | 'event'>()
    for (const t of keyframes) times.set(t, 'keyframe')
    for (const ev of events) times.set(ev.time, 'event')
    return Array.from(times.entries())
      .map(([time, kind]) => ({ time, kind, left: duration > 0 ? (time / duration) * 100 : 0 }))
      .filter((m) => m.left >= 0 && m.left <= 100)
  }, [keyframes, events, duration])

  return (
    <div className="shrink-0 border-t border-border bg-card/95 px-3 py-2.5 text-sm backdrop-blur-sm">
      <div className="mb-2 flex items-center gap-2 text-sm">
        <span className="truncate font-medium text-foreground/90">
          {ui.selectedAnimation || 'No animation'}
        </span>
        <span className="shrink-0 tabular-nums text-muted-foreground">
          {duration > 0 ? `${timeline.toFixed(2)}s / ${duration.toFixed(2)}s` : '—'}
        </span>
      </div>

      <div className="relative px-1">
        <div className="pointer-events-none absolute inset-x-1 top-1/2 h-2 -translate-y-1/2">
          {markers.map((m) => (
            <button
              key={`${m.kind}-${m.time}`}
              type="button"
              className={cn(
                'pointer-events-auto absolute top-0 h-full w-px -translate-x-1/2',
                m.kind === 'event' ? 'bg-amber-400/90' : 'bg-primary/35',
              )}
              style={{ left: `${m.left}%` }}
              title={`${m.kind === 'event' ? 'Event' : 'Keyframe'} @ ${m.time.toFixed(2)}s`}
              onClick={() => {
                spineViewerStore.ui.timeline = m.time
                spineViewerStore.ui.isPlaying = false
              }}
            />
          ))}
        </div>

        <Slider
          value={[timeline]}
          onValueChange={(value) => {
            spineViewerStore.ui.timeline = value[0]
            spineViewerStore.ui.isPlaying = false
          }}
          min={0}
          max={duration || 0}
          step={duration ? duration / 400 : 0.01}
          disabled={duration <= 0}
          className="relative z-10"
        />

        <div
          className="pointer-events-none absolute top-1/2 z-[5] h-2 w-0.5 -translate-y-1/2 bg-foreground/80"
          style={{ left: `calc(${pct}% + 4px)` }}
        />
      </div>
    </div>
  )
}
