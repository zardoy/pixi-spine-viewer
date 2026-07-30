import { RendererType, type WebGLRenderer } from 'pixi.js'

type TimerQueryExt = {
  TIME_ELAPSED_EXT: number
  GPU_DISJOINT_EXT: number
}

interface InstalledStats {
  renderer: WebGLRenderer
  drawCallsThisFrame: number
  pendingGpuQueries: WebGLQuery[]
  timerExt: TimerQueryExt | null
  activeGpuQuery: WebGLQuery | null
  originalDraw: WebGLRenderer['geometry']['draw']
  originalRender: WebGLRenderer['render']
}

let installed: InstalledStats | null = null

/** Max GPU frame time observed during the current 1s window (ms). */
let gpuMaxThisSecond = 0
/** Published max from the last completed 1s window. */
let gpuPublishedMaxMs: number | null = null
let gpuWindowStart = 0

function resetGpuAggregation(): void {
  gpuMaxThisSecond = 0
  gpuPublishedMaxMs = null
  gpuWindowStart = 0
}

function isGpuDisjoint(gl: WebGL2RenderingContext, ext: TimerQueryExt): boolean {
  return gl.getParameter(ext.GPU_DISJOINT_EXT) as boolean
}

/**
 * Hooks WebGL2 renderer draw/render to count draw calls and optionally measure GPU time
 * (EXT_disjoint_timer_query_webgl2 — Chrome; not available in Safari).
 */
export function installPixiWebGLRendererStats(renderer: WebGLRenderer): () => void {
  if (renderer.type !== RendererType.WEBGL) {
    return () => undefined
  }

  uninstallPixiWebGLRendererStats()

  const glRenderer = renderer
  const gl = glRenderer.gl
  const timerExt =
    (gl.getExtension('EXT_disjoint_timer_query_webgl2') as TimerQueryExt | null) ??
    (gl.getExtension('EXT_disjoint_timer_query') as TimerQueryExt | null)

  const state: InstalledStats = {
    renderer: glRenderer,
    drawCallsThisFrame: 0,
    pendingGpuQueries: [],
    timerExt,
    activeGpuQuery: null,
    originalDraw: glRenderer.geometry.draw,
    originalRender: glRenderer.render.bind(glRenderer),
  }

  glRenderer.geometry.draw = (...args) => {
    state.drawCallsThisFrame++
    return state.originalDraw.apply(glRenderer.geometry, args)
  }

  glRenderer.render = ((options: Parameters<WebGLRenderer['render']>[0]) => {
    if (state.timerExt && !isGpuDisjoint(gl, state.timerExt)) {
      const query = gl.createQuery()
      if (query) {
        gl.beginQuery(state.timerExt.TIME_ELAPSED_EXT, query)
        state.activeGpuQuery = query
      }
    }

    const result = state.originalRender(options)

    if (state.activeGpuQuery && state.timerExt) {
      gl.endQuery(state.timerExt.TIME_ELAPSED_EXT)
      state.pendingGpuQueries.push(state.activeGpuQuery)
      state.activeGpuQuery = null
    }

    return result
  }) as WebGLRenderer['render']

  installed = state

  return uninstallPixiWebGLRendererStats
}

export function uninstallPixiWebGLRendererStats(): void {
  if (!installed) return

  const state = installed
  installed = null

  resetGpuAggregation()

  const gl = state.renderer.gl
  state.renderer.geometry.draw = state.originalDraw
  state.renderer.render = state.originalRender

  for (const query of state.pendingGpuQueries) {
    gl.deleteQuery(query)
  }
  if (state.activeGpuQuery) {
    gl.deleteQuery(state.activeGpuQuery)
  }
}

/** Read draw calls from the last completed frame and reset the counter. */
export function consumePixiWebGLDrawCalls(): number {
  if (!installed) return 0
  const count = installed.drawCallsThisFrame
  installed.drawCallsThisFrame = 0
  return count
}

/** Poll completed GPU timer queries (typically 1–2 frames behind). */
export function pollPixiWebGLGpuTimeMs(): number | null {
  if (!installed?.timerExt) return null

  const gl = installed.renderer.gl
  const ext = installed.timerExt

  if (isGpuDisjoint(gl, ext)) {
    for (const query of installed.pendingGpuQueries) {
      gl.deleteQuery(query)
    }
    installed.pendingGpuQueries.length = 0
    return null
  }

  while (installed.pendingGpuQueries.length > 0) {
    const query = installed.pendingGpuQueries[0]
    if (!gl.getQueryParameter(query, gl.QUERY_RESULT_AVAILABLE)) {
      break
    }
    const nanoseconds = gl.getQueryParameter(query, gl.QUERY_RESULT) as number
    gl.deleteQuery(query)
    installed.pendingGpuQueries.shift()
    return nanoseconds / 1e6
  }

  return null
}

/**
 * Poll GPU queries, track max frame GPU time per second, publish once per second.
 * Call every frame; read result with {@link getPixiWebGLGpuTimeMaxMs}.
 */
export function tickPixiWebGLGpuTimeAggregation(now = performance.now()): void {
  if (!installed?.timerExt) return

  const sample = pollPixiWebGLGpuTimeMs()
  if (sample !== null) {
    gpuMaxThisSecond = Math.max(gpuMaxThisSecond, sample)
  }

  if (gpuWindowStart === 0) {
    gpuWindowStart = now
    return
  }

  if (now - gpuWindowStart >= 1000) {
    if (gpuMaxThisSecond > 0) {
      gpuPublishedMaxMs = gpuMaxThisSecond
    }
    gpuMaxThisSecond = 0
    gpuWindowStart = now
  }
}

/** Last completed 1-second max GPU frame time (ms), or null if none yet. */
export function getPixiWebGLGpuTimeMaxMs(): number | null {
  return gpuPublishedMaxMs
}

export function isPixiWebGLGpuTimerSupported(): boolean {
  return installed?.timerExt != null
}
