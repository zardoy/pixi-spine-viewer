import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

// Self-contained on purpose: a vendored copy must not reach for the origin repo's
// `config-svelte` workspace package.
export default {
	preprocess: vitePreprocess(),
};
