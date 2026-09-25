import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { VitePWA } from "vite-plugin-pwa";
import path from "path";
import { spineRuntimeVersionDefines } from "./vite.spineVersions";
import { appBuildInfoDefines } from "./vite.buildInfo";

// https://vitejs.dev/config/
export default defineConfig(() => ({
  server: {
    host: "::",
    port: 8080,
  },
  define: {
    ...spineRuntimeVersionDefines(),
    ...appBuildInfoDefines(),
  },
  plugins: [
    react(),
    svelte(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico"],
      manifest: {
        name: "Spine Animation Viewer",
        short_name: "Spine Viewer",
        description:
          "Open, view, and export Spine animation files online. Free web-based viewer for .skel, .json, and .atlas files.",
        theme_color: "#0a0a0a",
        background_color: "#0a0a0a",
        display: "standalone",
        start_url: "/",
        icons: [
          {
            src: "favicon.ico",
            sizes: "64x64",
            type: "image/x-icon",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,svg,woff2}"],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Must precede the bare "pixi-svelte" entry below — Vite/Rollup alias matching is
      // prefix-based and first-match-wins, so a deep import like "pixi-svelte/src/lib/..."
      // (used to reach pure-TS files without going through the barrel — see PixiApp.tsx) would
      // otherwise get rewritten using the bare entry's file path instead of its directory.
      "pixi-svelte/src": path.resolve(__dirname, "./src/vendor/pixi-svelte/src"),
      "pixi-svelte": path.resolve(__dirname, "./src/vendor/pixi-svelte/index.ts"),
      "spine-svelte/components": path.resolve(__dirname, "./src/vendor/spine-svelte/src/lib/components/index.ts"),
      "spine-svelte/dev": path.resolve(__dirname, "./src/vendor/spine-svelte/src/lib/dev/index.ts"),
      "spine-svelte/state": path.resolve(__dirname, "./src/vendor/spine-svelte/src/lib/state/index.ts"),
      "spine-svelte": path.resolve(__dirname, "./src/vendor/spine-svelte/index.ts"),
    },
    // Vendor folders and app code must share one instance of each runtime.
    dedupe: [
      "pixi.js",
      "svelte",
      "@esotericsoftware/spine-core",
      "@esotericsoftware/spine-pixi-v8",
    ],
  },
}));
