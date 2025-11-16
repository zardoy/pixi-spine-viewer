/**
 * URL Fetcher - Download Spine files from URLs
 *
 * This utility attempts to download .json, .atlas, and image files from a base URL
 * by trying different extensions. Supports pasting any file URL and automatically
 * finding the related files.
 */

const IMAGE_EXTENSIONS = ['png', 'webp', 'jpg', 'jpeg'];
const ATLAS_EXTENSIONS = ['atlas', 'atlas.txt'];

export interface FetchedSpineFiles {
  jsonFile: File;
  atlasFile: File;
  imageFiles: File[];
}

/**
 * Extract base URL without extension
 */
function getBaseUrl(url: string): string {
  // Remove query parameters
  const cleanUrl = url.split('?')[0].split('#')[0];
  // Remove extension
  return cleanUrl.replace(/\.(json|atlas|atlas\.txt|png|webp|jpg|jpeg)$/i, '');
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
 * - inputUrl: URL to any of the spine files (usually the JSON)
 * - atlasUrlOverride: optional explicit atlas URL (for cases like dragon-ess.json + dragon.atlas)
 */
export async function fetchSpineFilesFromUrl(
  inputUrl: string,
  atlasUrlOverride?: string
): Promise<FetchedSpineFiles> {
  const jsonBaseUrl = getBaseUrl(inputUrl);
  const jsonBaseFilename = jsonBaseUrl.split('/').pop() || 'spine';

  // 1. Try to fetch JSON file
  let jsonFile: File | null = null;
  const jsonUrl = `${jsonBaseUrl}.json`;
  jsonFile = await fetchFile(jsonUrl, `${jsonBaseFilename}.json`);

  if (!jsonFile) {
    throw new Error('Failed to fetch .json file. Make sure the URL is correct.');
  }

  // 2. Try to fetch Atlas file
  let atlasFile: File | null = null;
  // If override provided, use its base; otherwise derive from JSON base
  const atlasBaseUrl = atlasUrlOverride ? getBaseUrl(atlasUrlOverride) : jsonBaseUrl;
  const atlasBaseFilename = atlasBaseUrl.split('/').pop() || jsonBaseFilename;
  for (const ext of ATLAS_EXTENSIONS) {
    const atlasUrl = `${atlasBaseUrl}.${ext}`;
    atlasFile = await fetchFile(atlasUrl, `${atlasBaseFilename}.${ext}`);
    if (atlasFile) break;
  }

  if (!atlasFile) {
    throw new Error('Failed to fetch .atlas file. Tried extensions: ' + ATLAS_EXTENSIONS.join(', '));
  }

  // 3. Try to fetch image files (use atlas base if available, it usually matches texture name)
  const imageFiles: File[] = [];
  for (const ext of IMAGE_EXTENSIONS) {
    const imageUrl = `${atlasBaseUrl}.${ext}`;
    const imageFile = await fetchFile(imageUrl, `${atlasBaseFilename}.${ext}`);
    if (imageFile) {
      imageFiles.push(imageFile);
      break; // Use first found image
    }
  }

  if (imageFiles.length === 0) {
    throw new Error('Failed to fetch any image files. Tried extensions: ' + IMAGE_EXTENSIONS.join(', '));
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
    return /\.(json|atlas|png|webp|jpg|jpeg)$/i.test(clean);
  } catch {
    return false;
  }
}
