import { useSnapshot } from 'valtio'
import { cn } from '@/lib/utils'
import { spineViewerStore } from '@/store/spineViewerStore'
import { formatSkinDisplayName } from '@/lib/spineCompat'

export function NewUiSkinList() {
  const { ui } = useSnapshot(spineViewerStore)

  if (ui.skins.length <= 1) return null

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">Skins (C)</p>
      <div
        className="overflow-y-auto rounded-md border border-border bg-background/40"
        style={{ maxHeight: '8rem' }}
      >
        {ui.skins.map((name) => {
          const isSelected = name === ui.selectedSkin
          const label = formatSkinDisplayName(name)

          return (
            <button
              key={name}
              type="button"
              className={cn(
                'flex w-full items-center gap-2 px-2 py-1.5 text-left text-sm transition-colors',
                isSelected ? 'bg-primary/15 text-foreground' : 'hover:bg-accent/50',
              )}
              onClick={() => {
                spineViewerStore.ui.selectedSkin = name
              }}
            >
              <span className="min-w-0 truncate">
                <span className={isSelected ? 'font-medium' : 'text-foreground/90'}>
                  {label}
                </span>
              </span>
            </button>
          )
        })}
      </div>
      <p className="text-[11px] leading-snug text-muted-foreground">C — next skin</p>
    </div>
  )
}
