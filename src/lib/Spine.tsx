import { Container } from 'pixi.js'
import { PixiReactElementProps } from '@pixi/react'
import { useEffect, useRef } from 'react'
import { AABBRectangleBoundsProvider, Spine as SpineInstance } from '@esotericsoftware/spine-pixi-v8'

interface SpineLoader {
  loadSpine: (spineKey: string) => Promise<void>
  createSpine: (spineKey: string, options: any) => SpineInstance
}

export interface SpineProps
  extends Pick<PixiReactElementProps<typeof Container>, 'x' | 'y' | 'eventMode' | 'cursor' | 'filters' | 'layout' | 'zIndex' | 'mask' | 'scale' | 'origin'> {
  /** The spine key from textures.json */
  spine: string
  /** Animation name to play (optional, defaults to first animation) */
  animation?: string
  /** Whether the animation should loop (default: false) */
  loop?: boolean
  /** Animation playback speed (default: 1.0) */
  timeScale?: number
  /** Whether the animation is playing (default: true). Set to false to pause/freeze on first frame */
  playing?: boolean
  /** Skin name to apply (optional) */
  skin?: string
  /** Mix time for animation transitions (default: 0.25) */
  mixTime?: number
  /** Callback fired when the current animation completes (fires even when loop=true) */
  onCurrentAnimComplete?: () => void
  /** Callback fired when spine is loaded and ready */
  onSpineLoaded?: (spine: SpineInstance) => void
  /** Container ref */
  itemRef?: React.Ref<Container>
  /** React 19 ref prop */
  ref?: React.RefObject<Container>
  spineRef?: React.RefObject<SpineInstance | null>

  xBounds?: number
  yBounds?: number
  widthBounds?: number
  heightBounds?: number

  spineLoader: SpineLoader
}

export const SpineBase = (props: SpineProps) => {
  const {
    spine: spineKey,
    animation,
    loop = false,
    timeScale = 1.0,
    playing = true,
    skin,
    mixTime = 0.25,
    onCurrentAnimComplete,
    onSpineLoaded,
    itemRef,
    ref: refProp,
    x = 0,
    y = 0,
    eventMode,
    cursor,
    filters,
    layout,
    zIndex,
    spineRef: spineRefProp,
    xBounds,
    yBounds,
    widthBounds,
    heightBounds,
    spineLoader,
    ...passthroughProps
  } = props

  const ref = useRef<Container>(null!)
  const spineRef = useRef<SpineInstance | null>(null)
  const timeScaleRef = useRef<number>(timeScale)
  const onCompleteRef = useRef(onCurrentAnimComplete)
  const listenerRef = useRef<{ complete: (trackEntry: any) => void } | null>(null)

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
    const loadSpine = async () => {
      try {
        // Load skeleton data (ensures it's cached)
        await spineLoader.loadSpine(spineKey)

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

        // Set mix time for smooth animation transitions
        spine.state.data.defaultMix = mixTime

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

        // Store the timeScale value
        timeScaleRef.current = timeScale

        // Set time scale and autoUpdate based on playing state
        spine.state.timeScale = playing ? timeScale : 0
        spine.autoUpdate = playing // Enable/disable automatic updates

        // Set skin if provided
        if (skin) {
          const skinData = spine.skeleton.data.findSkin(skin)
          if (skinData) {
            spine.skeleton.setSkin(skinData)
            spine.skeleton.setSlotsToSetupPose()
          }
        }

        // Set up animation complete listener
        if (onCurrentAnimComplete) {
          onCompleteRef.current = onCurrentAnimComplete
          const listener = {
            complete: (trackEntry: any) => {
              // Only fire callback for the main track (track 0)
              if (trackEntry.trackIndex === 0 && onCompleteRef.current) {
                onCompleteRef.current()
              }
            },
          }
          listenerRef.current = listener
          spine.state.addListener(listener)
        }

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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spineKey])

  // Handle animation and loop prop changes (separate effect to avoid re-creating spine)
  useEffect(() => {
    if (!spineRef.current) {
      return;
    }

    // Determine which animation to use
    const animToUse = animation || (() => {
      const animations = spineRef.current!.skeleton.data.animations;
      return animations && animations.length > 0 ? animations[0].name : null;
    })();

    if (!animToUse) {
      return;
    }

    const track = spineRef.current.state.tracks[0];
    const currentAnim = track?.animation?.name;

    if (currentAnim !== animToUse) {
      spineRef.current.state.setAnimation(0, animToUse, loop);
    } else {
      // Animation unchanged, but loop might have changed - need to update it
      // Setting loop on track directly doesn't always work, so re-set the animation
      const currentLoop = track?.loop ?? false;
      if (currentLoop !== loop) {
        spineRef.current.state.setAnimation(0, animToUse, loop);
      }
    }
  }, [animation, loop])

  // Handle playing prop changes
  useEffect(() => {
    if (!spineRef.current) {
      return;
    }

    if (playing) {
      // Resume animation by restoring timeScale
      spineRef.current.state.timeScale = timeScaleRef.current
      spineRef.current.autoUpdate = true
    } else {
      // Pause animation by setting timeScale to 0
      spineRef.current.state.timeScale = 0
      spineRef.current.autoUpdate = false
    }
  }, [playing])

  // Handle timeScale changes when playing
  useEffect(() => {
    if (!spineRef.current || !playing) return

    timeScaleRef.current = timeScale
    spineRef.current.state.timeScale = timeScale
  }, [timeScale, playing])

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
