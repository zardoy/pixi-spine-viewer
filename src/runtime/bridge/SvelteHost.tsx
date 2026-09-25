import { useLayoutEffect, useRef, type ComponentType } from 'react'
import { mount, unmount } from 'svelte'

/**
 * Mounts a Svelte root inside a React-owned element.
 *
 * `state` and `api` must be identity-stable across renders (create them with
 * `useState(factory)`), or the root remounts and leaks a Pixi Application each time.
 *
 * `state` is only reactive if it is a `$state` proxy, which can only be created in a file the
 * Svelte compiler processes — so build it in a `.svelte.ts` module, not here.
 */
export type SvelteHostProps<TState, TApi> = {
  component: ComponentType
  state: TState
  api: TApi
  className?: string
  onReady?: (exports: Record<string, unknown>) => void
}

export function SvelteHost<TState, TApi>({
  component,
  state,
  api,
  className,
  onReady,
}: SvelteHostProps<TState, TApi>) {
  const hostRef = useRef<HTMLDivElement>(null)
  const generationRef = useRef(0)
  const onReadyRef = useRef(onReady)
  onReadyRef.current = onReady

  useLayoutEffect(() => {
    const target = hostRef.current
    if (!target) return

    // StrictMode invokes effects twice; only the latest generation may publish its exports.
    const generation = ++generationRef.current
    const exports = mount(component as never, {
      target,
      props: { state, api } as never,
      intro: false,
    }) as Record<string, unknown>

    if (generationRef.current === generation) onReadyRef.current?.(exports)

    return () => {
      void unmount(exports, { outro: false })
    }
  }, [component, state, api])

  return <div ref={hostRef} className={className ?? 'h-full w-full'} />
}
