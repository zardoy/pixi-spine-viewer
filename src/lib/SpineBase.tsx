import { Container, EventMode } from 'pixi.js'
import { PixiReactElementProps } from '@pixi/react'
import { useEffect, useRef } from 'react'
import { AABBRectangleBoundsProvider, Spine as SpineInstance } from '@esotericsoftware/spine-pixi-v8'
import { useSnapshot } from 'valtio'
import { useChangedEffect } from '../hooks/useChangedEffect'
import { globalSpineOverrides, registerSpine, unregisterSpine } from '../store/spineOverrides'

interface SpineLoader {
  loadSpine: (spineKey: string) => Promise<void>
  createSpine: (spineKey: string, options: any) => SpineInstance
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
  /** Whether the animation is playing (default: true). Set to false to pause/freeze on first frame */
  playing?: boolean
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

  // === Layout ===
  x?: number
  y?: number
  eventMode?: EventMode
  cursor?: string
  filters?: any[]
  layout?: any
  zIndex?: number
  mask?: any
  scale?: number | { x: number; y: number }
  origin?: number | { x: number; y: number }

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
    playing = true,
    mixTime = 0.25,
    initialDelay = 0,
    resumeDelay = 0,
    resetOnPause,
    loopDelay = 0,
    startPlaying,

    // Layout
    x = 0,
    y = 0,
    eventMode,
    cursor,
    filters,
    layout,
    zIndex,

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

  const ref = useRef<Container>(null!)
  const spineRef = useRef<SpineInstance | null>(null)
  const onCompleteRef = useRef(onCurrentAnimComplete)
  const listenerRef = useRef<{ complete: (trackEntry: any) => void } | null>(null)
  const previousPlayingRef = useRef<boolean>(playing)
  const loopDelayRef = useRef<number>(loopDelay)
  const loopTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  // Subscribe to global spine overrides
  const spineOverrides = useSnapshot(globalSpineOverrides).overrides[spineKey]

  const timeScale = spineOverrides?.isActive ? spineOverrides.timeScale : timeScaleProp
  const timeScaleRef = useRef<number>(timeScale)

  const updateMixTime = () => {
    if (spineRef.current) {
      spineRef.current.state.data.defaultMix = mixTime
    }
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
              spineRef.current.state.timeScale = playing ? timeScale : 0
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
          spine.state.timeScale = playing || startPlaying ? timeScale : 0
        }

        updateMixTime()

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
                  if (spineRef.current && playing) {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps do not add any other deps, its for initial load only
  }, [spineKey])

  useEffect(() => {
    updateMixTime()
  }, [mixTime])

  // Handle animation and loop prop changes (separate effect to avoid re-creating spine)
  useEffect(() => {
    if (!spineRef.current) {
      return
    }

    // Determine which animation to use
    const animToUse = animation || (() => {
      const animations = spineRef.current!.skeleton.data.animations
      return animations && animations.length > 0 ? animations[0].name : null
    })()

    if (!animToUse) {
      return
    }

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

  // Handle playing, timeScale changes with resumeDelay and resetOnPause
  useEffect(() => {
    if (!spineRef.current) {
      return
    }

    const previousPlaying = previousPlayingRef.current
    const isResuming = !previousPlaying && playing
    const isPausing = previousPlaying && !playing

    timeScaleRef.current = timeScale

    if (isPausing && resetOnPause) {
      // Reset animation to initial frame when pausing
      const track = spineRef.current.state.tracks[0]
      if (track) {
        track.trackTime = 0
      }
    }

    let cleanup: (() => void) | undefined
    if (playing) {
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
    previousPlayingRef.current = playing

    return cleanup
  }, [playing, timeScale]) // eslint-disable-line react-hooks/exhaustive-deps ignore resumeDelay, resetOnPause

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

      // Set animation to restart from beginning
      const animToUse = animation || (() => {
        const animations = spineRef.current!.skeleton.data.animations
        return animations && animations.length > 0 ? animations[0].name : null
      })()

      if (animToUse && (!track || track.getAnimationTime() === track.animationEnd)) {
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
