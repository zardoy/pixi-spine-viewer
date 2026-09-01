import { useEffect, useState } from 'react'
import { NewUiViewer } from '@/components/new-ui/NewUiViewer'
import type { SpineFiles } from '@/pages/Index'
import {
  embedPayloadToSpineFiles,
  postEmbedError,
  postEmbedLoaded,
  postEmbedReady,
  type EmbedLoadPayload,
} from '@/lib/embedApi'

/**
 * Embed mode (`?embed=1`): same full viewer UI as normal, driven by postMessage payloads
 * from a parent frame (e.g. game-assets-manager upload preview).
 */
export function EmbedSpineViewer() {
  const [files, setFiles] = useState<SpineFiles | null>(null)
  const [waitingLabel, setWaitingLabel] = useState('Waiting for preview…')
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    postEmbedReady()

    const onMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; message?: string; files?: EmbedLoadPayload['files'] }
      if (!data || data.type !== 'pixi-spine-viewer:load' || !data.files) return

      try {
        setWaitingLabel('Loading preview…')
        setLoadError(null)
        const spineFiles = embedPayloadToSpineFiles(data.files)
        setFiles(spineFiles)
        postEmbedLoaded()
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to load spine preview'
        setLoadError(message)
        postEmbedError(message)
      }
    }

    window.addEventListener('message', onMessage)
    return () => window.removeEventListener('message', onMessage)
  }, [])

  if (!files) {
    return (
      <div className="flex h-full min-h-[12rem] items-center justify-center bg-background px-4 text-center text-xs text-muted-foreground">
        {loadError ?? waitingLabel}
      </div>
    )
  }

  return (
    <div className="h-full min-h-[12rem] w-full overflow-hidden bg-background">
      <NewUiViewer files={files} onBack={() => undefined} />
    </div>
  )
}
