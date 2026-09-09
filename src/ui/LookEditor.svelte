<script>
	import Slider from './Slider.svelte';

	/**
	 * Edits one keyframe's appearance. These are real tweenable GSAP values, not
	 * CSS classes — which is what lets the look scrub backwards and forwards with
	 * the rest of the timeline.
	 */
	let { state, label = 'Look at this stop' } = $props();
</script>

<div class="mb-3 rounded-md border border-line bg-panel-dark/60 p-3">
	<p class="field-label">{label}</p>

	<Slider label="Scale" bind:value={state.scale} min={0} max={3} step={0.05} decimals={2} />
	<Slider
		label="Rotation"
		bind:value={state.rotate}
		min={-180}
		max={180}
		step={1}
		suffix="°"
		decimals={0}
	/>
	<Slider label="Opacity" bind:value={state.opacity} min={0} max={1} step={0.05} decimals={2} />
	<Slider
		label="Stroke width"
		bind:value={state.strokeWidth}
		min={0}
		max={12}
		step={0.5}
		decimals={1}
	/>

	<div class="grid grid-cols-2 gap-2">
		<label class="block">
			<span class="field-label">Stroke</span>
			<div class="flex items-center gap-2">
				<input
					type="color"
					bind:value={state.stroke}
					class="h-7 w-8 shrink-0 cursor-pointer rounded border border-line bg-transparent"
				/>
				<input type="text" bind:value={state.stroke} class="field font-mono text-[11px]" />
			</div>
		</label>
		<label class="block">
			<span class="field-label">Fill</span>
			<div class="flex items-center gap-2">
				<button
					type="button"
					class="h-7 shrink-0 rounded border border-line px-2 text-[10px] text-muted hover:text-white"
					onclick={() => (state.fill = state.fill === 'none' ? '#58a6ff' : 'none')}
				>
					{state.fill === 'none' ? 'none' : 'set'}
				</button>
				<input type="text" bind:value={state.fill} class="field font-mono text-[11px]" />
			</div>
		</label>
	</div>
</div>
