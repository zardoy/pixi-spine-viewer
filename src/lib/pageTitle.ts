export const DEFAULT_PAGE_TITLE =
  'Spine Animation Viewer - Open & View .skel, .json Files Online';

/** Prefix document title with the loaded skeleton filename. */
export function setSkeletonPageTitle(filename: string): void {
  document.title = `${filename} - Spine Animation Viewer`;
}

export function resetPageTitle(): void {
  document.title = DEFAULT_PAGE_TITLE;
}
