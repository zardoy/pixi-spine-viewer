import { useMemo } from 'react'
import { useSnapshot } from 'valtio'
import { ListOrdered, TimerOff, Timer } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@radix-ui/react-dropdown-menu'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import { cn } from '@/lib/utils'
import {
  spineViewerStore,
  applyActionAfterAnimSwitch,
} from '@/store/spineViewerStore'
import {
  formatAnimationMetaSuffix,
  getAnimationEvents,
  seekSortedMarkerTime,
} from '@/lib/animationUtils'

function selectAnimation(name: string, current: string) {
  if (name === current) return
  if (current) spineViewerStore.ui.previousAnimation = current
  spineViewerStore.ui.selectedAnimation = name
  applyActionAfterAnimSwitch()
}

export function seekSpineAnimationEvent(direction: -1 | 1): boolean {
  const spine = spineViewerStore.refs.spine
  const animName = spineViewerStore.ui.selectedAnimation
  if (!spine || !animName) return false
  const anim = spine.skeleton?.data?.findAnimation?.(animName)
  if (!anim) return false
  const events = getAnimationEvents(
    anim as Parameters<typeof getAnimationEvents>[0],
  )
  const times = events.map((ev) => ev.time)
  const next = seekSortedMarkerTime(times, spineViewerStore.ui.timeline, direction)
  if (next === null) return false
  spineViewerStore.ui.timeline = next
  spineViewerStore.ui.isPlaying = false
  return true
}

function seekToEventTime(time: number) {
  spineViewerStore.ui.timeline = time
  spineViewerStore.ui.isPlaying = false
}

export function NewUiAnimationList() {
  const { ui } = useSnapshot(spineViewerStore)
  const spine = spineViewerStore.refs.spine

  const animationMeta = useMemo(() => {
    const map = new Map<string, { events: number; duration: number }>()
    if (!spine?.skeleton?.data) return map
    for (const name of ui.animations) {
      const anim = spine.skeleton.data.findAnimation?.(name)
      if (!anim) continue
      const typed = anim as Parameters<typeof getAnimationEvents>[0]
      map.set(name, {
        events: getAnimationEvents(typed).length,
        duration: (anim as { duration?: number }).duration ?? 0,
      })
    }
    return map
  }, [spine, ui.animations])

  const previousAnim =
    ui.previousAnimation &&
    ui.previousAnimation !== ui.selectedAnimation &&
    ui.animations.includes(ui.previousAnimation)
      ? ui.previousAnimation
      : null

  const animationEvents = useMemo(() => {
    if (!spine || !ui.selectedAnimation) return []
    const anim = spine.skeleton?.data?.findAnimation?.(ui.selectedAnimation)
    if (!anim) return []
    return getAnimationEvents(anim as Parameters<typeof getAnimationEvents>[0])
  }, [spine, ui.selectedAnimation])

  const hotkeyLabel = (name: string, index: number): string => {
    if (previousAnim && name === previousAnim) return 'Q'
    if (index < 9) return String(index + 1)
    return ''
  }

  return (
    <div className="space-y-2">
      <div
        className="overflow-y-auto rounded-md border border-border bg-background/40"
        style={{ maxHeight: '11rem' }}
      >
        {ui.animations.map((name, index) => {
          const meta = animationMeta.get(name)
          const isSelected = name === ui.selectedAnimation
          const label = hotkeyLabel(name, index)

          return (
            <button
              key={name}
              type="button"
              className={cn(
                'flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm transition-colors',
                isSelected
                  ? 'bg-primary/15 text-foreground'
                  : 'hover:bg-accent/50',
              )}
              onClick={() => selectAnimation(name, ui.selectedAnimation)}
            >
              <span className="w-5 shrink-0 text-center text-xs font-medium text-muted-foreground">
                {label}
              </span>
              <span className="min-w-0 truncate">
                <span className={isSelected ? 'font-medium' : 'text-foreground/90'}>
                  {name}
                </span>
                {meta && (
                  <span className="text-muted-foreground">
                    {' '}
                    — {formatAnimationMetaSuffix(meta.events, meta.duration)}
                  </span>
                )}
              </span>
            </button>
          )
        })}
      </div>

      <p className="text-[11px] leading-snug text-muted-foreground">
        ↑↓ — next/prev anim · ←→ seek · E / Shift+E events
      </p>

      <div className="flex items-center gap-2">
        <Button
          type="button"
          variant={ui.mixTimeEnabled ? 'outline' : 'secondary'}
          size="icon"
          className="h-8 w-8 shrink-0"
          title={ui.mixTimeEnabled ? 'Disable mix (instant switch)' : 'Enable mix'}
          onClick={() => {
            spineViewerStore.ui.mixTimeEnabled = !ui.mixTimeEnabled
          }}
        >
          {ui.mixTimeEnabled ? (
            <Timer className="h-3.5 w-3.5" />
          ) : (
            <TimerOff className="h-3.5 w-3.5" />
          )}
        </Button>
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex items-center justify-between gap-2">
            <Label className="text-xs text-muted-foreground">Mix time</Label>
            <span className="text-xs tabular-nums text-muted-foreground">
              {ui.mixTimeEnabled ? `${ui.mixTime.toFixed(2)}s` : 'off'}
            </span>
          </div>
          <Slider
            value={[ui.mixTime]}
            onValueChange={(value) => {
              spineViewerStore.ui.mixTime = value[0]
              if (!ui.mixTimeEnabled) spineViewerStore.ui.mixTimeEnabled = true
            }}
            min={0}
            max={1}
            step={0.05}
            disabled={!ui.mixTimeEnabled}
            className="w-full"
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 shrink-0 gap-1 px-2"
              disabled={animationEvents.length === 0}
              title="Spine events (E next, Shift+E prev)"
            >
              <ListOrdered className="h-3.5 w-3.5" />
              <span className="text-xs">Events</span>
              {animationEvents.length > 0 && (
                <span className="text-[10px] tabular-nums text-muted-foreground">
                  {animationEvents.length}
                </span>
              )}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="z-[100] max-h-52 min-w-[14rem] overflow-y-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
          >
            {animationEvents.map((ev, index) => {
              const isActive = Math.abs(ui.timeline - ev.time) < 0.02
              return (
                <DropdownMenuItem
                  key={`${ev.name}-${ev.time}-${index}`}
                  className={cn(
                    'flex cursor-pointer items-center justify-between gap-3 rounded-sm px-2 py-1.5 text-sm',
                    'hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground',
                    isActive && 'bg-primary/10 text-foreground',
                  )}
                  onSelect={() => seekToEventTime(ev.time)}
                >
                  <span className="min-w-0 truncate">{ev.name}</span>
                  <span className="shrink-0 tabular-nums text-xs text-muted-foreground">
                    {ev.time.toFixed(2)}s
                  </span>
                </DropdownMenuItem>
              )
            })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}
