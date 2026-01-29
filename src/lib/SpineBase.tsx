import { Container, EventMode } from 'pixi.js'
import { PixiReactElementProps } from '@pixi/react'
import { useEffect, useRef } from 'react'
import { AABBRectangleBoundsProvider, Spine as SpineInstance } from '@esotericsoftware/spine-pixi-v8'
import { Physics } from '@esotericsoftware/spine-core'
import { useSnapshot } from 'valtio'
import { useChangedEffect } from '../hooks/useChangedEffect'
import { globalSpineOverrides, registerSpine, unregisterSpine } from '../store/spineOverrides'
import gsap from 'gsap'

interface SpineLoader {
  loadSpine: (spineKey: string) => Promise<void>
  createSpine: (spineKey: string, options: any) => SpineInstance
}

function getAnimToUse(animation: string | undefined, spine: SpineInstance | null): string | null {
  if (animation) return animation
  if (!spine) return null
  const animations = spine.skeleton.data.animations
  return animations && animations.length > 0 ? animations[0].name : null
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

  // === Refs ===
  /** Container ref */
  itemRef?: React.Ref<Container>
  /** React 19 ref prop */
  ref?: React.RefObject<Container>
  spineRef?: React.RefObject<SpineInstance | null>

  // === Required ===
  spineLoader: SpineLoader
}

export const SpineBase = (props: SpineProps) => {
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
    mixTime = 0.25,
    initialDelay = 0,
    resumeDelay = 0,
    resetOnPause,
    loopDelay = 0,
    startPlaying,
    startPlayingNoReset,
    resetCounter,

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

    // Refs
    itemRef,
    ref: refProp,
    spineRef: spineRefProp,

    ...passthroughProps
  } = props

  // Determine playing state: if paused is explicitly passed, use !paused, otherwise use playing (default true)
  // Only one should be passed at a time
  const isPlaying = paused !== undefined ? !paused : (playing !== undefined ? playing : true)

  const ref = useRef<Container>(null!)
  const spineRef = useRef<SpineInstance | null>(null)
  const onCompleteRef = useRef(onCurrentAnimComplete)
  const listenerRef = useRef<{ complete: (trackEntry: any) => void } | null>(null)
  const previousPlayingRef = useRef<boolean>(isPlaying)
  const loopDelayRef = useRef<number>(loopDelay)
  const loopTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const prevResetCounterRef = useRef<number>(resetCounter ?? 0)

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

  useEffect(() => {
    if (!ref.current) return

    let destroyed = false
    const loadSpine = () => {
      try {
        if (destroyed) {
          return
        }

        // Create a new Spine instance from the cached skeleton data
        // This ensures each component gets its own independent instance
        const spine = spineLoader.createSpine(spineKey, {
          ...(xBounds && yBounds && widthBounds && heightBounds ? {
            boundsProvider: new AABBRectangleBoundsProvider(xBounds, yBounds, widthBounds, heightBounds),
          } : {}),
        })

        // Add spine to container
        ref.current.addChild(spine)
        spineRef.current = spine

        // Sync spineRef prop immediately
        if (spineRefProp && 'current' in spineRefProp) {
          spineRefProp.current = spine
        }

        // Set animation with initial delay if provided
        const setAnimationWithDelay = () => {
          // Set animation if provided, otherwise use first available
          if (animation) {
            spine.state.setAnimation(0, animation, loop)
          } else {
            // Get first animation name from skeleton data
            const animations = spine.skeleton.data.animations
            if (animations && animations.length > 0) {
              const firstAnim = animations[0].name
              spine.state.setAnimation(0, firstAnim, loop)
            } else {
              console.warn('[SpineBase] No animations available in skeleton data')
            }
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
          const skinData = spine.skeleton.data.findSkin(skin)
          if (skinData) {
            spine.skeleton.setSkin(skinData)
            spine.skeleton.setSlotsToSetupPose()
          }
        }

        // Set up animation complete listener
        onCompleteRef.current = onCurrentAnimComplete
        const listener = {
          complete: (trackEntry: any) => {
            // Only fire callback for the main track (track 0)
            if (trackEntry.trackIndex === 0) {
              // Fire completion callback
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
            }
          },
        }
        listenerRef.current = listener
        spine.state.addListener(listener)


        // Call onSpineLoaded callback
        if (onSpineLoaded) {
          onSpineLoaded(spine)
        }

      } catch (error) {
        console.error(`Failed to load spine '${spineKey}':`, error)
      }
    }

    loadSpine()

    return () => {
      destroyed = true

      // Clear loop timeout
      if (loopTimeoutRef.current) {
        clearTimeout(loopTimeoutRef.current)
        loopTimeoutRef.current = null
      }

      if (spineRef.current && ref.current) {
        // Remove listeners before destroying
        if (listenerRef.current) {
          spineRef.current.state.removeListener(listenerRef.current)
          listenerRef.current = null
        }
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
      spineRef.current.state.setAnimation(0, animToUse, loop)
      // set time scale
      spineRef.current.state.timeScale = timeScale
    } else {
      // Animation unchanged, but loop might have changed - need to update it
      // Setting loop on track directly doesn't always work, so re-set the animation
      const currentLoop = track?.loop ?? false
      if (currentLoop !== loop) {
        spineRef.current.state.setAnimation(0, animToUse, loop)
      }
    }
  }, [animation, loop])

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
    spineRef.current.state.setAnimation(0, animToUse, loop)
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
        spineRef.current.state.setAnimation(0, animToUse, loop)
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

    const skinData = spineRef.current.skeleton.data.findSkin(skin)
    if (skinData) {
      spineRef.current.skeleton.setSkin(skinData)
      spineRef.current.skeleton.setSlotsToSetupPose()
    }
  }, [skin])

  // Update animation complete callback ref (listener is already set up in loadSpine, just update the callback)
  useEffect(() => {
    onCompleteRef.current = onCurrentAnimComplete
  }, [onCurrentAnimComplete])

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
