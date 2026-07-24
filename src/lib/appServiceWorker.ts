import { registerSW } from 'virtual:pwa-register'
import { APP_BUILD_DATE, APP_VERSION } from './appBuildInfo'

export type AppServiceWorkerStatus =
  | 'unsupported'
  | 'dev'
  | 'registering'
  | 'ready'
  | 'offline-ready'
  | 'update-available'
  | 'updating'

export interface AppServiceWorkerState {
  status: AppServiceWorkerStatus
  isOnline: boolean
  version: string
  buildDate: string
  buildDateLabel: string
}

const listeners = new Set<() => void>()

let state: AppServiceWorkerState = {
  status: import.meta.env.PROD ? 'registering' : 'dev',
  isOnline: typeof navigator !== 'undefined' ? navigator.onLine : true,
  version: APP_VERSION,
  buildDate: APP_BUILD_DATE,
  buildDateLabel: formatBuildDate(APP_BUILD_DATE),
}

function formatBuildDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

function setState(patch: Partial<AppServiceWorkerState>): void {
  state = { ...state, ...patch }
  listeners.forEach((listener) => listener())
}

export function getAppServiceWorkerState(): AppServiceWorkerState {
  return state
}

export function subscribeAppServiceWorker(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

let initialized = false

export function initAppServiceWorker(): void {
  if (initialized || typeof window === 'undefined') return
  initialized = true

  const onOnline = () => setState({ isOnline: true })
  const onOffline = () => setState({ isOnline: false })
  window.addEventListener('online', onOnline)
  window.addEventListener('offline', onOffline)

  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) {
    if (!('serviceWorker' in navigator)) {
      setState({ status: 'unsupported' })
    }
    return
  }

  const updateSW = registerSW({
    immediate: true,
    onRegisteredSW(_swUrl, registration) {
      setState({ status: 'ready' })
      if (!registration) return
      registration.update().catch(() => {})
      window.setInterval(() => {
        registration.update().catch(() => {})
      }, 60 * 60 * 1000)
    },
    onOfflineReady() {
      setState({ status: 'offline-ready' })
    },
    onNeedRefresh() {
      setState({ status: 'update-available' })
      window.setTimeout(() => {
        setState({ status: 'updating' })
        void updateSW(true)
      }, 400)
    },
    onRegisterError(error) {
      console.error('[PWA] service worker registration failed:', error)
      setState({ status: 'unsupported' })
    },
  })
}
