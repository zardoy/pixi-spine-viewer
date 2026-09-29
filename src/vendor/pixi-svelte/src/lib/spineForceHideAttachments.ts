import type { Spine } from '@esotericsoftware/spine-pixi-v8';

function attachmentPath(att: { name: string; path?: string }): string {
	return att.path ?? att.name;
}

/** Hide batched attachments whose path/name starts with any prefix (`setAttachment(null)`). */
export function applySpineForceHideAttachmentPrefixes(
	spine: Spine,
	prefixes: readonly string[],
): void {
	if (!prefixes.length) return;

	for (const slot of spine.skeleton.slots) {
		const pose = slot.appliedPose;
		const att = pose.getAttachment() as { name: string; path?: string } | null;
		if (!att) continue;

		const path = attachmentPath(att);
		const hide = prefixes.some((p) => path.startsWith(p) || att.name.startsWith(p));
		if (hide) pose.setAttachment(null);
	}
}
