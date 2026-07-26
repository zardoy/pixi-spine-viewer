import { useEffect, useRef, useState } from 'react'
import { useSnapshot } from 'valtio'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { spineViewerStore } from '@/store/spineViewerStore'
import { parseAtlasRegions, downloadAttachmentAsImage } from '@/spine-toolbox'

export function AttachmentDownloadModal() {
  const state = useSnapshot(spineViewerStore)
  const [atlasRegions, setAtlasRegions] = useState<{ name: string; index: number }[]>([])
  const [search, setSearch] = useState('')
  const searchRef = useRef<HTMLInputElement | null>(null)

  const open = state.ui.attachmentDownloadModalOpen

  useEffect(() => {
    if (!open) return
    const files = spineViewerStore.files
    if (!files) {
      setAtlasRegions([])
      return
    }
    files.atlasFile
      .text()
      .then((atlasText) => {
        const regions = parseAtlasRegions(atlasText)
        setAtlasRegions(regions.map((r) => ({ name: r.name, index: r.index })))
      })
      .catch(() => setAtlasRegions([]))
  }, [open])

  useEffect(() => {
    if (open) {
      setSearch('')
      searchRef.current?.focus()
    }
  }, [open])

  const files = spineViewerStore.files
  if (!open || !files) return null

  const filteredRegions =
    search.trim().length === 0
      ? atlasRegions
      : atlasRegions.filter((r) => r.name.toLowerCase().includes(search.trim().toLowerCase()))

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-background/90 backdrop-blur-sm"
      onClick={() => {
        spineViewerStore.ui.attachmentDownloadModalOpen = false
      }}
    >
      <div
        className="mx-auto flex h-full w-full max-w-3xl flex-col border border-border bg-card text-card-foreground shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex flex-col gap-1">
            <span className="text-sm font-semibold">Download attachment as PNG</span>
            <span className="text-xs text-muted-foreground">
              Select an atlas region to export as an image.
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={() => {
              spineViewerStore.ui.attachmentDownloadModalOpen = false
            }}
          >
            ×
          </Button>
        </div>
        <div className="flex items-center gap-2 border-b border-border px-4 py-3">
          <Input
            ref={searchRef}
            placeholder="Filter attachments..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-8 text-xs"
          />
          <div className="text-[11px] text-muted-foreground">
            {atlasRegions.length} total, {filteredRegions.length} shown
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-2 py-2">
          {atlasRegions.length === 0 ? (
            <div className="px-2 py-4 text-xs text-muted-foreground">No regions in atlas.</div>
          ) : filteredRegions.length === 0 ? (
            <div className="px-2 py-4 text-xs text-muted-foreground">No regions match this filter.</div>
          ) : (
            <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
              {filteredRegions.map((r) => (
                <Button
                  key={r.index >= 0 ? `${r.name}-${r.index}` : r.name}
                  variant="outline"
                  size="sm"
                  className="justify-between text-xs"
                  onClick={async () => {
                    try {
                      toast.loading(`Downloading ${r.name}...`)
                      const atlasText = await files.atlasFile.text()
                      await downloadAttachmentAsImage(atlasText, files.imageFiles, r.name, r.index)
                      toast.dismiss()
                      toast.success(`Downloaded ${r.name}.png`)
                      spineViewerStore.ui.attachmentDownloadModalOpen = false
                    } catch (err) {
                      toast.dismiss()
                      toast.error(err instanceof Error ? err.message : 'Download failed')
                    }
                  }}
                >
                  <span className="mr-2 truncate">
                    {r.name}
                    {r.index >= 0 ? ` (${r.index})` : ''}
                  </span>
                  <span className="text-[10px] text-muted-foreground">Click to download</span>
                </Button>
              ))}
            </div>
          )}
        </div>
        <div className="flex items-center justify-between border-t border-border px-4 py-2 text-[11px] text-muted-foreground">
          <span>Click outside or × to close</span>
          <span>Atlas regions from current file</span>
        </div>
      </div>
    </div>
  )
}
