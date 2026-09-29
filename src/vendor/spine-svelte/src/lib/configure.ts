/**
 * Everything host-specific this package needs, supplied once at startup.
 *
 * A module-level call rather than Svelte context because the runtime is also driven from plain
 * loaders that run outside any component tree, where `getContext()` would throw.
 */
export type SpineSvelteConfig = {
	/** Displayed/logged runtime version. Hosts usually wire this to a build-time constant. */
	runtimeVersion: string
	/** Export versions this build can parse. */
	supportedExportPrefixes: string[]
	/**
	 * Called when a skeleton's export version is not supported, before parsing is attempted.
	 * Hosts that can recover (e.g. redirect to another build) do so here; the default refuses.
	 */
	onUnsupportedExport?: (info: { exportVersion: string | null; input: unknown }) => void
	/** Tween used for animated scale changes. Returns a cancel function. */
	tween?: (target: object, to: Record<string, number>, seconds: number) => () => void
	log: (message: string, ...rest: unknown[]) => void
	warn: (message: string, ...rest: unknown[]) => void
	/** Surfaces user-facing messages (toasts in the viewer, no-op in games). */
	notify?: (level: 'info' | 'warn' | 'error', message: string) => void
	dev: boolean
}

const defaults: SpineSvelteConfig = {
	runtimeVersion: 'unknown',
	supportedExportPrefixes: ['4.3'],
	log: (message, ...rest) => console.info(message, ...rest),
	warn: (message, ...rest) => console.warn(message, ...rest),
	dev: false,
}

let current: SpineSvelteConfig = defaults

export function configureSpineSvelte(patch: Partial<SpineSvelteConfig>): void {
	current = { ...current, ...patch }
}

export function spineSvelteConfig(): Readonly<SpineSvelteConfig> {
	return current
}

/** Test helper — restores the built-in defaults. */
export function resetSpineSvelteConfig(): void {
	current = defaults
}

export function supportedSpineVersionsText(): string {
	return `Spine ${current.runtimeVersion}`
}
