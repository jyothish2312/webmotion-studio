<script>
	import Canvas from './Canvas.svelte';
	import Timeline from './Timeline.svelte';
	import Inspector from './Inspector.svelte';
	import AssetPanel from './AssetPanel.svelte';
	import ExportDialog from './ExportDialog.svelte';
	import LayoutTabs from './LayoutTabs.svelte';
	import {
		project,
		ui,
		serialize,
		load,
		hydrateAssets,
		resetSelection,
		activeScene,
		addScene,
		removeScene
	} from './lib/state.svelte.js';
	import { makeScene } from './lib/model.js';
	import { onMount } from 'svelte';

	let showExport = $state(false);
	let importError = $state(null);

	const scene = $derived(activeScene());

	function newScene() {
		addScene(makeScene({ name: `Scene ${project.scenes.length + 1}` }));
	}

	onMount(() => {
		hydrateAssets();
		resetSelection();
	});

	function exportJson() {
		const blob = new Blob([JSON.stringify(serialize(), null, 2)], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `${project.name.replace(/\s+/g, '_') || 'animation'}.json`;
		a.click();
		URL.revokeObjectURL(url);
	}

	async function importJson(event) {
		const file = event.target.files?.[0];
		event.target.value = '';
		if (!file) return;
		importError = null;
		try {
			load(JSON.parse(await file.text()));
		} catch (err) {
			importError = err.message ?? 'Could not read that project file.';
			setTimeout(() => (importError = null), 4000);
		}
	}
</script>

<div class="grid h-screen w-full grid-rows-[54px_1fr_72px] overflow-hidden bg-panel-dark text-[#e6edf3]">
	<header class="flex items-center justify-between border-b border-line bg-panel px-4">
		<div class="flex items-center gap-3">
			<div
				class="grid h-8 w-8 place-items-center rounded-lg bg-gradient-to-br from-accent to-grape text-white"
			>
				<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
					><path d="M3 18c6 0 6-12 12-12" /><circle cx="19" cy="6" r="2" fill="currentColor" /><circle
						cx="4"
						cy="18"
						r="1.5"
						fill="currentColor"
					/></svg
				>
			</div>
			<input
				type="text"
				class="w-44 rounded border border-transparent bg-transparent px-2 py-1 text-sm outline-none transition-colors hover:border-line focus:border-accent"
				bind:value={project.name}
				placeholder="Project name"
			/>

			<!-- Scenes are independent on a page: own timeline, own trigger. -->
			<div class="flex items-center gap-1 border-l border-line pl-3 text-xs">
				<span class="text-[10px] font-bold tracking-wider text-muted">SCENE</span>
				<select
					class="field w-40 py-1 text-xs"
					value={ui.activeSceneId ?? scene?.id}
					onchange={(e) => {
						const next = project.scenes.find((s) => s.id === e.currentTarget.value);
						if (!next) return;
						ui.activeSceneId = next.id;
						ui.activeLayoutId = next.layouts[0]?.id ?? null;
						ui.selectedTrackId = next.layouts[0]?.tracks[0]?.id ?? null;
						ui.selectedMarkerId = null;
					}}
				>
					{#each project.scenes as s (s.id)}
						<option value={s.id}>{s.name}</option>
					{/each}
				</select>
				<button
					class="rounded border border-line bg-raise px-2 py-1 text-muted transition-colors hover:border-accent hover:text-white"
					onclick={newScene}
					title="New scene">+</button
				>
				{#if project.scenes.length > 1}
					<button
						class="rounded border border-line bg-raise px-2 py-1 text-muted transition-colors hover:border-danger hover:text-danger"
						onclick={() => scene && removeScene(scene.id)}
						title="Delete scene">✕</button
					>
				{/if}
			</div>
		</div>

		<div class="flex items-center gap-2 text-xs">
			{#if importError}
				<span class="text-danger">{importError}</span>
			{/if}
			<button
				class="rounded-md border px-3 py-1.5 transition-colors {ui.preview
					? 'border-accent bg-accent/10 text-accent'
					: 'border-line bg-raise hover:border-accent'}"
				onclick={() => (ui.preview = !ui.preview)}
				title="Hide the editor chrome and frame the layout as a visitor sees it"
			>
				{ui.preview ? 'Exit preview' : 'Preview'}
			</button>
			<label
				class="cursor-pointer rounded-md border border-line bg-raise px-3 py-1.5 transition-colors hover:border-accent"
			>
				Open
				<input type="file" accept=".json" class="hidden" onchange={importJson} />
			</label>
			<button
				class="rounded-md border border-line bg-raise px-3 py-1.5 transition-colors hover:border-accent"
				onclick={exportJson}>Save</button
			>
			<button
				class="rounded-md border border-accent bg-accent px-3 py-1.5 font-semibold text-ink transition-all hover:brightness-110"
				onclick={() => (showExport = true)}>Get GSAP code</button
			>
		</div>
	</header>

	<main
		class="grid min-h-0 {ui.preview ? 'grid-cols-[1fr]' : 'grid-cols-[248px_1fr_300px]'}"
	>
		{#if !ui.preview}<AssetPanel />{/if}
		<section class="grid min-h-0 grid-rows-[auto_1fr] bg-ink">
			<LayoutTabs />
			<div class="relative min-h-0">
				<Canvas />
			</div>
		</section>
		{#if !ui.preview}<Inspector />{/if}
	</main>

	<Timeline />
</div>

{#if showExport}
	<ExportDialog onclose={() => (showExport = false)} />
{/if}
