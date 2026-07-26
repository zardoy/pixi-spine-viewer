import { useEffect, useRef } from 'react'
import { useSnapshot, ref } from 'valtio'
import { toast } from 'sonner'
import { PixiApp } from '@/components/PixiApp'
import { AtlasExplorerModal } from '@/components/AtlasExplorerModal'
import { AttachmentTestPanel } from '@/components/AttachmentTestPanel'
import { AttachmentHidePanel } from '@/components/AttachmentHidePanel'
import { AttachmentDownloadModal } from '@/components/AttachmentDownloadModal'
import { spineViewerStore, resetSpineViewerState, applyActionAfterAnimSwitch } from '@/store/spineViewerStore'
import { getAnimationKeyframeTimes } from '@/lib/animationUtils'
import { resetPageTitle, setSkeletonPageTitle } from '@/lib/pageTitle'
import type { SpineFiles } from '@/pages/Index'
import { NewUiSidebar } from './NewUiSidebar'
import { NewUiTimeline } from './NewUiTimeline'
import { NewUiPerfStats } from './NewUiPerfStats'
import { NewUiMobileTabs } from './NewUiMobileTabs'
import { CHECKER_BG_COLOR } from '@/lib/checkerboardBackground'

export function NewUiViewer({ files, onBack }: { files: SpineFiles; onBack: () => void }) {
  const snapshot = useSnapshot(spineViewerStore)

  useEffect(() => {
    setSkeletonPageTitle(files.jsonFile.name)
    spineViewerStore.files = ref(files)
    spineViewerStore.ui.selectedSkeleton = files.jsonFile.name.replace(/\.(json|skel)$/i, '')
    spineViewerStore.ui.availableSkeletonNames =
      files.skeletonFiles?.map((f) => f.name.replace(/\.(json|skel)$/i, '')) ?? []
    spineViewerStore.secondFiles = null
    spineViewerStore.secondSpineOffset = { x: 0, y: 0, scale: 1 }
    spineViewerStore.secondSpineOpacity = 1
    spineViewerStore.ui.secondSelectedAnimation = null
    spineViewerStore.ui.secondAnimations = []
    return () => {
      resetPageTitle()
      resetSpineViewerState()
    }
  }, [files])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const urlAnimation = params.get('animation')
    const urlSkin = params.get('skin')
    const urlTime = params.get('time')
    const urlBg = params.get('bg')

    if (urlAnimation) spineViewerStore.ui.selectedAnimation = urlAnimation
    if (urlSkin) spineViewerStore.ui.selectedSkin = urlSkin
    if (urlTime !== null) {
      const time = parseFloat(urlTime)
      if (!Number.isNaN(time)) {
        spineViewerStore.ui.timeline = time
        spineViewerStore.ui.isPlaying = false
      }
    }
    if (urlBg) spineViewerStore.ui.backgroundColor = urlBg
  }, [])

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) return
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return

      if (e.code === 'Space') {
        e.preventDefault()
        spineViewerStore.ui.isPlaying = !spineViewerStore.ui.isPlaying
        return
      }
      if (e.code === 'KeyL') {
        e.preventDefault()
        spineViewerStore.ui.loop = !spineViewerStore.ui.loop
        return
      }
      if (e.code === 'KeyR' && !e.shiftKey) {
        e.preventDefault()
        onBack()
        return
      }
      if (e.code === 'KeyT') {
        e.preventDefault()
        spineViewerStore.ui.debugBones = !spineViewerStore.ui.debugBones
      } else if (e.code === 'KeyS') {
        if (spineViewerStore.ui.selectedAnimation) {
          e.preventDefault()
          spineViewerStore.ui.resetCounter += 1
          spineViewerStore.ui.timeline = 0
        }
      } else if (e.code.startsWith('Digit')) {
        const digit = parseInt(e.code.replace('Digit', ''), 10)
        if (!Number.isNaN(digit) && digit >= 1 && digit <= 9) {
          const index = digit - 1
          const anim = spineViewerStore.ui.animations[index]
          if (anim && anim !== spineViewerStore.ui.selectedAnimation) {
            e.preventDefault()
            if (spineViewerStore.ui.selectedAnimation) {
              spineViewerStore.ui.previousAnimation = spineViewerStore.ui.selectedAnimation
            }
            spineViewerStore.ui.selectedAnimation = anim
            applyActionAfterAnimSwitch()
          }
        }
      } else if (e.code === 'KeyQ') {
        if (
          spineViewerStore.ui.previousAnimation &&
          spineViewerStore.ui.previousAnimation !== spineViewerStore.ui.selectedAnimation
        ) {
          e.preventDefault()
          const prevAnim = spineViewerStore.ui.previousAnimation
          spineViewerStore.ui.previousAnimation = spineViewerStore.ui.selectedAnimation
          spineViewerStore.ui.selectedAnimation = prevAnim
          applyActionAfterAnimSwitch()
        }
      } else if (e.code === 'KeyN') {
        if (spineViewerStore.ui.animations.length > 1) {
          e.preventDefault()
          const anims = spineViewerStore.ui.animations
          const idx = anims.indexOf(spineViewerStore.ui.selectedAnimation)
          const next = anims[(idx + 1) % anims.length]
          if (next && next !== spineViewerStore.ui.selectedAnimation) {
            if (spineViewerStore.ui.selectedAnimation) {
              spineViewerStore.ui.previousAnimation = spineViewerStore.ui.selectedAnimation
            }
            spineViewerStore.ui.selectedAnimation = next
            applyActionAfterAnimSwitch()
          }
        }
      } else if (e.code === 'KeyC') {
        if (spineViewerStore.ui.skins.length > 1) {
          e.preventDefault()
          const currentIndex = spineViewerStore.ui.skins.indexOf(spineViewerStore.ui.selectedSkin)
          const nextIndex = (currentIndex + 1) % spineViewerStore.ui.skins.length
          spineViewerStore.ui.selectedSkin = spineViewerStore.ui.skins[nextIndex]
        }
      } else if (e.code === 'BracketLeft' || e.code === 'BracketRight') {
        const scaleStep = e.shiftKey ? 0.1 : 0.01
        e.preventDefault()
        spineViewerStore.ui.userScaleOverride = true
        if (e.code === 'BracketLeft') {
          spineViewerStore.ui.scale = Math.max(0.01, spineViewerStore.ui.scale - scaleStep)
        } else {
          spineViewerStore.ui.scale = Math.min(10, spineViewerStore.ui.scale + scaleStep)
        }
      } else if (e.code === 'ArrowUp' || e.code === 'ArrowDown') {
        const anims = spineViewerStore.ui.animations
        if (anims.length <= 1) return
        e.preventDefault()
        const idx = anims.indexOf(spineViewerStore.ui.selectedAnimation)
        const delta = e.code === 'ArrowDown' ? 1 : -1
        const next = anims[(idx + delta + anims.length) % anims.length]
        if (next && next !== spineViewerStore.ui.selectedAnimation) {
          if (spineViewerStore.ui.selectedAnimation) {
            spineViewerStore.ui.previousAnimation = spineViewerStore.ui.selectedAnimation
          }
          spineViewerStore.ui.selectedAnimation = next
          applyActionAfterAnimSwitch()
        }
      } else if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
        const duration = spineViewerStore.ui.timelineDuration
        if (duration <= 0) return
        e.preventDefault()
        const step = e.shiftKey ? 0.5 : 0.1
        const delta = e.code === 'ArrowRight' ? step : -step
        const next = Math.max(0, Math.min(duration, spineViewerStore.ui.timeline + delta))
        spineViewerStore.ui.timeline = next
        spineViewerStore.ui.isPlaying = false
      } else if (e.code === 'Comma' || e.code === 'Period') {
        const spine = spineViewerStore.refs.spine
        const anim = spine?.skeleton?.data?.findAnimation?.(spineViewerStore.ui.selectedAnimation)
        if (!anim) return
        const keyframes = getAnimationKeyframeTimes(
          anim as Parameters<typeof getAnimationKeyframeTimes>[0],
        )
        const current = spineViewerStore.ui.timeline
        if (e.code === 'Comma') {
          const idx = keyframes.findIndex((t) => t >= current) - 1
          if (idx >= 0 && keyframes[idx] !== undefined) {
            e.preventDefault()
            spineViewerStore.ui.timeline = keyframes[idx]
            spineViewerStore.ui.isPlaying = false
          }
        } else {
          const idx = keyframes.findIndex((t) => t > current)
          if (idx >= 0 && keyframes[idx] !== undefined) {
            e.preventDefault()
            spineViewerStore.ui.timeline = keyframes[idx]
            spineViewerStore.ui.isPlaying = false
          }
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown, true)
    return () => window.removeEventListener('keydown', handleKeyDown, true)
  }, [onBack])

  const handleCopyUrl = () => {
    const params = new URLSearchParams()
    if (snapshot.ui.selectedAnimation) params.set('animation', snapshot.ui.selectedAnimation)
    if (snapshot.ui.selectedSkin) params.set('skin', snapshot.ui.selectedSkin)
    if (snapshot.ui.timeline > 0) params.set('time', snapshot.ui.timeline.toFixed(3))
    if (snapshot.ui.backgroundColor !== CHECKER_BG_COLOR) params.set('bg', snapshot.ui.backgroundColor)

    const url = `${window.location.origin}${window.location.pathname}?${params.toString()}`
    navigator.clipboard
      .writeText(url)
      .then(() => toast.success('URL copied to clipboard'))
      .catch(() => toast.error('Failed to copy URL'))
  }

  return (
    <div className="flex h-screen flex-col bg-background md:flex-row">
      <div className="hidden h-full w-full min-w-0 md:flex md:w-1/3 md:max-w-sm md:shrink-0 lg:max-w-md">
        <NewUiSidebar
          files={files}
          onBack={onBack}
          onCopyUrl={handleCopyUrl}
          section="all"
          className="w-full"
        />
      </div>

      <main className="flex min-h-0 min-w-0 flex-[2] flex-col pb-14 md:pb-0">
        <div className="relative min-h-0 flex-1">
          <PixiApp />
          <NewUiPerfStats />
        </div>
        <NewUiTimeline />
      </main>

      <NewUiMobileTabs files={files} onBack={onBack} onCopyUrl={handleCopyUrl} />

      <AtlasExplorerModal />
      <AttachmentTestPanel />
      <AttachmentHidePanel />
      <AttachmentDownloadModal />
    </div>
  )
}
