import { FileSpineLoader } from './FileSpineLoader'
import type { SpineFiles } from '../pages/Index'

/**
 * Load spine files from disk into a {@link FileSpineLoader} for map tile previews.
 */
export async function loadLocalSpinePreview(
  files: SpineFiles,
  spineKey: string,
): Promise<FileSpineLoader> {
  const { jsonFile, atlasFile, imageFiles } = files
  const isSkel = jsonFile.name.toLowerCase().endsWith('.skel')
  const skeletonData = isSkel ? await jsonFile.arrayBuffer() : await jsonFile.text()
  const atlasText = await atlasFile.text()
  const spineLoader = new FileSpineLoader(skeletonData, atlasText, imageFiles)
  await spineLoader.loadSpine(spineKey)
  return spineLoader
}

/**
 * Fetch .json/.skel + .atlas + image URLs and load into a {@link FileSpineLoader}
 * under the given spine key (must be unique per mounted spine in a shared PIXI app).
 */
export async function fetchAndLoadSpinePreview(
  jsonUrl: string,
  atlasUrl: string,
  pngUrls: string[],
  spineKey: string,
): Promise<FileSpineLoader> {
  if (pngUrls.length === 0) {
    throw new Error('At least one PNG URL is required')
  }

  const responses = await Promise.all([
    fetch(jsonUrl),
    fetch(atlasUrl),
    ...pngUrls.map((url) => fetch(url)),
  ])

  if (!responses[0].ok || !responses[1].ok || responses.slice(2).some((r) => !r.ok)) {
    throw new Error('Failed to fetch spine files')
  }

  const blobs = await Promise.all(responses.map((r) => r.blob()))

  const jsonFile = new File([blobs[0]], 'spine.json', { type: 'application/json' })
  const atlasFile = new File([blobs[1]], 'spine.atlas', { type: 'text/plain' })
  const imageFiles = blobs.slice(2).map((blob, i) =>
    new File([blob], `spine${i > 0 ? i + 1 : ''}.png`, {
      type: blob.type || 'image/png',
    }),
  )

  const isSkel = jsonUrl.toLowerCase().endsWith('.skel')
  const skeletonData = isSkel ? await jsonFile.arrayBuffer() : await jsonFile.text()
  const atlasText = await atlasFile.text()

  const spineLoader = new FileSpineLoader(skeletonData, atlasText, imageFiles)
  await spineLoader.loadSpine(spineKey)
  return spineLoader
}
