/**
 * Spine 4.3 loader for pixi-spine-viewer.
 * Spine 4.2 assets redirect to the legacy viewer (see spine42Redirect.ts).
 */
import type { TextureSource } from 'pixi.js'
import { ImageSource } from 'pixi.js'
import * as Core from '@esotericsoftware/spine-core'
import * as Pixi from '@esotericsoftware/spine-pixi-v8'
import { assertSpine43OrRedirect } from './spine42Redirect'

/** Installed @esotericsoftware/spine-core version (injected at bundle time via Vite define). */
export const SPINE_RUNTIME_PACKAGE_VERSION = __SPINE_RUNTIME_PACKAGE_VERSION__

export const SUPPORTED_SPINE_VERSIONS_TEXT = `Spine ${SPINE_RUNTIME_PACKAGE_VERSION}`

export type AnySpine = InstanceType<typeof Pixi.Spine>
export type AnySkeletonData = InstanceType<typeof Core.SkeletonData>
export type AnyAnimation = InstanceType<typeof Core.Animation>

export const spineCore = Core
export const spinePixi = Pixi

function versionFromSpineString(value: unknown): boolean {
  if (typeof value !== 'string') return false
  return value.startsWith('4.2')
}

/** Matches BinaryInput.readInt(optimizePositive=true) in spine-core. */
function readBinaryInt(data: Uint8Array, pos: { i: number }, optimizePositive = true): number {
  let b = data[pos.i++]
  let result = b & 0x7f
  if ((b & 0x80) !== 0) {
    b = data[pos.i++]
    result |= (b & 0x7f) << 7
    if ((b & 0x80) !== 0) {
      b = data[pos.i++]
      result |= (b & 0x7f) << 14
      if ((b & 0x80) !== 0) {
        b = data[pos.i++]
        result |= (b & 0x7f) << 21
        if ((b & 0x80) !== 0) {
          b = data[pos.i++]
          result |= (b & 0x7f) << 28
        }
      }
    }
  }
  return optimizePositive ? result : ((result >>> 1) ^ -(result & 1))
}

/** Matches BinaryInput.readString() in spine-core (modern .skel format). */
function readBinaryStringModern(data: Uint8Array, pos: { i: number }): string | null {
  const byteCount = readBinaryInt(data, pos, true)
  if (byteCount === 0) return null
  if (byteCount === 1) return ''
  let remaining = byteCount - 1
  const chars: string[] = []
  while (remaining > 0) {
    const b = data[pos.i++]
    remaining--
    const highNibble = b >> 4
    if (highNibble === 0x0c || highNibble === 0x0d) {
      const b2 = data[pos.i++]
      remaining--
      chars.push(String.fromCharCode(((b & 0x1f) << 6) | (b2 & 0x3f)))
    } else if (highNibble === 0x0e) {
      const b2 = data[pos.i++]
      const b3 = data[pos.i++]
      remaining -= 2
      chars.push(String.fromCharCode(((b & 0x0f) << 12) | ((b2 & 0x3f) << 6) | (b3 & 0x3f)))
    } else {
      chars.push(String.fromCharCode(b))
    }
  }
  return chars.join('')
}

function readVarint(data: Uint8Array, pos: { i: number }): number {
  let result = 0
  let shift = 0
  while (pos.i < data.length) {
    const b = data[pos.i++]
    result |= (b & 0x7f) << shift
    if ((b & 0x80) === 0) break
    shift += 7
  }
  return result
}

function readBinaryStringLegacy(data: Uint8Array, pos: { i: number }): string {
  const length = readVarint(data, pos)
  if (length === 0) return ''
  const start = pos.i
  pos.i += length
  return new TextDecoder().decode(data.subarray(start, start + length))
}

function readBinaryExportVersionStringModern(data: Uint8Array): string | null {
  if (data.length < 9) return null
  const pos = { i: 0 }
  pos.i += 8
  return readBinaryStringModern(data, pos)
}

function readBinaryExportVersionStringLegacy(data: Uint8Array): string | null {
  const pos = { i: 0 }
  readBinaryStringLegacy(data, pos)
  const version = readBinaryStringLegacy(data, pos)
  return version || null
}

function readBinaryExportVersionString(data: Uint8Array): string | null {
  const modern = readBinaryExportVersionStringModern(data)
  if (modern && (modern.startsWith('4.3') || modern.startsWith('4.2'))) return modern

  const legacy = readBinaryExportVersionStringLegacy(data)
  if (legacy && (legacy.startsWith('4.3') || legacy.startsWith('4.2'))) return legacy

  return modern ?? legacy
}

/** Raw `skeleton.spine` string from JSON or .skel header, when present. */
export function readSpineExportVersionString(
  input: string | Record<string, unknown> | ArrayBuffer | Uint8Array,
): string | null {
  if (input instanceof ArrayBuffer) {
    return readBinaryExportVersionString(new Uint8Array(input))
  }
  if (input instanceof Uint8Array) {
    return readBinaryExportVersionString(input)
  }
  const obj =
    typeof input === 'string'
      ? (JSON.parse(input) as Record<string, unknown>)
      : input
  const skeleton = obj.skeleton as Record<string, unknown> | undefined
  const spine = skeleton?.spine
  return typeof spine === 'string' ? spine : null
}

/** True when export metadata indicates Spine 4.2 (caller should redirect). */
export function isSpine42ExportInput(
  input: string | Record<string, unknown> | ArrayBuffer | Uint8Array,
): boolean {
  return versionFromSpineString(readSpineExportVersionString(input))
}

export interface LoadedSpineData {
  skeletonData: AnySkeletonData
  textureSources: TextureSource[]
}

export interface CreateSpineOptions {
  darkTint?: boolean
  boundsX?: number
  boundsY?: number
  boundsWidth?: number
  boundsHeight?: number
  boundsProvider?: unknown
}

async function buildTextureAtlas(
  atlasText: string,
  imageFiles: File[],
  log: (msg: string) => void,
): Promise<{ textureAtlas: Core.TextureAtlas; textureSources: TextureSource[] }> {
  log('Creating texture atlas from atlas text')
  const textureAtlas = new Core.TextureAtlas(atlasText)
  const textureSources: TextureSource[] = []

  for (const page of textureAtlas.pages) {
    log(`Looking for image for atlas page: "${page.name}"`)
    const pageBaseName = page.name.split('/').pop() || page.name
    const pageNameWithoutExt = pageBaseName.split('.')[0]

    const pageFile =
      imageFiles.find((f) => f.name === page.name) ||
      imageFiles.find((f) => f.name === pageBaseName) ||
      imageFiles.find((f) => {
        const fileName = f.name.toLowerCase()
        const baseName = fileName.split('.')[0]
        return baseName === pageNameWithoutExt.toLowerCase() || fileName.includes(pageNameWithoutExt.toLowerCase())
      })

    if (!pageFile) {
      throw new Error(
        `Missing atlas image for page "${page.name}". Include ${page.name} when loading (this atlas has ${textureAtlas.pages.length} page(s)).`,
      )
    }

    log(`Using image file: "${pageFile.name}" for atlas page: "${page.name}"`)

    const url = URL.createObjectURL(pageFile)
    try {
      const img = new Image()
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve()
        img.onerror = reject
        img.crossOrigin = 'anonymous'
        img.src = url
      })

      const alphaMode = page.pma ? 'premultiplied-alpha' : 'premultiply-alpha-on-upload'
      const imageSource = new ImageSource({
        resource: img,
        alphaMode: alphaMode as 'premultiplied-alpha' | 'premultiply-alpha-on-upload',
        autoGenerateMipmaps: true,
      })

      const spineTex = Pixi.SpineTexture.from(imageSource)
      page.setTexture(spineTex)
      textureSources.push(spineTex.texture.source)
    } finally {
      URL.revokeObjectURL(url)
    }
  }

  return { textureAtlas, textureSources }
}

function parseSkeletonData(
  json: string | Record<string, unknown> | ArrayBuffer | Uint8Array,
  textureAtlas: Core.TextureAtlas,
): AnySkeletonData {
  const atlasLoader = new Core.AtlasAttachmentLoader(textureAtlas)
  const isBinary = json instanceof ArrayBuffer || json instanceof Uint8Array

  if (isBinary) {
    const skeletonBinary = new Core.SkeletonBinary(atlasLoader)
    const binaryData = json instanceof ArrayBuffer ? new Uint8Array(json) : json
    return skeletonBinary.readSkeletonData(binaryData)
  }

  const skeletonJson = new Core.SkeletonJson(atlasLoader)
  const jsonData = typeof json === 'string' ? JSON.parse(json) : json
  return skeletonJson.readSkeletonData(jsonData)
}

/** Parse skeleton + atlas images (Spine 4.3 only; 4.2 redirects). */
export async function loadSpineDataFromFiles(
  json: string | Record<string, unknown> | ArrayBuffer | Uint8Array,
  atlasText: string,
  imageFiles: File[],
  debugLog?: (msg: string) => void,
): Promise<LoadedSpineData> {
  assertSpine43OrRedirect(json)

  const exportVersion = readSpineExportVersionString(json)
  const log = debugLog ?? (() => {})

  console.info(
    `[Spine] Detected export ${exportVersion ?? 'unknown'} → spine-core@${SPINE_RUNTIME_PACKAGE_VERSION}`,
  )
  log(`Using Spine ${SPINE_RUNTIME_PACKAGE_VERSION}`)

  const atlas = await buildTextureAtlas(atlasText, imageFiles, log)
  log('Creating atlas loader and parsing skeleton')
  const skeletonData = parseSkeletonData(json, atlas.textureAtlas)

  log(`Skeleton parsed: ${skeletonData.animations.length} animations`)
  const name = skeletonData.name ? ` "${skeletonData.name}"` : ''
  console.info(
    `[Spine] Loaded${name}: export ${exportVersion ?? 'unknown'} → spine-core@${SPINE_RUNTIME_PACKAGE_VERSION}, ${skeletonData.animations.length} animation(s)`,
  )

  return { skeletonData, textureSources: atlas.textureSources }
}

export function createSpineFromData(
  skeletonData: AnySkeletonData,
  options: CreateSpineOptions = {},
): AnySpine {
  let boundsProvider = options.boundsProvider
  if (
    !boundsProvider &&
    options.boundsX !== undefined &&
    options.boundsY !== undefined &&
    options.boundsWidth !== undefined &&
    options.boundsHeight !== undefined
  ) {
    boundsProvider = new Pixi.AABBRectangleBoundsProvider(
      options.boundsX,
      options.boundsY,
      options.boundsWidth,
      options.boundsHeight,
    )
  }

  return new Pixi.Spine({
    skeletonData,
    darkTint: options.darkTint,
    boundsProvider: boundsProvider as never,
  })
}
