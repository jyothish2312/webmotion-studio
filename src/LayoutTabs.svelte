<script>
	import {
		ui,
		DEVICES,
		activeScene,
		activeLayout,
		addLayout,
		removeLayout,
		moveLayout
	} from './lib/state.svelte.js';
	import { makeLayout } from './lib/model.js';

	const scene = $derived(activeScene());
	const layout = $derived(activeLayout());
	const layouts = $derived(scene?.layouts ?? []);

	const PRESETS = [
		{ name: 'desktop', viewBox: { w: 1200, h: 700 }, minWidth: 1024 },
		{ name: 'tablet', viewBox: { w: 900, h: 800 }, minWidth: 640 },
		{ name: 'mobile', viewBox: { w: 420, h: 800 }, minWidth: 0 }
	];

	function addPreset() {
		const used = new Set(layouts.map((l) => l.name));
		const preset = PRESETS.find((p) => !used.has(p.name)) ?? {
			name: `layout ${layouts.length + 1}`,
			viewBox: { w: 1200, h: 700 },
			minWidth: 0
		};

		// Copy the current tracks so a new layout starts from the one you tuned,
		// rather than an empty stage. Duplicate-and-adjust is the workflow.
		addLayout(
			makeLayout({
				name: preset.name,
				viewBox: preset.viewBox,
				background: layout?.background ?? null,
				tracks: layout
					? $state.snapshot(layout.tracks).map((t) => ({ ...t, id: undefined }))
					: undefined
			})
		);
		relayer();
	}

	/**
	 * Rebuilds the breakpoint ladder after a preset is added.
	 *
	 * Matching is "first match wins, last is the fallback", so a catch-all sitting
	 * first would swallow every size — which is exactly what the default layout
	 * did. Order preset layouts widest-first, give each its lower bound, and clear
	 * the bound on the last so it stays the fallback. Custom layouts and manual
	 * bounds set in the Inspector are left alone.
	 */
	function relayer() {
		const rank = (l) => {
			const i = PRESETS.findIndex((p) => p.name === l.name);
			return i === -1 ? PRESETS.length : i;
		};
		const ordered = [...scene.layouts].sort((a, b) => rank(a) - rank(b));
		ordered.forEach((l, i) => {
			const preset = PRESETS.find((p) => p.name === l.name);
			const isLast = i === ordered.length - 1;
			if (!preset) return;
			l.match = isLast || !preset.minWidth ? {} : { minWidth: preset.minWidth };
		});
		scene.layouts = ordered;
	}
</script>

<div class="flex items-center gap-1 border-b border-line bg-panel px-3 py-1.5 text-[11px]">
	<span class="mr-1 font-bold tracking-wider text-muted">LAYOUT</span>

	{#each layouts as l, i (l.id)}
		<button
			class="rounded-md border px-2 py-1 transition-colors {l.id === layout?.id
				? 'border-accent bg-accent/10 text-white'
				: 'border-line bg-raise text-muted hover:text-white'}"
			onclick={() => {
				ui.activeLayoutId = l.id;
				ui.selectedTrackId = l.tracks[0]?.id ?? null;
				ui.selectedMarkerId = null;
			}}
			ondblclick={() => (ui.renamingLayoutId = l.id)}
			title="{l.viewBox.w}×{l.viewBox.h}{l.match.minWidth ? ` · ≥${l.match.minWidth}px` : ''}"
		>
			{#if ui.renamingLayoutId === l.id}
				<!-- svelte-ignore a11y_autofocus -->
				<input
					class="field w-20 px-1 py-0 text-[11px]"
					bind:value={l.name}
					autofocus
					onblur={() => (ui.renamingLayoutId = null)}
					onkeydown={(e) => e.key === 'Enter' && (ui.renamingLayoutId = null)}
				/>
			{:else}
				{l.name}
				<span class="ml-1 text-[9px] text-muted">{l.viewBox.w}×{l.viewBox.h}</span>
			{/if}
		</button>
		{#if l.id === layout?.id && layouts.length > 1}
			<button
				class="px-0.5 text-[10px] text-muted hover:text-white disabled:opacity-25"
				disabled={i === 0}
				onclick={() => moveLayout(l.id, -1)}
				title="Earlier in the match order"
				aria-label="Move layout earlier">◀</button
			>
			<button
				class="px-0.5 text-[10px] text-muted hover:text-white disabled:opacity-25"
				disabled={i === layouts.length - 1}
				onclick={() => moveLayout(l.id, 1)}
				title="Later in the match order"
				aria-label="Move layout later">▶</button
			>
			<button
				class="px-0.5 text-[10px] text-muted hover:text-danger"
				onclick={() => removeLayout(l.id)}
				title="Delete layout"
				aria-label="Delete layout">✕</button
			>
		{/if}
	{/each}

	<button
		class="rounded-md border border-line bg-raise px-2 py-1 text-muted transition-colors hover:border-accent hover:text-white"
		onclick={addPreset}
		title="Duplicate the current tracks into a new layout">+</button
	>

	<span class="ml-auto text-[10px] text-muted">first match wins · last is the fallback</span>

	{#if ui.preview}
		<div class="ml-3 flex items-center gap-1">
			{#each DEVICES as device (device.id)}
				<button
					class="rounded border px-2 py-0.5 text-[10px] transition-colors {ui.previewDevice ===
					device.id
						? 'border-accent bg-accent/10 text-accent'
						: 'border-line bg-raise text-muted hover:text-white'}"
					onclick={() => (ui.previewDevice = device.id)}
					title={device.width ? `${device.width}px wide` : 'Fill the canvas'}
				>
					{device.label}
				</button>
			{/each}
		</div>
	{/if}
</div>
