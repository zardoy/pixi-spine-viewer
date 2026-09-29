import type { AnySpine } from '../runtime/spineRuntime'
import { slotGetAttachment, slotSetAlpha, slotSetAttachment } from '../runtime/spineSlot'

/** What a slot shows while two animations are blending. */
export type AttachmentMixDirection = 'from' | 'to' | 'setup' | 'hide'

export type AttachmentMixRule = {
	slot: string
	duringMix: AttachmentMixDirection
}

/** Slot name → attachment name in effect just before the switch (null = nothing attached). */
export type FromAttachmentSnapshot = Record<string, string | null>

export function hasFromRule(rules: readonly AttachmentMixRule[] | undefined): boolean {
	return Boolean(rules?.some((rule) => rule.duringMix === 'from'))
}

/**
 * Capture what `'from'` slots are showing, immediately before `setAnimation`.
 *
 * Must happen at the switch: once the mix is underway the outgoing attachment name is already
 * gone from the live skeleton, so it cannot be recovered later.
 */
export function snapshotFromAttachments(
	spine: AnySpine,
	rules: readonly AttachmentMixRule[],
): FromAttachmentSnapshot {
	const snapshot: FromAttachmentSnapshot = {}
	for (const rule of rules) {
		if (rule.duringMix !== 'from') continue
		const slot = spine.skeleton.findSlot(rule.slot)
		snapshot[rule.slot] =
			(slot ? (slotGetAttachment(slot) as { name?: string } | null)?.name : null) ?? null
	}
	return snapshot
}

/**
 * Override what listed slots show during a cross-fade.
 *
 * Spine's AttachmentTimeline is binary — last writer wins — so the only safe per-slot override
 * point is after the whole state has been applied to the skeleton.
 *
 * Returns whether a mix is still running; when false the caller should drop its snapshot so the
 * rules stop firing outside a transition.
 */
export function applyAttachmentMixRules(
	spine: AnySpine,
	rules: readonly AttachmentMixRule[],
	snapshot: FromAttachmentSnapshot | null,
): { mixing: boolean } {
	if (!rules.length) return { mixing: false }

	const track = spine.state.tracks[0]
	if (!track?.mixingFrom) return { mixing: false }

	const skeleton = spine.skeleton

	for (const rule of rules) {
		// 'to' is Spine's own behaviour — nothing to override.
		if (rule.duringMix === 'to') continue

		const slot = skeleton.findSlot(rule.slot) as {
			data: { index: number; attachmentName?: string }
		} | null
		if (!slot) continue

		switch (rule.duringMix) {
			case 'from': {
				if (!snapshot) break
				const fromName = snapshot[rule.slot]
				if (fromName === undefined) break
				slotSetAttachment(
					slot,
					fromName != null ? skeleton.getAttachment(slot.data.index, fromName) : null,
				)
				break
			}
			case 'setup': {
				const setupName = slot.data.attachmentName
				slotSetAttachment(
					slot,
					setupName ? skeleton.getAttachment(slot.data.index, setupName) : null,
				)
				break
			}
			case 'hide': {
				slotSetAlpha(slot, 0)
				break
			}
		}
	}

	return { mixing: true }
}
