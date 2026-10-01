#!/usr/bin/env node
/**
 * Keep vendored packages in consumers identical to this repo's copy.
 *
 *   node scripts/vendor-sync.mjs check <target> [package...]   exit 1 on drift
 *   node scripts/vendor-sync.mjs push  <target> [package...]   copy source -> target (+ VENDORED_FROM)
 *
 * <target> is a key of `vendor-targets.json` or a path to a consumer's `src/vendor` folder.
 * Only the packages listed in `vendor-targets.json` are synced by default. `pixi-svelte` is
 * deliberately not pushed: its source of truth is lotc-front-svelte — pass it explicitly to `check`.
 */
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE_VENDOR = path.join(ROOT, 'src/vendor')
const STAMP = 'VENDORED_FROM'
const SKIP = new Set(['node_modules', STAMP])

const config = JSON.parse(fs.readFileSync(path.join(ROOT, 'vendor-targets.json'), 'utf8'))
const [mode, targetArg, ...pkgArgs] = process.argv.slice(2)

if (!['check', 'push'].includes(mode) || !targetArg) {
	console.error('usage: vendor-sync.mjs <check|push> <target> [package...]')
	process.exit(2)
}

const targetVendor = path.resolve(ROOT, config.targets[targetArg] ?? targetArg)
const packages = pkgArgs.length ? pkgArgs : config.packages

if (!fs.existsSync(targetVendor)) {
	console.error(`target vendor folder not found: ${targetVendor}`)
	process.exit(2)
}

function listFiles(dir, base = dir, out = []) {
	if (!fs.existsSync(dir)) return out
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		if (SKIP.has(entry.name)) continue
		const full = path.join(dir, entry.name)
		if (entry.isDirectory()) listFiles(full, base, out)
		else out.push(path.relative(base, full))
	}
	return out.sort()
}

function diffPackage(pkg) {
	const src = path.join(SOURCE_VENDOR, pkg)
	const dst = path.join(targetVendor, pkg)
	const srcFiles = listFiles(src)
	const dstFiles = listFiles(dst)
	const all = [...new Set([...srcFiles, ...dstFiles])].sort()
	const drift = []
	for (const file of all) {
		const a = srcFiles.includes(file) ? fs.readFileSync(path.join(src, file)) : null
		const b = dstFiles.includes(file) ? fs.readFileSync(path.join(dst, file)) : null
		if (a === null) drift.push({ file, kind: 'only in target' })
		else if (b === null) drift.push({ file, kind: 'missing in target' })
		else if (!a.equals(b)) drift.push({ file, kind: 'differs' })
	}
	return drift
}

function gitHead() {
	try {
		return execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim()
	} catch {
		return 'unknown'
	}
}

let failed = false
for (const pkg of packages) {
	if (!fs.existsSync(path.join(SOURCE_VENDOR, pkg))) {
		console.error(`unknown package: ${pkg}`)
		process.exit(2)
	}
	const drift = diffPackage(pkg)

	if (mode === 'check') {
		if (drift.length === 0) console.log(`ok     ${pkg}`)
		else {
			failed = true
			console.log(`DRIFT  ${pkg} (${drift.length} file(s))`)
			for (const d of drift) console.log(`         ${d.kind.padEnd(18)} ${d.file}`)
		}
		continue
	}

	const src = path.join(SOURCE_VENDOR, pkg)
	const dst = path.join(targetVendor, pkg)
	for (const d of drift) {
		const to = path.join(dst, d.file)
		if (d.kind === 'only in target') fs.rmSync(to, { force: true })
		else {
			fs.mkdirSync(path.dirname(to), { recursive: true })
			fs.copyFileSync(path.join(src, d.file), to)
		}
	}
	fs.writeFileSync(
		path.join(dst, STAMP),
		`source: pixi-spine-viewer@${gitHead()}\nsynced: ${new Date().toISOString()}\n`,
	)
	console.log(`pushed ${pkg}: ${drift.length} file(s) changed`)
}

process.exit(failed ? 1 : 0)
