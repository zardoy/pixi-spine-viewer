# Syncing `spine-svelte` into a game

`src/vendor/spine-svelte` is the single source of truth. Games hold a read-only copy — never edit it there;
change it here, then push.

```sh
node scripts/vendor-sync.mjs check <target>   # exit 1 + file list if the game's copy drifted
node scripts/vendor-sync.mjs push  <target>   # copy it over and write VENDORED_FROM (source commit)
```

`<target>` is a key from `vendor-targets.json` (`rollin`, `ths`) or a path to the game's `src/vendor` folder.
To add a game, add it to `vendor-targets.json`.

## First-time setup in a game
Alias `spine-svelte`, `spine-svelte/components`, `spine-svelte/dev` and `spine-svelte/state` in the game's
`vite.config.js` and `tsconfig.json` (see `rollin-frontend` for the exact entries), then call
`configureSpineSvelte({...})` once at startup (see `src/vendor/spine-svelte/README.md`).

## Notes
- `pixi-svelte` is **not** synced. It must provide the generic base `spine-svelte` imports (`getContextApp`,
  `getContextParent`, `createContextParent`, `propsSyncEffect`, `anchorToPivot`, `Graphics`, types) and no
  longer carries any spine code.
- After a push, run the game's typecheck, tests and build, and look at the spines.
