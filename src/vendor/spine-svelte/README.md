# spine-svelte

> **Vendored, syncable package.**
> Source of truth: `pixi-spine-viewer`. Consumers: `rollin-frontend`, `lotc-front-svelte`.
> Change it here, then copy the folder outward. Edits made in a consumer will be overwritten.

Spine runtime features that sit on top of [`pixi-svelte`](../pixi-svelte): the pieces the viewer
needs that the base package doesn't cover, written so a game can use them too.

## The contract

Nothing in this folder may import from a host project. No `@/…`, no `$lib/…`, no store, no toast
library, no React. The only permitted imports are relative paths and the shared runtime deps:
`pixi-svelte`, `pixi.js`, `@esotericsoftware/*`, `svelte`. This is enforced by
`no-restricted-imports` in the host's `eslint.config.js`, so a violation fails `pnpm lint` rather
than being discovered at sync time.

Everything host-specific is supplied instead:

```ts
import { configureSpineSvelte } from 'spine-svelte'

configureSpineSvelte({
  runtimeVersion: __SPINE_RUNTIME_PACKAGE_VERSION__,
  supportedExportPrefixes: ['4.3'],
  // Optional. Omit it and an unsupported export simply fails the load.
  onUnsupportedExport: ({ exportVersion }) => redirectToLegacyViewer(exportVersion),
  notify: (level, message) => toast[level](message),
  tween: (target, to, seconds) => { const t = gsap.to(target, { ...to, duration: seconds }); return () => t.kill() },
  dev: import.meta.env.DEV,
})
```

Call it once at startup, before anything constructs a `Spine`. Importing the package barrel also
installs two required side effects: the mesh-attachment patch (guards against a known bad-bone-index
export crash) and `pixi.js/prepare` (needed by the GPU texture preload).

## Setup in a host project

Alias the bare specifier in both the bundler and TypeScript:

```js
// vite.config.js
resolve: {
  alias: { 'spine-svelte': path.resolve(__dirname, './src/vendor/spine-svelte/index.ts') },
  dedupe: ['pixi.js', 'svelte', '@esotericsoftware/spine-core', '@esotericsoftware/spine-pixi-v8'],
}
```

```jsonc
// tsconfig.json
"paths": { "spine-svelte": ["./src/vendor/spine-svelte/index.ts"] }
```

Because only the alias differs per project, a game that npm-aliases
`@esotericsoftware/spine-pixi-v8` to a private fork resolves it transparently.

## Animation overrides

`SpineOverrideController` layers an imperative, awaitable one-shot clip over a spine's normal
playback and falls back automatically when it finishes. Proven in `3-hats-show`; generalised here.

```ts
const spineControl = new SpineOverrideController<{ char: 'main_character' }>()

// Resolves true when the clip completed, false if something interrupted it.
const completed = await spineControl.setOverride('char', { animation: 'hit' })
```

```svelte
<SpineNode key="main_character" animation="idle" loop overrides={spineControl} control="char" />
```

The awkward parts it handles, which are the reason to share it rather than re-solve it per game:

- **Spamming a trigger never strands the state machine.** A replaced override resolves `false`
  immediately, so nothing is left awaiting a clip that will never finish.
- **A primary override does not inherit the base `loop`.** Otherwise the override clip starts
  another iteration before its own completion clears the entry, and it never falls back to idle.
- **Completions from a clip that is mixing out are ignored** (`trackEntry.mixingTo`), so an
  interrupted animation cannot resolve the override that just displaced it.
- **Re-triggering the same animation name still restarts it**, via a per-key `resetCounter` bump.
- **Track 1 is cleared when a layered override goes away**, so its last pose does not stick.
- **Overrides addressed at an unmounted control are refused** with a warning instead of silently
  queueing against nothing; pass `allowUnmounted` when that is intended.

Bind order matters only in that the controller needs a live instance to drive imperative helpers —
`SpineNode` handles that for you via `SpineOverrideBind` whenever `overrides` and `control` are
both set. Outside `SpineNode`, use `useSpineOverrideRevision` from `spine-svelte/state` to make a
component re-derive when overrides change.

## Layout

| Path | What lives there |
| --- | --- |
| `core/runtime/` | Skeleton/atlas loading and the Spine 4.3 pose-API shims |
| `core/playback/` | Track semantics; attachment overrides during a mix |
| `core/override/` | Imperative animation overrides (see above) |
| `core/visibility/` | Force-hide passes and the silhouette/ghosted render-mode filters |
| `core/bounds/` | Viewport/bounds math and animation metadata |
| `core/debug/` | The standalone `SpineDebugRenderer` |
| `dev/` | Tooling-grade extras: pan/zoom, origin axes, checkerboard, renderer stats |
| `components/` | Svelte components composing over `pixi-svelte` |

## Frame ordering

Per-frame work registers on the frame pipeline in `pixi-svelte`, which owns
`spine.afterUpdateWorldTransforms` and runs tasks by phase. Ordering is load-bearing: force-hide
runs *after* the mix rules, because a `'from'` rule swaps a slot's attachment and force-hide has to
judge whatever ends up visible.
