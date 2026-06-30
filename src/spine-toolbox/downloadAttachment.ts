/**
 * Parse Spine atlas format to extract region names and their page/bounds.
 * Returns list of { name, pageName, bounds, rotate } for each region.
 */
export interface AtlasRegionInfo {
  name: string;
  pageName: string;
  /** Raw bounds from the atlas file (packed logical size). */
  bounds: { x: number; y: number; width: number; height: number };
  rotate: boolean; // true when degrees is 90
  /** Rotation in degrees stored in the atlas (0, 90, 180, 270, …). */
  degrees: number;
  index: number; // for multi-frame regions
}

/**
 * Axis-aligned rectangle this region occupies on the atlas page image.
 * The rotate flag only affects pixel orientation inside this slot — never
 * apply a visual rotation to the highlight; always use the atlas bounds as-is.
 */
export function getAtlasPageAabb(region: AtlasRegionInfo): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  return { ...region.bounds };
}

function applyRegionProperties(region: Partial<AtlasRegionInfo>, line: string): void {
  const boundsMatch = line.match(/bounds:\s*(\d+),\s*(\d+),\s*(\d+),\s*(\d+)/);
  if (boundsMatch) {
    region.bounds = {
      x: parseInt(boundsMatch[1], 10),
      y: parseInt(boundsMatch[2], 10),
      width: parseInt(boundsMatch[3], 10),
      height: parseInt(boundsMatch[4], 10),
    };
  }

  const rotateMatch = line.match(/rotate:\s*(true|false|\d+)/);
  if (rotateMatch) {
    const value = rotateMatch[1];
    const degrees =
      value === 'true' ? 90 : value === 'false' ? 0 : parseInt(value, 10) || 0;
    region.degrees = degrees;
    region.rotate = degrees === 90;
  }

  const xyMatch = line.match(/xy:\s*(\d+),\s*(\d+)/);
  if (xyMatch) {
    const x = parseInt(xyMatch[1], 10);
    const y = parseInt(xyMatch[2], 10);
    region.bounds = {
      x,
      y,
      width: region.bounds?.width ?? 0,
      height: region.bounds?.height ?? 0,
    };
  }

  const sizeMatch = line.match(/size:\s*(\d+),\s*(\d+)/);
  if (sizeMatch) {
    region.bounds = {
      x: region.bounds?.x ?? 0,
      y: region.bounds?.y ?? 0,
      width: parseInt(sizeMatch[1], 10),
      height: parseInt(sizeMatch[2], 10),
    };
  }

  const indexMatch = line.match(/index:\s*(-?\d+)/);
  if (indexMatch) {
    region.index = parseInt(indexMatch[1], 10);
  }
}

export function findAtlasPageImage(pageName: string, imageFiles: File[]): File | undefined {
  const pageBaseName = pageName.split('/').pop() || pageName;
  return (
    imageFiles.find(
      (f) =>
        f.name === pageName ||
        f.name === pageBaseName ||
        f.name.toLowerCase() === pageBaseName.toLowerCase()
    ) ?? imageFiles[0]
  );
}

/** Ordered atlas page image filenames from atlas text. */
export function parseAtlasPageNames(atlasText: string): string[] {
  const lines = atlasText.split('\n');
  const pageNames: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (/\.(png|jpg|jpeg|webp)$/i.test(line)) {
      const nextLine = i + 1 < lines.length ? lines[i + 1].trim() : '';
      if (nextLine.startsWith('size:')) {
        pageNames.push(line);
      }
    }
  }
  return pageNames;
}

export function parseAtlasRegions(atlasText: string): AtlasRegionInfo[] {
  const regions: AtlasRegionInfo[] = [];
  const lines = atlasText.split('\n');
  let currentPageName = '';
  let currentRegion: Partial<AtlasRegionInfo> | null = null;
  let inPageProperties = false;

  const flushRegion = () => {
    if (currentRegion?.name && currentRegion.bounds) {
      const degrees = currentRegion.degrees ?? 0;
      regions.push({
        name: currentRegion.name,
        pageName: currentPageName,
        bounds: currentRegion.bounds,
        rotate: degrees === 90,
        degrees,
        index: currentRegion.index ?? -1,
      });
    }
    currentRegion = null;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line === '') {
      flushRegion();
      if (currentPageName && inPageProperties) inPageProperties = false;
      continue;
    }

    const isImageFile = /\.(png|jpg|jpeg|webp)$/i.test(line);
    if (isImageFile && line !== currentPageName) {
      flushRegion();
      currentPageName = line;
      inPageProperties = true;
      continue;
    }

    if (currentPageName && inPageProperties) {
      if (line.match(/^(size|format|filter|repeat|pma):/)) continue;
      inPageProperties = false;
    }

    if (currentPageName && !line.includes(':')) {
      flushRegion();
      currentRegion = {
        name: line,
        pageName: currentPageName,
        bounds: undefined as any,
        rotate: false,
        degrees: 0,
        index: -1,
      };
      continue;
    }

    if (currentRegion) {
      applyRegionProperties(currentRegion, line);
      continue;
    }
  }
  flushRegion();
  return regions;
}

/**
 * Download a specific atlas attachment/region as a standalone PNG image file.
 * @param atlasText - Contents of the .atlas file
 * @param imageFiles - Array of image files (atlas pages), order must match atlas
 * @param regionName - Name of the region to extract (as in atlas)
 * @param regionIndex - Index for multi-frame regions (-1 if single)
 * @returns Promise that resolves when download is triggered, rejects on error
 */
export async function downloadAttachmentAsImage(
  atlasText: string,
  imageFiles: File[],
  regionName: string,
  regionIndex: number = -1
): Promise<void> {
  const regions = parseAtlasRegions(atlasText);
  const region = regions.find(
    (r) => r.name === regionName && (regionIndex < 0 || r.index === regionIndex)
  );
  if (!region) {
    throw new Error(`Region "${regionName}"${regionIndex >= 0 ? ` (index ${regionIndex})` : ''} not found in atlas`);
  }

  const pageFile = findAtlasPageImage(region.pageName, imageFiles);

  if (!pageFile) {
    throw new Error('No image file found for atlas page');
  }

  const imageBlob = new Blob([await pageFile.arrayBuffer()], { type: pageFile.type || 'image/png' });
  const img = await createImageBitmap(imageBlob);
  const { x, y, width, height } = region.bounds;
  const outWidth = region.rotate ? height : width;
  const outHeight = region.rotate ? width : height;

  const canvas = document.createElement('canvas');
  canvas.width = outWidth;
  canvas.height = outHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get canvas 2d context');

  if (region.rotate) {
    ctx.save();
    ctx.translate(outWidth, 0);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(img, x, y, width, height, 0, 0, width, height);
    ctx.restore();
  } else {
    ctx.drawImage(img, x, y, width, height, 0, 0, width, height);
  }

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('toBlob failed'))),
      'image/png',
      1
    );
  });

  const safeName = regionName.replace(/[^\w\-.]/g, '_');
  const suffix = regionIndex >= 0 ? `_${regionIndex}` : '';
  const filename = `${safeName}${suffix}.png`;

  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
