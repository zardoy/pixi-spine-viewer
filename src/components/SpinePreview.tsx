import { useEffect, useState, useRef } from 'react'
import { Application, useApplication, useExtend } from '@pixi/react'
import { SpineBase } from '../lib/SpineBase'
import { FileSpineLoader } from '../lib/FileSpineLoader'
import { computeFirstFrameBounds, boundsToContainTransform } from '../lib/spineUtils'
import { Container } from 'pixi.js'
import { Loader2 } from 'lucide-react'

const PREVIEW_KEY = 'preview'
const CANVAS_W = 300
const CANVAS_H = 200
const PADDING = 14

interface SpinePreviewProps {
  jsonUrl: string
  atlasUrl: string
  pngUrl?: string    // legacy
  pngUrls?: string[]
  className?: string
}

export const SpinePreview = ({ jsonUrl, atlasUrl, pngUrl, pngUrls, className }: SpinePreviewProps) => {
  const [loader, setLoader] = useState<FileSpineLoader | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      try {
        setLoading(true)
        setError(null)

        const imageUrls = pngUrls || (pngUrl ? [pngUrl] : [])

        const responses = await Promise.all([
          fetch(jsonUrl),
          fetch(atlasUrl),
          ...imageUrls.map(url => fetch(url)),
        ])

        if (!responses[0].ok || !responses[1].ok || responses.slice(2).some(r => !r.ok)) {
          throw new Error('Failed to fetch spine files')
        }
        if (cancelled) return

        const blobs = await Promise.all(responses.map(r => r.blob()))
        if (cancelled) return

        const jsonFile = new File([blobs[0]], 'spine.json', { type: 'application/json' })
        const atlasFile = new File([blobs[1]], 'spine.atlas', { type: 'text/plain' })
        const imageFiles = blobs.slice(2).map((blob, i) =>
          new File([blob], `spine${i > 0 ? i + 1 : ''}.png`, { type: blob.type || 'image/png' }),
        )

        const isSkel = jsonUrl.toLowerCase().endsWith('.skel')
        const skeletonData = isSkel ? await jsonFile.arrayBuffer() : await jsonFile.text()
        const atlasText = await atlasFile.text()

        if (cancelled) return

        const spineLoader = new FileSpineLoader(skeletonData, atlasText, imageFiles)
        await spineLoader.loadSpine(PREVIEW_KEY)

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
    return () => { cancelled = true }
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
      <Application
        width={CANVAS_W}
        height={CANVAS_H}
        backgroundAlpha={0}
        antialias
        autoDensity
        resolution={window.devicePixelRatio || 1}
      >
        <SpinePreviewContent loader={loader} />
      </Application>
    </div>
  )
}

// ---------------------------------------------------------------------------
// PIXI content — positions the spine so its first-frame AABB is centred and
// contained within the fixed CANVAS_W × CANVAS_H preview canvas.
// ---------------------------------------------------------------------------

const SpinePreviewContent = ({ loader }: { loader: FileSpineLoader }) => {
  useExtend({ Container })

  const skeletonData = loader.getSkeletonData(PREVIEW_KEY)
  const bounds = skeletonData ? computeFirstFrameBounds(skeletonData) : null
  const transform = bounds
    ? boundsToContainTransform(bounds, CANVAS_W, CANVAS_H, PADDING)
    : { x: CANVAS_W / 2, y: CANVAS_H / 2, scale: 0.5 }

  return (
    <SpineBase
      spine={PREVIEW_KEY}
      spineLoader={loader}
      loop
      playing
      scale={{ x: transform.scale, y: transform.scale }}
      x={transform.x}
      y={transform.y}
      scaleAnimationDuration={0}
    />
  )
}
