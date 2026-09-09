<script>
	import { project, ui } from './lib/state.svelte.js';
	import { parseSvgFile, hydrateAsset } from './lib/svg.js';
	import AssetPreview from './ui/AssetPreview.svelte';

	let error = $state(null);

	const TOOLS = [
		{ id: 'edit', label: 'Select / edit', key: 'V' },
		{ id: 'add', label: 'Add path point', key: 'P' },
		{ id: 'marker', label: 'Add marker', key: 'M' }
	];

	async function onSvgUpload(event) {
		const files = Array.from(event.target.files ?? []);
		error = null;
		for (const file of files) {
			try {
				const text = await file.text();
				const parsed = parseSvgFile(text, file.name.replace(/\.svg$/i, ''));
				const asset = hydrateAsset({ id: crypto.randomUUID(), name: parsed.name, d: parsed.d });
				project.assets = [...project.assets, asset];
			} catch (err) {
				error = `${file.name}: ${err.message}`;
			}
		}
		event.target.value = '';
	}

	function onBackgroundUpload(event) {
		const file = event.target.files?.[0];
		if (!file) return;
		const reader = new FileReader();
		reader.onload = (e) => (project.background = e.target.result);
		reader.readAsDataURL(file);
		event.target.value = '';
	}

	function removeAsset(id) {
		if (project.assets.length <= 1) return;
		project.assets = project.assets.filter((a) => a.id !== id);
		if (project.settings.startingAssetId === id) {
			project.settings.startingAssetId = project.assets[0].id;
		}
		// Any marker pointing at the deleted shape would silently break the morph.
		for (const marker of project.markers) {
			if (marker.morphTarget === id) marker.morphTarget = 'none';
		}
	}
</script>

<aside class="flex flex-col overflow-y-auto border-r border-line bg-panel">
	<div class="border-b border-line px-4 py-2.5 text-[11px] font-bold tracking-wider text-muted">
		TOOLS
	</div>
	<div class="flex flex-col gap-1.5 border-b border-line p-4">
		{#each TOOLS as tool (tool.id)}
			<button
				class="flex items-center justify-between rounded-md border px-3 py-2 text-[13px] transition-colors {ui.mode ===
				tool.id
					? 'border-accent bg-accent text-ink'
					: 'border-line bg-raise text-white hover:border-accent'}"
				onclick={() => (ui.mode = tool.id)}
			>
				{tool.label}
			</button>
		{/each}
		<p class="hint mt-1">
			Drag anchors and their purple handles to shape the path. Alt while dragging a handle breaks
			the mirror.
		</p>
	</div>

	<div class="border-b border-line px-4 py-2.5 text-[11px] font-bold tracking-wider text-muted">
		SHAPES
	</div>
	<div class="flex flex-col gap-2 p-4">
		{#each project.assets as asset (asset.id)}
			<div
				class="flex items-center justify-between gap-2 rounded-md border px-3 py-2 text-[13px] {project
					.settings.startingAssetId === asset.id
					? 'border-accent/60 bg-accent/10'
					: 'border-line bg-panel-dark'}"
			>
				<div class="flex min-w-0 flex-1 items-center gap-3">
					<div class="h-6 w-6 shrink-0 text-white [&>svg]:h-full [&>svg]:w-full">
						<AssetPreview {asset} />
					</div>
					<span class="truncate text-muted">{asset.name}</span>
				</div>
				<div class="flex shrink-0 items-center gap-1.5">
					<button
						class="rounded px-1.5 py-1 text-[10px] transition-colors {project.settings
							.startingAssetId === asset.id
							? 'bg-accent font-bold text-ink'
							: 'bg-raise text-muted hover:text-white'}"
						onclick={() => (project.settings.startingAssetId = asset.id)}
						title="Use as the starting shape"
					>
						{project.settings.startingAssetId === asset.id ? 'start' : 'set'}
					</button>
					<button
						class="text-muted transition-colors hover:text-danger disabled:opacity-30"
						disabled={project.assets.length <= 1}
						onclick={() => removeAsset(asset.id)}
						title="Delete shape"
						aria-label="Delete shape"
					>
						<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
							><path
								d="M3 6h18 M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"
							/></svg
						>
					</button>
				</div>
			</div>
		{/each}

		{#if error}
			<p class="rounded border border-danger/50 bg-danger/10 px-2 py-1.5 text-[10px] text-danger">
				{error}
			</p>
		{/if}

		<label
			class="mt-2 flex cursor-pointer items-center gap-2 rounded-md border border-line bg-raise px-3 py-2 text-[11px] text-white transition-colors hover:border-accent"
		>
			<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
				><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line
					x1="12"
					y1="3"
					x2="12"
					y2="15"
				/></svg
			>
			Upload SVG shape
			<input type="file" accept=".svg,image/svg+xml" multiple class="hidden" onchange={onSvgUpload} />
		</label>
		<p class="hint">
			Rectangles, circles and polygons are converted to paths automatically. Element transforms are
			not baked in — flatten them in your editor first.
		</p>

		<label
			class="mt-1 flex cursor-pointer items-center gap-2 rounded-md border border-line bg-raise px-3 py-2 text-[11px] text-white transition-colors hover:border-accent"
		>
			<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
				><rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><polyline
					points="21 15 16 10 5 21"
				/></svg
			>
			{project.background ? 'Replace background' : 'Set background'}
			<input type="file" accept="image/*" class="hidden" onchange={onBackgroundUpload} />
		</label>
		{#if project.background}
			<button
				class="text-left text-[10px] text-muted transition-colors hover:text-danger"
				onclick={() => (project.background = null)}>Remove background</button
			>
		{/if}
	</div>
</aside>
