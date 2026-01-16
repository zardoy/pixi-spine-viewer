import { proxy } from 'valtio';

export const globalSpineOverrides = proxy({
  overrides: {} as Record<string, any>,
  spineStates: {},
})

export const registerSpine = (spineKey: string, timeScale: number) => {
}
export const unregisterSpine = (spineKey: string) => {}
