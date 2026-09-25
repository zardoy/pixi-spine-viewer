import { describe, expect, it } from 'vitest'
import {
	applyAttachmentMixRules,
	hasFromRule,
	snapshotFromAttachments,
	type AttachmentMixRule,
} from 'spine-svelte'
import type { AnySpine } from 'spine-svelte'

function slot(name: string, index: number, attachmentName: string | null, setupName?: string) {
	const applied = { attachment: attachmentName ? { name: attachmentName } : null }
	return {
		data: { name, index, attachmentName: setupName },
		appliedPose: { ...applied, color: { a: 1, r: 1, g: 1, b: 1 } },
		pose: {
			color: { a: 1 },
			setAttachment(next: unknown) {
				this.lastSet = next
			},
			lastSet: undefined as unknown,
		},
	}
}

type FakeSlot = ReturnType<typeof slot>

/** `mixing` drives `track.mixingFrom`, which is what gates the whole pass. */
function spineWith(slots: FakeSlot[], mixing: boolean): AnySpine {
	return {
		state: { tracks: [{ mixingFrom: mixing ? {} : null }] },
		skeleton: {
			slots,
			drawOrder: { appliedPose: slots },
			findSlot: (name: string) => slots.find((s) => s.data.name === name) ?? null,
			getAttachment: (index: number, name: string) => ({ name, index }),
		},
	} as unknown as AnySpine
}

describe('hasFromRule', () => {
	it('detects whether a snapshot is needed', () => {
		expect(hasFromRule(undefined)).toBe(false)
		expect(hasFromRule([{ slot: 'a', duringMix: 'to' }])).toBe(false)
		expect(hasFromRule([{ slot: 'a', duringMix: 'from' }])).toBe(true)
	})
})

describe('snapshotFromAttachments', () => {
	it('records only the slots carrying a from rule', () => {
		const slots = [slot('head', 0, 'head_a'), slot('body', 1, 'body_a')]
		const rules: AttachmentMixRule[] = [
			{ slot: 'head', duringMix: 'from' },
			{ slot: 'body', duringMix: 'setup' },
		]
		expect(snapshotFromAttachments(spineWith(slots, false), rules)).toEqual({ head: 'head_a' })
	})

	it('records null for a slot showing nothing', () => {
		const slots = [slot('head', 0, null)]
		const rules: AttachmentMixRule[] = [{ slot: 'head', duringMix: 'from' }]
		expect(snapshotFromAttachments(spineWith(slots, false), rules)).toEqual({ head: null })
	})
})

describe('applyAttachmentMixRules', () => {
	it('reports no mix and changes nothing when no transition is running', () => {
		const slots = [slot('head', 0, 'head_b')]
		const rules: AttachmentMixRule[] = [{ slot: 'head', duringMix: 'from' }]
		const result = applyAttachmentMixRules(spineWith(slots, false), rules, { head: 'head_a' })
		expect(result.mixing).toBe(false)
		expect(slots[0].pose.lastSet).toBeUndefined()
	})

	it('restores the snapshotted attachment during a mix', () => {
		const slots = [slot('head', 0, 'head_b')]
		const rules: AttachmentMixRule[] = [{ slot: 'head', duringMix: 'from' }]
		const result = applyAttachmentMixRules(spineWith(slots, true), rules, { head: 'head_a' })
		expect(result.mixing).toBe(true)
		expect(slots[0].pose.lastSet).toEqual({ name: 'head_a', index: 0 })
	})

	it('clears the attachment when the snapshot recorded nothing', () => {
		const slots = [slot('head', 0, 'head_b')]
		const rules: AttachmentMixRule[] = [{ slot: 'head', duringMix: 'from' }]
		applyAttachmentMixRules(spineWith(slots, true), rules, { head: null })
		expect(slots[0].pose.lastSet).toBeNull()
	})

	it('leaves the slot alone when it was never snapshotted', () => {
		const slots = [slot('head', 0, 'head_b')]
		const rules: AttachmentMixRule[] = [{ slot: 'head', duringMix: 'from' }]
		applyAttachmentMixRules(spineWith(slots, true), rules, {})
		expect(slots[0].pose.lastSet).toBeUndefined()
	})

	it('applies the setup-pose attachment for a setup rule', () => {
		const slots = [slot('head', 0, 'head_b', 'head_setup')]
		const rules: AttachmentMixRule[] = [{ slot: 'head', duringMix: 'setup' }]
		applyAttachmentMixRules(spineWith(slots, true), rules, null)
		expect(slots[0].pose.lastSet).toEqual({ name: 'head_setup', index: 0 })
	})

	it('zeroes alpha for a hide rule', () => {
		const slots = [slot('head', 0, 'head_b')]
		const rules: AttachmentMixRule[] = [{ slot: 'head', duringMix: 'hide' }]
		applyAttachmentMixRules(spineWith(slots, true), rules, null)
		expect(slots[0].appliedPose.color.a).toBe(0)
	})

	it("treats 'to' as a no-op, since that is Spine's own behaviour", () => {
		const slots = [slot('head', 0, 'head_b')]
		const rules: AttachmentMixRule[] = [{ slot: 'head', duringMix: 'to' }]
		applyAttachmentMixRules(spineWith(slots, true), rules, { head: 'head_a' })
		expect(slots[0].pose.lastSet).toBeUndefined()
		expect(slots[0].appliedPose.color.a).toBe(1)
	})

	it('skips rules naming a slot the skeleton does not have', () => {
		const slots = [slot('head', 0, 'head_b')]
		const rules: AttachmentMixRule[] = [{ slot: 'missing', duringMix: 'from' }]
		expect(() =>
			applyAttachmentMixRules(spineWith(slots, true), rules, { missing: 'x' }),
		).not.toThrow()
	})
})
