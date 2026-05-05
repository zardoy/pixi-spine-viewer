import 'pixi.js/prepare'
import { useEffect, useLayoutEffect, useState, useRef, useCallback } from 'react'
import { Application, useTick, useExtend } from '@pixi/react'
import { Container, Graphics } from 'pixi.js'
import {
  Skeleton,
  AnimationState,
  AnimationStateData,
  Physics,
} from '@esotericsoftware/spine-core'
import type { SkeletonData } from '@esotericsoftware/spine-core'
import JSZip from 'jszip'
import { SpineBase } from '../lib/SpineBase'
import { FileSpineLoader } from '../lib/FileSpineLoader'
import { fetchSpineFilesFromUrl } from '../lib/urlFetcher'
import { SPINE_EXAMPLES } from '../lib/spineExamples'
import { Button } from './ui/button'
import { ArrowLeft, Upload } from 'lucide-react'
import { toast } from 'sonner'

const SPINE_KEY = 'at-position-spine'

// ---------------------------------------------------------------------------
// Bounds computation
// ---------------------------------------------------------------------------

export interface SpineBounds {
  x: number
  y: number
  width: number
  height: number
}

/**
 * Compute the bounding box at time=0 (first frame) of the given animation,
 * or the setup pose if no animation is provided or found.
 *
 * This creates a temporary, isolated skeleton so it never touches the live
 * PIXI Spine instance. Returns null when the skeleton has no visible attachments.
 *
 * Why not use skeletonData.x / .y / .width / .height?
 *   Those come from the JSON's `skeleton.bounds` block and represent the
 *   setup-pose AABB as exported by the Spine editor — NOT the first frame
 *   of any animation. When an animation immediately offsets bones at time=0
 *   the numbers differ, sometimes significantly.
 */
export function computeFirstFrameBounds(
  skeletonData: SkeletonData,
  animationName?: string,
): SpineBounds | null {
  const skeleton = new Skeleton(skeletonData)
  const animState = new AnimationState(new AnimationStateData(skeletonData))

  const anim = animationName
    ? skeletonData.findAnimation(animationName)
    : (skeletonData.animations[0] ?? null)

  if (anim) {
    animState.setAnimationWith(0, anim, false)
    animState.update(0)
    animState.apply(skeleton)
  } else {
    skeleton.setToSetupPose()
  }

  skeleton.update(0)
  skeleton.updateWorldTransform(Physics.update)

  const r = skeleton.getBoundsRect()
  if (r.width === Number.NEGATIVE_INFINITY || r.width <= 0) return null
  return { x: r.x, y: r.y, width: r.width, height: r.height }
}

// ---------------------------------------------------------------------------
// Transform math
// ---------------------------------------------------------------------------

interface SpineTransform {
  spineX: number
  spineY: number
  scale: number
}

/**
 * Given a first-frame bounds rect, produce the PIXI position (spineX, spineY)
 * and uniform scale so that the bounds anchor point lands exactly at the
 * requested container anchor point.
 *
 * anchor=(0,0)   → top-left of bounds lands at (containerX, containerY)
 * anchor=(1,1)   → bottom-right of bounds lands at (containerX+cW, containerY+cH)
 * anchor=(0.5,0.5) → centre of bounds lands at the container centre
 *
 * Math:
 *   scale  = containerW / bounds.width   (or height variant)
 *   spineX = (containerX + anchorX*cW) - (bounds.x + bounds.width  * anchorX) * scale
 *   spineY = (containerY + anchorY*cH) - (bounds.y + bounds.height * anchorY) * scale
 */
function computeSpineTransform(
  bounds: SpineBounds,
  containerX: number,
  containerY: number,
  containerW: number,
  containerH: number,
  anchorX: number,
  anchorY: number,
  fitBy: 'width' | 'height',
): SpineTransform {
  const scale =
    fitBy === 'width' ? containerW / bounds.width : containerH / bounds.height

  const spineX =
    containerX + anchorX * containerW - (bounds.x + bounds.width * anchorX) * scale
  const spineY =
    containerY + anchorY * containerH - (bounds.y + bounds.height * anchorY) * scale

  return { spineX, spineY, scale }
}

// ---------------------------------------------------------------------------
// Demo configuration
// ---------------------------------------------------------------------------

interface DemoConfig {
  containerX: number
  containerY: number
  containerW: number
  containerH: number
  anchorX: number
  anchorY: number
  fitBy: 'width' | 'height'
  selectedAnim: string
}

// ---------------------------------------------------------------------------
// PIXI canvas content
// ---------------------------------------------------------------------------

interface ContentProps {
  loader: FileSpineLoader
  firstFrameBounds: SpineBounds
  config: DemoConfig
}

const PlaygroundAtPositionContent = ({ loader, firstFrameBounds, config }: ContentProps) => {
  useExtend({ Container, Graphics })

  const { containerX, containerY, containerW, containerH, anchorX, anchorY, fitBy, selectedAnim } =
    config

  const { spineX, spineY, scale } = computeSpineTransform(
    firstFrameBounds,
    containerX,
    containerY,
    containerW,
    containerH,
    anchorX,
    anchorY,
    fitBy,
  )

  // Spine's first-frame AABB in canvas (screen) space
  const bCX = spineX + firstFrameBounds.x * scale
  const bCY = spineY + firstFrameBounds.y * scale
  const bCW = firstFrameBounds.width * scale
  const bCH = firstFrameBounds.height * scale

  // Two Graphics layers: background (grid) and overlay (container + bounds)
  const bgRef = useRef<Graphics | null>(null)
  const fgRef = useRef<Graphics | null>(null)

  // Dirty flag — set whenever draw params change, cleared after drawing
  const dirtyRef = useRef(true)
  const drawParamsRef = useRef({
    containerX, containerY, containerW, containerH,
    anchorX, anchorY, bCX, bCY, bCW, bCH,
  })
  drawParamsRef.current = { containerX, containerY, containerW, containerH, anchorX, anchorY, bCX, bCY, bCW, bCH }

  useEffect(() => { dirtyRef.current = true }, [containerX, containerY, containerW, containerH, anchorX, anchorY, bCX, bCY, bCW, bCH])

  useTick(() => {
    if (!dirtyRef.current) return
    const bg = bgRef.current
    const fg = fgRef.current
    if (!bg || !fg) return
    dirtyRef.current = false

    const p = drawParamsRef.current

    // --- Background grid ---
    bg.clear()
    bg.setStrokeStyle({ color: 0x444444, width: 1, alpha: 0.35 })
    for (let x = 0; x < 2000; x += 50) { bg.moveTo(x, 0); bg.lineTo(x, 1500) }
    for (let y = 0; y < 1500; y += 50) { bg.moveTo(0, y); bg.lineTo(2000, y) }
    bg.stroke()

    // --- Foreground overlays ---
    fg.clear()

    // Container fill
    fg.rect(p.containerX, p.containerY, p.containerW, p.containerH)
    fg.fill({ color: 0xffffff, alpha: 0.04 })

    // Container outline (white)
    fg.setStrokeStyle({ color: 0xffffff, width: 2, alpha: 0.35 })
    fg.rect(p.containerX, p.containerY, p.containerW, p.containerH)
    fg.stroke()

    // Width dimension line (above container)
    fg.setStrokeStyle({ color: 0xffffff, width: 1, alpha: 0.4 })
    fg.moveTo(p.containerX, p.containerY - 14)
    fg.lineTo(p.containerX + p.containerW, p.containerY - 14)
    fg.moveTo(p.containerX, p.containerY - 18)
    fg.lineTo(p.containerX, p.containerY - 10)
    fg.moveTo(p.containerX + p.containerW, p.containerY - 18)
    fg.lineTo(p.containerX + p.containerW, p.containerY - 10)
    fg.stroke()

    // Height dimension line (left of container)
    fg.moveTo(p.containerX - 14, p.containerY)
    fg.lineTo(p.containerX - 14, p.containerY + p.containerH)
    fg.moveTo(p.containerX - 18, p.containerY)
    fg.lineTo(p.containerX - 10, p.containerY)
    fg.moveTo(p.containerX - 18, p.containerY + p.containerH)
    fg.lineTo(p.containerX - 10, p.containerY + p.containerH)
    fg.stroke()

    // First-frame AABB overlay (green) — this should coincide with the container anchor
    fg.setStrokeStyle({ color: 0x00ff88, width: 2, alpha: 0.9 })
    fg.rect(p.bCX, p.bCY, p.bCW, p.bCH)
    fg.stroke()

    // Dot at AABB top-left
    fg.circle(p.bCX, p.bCY, 4)
    fg.fill({ color: 0x00ff88, alpha: 1 })

    // Anchor crosshair (orange)
    const ax = p.containerX + p.anchorX * p.containerW
    const ay = p.containerY + p.anchorY * p.containerH
    const R = 8
    fg.setStrokeStyle({ color: 0xff6600, width: 2, alpha: 1 })
    fg.moveTo(ax - R, ay); fg.lineTo(ax + R, ay)
    fg.moveTo(ax, ay - R); fg.lineTo(ax, ay + R)
    fg.stroke()
    fg.circle(ax, ay, 4)
    fg.fill({ color: 0xff6600, alpha: 1 })
  })

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  const noop = () => {}

  return (
    <>
      {/* Grid — rendered behind everything */}
      <pixiGraphics ref={bgRef as any} draw={noop} />
      {/* Spine — in the middle */}
      <SpineBase
        spine={SPINE_KEY}
        animation={selectedAnim || undefined}
        loop
        paused={false}
        spineLoader={loader}
        x={spineX}
        y={spineY}
        scale={{ x: scale, y: scale }}
        scaleAnimationDuration={0}
      />
      {/* Overlays — on top */}
      <pixiGraphics ref={fgRef as any} draw={noop} />
    </>
  )
}

// ---------------------------------------------------------------------------
// Main demo component
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// File processing (drag-and-drop + file picker)
// ---------------------------------------------------------------------------

async function extractZip(zipFile: File): Promise<File[]> {
  const zip = new JSZip()
  const content = await zip.loadAsync(zipFile)
  const result: File[] = []
  for (const filename in content.files) {
    const entry = content.files[filename]
    if (entry.dir) continue
    const blob = await entry.async('blob')
    result.push(new File([blob], filename, { type: blob.type || 'application/octet-stream' }))
  }
  return result
}

async function resolveSpineFiles(
  rawFiles: File[],
): Promise<{ skeletonFile: File; atlasFile: File; imageFiles: File[] } | null> {
  // Expand ZIPs
  let allFiles = [...rawFiles]
  for (const zip of rawFiles.filter(f => f.name.toLowerCase().endsWith('.zip'))) {
    try {
      toast.loading(`Extracting ${zip.name}…`)
      const extracted = await extractZip(zip)
      allFiles = allFiles.filter(f => f !== zip).concat(extracted)
      toast.dismiss()
    } catch {
      toast.dismiss()
      toast.error(`Failed to extract ${zip.name}`)
      return null
    }
  }

  const skeletonFiles = allFiles.filter(f => /\.(json|skel)$/i.test(f.name))
  const atlasFile = allFiles.find(f => /\.atlas(\.txt)?$/i.test(f.name))
  const imageFiles = allFiles.filter(f =>
    f.type.startsWith('image/') || /\.(png|jpg|jpeg|webp)$/i.test(f.name),
  )

  if (!skeletonFiles.length) {
    toast.error('No .json or .skel skeleton file found')
    return null
  }
  if (!atlasFile) {
    toast.error('No .atlas file found')
    return null
  }
  if (!imageFiles.length) {
    toast.error('No image files found (.png / .webp / .jpg)')
    return null
  }

  return { skeletonFile: skeletonFiles[0], atlasFile, imageFiles }
}

// ---------------------------------------------------------------------------
// Main demo component
// ---------------------------------------------------------------------------

export const PlaygroundAtPosition = () => {
  const [isLoading, setIsLoading] = useState(true)
  const [loader, setLoader] = useState<FileSpineLoader | null>(null)
  const [skeletonData, setSkeletonData] = useState<SkeletonData | null>(null)
  const [firstFrameBounds, setFirstFrameBounds] = useState<SpineBounds | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)
  const canvasWrapperRef = useRef<HTMLDivElement>(null)

  const [config, setConfig] = useState<DemoConfig>({
    containerX: 60,
    containerY: 60,
    containerW: 400,
    containerH: 400,
    anchorX: 0,
    anchorY: 0,
    fitBy: 'width',
    selectedAnim: '',
  })

  const [selectedExample, setSelectedExample] = useState(SPINE_EXAMPLES[2].name) // Owl

  // Load from raw File objects (drag-drop or file picker)
  const loadFromFiles = useCallback(async (rawFiles: File[]) => {
    const resolved = await resolveSpineFiles(rawFiles)
    if (!resolved) return

    const { skeletonFile, atlasFile, imageFiles } = resolved

    setIsLoading(true)
    setLoader(null)
    setSkeletonData(null)
    setFirstFrameBounds(null)

    try {
      toast.loading(`Loading ${skeletonFile.name}…`)
      const atlasText = await atlasFile.text()
      const isSkel = skeletonFile.name.toLowerCase().endsWith('.skel')
      const skelData = isSkel ? await skeletonFile.arrayBuffer() : await skeletonFile.text()

      const newLoader = new FileSpineLoader(skelData, atlasText, imageFiles)
      await newLoader.loadSpine(SPINE_KEY)

      const sd = newLoader.getSkeletonData(SPINE_KEY)!
      const bounds = computeFirstFrameBounds(sd)

      setLoader(newLoader)
      setSkeletonData(sd)
      setFirstFrameBounds(bounds)
      setConfig(c => ({ ...c, selectedAnim: sd.animations[0]?.name ?? '' }))
      setIsLoading(false)
      toast.dismiss()
      toast.success(`Loaded: ${skeletonFile.name}`)
    } catch (err) {
      setIsLoading(false)
      toast.dismiss()
      toast.error('Failed to load: ' + (err instanceof Error ? err.message : 'Unknown error'))
    }
  }, [])

  // Drag-and-drop handlers on the canvas area
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    // Only clear if leaving the wrapper entirely (not entering a child)
    if (!canvasWrapperRef.current?.contains(e.relatedTarget as Node)) {
      setIsDragOver(false)
    }
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
    const files = Array.from(e.dataTransfer.files)
    if (files.length > 0) await loadFromFiles(files)
  }, [loadFromFiles])

  const loadExample = async (exampleName: string) => {
    const ex = SPINE_EXAMPLES.find(e => e.name === exampleName)
    if (!ex) return

    setIsLoading(true)
    setLoader(null)
    setSkeletonData(null)
    setFirstFrameBounds(null)

    try {
      toast.loading(`Loading ${exampleName}…`)
      const files = await fetchSpineFilesFromUrl(ex.jsonUrl, ex.atlasUrl)
      const atlasText = await files.atlasFile.text()
      const isSkel = files.jsonFile.name.toLowerCase().endsWith('.skel')
      const skelData = isSkel
        ? await files.jsonFile.arrayBuffer()
        : await files.jsonFile.text()

      const newLoader = new FileSpineLoader(skelData, atlasText, files.imageFiles)
      await newLoader.loadSpine(SPINE_KEY)

      const sd = newLoader.getSkeletonData(SPINE_KEY)!
      const bounds = computeFirstFrameBounds(sd)

      setLoader(newLoader)
      setSkeletonData(sd)
      setFirstFrameBounds(bounds)
      setConfig(c => ({ ...c, selectedAnim: sd.animations[0]?.name ?? '' }))
      setIsLoading(false)
      toast.dismiss()
      toast.success(`${exampleName} loaded`)
    } catch (err) {
      setIsLoading(false)
      toast.dismiss()
      toast.error('Failed to load: ' + (err instanceof Error ? err.message : 'Unknown error'))
    }
  }

  // Hidden file input for manual pick
  const fileInputRef = useRef<HTMLInputElement>(null)
  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    if (files.length) await loadFromFiles(files)
    // reset so the same files can be picked again
    e.target.value = ''
  }

  useEffect(() => { loadExample(selectedExample) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Re-compute first-frame bounds when the positioning animation changes
  useEffect(() => {
    if (!skeletonData) return
    const b = computeFirstFrameBounds(skeletonData, config.selectedAnim || undefined)
    setFirstFrameBounds(b)
  }, [config.selectedAnim, skeletonData])

  const update = (patch: Partial<DemoConfig>) => setConfig(c => ({ ...c, ...patch }))

  const handleBack = () => {
    window.history.pushState({}, '', window.location.pathname)
    window.location.reload()
  }

  const animations = skeletonData?.animations?.map(a => a.name) ?? []

  const info =
    firstFrameBounds
      ? computeSpineTransform(
          firstFrameBounds,
          config.containerX,
          config.containerY,
          config.containerW,
          config.containerH,
          config.anchorX,
          config.anchorY,
          config.fitBy,
        )
      : null

  const setupPoseBounds: SpineBounds | null = skeletonData
    ? {
        x: (skeletonData as any).x ?? 0,
        y: (skeletonData as any).y ?? 0,
        width: (skeletonData as any).width ?? 0,
        height: (skeletonData as any).height ?? 0,
      }
    : null

  // -------------------------------------------------------------------------
  // Anchor preset grid
  // -------------------------------------------------------------------------
  const ANCHOR_PRESETS = [
    [0, 0, 'TL'], [0.5, 0, 'TC'], [1, 0, 'TR'],
    [0, 0.5, 'ML'], [0.5, 0.5, 'MC'], [1, 0.5, 'MR'],
    [0, 1, 'BL'], [0.5, 1, 'BC'], [1, 1, 'BR'],
  ] as const

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="p-3 border-b flex items-center gap-4 shrink-0">
        <Button variant="outline" size="sm" onClick={handleBack}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <div>
          <h1 className="font-semibold leading-tight">Spine At Position</h1>
          <p className="text-xs text-muted-foreground">
            Position spine by first-frame bounding box — not by its local root origin
          </p>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* ---------------------------------------------------------------- */}
        {/* Controls panel                                                    */}
        {/* ---------------------------------------------------------------- */}
        <div className="w-68 border-r p-4 overflow-y-auto flex flex-col gap-4 shrink-0 text-sm">

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".json,.skel,.atlas,.atlas.txt,.png,.jpg,.jpeg,.webp,.zip"
            className="hidden"
            onChange={handleFileInputChange}
          />

          {/* Drop / pick your own files */}
          <section>
            <div className="font-medium mb-1.5">Your spine files</div>
            <button
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded border border-dashed border-border hover:border-primary hover:bg-primary/5 transition-colors text-sm text-muted-foreground hover:text-foreground"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="w-4 h-4" />
              Drop files or click to pick
            </button>
            <p className="text-xs text-muted-foreground mt-1">
              .json / .skel + .atlas + image(s) — or a .zip containing them
            </p>
          </section>

          {/* ── or use a built-in example ── */}
          <section>
            <div className="font-medium mb-1.5">Built-in examples</div>
            <select
              className="w-full bg-secondary border border-border rounded px-2 py-1.5 text-sm"
              value={selectedExample}
              onChange={e => { setSelectedExample(e.target.value); loadExample(e.target.value) }}
            >
              {SPINE_EXAMPLES.map(ex => (
                <option key={ex.name} value={ex.name}>{ex.name}</option>
              ))}
            </select>
          </section>

          {/* Positioning animation */}
          {animations.length > 0 && (
            <section>
              <div className="font-medium mb-1">Bounds from animation</div>
              <select
                className="w-full bg-secondary border border-border rounded px-2 py-1.5 text-sm"
                value={config.selectedAnim}
                onChange={e => update({ selectedAnim: e.target.value })}
              >
                {animations.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
              <p className="text-xs text-muted-foreground mt-1">
                First frame (t=0) used for bounds & scale. Spine plays this animation.
              </p>
            </section>
          )}

          {/* Fit by */}
          <section>
            <div className="font-medium mb-1.5">Fit by</div>
            <div className="flex gap-2">
              {(['width', 'height'] as const).map(v => (
                <button
                  key={v}
                  className={`flex-1 py-1.5 rounded border text-sm font-medium transition-colors ${
                    config.fitBy === v
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-secondary border-border hover:bg-secondary/80'
                  }`}
                  onClick={() => update({ fitBy: v })}
                >
                  {v.charAt(0).toUpperCase() + v.slice(1)}
                </button>
              ))}
            </div>
          </section>

          {/* Container position */}
          <section>
            <div className="font-medium mb-1.5">Container position (canvas px)</div>
            <div className="grid grid-cols-2 gap-2">
              {(['containerX', 'containerY'] as const).map(k => (
                <label key={k} className="flex flex-col gap-1">
                  <span className="text-muted-foreground">{k === 'containerX' ? 'X' : 'Y'}</span>
                  <input
                    type="number"
                    className="bg-secondary border border-border rounded px-2 py-1 w-full"
                    value={config[k]}
                    onChange={e => update({ [k]: Number(e.target.value) })}
                  />
                </label>
              ))}
            </div>
          </section>

          {/* Container size */}
          <section>
            <div className="font-medium mb-1.5">Container size (canvas px)</div>
            <div className="grid grid-cols-2 gap-2">
              {(['containerW', 'containerH'] as const).map(k => (
                <label key={k} className="flex flex-col gap-1">
                  <span className="text-muted-foreground">{k === 'containerW' ? 'Width' : 'Height'}</span>
                  <input
                    type="number"
                    min="10"
                    className="bg-secondary border border-border rounded px-2 py-1 w-full"
                    value={config[k]}
                    onChange={e => update({ [k]: Number(e.target.value) })}
                  />
                </label>
              ))}
            </div>
          </section>

          {/* Anchor presets */}
          <section>
            <div className="font-medium mb-1">Anchor</div>
            <p className="text-xs text-muted-foreground mb-2">
              Which point of the AABB aligns to which point of the container
            </p>
            <div className="grid grid-cols-3 gap-1">
              {ANCHOR_PRESETS.map(([ax, ay, label]) => (
                <button
                  key={label}
                  className={`py-1 rounded text-xs font-mono border transition-colors ${
                    config.anchorX === ax && config.anchorY === ay
                      ? 'bg-orange-500 text-white border-orange-400'
                      : 'bg-secondary border-border hover:bg-secondary/80'
                  }`}
                  onClick={() => update({ anchorX: ax, anchorY: ay })}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2 mt-2">
              {(['anchorX', 'anchorY'] as const).map(k => (
                <label key={k} className="flex flex-col gap-1">
                  <span className="text-muted-foreground">{k === 'anchorX' ? 'X' : 'Y'}</span>
                  <input
                    type="number"
                    step="0.05"
                    min="0"
                    max="1"
                    className="bg-secondary border border-border rounded px-2 py-1 w-full"
                    value={config[k]}
                    onChange={e => update({ [k]: Number(e.target.value) })}
                  />
                </label>
              ))}
            </div>
          </section>

          {/* Legend */}
          <section className="flex flex-col gap-1.5 text-xs">
            <div className="font-medium">Legend</div>
            <div className="flex items-center gap-2">
              <span className="inline-block w-3 h-3 border border-white/40 bg-white/5 rounded-sm shrink-0" />
              <span className="text-muted-foreground">Container bounds</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block w-3 h-3 rounded-sm shrink-0" style={{ background: '#00ff88' }} />
              <span className="text-muted-foreground">First-frame AABB (computed)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-block w-3 h-3 rounded-full shrink-0" style={{ background: '#ff6600' }} />
              <span className="text-muted-foreground">Anchor point</span>
            </div>
          </section>

          {/* Computed info */}
          {firstFrameBounds && info && (
            <section className="border border-border rounded p-3 bg-secondary/30 text-xs space-y-2">
              <div className="font-semibold">Debug info</div>

              <div>
                <div className="text-muted-foreground font-medium">First-frame AABB (skeleton space)</div>
                <div>x: {firstFrameBounds.x.toFixed(1)}&ensp;y: {firstFrameBounds.y.toFixed(1)}</div>
                <div>w: {firstFrameBounds.width.toFixed(1)}&ensp;h: {firstFrameBounds.height.toFixed(1)}</div>
              </div>

              {setupPoseBounds && (
                <div>
                  <div className="text-muted-foreground font-medium">
                    skeletonData.x/y/w/h (JSON setup pose)
                  </div>
                  <div>x: {setupPoseBounds.x.toFixed(1)}&ensp;y: {setupPoseBounds.y.toFixed(1)}</div>
                  <div>w: {setupPoseBounds.width.toFixed(1)}&ensp;h: {setupPoseBounds.height.toFixed(1)}</div>
                  {(Math.abs(setupPoseBounds.x - firstFrameBounds.x) > 1 ||
                    Math.abs(setupPoseBounds.y - firstFrameBounds.y) > 1) && (
                    <div className="text-yellow-400 mt-0.5">
                      ⚠ Differs from first-frame bounds — using skeletonData directly would misposition
                    </div>
                  )}
                </div>
              )}

              <div>
                <div className="text-muted-foreground font-medium">PIXI transform applied</div>
                <div>spine.x: {info.spineX.toFixed(1)}&ensp;y: {info.spineY.toFixed(1)}</div>
                <div>scale: {info.scale.toFixed(4)}</div>
              </div>
            </section>
          )}
        </div>

        {/* ---------------------------------------------------------------- */}
        {/* PIXI canvas + drop zone                                          */}
        {/* ---------------------------------------------------------------- */}
        <div
          ref={canvasWrapperRef}
          className="flex-1 relative overflow-hidden"
          onDragOver={handleDragOver}
          onDragEnter={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {/* Loading overlay */}
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center z-10 bg-background/60">
              <p className="text-muted-foreground text-sm">Loading spine…</p>
            </div>
          )}

          {/* Drag-over overlay */}
          {isDragOver && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-primary/10 border-2 border-dashed border-primary rounded pointer-events-none">
              <Upload className="w-10 h-10 text-primary" />
              <p className="text-primary font-semibold text-lg">Drop spine files here</p>
              <p className="text-primary/70 text-sm">.json / .skel + .atlas + image(s), or a .zip</p>
            </div>
          )}

          {!isLoading && loader && firstFrameBounds && (
            <Application
              backgroundColor={0x1a1a1a}
              resizeTo={canvasWrapperRef}
              antialias
              resolution={window.devicePixelRatio || 1}
              autoDensity
            >
              <PlaygroundAtPositionContent
                loader={loader}
                firstFrameBounds={firstFrameBounds}
                config={config}
              />
            </Application>
          )}
        </div>
      </div>
    </div>
  )
}
