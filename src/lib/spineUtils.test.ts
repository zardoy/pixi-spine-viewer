import { describe, expect, it } from 'vitest'
import {
  buildSpineScreenshotFilename,
  parseSpineScreenshotFilename,
  type SpineScreenshotFilenameFields,
} from './spineUtils'

const wheelIdleFields: SpineScreenshotFilenameFields = {
  base: 'wheel_1',
  anim: 'idle',
  skin: 'default',
  mode: 'ff',
  frame: 0,
  scale: 1,
  width: 456,
  height: 466,
  hash: '65a63f8',
  date: '2026-05-22',
}

describe('buildSpineScreenshotFilename', () => {
  it('keeps underscores inside base/anim/skin via __ segment delimiter', () => {
    const filename = buildSpineScreenshotFilename(wheelIdleFields)
    expect(filename).toBe(
      'wheel_1__idle__default__ff__f0000__1x__456x466__65a63f8__2026-05-22.png',
    )
    expect(filename.split('_')).not.toEqual(
      filename.replace('.png', '').split('__'),
    )
  })

  it('sanitizes spaces and collapses __ in variable parts', () => {
    const filename = buildSpineScreenshotFilename({
      ...wheelIdleFields,
      base: 'wheel 1',
      anim: 'idle__loop',
    })
    expect(filename.startsWith('wheel_1__idle_loop__')).toBe(true)
    expect(filename.includes('___')).toBe(false)
  })
})

describe('parseSpineScreenshotFilename', () => {
  it('round-trips wheel_1_idle export names', () => {
    const filename = buildSpineScreenshotFilename(wheelIdleFields)
    expect(parseSpineScreenshotFilename(filename)).toEqual(wheelIdleFields)
  })

  it('rejects legacy single-underscore filenames', () => {
    const legacy = 'wheel_1_idle_ff_1x_456x466_65a63f8_2026-05-22.png'
    expect(parseSpineScreenshotFilename(legacy)).toBeNull()
  })

  it('rejects browser duplicate suffixes like " 1"', () => {
    const filename = `${buildSpineScreenshotFilename(wheelIdleFields).replace('.png', '')} 1.png`
    expect(parseSpineScreenshotFilename(filename)).toBeNull()
  })
})
