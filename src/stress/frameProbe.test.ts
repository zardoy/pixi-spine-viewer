import { describe, expect, it } from 'vitest'

import { isClean, MountTracker, regionHasContent, summarise } from './frameProbe'

const W = 8

function canvas(fill: (x: number, y: number) => [number, number, number]): Uint8ClampedArray {
	const data = new Uint8ClampedArray(W * W * 4)
	for (let y = 0; y < W; y += 1) {
		for (let x = 0; x < W; x += 1) {
			const [r, g, b] = fill(x, y)
			const i = (y * W + x) * 4
			data[i] = r
			data[i + 1] = g
			data[i + 2] = b
			data[i + 3] = 255
		}
	}
	return data
}

describe('regionHasContent', () => {
	const rect = { x: 2, y: 2, width: 4, height: 4 }

	it('is false on a pure background region', () => {
		expect(regionHasContent(canvas(() => [0, 0, 0]), W, rect, [0, 0, 0])).toBe(false)
	})

	it('is true when enough pixels inside the rect differ', () => {
		const data = canvas((x, y) => (x >= 2 && x < 6 && y >= 2 && y < 6 ? [255, 255, 255] : [0, 0, 0]))
		expect(regionHasContent(data, W, rect, [0, 0, 0])).toBe(true)
	})

	it('ignores content outside the rect', () => {
		const data = canvas((x) => (x < 2 ? [255, 255, 255] : [0, 0, 0]))
		expect(regionHasContent(data, W, rect, [0, 0, 0])).toBe(false)
	})

	it('ignores a few stray pixels below minPixels and small colour noise', () => {
		const stray = canvas((x, y) => (x === 3 && y === 3 ? [255, 255, 255] : [0, 0, 0]))
		expect(regionHasContent(stray, W, rect, [0, 0, 0], 24, 4)).toBe(false)
		expect(regionHasContent(canvas(() => [10, 10, 10]), W, rect, [0, 0, 0])).toBe(false)
	})
})

describe('MountTracker', () => {
	it('counts zero blank frames when the first rendered frame already has content', () => {
		const t = new MountTracker()
		const r = t.beginMount('s', 'raf', 0, 5)
		t.onFrame(6, () => true)
		expect(r.blankFrames).toBe(0)
		expect(r.neverVisible).toBe(false)
	})

	it('counts every empty frame between the flip and the first content', () => {
		const t = new MountTracker()
		const r = t.beginMount('s', 'raf', 0, 5)
		t.onFrame(6, () => false)
		t.onFrame(7, () => false)
		t.onFrame(8, () => true)
		expect(r.blankFrames).toBe(2)
	})

	it('does not judge frames rendered before or at the flip frame', () => {
		const t = new MountTracker()
		const r = t.beginMount('s', 'raf', 0, 5)
		t.onFrame(5, () => false)
		expect(r.blankFrames).toBeNull()
		t.onFrame(6, () => true)
		expect(r.blankFrames).toBe(0)
	})

	it('flags mounts that never produce content', () => {
		const t = new MountTracker({ patienceFrames: 3 })
		const r = t.beginMount('s', 'raf', 0, 0)
		for (let f = 1; f <= 3; f += 1) t.onFrame(f, () => false)
		expect(r.neverVisible).toBe(true)
		expect(t.pending).toBe(0)
	})

	it('counts flicker after content first appeared, only inside the watch window', () => {
		const t = new MountTracker({ flickerWatchFrames: 3 })
		const r = t.beginMount('s', 'raf', 0, 0)
		t.onFrame(1, () => true)
		t.onFrame(2, () => false)
		t.onFrame(3, () => true)
		t.onFrame(4, () => true)
		t.onFrame(5, () => false)
		expect(r.flickerFrames).toBe(1)
	})

	it('stops tracking a cell once it is unmounted', () => {
		const t = new MountTracker()
		const r = t.beginMount('s', 'raf', 2, 0)
		t.endMount(2)
		t.onFrame(1, () => false)
		expect(r.blankFrames).toBeNull()
		expect(t.pending).toBe(0)
	})

	it('tracks several cells independently', () => {
		const t = new MountTracker()
		const a = t.beginMount('s', 'raf', 0, 0)
		const b = t.beginMount('s', 'raf', 1, 0)
		t.onFrame(1, (cell) => cell === 0)
		t.onFrame(2, () => true)
		expect(a.blankFrames).toBe(0)
		expect(b.blankFrames).toBe(1)
	})
})

describe('MountTracker callbacks', () => {
	it('reports each mount once, when its blank count becomes known', () => {
		const resolved: number[] = []
		const t = new MountTracker({ onResolved: (r) => resolved.push(r.blankFrames ?? -1) })
		t.beginMount('s', 'raf', 0, 0)
		t.onFrame(1, () => false)
		expect(resolved).toEqual([])
		t.onFrame(2, () => true)
		t.onFrame(3, () => true)
		expect(resolved).toEqual([1])
	})

	it('lists cells still waiting for content, only once a frame past the flip was rendered', () => {
		const t = new MountTracker()
		t.beginMount('s', 'raf', 3, 4)
		expect(t.awaitingContent(4)).toEqual([])
		expect(t.awaitingContent(5)).toEqual([3])
		t.onFrame(5, () => true)
		expect(t.awaitingContent(6)).toEqual([])
	})
})

describe('summarise / isClean', () => {
	it('groups by scenario + phase and reports clean only when every mount is clean', () => {
		const t = new MountTracker()
		const ok = t.beginMount('grid', 'raf', 0, 0)
		const bad = t.beginMount('grid', 'raf', 1, 0)
		t.onFrame(1, (cell) => cell === 0)
		t.onFrame(2, () => true)
		expect(ok.blankFrames).toBe(0)

		const [row] = summarise(t.records)
		expect(row).toMatchObject({
			scenario: 'grid',
			phase: 'raf',
			mounts: 2,
			cleanMounts: 1,
			blankMounts: 1,
			maxBlankFrames: 1,
		})
		expect(bad.blankFrames).toBe(1)
		expect(isClean(summarise(t.records))).toBe(false)
	})

	it('is clean when nothing blanked', () => {
		const t = new MountTracker()
		t.beginMount('a', 'raf', 0, 0)
		t.onFrame(1, () => true)
		expect(isClean(summarise(t.records))).toBe(true)
	})
})
