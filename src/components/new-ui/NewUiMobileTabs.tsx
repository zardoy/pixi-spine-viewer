import { useState } from 'react'
import {
  Clapperboard,
  Eye,
  LayoutGrid,
  Play,
  Settings2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SpineFiles } from '@/pages/Index'
import { NewUiSidebar, type NewUiSidebarSection } from './NewUiSidebar'

const TABS: { id: NewUiSidebarSection; label: string; icon: typeof Play }[] = [
  { id: 'playback', label: 'Play', icon: Play },
  { id: 'animation', label: 'Anim', icon: Clapperboard },
  { id: 'viewport', label: 'View', icon: LayoutGrid },
  { id: 'debug', label: 'Debug', icon: Eye },
  { id: 'data', label: 'Data', icon: Settings2 },
]

export function NewUiMobileTabs({
  files,
  onBack,
  onCopyUrl,
}: {
  files: SpineFiles
  onBack: () => void
  onCopyUrl: () => void
}) {
  const [active, setActive] = useState<NewUiSidebarSection | null>(null)

  return (
    <>
      {active && (
        <div
          className="fixed inset-x-0 bottom-14 z-30 max-h-[55vh] overflow-hidden border-t border-border bg-card shadow-2xl md:hidden"
          role="dialog"
          aria-label="Controls panel"
        >
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="text-sm font-medium capitalize">{active}</span>
            <button
              type="button"
              className="text-xs text-muted-foreground"
              onClick={() => setActive(null)}
            >
              Close
            </button>
          </div>
          <div className="max-h-[calc(55vh-40px)] overflow-y-auto">
            <NewUiSidebar
              files={files}
              onBack={onBack}
              onCopyUrl={onCopyUrl}
              section={active}
              compactHeader
              className="!h-auto !min-h-0 !border-0 !bg-transparent"
            />
          </div>
        </div>
      )}

      <nav
        className="fixed inset-x-0 bottom-0 z-40 flex border-t border-border bg-card/95 backdrop-blur-md md:hidden"
        aria-label="Viewer sections"
      >
        {TABS.map((tab) => {
          const Icon = tab.icon
          const isActive = active === tab.id
          return (
            <button
              key={tab.id}
              type="button"
              className={cn(
                'flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px]',
                isActive ? 'text-primary' : 'text-muted-foreground',
              )}
              onClick={() => setActive((prev) => (prev === tab.id ? null : tab.id))}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          )
        })}
      </nav>
    </>
  )
}
