import { Animation, AttachmentTimeline, RotateTimeline, SkeletonData } from '@esotericsoftware/spine-core'
import { describe, expect, it } from 'vitest'

import {
	CrossfadeClock,
	animationDrivesAttachments,
	crossfadeAlphas,
	shouldCrossfade,
	type CrossfadeOptions,
} from './crossfadePlan'

function dataWith(animations: Record<string, 'attachment' | 'bone'>): SkeletonData {
	const data = new SkeletonData()
	for (const [name, kind] of Object.entries(animations)) {
		const timeline = kind === 'attachment' ? new AttachmentTimeline(1, 0) : new RotateTimeline(1, 1, 0)
		data.animations.push(new Animation(name, [timeline], 1))
	}
	return data
}

const base = (extra: Partial<CrossfadeOptions> = {}): CrossfadeOptions => ({ duration: 0.3, ...extra })

describe('animationDrivesAttachments', () => {
	const data = dataWith({ coin: 'attachment', wobble: 'bone' })
	it('detects attachment timelines', () => {
		expect(animationDrivesAttachments(data, 'coin')).toBe(true)
		expect(animationDrivesAttachments(data, 'wobble')).toBe(false)
		expect(animationDrivesAttachments(data, 'missing')).toBe(false)
		expect(animationDrivesAttachments(data, null)).toBe(false)
	})
})

describe('shouldCrossfade', () => {
	const data = dataWith({ a: 'attachment', b: 'attachment', bone1: 'bone', bone2: 'bone' })

	it('auto: crossfades when either side drives attachments, not for pure bone mixes', () => {
		expect(shouldCrossfade({ options: base(), data, from: 'a', to: 'b' })).toBe(true)
		expect(shouldCrossfade({ options: base(), data, from: 'bone1', to: 'a' })).toBe(true)
		expect(shouldCrossfade({ options: base(), data, from: 'bone1', to: 'bone2' })).toBe(false)
	})

	it('always: crossfades even pure bone switches', () => {
		expect(shouldCrossfade({ options: base({ trigger: 'always' }), data, from: 'bone1', to: 'bone2' })).toBe(true)
	})

	it('auto skips restarting the same clip, always does not', () => {
		expect(shouldCrossfade({ options: base(), data, from: 'a', to: 'a' })).toBe(false)
		expect(shouldCrossfade({ options: base({ trigger: 'always' }), data, from: 'a', to: 'a' })).toBe(true)
	})

	it('needs an outgoing pose and a positive duration', () => {
		expect(shouldCrossfade({ options: base(), data, from: null, to: 'a' })).toBe(false)
		expect(shouldCrossfade({ options: base({ duration: 0 }), data, from: 'a', to: 'b' })).toBe(false)
		expect(shouldCrossfade({ options: undefined, data, from: 'a', to: 'b' })).toBe(false)
	})

	it('honours the from/to filters', () => {
		const only = { from: ['a'] }
		expect(shouldCrossfade({ options: base({ only }), data, from: 'a', to: 'b' })).toBe(true)
		expect(shouldCrossfade({ options: base({ only }), data, from: 'b', to: 'a' })).toBe(false)
		expect(shouldCrossfade({ options: base({ only: { to: ['b'] } }), data, from: 'a', to: 'b' })).toBe(true)
		expect(shouldCrossfade({ options: base({ only: { to: ['b'] } }), data, from: 'b', to: 'a' })).toBe(false)
	})
})

describe('crossfadeAlphas', () => {
	it('over: outgoing stays opaque, incoming eases 0 → 1', () => {
		expect(crossfadeAlphas(0, 'over')).toEqual({ outgoing: 1, incoming: 0 })
		expect(crossfadeAlphas(0.5, 'over')).toEqual({ outgoing: 1, incoming: 0.5 })
		expect(crossfadeAlphas(1, 'over')).toEqual({ outgoing: 1, incoming: 1 })
	})

	it('dissolve: alphas are complementary at every step', () => {
		for (const p of [0, 0.25, 0.5, 0.75, 1]) {
			const { outgoing, incoming } = crossfadeAlphas(p, 'dissolve')
			expect(outgoing + incoming).toBeCloseTo(1)
		}
	})

	it('clamps progress', () => {
		expect(crossfadeAlphas(-1, 'over').incoming).toBe(0)
		expect(crossfadeAlphas(5, 'dissolve')).toEqual({ outgoing: 0, incoming: 1 })
	})
})

describe('CrossfadeClock', () => {
	it('completes once the duration has elapsed, across uneven frames', () => {
		const clock = new CrossfadeClock(0.3, 'over')
		expect(clock.step(0.1).done).toBe(false)
		expect(clock.step(0.1).done).toBe(false)
		const last = clock.step(0.2)
		expect(last.done).toBe(true)
		expect(last.incoming).toBe(1)
	})

	it('a zero duration finishes immediately', () => {
		expect(new CrossfadeClock(0).step(0).done).toBe(true)
	})
})
