<script>
	import { ui, controls, activeScene, activeTrack } from './lib/state.svelte.js';

	const scene = $derived(activeScene());
	const selected = $derived(activeTrack());

	let trackEl = $state(null);
	let scrubbing = $state(false);
	let laneDrag = $state(null);
	let wasPlaying = false;

	const duration = $derived(ui.duration || 0.001);
	const time = $derived(ui.progress * ui.duration);
	const lanes = $derived(ui.lanes ?? []);

	/**
	 * Lanes are laid out in SECONDS of scene time. `marker.progress` is a position
	 * along a PATH, and holds plus per-segment durations mean the two do not line
	 * up — placing ticks by path progress is why the old scrubber never matched
	 * what was happening on the canvas.
	 */
	function laneGeometry(lane) {
		return {
			left: (lane.offset / duration) * 100,
			width: (lane.duration / duration) * 100,
			ticks: lane.stops
				.filter((s) => !s.isStart)
				.map((s) => ({ id: s.id, at: ((lane.offset + s.arriveAt) / duration) * 100 })),
			holds: lane.stops
				.filter((s) => s.hold > 0)
				.map((s) => ({
					id: s.id,
					left: ((lane.offset + s.arriveAt) / duration) * 100,
					width: (s.hold / duration) * 100
				}))
		};
	}

	function fractionFrom(event) {
		const rect = trackEl.getBoundingClientRect();
		return Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
	}

	function beginScrub(event) {
		if (scrubbing || laneDrag) return;
		scrubbing = true;
		wasPlaying = ui.isPlaying;
		ui.isPlaying = false;
		trackEl.setPointerCapture(event.pointerId);
		controls.seek?.(fractionFrom(event));
	}

	function moveScrub(event) {
		if (laneDrag) {
			// Dragging a lane body sets that track's start offset — the one piece of
			// timing that couples tracks inside a scene.
			const delta = (fractionFrom(event) - laneDrag.grabbedAt) * duration;
			laneDrag.track.offset = Math.max(0, Math.round((laneDrag.from + delta) * 100) / 100);
			return;
		}
		if (!scrubbing) return;
		controls.seek?.(fractionFrom(event));
	}

	function endDrag(event) {
		if (trackEl?.hasPointerCapture?.(event.pointerId)) {
			trackEl.releasePointerCapture(event.pointerId);
		}
		if (scrubbing) {
			scrubbing = false;
			// Resuming after a scrub keeps the flow going, which matters when you are
			// nudging timing and want to keep watching the loop.
			if (wasPlaying) ui.isPlaying = true;
		}
		laneDrag = null;
	}

	function beginLaneDrag(event, lane) {
		event.stopPropagation();
		ui.selectedTrackId = lane.id;
		laneDrag = { track: lane.track, from: lane.offset, grabbedAt: fractionFrom(event) };
		trackEl.setPointerCapture(event.pointerId);
	}

	function toggle() {
		if (!ui.isPlaying && ui.progress >= 0.999 && !scene?.loop) controls.restart?.();
		ui.isPlaying = !ui.isPlaying;
	}

	const atEnd = $derived(ui.progress >= 0.999 && !scene?.loop);

	/** Second markings, at whatever spacing keeps them from colliding. */
	const rulerTicks = $derived.by(() => {
		const total = ui.duration;
		if (!total || total < 0.5) return [];
		const step = total > 40 ? 10 : total > 16 ? 5 : total > 6 ? 2 : 1;
		const out = [];
		for (let t = 0; t <= total + 1e-6; t += step) {
			out.push({ at: (t / total) * 100, label: `${Math.round(t)}s` });
		}
		return out;
	});
</script>

<section class="grid h-full min-h-0 grid-cols-[auto_1fr] gap-4 bg-panel px-4">
	<div class="flex items-start gap-2 pt-3">
		<button
			class="grid h-9 w-11 place-items-center rounded-md border border-line bg-raise transition-colors hover:bg-accent hover:text-ink"
			onclick={toggle}
			title="Play / pause (Space)"
			aria-label="Play or pause"
		>
			{#if ui.isPlaying}
				<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"
					><rect x="6" y="4" width="4" height="16" /><rect x="14" y="4" width="4" height="16" /></svg
				>
			{:else}
				<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"
					><polygon points="5 3 19 12 5 21 5 3" /></svg
				>
			{/if}
		</button>

		<button
			class="grid h-9 w-9 place-items-center rounded-md border border-line bg-raise text-muted transition-colors hover:text-white {atEnd
				? 'border-accent text-accent'
				: ''}"
			onclick={() => controls.restart?.()}
			title="Back to start"
			aria-label="Back to start"
		>
			<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
				><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /></svg
			>
		</button>

		<button
			class="grid h-9 w-9 place-items-center rounded-md border transition-colors {scene?.loop
				? 'border-accent bg-accent/10 text-accent'
				: 'border-line bg-raise text-muted hover:text-white'}"
			onclick={() => scene && (scene.loop = !scene.loop)}
			title="Loop"
			aria-label="Toggle loop"
		>
			<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
				><path d="M17 2l4 4-4 4" /><path d="M3 11v-1a4 4 0 0 1 4-4h14" /><path d="M7 22l-4-4 4-4" /><path
					d="M21 13v1a4 4 0 0 1-4 4H3"
				/></svg
			>
		</button>

		<div class="ml-2 w-28 font-mono text-xs text-muted tabular-nums">
			<span class="text-white">{time.toFixed(2)}</span> / {ui.duration.toFixed(2)}s
		</div>
	</div>

	<!--
		The ruler scrubs; the lanes below select a track and drag its offset. They
		have to be separate targets: with a single full-width track the lane body
		covers the whole bar, leaving nowhere to click for a scrub.

		The lane stack scrolls, so adding tracks never pushes the ruler or the
		transport out of view no matter how short the panel is dragged.
	-->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		bind:this={trackEl}
		class="relative flex min-h-0 touch-none flex-col gap-1 py-2 select-none"
		onpointermove={moveScrub}
		onpointerup={endDrag}
		onpointercancel={endDrag}
	>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="relative h-4 shrink-0 cursor-ew-resize rounded-sm bg-panel-dark/80 ring-1 ring-line/70"
			onpointerdown={beginScrub}
			title="Drag to scrub"
			data-scrub-ruler
		>
			<div
				class="pointer-events-none absolute inset-y-0 left-0 rounded-l-sm bg-accent/25"
				style="width: {Math.min(100, ui.progress * 100)}%"
			></div>
			{#each rulerTicks as t (t.at)}
				<span
					class="pointer-events-none absolute top-full mt-0.5 -translate-x-1/2 font-mono text-[8px] text-muted"
					style="left: {t.at}%">{t.label}</span
				>
			{/each}
		</div>

		<div class="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto pt-2.5">
		{#each lanes as lane (lane.id)}
			{@const g = laneGeometry(lane)}
			{@const isSelected = lane.id === selected?.id}
			<div class="relative h-5">
				<div class="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-line/60"></div>

				<!-- The lane body. Drag it sideways to set track.offset. -->
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<div
					class="absolute top-1/2 h-4 -translate-y-1/2 cursor-grab rounded-sm border transition-colors {isSelected
						? 'border-accent/70 bg-accent/25'
						: 'border-line bg-raise/70 hover:border-accent/40'}"
					style="left: {g.left}%; width: {Math.max(0.6, g.width)}%"
					onpointerdown={(e) => beginLaneDrag(e, lane)}
					title="{lane.name} — drag to change its start offset"
				>
					<span
						class="pointer-events-none absolute inset-y-0 left-1.5 flex items-center truncate text-[9px] leading-none {isSelected
							? 'text-white'
							: 'text-muted'}"
					>
						{lane.name}
					</span>
				</div>

				{#each g.holds as hold (hold.id)}
					<div
						class="pointer-events-none absolute top-1/2 h-4 -translate-y-1/2 rounded-sm bg-danger/30 ring-1 ring-danger/50"
						style="left: {hold.left}%; width: {Math.max(0.4, hold.width)}%"
					></div>
				{/each}

				{#each g.ticks as tick (tick.id)}
					<button
						class="absolute top-1/2 h-5 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full transition-transform hover:scale-y-125 {ui.selectedMarkerId ===
						tick.id
							? 'bg-white'
							: 'bg-danger'}"
						style="left: {tick.at}%"
						onpointerdown={(e) => {
							e.stopPropagation();
							ui.selectedTrackId = lane.id;
							ui.selectedMarkerId = tick.id;
						}}
						title="Select marker"
						aria-label="Select marker"
					></button>
				{/each}
			</div>
		{/each}
		</div>

		<!-- Playhead spans every lane, with its grip sitting on the ruler. -->
		<div
			class="pointer-events-none absolute inset-y-2 w-px -translate-x-1/2 bg-white/70"
			style="left: {Math.min(100, ui.progress * 100)}%"
		></div>
		<div
			class="pointer-events-none absolute top-1.5 h-2.5 w-2.5 -translate-x-1/2 rotate-45 bg-white shadow-md"
			style="left: {Math.min(100, ui.progress * 100)}%"
		></div>
	</div>
</section>
