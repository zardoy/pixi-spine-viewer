import { describe, expect, it } from 'vitest'
import { applyForceHideAttachments, hasForceHideWork } from 'spine-svelte'
import type { AnySpine } from 'spine-svelte'

/** Minimal stand-in for a region attachment — the type guard only checks these three members. */
function attachment(name: string, path?: string) {
	return { name, path, width: 10, height: 10, computeWorldVertices: () => {} }
}

type FakeSlot = ReturnType<typeof slot>

function slot(name: string, att: ReturnType<typeof attachment> | null, poseAlpha = 1) {
	return {
		data: { name },
		pose: { color: { a: poseAlpha }, setAttachment: () => {} },
		appliedPose: { attachment: att, color: { a: 1, r: 1, g: 1, b: 1 } },
	}
}

function spineWith(slots: FakeSlot[]): AnySpine {
	return { skeleton: { slots, drawOrder: { appliedPose: slots } } } as unknown as AnySpine
}

const alphas = (slots: FakeSlot[]) => slots.map((s) => s.appliedPose.color.a)

describe('hasForceHideWork', () => {
	it('is false when nothing is configured', () => {
		expect(hasForceHideWork({})).toBe(false)
		expect(hasForceHideWork({ prefixes: [], exact: [] })).toBe(false)
	})

	it('is true when any mode is configured', () => {
		expect(hasForceHideWork({ wireframe: true })).toBe(true)
		expect(hasForceHideWork({ prefixes: ['ref_'] })).toBe(true)
		expect(hasForceHideWork({ exact: ['body'] })).toBe(true)
	})
})

describe('applyForceHideAttachments', () => {
	it('hides attachments matching a prefix and leaves others alone', () => {
		const slots = [slot('a', attachment('ref_point')), slot('b', attachment('body'))]
		applyForceHideAttachments(spineWith(slots), { prefixes: ['ref_'] })
		expect(alphas(slots)).toEqual([0, 1])
	})

	it('matches a prefix against the texture path, not just the attachment name', () => {
		const slots = [slot('a', attachment('point', 'ref_point'))]
		applyForceHideAttachments(spineWith(slots), { prefixes: ['ref_'] })
		expect(alphas(slots)).toEqual([0])
	})

	it('hides only exact path/name matches', () => {
		const slots = [slot('a', attachment('body')), slot('b', attachment('body_extra'))]
		applyForceHideAttachments(spineWith(slots), { exact: ['body'] })
		expect(alphas(slots)).toEqual([0, 1])
	})

	it('restores alpha from the unmixed pose so animation alpha timelines survive un-hiding', () => {
		// The animation itself is holding this slot at 0.4; un-hiding must not force it to 1.
		const slots = [slot('a', attachment('body'), 0.4)]
		slots[0].appliedPose.color.a = 0
		applyForceHideAttachments(spineWith(slots), { exact: ['other'] })
		expect(alphas(slots)).toEqual([0.4])
	})

	it('hides everything in wireframe mode regardless of the other filters', () => {
		const slots = [slot('a', attachment('body')), slot('b', attachment('head'))]
		applyForceHideAttachments(spineWith(slots), { wireframe: true, exact: ['body'] })
		expect(alphas(slots)).toEqual([0, 0])
	})

	it('leaves alpha untouched when no rule is active', () => {
		const slots = [slot('a', attachment('body'), 0.5)]
		slots[0].appliedPose.color.a = 0.5
		applyForceHideAttachments(spineWith(slots), {})
		expect(alphas(slots)).toEqual([0.5])
	})

	it('ignores slots with no attachment', () => {
		const slots = [slot('a', null)]
		expect(() => applyForceHideAttachments(spineWith(slots), { prefixes: ['ref_'] })).not.toThrow()
		expect(alphas(slots)).toEqual([1])
	})

	it('falls back to skeleton.slots when draw order is unavailable', () => {
		const slots = [slot('a', attachment('ref_x'))]
		const spine = { skeleton: { slots } } as unknown as AnySpine
		applyForceHideAttachments(spine, { prefixes: ['ref_'] })
		expect(alphas(slots)).toEqual([0])
	})
})
