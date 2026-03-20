import { proxy, useSnapshot } from 'valtio'

    const state = proxy({
        overrides: {} as Record<string, any>,
    })

export const globalController = {
    setOverrides: (override: any) => {
        state.overrides = override
    },
    clearOverrides: () => {
        state.overrides = {}
    },
    getMergedProps: (props: any) => {
        return {
            ...props,
            ...state.overrides,
        }
    },
    useReactiveUpdateHook: (control: string) => {
        const { overrides } = useSnapshot(state)

        return {
            counter: 0,
        }
    },
};

(globalThis as any).globalController = globalController

// USAGE

// globalController.setOverrides({animation2: 'collect'})
// globalController.clearOverrides()
