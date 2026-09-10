<script>
	import {
		project,
		ui,
		activeLayout,
		activeTrack,
		addTrack,
		removeTrack,
		moveTrack
	} from './lib/state.svelte.js';
	import { makeTrack } from './lib/model.js';
	import Section from './ui/Section.svelte';

	const layout = $derived(activeLayout());
	const selected = $derived(activeTrack());
	const tracks = $derived(layout?.tracks ?? []);

	function add() {
		const n = tracks.length + 1;
		addTrack(
			makeTrack({
				name: `Object ${n}`,
				startingAssetId: project.assets[0]?.id,
				// Stagger new tracks so they do not land exactly on top of each other.
				offset: 0,
				points: undefined
			})
		);
	}

	function duplicate(track) {
		const copy = makeTrack({
			...$state.snapshot(track),
			id: undefined,
			name: `${track.name} copy`
		});
		addTrack(copy);
	}
</script>

<Section title="Tracks" id="tracks" badge={tracks.length}>
	<div class="flex flex-col gap-1">
	{#each tracks as track, i (track.id)}
		{@const isSelected = track.id === selected?.id}
		<div
			class="group flex items-center gap-0.5 rounded-md border px-2 py-1.5 text-[12px] transition-colors {isSelected
				? 'border-accent/60 bg-accent/10'
				: 'border-line bg-panel-dark'}"
		>
			<button
				class="min-w-0 flex-1 truncate text-left {isSelected ? 'text-white' : 'text-muted'}"
				onclick={() => {
					ui.selectedTrackId = track.id;
					ui.selectedMarkerId = null;
					ui.selectedPointIndex = null;
				}}
				ondblclick={() => (ui.renamingTrackId = track.id)}
				title="{track.name} — click to select, double-click to rename"
			>
				{#if ui.renamingTrackId === track.id}
					<!-- svelte-ignore a11y_autofocus -->
					<input
						class="field px-1 py-0 text-[12px]"
						bind:value={track.name}
						autofocus
						onblur={() => (ui.renamingTrackId = null)}
						onkeydown={(e) => e.key === 'Enter' && (ui.renamingTrackId = null)}
					/>
				{:else}
					{track.name}
				{/if}
			</button>

			{#if track.offset > 0}
				<span
					class="shrink-0 rounded bg-raise px-1 font-mono text-[9px] text-muted tabular-nums"
					title="Starts {track.offset}s into the scene">+{track.offset.toFixed(1)}s</span
				>
			{/if}

			<!-- Always reachable: which tracks you can see. -->
			<button
				class="shrink-0 px-1 text-[10px] transition-colors {track.solo
					? 'text-point'
					: 'text-muted/60 hover:text-white'}"
				onclick={() => (track.solo = !track.solo)}
				title={track.solo ? 'Stop soloing' : 'Solo — show only this track'}
				aria-label="Solo track">S</button
			>
			<button
				class="shrink-0 px-1 text-[10px] transition-colors {track.hidden
					? 'text-danger'
					: 'text-muted/60 hover:text-white'}"
				onclick={() => (track.hidden = !track.hidden)}
				title={track.hidden ? 'Show track' : 'Hide track'}
				aria-label={track.hidden ? 'Show track' : 'Hide track'}
			>
				{track.hidden ? '◌' : '●'}
			</button>

			<!-- Housekeeping stays out of the way until you go looking for it. -->
			<span
				class="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100 {isSelected
					? 'opacity-100'
					: ''}"
			>
				<button
					class="px-0.5 text-[10px] text-muted transition-colors hover:text-white disabled:opacity-25"
					disabled={i === 0}
					onclick={() => moveTrack(track.id, -1)}
					title="Move up"
					aria-label="Move up">▲</button
				>
				<button
					class="px-0.5 text-[10px] text-muted transition-colors hover:text-white disabled:opacity-25"
					disabled={i === tracks.length - 1}
					onclick={() => moveTrack(track.id, 1)}
					title="Move down"
					aria-label="Move down">▼</button
				>
				<button
					class="px-0.5 text-[10px] text-muted transition-colors hover:text-accent"
					onclick={() => duplicate(track)}
					title="Duplicate track"
					aria-label="Duplicate track">⧉</button
				>
				<button
					class="px-0.5 text-[10px] text-muted transition-colors hover:text-danger disabled:opacity-25"
					disabled={tracks.length <= 1}
					onclick={() => removeTrack(track.id)}
					title="Delete track"
					aria-label="Delete track">✕</button
				>
			</span>
		</div>
	{/each}

	<button
		class="mt-1 rounded-md border border-line bg-raise px-2 py-1.5 text-[11px] text-white transition-colors hover:border-accent"
		onclick={add}
	>
		+ Add track
	</button>
		<p class="hint mt-1">
			Tracks in a scene share one timeline — drag a lane in the scrubber to set when it starts.
		</p>
	</div>
</Section>
