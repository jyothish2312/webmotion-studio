<script>
	import { onMount } from 'svelte';
	import Canvas from './Canvas.svelte';
	import Timeline from './Timeline.svelte';
	import Inspector from './Inspector.svelte';
	import AssetPanel from './AssetPanel.svelte';
	import ToolRail from './ToolRail.svelte';
	import ExportDialog from './ExportDialog.svelte';
	import HelpDialog from './HelpDialog.svelte';
	import LayoutTabs from './LayoutTabs.svelte';
	import Splitter from './ui/Splitter.svelte';
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
	import { persistWorkspace, resetSize, workspace } from './lib/panels.svelte.js';

	let showExport = $state(false);
	let showHelp = $state(false);
	let importError = $state(null);

	const scene = $derived(activeScene());
	const anyModal = $derived(showExport || showHelp);

	onMount(() => {
		hydrateAssets();
		resetSelection();
		// First run: open the guide rather than leaving someone staring at a
		// canvas full of dots with no idea what a "stop" is.
		try {
			if (!localStorage.getItem('webmotion.seen')) {
				showHelp = true;
				localStorage.setItem('webmotion.seen', '1');
			}
		} catch {
			/* storage blocked — skip the greeting, not the app */
		}
	});

	function newScene() {
		addScene(makeScene({ name: `Scene ${project.scenes.length + 1}` }));
	}

	function switchScene(id) {
		const next = project.scenes.find((s) => s.id === id);
		if (!next) return;
		ui.activeSceneId = next.id;
		ui.activeLayoutId = next.layouts[0]?.id ?? null;
		ui.selectedTrackId = next.layouts[0]?.tracks[0]?.id ?? null;
		ui.selectedMarkerId = null;
	}

	function togglePanel(side) {
		workspace[side === 'left' ? 'leftOpen' : 'rightOpen'] =
			!workspace[side === 'left' ? 'leftOpen' : 'rightOpen'];
		persistWorkspace();
	}

	function resetWorkspace() {
		resetSize('left');
		resetSize('right');
		resetSize('timeline');
		workspace.leftOpen = true;
		workspace.rightOpen = true;
		workspace.sections = {};
		persistWorkspace();
	}

	function saveJson() {
		const blob = new Blob([JSON.stringify(serialize(), null, 2)], { type: 'application/json' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `${project.name.replace(/\s+/g, '_') || 'animation'}.json`;
		a.click();
		URL.revokeObjectURL(url);
	}

	async function openJson(event) {
		const file = event.target.files?.[0];
		event.target.value = '';
		if (!file) return;
		importError = null;
		try {
			load(JSON.parse(await file.text()));
		} catch (err) {
			importError = err.message ?? 'Could not read that project file.';
			setTimeout(() => (importError = null), 5000);
		}
	}

	function onKeydown(event) {
		if (anyModal) return;
		if (event.ctrlKey || event.metaKey) return;
		if (event.target instanceof HTMLInputElement) return;
		if (event.target instanceof HTMLTextAreaElement) return;
		if (event.target instanceof HTMLSelectElement) return;
		if (event.key === '?' || (event.key === '/' && event.shiftKey)) {
			showHelp = true;
			event.preventDefault();
		}
	}

	const showChrome = $derived(!ui.preview);
	const leftWidth = $derived(showChrome && workspace.leftOpen ? `${workspace.left}px` : '0px');
	const rightWidth = $derived(showChrome && workspace.rightOpen ? `${workspace.right}px` : '0px');
</script>

<svelte:window onkeydown={onKeydown} />

<div class="grid h-screen w-full grid-rows-[52px_1fr_auto] overflow-hidden bg-panel-dark text-[#e6edf3]">
	<header class="flex items-center gap-3 border-b border-line bg-panel px-3">
		<div
			class="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-gradient-to-br from-accent to-grape text-white"
			title="webmotion studio"
		>
			<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
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
			class="w-40 shrink-0 rounded border border-transparent bg-transparent px-2 py-1 text-sm outline-none transition-colors hover:border-line focus:border-accent"
			bind:value={project.name}
			placeholder="Project name"
			aria-label="Project name"
		/>

		<!-- Scenes are independent on a page: own timeline, own trigger. -->
		<div class="flex shrink-0 items-center gap-1 border-l border-line pl-3 text-xs">
			<span class="text-[10px] font-bold tracking-wider text-muted">SCENE</span>
			<select
				class="field w-36 py-1 text-xs"
				aria-label="Active scene"
				value={ui.activeSceneId ?? scene?.id}
				onchange={(e) => switchScene(e.currentTarget.value)}
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

		{#if importError}
			<span class="truncate text-xs text-danger" role="alert">{importError}</span>
		{/if}

		<div class="ml-auto flex shrink-0 items-center gap-1.5 text-xs">
			{#if showChrome}
				<!-- Panel toggles: the fastest way to get the canvas back. -->
				<button
					class="grid h-7 w-7 place-items-center rounded border border-line bg-raise transition-colors hover:border-accent {workspace.leftOpen
						? 'text-white'
						: 'text-muted'}"
					onclick={() => togglePanel('left')}
					title="Toggle the left panel"
					aria-label="Toggle the left panel"
					aria-pressed={workspace.leftOpen}
				>
					<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"
						><rect x="1.5" y="2.5" width="13" height="11" rx="1.5" /><line x1="6" y1="2.5" x2="6" y2="13.5" /></svg
					>
				</button>
				<button
					class="grid h-7 w-7 place-items-center rounded border border-line bg-raise transition-colors hover:border-accent {workspace.rightOpen
						? 'text-white'
						: 'text-muted'}"
					onclick={() => togglePanel('right')}
					title="Toggle the right panel"
					aria-label="Toggle the right panel"
					aria-pressed={workspace.rightOpen}
				>
					<svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4"
						><rect x="1.5" y="2.5" width="13" height="11" rx="1.5" /><line x1="10" y1="2.5" x2="10" y2="13.5" /></svg
					>
				</button>
				<button
					class="rounded border border-line bg-raise px-2 py-1.5 text-muted transition-colors hover:border-accent hover:text-white"
					onclick={resetWorkspace}
					title="Reset the panel sizes and reopen every section">Reset layout</button
				>
				<span class="mx-1 h-5 w-px bg-line"></span>
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
				<input type="file" accept=".json" class="hidden" onchange={openJson} />
			</label>
			<button
				class="rounded-md border border-line bg-raise px-3 py-1.5 transition-colors hover:border-accent"
				onclick={saveJson}>Save</button
			>
			<button
				class="grid h-7 w-7 place-items-center rounded-full border border-line bg-raise font-bold text-muted transition-colors hover:border-accent hover:text-white"
				onclick={() => (showHelp = true)}
				title="How to use this (?)"
				aria-label="Open the guide">?</button
			>
			<button
				class="rounded-md border border-accent bg-accent px-3 py-1.5 font-semibold text-ink transition-all hover:brightness-110"
				onclick={() => (showExport = true)}>Get GSAP code</button
			>
		</div>
	</header>

	<main class="flex min-h-0 min-w-0">
		{#if showChrome && workspace.leftOpen}
			<AssetPanel width={leftWidth} />
			<Splitter target="left" side="left" label="Resize the left panel" />
		{/if}

		<section class="flex min-h-0 min-w-0 flex-1 flex-col bg-ink">
			<LayoutTabs />
			<div class="flex min-h-0 flex-1">
				{#if showChrome}<ToolRail />{/if}
				<div class="relative min-h-0 min-w-0 flex-1">
					<Canvas />
				</div>
			</div>
		</section>

		{#if showChrome && workspace.rightOpen}
			<Splitter target="right" side="right" label="Resize the right panel" />
			<Inspector width={rightWidth} />
		{/if}
	</main>

	<div class="flex flex-col">
		<Splitter target="timeline" side="up" label="Resize the timeline" />
		<div style="height: {workspace.timeline}px" class="min-h-0">
			<Timeline />
		</div>
	</div>
</div>

{#if showExport}
	<ExportDialog onclose={() => (showExport = false)} />
{/if}
{#if showHelp}
	<HelpDialog onclose={() => (showHelp = false)} />
{/if}
