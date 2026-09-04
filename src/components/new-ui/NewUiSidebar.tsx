import { useMemo } from 'react'
import { useSnapshot } from 'valtio'
import { toast } from 'sonner'
import {
  Download,
  ExternalLink,
  Heart,
  RotateCcw,
  Wrench,
} from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@radix-ui/react-dropdown-menu'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Slider } from '@/components/ui/slider'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { spineViewerStore } from '@/store/spineViewerStore'
import { CHECKER_BG_COLOR, isCheckerBackground } from '@/lib/checkerboardBackground'
import { SUPPORTED_SPINE_VERSIONS_TEXT } from '@/lib/spineRuntime'
import { NewUiFieldRow, NewUiGroup, NewUiHint } from './NewUiPrimitives'
import { NewUiPlaybackControl } from './NewUiPlaybackControl'
import { NewUiAnimationList } from './NewUiAnimationList'
import { NewUiSkinList } from './NewUiSkinList'
import type { SpineFiles } from '@/pages/Index'
import {
  downloadSpineFilesZip,
  downloadSpineZipWithSkelToJson,
  isSkelSkeletonFile,
} from '@/lib/spineZipExport'

const BG_PRESETS = [
  { id: 'solid', label: 'Solid' },
  { id: 'checker', label: 'Checker' },
] as const

type BgPreset = (typeof BG_PRESETS)[number]['id']

export type NewUiSidebarSection =
  | 'all'
  | 'playback'
  | 'animation'
  | 'viewport'
  | 'debug'
  | 'data'

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

/** Compact label for header, e.g. 84KB */
function formatImagesSizeCompact(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) {
    const kb = bytes / 1024
    return kb % 1 === 0 ? `${kb}KB` : `${kb.toFixed(1)}KB`
  }
  const mb = bytes / (1024 * 1024)
  return mb % 1 === 0 ? `${mb}MB` : `${mb.toFixed(1)}MB`
}

function showSection(section: NewUiSidebarSection, target: Exclude<NewUiSidebarSection, 'all'>): boolean {
  return section === 'all' || section === target
}

async function runExportWithToast(
  loadingMessage: string,
  action: () => Promise<void>,
  successMessage: string,
  errorLabel: string,
): Promise<void> {
  const toastId = toast.loading(loadingMessage)
  try {
    await action()
    toast.success(successMessage, { id: toastId })
  } catch (err) {
    console.error(`[Spine export] ${errorLabel}`, err)
    const detail = err instanceof Error ? err.message : String(err)
    toast.error(`${errorLabel}: ${detail}`, { id: toastId })
  }
}

export function NewUiSidebar({
  files,
  onBack,
  onCopyUrl,
  section = 'all',
  className,
  compactHeader = false,
}: {
  files: SpineFiles
  onBack: () => void
  onCopyUrl: () => void
  section?: NewUiSidebarSection
  className?: string
  compactHeader?: boolean
}) {
  const state = useSnapshot(spineViewerStore)
  const { ui } = state
  const spine = spineViewerStore.refs.spine

  const imagesSize = useMemo(
    () => files.imageFiles.reduce((sum, f) => sum + f.size, 0),
    [files.imageFiles],
  )

  const bgPreset: BgPreset = isCheckerBackground(ui.backgroundColor) ? 'checker' : 'solid'

  const runtimeSpineVersion =
    !spine || spine.destroyed
      ? '—'
      : (spine.skeleton?.data as { version?: string } | undefined)?.version ??
      SUPPORTED_SPINE_VERSIONS_TEXT

  const imagesSizeLabel = formatImagesSizeCompact(imagesSize)
  const isSkelFile = isSkelSkeletonFile(files)

  const fileTitle = [
    files.jsonFile.name,
    runtimeSpineVersion !== '—' ? runtimeSpineVersion : null,
    `${imagesSizeLabel} images`,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <aside
      className={`flex h-full min-h-0 flex-col border-border bg-card/60 text-sm md:border-r ${className ?? ''}`}
    >
      {!compactHeader && (
        <div className="shrink-0 space-y-1 border-b border-border px-4 py-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h1 className="truncate text-xl italic text-muted-foreground">PSV Project</h1>
              <p className="text-[10px] text-muted-foreground/70">Pixi v8 Engine + React</p>
            </div>
            <Button type="button" variant="ghost" size="sm" className="shrink-0 text-sm" onClick={onBack}>
              Close
            </Button>
          </div>
          <p className="truncate text-sm text-foreground" title={fileTitle}>
            {files.jsonFile.name}
            <span className="text-muted-foreground">
              {' '}
              (
              {runtimeSpineVersion !== '—' ? `${runtimeSpineVersion}, ` : ''}
              <span className="font-semibold text-foreground">{imagesSizeLabel}</span> images)
            </span>
          </p>
        </div>
      )}

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
        {showSection(section, 'playback') && <NewUiPlaybackControl />}

        {showSection(section, 'animation') && (
          <NewUiGroup label="Animation">
            {ui.animations.length > 0 ? (
              <NewUiAnimationList />
            ) : (
              <p className="text-sm text-muted-foreground">No animations</p>
            )}

            <div className="flex items-center gap-2">
              <Checkbox
                id="newui-loop"
                checked={ui.loop}
                onCheckedChange={(val) => {
                  spineViewerStore.ui.loop = Boolean(val)
                }}
              />
              <Label htmlFor="newui-loop" className="cursor-pointer text-sm">
                Loop (L)
              </Label>
            </div>

            <NewUiFieldRow label="After animation switch">
              <Select
                value={ui.actionAfterAnimSwitch}
                onValueChange={(val: 'same state' | 'force play' | 'force pause') => {
                  spineViewerStore.ui.actionAfterAnimSwitch = val
                }}
              >
                <SelectTrigger className="h-9 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="same state">Same state</SelectItem>
                  <SelectItem value="force play">Force play</SelectItem>
                  <SelectItem value="force pause">Force pause</SelectItem>
                </SelectContent>
              </Select>
            </NewUiFieldRow>

            <NewUiSkinList />
          </NewUiGroup>
        )}

        {showSection(section, 'viewport') && (
          <NewUiGroup label="Viewport">
            <NewUiFieldRow label={`Scale ${Math.round(ui.scale * 100)}%`}>
              <div className="flex items-center gap-2">
                <Slider
                  value={[ui.scale]}
                  onValueChange={(value) => {
                    spineViewerStore.ui.scale = value[0]
                    spineViewerStore.ui.userScaleOverride = true
                  }}
                  min={0.04}
                  max={3}
                  step={0.01}
                  className="flex-1"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-8 w-8 shrink-0"
                  title="Reset view (re-enable auto-fit)"
                  onClick={() => {
                    spineViewerStore.ui.userScaleOverride = false
                    spineViewerStore.ui.userPositionOverride = false
                    spineViewerStore.ui.scale = 1
                  }}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </Button>
              </div>
            </NewUiFieldRow>

            <NewUiFieldRow label="Autoscale">
              <Select
                value={ui.autoViewportMode}
                onValueChange={(val: 'first' | 'per-animation' | 'all') => {
                  spineViewerStore.ui.autoViewportMode = val
                  spineViewerStore.ui.userScaleOverride = false
                  spineViewerStore.ui.userPositionOverride = false
                }}
              >
                <SelectTrigger className="h-9 w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="first">First animation</SelectItem>
                  <SelectItem value="per-animation">Each animation</SelectItem>
                  <SelectItem value="all">All animations (max)</SelectItem>
                </SelectContent>
              </Select>
            </NewUiFieldRow>

            {ui.autoViewportMode === 'first' && ui.animations.length > 0 && (
              <NewUiFieldRow label="Reference animation">
                <Select
                  value={ui.autoViewportAnimation || ui.animations[0]}
                  onValueChange={(val) => {
                    spineViewerStore.ui.autoViewportAnimation = val
                    spineViewerStore.ui.userScaleOverride = false
                    spineViewerStore.ui.userPositionOverride = false
                  }}
                >
                  <SelectTrigger className="h-9 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ui.animations.map((animName) => (
                      <SelectItem key={animName} value={animName}>
                        {animName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </NewUiFieldRow>
            )}

            <NewUiHint>Drag to pan · scroll wheel to zoom</NewUiHint>
          </NewUiGroup>
        )}

        {showSection(section, 'debug') && (
          <NewUiGroup label="Visual debug">
            <div className="flex items-center gap-2">
              <Checkbox
                id="newui-debug-origin"
                checked={ui.debugOriginAxes}
                onCheckedChange={(val) => {
                  spineViewerStore.ui.debugOriginAxes = Boolean(val)
                }}
              />
              <Label htmlFor="newui-debug-origin" className="cursor-pointer text-sm">
                Origin axes (0, 0)
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="newui-debug-bones"
                checked={ui.debugBones}
                onCheckedChange={(val) => {
                  spineViewerStore.ui.debugBones = Boolean(val)
                }}
              />
              <Label htmlFor="newui-debug-bones" className="cursor-pointer text-sm">
                Bones / attachments (T)
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="newui-debug-bounds-live"
                checked={ui.debugBoundsLive}
                onCheckedChange={(val) => {
                  spineViewerStore.ui.debugBoundsLive = Boolean(val)
                }}
              />
              <Label htmlFor="newui-debug-bounds-live" className="cursor-pointer text-sm">
                Live frame bounds (B)
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="newui-debug-bounds-max"
                checked={ui.debugBoundsMax}
                onCheckedChange={(val) => {
                  spineViewerStore.ui.debugBoundsMax = Boolean(val)
                }}
              />
              <Label htmlFor="newui-debug-bounds-max" className="cursor-pointer text-sm">
                Max frame bounds
              </Label>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="newui-guide"
                checked={ui.guideBoundsEnabled}
                onCheckedChange={(val) => {
                  spineViewerStore.ui.guideBoundsEnabled = Boolean(val)
                }}
              />
              <Label htmlFor="newui-guide" className="cursor-pointer text-sm">
                Guide border (experimental)
              </Label>
            </div>
          </NewUiGroup>
        )}

        {showSection(section, 'data') && (
          <>
            <NewUiGroup label="Spine data">
              <NewUiHint large>
                Runtime: {runtimeSpineVersion}
                <br />
                Images: {formatBytes(imagesSize)} ({files.imageFiles.length} file
                {files.imageFiles.length === 1 ? '' : 's'})
              </NewUiHint>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => {
                    spineViewerStore.ui.atlasExplorerModalOpen = true
                  }}
                >
                  <Wrench className="h-3.5 w-3.5" />
                  Inspect atlas
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button type="button" variant="outline" size="sm" className="gap-1.5">
                      <Download className="h-3.5 w-3.5" />
                      Export…
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent
                    align="start"
                    className="z-[100] min-w-[14rem] rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
                  >
                    <DropdownMenuItem
                      className="cursor-pointer rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
                      onSelect={() => {
                        spineViewerStore.ui.attachmentDownloadModalOpen = true
                      }}
                    >
                      Attachments as PNG
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      className="cursor-pointer rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
                      onSelect={(e) => {
                        e.preventDefault()
                        void runExportWithToast(
                          'Creating ZIP archive…',
                          () => downloadSpineFilesZip(files, spineViewerStore.ui.customEvents),
                          'ZIP downloaded',
                          'Failed to create ZIP',
                        )
                      }}
                    >
                      Download ZIP
                    </DropdownMenuItem>
                    {isSkelFile && (
                      <DropdownMenuItem
                        className="cursor-pointer rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
                        onSelect={(e) => {
                          e.preventDefault()
                          const loadedSpine = spineViewerStore.refs.spine
                          const skeletonData = loadedSpine?.skeleton?.data
                          if (!loadedSpine || loadedSpine.destroyed || !skeletonData) {
                            toast.error('Spine not loaded. Cannot convert.')
                            return
                          }
                          void runExportWithToast(
                            'Converting skel→JSON and creating ZIP…',
                            () =>
                              downloadSpineZipWithSkelToJson(
                                files,
                                skeletonData,
                                spineViewerStore.ui.customEvents,
                              ),
                            'ZIP with JSON skeleton downloaded',
                            'Conversion failed',
                          )
                        }}
                      >
                        ZIP with skel→JSON
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </NewUiGroup>

            <NewUiGroup label="App settings">
              <NewUiFieldRow label="Background">
                <Select
                  value={bgPreset}
                  onValueChange={(val: BgPreset) => {
                    spineViewerStore.ui.backgroundColor = val === 'checker' ? CHECKER_BG_COLOR : '#404040'
                  }}
                >
                  <SelectTrigger className="h-9 w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BG_PRESETS.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </NewUiFieldRow>

              <NewUiFieldRow label="Background color">
                <Input
                  type="color"
                  value={ui.backgroundColor}
                  onChange={(e) => {
                    spineViewerStore.ui.backgroundColor = e.target.value
                  }}
                  className="h-9 w-full cursor-pointer p-1"
                />
              </NewUiFieldRow>

              <Button type="button" variant="outline" size="sm" className="w-full gap-1.5" onClick={onCopyUrl}>
                <ExternalLink className="h-3.5 w-3.5" />
                Copy share URL
              </Button>

              <div className="flex items-center gap-1.5 text-sm text-muted-foreground/80">
                <Heart className="h-3 w-3 text-primary" />
                Open source on GitHub
              </div>
            </NewUiGroup>
          </>
        )}
      </div>
    </aside>
  )
}
