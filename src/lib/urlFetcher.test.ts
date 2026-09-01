import { describe, expect, it } from 'vitest'
import { parseAtlasPageNames, resolveAtlasImageFilename } from './urlFetcher'

describe('resolveAtlasImageFilename', () => {
  it('uses atlas page name when available', () => {
    const atlas = 'a.webp\nsize: 512,512\n'
    const pageNames = parseAtlasPageNames(atlas)
    expect(resolveAtlasImageFilename('http://127.0.0.1:59922/asset/lowpay-a/a.webp', 0, pageNames)).toBe(
      'a.webp',
    )
  })

  it('falls back to URL basename when atlas has no page names', () => {
    expect(
      resolveAtlasImageFilename('http://example.com/textures/hero.webp?v=1', 0, []),
    ).toBe('hero.webp')
  })

  it('uses generic spineN.png names as last resort', () => {
    expect(resolveAtlasImageFilename('http://example.com/image', 0, [])).toBe('spine.png')
    expect(resolveAtlasImageFilename('http://example.com/image', 1, [])).toBe('spine2.png')
  })
})
