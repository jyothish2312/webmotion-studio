<script>
	import Canvas from './Canvas.svelte';
	import Timeline from './Timeline.svelte';
	import Inspector from './Inspector.svelte';
	import AssetPanel from './AssetPanel.svelte';
	import ExportDialog from './ExportDialog.svelte';
	import { project, serialize, load, hydrateAssets, resetSelection } from './lib/state.svelte.js';
	import { onMount } from 'svelte';

	let showExport = $state(false);
	let importError = $state(null);

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
				class="rounded border border-transparent bg-transparent px-2 py-1 text-sm outline-none transition-colors hover:border-line focus:border-accent"
				bind:value={project.name}
				placeholder="Project name"
			/>
		</div>

		<div class="flex items-center gap-2 text-xs">
			{#if importError}
				<span class="text-danger">{importError}</span>
			{/if}
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

	<main class="grid min-h-0 grid-cols-[248px_1fr_300px]">
		<AssetPanel />
		<section class="relative min-h-0 bg-ink">
			<Canvas />
		</section>
		<Inspector />
	</main>

	<Timeline />
</div>

{#if showExport}
	<ExportDialog onclose={() => (showExport = false)} />
{/if}
