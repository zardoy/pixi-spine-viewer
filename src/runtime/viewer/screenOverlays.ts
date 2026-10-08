import { Container, Graphics, Text } from 'pixi.js'
import {
	attachAttachmentTestToBone,
	attachAttachmentTestToBoneDrawOrder,
	attachAttachmentTestToSlotDrawOrder,
	attachAttachmentTestToSlotOverlay,
	computeMaxAnimationBounds,
	detachAttachmentTestMarker,
	formatBoundsCanvasLabel,
	tickAttachmentTestBoneFollow,
	tickAttachmentTestSlotFollow,
	type AnySpine,
} from 'spine-svelte'
import { spineViewerStore } from '../../store/spineViewerStore'

/*
 * Screen-space debug overlays.
 *
 * These live in the unscaled root container and place themselves from the camera in the store,
 * rather than inside the zoomed world container: strokes and labels then stay a fixed pixel size
 * however far the user has zoomed.
 */

const isDestroyed = (spine: AnySpine | null | undefined) =>
	!spine || (spine as { destroyed?: boolean }).destroyed === true

const LIVE_COLOR = 0x00ff88
const MAX_COLOR = 0xffbb00

function makeBoundsLabel(fill: number): Text {
	return new Text({ text: '', style: { fontSize: 11, fill, fontWeight: 'bold', lineHeight: 14 } })
}

/** Green = this frame's bounds, yellow = the widest bounds across the whole animation. */
export class BoundsOverlay {
	private graphics: Graphics | null = null
	private liveLabel: Text | null = null
	private maxLabel: Text | null = null

	constructor(private readonly parent: Container) {}

	/** Create or drop the pieces to match which modes are on. Idempotent. */
	setModes(live: boolean, max: boolean): void {
		if (!live && !max) {
			this.destroy()
			return
		}
		if (!this.graphics) {
			this.graphics = new Graphics()
			this.parent.addChild(this.graphics)
		}
		if (live && !this.liveLabel) {
			this.liveLabel = makeBoundsLabel(LIVE_COLOR)
			this.parent.addChild(this.liveLabel)
		} else if (!live && this.liveLabel) {
			this.dropLabel('liveLabel')
		}
		if (max && !this.maxLabel) {
			this.maxLabel = makeBoundsLabel(MAX_COLOR)
			this.parent.addChild(this.maxLabel)
		} else if (!max && this.maxLabel) {
			this.dropLabel('maxLabel')
		}
	}

	private dropLabel(which: 'liveLabel' | 'maxLabel') {
		const label = this[which]
		if (!label) return
		this.parent.removeChild(label)
		label.destroy()
		this[which] = null
	}

	tick(spine: AnySpine | null): void {
		const { graphics, liveLabel, maxLabel } = this
		const { ui } = spineViewerStore
		if (!spine || !graphics) return
		if (!ui.debugBoundsLive && !ui.debugBoundsMax) return

		graphics.clear()
		if (liveLabel) liveLabel.text = ''
		if (maxLabel) maxLabel.text = ''
		if (isDestroyed(spine)) return

		try {
			const originX = ui.spinePosition.x
			const originY = ui.spinePosition.y
			const zoom = ui.scale

			const drawRect = (
				localX: number,
				localY: number,
				localW: number,
				localH: number,
				color: number,
				label: Text | null,
			) => {
				if (!label || ![localX, localY, localW, localH].every(Number.isFinite) || localW <= 0 || localH <= 0) {
					return
				}
				const x = originX + localX * zoom
				const y = originY + localY * zoom
				const width = localW * zoom
				const height = localH * zoom

				graphics.rect(x, y, width, height)
				graphics.stroke({ color, width: 2 })

				label.text = formatBoundsCanvasLabel(x, y, width, height, localW, localH)
				label.x = x
				label.y = y - 28
			}

			if (ui.debugBoundsLive && liveLabel) {
				const bounds = spine.bounds
				if (bounds && bounds.minX !== Infinity && bounds.maxX !== -Infinity) {
					drawRect(
						bounds.minX,
						bounds.minY,
						bounds.maxX - bounds.minX,
						bounds.maxY - bounds.minY,
						LIVE_COLOR,
						liveLabel,
					)
				}
			}

			if (ui.debugBoundsMax && maxLabel && ui.selectedAnimation) {
				const data = spine.skeleton?.data
				const full = data
					? computeMaxAnimationBounds(data, ui.selectedAnimation, 0.05, ui.selectedSkin)
					: null
				if (full) drawRect(full.x, full.y, full.width, full.height, MAX_COLOR, maxLabel)
			}
		} catch (err) {
			console.error('Error updating debug bounds:', err)
			graphics.clear()
			if (liveLabel) liveLabel.text = ''
			if (maxLabel) maxLabel.text = ''
		}
	}

	destroy(): void {
		if (this.graphics) {
			this.parent.removeChild(this.graphics)
			this.graphics.destroy()
			this.graphics = null
		}
		this.dropLabel('liveLabel')
		this.dropLabel('maxLabel')
	}
}

/** Green rectangle for the particle generator's spawn area. */
export class SpawnBoundsOverlay {
	private graphics: Graphics | null = null

	constructor(private readonly parent: Container) {}

	setEnabled(enabled: boolean): void {
		if (!enabled) {
			this.destroy()
			return
		}
		if (!this.graphics) {
			this.graphics = new Graphics()
			this.parent.addChild(this.graphics)
		}
	}

	tick(): void {
		const { graphics } = this
		const { ui } = spineViewerStore
		if (!graphics || !ui.spawnBounds) return

		try {
			const [minX, maxX] = ui.spawnBounds.x
			const [minY, maxY] = ui.spawnBounds.y
			const zoom = ui.scale

			graphics.clear()
			graphics.rect(
				ui.spinePosition.x + minX * zoom,
				ui.spinePosition.y + minY * zoom,
				(maxX - minX) * zoom,
				(maxY - minY) * zoom,
			)
			graphics.stroke({ color: 0x00ff00, width: 2 })
		} catch (err) {
			console.error('Error updating spawn bounds:', err)
			graphics.clear()
		}
	}

	destroy(): void {
		if (!this.graphics) return
		this.parent.removeChild(this.graphics)
		this.graphics.destroy()
		this.graphics = null
	}
}

const SIZE_BONE_RE = /^size\d+$/i
const SIZE_BONES_COLOR = 0x00d4ff

/**
 * Hairline border around the bones named size1, size2, ... — riggers use them as corner markers
 * for the intended display area. Appears on its own whenever the skeleton has at least two.
 */
export class SizeBonesOverlay {
	private graphics: Graphics | null = null

	constructor(private readonly parent: Container) {}

	tick(spine: AnySpine | null): void {
		if (isDestroyed(spine)) {
			this.graphics?.clear()
			return
		}
		const bones = (spine!.skeleton.bones as { data: { name: string }; appliedPose: { worldX: number; worldY: number } }[])
			.filter((bone) => SIZE_BONE_RE.test(bone.data.name))
		if (bones.length < 2) {
			this.destroy()
			return
		}
		if (!this.graphics) {
			this.graphics = new Graphics()
			this.parent.addChild(this.graphics)
		}
		const { graphics } = this
		const { ui } = spineViewerStore
		const xs = bones.map((bone) => bone.appliedPose.worldX)
		const ys = bones.map((bone) => bone.appliedPose.worldY)
		const minX = Math.min(...xs)
		const minY = Math.min(...ys)
		const maxX = Math.max(...xs)
		const maxY = Math.max(...ys)
		graphics.clear()
		if (![minX, minY, maxX, maxY].every(Number.isFinite)) return
		graphics.rect(
			ui.spinePosition.x + minX * ui.scale,
			ui.spinePosition.y + minY * ui.scale,
			(maxX - minX) * ui.scale,
			(maxY - minY) * ui.scale,
		)
		graphics.stroke({ color: SIZE_BONES_COLOR, width: 1, alpha: 0.9 })
	}

	destroy(): void {
		if (!this.graphics) return
		this.parent.removeChild(this.graphics)
		this.graphics.destroy()
		this.graphics = null
	}
}

function drawMarker(graphics: Graphics, blue: boolean, large: boolean): void {
	const half = large ? 10 : 5
	graphics.clear()
	graphics.rect(-half, -half, half * 2, half * 2)
	graphics.fill({ color: blue ? 0x0000ff : 0xff0000, alpha: 0.8 })
}

export type AttachmentTestOptions = {
	followMode: 'slot' | 'bone'
	slot: string
	bone: string
	useSpineDrawOrder: boolean
	boneOffset: { x: number; y: number } | null
}

/** The red/blue square that follows a slot or bone, for checking where attachments land. */
export class AttachmentTestMarker {
	private marker: Graphics | null = null
	private attachedTo: AnySpine | null = null

	/** Create (or drop) the marker for `spine`. */
	setVisible(visible: boolean, spine: AnySpine | null): void {
		if (visible && spine && !isDestroyed(spine)) {
			if (!this.marker) {
				this.marker = new Graphics()
				this.setStyle(spineViewerStore.ui.attachmentTestBoxBlue, spineViewerStore.ui.attachmentTestBoxLarge)
			}
			return
		}
		this.destroy()
	}

	setStyle(blue: boolean, large: boolean): void {
		if (this.marker) drawMarker(this.marker, blue, large)
	}

	/** (Re)attach to the chosen slot/bone. Returns a detach function. */
	attach(spine: AnySpine, options: AttachmentTestOptions): () => void {
		const { marker } = this
		if (!marker || isDestroyed(spine)) return () => {}

		this.detach()
		this.attachedTo = spine

		const { followMode, useSpineDrawOrder, boneOffset } = options
		const slotName = followMode === 'slot' ? options.slot : ''
		const boneName = followMode === 'bone' ? options.bone : ''

		if (slotName) {
			const ok = useSpineDrawOrder
				? attachAttachmentTestToSlotDrawOrder(spine, slotName, marker)
				: attachAttachmentTestToSlotOverlay(spine, slotName, marker)
			if (!ok) marker.visible = false
		} else if (boneName) {
			const offsetX = boneOffset?.x ?? 0
			const offsetY = boneOffset?.y ?? 0
			const result = useSpineDrawOrder
				? attachAttachmentTestToBoneDrawOrder(spine, boneName, marker, offsetX, offsetY)
				: attachAttachmentTestToBone(spine, boneName, marker, offsetX, offsetY) && 'overlay'
			if (!result) marker.visible = false
		} else {
			marker.visible = false
		}

		return () => this.detach()
	}

	detach(): void {
		const spine = this.attachedTo
		this.attachedTo = null
		if (this.marker && spine && !isDestroyed(spine)) detachAttachmentTestMarker(spine, this.marker)
	}

	/** Overlay-mode followers need a manual pose sync each frame; draw-order mode rides the spine. */
	tick(spine: AnySpine | null, options: AttachmentTestOptions): void {
		const { marker } = this
		if (!marker || !spine || isDestroyed(spine) || options.useSpineDrawOrder) return

		if (options.followMode === 'slot' && options.slot) {
			tickAttachmentTestSlotFollow(spine, options.slot, marker)
		} else if (options.followMode === 'bone' && options.bone) {
			tickAttachmentTestBoneFollow(
				spine,
				options.bone,
				marker,
				options.boneOffset?.x ?? 0,
				options.boneOffset?.y ?? 0,
			)
		}
	}

	destroy(): void {
		this.detach()
		if (this.marker) {
			this.marker.destroy()
			this.marker = null
		}
	}
}

type AttachmentTestUi = {
	attachmentFollowMode: 'slot' | 'bone'
	selectedAttachmentSlot: string
	selectedAttachmentBone: string
	attachmentTestUseSpineDrawOrder: boolean
	attachmentTestBoneOffsetEnabled: boolean
	attachmentTestBoneOffsetX: number
	attachmentTestBoneOffsetY: number
}

/** Works on the store or on the reactive mirror — pass whichever the caller wants to read from. */
export function readAttachmentTestOptions(ui: AttachmentTestUi): AttachmentTestOptions {
	return {
		followMode: ui.attachmentFollowMode,
		slot: ui.selectedAttachmentSlot,
		bone: ui.selectedAttachmentBone,
		useSpineDrawOrder: ui.attachmentTestUseSpineDrawOrder,
		boneOffset: ui.attachmentTestBoneOffsetEnabled
			? { x: ui.attachmentTestBoneOffsetX, y: ui.attachmentTestBoneOffsetY }
			: null,
	}
}
