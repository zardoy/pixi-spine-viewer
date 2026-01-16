import { useEffect, useRef } from 'react'

type CleanupFn = (() => void)

/**
 * Effect that runs but not on first render
 */
export const useChangedEffect = <T>(callback: (prevDependencies: T[]) => void | CleanupFn, dependencies: T[], initial = false) => {
  const prevDependenciesRef = useRef(dependencies)
  const isFirstRenderRef = useRef(true)

  useEffect(() => {
    let bypass = false
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false
      if (initial) {
        bypass = true
      }
    }

    if (prevDependenciesRef.current.every((dep, i) => dep === dependencies[i]) && !bypass) {
      return
    }

    const result = callback(prevDependenciesRef.current)
    prevDependenciesRef.current = dependencies

    return result
  }, dependencies)
}
