import JSZip from 'jszip'
import { skeletonDataToJson, parseAtlasPageNames } from '@/spine-toolbox'
import type { SpineFiles } from '@/pages/Index'
import type { AnySkeletonData } from '@/lib/spineRuntime'

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

function zipBaseName(files: SpineFiles): string {
  return files.jsonFile.name.replace(/\.(json|skel)$/i, '')
}

async function addSpineFilesToZip(
  zip: JSZip,
  files: SpineFiles,
  skeletonFileName: string,
  skeletonContent: string | ArrayBuffer,
  customEvents?: Record<string, Record<string, number>>,
): Promise<void> {
  zip.file(skeletonFileName, skeletonContent)

  const atlasText = await files.atlasFile.text()
  zip.file(files.atlasFile.name, atlasText)

  const imageNames = parseAtlasPageNames(atlasText)
  for (let i = 0; i < files.imageFiles.length; i++) {
    const imageFile = files.imageFiles[i]
    const imageName = imageNames[i] || imageFile.name
    const imageContent = await imageFile.arrayBuffer()
    zip.file(imageName, imageContent)
  }

  if (customEvents && Object.keys(customEvents).length > 0) {
    zip.file('custom.json', JSON.stringify({ customEvents }, null, 2))
  }
}

export function isSkelSkeletonFile(files: SpineFiles): boolean {
  return files.jsonFile.name.toLowerCase().endsWith('.skel')
}

/** Download skeleton + atlas + images as a ZIP (skeleton file unchanged). */
export async function downloadSpineFilesZip(
  files: SpineFiles,
  customEvents?: Record<string, Record<string, number>>,
): Promise<void> {
  const zip = new JSZip()
  const skeletonContent = await files.jsonFile.arrayBuffer()
  await addSpineFilesToZip(zip, files, files.jsonFile.name, skeletonContent, customEvents)
  const zipBlob = await zip.generateAsync({ type: 'blob' })
  triggerBlobDownload(zipBlob, `${zipBaseName(files)}.zip`)
}

/** Download ZIP with .skel converted to .json (atlas + images unchanged). */
export async function downloadSpineZipWithSkelToJson(
  files: SpineFiles,
  skeletonData: AnySkeletonData,
  customEvents?: Record<string, Record<string, number>>,
): Promise<void> {
  const jsonObj = skeletonDataToJson(skeletonData)
  const jsonStr = JSON.stringify(jsonObj, null, 2)
  const jsonName = files.jsonFile.name.replace(/\.skel$/i, '.json')
  const zip = new JSZip()
  await addSpineFilesToZip(zip, files, jsonName, jsonStr, customEvents)
  const zipBlob = await zip.generateAsync({ type: 'blob' })
  triggerBlobDownload(zipBlob, `${zipBaseName(files)}.zip`)
}
