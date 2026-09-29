import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
	SpineOverrideController,
	configureSpineSvelte,
	resetSpineSvelteConfig,
} from 'spine-svelte'

type Config = { char: 'main_character' }

function mountedController() {
	const controller = new SpineOverrideController<Config>()
	controller.mountControl('char')
	return controller
}

beforeEach(() => {
	resetSpineSvelteConfig()
})

describe('mount gating', () => {
	it('refuses an override for a control nobody has mounted', async () => {
		const warn = vi.fn()
		configureSpineSvelte({ warn })
		const controller = new SpineOverrideController<Config>()

		await expect(controller.setOverride('char', { animation: 'hit' })).resolves.toBe(true)
		expect(controller.hasOverride('char')).toBe(false)
		expect(warn).toHaveBeenCalledOnce()
	})

	it('stores it anyway when the caller opts in', () => {
		const controller = new SpineOverrideController<Config>()
		void controller.setOverride('char', { animation: 'hit' }, { allowUnmounted: true })
		expect(controller.hasOverride('char')).toBe(true)
	})

	it('stops being mounted once every consumer unmounts', () => {
		const controller = new SpineOverrideController<Config>()
		controller.mountControl('char')
		controller.mountControl('char')
		controller.unmountControl('char')
		expect(controller.isMounted('char')).toBe(true)
		controller.unmountControl('char')
		expect(controller.isMounted('char')).toBe(false)
	})
})

describe('completion and interruption', () => {
	it('resolves true when the overriding clip finishes', async () => {
		const controller = mountedController()
		const done = controller.setOverride('char', { animation: 'hit' })

		controller.handleTrackComplete('char', 0)

		await expect(done).resolves.toBe(true)
		expect(controller.hasOverride('char')).toBe(false)
	})

	it('resolves the previous override false when a new one replaces it', async () => {
		const controller = mountedController()
		const first = controller.setOverride('char', { animation: 'hit' })
		const second = controller.setOverride('char', { animation: 'die' })

		await expect(first).resolves.toBe(false)

		controller.handleTrackComplete('char', 0)
		await expect(second).resolves.toBe(true)
	})

	it('resolves false when cleared', async () => {
		const controller = mountedController()
		const done = controller.setOverride('char', { animation: 'hit' })
		controller.clearOverride('char')
		await expect(done).resolves.toBe(false)
	})

	it('never self-completes a looping override', () => {
		const controller = mountedController()
		void controller.setOverride('char', { animation: 'rage', loop: true })

		controller.handleTrackComplete('char', 0)

		expect(controller.hasOverride('char')).toBe(true)
	})

	it('ignores a track 1 completion when the override has no layered animation', () => {
		const controller = mountedController()
		void controller.setOverride('char', { animation: 'hit' })
		controller.handleTrackComplete('char', 1)
		expect(controller.hasOverride('char')).toBe(true)
	})

	it('completes on track 1 for a layered override', async () => {
		const controller = mountedController()
		const done = controller.setOverride('char', { animation2: 'blink' })
		controller.handleTrackComplete('char', 1)
		await expect(done).resolves.toBe(true)
	})

	it('awaitAnimation resolves true when nothing is overriding', async () => {
		const controller = mountedController()
		await expect(controller.awaitAnimation('char')).resolves.toBe(true)
	})
})

describe('getPlayback', () => {
	const base = {
		animationName: 'idle',
		skinName: 'default',
		playbackLoop: true,
		playbackLoopDelay: 2,
	}

	it('passes the base through untouched with no override', () => {
		const controller = mountedController()
		expect(controller.getPlayback('char', base)).toEqual({
			animationName: 'idle',
			animation2Name: undefined,
			skinName: 'default',
			playbackLoop: true,
			playbackLoop2: false,
			playbackLoopDelay: 2,
			resetCounter: undefined,
			revision: 0,
		})
	})

	it('does not inherit the base loop for a primary override, so it can fall back', () => {
		// Inheriting `playbackLoop: true` would restart the clip before completion clears it.
		const controller = mountedController()
		void controller.setOverride('char', { animation: 'hit' })

		const merged = controller.getPlayback('char', base)
		expect(merged.animationName).toBe('hit')
		expect(merged.playbackLoop).toBe(false)
		expect(merged.playbackLoopDelay).toBe(0)
	})

	it('keeps the base animation when only a layered animation is overridden', () => {
		const controller = mountedController()
		void controller.setOverride('char', { animation2: 'blink' })

		const merged = controller.getPlayback('char', base)
		expect(merged.animationName).toBe('idle')
		expect(merged.animation2Name).toBe('blink')
		expect(merged.playbackLoop).toBe(true)
	})

	it('bumps resetCounter per primary override so an identical clip retriggers', () => {
		const controller = mountedController()
		void controller.setOverride('char', { animation: 'hit' })
		const first = controller.getPlayback('char', base).resetCounter!

		void controller.setOverride('char', { animation: 'hit' })
		const second = controller.getPlayback('char', base).resetCounter!

		expect(second).toBe(first + 1)
	})

	it('leaves resetCounter unset for a layered-only override', () => {
		const controller = mountedController()
		void controller.setOverride('char', { animation2: 'blink' })
		expect(controller.getPlayback('char', base).resetCounter).toBeUndefined()
	})

	it('lets an override replace the skin', () => {
		const controller = mountedController()
		void controller.setOverride('char', { skin: 'angry' })
		expect(controller.getPlayback('char', base).skinName).toBe('angry')
	})
})

describe('subscribe', () => {
	it('fires on set, complete and clear, and stops after unsubscribe', () => {
		const controller = mountedController()
		const listener = vi.fn()
		const unsubscribe = controller.subscribe(listener)

		void controller.setOverride('char', { animation: 'hit' })
		expect(listener).toHaveBeenCalledTimes(1)

		controller.handleTrackComplete('char', 0)
		expect(listener).toHaveBeenCalledTimes(2)

		unsubscribe()
		void controller.setOverride('char', { animation: 'hit' })
		expect(listener).toHaveBeenCalledTimes(2)
	})
})

describe('clearAll', () => {
	it('interrupts every active override', async () => {
		const controller = new SpineOverrideController<Config>()
		controller.mountControl('char')
		const done = controller.setOverride('char', { animation: 'hit' })

		controller.clearAll()

		await expect(done).resolves.toBe(false)
		expect(controller.getActiveKeys()).toEqual([])
	})
})
