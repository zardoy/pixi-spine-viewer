/**
 * Example Spine animations (4.2 — open on legacy viewer).
 */
import { buildSpine42ViewerUrlFromSpineUrls } from './spine42Redirect'

export interface SpineExample {
  name: string
  jsonUrl: string
  atlasUrl: string
  pngUrls: string[]
  description: string
  /** Opens on pixi-spine-viewer-42 instead of this app. */
  spineVersion: '4.2'
}

const BASE = 'https://raw.githubusercontent.com/EsotericSoftware/spine-runtimes/4.2/examples'

export const SPINE_EXAMPLES: SpineExample[] = [
  {
    name: 'Cloud Pot (physics)',
    jsonUrl: `${BASE}/cloud-pot/export/cloud-pot.json`,
    atlasUrl: `${BASE}/cloud-pot/export/cloud-pot.atlas`,
    pngUrls: [`${BASE}/cloud-pot/export/cloud-pot.png`],
    description: 'Animated cloud pot',
    spineVersion: '4.2',
  },
  {
    name: 'Dragon',
    jsonUrl: `${BASE}/dragon/export/dragon-ess.json`,
    atlasUrl: `${BASE}/dragon/export/dragon.atlas`,
    pngUrls: [`${BASE}/dragon/export/dragon.png`],
    description: 'Flying dragon',
    spineVersion: '4.2',
  },
  {
    name: 'Owl (texture transform)',
    jsonUrl: `${BASE}/owl/export/owl-pro.json`,
    atlasUrl: `${BASE}/owl/export/owl.atlas`,
    pngUrls: [`${BASE}/owl/export/owl.png`],
    description: 'Animated owl',
    spineVersion: '4.2',
  },
  {
    name: 'Powerup',
    jsonUrl: `${BASE}/powerup/export/powerup-ess.json`,
    atlasUrl: `${BASE}/powerup/export/powerup.atlas`,
    pngUrls: [`${BASE}/powerup/export/powerup.png`],
    description: 'Power-up animation effect',
    spineVersion: '4.2',
  },
  {
    name: 'Vine',
    jsonUrl: `${BASE}/vine/export/vine-pro.json`,
    atlasUrl: `${BASE}/vine/export/vine.atlas`,
    pngUrls: [`${BASE}/vine/export/vine.png`],
    description: 'Growing vine animation',
    spineVersion: '4.2',
  },
]

/** Open an example on the correct viewer (4.2 examples → legacy deployment). */
export function openSpineExample(example: SpineExample): void {
  if (example.spineVersion === '4.2') {
    window.location.href = buildSpine42ViewerUrlFromSpineUrls(
      example.jsonUrl,
      example.atlasUrl,
      example.pngUrls,
    )
    return
  }
  throw new Error('Only 4.2 examples are defined; add 4.3 examples to load in this viewer.')
}
