import { FileSpineLoader } from '../lib/FileSpineLoader'

/**
 * Tiny in-memory rig for the remount stress test — no fixtures, no network, a single 64×64 page.
 *
 * `animated` hides the attachment in the setup pose and only reveals it through the `idle` / `blur`
 * attachment timelines, like the game rigs do. A spine that has not had a frame of `state.apply()`
 * therefore renders nothing, so a missing first-frame update shows up as a blank frame. `setup`
 * keeps the attachment in the setup pose and is the lenient control.
 */
export type RigKind = 'animated' | 'setup'

export const STRESS_SPINE_KEY = 'stress'
export const STRESS_ANIMATIONS = ['idle', 'blur'] as const
export const STRESS_SKINS = ['default', 'alt'] as const
export const STRESS_BOX_SIZE = 80

const ATLAS = `box.png
size:64,64
filter:Linear,Linear
box
bounds:0,0,64,32
box_alt
bounds:0,32,64,32
`

function skeletonJson(rig: RigKind): string {
	const attachment = { x: 0, y: 0, width: STRESS_BOX_SIZE, height: STRESS_BOX_SIZE }
	const reveal = { attachment: [{ time: 0, name: 'box' }] }
	return JSON.stringify({
		skeleton: { hash: 'stress', spine: '4.3', x: -50, y: -50, width: 100, height: 100, images: './' },
		bones: [{ name: 'root' }, { name: 'body', parent: 'root' }],
		slots: [rig === 'setup' ? { name: 'box', bone: 'body', attachment: 'box' } : { name: 'box', bone: 'body' }],
		skins: [
			{ name: 'default', attachments: { box: { box: { ...attachment, path: 'box' } } } },
			{ name: 'alt', attachments: { box: { box: { ...attachment, path: 'box_alt' } } } },
		],
		animations: {
			idle: {
				slots: { box: reveal },
				bones: {
					body: {
						rotate: [
							{ time: 0, value: 0 },
							{ time: 1, value: 90 },
							{ time: 2, value: 0 },
						],
					},
				},
			},
			blur: { slots: { box: reveal } },
		},
	})
}

/** White (`box`) over orange (`box_alt`) — both far from the black stage background. */
function drawAtlasPage(): HTMLCanvasElement {
	const canvas = document.createElement('canvas')
	canvas.width = 64
	canvas.height = 64
	const ctx = canvas.getContext('2d')!
	ctx.fillStyle = '#ffffff'
	ctx.fillRect(0, 0, 64, 32)
	ctx.fillStyle = '#ff8800'
	ctx.fillRect(0, 32, 64, 32)
	return canvas
}

/** Same pixels as the atlas `box` region, for the "baked sprite" half of the swap scenarios. */
export function drawBakedBox(): HTMLCanvasElement {
	const canvas = document.createElement('canvas')
	canvas.width = STRESS_BOX_SIZE
	canvas.height = STRESS_BOX_SIZE
	const ctx = canvas.getContext('2d')!
	ctx.fillStyle = '#ffffff'
	ctx.fillRect(0, 0, STRESS_BOX_SIZE, STRESS_BOX_SIZE)
	return canvas
}

export async function loadSyntheticSpine(rig: RigKind): Promise<FileSpineLoader> {
	const blob = await new Promise<Blob>((resolve, reject) =>
		drawAtlasPage().toBlob((b) => (b ? resolve(b) : reject(new Error('atlas toBlob failed'))), 'image/png'),
	)
	const loader = new FileSpineLoader(skeletonJson(rig), ATLAS, [
		new File([blob], 'box.png', { type: 'image/png' }),
	])
	await loader.loadSpine(STRESS_SPINE_KEY)
	return loader
}
