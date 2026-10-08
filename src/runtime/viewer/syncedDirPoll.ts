import { ref } from 'valtio'
import { toast } from 'sonner'
import { spineViewerStore } from '../../store/spineViewerStore'

const POLL_MS = 1000

/**
 * Watch the synced folder's skeleton file and reload the viewer when it changes on disk.
 * Returns a stop function; a no-op when no folder is synced.
 */
export function startSyncedDirPoll(): () => void {
	const synced = spineViewerStore.refs.syncedDirHandles
	if (!synced) return () => {}

	let lastHash = ''

	const poll = async () => {
		try {
			const jsonFile = await synced.jsonHandle.getFile()
			const hash = jsonFile.name.toLowerCase().endsWith('.skel')
				? `${(await jsonFile.arrayBuffer()).byteLength}:binary`
				: await jsonFile.text().then((text) => `${text.length}:${text.slice(0, 200)}`)

			if (lastHash && lastHash !== hash) {
				spineViewerStore.reloadPreserveAnimation = spineViewerStore.ui.selectedAnimation || null

				const [jsonFileFresh, atlasFile, imageFiles] = await Promise.all([
					synced.jsonHandle.getFile(),
					synced.atlasHandle.getFile(),
					Promise.all(synced.imageHandles.map((handle) => handle.getFile())),
				])
				spineViewerStore.files = ref({ jsonFile: jsonFileFresh, atlasFile, imageFiles })
				toast.success('Spine reloaded (JSON changed)')
			}
			lastHash = hash
		} catch (err) {
			console.warn('[Synced dir] Read error:', err)
		}
	}

	const id = setInterval(poll, POLL_MS)
	void poll() // Initial read, to set lastHash
	return () => clearInterval(id)
}
