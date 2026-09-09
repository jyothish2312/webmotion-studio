<script>
	import { project, ui, controls } from './lib/state.svelte.js';

	let track = $state(null);
	let scrubbing = $state(false);
	let wasPlaying = false;

	const duration = $derived(ui.duration || 0.001);
	const time = $derived(ui.progress * ui.duration);

	/**
	 * Stops are laid out in SECONDS. `marker.progress` is a position along the
	 * PATH, and holds plus per-segment durations mean the two do not line up —
	 * placing ticks by path progress is why the old scrubber never matched what
	 * was happening on the canvas.
	 */
	const ticks = $derived(
		(ui.stops ?? [])
			.filter((s) => !s.isStart)
			.map((s) => ({ id: s.id, at: s.arriveAt / duration }))
	);

	const holds = $derived(
		(ui.stops ?? [])
			.filter((s) => s.hold > 0)
			.map((s) => ({ id: s.id, left: s.arriveAt / duration, width: s.hold / duration }))
	);

	function positionFrom(event) {
		const rect = track.getBoundingClientRect();
		return Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
	}

	function beginScrub(event) {
		scrubbing = true;
		wasPlaying = ui.isPlaying;
		ui.isPlaying = false;
		track.setPointerCapture(event.pointerId);
		controls.seek?.(positionFrom(event));
	}

	function moveScrub(event) {
		if (!scrubbing) return;
		controls.seek?.(positionFrom(event));
	}

	function endScrub(event) {
		if (!scrubbing) return;
		scrubbing = false;
		if (track.hasPointerCapture?.(event.pointerId)) track.releasePointerCapture(event.pointerId);
		// Resuming after a scrub keeps the flow going, which matters when you are
		// nudging timing and want to keep watching the loop.
		if (wasPlaying) ui.isPlaying = true;
	}

	function toggle() {
		if (!ui.isPlaying && ui.progress >= 0.999 && !project.settings.loop) controls.restart?.();
		ui.isPlaying = !ui.isPlaying;
	}

	function restart() {
		controls.restart?.();
	}

	const atEnd = $derived(ui.progress >= 0.999 && !project.settings.loop);
</script>

<section class="grid h-full grid-cols-[auto_1fr] gap-4 border-t border-line bg-panel px-4">
	<div class="flex items-center gap-2">
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
			onclick={restart}
			title="Back to start"
			aria-label="Back to start"
		>
			<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
				><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /><path d="M3 3v5h5" /></svg
			>
		</button>

		<button
			class="grid h-9 w-9 place-items-center rounded-md border transition-colors {project.settings
				.loop
				? 'border-accent bg-accent/10 text-accent'
				: 'border-line bg-raise text-muted hover:text-white'}"
			onclick={() => (project.settings.loop = !project.settings.loop)}
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

	<div class="flex flex-col justify-center">
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			bind:this={track}
			class="group relative h-10 cursor-ew-resize select-none"
			onpointerdown={beginScrub}
			onpointermove={moveScrub}
			onpointerup={endScrub}
			onpointercancel={endScrub}
		>
			<div class="absolute top-1/2 right-0 left-0 h-1.5 -translate-y-1/2 rounded-full bg-line">
				<div
					class="h-full rounded-full bg-accent"
					style="width: {Math.min(100, ui.progress * 100)}%"
				></div>
			</div>

			<!-- Dwell windows: the object is parked, not travelling. -->
			{#each holds as hold (hold.id)}
				<div
					class="pointer-events-none absolute top-1/2 h-4 -translate-y-1/2 rounded-sm bg-danger/25 ring-1 ring-danger/40"
					style="left: {hold.left * 100}%; width: {Math.max(0.4, hold.width * 100)}%"
				></div>
			{/each}

			{#each ticks as tick (tick.id)}
				<button
					class="absolute top-1/2 h-6 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full transition-transform hover:scale-y-125 {ui.selectedMarkerId ===
					tick.id
						? 'bg-white'
						: 'bg-danger'}"
					style="left: {tick.at * 100}%"
					onpointerdown={(e) => {
						e.stopPropagation();
						ui.selectedMarkerId = tick.id;
					}}
					title="Select marker"
					aria-label="Select marker"
				></button>
			{/each}

			<div
				class="pointer-events-none absolute top-1/2 h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow-md ring-2 ring-ink transition-transform group-hover:scale-110"
				style="left: {Math.min(100, ui.progress * 100)}%"
			></div>
		</div>
	</div>
</section>
