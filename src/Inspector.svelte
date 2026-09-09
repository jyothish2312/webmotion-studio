<script>
	import { project, ui, EASES, selectedMarker } from './lib/state.svelte.js';
	import Section from './ui/Section.svelte';
	import Slider from './ui/Slider.svelte';
	import Toggle from './ui/Toggle.svelte';
	import LookEditor from './ui/LookEditor.svelte';

	const marker = $derived(selectedMarker());
	const settings = $derived(project.settings);

	const MORPH_WHEN = [
		{ value: 'hold', label: 'During the hold — the pickup' },
		{ value: 'segment', label: 'While travelling on' },
		{ value: 'custom', label: 'Custom length' }
	];

	function removeMarker() {
		project.markers = project.markers.filter((m) => m.id !== ui.selectedMarkerId);
		ui.selectedMarkerId = null;
	}
</script>

<aside class="overflow-y-auto border-l border-line bg-panel">
	{#if marker}
		<div class="flex items-center justify-between border-b border-accent/40 bg-accent/10 px-4 py-2.5">
			<span class="text-[11px] font-bold tracking-wider text-white">MARKER</span>
			<button
				class="rounded border border-line px-2 py-0.5 text-[10px] text-muted transition-colors hover:border-danger hover:text-danger"
				onclick={removeMarker}>Delete</button
			>
		</div>

		<Section title="Timing" hint="Arrive here, wait, then travel on to the next stop.">
			<Slider
				label="Position along path"
				bind:value={marker.progress}
				min={0}
				max={1}
				step={0.001}
				decimals={3}
				hint="Drag the red dot on the canvas to place it visually."
			/>
			<Slider
				label="Hold here"
				bind:value={marker.hold}
				min={0}
				max={5}
				step={0.1}
				suffix="s"
				decimals={1}
				hint="A pause. This is what makes a pickup or a landing read as deliberate."
			/>
			<Slider
				label="Travel to next stop"
				bind:value={marker.duration}
				min={0.1}
				max={10}
				step={0.1}
				suffix="s"
				decimals={1}
			/>
			<label class="block">
				<span class="field-label">Easing</span>
				<select bind:value={marker.ease} class="field">
					{#each EASES as ease (ease.value)}
						<option value={ease.value}>{ease.label}</option>
					{/each}
				</select>
			</label>
		</Section>

		<Section title="Shape" hint="Morphs the object into another asset from the library.">
			<label class="block">
				<span class="field-label">Morph into</span>
				<select bind:value={marker.morphTarget} class="field">
					<option value="none">— no change —</option>
					{#each project.assets as asset (asset.id)}
						<option value={asset.id}>{asset.name}</option>
					{/each}
				</select>
			</label>

			{#if marker.morphTarget !== 'none'}
				<div class="mt-3">
					<span class="field-label">When</span>
					<div class="flex flex-col gap-1">
						{#each MORPH_WHEN as option (option.value)}
							<button
								type="button"
								class="rounded-md border px-2 py-1.5 text-left text-[11px] transition-colors {marker.morphType ===
								option.value
									? 'border-accent bg-accent/10 text-white'
									: 'border-line bg-panel-dark text-muted hover:text-white'}"
								onclick={() => (marker.morphType = option.value)}
							>
								{option.label}
							</button>
						{/each}
					</div>
				</div>
				{#if marker.morphType === 'custom'}
					<div class="mt-3">
						<Slider
							label="Morph length"
							bind:value={marker.morphDuration}
							min={0.1}
							max={4}
							step={0.1}
							suffix="s"
							decimals={1}
						/>
					</div>
				{:else if marker.morphType === 'hold' && marker.hold <= 0.02}
					<p class="hint mt-2 text-danger">
						No hold set — the morph will use a 0.5s default. Add a hold above to control it.
					</p>
				{/if}
			{/if}
		</Section>

		<Section title="Appearance">
			<LookEditor state={marker.state} label="Look on arrival" />
			<label class="block">
				<span class="field-label">Extra CSS classes</span>
				<input
					type="text"
					bind:value={marker.classes}
					class="field font-mono text-[11px]"
					placeholder="applied instantly on arrival"
				/>
				<p class="hint mt-1">
					Snapped on, not tweened. Classes must exist in your stylesheet to have any effect.
				</p>
			</label>
		</Section>
	{:else}
		<Section title="Object">
			<label class="mb-3 block">
				<span class="field-label">Starting shape</span>
				<select bind:value={settings.startingAssetId} class="field">
					{#each project.assets as asset (asset.id)}
						<option value={asset.id}>{asset.name}</option>
					{/each}
				</select>
			</label>
			<Slider
				label="Size"
				bind:value={settings.objectSize}
				min={12}
				max={220}
				step={2}
				suffix="px"
				decimals={0}
			/>
			<Toggle
				label="Rotate along path"
				bind:checked={settings.autoRotate}
				hint="Points the object down the direction of travel."
			/>
			{#if settings.autoRotate}
				<Slider
					label="Rotation offset"
					bind:value={settings.rotationOffset}
					min={-180}
					max={180}
					step={5}
					suffix="°"
					decimals={0}
					hint="Correct for artwork that is not drawn facing right."
				/>
			{/if}
			<Toggle
				label="Rotational morphing"
				bind:checked={settings.rotationalMorph}
				hint="Usually smoother for icon-to-icon morphs. Turn off if a morph turns inside out."
			/>
		</Section>

		<Section title="Path & loop">
			<Toggle label="Close the path" bind:checked={settings.closedPath} />
			{#if settings.closedPath}
				<Slider
					label="Closing curve tension"
					bind:value={settings.loopTension}
					min={0}
					max={2}
					step={0.1}
					decimals={1}
				/>
			{/if}
			<Toggle label="Loop forever" bind:checked={settings.loop} />
			{#if settings.loop}
				<Toggle
					label="Ping-pong"
					bind:checked={settings.yoyo}
					hint="Play forwards then backwards instead of jumping back to the start."
				/>
			{/if}
		</Section>

		<Section title="First segment" hint="From the start of the path up to the first marker.">
			<Slider
				label="Hold at start"
				bind:value={settings.startHold}
				min={0}
				max={5}
				step={0.1}
				suffix="s"
				decimals={1}
			/>
			<Slider
				label="Travel to first marker"
				bind:value={settings.startDuration}
				min={0.1}
				max={10}
				step={0.1}
				suffix="s"
				decimals={1}
			/>
			<label class="mb-3 block">
				<span class="field-label">Easing</span>
				<select bind:value={settings.startEase} class="field">
					{#each EASES as ease (ease.value)}
						<option value={ease.value}>{ease.label}</option>
					{/each}
				</select>
			</label>
			<LookEditor state={settings.startState} label="Look at the start" />
			<label class="block">
				<span class="field-label">Extra CSS classes</span>
				<input type="text" bind:value={settings.startClasses} class="field font-mono text-[11px]" />
			</label>
		</Section>

		<Section
			title="Idle life"
			hint="Continuous secondary motion. Runs on its own clock, independent of the timeline — this is the difference between a sprite sliding along a line and something that feels airborne."
		>
			<Toggle label="Enabled" bind:checked={settings.life.enabled} />
			{#if settings.life.enabled}
				<Slider label="Bob height" bind:value={settings.life.bob} min={0} max={20} step={0.5} suffix="px" decimals={1} />
				<Slider label="Bob period" bind:value={settings.life.bobSpeed} min={0.2} max={5} step={0.1} suffix="s" decimals={1} />
				<Slider label="Sway angle" bind:value={settings.life.sway} min={0} max={30} step={0.5} suffix="°" decimals={1} />
				<Slider label="Sway period" bind:value={settings.life.swaySpeed} min={0.2} max={5} step={0.1} suffix="s" decimals={1} />
				<Slider label="Breathe" bind:value={settings.life.pulse} min={0} max={0.2} step={0.005} decimals={3} />
				<Slider label="Breathe period" bind:value={settings.life.pulseSpeed} min={0.2} max={5} step={0.1} suffix="s" decimals={1} />
			{/if}
		</Section>

		<Section
			title="Motion trail"
			hint="Ghost copies replaying earlier frames. They bunch up when the object slows and stretch when it accelerates, which reads as speed."
		>
			<Toggle label="Enabled" bind:checked={settings.trail.enabled} />
			{#if settings.trail.enabled}
				<Slider label="Ghosts" bind:value={settings.trail.count} min={1} max={12} step={1} decimals={0} />
				<Slider label="Spacing" bind:value={settings.trail.lag} min={1} max={12} step={1} decimals={0} hint="Frames of delay between each ghost." />
				<Slider label="Opacity" bind:value={settings.trail.opacity} min={0.05} max={1} step={0.05} decimals={2} />
			{/if}
		</Section>
	{/if}
</aside>
