import { useEffect, useState } from 'react'
import { FileSpineLoader } from '../lib/FileSpineLoader'
import { fetchAndLoadSpinePreview } from '../lib/spinePreviewLoader'
import { SvelteHost } from '../runtime/bridge/SvelteHost'
import SpinePreviewStage from '../runtime/SpinePreviewStage.svelte'
import { createSpinePreviewState } from '../runtime/state/spinePreviewState.svelte'
import { Loader2 } from 'lucide-react'

const PREVIEW_KEY = 'preview'
const CANVAS_W = 300
const CANVAS_H = 200
const PADDING = 14

interface SpinePreviewProps {
  jsonUrl: string
  atlasUrl: string
  pngUrl?: string // legacy
  pngUrls?: string[]
  className?: string
}

export const SpinePreview = ({ jsonUrl, atlasUrl, pngUrl, pngUrls, className }: SpinePreviewProps) => {
  const [loader, setLoader] = useState<FileSpineLoader | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [stageState] = useState(() => createSpinePreviewState(CANVAS_W, CANVAS_H, PADDING))
  const [stageApi] = useState(() => ({}))

  // The Svelte root reads this reactively; assigning is what drives the canvas.
  stageState.loader = loader

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        setLoading(true)
        setError(null)

        const imageUrls = pngUrls || (pngUrl ? [pngUrl] : [])
        if (imageUrls.length === 0) throw new Error('No image URLs')

        const spineLoader = await fetchAndLoadSpinePreview(
          jsonUrl,
          atlasUrl,
          imageUrls,
          PREVIEW_KEY,
        )

        if (cancelled) return
        setLoader(spineLoader)
        setLoading(false)
      } catch (err) {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Failed to load spine')
        setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [jsonUrl, atlasUrl, pngUrl, pngUrls])

  if (loading) {
    return (
      <div
        className={`flex items-center justify-center bg-muted/50 ${className ?? ''}`}
        style={{ minHeight: 200 }}
      >
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (error || !loader) {
    return (
      <div
        className={`flex items-center justify-center bg-muted/50 text-muted-foreground text-sm ${className ?? ''}`}
        style={{ minHeight: 200 }}
      >
        {error ?? 'Failed to load'}
      </div>
    )
  }

  return (
    <div
      className={`bg-muted/50 rounded overflow-hidden ${className ?? ''}`}
      style={{ minHeight: 200, width: '100%' }}
    >
      <SvelteHost
        component={SpinePreviewStage as never}
        state={stageState}
        api={stageApi}
        className="h-full w-full"
      />
    </div>
  )
}
