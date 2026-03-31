import 'pixi.js/prepare' // Ensures prepare system is available for texture preload
import { Application, Container, Filter, GlProgram, ColorMatrixFilter, type TextureSource } from 'pixi.js'
import { PixiReactElementProps, useTick, useApplication } from '@pixi/react'
import { useEffect, useLayoutEffect, useMemo, useRef, type Ref, type RefObject } from 'react'
import { AABBRectangleBoundsProvider, Spine as SpineInstance } from '@esotericsoftware/spine-pixi-v8'
import { Physics, RegionAttachment, MeshAttachment } from '@esotericsoftware/spine-core'
import { useSnapshot } from 'valtio'
import { useChangedEffect } from '../hooks/useChangedEffect'
import { globalSpineOverrides, registerSpine, unregisterSpine } from '../store/spineOverrides'
import gsap from 'gsap'

declare global {
  var spineDebugResults: Record<string, SpineDebugResults> | undefined
}

interface SpineLoader {
  loadSpine: (spineKey: string) => Promise<unknown>
  createSpine: (spineKey: string, options?: Record<string, unknown>) => {
    spine: SpineInstance
    x?: number
    y?: number
    scale?: number
  }
  /** Optional: return texture sources for GPU preload. When provided, SpineBase will call
   * app.prepare.upload(sources) before onSpineLoaded so textures are visible on first frame. */
  getTextureSourcesForPreload?: (spineKey: string) => TextureSource[] | undefined
}

let globalDebugMode: 'texture-sizes' | undefined = undefined

export const setGlobalDebugMode = (mode: 'texture-sizes' | undefined) => {
  if (!globalThis.spineDebugResults) {
    globalThis.spineDebugResults = {}
  }
  globalDebugMode = mode
}

export interface AttachmentSizeInfo {
  width: number
  height: number
  x: number
  y: number
  attachmentName: string | null
  attachmentType: string
  renderedWidth: number
  renderedHeight: number
  textureWidth: number
  textureHeight: number
  oversizeX: number
  oversizeY: number
}

export interface SpineDebugMinMax {
  oversizeX: number
  oversizeY: number
  attachment: string
}

export type SpineDebugResults = Record<string, AttachmentSizeInfo | SpineDebugMinMax> & {
  min: SpineDebugMinMax
  max: SpineDebugMinMax
}

function getAnimToUse(animation: string | undefined, spine: SpineInstance | null): string | null {
  if (animation) return animation
  if (!spine) return null
  const animations = spine.skeleton.data.animations
  return animations && animations.length > 0 ? animations[0].name : null
}

function wrapSpineError(error: unknown, operation: string, spineKey: string, debugKey?: string): Error {
  const msg = `${operation} for spine '${spineKey}'${debugKey ? ` (debugKey: ${debugKey})` : ''}`
  return new Error(msg, { cause: error })
}

/** Apply spine state with delta 0 and flush to skeleton (no time advance). Use after setAnimation when you want the first frame visible immediately.
 * When resetSlotsToSetup is true, resets slots to setup pose before apply. This prevents a one-frame blink where slots
 * briefly show the previous animation's end state (e.g. alpha 1) before the new animation's alpha timeline (e.g. 0 at time 0) applies. */
function immediateUpdate(spine: SpineInstance, resetSlotsToSetup = false): void {
  if (spine.state.tracks.length === 0) return
  if (resetSlotsToSetup) spine.skeleton.setSlotsToSetupPose()
  spine.state.update(0)
  spine.state.apply(spine.skeleton)
  spine.skeleton.update(0)
  spine.skeleton.updateWorldTransform(Physics.update)
  spine._validateAndTransformAttachments()
}

/**
 * Calculate attachment sizes for a spine instance
 * Returns a map of slot names to their size information
 */
function calculateAttachmentSizes(
  spine: SpineInstance,
  pixelRatio: number
): Record<string, AttachmentSizeInfo> {
  // Ensure skeleton is updated
  spine._validateAndTransformAttachments()

  const slots = spine.skeleton.slots
  const result: Record<string, AttachmentSizeInfo> = {}

  // Get Spine container's world transform for screen space conversion
  const spineWorldTransform = spine.worldTransform
  const spineScaleX = Math.sqrt(spineWorldTransform.a * spineWorldTransform.a + spineWorldTransform.c * spineWorldTransform.c)
  const spineScaleY = Math.sqrt(spineWorldTransform.b * spineWorldTransform.b + spineWorldTransform.d * spineWorldTransform.d)

  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i]
    if (!slot.bone.active) continue

    const attachment = slot.getAttachment()
    if (!attachment) continue

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity

    // Calculate world vertices bounds
    if (attachment instanceof RegionAttachment) {
      const vertices = new Float32Array(8)
      attachment.computeWorldVertices(slot, vertices, 0, 2)
      for (let j = 0; j < 8; j += 2) {
        minX = Math.min(minX, vertices[j])
        maxX = Math.max(maxX, vertices[j])
        minY = Math.min(minY, vertices[j + 1])
        maxY = Math.max(maxY, vertices[j + 1])
      }
    } else if (attachment instanceof MeshAttachment) {
      const vertices = new Float32Array(attachment.worldVerticesLength)
      attachment.computeWorldVertices(slot, 0, attachment.worldVerticesLength, vertices, 0, 2)
      for (let j = 0; j < vertices.length; j += 2) {
        minX = Math.min(minX, vertices[j])
        maxX = Math.max(maxX, vertices[j])
        minY = Math.min(minY, vertices[j + 1])
        maxY = Math.max(maxY, vertices[j + 1])
      }
    } else {
      // Skip other attachment types (PathAttachment, ClippingAttachment, etc.)
      continue
    }

    // Transform to screen space (accounting for Spine container's transform)
    const localWidth = maxX - minX
    const localHeight = maxY - minY
    const screenWidth = localWidth * spineScaleX
    const screenHeight = localHeight * spineScaleY

    // Transform position to screen space
    const localX = minX
    const localY = minY
    const screenX = localX * spineScaleX + spineWorldTransform.tx
    const screenY = localY * spineScaleY + spineWorldTransform.ty

    // Get original texture size from atlas region
    let textureWidth: number | null = null
    let textureHeight: number | null = null
    let oversizeX: number | null = null
    let oversizeY: number | null = null
    let renderedWidth: number | null = null
    let renderedHeight: number | null = null

    if (attachment instanceof RegionAttachment || attachment instanceof MeshAttachment) {
      const region = attachment.region
      if (region) {
        // Use originalWidth/originalHeight for the actual texture source size
        // These represent the original image dimensions before atlas packing
        textureWidth = region.originalWidth || region.width
        textureHeight = region.originalHeight || region.height

        // Calculate oversize ratio: texture size / rendered size
        // Account for device pixel ratio since textures render at devicePixelRatio
        // > 1.0 means texture is bigger than rendered (oversized)
        // < 1.0 means texture is smaller than rendered (undersized)
        // = 1.0 means perfect match
        if (screenWidth > 0 && screenHeight > 0) {
          renderedWidth = screenWidth * pixelRatio
          renderedHeight = screenHeight * pixelRatio
          oversizeX = textureWidth / renderedWidth
          oversizeY = textureHeight / renderedHeight
        }
      }
    }

    // Only include attachments with valid texture data
    if (textureWidth !== null && textureHeight !== null && renderedWidth !== null && renderedHeight !== null && oversizeX !== null && oversizeY !== null) {
      result[slot.data.name] = {
        width: screenWidth,
        height: screenHeight,
        x: screenX,
        y: screenY,
        attachmentName: attachment.name,
        attachmentType: attachment.constructor.name,
        renderedWidth,
        renderedHeight,
        textureWidth,
        textureHeight,
        oversizeX,
        oversizeY,
      }
    }
  }

  return result
}

/**
 * Calculate and store debug results for texture sizes
 */
function updateDebugResults(spine: SpineInstance, spineKey: string, app: Application): void {
  if (globalDebugMode !== 'texture-sizes') return

  const pixelRatio = app.renderer.resolution
  const attachmentSizes = calculateAttachmentSizes(spine, pixelRatio)

  // Calculate min/max oversize factors
  let minOversizeX = Infinity
  let minOversizeY = Infinity
  let maxOversizeX = -Infinity
  let maxOversizeY = -Infinity
  let minAttachmentX = ''
  let minAttachmentY = ''
  let maxAttachmentX = ''
  let maxAttachmentY = ''

  const readableAttachmentSizes = [] as string[]

  for (const [slotName, info] of Object.entries(attachmentSizes)) {
    if (info.oversizeX < minOversizeX) {
      minOversizeX = info.oversizeX
      minAttachmentX = slotName
    }
    if (info.oversizeX > maxOversizeX) {
      maxOversizeX = info.oversizeX
      maxAttachmentX = slotName
    }
    if (info.oversizeY < minOversizeY) {
      minOversizeY = info.oversizeY
      minAttachmentY = slotName
    }
    if (info.oversizeY > maxOversizeY) {
      maxOversizeY = info.oversizeY
      maxAttachmentY = slotName
    }
    readableAttachmentSizes.push(`${slotName}: ${info.oversizeX.toFixed(2)}/${info.oversizeY.toFixed(2)}`)
  }

  // Store results in global
  if (!globalThis.spineDebugResults) {
    globalThis.spineDebugResults = {}
  }

  const results = {
    ...attachmentSizes,
    min: {
      oversizeX: minOversizeX === Infinity ? 0 : minOversizeX,
      oversizeY: minOversizeY === Infinity ? 0 : minOversizeY,
      attachment: minAttachmentX || minAttachmentY || '',
    },
    max: {
      oversizeX: maxOversizeX === -Infinity ? 0 : maxOversizeX,
      oversizeY: maxOversizeY === -Infinity ? 0 : maxOversizeY,
      attachment: maxAttachmentX || maxAttachmentY || '',
    },
  } as SpineDebugResults

  // globalThis.spineDebugResults[spineKey] = results
  globalThis.spineDebugResults[spineKey] = {
    minMax: `${results.min.oversizeX.toFixed(2)}/${results.max.oversizeX.toFixed(2)}: ${readableAttachmentSizes.join(', ')}`,
  } as any
}

/** Data for a single slot's attachment (world vertices, bone transform, etc.). Exported for consumers that need full data. */
export interface AttachmentUpdateData {
  slotName: string
  slotIndex: number
  attachmentName: string | null
  attachmentType: string | null
  bonePosition: { x: number; y: number }
  boneRotation: number
  boneScale: { x: number; y: number }
  worldVertices: Float32Array | null
  visible: boolean
}

/** PIXI-like object that SpineBase will update each frame (x, y, and optionally scale). */
export interface AttachmentsFollowTarget {
  x: number
  y: number
  scale?: { x: number; y: number }
}

/** One entry for attachmentsFollow: slot or bone to follow and ref to the PIXI object to position each frame. */
export interface AttachmentsFollowItem {
  /** Follow attachment slot (uses slot's bone transform) */
  slotName?: string
  /** Follow bone directly (pos + scale). Use slotName OR boneName, not both. */
  boneName?: string
  ref: RefObject<AttachmentsFollowTarget | null>
  /** Scale modifier applied to bone scale (default 1). E.g. 0.5 = half size, 2 = double. */
  scaleModifier?: number
  /** Scale offset added after modifier (default 0). Number applies to both axes, or use { x, y } for per-axis. */
  scaleOffset?: number | { x: number; y: number }
  /** Linear scale compensation: at scale 1 output stays 1; at scale `at` output becomes `result`. E.g. { at: 0.8, result: 0.77 } maps 0.8→0.77. Applied before modifier/offset. */
  scaleCompensation?: { at: number; result: number }
}

/** Payload for animation track events (Spine editor events). Generic TName narrows event.name for typed callbacks. */
export interface SpineEvent<TName extends string = string> {
  name: TName
  intValue?: number
  floatValue?: number
  stringValue?: string
  time: number
  trackIndex: number
}

function getFollowTransform(spine: SpineInstance, item: AttachmentsFollowItem): { x: number; y: number; scaleX: number; scaleY: number } | null {
  if (item.slotName) {
    const slot = spine.skeleton.findSlot(item.slotName)
    if (!slot) return null
    const bone = slot.bone
    return {
      x: bone.worldX,
      y: bone.worldY,
      scaleX: bone.getWorldScaleX(),
      scaleY: bone.getWorldScaleY(),
    }
  }
  if (item.boneName) {
    const bone = spine.skeleton.findBone(item.boneName)
    if (!bone) return null
    return {
      x: bone.worldX,
      y: bone.worldY,
      scaleX: bone.getWorldScaleX(),
      scaleY: bone.getWorldScaleY(),
    }
  }
  return null
}

/** Render mode for simplified spine visualization. 'normal' = default, 'silhouette' = flat color preserving texture alpha, 'ghosted' = fully desaturated gray preserving texture alpha/shape. */
export type SpineRenderMode = 'normal' | 'silhouette' | 'ghosted'

const silhouetteFilterVertex = `in vec2 aPosition;
out vec2 vTextureCoord;
uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;
vec4 filterVertexPosition(void) {
  vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
  position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
  position.y = position.y * (2.0 * uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
  return vec4(position, 0.0, 1.0);
}
vec2 filterTextureCoord(void) {
  return aPosition * (uOutputFrame.zw * uInputSize.zw);
}
void main(void) {
  gl_Position = filterVertexPosition();
  vTextureCoord = filterTextureCoord();
}`

const silhouetteFilterFragment = `in vec2 vTextureCoord;
uniform sampler2D uTexture;
uniform vec3 uSilhouetteColor;
void main(void) {
  float a = texture(uTexture, vTextureCoord).a;
  gl_FragColor = vec4(uSilhouetteColor * a, a);
}`

let _silhouetteFilter: Filter | null = null
function getSilhouetteFilter(): Filter {
  if (!_silhouetteFilter) {
    _silhouetteFilter = new Filter({
      glProgram: new GlProgram({ vertex: silhouetteFilterVertex, fragment: silhouetteFilterFragment }),
      resources: {
        uniforms: { uSilhouetteColor: { value: new Float32Array([0.55, 0.55, 0.55]), type: 'vec3<f32>' } },
      },
    })
  }
  return _silhouetteFilter
}

let _ghostedFilter: ColorMatrixFilter | null = null
function getGhostedFilter(): ColorMatrixFilter {
  if (!_ghostedFilter) {
    _ghostedFilter = new ColorMatrixFilter()
    _ghostedFilter.desaturate()
  }
  return _ghostedFilter
}

export interface SpineOverrideControllerPublicAPI {
  getMergedProps: <T>(props: T) => T
  useReactiveUpdateHook(control: string): { counter: number }
}

export interface SpineProps
  extends Pick<PixiReactElementProps<typeof Container>, 'x' | 'y' | 'eventMode' | 'cursor' | 'filters' | 'layout' | 'zIndex' | 'mask' | 'scale' | 'origin'> {
  // === Core ===
  /** The spine key: "spineName" or "spineName/skeleton" for multi-skeleton folders */
  spine: string
  /** Skin name to apply (optional) */
  skin?: string

  // === Animation ===
  /** Animation name to play (optional, defaults to first animation) */
  animation?: string
  /** Whether the animation should loop (default: false) */
  loop?: boolean
  /** Animation to play on track 1 (layered on top of track 0). Set to undefined/null to clear track 1. */
  animation2?: string
  /** Whether the track 1 animation should loop (default: false) */
  loop2?: boolean
  /** Animation playback speed (default: 1.0) */
  timeScale?: number
  /** @deprecated Use `paused` prop instead. Whether the animation is playing (default: true). Set to false to pause/freeze on first frame */
  playing?: boolean
  /** Whether the animation is paused (default: false). Only one of `playing` or `paused` should be passed. */
  paused?: boolean
  /** Animation progress from 0 to 1. If passed on initial render, sets the play progress. When changed, updates play progress to that percentage. */
  animationProgress?: number
  /** Mix time for animation transitions (default: 0.25) */
  mixTime?: number
  /**
   * Per-animation mix-time overrides applied via AnimationStateData.setMix().
   * Each rule targets one animation name and a direction:
   *   - 'from'  → override the mix when leaving that animation (from → *)
   *   - 'to'    → override the mix when entering that animation (* → to)
   *   - 'both'  → both directions
   * Applied on every animation switch; defaults fall back to `mixTime`.
   * Example: [{animation:'idle', direction:'from', mixTime:0}]
   *   means leaving 'idle' always cuts instantly with no blend.
   */
  mixTimeRules?: Array<{
    animation: string
    direction: 'from' | 'to' | 'both'
    mixTime: number
  }>
  /** Delay before starting animation initially in seconds (default: 0) */
  initialDelay?: number
  /** Delay before resuming animation when playing changes from false->true in seconds (default: 0) */
  resumeDelay?: number
  /** Whether to reset animation to initial frame when playing changes from true->false (default: false) */
  resetOnPause?: boolean
  /** Delay before next loop iteration when loop is true in seconds (default: 0) */
  loopDelay?: number
  /** When set to true, starts animation playback (changes to false are ignored) */
  startPlaying?: boolean
  startPlayingNoReset?: boolean
  /** Increment to reset current animation to start (uses mix time). SpineBase reacts when this increases. */
  resetCounter?: number
  /** @deprecated Use mixTime={0} instead. When mixTime is 0, animation switches apply immediately (no mix transition). */
  instantReset?: boolean
  /** When true, play animation in reverse. Uses TrackEntry.reverse (native Spine API). */
  reverse?: boolean

  // === Layout ===
  x?: number
  y?: number
  scaleAnimationDuration?: number

  // === Bounds ===
  xBounds?: number
  yBounds?: number
  widthBounds?: number
  heightBounds?: number

  // === Callbacks ===
  /** Callback fired when the current animation completes (fires even when loop=true) */
  onCurrentAnimComplete?: () => void
  /** Callback fired when any track completes. Receives the track index. Fires for all tracks, including mixing-out entries. */
  onAnimationTrackComplete?: (trackIndex: number) => void
  /** Callback fired when spine is loaded and ready */
  onSpineLoaded?: (spine: SpineInstance) => void
  /** Callback fired when an animation track emits an event (e.g., events defined in Spine editor). With typed SpineTypes, event.name is narrowed to that spine's event names. */
  onAnimationEvent?: (event: SpineEvent) => void

  // === Debug ===
  /** When set, exposes ref and live state on globalThis.spineDebug[key] (getters, no extra code paths) */
  debugKey?: string

  // === Refs ===
  /** Container ref */
  itemRef?: Ref<Container>
  /** React 19 ref prop */
  ref?: RefObject<Container>
  spineRef?: RefObject<SpineInstance | null>

  // === Attachments (world vertices) ===
  /** Slots to follow: SpineBase sets each ref's x/y (and scale if present) each frame to the attachment bone's world transform. Ref must be a PIXI object added as a child of this Spine's container. Uses app ticker (useTick). */
  attachmentsFollow?: AttachmentsFollowItem[]
  /** When true, hide attachments whose texture path starts with "ref_". When a string, use that prefix. When an array, hide if path starts with any prefix. Uses slot.color.a=0 so the spine renderer skips them. */
  forceHideAttachment?: boolean | string | string[]
  /** Exact path/name match - hide when path === p or name === p. Used for per-attachment toggles. */
  forceHideAttachmentExact?: string[]
  /** When true, Region/Mesh slots render with alpha 0 so only wireframe overlay (SpineDebugRenderer) shows fills. */
  textureWireframeMode?: boolean
  /** Render mode: 'silhouette' = flat color preserving texture alpha (shows exact shapes), 'ghosted' = fully desaturated gray. Default 'normal'. */
  renderMode?: SpineRenderMode

  // === Required ===
  spineLoader: SpineLoader
  globalController?: SpineOverrideControllerPublicAPI
  control?: string
}

export const SpineBase = (props: SpineProps) => {
  const app = useApplication()
  const {
    // Core
    spine: spineKey,
    spineLoader,
    skin,

    // Animation
    animation,
    loop = false,
    timeScale: timeScaleProp = 1.0,
    playing,
    paused,
    animationProgress,
    mixTime: _mixTime = 0.25,
    mixTimeRules,
    initialDelay = 0,
    resumeDelay = 0,
    resetOnPause,
    loopDelay = 0,
    startPlaying,
    startPlayingNoReset,
    resetCounter,
    instantReset, // Deprecated: use mixTime === 0 instead
    reverse = false,
    animation2,
    loop2 = false,

    // Layout
    x = 0,
    y = 0,
    eventMode,
    cursor,
    filters,
    layout,
    zIndex,
    scale,
    scaleAnimationDuration,

    // Bounds
    xBounds,
    yBounds,
    widthBounds,
    heightBounds,

    // Callbacks
    onCurrentAnimComplete,
    onAnimationTrackComplete,
    onSpineLoaded,
    onAnimationEvent,

    // Debug
    debugKey,

    // Refs
    itemRef,
    ref: refProp,
    spineRef: spineRefProp,

    // Attachments
    attachmentsFollow,
    forceHideAttachment,
    forceHideAttachmentExact,
    textureWireframeMode = false,
    renderMode = 'normal',

    ...passthroughProps
  } = props.globalController ? props.globalController.getMergedProps(props) : props
  if (props.globalController && props.control) {
    const { counter } = props.globalController.useReactiveUpdateHook(props.control)
  }

  const mixTime = instantReset ? 0 : _mixTime

  const attachmentsFollowRef = useRef(attachmentsFollow)
  attachmentsFollowRef.current = attachmentsFollow

  const forceHidePrefixes: string[] | null = forceHideAttachment === true
    ? ['ref_']
    : typeof forceHideAttachment === 'string'
      ? [forceHideAttachment]
      : Array.isArray(forceHideAttachment) && forceHideAttachment.length > 0
        ? forceHideAttachment.filter((p): p is string => typeof p === 'string')
        : null
  const forceHideAttachmentPrefixesRef = useRef<string[] | null>(forceHidePrefixes)
  forceHideAttachmentPrefixesRef.current = forceHidePrefixes

  const forceHideExact: string[] = Array.isArray(forceHideAttachmentExact)
    ? forceHideAttachmentExact.filter((p): p is string => typeof p === 'string')
    : []
  const forceHideAttachmentExactRef = useRef<string[]>(forceHideExact)
  forceHideAttachmentExactRef.current = forceHideExact

  const textureWireframeModeRef = useRef(textureWireframeMode)
  textureWireframeModeRef.current = textureWireframeMode

  const renderModeFilter = useMemo(() => {
    if (renderMode === 'silhouette') return getSilhouetteFilter()
    if (renderMode === 'ghosted') return getGhostedFilter()
    return null
  }, [renderMode])
  const mergedFilters = useMemo(() => {
    if (!renderModeFilter && !filters) return filters
    const base = filters ? (Array.isArray(filters) ? filters : [filters]) : []
    return renderModeFilter ? [...base, renderModeFilter] : base
  }, [filters, renderModeFilter])

  // Update PIXI objects (x, y, scale) each frame to follow attachment bone transforms
  useTick(() => {
    const spine = spineRef.current
    const list = attachmentsFollowRef.current
    if (!spine || !list?.length) return
    spine._validateAndTransformAttachments()
    for (const item of list) {
      const target = item.ref.current
      if (!target) continue
      const t = getFollowTransform(spine, item)
      if (!t) continue
      target.x = t.x
      target.y = t.y
      if (target.scale !== undefined) {
        let sx = t.scaleX
        let sy = t.scaleY
        const comp = item.scaleCompensation
        if (comp && Math.abs(comp.at - 1) > 1e-6) {
          const slope = (comp.result - 1) / (comp.at - 1)
          sx = 1 + slope * (sx - 1)
          sy = 1 + slope * (sy - 1)
        }
        const mod = item.scaleModifier ?? 1
        const off = item.scaleOffset
        const offX = typeof off === 'number' ? off : off?.x ?? 0
        const offY = typeof off === 'number' ? off : off?.y ?? 0
        target.scale.x = sx * mod + offX
        target.scale.y = sy * mod + offY
      }
    }
  })

  // Determine playing state: if paused is explicitly passed, use !paused, otherwise use playing (default true)
  // Only one should be passed at a time
  const isPlaying = paused !== undefined ? !paused : (playing !== undefined ? playing : true)

  const ref = useRef<Container>(null!)
  const spineRef = useRef<SpineInstance | null>(null)
  const onCompleteRef = useRef(onCurrentAnimComplete)
  const onTrackCompleteRef = useRef(onAnimationTrackComplete)
  const onEventRef = useRef(onAnimationEvent)
  const listenerRef = useRef<{ complete: (trackEntry: any) => void; event?: (trackEntry: any, event: any) => void } | null>(null)
  const previousPlayingRef = useRef<boolean>(isPlaying)
  const loopDelayRef = useRef<number>(loopDelay)
  const loopTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const prevResetCounterRef = useRef<number>(resetCounter ?? 0)
  const mixAnimationFrameRef = useRef<number | null>(null)

  // Debug tracking refs
  const mountTimeRef = useRef<string>('')
  const allAnimationsStartCountRef = useRef<number>(0)
  const currentAnimationStartCountRef = useRef<number>(0)
  const currentAnimationNameRef = useRef<string | null>(null)
  const setAnimationCallCountRef = useRef<number>(0)

  // Subscribe to global spine overrides
  const spineOverrides = useSnapshot(globalSpineOverrides).overrides[spineKey]

  const timeScale = spineOverrides?.isActive ? spineOverrides.timeScale : timeScaleProp
  const timeScaleRef = useRef<number>(timeScale)

  const updateMixTime = () => {
    if (spineRef.current) {
      spineRef.current.state.data.defaultMix = mixTime
    }
  }

  /** Apply mixTimeRules to AnimationStateData.setMix() for all animation pairs. */
  const applyMixTimeRules = (spine: SpineInstance) => {
    if (!mixTimeRules || mixTimeRules.length === 0) return
    const data = spine.state.data
    const animations = spine.skeleton.data.animations
    if (!animations) return
    const names = animations.map((a: any) => a.name as string)
    for (const rule of mixTimeRules) {
      // Only apply rule if the animation exists in this skeleton
      if (!names.includes(rule.animation)) continue
      for (const name of names) {
        if (name === rule.animation) continue
        if (rule.direction === 'from' || rule.direction === 'both') {
          data.setMix(rule.animation, name, rule.mixTime)
        }
        if (rule.direction === 'to' || rule.direction === 'both') {
          data.setMix(name, rule.animation, rule.mixTime)
        }
      }
    }
  }

  const updateAnimationProgress = () => {
    if (!spineRef.current || animationProgress === undefined) return

    const track = spineRef.current.state.tracks[0]
    if (!track || !track.animation) return

    const duration = track.animation.duration
    if (duration <= 0) return

    // Calculate time from progress (0-1)
    const targetTime = animationProgress * duration

    // Clamp to valid range
    const clampedTime = Math.max(0, Math.min(targetTime, duration))

    // Set track time
    track.trackTime = clampedTime
    // track.trackEnd = clampedTime

    // Apply the state immediately
    spineRef.current.state.apply(spineRef.current.skeleton)
    spineRef.current.skeleton.updateWorldTransform(Physics.update)
  }

  // Register spine on mount
  useEffect(() => {
    registerSpine(spineKey, timeScaleProp)

    return () => {
      unregisterSpine(spineKey)
    }
  }, [spineKey, timeScaleProp])

  useEffect(() => {
    if (spineRefProp && 'current' in spineRefProp) {
      spineRefProp.current = spineRef.current
    }

    if (refProp && 'current' in refProp) {
      refProp.current = ref.current
    }

    if (itemRef && 'current' in itemRef) {
      itemRef.current = ref.current
    }
  }, [spineKey, refProp, itemRef])

  // Track animation starts for debug
  const trackAnimationStart = (animName: string) => {
    if (!debugKey) return

    allAnimationsStartCountRef.current++

    // Reset current animation count if animation changed
    if (currentAnimationNameRef.current !== animName) {
      currentAnimationNameRef.current = animName
      currentAnimationStartCountRef.current = 0
    }

    currentAnimationStartCountRef.current++
  }

  // Helper to track setAnimation calls; returns TrackEntry so caller can set .reverse etc.
  const trackedSetAnimation = (spine: SpineInstance, trackIndex: number, animationName: string, loop: boolean) => {
    // eslint-disable-next-line no-useless-catch
    try {
      setAnimationCallCountRef.current++
      const track = spine.state.setAnimation(trackIndex, animationName, loop)
      track.reverse = reverse
      return track
    } catch (err) {
      throw err
    }
  }

  // Expose ref + live state on globalThis.spineDebug[debugKey] via getters (no extra state)
  useEffect(() => {
    if (!debugKey) return

    // Set mount time
    mountTimeRef.current = new Date().toISOString()

    const global = globalThis as any
    if (!global.spineDebug) {
      global.spineDebug = {}
    }
    const key = debugKey
    global.spineDebug[key] = {
      get ref() {
        return ref.current
      },
      get spineRef() {
        return spineRef.current
      },
      get spineName() {
        return spineKey
      },
      get currentAnimation() {
        const s = spineRef.current
        const track = s?.state?.tracks?.[0]
        return (track as { animation?: { name?: string } } | undefined)?.animation?.name ?? null
      },
      get timeScale() {
        return spineRef.current?.state?.timeScale ?? null
      },
      get currentSkin() {
        const s = spineRef.current
        const applied = (s?.skeleton as { skin?: { name?: string } } | undefined)?.skin?.name
        return applied ?? skin ?? null
      },
      get mountTime() {
        return mountTimeRef.current
      },
      get setAnimationCallCount() {
        return setAnimationCallCountRef.current
      },
      get debugString() {
        const s = spineRef.current
        const track = s?.state?.tracks?.[0]
        const animName = (track as { animation?: { name?: string } } | undefined)?.animation?.name ?? 'none'
        const appliedSkin = (s?.skeleton as { skin?: { name?: string } } | undefined)?.skin?.name
        const skinName = appliedSkin ?? skin ?? 'default'
        const ts = s?.state?.timeScale ?? 0
        const timeScaleStr = ts === 0 ? '0' : ts.toString()

        return `[${allAnimationsStartCountRef.current}/${currentAnimationStartCountRef.current}] [a:${animName}] [s:${skinName}] (${timeScaleStr}) [setAnim:${setAnimationCallCountRef.current}]`
      },
      get attachmentSizes() {
        const s = spineRef.current
        if (!s) return null

        const pixelRatio = app.app.renderer.resolution
        const attachmentSizes = calculateAttachmentSizes(s, pixelRatio)

        // Convert to legacy format for backward compatibility
        const result: Record<string, {
          width: number
          height: number
          x: number
          y: number
          attachmentName: string | null
          attachmentType: string
          renderedWidth: number | null
          renderedHeight: number | null
          textureWidth: number | null
          textureHeight: number | null
          textureOversizeX: number | null
          textureOversizeY: number | null
        }> = {}

        for (const [slotName, info] of Object.entries(attachmentSizes)) {
          result[slotName] = {
            width: info.width,
            height: info.height,
            x: info.x,
            y: info.y,
            attachmentName: info.attachmentName,
            attachmentType: info.attachmentType,
            renderedWidth: info.renderedWidth,
            renderedHeight: info.renderedHeight,
            textureWidth: info.textureWidth,
            textureHeight: info.textureHeight,
            textureOversizeX: info.oversizeX,
            textureOversizeY: info.oversizeY,
          }
        }

        return result
      },
    }
    return () => {
      const d = global.spineDebug
      if (d) delete d[key]
    }
  }, [debugKey, spineKey, skin])

  useLayoutEffect(() => {
    if (!ref.current) return

    let destroyed = false
    const loadSpine = async () => {
      try {
        if (destroyed) {
          return
        }

        // Load spine (spineKey is "spineName" or "spineName/skeleton")
        await spineLoader.loadSpine(spineKey)

        // Create a new Spine instance from the cached skeleton data
        const { spine, x: spineX = 0, y: spineY = 0, scale: spineScale = 0 } = spineLoader.createSpine(spineKey, {
          ...(xBounds && yBounds && widthBounds && heightBounds ? {
            boundsProvider: new AABBRectangleBoundsProvider(xBounds, yBounds, widthBounds, heightBounds),
          } : {}),
        })

        // Apply x, y, and scale from createSpine to the spine instance itself
        spine.x = spineX
        spine.y = spineY
        if (spineScale !== 0) {
          spine.scale.set(spineScale, spineScale)
        }

        // Preload textures to GPU before adding to stage. PIXI uploads textures lazily on first
        // render; without this, the first frame shows no textures. prepare.upload() resolves when
        // all TextureSources are uploaded.
        const sources = spineLoader.getTextureSourcesForPreload?.(spineKey)
        const pixiApp = app?.app
        const prepare = pixiApp?.renderer?.prepare
        if (sources?.length && prepare) {
          await prepare.upload(sources)
        }

        if (destroyed) return

        // Add spine to container
        spineRef.current = spine

        // Force-hide attachments by texture path prefix (e.g. ref_). Runs after state.apply; sets slot.color.a=0
        // so transformAttachments computes alpha=0 and skipRender, and SpinePipe skips adding to batch.
        const prevAfter = spine.afterUpdateWorldTransforms
        spine.afterUpdateWorldTransforms = (spineObj) => {
          prevAfter(spineObj)
          const wireframe = textureWireframeModeRef.current
          const prefixes = forceHideAttachmentPrefixesRef.current
          const exact = forceHideAttachmentExactRef.current
          const hasPrefixes = prefixes?.length
          const hasExact = exact?.length
          if (!wireframe && !hasPrefixes && !hasExact) return
          const slots = spineObj.skeleton.drawOrder
          for (let i = 0; i < slots.length; i++) {
            const slot = slots[i]
            const att = slot.getAttachment()
            if (!att || !(att instanceof RegionAttachment || att instanceof MeshAttachment)) continue
            if (wireframe) {
              slot.color.a = 0
              continue
            }
            const path = (att as RegionAttachment).path ?? att.name
            const attName = att.name
            const matchesPrefix = hasPrefixes && prefixes!.some(
              (p) => (path && path.startsWith(p)) || (attName && attName.startsWith(p))
            )
            const matchesExact = hasExact && exact.some(
              (p) => (path === p) || (attName === p)
            )
            if (matchesPrefix || matchesExact) slot.color.a = 0
          }
        }

        // Sync spineRef prop immediately
        if (spineRefProp && 'current' in spineRefProp) {
          spineRefProp.current = spine
        }

        // Set animation with initial delay if provided
        const setAnimationWithDelay = () => {
          try {
            // Set animation if provided, otherwise use first available
            if (animation) {
              trackedSetAnimation(spine, 0, animation, loop)
              trackAnimationStart(animation)
            } else {
              // Get first animation name from skeleton data
              const animations = spine.skeleton.data.animations
              if (animations && animations.length > 0) {
                const firstAnim = animations[0].name
                trackedSetAnimation(spine, 0, firstAnim, loop)
                trackAnimationStart(firstAnim)
              } else {
                console.warn('[SpineBase] No animations available in skeleton data')
              }
            }
          } catch (error) {
            throw wrapSpineError(error, 'Failed to set animation', spineKey, debugKey)
          }
        }

        if (initialDelay > 0) {
          // Set time scale to 0 initially to pause animation
          spine.state.timeScale = 0
          // Start animation after initial delay
          setTimeout(() => {
            if (!destroyed && spineRef.current) {
              setAnimationWithDelay()
              // Set time scale based on playing state
              spineRef.current.state.timeScale = isPlaying ? timeScale : 0
              // Apply initial animation progress if provided
              updateAnimationProgress()
            }
          }, initialDelay * 1000) // Convert seconds to milliseconds
        } else {
          // No initial delay, set animation immediately
          setAnimationWithDelay()
        }

        // Set animation on track 1 if provided
        if (animation2) {
          try {
            spine.state.setAnimation(1, animation2, loop2)
          } catch (error) {
            throw wrapSpineError(error, `Failed to set animation2 '${animation2}'`, spineKey, debugKey)
          }
        }

        // Store the timeScale value
        timeScaleRef.current = timeScale

        // Set time scale based on playing state (only if no initial delay)
        if (initialDelay === 0) {
          spine.state.timeScale = isPlaying || startPlaying ? timeScale : 0
        }

        updateMixTime()
        applyMixTimeRules(spine)

        // Apply initial animation progress if provided
        if (animationProgress !== undefined) {
          updateAnimationProgress()
        }

        // Set skin if provided
        if (skin) {
          try {
            const skinData = spine.skeleton.data.findSkin(skin)
            if (skinData) {
              spine.skeleton.setSkin(skinData)
              spine.skeleton.setSlotsToSetupPose()
            }
          } catch (error) {
            throw wrapSpineError(error, `Failed to set skin '${skin}'`, spineKey, debugKey)
          }
        }

        // Set up animation complete listener
        onCompleteRef.current = onCurrentAnimComplete
        onTrackCompleteRef.current = onAnimationTrackComplete
        onEventRef.current = onAnimationEvent
        const listener: { complete: (trackEntry: any) => void; event?: (trackEntry: any, event: any) => void } = {
          complete: (trackEntry: any) => {
            // Fire general track complete for any track
            if (onTrackCompleteRef.current) {
              onTrackCompleteRef.current(trackEntry.trackIndex)
            }

            // Only fire callback for the main track (track 0)
            if (trackEntry.trackIndex !== 0) return
            // Skip completion for entries that are mixing out (were interrupted/reset).
            // When resetCounter triggers setAnimation(same anim), the old entry becomes mixingFrom.
            // Its trackTime still advances during mix; when it reaches animationEnd, Spine queues complete.
            // We ignore that—the user intentionally reset, so we don't want completion for the abandoned anim.
            if (trackEntry.mixingTo) return
            if (onCompleteRef.current) {
              onCompleteRef.current()
            }

            // Handle loop delay
            if (loopDelayRef.current > 0 && spineRef.current) {
              // Clear any existing loop timeout
              if (loopTimeoutRef.current) {
                clearTimeout(loopTimeoutRef.current)
              }

              // Pause animation temporarily
              spineRef.current.state.timeScale = 0

              // Resume after loop delay
              loopTimeoutRef.current = setTimeout(() => {
                if (spineRef.current && isPlaying) {
                  spineRef.current.state.timeScale = timeScaleRef.current
                }
              }, loopDelayRef.current * 1000) // Convert seconds to milliseconds
            }
          },
        }

        // Add event listener if callback is provided
        if (onAnimationEvent) {
          listener.event = (trackEntry: any, event: any) => {
            if (onEventRef.current) {
              onEventRef.current({
                name: event.data.name,
                intValue: event.intValue,
                floatValue: event.floatValue,
                stringValue: event.stringValue,
                time: event.time,
                trackIndex: trackEntry.trackIndex,
              })
            }
          }
        }
        listenerRef.current = listener
        spine.state.addListener(listener)


        ref.current.addChild(spine)

        // Explicitly update spine state and skeleton to ensure first frame is rendered correctly
        if (spine.state.tracks.length > 0) {
          immediateUpdate(spine)
        }

        updateDebugResults(spine, spineKey, app.app)

        // await new Promise<void>(resolve => {
        //   requestAnimationFrame(() => {
        //   requestAnimationFrame(() => {
        //     resolve()
        //   })
        //   })
        // })
        // Call onSpineLoaded callback
        if (onSpineLoaded) {
          onSpineLoaded(spine)
        }

      } catch (error) {
        console.error(`Failed to load spine '${spineKey}':`, error)
      }
    }

    void loadSpine()

    return () => {
      destroyed = true

      // Clear loop timeout
      if (loopTimeoutRef.current) {
        clearTimeout(loopTimeoutRef.current)
        loopTimeoutRef.current = null
      }

      // Clear mix animation frame
      if (mixAnimationFrameRef.current !== null) {
        cancelAnimationFrame(mixAnimationFrameRef.current)
        mixAnimationFrameRef.current = null
      }

      if (spineRef.current) {
        // Remove listeners before destroying
        // if (listenerRef.current) {
        //   spineRef.current.state.removeListener(listenerRef.current)
        //   listenerRef.current = null
        // }
        // Remove from container before destroying
        try {
          if (ref.current && spineRef.current.parent === ref.current) {
            ref.current.removeChild(spineRef.current)
          }
          spineRef.current.destroy()
        } catch (error) {
          console.warn('[SpineBase] Error during cleanup:', error)
        }
        spineRef.current = null
      }
    }

    // Reload when spine key changes
  }, [spineKey])

  useEffect(() => {
    updateMixTime()
    if (spineRef.current) applyMixTimeRules(spineRef.current)
  }, [mixTime, mixTimeRules]) // eslint-disable-line react-hooks/exhaustive-deps

  // Handle animationProgress changes
  useEffect(() => {
    if (!spineRef.current || animationProgress === undefined) return
    updateAnimationProgress()
  }, [animationProgress]) // eslint-disable-line react-hooks/exhaustive-deps

  // Handle reverse changes: update the current track entry directly
  useEffect(() => {
    const track = spineRef.current?.state?.tracks?.[0]
    if (track) track.reverse = reverse
  }, [reverse])

  const setTimeScale = () => {
    if (spineRef.current) {
      spineRef.current.state.timeScale = isPlaying ? timeScaleRef.current : 0
    }
  }
  // Handle animation and loop prop changes (separate effect to avoid re-creating spine)
  useEffect(() => {
    if (!spineRef.current) {
      return
    }

    const animToUse = getAnimToUse(animation, spineRef.current)
    if (!animToUse) return

    const track = spineRef.current.state.tracks[0]
    const currentAnim = track?.animation?.name

    if (currentAnim !== animToUse) {
      // Clear any existing loop timeout when animation changes
      if (loopTimeoutRef.current) {
        clearTimeout(loopTimeoutRef.current)
        loopTimeoutRef.current = null
      }
      // Re-apply mix rules before the switch so per-pair mix is current
      applyMixTimeRules(spineRef.current)
      try {
        trackedSetAnimation(spineRef.current, 0, animToUse, loop)
        trackAnimationStart(animToUse)
        // When mixTime is 0, apply instant reset behavior (no mix transition)
        if (mixTime === 0) {
          const track = spineRef.current.state.tracks[0]
          if (track) track.mixDuration = 0
          immediateUpdate(spineRef.current, true)
        }
        // Update debug results if debug mode is enabled
        if (spineRef.current) {
          updateDebugResults(spineRef.current, spineKey, app.app)
        }
      } catch (error) {
        throw wrapSpineError(error, `Failed to set animation '${animToUse}'`, spineKey, debugKey)
      }
      // Set time scale since we clearn existing loop which might have ben stopped
      setTimeScale()
    } else {
      // Animation unchanged, but loop might have changed - need to update it
      const currentLoop = track?.loop ?? false
      if (currentLoop !== loop) {
        try {
          trackedSetAnimation(spineRef.current, 0, animToUse, loop)
          trackAnimationStart(animToUse)
          // When mixTime is 0, apply instant reset behavior (no mix transition)
          if (mixTime === 0) {
            const t = spineRef.current.state.tracks[0]
            if (t) t.mixDuration = 0
            immediateUpdate(spineRef.current, true)
          }
          // Update debug results if debug mode is enabled
          if (spineRef.current) {
            updateDebugResults(spineRef.current, spineKey, app.app)
          }
        } catch (error) {
          throw wrapSpineError(error, `Failed to set animation '${animToUse}'`, spineKey, debugKey)
        }
      }
    }
  }, [animation, loop, mixTime, spineKey])

  // Handle animation2 / loop2 changes on track 1
  useEffect(() => {
    const spine = spineRef.current
    if (!spine) return
    if (!animation2) {
      spine.state.clearTrack(1)
      return
    }
    const track = spine.state.tracks[1]
    const currentAnim = track?.animation?.name
    if (currentAnim !== animation2) {
      try {
        spine.state.setAnimation(1, animation2, loop2)
      } catch (error) {
        throw wrapSpineError(error, `Failed to set animation2 '${animation2}'`, spineKey, debugKey)
      }
    } else if ((track?.loop ?? false) !== loop2) {
      try {
        spine.state.setAnimation(1, animation2, loop2)
      } catch (error) {
        throw wrapSpineError(error, `Failed to set animation2 '${animation2}'`, spineKey, debugKey)
      }
    }
  }, [animation2, loop2, spineKey])

  // Handle playing/paused, timeScale changes with resumeDelay and resetOnPause
  useEffect(() => {
    if (!spineRef.current) {
      return
    }

    const previousPlaying = previousPlayingRef.current
    const isResuming = !previousPlaying && isPlaying
    const isPausing = previousPlaying && !isPlaying

    timeScaleRef.current = timeScale

    if (isPausing && resetOnPause) {
      // Reset animation to initial frame when pausing
      const track = spineRef.current.state.tracks[0]
      if (track) {
        track.trackTime = 0
      }
    }

    let cleanup: (() => void) | undefined
    if (isPlaying) {
      if (isResuming && resumeDelay > 0) {
        spineRef.current.state.timeScale = 0
        // TODO split into playing, timeScale hooks there
        const timeout = setTimeout(() => {
          if (spineRef.current) {
            spineRef.current.state.timeScale = timeScaleRef.current
          }
        }, resumeDelay * 1000) // Convert seconds to milliseconds
        cleanup = () => clearTimeout(timeout)
      } else {
        // Resume animation immediately
        spineRef.current.state.timeScale = timeScaleRef.current
      }
    } else {
      // Pause animation by setting timeScale to 0
      spineRef.current.state.timeScale = 0
    }

    // Update previous playing ref
    previousPlayingRef.current = isPlaying

    return cleanup

    // ignore resumeDelay, resetOnPause
  }, [isPlaying, timeScale])

  // Handle resetCounter changes: reset current animation to start (uses mix time)
  useEffect(() => {
    const cur = resetCounter ?? 0
    if (cur === prevResetCounterRef.current) {
      return
    }
    prevResetCounterRef.current = cur

    if (!spineRef.current) return

    const animToUse = getAnimToUse(animation, spineRef.current)
    if (!animToUse) return

    if (loopTimeoutRef.current) {
      clearTimeout(loopTimeoutRef.current)
      loopTimeoutRef.current = null
    }

    // Clear any existing mix animation frame
    if (mixAnimationFrameRef.current !== null) {
      cancelAnimationFrame(mixAnimationFrameRef.current)
      mixAnimationFrameRef.current = null
    }

    const spine = spineRef.current
    const wasPlaying = isPlaying

    try {
      trackedSetAnimation(spine, 0, animToUse, loop)
      trackAnimationStart(animToUse)
    } catch (error) {
      throw wrapSpineError(error, `Failed to set animation '${animToUse}'`, spineKey, debugKey)
    }

    // When mixTime is 0, apply instant reset behavior (no mix transition)
    if (mixTime === 0) {
      const track = spine.state.tracks[0]
      if (track) {
        track.mixDuration = 0
        track.trackTime = 0
      }
      immediateUpdate(spine, true)

      return
    }

    // If paused and mixTime > 0, manually advance the mix to complete smoothly
    if (!wasPlaying && mixTime > 0) {
      const track = spine.state.tracks[0]
      if (track) {
        // Function to manually advance the mix
        const advanceMix = () => {
          if (!spineRef.current) {
            mixAnimationFrameRef.current = null
            return
          }

          const currentTrack = spineRef.current.state.tracks[0]
          if (!currentTrack) {
            mixAnimationFrameRef.current = null
            return
          }

          // Check if mix is still active (mixingFrom exists and mixTime < mixDuration)
          const mixingFrom = currentTrack.mixingFrom
          if (mixingFrom && currentTrack.mixTime < currentTrack.mixDuration) {
            // Temporarily set timeScale to 1 to allow the mix to advance
            // (state.update multiplies by timeScale, so 0 would prevent advancement)
            const previousTimeScale = spineRef.current.state.timeScale
            spineRef.current.state.timeScale = 1

            // Advance the mix with a small time delta (60fps = ~0.016s per frame)
            const delta = 1 / 60
            spineRef.current.state.update(delta)
            spineRef.current.state.apply(spineRef.current.skeleton)
            spineRef.current.skeleton.update(delta)
            spineRef.current.skeleton.updateWorldTransform(Physics.update)

            // Restore original timeScale (0 when paused)
            spineRef.current.state.timeScale = previousTimeScale

            // Continue advancing
            mixAnimationFrameRef.current = requestAnimationFrame(advanceMix)
          } else {
            // Mix completed, ensure we're at the start frame
            if (currentTrack.mixingFrom === null) {
              currentTrack.trackTime = 0
              spineRef.current.state.apply(spineRef.current.skeleton)
              spineRef.current.skeleton.updateWorldTransform(Physics.update)
            }
            mixAnimationFrameRef.current = null
          }
        }

        // Start advancing the mix
        mixAnimationFrameRef.current = requestAnimationFrame(advanceMix)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetCounter])

  // Handle startPlaying changes (only responds to false->true transitions)
  useChangedEffect(([prevStartPlaying]) => {
    if (!spineRef.current) {
      return
    }

    const currentStartPlaying = startPlaying ?? false

    // Only respond when startPlaying changes from false to true
    if (!prevStartPlaying && currentStartPlaying) {
      // Clear any existing loop timeout
      if (loopTimeoutRef.current) {
        clearTimeout(loopTimeoutRef.current)
        loopTimeoutRef.current = null
      }

      // Start animation from beginning
      const track = spineRef.current.state.tracks[0]

      const animToUse = getAnimToUse(animation, spineRef.current)
      if (animToUse && (!track || track.getAnimationTime() === track.animationEnd || track.getAnimationTime() === 0 || !startPlayingNoReset)) {
        try {
          trackedSetAnimation(spineRef.current, 0, animToUse, loop)
          trackAnimationStart(animToUse)
        } catch (error) {
          throw wrapSpineError(error, `Failed to set animation '${animToUse}'`, spineKey, debugKey)
        }
        spineRef.current.state.timeScale = timeScaleRef.current
      }
    }
  }, [startPlaying, animation])

  // Handle loopDelay changes
  useEffect(() => {
    loopDelayRef.current = loop ? loopDelay : 0
  }, [loopDelay, loop])

  // Handle skin changes
  useEffect(() => {
    if (!spineRef.current || !skin) return

    try {
      const skinData = spineRef.current.skeleton.data.findSkin(skin)
      if (skinData) {
        spineRef.current.skeleton.setSkin(skinData)
        spineRef.current.skeleton.setSlotsToSetupPose()
        // Update debug results if debug mode is enabled
        updateDebugResults(spineRef.current, spineKey, app.app)
      }
    } catch (error) {
      throw wrapSpineError(error, `Failed to set skin '${skin}'`, spineKey, debugKey)
    }
  }, [skin, spineKey])

  // Update animation complete callback ref (listener is already set up in loadSpine, just update the callback)
  useEffect(() => {
    onCompleteRef.current = onCurrentAnimComplete
  }, [onCurrentAnimComplete])

  // Update general track complete callback ref
  useEffect(() => {
    onTrackCompleteRef.current = onAnimationTrackComplete
  }, [onAnimationTrackComplete])

  // Update animation event callback ref (listener is already set up in loadSpine, just update the callback)
  useEffect(() => {
    onEventRef.current = onAnimationEvent
  }, [onAnimationEvent])

  // Set initial scale value
  useEffect(() => {
    if (!ref.current) return

    const initialScale = scale ?? 1
    const initialScaleObj = typeof initialScale === 'number'
      ? { x: initialScale, y: initialScale }
      : initialScale

    ref.current.scale.set(initialScaleObj.x, initialScaleObj.y)
  }, []) // Only run on mount

  // Animate scale changes with GSAP
  useChangedEffect(([prevScale]) => {
    if (!ref.current) return

    const currentScale = scale ?? 1
    const prevScaleValue = prevScale ?? 1

    // Convert to object format for easier handling
    const currentScaleObj = typeof currentScale === 'number'
      ? { x: currentScale, y: currentScale }
      : currentScale
    const prevScaleObj = typeof prevScaleValue === 'number'
      ? { x: prevScaleValue, y: prevScaleValue }
      : prevScaleValue

    // Only animate if scale actually changed
    if (
      currentScaleObj.x === prevScaleObj.x &&
      currentScaleObj.y === prevScaleObj.y
    ) {
      return
    }

    if (scaleAnimationDuration === 0) {
      ref.current.scale.set(currentScaleObj.x, currentScaleObj.y)
      return
    }

    // Animate scale change
    gsap.to(ref.current, {
      pixi: { scaleX: currentScaleObj.x, scaleY: currentScaleObj.y },
      duration: scaleAnimationDuration ?? 0.3,
      ease: 'power1.out',
    })
  }, [scale])

  return (
    <pixiContainer
      ref={ref}
      x={x}
      y={y}
      eventMode={eventMode}
      cursor={cursor}
      filters={mergedFilters}
      layout={layout}
      zIndex={zIndex}
      {...passthroughProps}
    />
  )
}
