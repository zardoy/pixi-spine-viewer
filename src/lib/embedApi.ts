import type { SpineFiles } from '@/pages/Index'

export const EMBED_LOAD_MESSAGE = 'pixi-spine-viewer:load' as const
export const EMBED_READY_MESSAGE = 'pixi-spine-viewer:ready' as const
export const EMBED_LOADED_MESSAGE = 'pixi-spine-viewer:loaded' as const
export const EMBED_ERROR_MESSAGE = 'pixi-spine-viewer:error' as const

export type EmbedFileBase64 = { name: string; base64: string }
export type EmbedAtlasText = { name: string; text: string }

export type EmbedLoadPayload = {
  type: typeof EMBED_LOAD_MESSAGE
  files: {
    skeleton: EmbedFileBase64
    atlas: EmbedAtlasText
    images: EmbedFileBase64[]
    skeletonFiles?: EmbedFileBase64[]
  }
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes
}

function base64ToFile(base64: string, name: string): File {
  const bytes = base64ToBytes(base64)
  return new File([Uint8Array.from(bytes)], name, { type: 'application/octet-stream' })
}

export function embedPayloadToSpineFiles(payload: EmbedLoadPayload['files']): SpineFiles {
  const jsonFile = base64ToFile(payload.skeleton.base64, payload.skeleton.name)
  const atlasFile = new File([payload.atlas.text], payload.atlas.name, { type: 'text/plain' })
  const imageFiles = payload.images.map((image) => base64ToFile(image.base64, image.name))
  const skeletonFiles = payload.skeletonFiles?.map((file) => base64ToFile(file.base64, file.name))

  return {
    jsonFile,
    atlasFile,
    imageFiles,
    skeletonFiles: skeletonFiles?.length ? skeletonFiles : undefined,
  }
}

export function postEmbedReady() {
  window.parent.postMessage({ type: EMBED_READY_MESSAGE }, '*')
}

export function postEmbedLoaded() {
  window.parent.postMessage({ type: EMBED_LOADED_MESSAGE }, '*')
}

export function postEmbedError(message: string) {
  window.parent.postMessage({ type: EMBED_ERROR_MESSAGE, message }, '*')
}
