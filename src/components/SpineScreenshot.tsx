import 'pixi.js/prepare'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Application, useApplication, useExtend, useTick } from '@pixi/react'
import { Container, Rectangle } from 'pixi.js'
import type { Application as PIXIApplication } from 'pixi.js'
import type { SkeletonData } from '@esotericsoftware/spine-core'
import JSZip from 'jszip'
import { SpineBase } from '../lib/SpineBase'
import { FileSpineLoader } from '../lib/FileSpineLoader'
import {
  SCREENSHOT_FPS,
  buildSpineScreenshotFilename,
  boundsModeToTag,
  computeBoundsAtTime,
  computeMaxAnimationBounds,
  computeAllAnimationsBounds,
  frameIndexToAnimationProgress,
  frameIndexToTime,
  getAnimationDuration,
  getMaxScreenshotFrameIndex,
} from '../lib/spineUtils'
import type { SpineBounds } from '../lib/spineUtils'
import { Button } from './ui/button'
import { ArrowLeft, Camera, Upload } from 'lucide-react'
import { toast } from 'sonner'

const SPINE_KEY = 'screenshot-spine'

type BoundsMode = 'first-frame' | 'full-animation' | 'all-animations'

type BoundsDeps = {
  boundsMode: BoundsMode
  selectedAnim: string
  selectedSkin: string
  frameIndex: number
}

/** True if the extracted frame has any pixel with alpha > 0. */
function rendererFrameHasVisiblePixels(
  app: PIXIApplication,
  width: number,
  height: number,
): boolean {
  if (width <= 0 || height <= 0) return false
  try {
    const result = app.renderer.extract.pixels({
      target: app.stage,
      frame: new Rectangle(0, 0, width, height),
      clearColor: [0, 0, 0, 0],
    })
    const data =
      result instanceof Uint8Array
        ? result
        : 'pixels' in result
          ? result.pixels
          : null
    if (!data?.length) return false
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] > 0) return true
    }
    return false
  } catch (err) {
    console.warn('[SpineScreenshot] Could not read pixels for empty check', err)
    return false
  }
}

const BOUNDS_LABELS: Record<BoundsMode, string> = {
  'first-frame': 'First frame',
  'full-animation': 'Full animation',
  'all-animations': 'All animations',
}

async function hashFiles(files: File[]): Promise<string> {
  const buffers = await Promise.all(files.map(f => f.arrayBuffer()))
  const total = buffers.reduce((acc, b) => acc + b.byteLength, 0)
  const merged = new Uint8Array(total)
  let offset = 0
  for (const buf of buffers) {
    merged.set(new Uint8Array(buf), offset)
    offset += buf.byteLength
  }
  const digest = await crypto.subtle.digest('SHA-256', merged)
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 7)
}

// ---------------------------------------------------------------------------
// PIXI inner component — renders the spine and auto-captures after 2 frames
// ---------------------------------------------------------------------------

const SpineScreenshotContent = ({
  loader,
  bounds,
  outputScale,
  animName,
  skinName,
  animationProgress,
  autoDownload,
  onCapture,
}: {
  loader: FileSpineLoader
  bounds: SpineBounds
  outputScale: number
  animName: string
  skinName?: string
  animationProgress: number
  autoDownload: boolean
  onCapture: (app: PIXIApplication) => void
}) => {
  useExtend({ Container })
  const { app } = useApplication()
  const captured = useRef(false)
  const tickCount = useRef(0)

  // Wait several ticks so SpineBase's async useLayoutEffect has time to run
  useTick(() => {
    tickCount.current += 1
    if (!autoDownload || captured.current || tickCount.current < 6) return
    captured.current = true
    // Two rAF passes ensure WebGL has flushed the draw commands
    requestAnimationFrame(() => requestAnimationFrame(() => onCapture(app)))
  })

  return (
    <SpineBase
      spine={SPINE_KEY}
      animation={animName || undefined}
      skin={skinName}
      animationProgress={animationProgress}
      paused
      loop={false}
      spineLoader={loader}
      x={-bounds.x * outputScale}
      y={-bounds.y * outputScale}
      scale={{ x: outputScale, y: outputScale }}
      scaleAnimationDuration={0}
    />
  )
}

// ---------------------------------------------------------------------------
// File utilities  (identical pattern to PlaygroundAtPosition)
// ---------------------------------------------------------------------------

async function extractZip(zipFile: File): Promise<File[]> {
  const zip = new JSZip()
  const content = await zip.loadAsync(zipFile)
  const files: File[] = []
  for (const [name, entry] of Object.entries(content.files)) {
    if (entry.dir) continue
    const blob = await entry.async('blob')
    files.push(new File([blob], name))
  }
  return files
}

async function resolveSpineFiles(rawFiles: File[]) {
  let all = [...rawFiles]
  for (const zip of rawFiles.filter(f => f.name.toLowerCase().endsWith('.zip'))) {
    try {
      toast.loading(`Extracting ${zip.name}…`)
      all = all.filter(f => f !== zip).concat(await extractZip(zip))
      toast.dismiss()
    } catch {
      toast.dismiss()
      toast.error(`Failed to extract ${zip.name}`)
      return null
    }
  }
  const skelFiles = all.filter(f => /\.(json|skel)$/i.test(f.name))
  const atlasFile = all.find(f => /\.atlas(\.txt)?$/i.test(f.name))
  const imageFiles = all.filter(f => f.type.startsWith('image/') || /\.(png|jpg|jpeg|webp)$/i.test(f.name))
  if (!skelFiles.length) { toast.error('No .json or .skel file found'); return null }
  if (!atlasFile) { toast.error('No .atlas file found'); return null }
  if (!imageFiles.length) { toast.error('No image files found'); return null }
  return { skeletonFile: skelFiles[0], atlasFile, imageFiles }
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export const SpineScreenshot = () => {
  const [loader, setLoader] = useState<FileSpineLoader | null>(null)
  const [skeletonData, setSkeletonData] = useState<SkeletonData | null>(null)
  const [activeBounds, setActiveBounds] = useState<SpineBounds | null>(null)
  const [boundsMode, setBoundsMode] = useState<BoundsMode>(() => {
    const saved = localStorage.getItem('spineScreenshot.boundsMode')
    return (saved === 'first-frame' || saved === 'full-animation' || saved === 'all-animations')
      ? saved
      : 'first-frame'
  })
  const [selectedAnim, setSelectedAnim] = useState('')
  const [selectedSkin, setSelectedSkin] = useState('')
  const [frameIndex, setFrameIndex] = useState(0)
  const [outputScale, setOutputScale] = useState(1)
  const [isDragOver, setIsDragOver] = useState(false)
  const [status, setStatus] = useState('')
  const [baseName, setBaseName] = useState('spine')
  const [fileHash, setFileHash] = useState('')
  // Incrementing this remounts the capture child → optional auto-download
  const [renderKey, setRenderKey] = useState(0)
  const [autoDownload, setAutoDownload] = useState(true)

  const dropRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const hadBoundsRef = useRef(false)
  const boundsDepsRef = useRef<BoundsDeps>({
    boundsMode,
    selectedAnim,
    selectedSkin,
    frameIndex,
  })

  const animations = skeletonData?.animations.map(a => a.name) ?? []
  const skins = skeletonData?.skins.map(s => s.name) ?? []

  const captureAnimName =
    boundsMode !== 'all-animations' ? (selectedAnim || (animations[0] ?? '')) : ''
  const animDuration = skeletonData ? getAnimationDuration(skeletonData, captureAnimName || undefined) : 0
  const maxFrameIndex = skeletonData
    ? boundsMode === 'all-animations'
      ? 0
      : getMaxScreenshotFrameIndex(skeletonData, captureAnimName || undefined)
    : 0
  const captureTime = frameIndexToTime(frameIndex)
  const animationProgress = frameIndexToAnimationProgress(frameIndex, animDuration)

  const canvasW = activeBounds ? Math.max(1, Math.ceil(activeBounds.width * outputScale)) : 1
  const canvasH = activeBounds ? Math.max(1, Math.ceil(activeBounds.height * outputScale)) : 1

  // Stable ref so the stable `handleCapture` always reads fresh values
  const captureParamsRef = useRef({
    baseName, fileHash, boundsMode, selectedAnim, selectedSkin, frameIndex, outputScale, canvasW, canvasH, activeBounds,
  })
  captureParamsRef.current = {
    baseName, fileHash, boundsMode, selectedAnim, selectedSkin, frameIndex, outputScale, canvasW, canvasH, activeBounds,
  }

  // Recompute bounds (deferred so UI can show "Computing…" first)
  useEffect(() => {
    if (!skeletonData) return
    setStatus('Computing bounds…')
    setActiveBounds(null)
    const id = setTimeout(() => {
      const animArg = boundsMode !== 'all-animations' ? (selectedAnim || undefined) : undefined
      const skinArg = selectedSkin || undefined
      const timeArg = frameIndexToTime(frameIndex)
      const b =
        boundsMode === 'first-frame'
          ? computeBoundsAtTime(skeletonData, animArg, timeArg, skinArg)
          : boundsMode === 'full-animation'
          ? computeMaxAnimationBounds(skeletonData, animArg, 0.05, skinArg)
          : computeAllAnimationsBounds(skeletonData, 0.05, skinArg)
      console.log('[SpineScreenshot] Computed bounds', { boundsMode, animArg, skinArg, frameIndex, timeArg, bounds: b })
      setActiveBounds(b)
      setStatus(b ? '' : 'No visible bounds found for this configuration')
    }, 10)
    return () => clearTimeout(id)
  }, [boundsMode, selectedAnim, selectedSkin, frameIndex, skeletonData])

  // Clamp frame when animation or duration changes
  useEffect(() => {
    if (frameIndex > maxFrameIndex) setFrameIndex(maxFrameIndex)
  }, [frameIndex, maxFrameIndex])

  useEffect(() => {
    setFrameIndex(0)
  }, [selectedAnim, boundsMode])

  // Auto-download when bounds/scale change, but not when only the frame slider moved
  useEffect(() => {
    if (!activeBounds) return

    const prev = boundsDepsRef.current
    const frameOnly =
      hadBoundsRef.current &&
      prev.boundsMode === boundsMode &&
      prev.selectedAnim === selectedAnim &&
      prev.selectedSkin === selectedSkin &&
      prev.frameIndex !== frameIndex

    boundsDepsRef.current = { boundsMode, selectedAnim, selectedSkin, frameIndex }
    hadBoundsRef.current = true

    if (frameOnly) return

    setAutoDownload(true)
    setRenderKey(k => k + 1)
  }, [activeBounds, outputScale, boundsMode, selectedAnim, selectedSkin, frameIndex])

  const handleCapture = useCallback((app: PIXIApplication) => {
    const { baseName, fileHash, boundsMode, selectedAnim, selectedSkin, frameIndex, outputScale, canvasW, canvasH, activeBounds } =
      captureParamsRef.current
    const filename = buildSpineScreenshotFilename({
      base: baseName,
      anim: boundsMode === 'all-animations' ? 'all' : (selectedAnim || 'none'),
      skin: selectedSkin || 'default',
      mode: boundsModeToTag(boundsMode),
      frame: frameIndex,
      scale: outputScale,
      width: canvasW,
      height: canvasH,
      hash: fileHash || '0000000',
    })

    // Log everything so we can diagnose size / cropping issues
    const stageBounds = app.stage.getBounds()
    console.log('[SpineScreenshot] Capturing', {
      filename, boundsMode, selectedAnim, selectedSkin, frameIndex, outputScale, canvasW, canvasH,
    })
    console.log('[SpineScreenshot] Computed bounds (Spine space)', activeBounds)
    console.log('[SpineScreenshot] PIXI stage.getBounds()', {
      x: stageBounds.x, y: stageBounds.y,
      w: stageBounds.width, h: stageBounds.height,
    })
    console.log('[SpineScreenshot] Renderer size', {
      w: app.renderer.width, h: app.renderer.height,
    })

    if (!rendererFrameHasVisiblePixels(app, canvasW, canvasH)) {
      console.log('[SpineScreenshot] Skipped download — canvas has no non-transparent pixels')
      setStatus('Skipped download — empty canvas (fully transparent)')
      toast.info('Skipped download — nothing visible in the frame')
      return
    }

    setStatus('Downloading…')
    try {
      // Use an explicit frame matching our canvas dimensions so the output is always
      // canvasW × canvasH — without frame, PIXI extracts the stage content bounding box
      // (which is always the first-frame pose size) and ignores the canvas dimensions.
      app.renderer.extract.download({
        target: app.stage,
        filename,
        frame: new Rectangle(0, 0, canvasW, canvasH),
        clearColor: [0, 0, 0, 0],
      })
      setStatus(`✓ ${filename}`)
    } catch (err) {
      console.error('[SpineScreenshot] Capture failed', err)
      setStatus('Capture failed — see console')
    }
  }, [])

  const loadFromFiles = useCallback(async (rawFiles: File[]) => {
    const resolved = await resolveSpineFiles(rawFiles)
    if (!resolved) return
    const { skeletonFile, atlasFile, imageFiles } = resolved

    setStatus('Loading…')
    setLoader(null)
    setSkeletonData(null)
    setActiveBounds(null)
    hadBoundsRef.current = false

    try {
      toast.loading(`Loading ${skeletonFile.name}…`)
      const atlasText = await atlasFile.text()
      const isSkel = skeletonFile.name.toLowerCase().endsWith('.skel')
      const skelData = isSkel ? await skeletonFile.arrayBuffer() : await skeletonFile.text()
      const newLoader = new FileSpineLoader(skelData, atlasText, imageFiles)
      await newLoader.loadSpine(SPINE_KEY)
      const sd = newLoader.getSkeletonData(SPINE_KEY)!
      setBaseName(skeletonFile.name.replace(/\.[^.]+$/, ''))
      setLoader(newLoader)
      setSkeletonData(sd)
      setSelectedAnim(sd.animations[0]?.name ?? '')
      const skinNames = sd.skins.map(s => s.name)
      setSelectedSkin(skinNames.find(n => n === 'default') ?? skinNames[0] ?? '')
      hashFiles([skeletonFile, atlasFile, ...imageFiles]).then(setFileHash)
      setStatus('')
      toast.dismiss()
      toast.success(`Loaded: ${skeletonFile.name}`)
    } catch (err) {
      setStatus('')
      toast.dismiss()
      toast.error('Load failed: ' + (err instanceof Error ? err.message : String(err)))
    }
  }, [])

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setIsDragOver(true)
  }, [])
  const onDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation()
    if (!dropRef.current?.contains(e.relatedTarget as Node)) setIsDragOver(false)
  }, [])
  const onDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault(); e.stopPropagation(); setIsDragOver(false)
    const files = Array.from(e.dataTransfer.files)
    if (files.length) await loadFromFiles(files)
  }, [loadFromFiles])

  const handleBack = () => {
    window.history.pushState({}, '', window.location.pathname)
    window.location.reload()
  }

  // Scale the PIXI canvas visually to fit within a max preview area
  const MAX_PREVIEW = 560
  const previewScale = activeBounds
    ? Math.min(1, MAX_PREVIEW / canvasW, MAX_PREVIEW / canvasH)
    : 1

  return (
    <div
      ref={dropRef}
      className="min-h-screen bg-background flex flex-col"
      onDragOver={onDragOver}
      onDragEnter={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {/* Header */}
      <div className="p-3 border-b flex items-center gap-4 shrink-0">
        <Button variant="outline" size="sm" onClick={handleBack}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <div>
          <h1 className="font-semibold leading-tight">Spine Screenshot</h1>
          <p className="text-xs text-muted-foreground">
            Drop a spine — auto-downloads a PNG sized exactly to the selected bounds
          </p>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        accept=".json,.skel,.atlas,.atlas.txt,.png,.jpg,.jpeg,.webp,.zip"
        onChange={async e => {
          const files = Array.from(e.target.files ?? [])
          if (files.length) await loadFromFiles(files)
          e.target.value = ''
        }}
      />

      {/* Full-screen drag overlay */}
      {isDragOver && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-primary/10 border-4 border-dashed border-primary pointer-events-none">
          <Upload className="w-16 h-16 text-primary" />
          <p className="text-primary font-bold text-2xl">Drop spine files</p>
          <p className="text-primary/70">.json / .skel + .atlas + images — or a .zip</p>
        </div>
      )}

      {!loader ? (
        /* ---------------------------------------------------------------- */
        /* Landing drop zone                                                  */
        /* ---------------------------------------------------------------- */
        <div className="flex-1 flex flex-col items-center justify-center gap-6 p-8">
          <button
            className="w-full max-w-md h-60 flex flex-col items-center justify-center gap-5 rounded-2xl border-2 border-dashed border-border text-muted-foreground hover:border-primary/70 hover:text-foreground transition-all"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="w-14 h-14" />
            <div className="text-center">
              <p className="font-semibold text-lg">Drop or click to load spine files</p>
              <p className="text-sm mt-1 opacity-70">.json / .skel + .atlas + images — or a .zip</p>
            </div>
          </button>
          <p className="text-xs text-muted-foreground text-center max-w-xs">
            A PNG is automatically downloaded once the spine loads.
            Canvas size equals the bounding box in skeleton units × output scale.
          </p>
        </div>
      ) : (
        /* ---------------------------------------------------------------- */
        /* Controls + preview                                                 */
        /* ---------------------------------------------------------------- */
        <div className="flex flex-1 overflow-hidden">
          {/* Controls panel */}
          <div className="w-64 border-r p-4 flex flex-col gap-5 overflow-y-auto shrink-0 text-sm">

            {/* File */}
            <section>
              <div className="text-muted-foreground text-xs uppercase tracking-wide mb-1.5">File</div>
              <div className="font-mono text-xs break-all text-foreground mb-2">{baseName}</div>
              <button
                className="w-full py-1.5 rounded border border-dashed border-border hover:border-primary text-muted-foreground hover:text-foreground transition-colors flex items-center justify-center gap-1.5 text-xs"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="w-3.5 h-3.5" />
                Load different file
              </button>
            </section>

            {/* Bounds mode */}
            <section>
              <div className="text-muted-foreground text-xs uppercase tracking-wide mb-1.5">Bounds source</div>
              <div className="flex flex-col gap-1">
                {(['first-frame', 'full-animation', 'all-animations'] as const).map(m => (
                  <button
                    key={m}
                    className={`py-1.5 px-3 rounded border text-sm text-left transition-colors ${
                      boundsMode === m
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-secondary border-border hover:bg-secondary/80'
                    }`}
                    onClick={() => {
                      setBoundsMode(m)
                      localStorage.setItem('spineScreenshot.boundsMode', m)
                    }}
                  >
                    {BOUNDS_LABELS[m]}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-1.5">
                {boundsMode === 'first-frame' && 'Canvas sized to AABB at t=0.'}
                {boundsMode === 'full-animation' && 'Canvas sized to union AABB over the full animation.'}
                {boundsMode === 'all-animations' && 'Canvas sized to union AABB across every animation.'}
              </p>
            </section>

            {/* Animation selector (hidden for all-animations) */}
            {boundsMode !== 'all-animations' && animations.length > 1 && (
              <section>
                <div className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Animation</div>
                <select
                  className="w-full bg-secondary border border-border rounded px-2 py-1.5 text-sm"
                  value={selectedAnim}
                  onChange={e => setSelectedAnim(e.target.value)}
                >
                  {animations.map(a => <option key={a} value={a}>{a}</option>)}
                </select>
              </section>
            )}

            {skins.length > 1 && (
              <section>
                <div className="text-muted-foreground text-xs uppercase tracking-wide mb-1">Skin</div>
                <select
                  className="w-full bg-secondary border border-border rounded px-2 py-1.5 text-sm"
                  value={selectedSkin}
                  onChange={e => setSelectedSkin(e.target.value)}
                >
                  {skins.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              </section>
            )}

            {boundsMode !== 'all-animations' && (
              <section>
                <div className="flex items-baseline justify-between gap-2 mb-1">
                  <div className="text-muted-foreground text-xs uppercase tracking-wide">Capture frame</div>
                  <span className="font-mono text-[10px] text-muted-foreground tabular-nums">
                    {frameIndex}/{maxFrameIndex}
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={maxFrameIndex}
                  step={1}
                  value={frameIndex}
                  onChange={e => setFrameIndex(Number(e.target.value))}
                  className="w-full accent-primary"
                />
                <div className="flex justify-between text-[10px] text-muted-foreground mt-1 tabular-nums">
                  <span>{captureTime.toFixed(2)}s</span>
                  <span>@ {SCREENSHOT_FPS} fps</span>
                </div>
                <div className="flex gap-1 mt-2">
                  <input
                    type="number"
                    min={0}
                    max={maxFrameIndex}
                    step={1}
                    className="w-full bg-secondary border border-border rounded px-2 py-1 text-xs font-mono"
                    value={frameIndex}
                    onChange={e => {
                      const n = Number(e.target.value)
                      if (!Number.isFinite(n)) return
                      setFrameIndex(Math.min(maxFrameIndex, Math.max(0, Math.round(n))))
                    }}
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-1.5">
                  {boundsMode === 'first-frame'
                    ? 'Canvas fits this pose. Scrub to preview; use Re-capture to download.'
                    : 'Canvas is the full animation bounds. Scrub to preview, then Re-capture.'}
                </p>
              </section>
            )}

            {/* Output scale */}
            <section>
              <div className="text-muted-foreground text-xs uppercase tracking-wide mb-1.5">Output scale</div>
              <div className="flex gap-1.5 mb-2">
                {([0.5, 1, 2, 3] as const).map(s => (
                  <button
                    key={s}
                    className={`flex-1 py-1 rounded border text-xs font-medium transition-colors ${
                      outputScale === s
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-secondary border-border hover:bg-secondary/80'
                    }`}
                    onClick={() => setOutputScale(s)}
                  >
                    {s}×
                  </button>
                ))}
              </div>
              <input
                type="number"
                min="0.1"
                max="8"
                step="0.25"
                className="w-full bg-secondary border border-border rounded px-2 py-1 text-sm"
                value={outputScale}
                onChange={e => setOutputScale(Math.max(0.1, Number(e.target.value)))}
              />
            </section>

            {/* Output info */}
            {activeBounds && (
              <section className="border border-border rounded p-3 bg-secondary/30 text-xs space-y-1">
                <div className="font-semibold mb-1">Output</div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Canvas</span>
                  <span className="font-mono">{canvasW} × {canvasH} px</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Bounds</span>
                  <span className="font-mono">{activeBounds.width.toFixed(0)} × {activeBounds.height.toFixed(0)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Scale</span>
                  <span className="font-mono">{outputScale}×</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Preview</span>
                  <span className="font-mono">{(previewScale * 100).toFixed(0)}%</span>
                </div>
                {boundsMode !== 'all-animations' && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Frame</span>
                    <span className="font-mono">{frameIndex} ({captureTime.toFixed(2)}s)</span>
                  </div>
                )}
              </section>
            )}

            {/* Status */}
            {status && (
              <div className={`text-xs px-3 py-2 rounded break-all ${
                status.startsWith('✓')
                  ? 'text-green-400 bg-green-400/10 border border-green-400/20'
                  : 'text-muted-foreground bg-secondary/50'
              }`}>
                {status}
              </div>
            )}

            {/* Manual re-capture */}
            <Button
              size="sm"
              variant="outline"
              className="w-full"
              disabled={!activeBounds}
              onClick={() => {
                if (!activeBounds) return
                setAutoDownload(true)
                setRenderKey(k => k + 1)
              }}
            >
              <Camera className="w-4 h-4 mr-2" />
              Re-capture &amp; download
            </Button>
          </div>

          {/* ---------------------------------------------------------------- */}
          {/* Preview area                                                       */}
          {/* ---------------------------------------------------------------- */}
          <div
            className="flex-1 flex items-center justify-center overflow-hidden relative"
            style={{
              background:
                'repeating-conic-gradient(#2a2a2a 0% 25%, #1a1a1a 0% 50%) 0 0 / 20px 20px',
            }}
          >
            {activeBounds ? (
              /* Scale the canvas visually without changing pixel output */
              <div style={{ width: canvasW * previewScale, height: canvasH * previewScale, flexShrink: 0 }}>
                <div
                  style={{
                    transformOrigin: 'top left',
                    transform: `scale(${previewScale})`,
                    width: canvasW,
                    height: canvasH,
                  }}
                >
                  <Application
                    width={canvasW}
                    height={canvasH}
                    backgroundAlpha={0}
                    antialias
                    resolution={1}
                    autoDensity={false}
                  >
                    <SpineScreenshotContent
                      key={renderKey}
                      loader={loader}
                      bounds={activeBounds}
                      outputScale={outputScale}
                      animName={captureAnimName}
                      skinName={selectedSkin || undefined}
                      animationProgress={animationProgress}
                      autoDownload={autoDownload}
                      onCapture={handleCapture}
                    />
                  </Application>
                </div>
              </div>
            ) : (
              <p className="text-muted-foreground text-sm">{status || 'Computing…'}</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
