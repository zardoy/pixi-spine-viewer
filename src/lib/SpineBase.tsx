import 'pixi.js/prepare' // Ensures prepare system is available for texture preload
import { Container, type TextureSource } from 'pixi.js'
import { PixiReactElementProps, useTick, useApplication } from '@pixi/react'
import { useEffect, useLayoutEffect, useRef, type Ref, type RefObject } from 'react'
import { AABBRectangleBoundsProvider, Spine as SpineInstance } from '@esotericsoftware/spine-pixi-v8'
import { Physics, RegionAttachment, MeshAttachment } from '@esotericsoftware/spine-core'
import { useSnapshot } from 'valtio'
import { useChangedEffect } from '../hooks/useChangedEffect'
import { globalSpineOverrides, registerSpine, unregisterSpine } from '../store/spineOverrides'
import gsap from 'gsap'

interface SpineLoader {
  createSpine: (spineKey: string, options: any) => {
    spine: SpineInstance
    x?: number
    y?: number
    scale?: number
  }
  /** Optional: return texture sources for GPU preload. When provided, SpineBase will call
   * app.prepare.upload(sources) before onSpineLoaded so textures are visible on first frame. */
  getTextureSourcesForPreload?: (spineKey: string) => TextureSource[] | undefined
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

/** One entry for attachmentsFollow: slot to follow and ref to the PIXI object to position each frame. */
export interface AttachmentsFollowItem {
  slotName: string
  ref: RefObject<AttachmentsFollowTarget | null>
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

function getAttachmentFollowTransform(spine: SpineInstance, slotName: string): { x: number; y: number; scaleX: number; scaleY: number } | null {
  const slot = spine.skeleton.findSlot(slotName)
  if (!slot) return null
  const bone = slot.bone
  return {
    x: bone.worldX,
    y: bone.worldY,
    scaleX: bone.getWorldScaleX(),
    scaleY: bone.getWorldScaleY(),
  }
}

export interface SpineProps
  extends Pick<PixiReactElementProps<typeof Container>, 'x' | 'y' | 'eventMode' | 'cursor' | 'filters' | 'layout' | 'zIndex' | 'mask' | 'scale' | 'origin'> {
  // === Core ===
  /** The spine key from textures.json */
  spine: string
  /** Skin name to apply (optional) */
  skin?: string

  // === Animation ===
  /** Animation name to play (optional, defaults to first animation) */
  animation?: string
  /** Whether the animation should loop (default: false) */
  loop?: boolean
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

  // === Required ===
  spineLoader: SpineLoader
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
    initialDelay = 0,
    resumeDelay = 0,
    resetOnPause,
    loopDelay = 0,
    startPlaying,
    startPlayingNoReset,
    resetCounter,
    instantReset, // Deprecated: use mixTime === 0 instead
    reverse = false,

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

    ...passthroughProps
  } = props

  const mixTime = instantReset ? 0 : _mixTime

  const attachmentsFollowRef = useRef(attachmentsFollow)
  attachmentsFollowRef.current = attachmentsFollow

  // Update PIXI objects (x, y, scale) each frame to follow attachment bone transforms
  useTick(() => {
    const spine = spineRef.current
    const list = attachmentsFollowRef.current
    if (!spine || !list?.length) return
    spine._validateAndTransformAttachments()
    for (const item of list) {
      const target = item.ref.current
      if (!target) continue
      const t = getAttachmentFollowTransform(spine, item.slotName)
      if (!t) continue
      target.x = t.x
      target.y = t.y
      if (target.scale !== undefined) {
        target.scale.x = t.scaleX
        target.scale.y = t.scaleY
      }
    }
  })

  // Determine playing state: if paused is explicitly passed, use !paused, otherwise use playing (default true)
  // Only one should be passed at a time
  const isPlaying = paused !== undefined ? !paused : (playing !== undefined ? playing : true)

  const ref = useRef<Container>(null!)
  const spineRef = useRef<SpineInstance | null>(null)
  const onCompleteRef = useRef(onCurrentAnimComplete)
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
    track.trackEnd = clampedTime

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

        // Ensure skeleton is updated
        s._validateAndTransformAttachments()

        const slots = s.skeleton.slots
        const result: Record<string, {
          width: number
          height: number
          x: number
          y: number
          attachmentName: string | null
          attachmentType: string
          textureWidth: number | null
          textureHeight: number | null
          textureOversizeX: number | null
          textureOversizeY: number | null
        }> = {}

        // Get Spine container's world transform for screen space conversion
        const spineWorldTransform = s.worldTransform
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
          let textureOversizeX: number | null = null
          let textureOversizeY: number | null = null

          if (attachment instanceof RegionAttachment || attachment instanceof MeshAttachment) {
            const region = attachment.region
            if (region) {
              // Use originalWidth/originalHeight for the actual texture source size
              // These represent the original image dimensions before atlas packing
              textureWidth = region.originalWidth || region.width
              textureHeight = region.originalHeight || region.height

              // Calculate oversize ratio: texture size / rendered size
              // > 1.0 means texture is bigger than rendered (oversized)
              // < 1.0 means texture is smaller than rendered (undersized)
              // = 1.0 means perfect match
              if (screenWidth > 0 && screenHeight > 0) {
                textureOversizeX = textureWidth / screenWidth
                textureOversizeY = textureHeight / screenHeight
              }
            }
          }

          result[slot.data.name] = {
            width: screenWidth,
            height: screenHeight,
            x: screenX,
            y: screenY,
            attachmentName: attachment.name,
            attachmentType: attachment.constructor.name,
            textureWidth,
            textureHeight,
            textureOversizeX,
            textureOversizeY,
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

        // Create a new Spine instance from the cached skeleton data
        // This ensures each component gets its own independent instance
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

        // Store the timeScale value
        timeScaleRef.current = timeScale

        // Set time scale based on playing state (only if no initial delay)
        if (initialDelay === 0) {
          spine.state.timeScale = isPlaying || startPlaying ? timeScale : 0
        }

        updateMixTime()

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
        onEventRef.current = onAnimationEvent
        const listener: { complete: (trackEntry: any) => void; event?: (trackEntry: any, event: any) => void } = {
          complete: (trackEntry: any) => {
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

    // do not add any other deps, its for initial load only
  }, [spineKey])

  useEffect(() => {
    updateMixTime()
  }, [mixTime])

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
      try {
        trackedSetAnimation(spineRef.current, 0, animToUse, loop)
        trackAnimationStart(animToUse)
        // When mixTime is 0, apply instant reset behavior (no mix transition)
        if (mixTime === 0) {
          const track = spineRef.current.state.tracks[0]
          if (track) track.mixDuration = 0
          immediateUpdate(spineRef.current, true)
        }
      } catch (error) {
        throw wrapSpineError(error, `Failed to set animation '${animToUse}'`, spineKey, debugKey)
      }
      // Set time scale since we clearn existing loop which might have ben stopped
      setTimeScale()
    } else {
      // Animation unchanged, but loop might have changed - just toggle track.loop (no restart)
      const currentLoop = track?.loop ?? false
      // if (currentLoop !== loop && track) {
      //   track.loop = loop
      // }
    }
  }, [animation, loop, mixTime])

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

  // Handle resetCounter increases: reset current animation to start (uses mix time)
  useEffect(() => {
    const cur = resetCounter ?? 0
    if (cur <= prevResetCounterRef.current) {
      prevResetCounterRef.current = cur
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
      }
    } catch (error) {
      throw wrapSpineError(error, `Failed to set skin '${skin}'`, spineKey, debugKey)
    }
  }, [skin])

  // Update animation complete callback ref (listener is already set up in loadSpine, just update the callback)
  useEffect(() => {
    onCompleteRef.current = onCurrentAnimComplete
  }, [onCurrentAnimComplete])

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
      filters={filters}
      layout={layout}
      zIndex={zIndex}
      {...passthroughProps}
    />
  )
}
