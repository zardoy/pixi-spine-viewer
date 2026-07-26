import { useMemo } from 'react'
import { useSnapshot } from 'valtio'
import {
  ChevronLeft,
  ChevronRight,
  Pause,
  Play,
  RotateCcw,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { spineViewerStore } from '@/store/spineViewerStore'
import { getAnimationKeyframeTimes } from '@/lib/animationUtils'

export function NewUiPlaybackControl() {
  const { ui } = useSnapshot(spineViewerStore)
  const spine = spineViewerStore.refs.spine

  const keyframes = useMemo(() => {
    if (!spine || !ui.selectedAnimation) return [] as number[]
    const anim = spine.skeleton?.data?.findAnimation?.(ui.selectedAnimation)
    if (!anim) return []
    return getAnimationKeyframeTimes(anim as Parameters<typeof getAnimationKeyframeTimes>[0])
  }, [spine, ui.selectedAnimation, ui.timeline])

  const seekKeyframe = (direction: -1 | 1) => {
    if (!keyframes.length) return
    const current = ui.timeline
    if (direction < 0) {
      const idx = keyframes.findIndex((t) => t >= current) - 1
      if (idx >= 0 && keyframes[idx] !== undefined) {
        spineViewerStore.ui.timeline = keyframes[idx]
        spineViewerStore.ui.isPlaying = false
      }
      return
    }
    const idx = keyframes.findIndex((t) => t > current)
    if (idx >= 0 && keyframes[idx] !== undefined) {
      spineViewerStore.ui.timeline = keyframes[idx]
      spineViewerStore.ui.isPlaying = false
    }
  }

  return (
    <div className="grid grid-cols-4 gap-1.5">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-9"
        title="Reset animation (S)"
        onClick={() => {
          if (!ui.selectedAnimation) return
          spineViewerStore.ui.resetCounter += 1
          spineViewerStore.ui.timeline = 0
        }}
      >
        <RotateCcw className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-9"
        title="Previous keyframe (,)"
        onClick={() => seekKeyframe(-1)}
        disabled={keyframes.length === 0}
      >
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-9"
        title="Next keyframe (.)"
        onClick={() => seekKeyframe(1)}
        disabled={keyframes.length === 0}
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
      <Button
        type="button"
        size="sm"
        className="h-9"
        title="Play / Pause (Space)"
        onClick={() => {
          spineViewerStore.ui.isPlaying = !spineViewerStore.ui.isPlaying
        }}
      >
        {ui.isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
      </Button>
    </div>
  )
}
