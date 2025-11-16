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
 * Try to download all necessary Spine files from a base URL
 */
export async function fetchSpineFilesFromUrl(inputUrl: string): Promise<FetchedSpineFiles> {
  const baseUrl = getBaseUrl(inputUrl);
  const baseFilename = baseUrl.split('/').pop() || 'spine';

  // 1. Try to fetch JSON file
  let jsonFile: File | null = null;
  const jsonUrl = `${baseUrl}.json`;
  jsonFile = await fetchFile(jsonUrl, `${baseFilename}.json`);

  if (!jsonFile) {
    throw new Error('Failed to fetch .json file. Make sure the URL is correct.');
  }

  // 2. Try to fetch Atlas file
  let atlasFile: File | null = null;
  for (const ext of ATLAS_EXTENSIONS) {
    const atlasUrl = `${baseUrl}.${ext}`;
    atlasFile = await fetchFile(atlasUrl, `${baseFilename}.${ext}`);
    if (atlasFile) break;
  }

  if (!atlasFile) {
    throw new Error('Failed to fetch .atlas file. Tried extensions: ' + ATLAS_EXTENSIONS.join(', '));
  }

  // 3. Try to fetch image files
  const imageFiles: File[] = [];
  for (const ext of IMAGE_EXTENSIONS) {
    const imageUrl = `${baseUrl}.${ext}`;
    const imageFile = await fetchFile(imageUrl, `${baseFilename}.${ext}`);
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
    new URL(url);
    return /\.(json|atlas|png|webp|jpg|jpeg)$/i.test(url);
  } catch {
    return false;
  }
}
