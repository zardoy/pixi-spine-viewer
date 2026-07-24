import { useSyncExternalStore } from 'react'
import {
  getAppServiceWorkerState,
  subscribeAppServiceWorker,
  type AppServiceWorkerState,
} from '../lib/appServiceWorker'

export function useAppServiceWorker(): AppServiceWorkerState {
  return useSyncExternalStore(subscribeAppServiceWorker, getAppServiceWorkerState, getAppServiceWorkerState)
}
