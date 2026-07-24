import { CloudOff, Download, Loader2, RefreshCw, Wifi } from 'lucide-react'
import { useAppServiceWorker } from '../hooks/useAppServiceWorker'

function StatusDot({ className }: { className: string }) {
  return <span className={`inline-block h-2 w-2 rounded-full shrink-0 ${className}`} aria-hidden />
}

export function AppServiceWorkerStatus() {
  const { status, isOnline, version, buildDateLabel } = useAppServiceWorker()

  const connectionLabel = isOnline ? 'Online' : 'Offline'
  const connectionDot = isOnline ? 'bg-emerald-500' : 'bg-amber-500'

  let swLabel = 'App cached for offline'
  let swIcon = <Download className="h-3 w-3 shrink-0 opacity-70" aria-hidden />

  switch (status) {
    case 'dev':
      swLabel = 'Dev build (no service worker)'
      swIcon = <Wifi className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
      break
    case 'unsupported':
      swLabel = 'Offline mode unavailable'
      swIcon = <CloudOff className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
      break
    case 'registering':
      swLabel = 'Preparing offline cache…'
      swIcon = <Loader2 className="h-3 w-3 shrink-0 animate-spin opacity-70" aria-hidden />
      break
    case 'ready':
      swLabel = 'Up to date'
      swIcon = <Wifi className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
      break
    case 'offline-ready':
      swLabel = 'Ready for offline use'
      swIcon = <Download className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
      break
    case 'update-available':
      swLabel = 'Update available'
      swIcon = <RefreshCw className="h-3 w-3 shrink-0 opacity-70" aria-hidden />
      break
    case 'updating':
      swLabel = 'Updating…'
      swIcon = <Loader2 className="h-3 w-3 shrink-0 animate-spin opacity-70" aria-hidden />
      break
  }

  return (
    <div
      className="fixed bottom-4 left-4 z-20 max-w-[min(20rem,calc(100vw-2rem))] rounded-lg border border-border/80 bg-background/90 px-3 py-2 text-xs text-muted-foreground shadow-sm backdrop-blur-sm"
      role="status"
      aria-live="polite"
      title={`Version ${version} · built ${buildDateLabel}`}
    >
      <div className="flex items-center gap-2">
        <StatusDot className={connectionDot} />
        <span className="font-medium text-foreground/90">{connectionLabel}</span>
        <span className="text-muted-foreground/50">·</span>
        <span className="truncate">{swLabel}</span>
        {swIcon}
      </div>
      <div className="mt-1 truncate text-[11px] text-muted-foreground/80">
        v{version} · {buildDateLabel}
      </div>
    </div>
  )
}
