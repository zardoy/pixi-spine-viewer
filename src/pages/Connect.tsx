import { useEffect, useRef } from 'react'
import { initConnect } from './connectGame'

export const Connect = () => {
    const ref = useRef<HTMLCanvasElement>(null!)

    useEffect(() => {
        const ctx = ref.current.getContext('2d')!
        const abortController = new AbortController()
        initConnect(ctx, abortController.signal)
        return () => abortController.abort()
    }, [])

    return <canvas ref={ref} />
}
