import { configureSpineSvelte } from "spine-svelte";
// Direct file path, not the `pixi-svelte` barrel: that barrel re-exports Svelte component `Props`
// types, which plain `tsc` (this file's build) can't parse.
import { setSpineAtlasSourceProvider } from "pixi-svelte/src/lib/mipmaps/spineAtlasTextureRegistry";
import { createRoot } from "react-dom/client";
import { toast } from "sonner";
import App from "./App.tsx";
import "./index.css";
import { initAppServiceWorker } from "./lib/appServiceWorker";
import { redirectToSpine42Viewer } from "./lib/spine42Redirect";
import { spineViewerStore } from "./store/spineViewerStore";

// Must run before anything constructs a Spine: the runtime reads this at load time.
configureSpineSvelte({
  runtimeVersion: __SPINE_RUNTIME_PACKAGE_VERSION__,
  supportedExportPrefixes: ["4.3"],
  // The viewer hands 4.2 exports to the legacy deployment instead of failing the load.
  onUnsupportedExport: ({ exportVersion }) => redirectToSpine42Viewer(exportVersion),
  notify: (level, message) =>
    level === "error" ? toast.error(message) : level === "warn" ? toast.warning(message) : toast(message),
  dev: import.meta.env.DEV,
});

// FileSpineLoader parses atlases directly from dropped files, not through pixi-svelte's own
// AssetsLoader — the mipmap registry needs this override to find its atlas pages at all.
setSpineAtlasSourceProvider((assetKey) => {
  const { fileSpineLoader, secondFileSpineLoader } = spineViewerStore.refs;
  return (
    fileSpineLoader?.getTextureSourcesForPreload(assetKey) ??
    secondFileSpineLoader?.getTextureSourcesForPreload(assetKey) ??
    []
  );
});

initAppServiceWorker();

createRoot(document.getElementById("root")!).render(<App />);
