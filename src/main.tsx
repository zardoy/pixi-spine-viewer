import { configureSpineSvelte } from "spine-svelte";
import { createRoot } from "react-dom/client";
import { toast } from "sonner";
import App from "./App.tsx";
import "./index.css";
import { initAppServiceWorker } from "./lib/appServiceWorker";
import { redirectToSpine42Viewer } from "./lib/spine42Redirect";

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

initAppServiceWorker();

createRoot(document.getElementById("root")!).render(<App />);
