/**
 * Example Spine animations from spine-runtimes (4.3 loads in this viewer).
 */
import { buildSpine42ViewerUrlFromSpineUrls } from './spine42Redirect'
import { fetchSpineFilesFromUrl } from './urlFetcher'
import type { SpineFiles } from '../pages/Index'

export interface SpineExample {
  name: string
  jsonUrl: string
  atlasUrl: string
  pngUrls: string[]
  description: string
  spineVersion: '4.2' | '4.3'
}

const BASE_43 =
  'https://raw.githubusercontent.com/EsotericSoftware/spine-runtimes/4.3/examples'

export const SPINE_EXAMPLES: SpineExample[] = [
  {
    name: 'Cloud Pot (physics)',
    jsonUrl: `${BASE_43}/cloud-pot/export/cloud-pot.json`,
    atlasUrl: `${BASE_43}/cloud-pot/export/cloud-pot.atlas`,
    pngUrls: [`${BASE_43}/cloud-pot/export/cloud-pot.png`],
    description: 'Animated cloud pot',
    spineVersion: '4.3',
  },
  {
    name: 'Dragon',
    jsonUrl: `${BASE_43}/dragon/export/dragon-ess.json`,
    atlasUrl: `${BASE_43}/dragon/export/dragon.atlas`,
    pngUrls: [`${BASE_43}/dragon/export/dragon.png`],
    description: 'Flying dragon',
    spineVersion: '4.3',
  },
  {
    name: 'Owl (texture transform)',
    jsonUrl: `${BASE_43}/owl/export/owl-pro.json`,
    atlasUrl: `${BASE_43}/owl/export/owl.atlas`,
    pngUrls: [`${BASE_43}/owl/export/owl.png`],
    description: 'Animated owl',
    spineVersion: '4.3',
  },
  {
    name: 'Powerup',
    jsonUrl: `${BASE_43}/powerup/export/powerup-ess.json`,
    atlasUrl: `${BASE_43}/powerup/export/powerup.atlas`,
    pngUrls: [`${BASE_43}/powerup/export/powerup.png`],
    description: 'Power-up animation effect',
    spineVersion: '4.3',
  },
  {
    name: 'Vine',
    jsonUrl: `${BASE_43}/vine/export/vine-pro.json`,
    atlasUrl: `${BASE_43}/vine/export/vine.atlas`,
    pngUrls: [`${BASE_43}/vine/export/vine.png`],
    description: 'Growing vine animation',
    spineVersion: '4.3',
  },
]

/** Open a 4.2 example on the legacy viewer deployment. */
export function openSpineExample(example: SpineExample): void {
  if (example.spineVersion === '4.2') {
    window.location.href = buildSpine42ViewerUrlFromSpineUrls(
      example.jsonUrl,
      example.atlasUrl,
      example.pngUrls,
    )
    return
  }
  throw new Error('Use loadSpineExampleFiles() for 4.3 examples.')
}

/** Fetch example assets and return SpineFiles for this viewer. */
export async function loadSpineExampleFiles(example: SpineExample): Promise<SpineFiles> {
  const files = await fetchSpineFilesFromUrl(example.jsonUrl, example.atlasUrl, example.pngUrls)
  return {
    jsonFile: files.jsonFile,
    atlasFile: files.atlasFile,
    imageFiles: files.imageFiles,
  }
}

export function buildExampleViewerSearchParams(example: SpineExample): URLSearchParams {
  const params = new URLSearchParams()
  params.set('jsonUrl', example.jsonUrl)
  params.set('atlasUrl', example.atlasUrl)
  example.pngUrls.forEach((url, index) => {
    params.set(index === 0 ? 'pngUrl' : `pngUrl${index + 1}`, url)
  })
  return params
}
