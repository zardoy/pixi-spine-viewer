import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Texture, type Application } from 'pixi.js'
import { Loader2 } from 'lucide-react'

import { SvelteHost } from '../runtime/bridge/SvelteHost'
import RemountStressStage from '../stress/RemountStressStage.svelte'
import {
	CONFIG_NAMES,
	Harness,
	SCENARIOS,
	installConfig,
	type StressConfig,
} from '../stress/harness'
import { isClean, summarise, type ScenarioSummary } from '../stress/frameProbe'
import { createStressState } from '../stress/stressState.svelte'
import {
	STRESS_SPINE_KEY,
	drawBakedBox,
	loadSyntheticSpine,
	type RigKind,
} from '../stress/syntheticSpine'
import { spineViewerStore } from '../store/spineViewerStore'

const COLS = 3
const ROWS = 3
const CELL = 120

async function waitForApp(
	getApp: () => Application | undefined,
	timeoutMs = 8000,
): Promise<Application> {
	const start = performance.now()
	while (performance.now() - start < timeoutMs) {
		const app = getApp()
		if (app?.renderer && app.canvas) return app
		await new Promise<void>((r) => requestAnimationFrame(() => r()))
	}
	throw new Error('Pixi application did not initialise')
}

export default function StressPage() {
	const [rig, setRig] = useState<RigKind>('animated')
	const [configName, setConfigName] = useState<StressConfig['name']>('baseline')
	const [cycles, setCycles] = useState(3)
	const [stageReady, setStageReady] = useState(false)
	const [loadError, setLoadError] = useState<string | null>(null)
	const [running, setRunning] = useState(false)
	const [status, setStatus] = useState('Load synthetic spine, then Run.')
	const [summaries, setSummaries] = useState<ScenarioSummary[]>([])
	const [passed, setPassed] = useState<boolean | null>(null)

	const [stageState] = useState(() => createStressState(COLS, ROWS, CELL))
	const [stageApi] = useState(() => ({}))
	const getAppRef = useRef<(() => Application | undefined) | null>(null)
	const abortRef = useRef(0)
	/** Bumps when rig/config needs a fresh Pixi root (ticker rewiring is sticky). */
	const [stageKey, setStageKey] = useState(0)

	useEffect(() => {
		let cancelled = false
		setStageReady(false)
		setLoadError(null)
		setSummaries([])
		setPassed(null)
		setStatus(`Loading ${rig} rig…`)

		;(async () => {
			try {
				const loader = await loadSyntheticSpine(rig)
				const bakedTexture = Texture.from(drawBakedBox())
				if (cancelled) {
					bakedTexture.destroy(true)
					return
				}
				stageState.loader = loader
				stageState.bakedTexture = bakedTexture
				stageState.spineKey = STRESS_SPINE_KEY
				for (const cell of stageState.cells) {
					cell.mounted = false
					cell.showBaked = false
				}
				setStageKey((k) => k + 1)
				setStageReady(true)
				setStatus('Stage ready. Pick a config and Run.')
			} catch (err) {
				if (!cancelled) {
					setLoadError(err instanceof Error ? err.message : String(err))
					setStatus('Failed to load synthetic spine.')
				}
			}
		})()

		return () => {
			cancelled = true
		}
	}, [rig, stageState])

	const onReady = useCallback((exports: Record<string, unknown>) => {
		getAppRef.current = () => (exports.getApp as () => Application | undefined)?.()
	}, [])

	const run = useCallback(async () => {
		const getApp = getAppRef.current
		if (!getApp || running) return

		const runId = ++abortRef.current
		setRunning(true)
		spineViewerStore.refs.stressTestRunning = true
		setSummaries([])
		setPassed(null)

		let cleanupConfig: (() => void) | undefined
		let harness: Harness | undefined

		try {
			setStatus('Waiting for Pixi app…')
			const app = await waitForApp(getApp)
			if (runId !== abortRef.current) return

			const config: StressConfig = {
				name: configName,
				sharedFirst: configName === 'shared-ticker',
			}
			cleanupConfig = installConfig(app, config)
			harness = new Harness(app, stageState)

			for (const scenario of SCENARIOS) {
				if (runId !== abortRef.current) return
				harness.setScenario(scenario.name)
				setStatus(`${configName} · ${scenario.name}`)
				await scenario.run(harness, stageState, cycles)
			}

			const next = summarise(harness.tracker.records)
			setSummaries(next)
			const ok = isClean(next)
			setPassed(ok)
			setStatus(ok ? `Clean — ${harness.tracker.records.length} mounts` : `Failures — ${harness.tracker.records.length} mounts`)
		} catch (err) {
			if (runId === abortRef.current) {
				setStatus(err instanceof Error ? err.message : String(err))
				setPassed(false)
			}
		} finally {
			harness?.destroy()
			cleanupConfig?.()
			for (const cell of stageState.cells) {
				cell.mounted = false
				cell.showBaked = false
			}
			// shared-ticker mutates app.ticker; remount so the next run starts clean.
			if (configName === 'shared-ticker') setStageKey((k) => k + 1)
			spineViewerStore.refs.stressTestRunning = false
			if (runId === abortRef.current) setRunning(false)
		}
	}, [configName, cycles, running, stageState])

	const stop = useCallback(() => {
		abortRef.current += 1
		setRunning(false)
		spineViewerStore.refs.stressTestRunning = false
		setStatus('Stopped.')
		for (const cell of stageState.cells) {
			cell.mounted = false
			cell.showBaked = false
		}
	}, [stageState])

	const canvasW = COLS * CELL
	const canvasH = ROWS * CELL

	return (
		<div className="min-h-screen bg-zinc-950 text-zinc-100 p-4 font-mono text-sm">
			<div className="max-w-5xl mx-auto flex flex-col gap-4">
				<header className="flex flex-wrap items-baseline justify-between gap-2">
					<h1 className="text-lg tracking-tight">Remount stress</h1>
					<Link to="/" className="text-zinc-400 hover:text-zinc-200 underline-offset-2 hover:underline">
						← viewer
					</Link>
				</header>

				<p className="text-zinc-400 text-xs max-w-2xl leading-relaxed">
					Synthetic spine grid. Harness remounts cells at timeout / rAF / postrender / ticker-high and
					flags blank first frames. <code className="text-zinc-300">animated</code> hides attachments
					until apply — the strict case.
				</p>

				<div className="flex flex-wrap items-end gap-3">
					<label className="flex flex-col gap-1">
						<span className="text-zinc-500 text-xs">Rig</span>
						<select
							className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5"
							value={rig}
							disabled={running}
							onChange={(e) => setRig(e.target.value as RigKind)}
						>
							<option value="animated">animated</option>
							<option value="setup">setup</option>
						</select>
					</label>

					<label className="flex flex-col gap-1">
						<span className="text-zinc-500 text-xs">Config</span>
						<select
							className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5"
							value={configName}
							disabled={running}
							onChange={(e) => {
								setConfigName(e.target.value as StressConfig['name'])
								setStageKey((k) => k + 1)
							}}
						>
							{CONFIG_NAMES.map((name) => (
								<option key={name} value={name}>
									{name}
								</option>
							))}
						</select>
					</label>

					<label className="flex flex-col gap-1">
						<span className="text-zinc-500 text-xs">Cycles</span>
						<input
							type="number"
							min={1}
							max={50}
							className="bg-zinc-900 border border-zinc-700 rounded px-2 py-1.5 w-20"
							value={cycles}
							disabled={running}
							onChange={(e) => setCycles(Math.max(1, Number(e.target.value) || 1))}
						/>
					</label>

					<button
						type="button"
						className="px-3 py-1.5 rounded bg-emerald-700 hover:bg-emerald-600 disabled:opacity-40"
						disabled={!stageReady || running || !!loadError}
						onClick={() => void run()}
					>
						{running ? 'Running…' : 'Run'}
					</button>
					{running && (
						<button
							type="button"
							className="px-3 py-1.5 rounded bg-zinc-800 hover:bg-zinc-700 border border-zinc-600"
							onClick={stop}
						>
							Stop
						</button>
					)}

					<span className="text-zinc-400 self-center">{status}</span>
					{passed === true && <span className="text-emerald-400 self-center">PASS</span>}
					{passed === false && summaries.length > 0 && (
						<span className="text-rose-400 self-center">FAIL</span>
					)}
				</div>

				{loadError && <p className="text-rose-400">{loadError}</p>}

				<div
					className="relative border border-zinc-800 bg-black overflow-hidden"
					style={{ width: canvasW, height: canvasH }}
				>
					{!stageReady && !loadError && (
						<div className="absolute inset-0 flex items-center justify-center text-zinc-500">
							<Loader2 className="w-5 h-5 animate-spin" />
						</div>
					)}
					{stageReady && (
						<SvelteHost
							key={stageKey}
							component={RemountStressStage as never}
							state={stageState}
							api={stageApi}
							className="w-full h-full"
							onReady={onReady}
						/>
					)}
				</div>

				{summaries.length > 0 && (
					<div className="overflow-x-auto border border-zinc-800 rounded">
						<table className="w-full text-left text-xs">
							<thead className="bg-zinc-900 text-zinc-400">
								<tr>
									<th className="px-2 py-1.5 font-normal">Scenario</th>
									<th className="px-2 py-1.5 font-normal">Mounts</th>
									<th className="px-2 py-1.5 font-normal">Clean</th>
									<th className="px-2 py-1.5 font-normal">Blank</th>
									<th className="px-2 py-1.5 font-normal">Never</th>
									<th className="px-2 py-1.5 font-normal">Max blank</th>
									<th className="px-2 py-1.5 font-normal">Flicker</th>
								</tr>
							</thead>
							<tbody>
								{summaries.map((s) => {
									const bad = s.blankMounts > 0 || s.neverVisible > 0 || s.flickerMounts > 0
									return (
										<tr
											key={`${s.scenario}\0${s.phase}`}
											className={bad ? 'text-rose-300' : 'text-zinc-300'}
										>
											<td className="px-2 py-1 border-t border-zinc-800">{s.scenario}</td>
											<td className="px-2 py-1 border-t border-zinc-800">{s.mounts}</td>
											<td className="px-2 py-1 border-t border-zinc-800">{s.cleanMounts}</td>
											<td className="px-2 py-1 border-t border-zinc-800">{s.blankMounts}</td>
											<td className="px-2 py-1 border-t border-zinc-800">{s.neverVisible}</td>
											<td className="px-2 py-1 border-t border-zinc-800">{s.maxBlankFrames}</td>
											<td className="px-2 py-1 border-t border-zinc-800">{s.flickerMounts}</td>
										</tr>
									)
								})}
							</tbody>
						</table>
					</div>
				)}
			</div>
		</div>
	)
}
