import { describe, expect, it } from 'vitest'
import { scanSpinesFromWebkitRelativePaths, spineFilesFromFolderFiles } from './localSpineFolderScan'

describe('localSpineFolderScan', () => {
  it('groups webkitRelativePath files by subfolder', () => {
    const heroSkel = new File(['skel'], 'hero.skel')
    const heroAtlas = new File(['atlas'], 'hero.atlas')
    const heroPng = new File(['png'], 'hero.png')
    Object.defineProperty(heroSkel, 'webkitRelativePath', { value: 'pack/hero/hero.skel' })
    Object.defineProperty(heroAtlas, 'webkitRelativePath', { value: 'pack/hero/hero.atlas' })
    Object.defineProperty(heroPng, 'webkitRelativePath', { value: 'pack/hero/hero.png' })

    const wolfSkel = new File(['skel'], 'wolf.skel')
    const wolfAtlas = new File(['atlas'], 'wolf.atlas')
    const wolfPng = new File(['png'], 'wolf.png')
    Object.defineProperty(wolfSkel, 'webkitRelativePath', { value: 'pack/wolf/wolf.skel' })
    Object.defineProperty(wolfAtlas, 'webkitRelativePath', { value: 'pack/wolf/wolf.atlas' })
    Object.defineProperty(wolfPng, 'webkitRelativePath', { value: 'pack/wolf/wolf.png' })

    const entries = scanSpinesFromWebkitRelativePaths([
      heroSkel,
      heroAtlas,
      heroPng,
      wolfSkel,
      wolfAtlas,
      wolfPng,
    ])

    expect(entries).toHaveLength(2)
    expect(entries.map((e) => e.name).sort()).toEqual(['hero', 'wolf'])
  })

  it('requires skeleton, atlas, and image', () => {
    const files = [new File(['x'], 'a.skel'), new File(['y'], 'a.atlas')]
    expect(spineFilesFromFolderFiles(files, 'a', 'a')).toBeNull()
  })
})
