import { toast } from 'sonner'
import { buildSpineScreenshotFilename, captureCanvasPng } from 'spine-svelte'
import { spineViewerStore } from '../store/spineViewerStore'

/**
 * Save the viewer canvas exactly as it currently looks — same camera, same frame, same overlays.
 *
 * Deliberately not the standalone screenshot tool's job: that one re-frames the skeleton to
 * computed bounds and batches. This is "give me what I'm looking at".
 */
export function captureViewerScreenshot(): void {
  const app = spineViewerStore.refs.app
  if (!app) {
    toast.error('Nothing to capture yet')
    return
  }

  const { ui } = spineViewerStore
  const base = spineViewerStore.files?.jsonFile?.name?.replace(/\.(json|skel)$/i, '') ?? 'spine'

  const filename = buildSpineScreenshotFilename({
    base,
    anim: ui.selectedAnimation || 'none',
    skin: ui.selectedSkin || 'default',
    // The viewer frames by camera, not by a computed bounds mode.
    mode: 'ff',
    frame: Math.round((ui.timeline ?? 0) * 30),
    scale: Number((ui.scale ?? 1).toFixed(2)),
    width: Math.round(app.renderer.width),
    height: Math.round(app.renderer.height),
    hash: 'view',
  })

  const result = captureCanvasPng(app, filename)

  if (result === 'saved') toast.success(filename)
  else if (result === 'empty') toast.info('Nothing visible in frame — skipped')
  else toast.error('Capture failed — see console')
}
