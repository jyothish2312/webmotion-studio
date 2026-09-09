<script>
	import { hydrateAsset } from '../lib/svg.js';
	import Slider from './Slider.svelte';

	/**
	 * Corrects the artwork itself — tilt, mirror, size, nudge — as opposed to
	 * anything the animation does to it.
	 *
	 * Deliberately not a path editor: five dials cover essentially every "my SVG
	 * is facing the wrong way" case, and redrawing belongs in a vector tool.
	 * Re-hydrating on change re-measures the asset so the canvas updates live.
	 */
	let { asset } = $props();

	function touched() {
		hydrateAsset(asset);
		// Break identity so anything deriving from the asset list re-runs.
		asset.adjust = { ...asset.adjust };
	}

	function spin(delta) {
		asset.adjust.rotate = ((((asset.adjust.rotate + delta) % 360) + 540) % 360) - 180;
		touched();
	}

	function reset() {
		asset.adjust.rotate = 0;
		asset.adjust.flipX = false;
		asset.adjust.flipY = false;
		asset.adjust.scale = 1;
		asset.adjust.nudgeX = 0;
		asset.adjust.nudgeY = 0;
		touched();
	}

	const dirty = $derived(
		asset.adjust.rotate !== 0 ||
			asset.adjust.flipX ||
			asset.adjust.flipY ||
			asset.adjust.scale !== 1 ||
			asset.adjust.nudgeX !== 0 ||
			asset.adjust.nudgeY !== 0
	);
</script>

<div class="mt-2 rounded-md border border-line bg-panel-dark/60 p-2.5">
	<div class="mb-2 flex items-center justify-between">
		<span class="field-label mb-0">Adjust artwork</span>
		{#if dirty}
			<button class="text-[10px] text-muted transition-colors hover:text-white" onclick={reset}>
				reset
			</button>
		{/if}
	</div>

	<div class="mb-2 flex flex-wrap gap-1">
		<button
			class="rounded border border-line bg-raise px-2 py-1 text-[10px] transition-colors hover:border-accent"
			onclick={() => spin(-90)}>⟲ 90°</button
		>
		<button
			class="rounded border border-line bg-raise px-2 py-1 text-[10px] transition-colors hover:border-accent"
			onclick={() => spin(90)}>⟳ 90°</button
		>
		<button
			class="rounded border px-2 py-1 text-[10px] transition-colors {asset.adjust.flipX
				? 'border-accent bg-accent/10 text-accent'
				: 'border-line bg-raise hover:border-accent'}"
			onclick={() => {
				asset.adjust.flipX = !asset.adjust.flipX;
				touched();
			}}>flip ↔</button
		>
		<button
			class="rounded border px-2 py-1 text-[10px] transition-colors {asset.adjust.flipY
				? 'border-accent bg-accent/10 text-accent'
				: 'border-line bg-raise hover:border-accent'}"
			onclick={() => {
				asset.adjust.flipY = !asset.adjust.flipY;
				touched();
			}}>flip ↕</button
		>
	</div>

	<Slider
		label="Rotate"
		bind:value={asset.adjust.rotate}
		min={-180}
		max={180}
		step={1}
		suffix="°"
		decimals={0}
		onchange={touched}
	/>
	<Slider
		label="Scale"
		bind:value={asset.adjust.scale}
		min={0.2}
		max={3}
		step={0.05}
		decimals={2}
		onchange={touched}
	/>
	<Slider
		label="Nudge X"
		bind:value={asset.adjust.nudgeX}
		min={-50}
		max={50}
		step={1}
		decimals={0}
		onchange={touched}
	/>
	<Slider
		label="Nudge Y"
		bind:value={asset.adjust.nudgeY}
		min={-50}
		max={50}
		step={1}
		decimals={0}
		onchange={touched}
	/>
	<p class="hint">Applies wherever this shape is used, and eases between shapes on a morph.</p>
</div>
