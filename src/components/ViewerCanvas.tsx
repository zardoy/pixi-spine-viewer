import { useState } from 'react'
import { SvelteHost } from '../runtime/bridge/SvelteHost'
import ViewerStage from '../runtime/ViewerStage.svelte'
import { createViewerStageState } from '../runtime/state/viewerStageState.svelte'

/**
 * The viewer's canvas. Everything inside — loading, camera, playback, overlays — is the Svelte
 * stage; React only provides the element it mounts into. The sidebar and timeline talk to it
 * through `spineViewerStore`.
 */
export const ViewerCanvas = () => {
  const [stageState] = useState(createViewerStageState)
  const [stageApi] = useState(() => ({}))

  return <SvelteHost component={ViewerStage as never} state={stageState} api={stageApi} className="h-full w-full" />
}
