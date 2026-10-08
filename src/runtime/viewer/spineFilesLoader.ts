import { ref } from 'valtio'
import type { SpineFiles } from '../../pages/Index'
import { FileSpineLoader } from '../../lib/FileSpineLoader'
import { spineViewerStore } from '../../store/spineViewerStore'

export const SPINE_KEY = 'viewer-spine'
export const SECOND_SPINE_KEY = 'viewer-spine-2'

function isSkelFile(file: File): boolean {
	return file.name.toLowerCase().endsWith('.skel')
}

/** `"key"` for a single skeleton, `"key/skeleton"` when several share one atlas. */
export function primarySpineKey(files: SpineFiles | null, selectedSkeleton: string): string {
	const multi = !!files?.skeletonFiles && files.skeletonFiles.length > 1
	return multi && selectedSkeleton ? `${SPINE_KEY}/${selectedSkeleton}` : SPINE_KEY
}

/**
 * Parse the dropped files and load the primary skeleton. Publishes the loader (and the raw data
 * the atlas explorer/export need) to the store before the skeleton finishes loading, because the
 * mipmap atlas-source lookup reads `refs.fileSpineLoader` while textures are being created.
 */
export async function loadPrimarySpine(
	files: SpineFiles,
	selectedSkeleton: string,
): Promise<FileSpineLoader> {
	const atlasText = await files.atlasFile.text()
	const multi = !!files.skeletonFiles && files.skeletonFiles.length > 1

	let loader: FileSpineLoader
	if (multi) {
		loader = new FileSpineLoader(files, atlasText)
		spineViewerStore.refs.spineData = { skeletonData: '', atlasText }
	} else {
		const skeletonData = isSkelFile(files.jsonFile)
			? await files.jsonFile.arrayBuffer()
			: await files.jsonFile.text()
		spineViewerStore.refs.spineData = { skeletonData, atlasText }
		loader = new FileSpineLoader(skeletonData, atlasText, files.imageFiles)
	}
	spineViewerStore.refs.imageFiles = ref(files.imageFiles)
	spineViewerStore.refs.fileSpineLoader = ref(loader)

	await loader.loadSpine(primarySpineKey(files, selectedSkeleton))
	return loader
}

export async function loadSecondSpine(files: SpineFiles): Promise<FileSpineLoader> {
	const atlasText = await files.atlasFile.text()
	const skeletonData = isSkelFile(files.jsonFile)
		? await files.jsonFile.arrayBuffer()
		: await files.jsonFile.text()

	const loader = new FileSpineLoader(skeletonData, atlasText, files.imageFiles)
	spineViewerStore.refs.secondFileSpineLoader = ref(loader)

	await loader.loadSpine(SECOND_SPINE_KEY)
	const animations = loader.getSkeletonData(SECOND_SPINE_KEY)?.animations.map((animation) => animation.name)
	if (animations) spineViewerStore.ui.secondAnimations = animations
	return loader
}
