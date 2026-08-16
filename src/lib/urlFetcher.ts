/**
 * URL Fetcher - Download Spine files from URLs
 *
 * This utility attempts to download .json/.skel, .atlas, and image files from a base URL
 * by trying different extensions. Supports pasting any file URL and automatically
 * finding the related files.
 */

const IMAGE_EXTENSIONS = ['png', 'webp', 'jpg', 'jpeg'];
const ATLAS_EXTENSIONS = ['atlas', 'atlas.txt'];
const SKELETON_EXTENSIONS = ['json', 'skel'];

export interface FetchedSpineFiles {
  jsonFile: File;
  atlasFile: File;
  imageFiles: File[];
}

/**
 * Extract directory URL (no filename) from a file URL.
 */
function getDirectoryFromUrl(url: string): string {
  const clean = url.split('?')[0].split('#')[0];
  const idx = clean.lastIndexOf('/');
  return idx >= 0 ? clean.slice(0, idx) : '';
}

/** Basename from a URL path (strips query/hash). */
export function filenameFromUrl(url: string): string {
  const clean = url.split('?')[0].split('#')[0];
  return clean.split('/').pop() || '';
}

/**
 * Filename for an atlas page image when building File objects from fetched blobs.
 * Prefers atlas page names, then the URL basename, then generic spineN.png fallbacks.
 */
export function resolveAtlasImageFilename(
  imageUrl: string,
  index: number,
  atlasPageNames: string[],
): string {
  const pageName = atlasPageNames[index];
  if (pageName) return pageName;

  const fromUrl = filenameFromUrl(imageUrl);
  if (/\.(png|jpg|jpeg|webp)$/i.test(fromUrl)) return fromUrl;

  return index === 0 ? 'spine.png' : `spine${index + 1}.png`;
}

/** Image page names from atlas text (top-level lines ending in image extension). */
export function parseAtlasPageNames(atlasText: string): string[] {
  const names: string[] = [];
  for (const line of atlasText.split(/\r?\n/)) {
    if (!line.trim()) continue;
    if (line.startsWith(' ') || line.startsWith('\t')) continue;
    const trimmed = line.trim();
    if (/\.(png|jpg|jpeg|webp)$/i.test(trimmed)) {
      names.push(trimmed);
    }
  }
  return names;
}

/**
 * Decode query param values that may have been encoded more than once.
 */
export function decodeQueryParam(value: string): string {
  let decoded = value;
  for (let i = 0; i < 3; i++) {
    try {
      const next = decodeURIComponent(decoded);
      if (next === decoded) break;
      decoded = next;
    } catch {
      break;
    }
  }
  return decoded;
}

/**
 * Extract base URL without extension
 */
function getBaseUrl(url: string): string {
  // Remove query parameters
  const cleanUrl = url.split('?')[0].split('#')[0];
  // Remove extension
  return cleanUrl.replace(/\.(json|skel|atlas|atlas\.txt|png|webp|jpg|jpeg)$/i, '');
}

/**
 * Fetch a file from URL and convert to File object
 */
async function fetchFile(url: string, filename: string): Promise<File | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      return null;
    }
    const blob = await response.blob();
    return new File([blob], filename, { type: blob.type });
  } catch (error) {
    console.debug(`Failed to fetch ${url}:`, error);
    return null;
  }
}

/**
 * Try to download all necessary Spine files from URLs.
 *
 * - inputUrl: URL to any of the spine files (usually the JSON or .skel)
 * - atlasUrlOverride: optional explicit atlas URL (for cases like dragon-ess.json + dragon.atlas)
 * - pngUrlOverride: optional explicit PNG/image URL(s) - can be string or array of strings for multiple images
 */
export async function fetchSpineFilesFromUrl(
  inputUrl: string,
  atlasUrlOverride?: string,
  pngUrlOverride?: string | string[]
): Promise<FetchedSpineFiles> {
  const skeletonBaseUrl = getBaseUrl(inputUrl);
  const skeletonBaseFilename = skeletonBaseUrl.split('/').pop() || 'spine';

  // 1. Try to fetch skeleton file (.json or .skel)
  let jsonFile: File | null = null;
  for (const ext of SKELETON_EXTENSIONS) {
    const skeletonUrl = `${skeletonBaseUrl}.${ext}`;
    jsonFile = await fetchFile(skeletonUrl, `${skeletonBaseFilename}.${ext}`);
    if (jsonFile) break;
  }

  if (!jsonFile) {
    throw new Error('Failed to fetch .json or .skel file. Make sure the URL is correct.');
  }

  // 2. Try to fetch Atlas file
  let atlasFile: File | null = null;
  let atlasUrlUsed: string | null = null;
  // If override provided, use its base; otherwise derive from skeleton base
  const atlasBaseUrl = atlasUrlOverride ? getBaseUrl(atlasUrlOverride) : skeletonBaseUrl;
  const atlasBaseFilename = atlasBaseUrl.split('/').pop() || skeletonBaseFilename;
  for (const ext of ATLAS_EXTENSIONS) {
    const atlasUrl = `${atlasBaseUrl}.${ext}`;
    atlasFile = await fetchFile(atlasUrl, `${atlasBaseFilename}.${ext}`);
    if (atlasFile) {
      atlasUrlUsed = atlasUrl;
      break;
    }
  }

  if (!atlasFile || !atlasUrlUsed) {
    throw new Error('Failed to fetch .atlas file. Tried extensions: ' + ATLAS_EXTENSIONS.join(', '));
  }

  // 3. Fetch all atlas page images (multi-page atlases e.g. dragon_2.png …)
  const atlasText = await atlasFile.text();
  const pageNames = parseAtlasPageNames(atlasText);
  const atlasDir = getDirectoryFromUrl(atlasUrlUsed);
  const imageFiles: File[] = [];

  if (pageNames.length > 0) {
    for (const pageName of pageNames) {
      const imageUrl = `${atlasDir}/${pageName}`;
      const imageFile = await fetchFile(imageUrl, pageName);
      if (!imageFile) {
        throw new Error(`Failed to fetch atlas image "${pageName}" from ${imageUrl}`);
      }
      imageFiles.push(imageFile);
    }
  } else if (pngUrlOverride) {
    const pngUrls = Array.isArray(pngUrlOverride) ? pngUrlOverride : [pngUrlOverride];
    for (let i = 0; i < pngUrls.length; i++) {
      const pngUrl = pngUrls[i];
      const filename =
        i === 0 ? `${atlasBaseFilename}.png` : `${atlasBaseFilename}${i + 1}.png`;
      const pngFile = await fetchFile(pngUrl, filename);
      if (pngFile) imageFiles.push(pngFile);
    }
  } else {
    for (const ext of IMAGE_EXTENSIONS) {
      const imageUrl = `${atlasBaseUrl}.${ext}`;
      const imageFile = await fetchFile(imageUrl, `${atlasBaseFilename}.${ext}`);
      if (imageFile) {
        imageFiles.push(imageFile);
        break;
      }
    }
  }

  if (imageFiles.length === 0) {
    throw new Error('Failed to fetch any atlas image files.');
  }

  return {
    jsonFile,
    atlasFile,
    imageFiles,
  };
}

/**
 * Validate if URL looks like a valid Spine asset URL
 */
export function isValidSpineUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const clean = parsed.origin + parsed.pathname; // strip query/hash
    return /\.(json|skel|atlas|png|webp|jpg|jpeg)$/i.test(clean);
  } catch {
    return false;
  }
}
