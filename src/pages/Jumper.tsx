import { useEffect, useRef } from 'react'
import { initJumper } from './jumperGame'

export const Jumper = () => {
    const ref = useRef<HTMLCanvasElement>(null!)

    useEffect(() => {
        const ctx = ref.current.getContext('2d')!
        const abortController = new AbortController()
        initJumper(ctx, abortController.signal)
        return () => abortController.abort()
    }, [])

    return <canvas ref={ref} />
}
