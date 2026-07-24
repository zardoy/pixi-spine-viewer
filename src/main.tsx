import "./lib/spineMeshAttachmentPatch";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { initAppServiceWorker } from "./lib/appServiceWorker";

initAppServiceWorker();

createRoot(document.getElementById("root")!).render(<App />);
