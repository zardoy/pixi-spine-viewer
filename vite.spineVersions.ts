import { readFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const projectRoot = path.dirname(fileURLToPath(import.meta.url));

/** Read installed @esotericsoftware/spine-core version from node_modules. */
export function readSpineRuntimePackageVersion(rootDir = projectRoot): string {
  return JSON.parse(
    readFileSync(
      path.join(rootDir, "node_modules", "@esotericsoftware/spine-core", "package.json"),
      "utf8",
    ),
  ).version as string;
}

/** Vite `define` entry for bundled spine-core package version. */
export function spineRuntimeVersionDefines(rootDir = projectRoot) {
  return {
    __SPINE_RUNTIME_PACKAGE_VERSION__: JSON.stringify(readSpineRuntimePackageVersion(rootDir)),
  };
}
