<script>
	import {
		project,
		ui,
		EASES,
		TRIGGERS,
		selectedMarker,
		activeScene,
		activeLayout,
		activeTrack
	} from './lib/state.svelte.js';
	import Section from './ui/Section.svelte';
	import Slider from './ui/Slider.svelte';
	import Toggle from './ui/Toggle.svelte';
	import LookEditor from './ui/LookEditor.svelte';

	const marker = $derived(selectedMarker());
	const scene = $derived(activeScene());
	const layout = $derived(activeLayout());
	const track = $derived(activeTrack());
	const settings = $derived(track?.settings ?? null);

	/** `undefined` in the model means "no bound"; the inputs use empty string. */
	function bound(value) {
		return value == null ? '' : String(value);
	}
	function setBound(key, raw) {
		const n = Number(raw);
		if (raw === '' || !Number.isFinite(n)) delete layout.match[key];
		else layout.match[key] = n;
		layout.match = { ...layout.match };
	}

	const MORPH_WHEN = [
		{ value: 'hold', label: 'During the hold — the pickup' },
		{ value: 'segment', label: 'While travelling on' },
		{ value: 'custom', label: 'Custom length' }
	];

	function removeMarker() {
		if (!track) return;
		track.markers = track.markers.filter((m) => m.id !== ui.selectedMarkerId);
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
	{:else if track && scene}
		<Section title="Scene" hint="Applies to every track in this scene.">
			<label class="mb-3 block">
				<span class="field-label">Scene name</span>
				<input type="text" bind:value={scene.name} class="field" />
			</label>
			<Toggle label="Loop forever" bind:checked={scene.loop} />
			{#if scene.loop}
				<Toggle
					label="Ping-pong"
					bind:checked={scene.yoyo}
					hint="Play forwards then backwards instead of jumping back to the start."
				/>
			{/if}

			<label class="mt-3 mb-2 block">
				<span class="field-label">Starts on a page when</span>
				<select bind:value={scene.trigger.type} class="field">
					{#each TRIGGERS as t (t.value)}
						<option value={t.value}>{t.label}</option>
					{/each}
				</select>
			</label>
			{#if scene.trigger.type === 'visible-amount'}
				<Slider
					label="Visible share needed"
					bind:value={scene.trigger.amount}
					min={0.05}
					max={1}
					step={0.05}
					decimals={2}
				/>
			{/if}
			{#if scene.trigger.type !== 'manual'}
				<Slider
					label="Delay after triggering"
					bind:value={scene.trigger.delay}
					min={0}
					max={5}
					step={0.1}
					suffix="s"
					decimals={1}
				/>
			{/if}
			<p class="hint">
				Read only by the page runtime — the editor always plays on demand. Scenes on a page each
				get their own timeline and trigger.
			</p>
		</Section>

		<Section
			title="Layout"
			hint="The stage for this breakpoint. Layouts are matched in tab order — first match wins, and the last one is the fallback."
		>
			<label class="mb-3 block">
				<span class="field-label">Name</span>
				<input type="text" bind:value={layout.name} class="field" />
			</label>
			<div class="mb-3 grid grid-cols-2 gap-2">
				<label class="block">
					<span class="field-label">Stage width</span>
					<input type="number" min="1" bind:value={layout.viewBox.w} class="field" />
				</label>
				<label class="block">
					<span class="field-label">Stage height</span>
					<input type="number" min="1" bind:value={layout.viewBox.h} class="field" />
				</label>
			</div>
			<div class="mb-3 grid grid-cols-2 gap-2">
				<label class="block">
					<span class="field-label">Min container px</span>
					<input
						type="number"
						class="field"
						placeholder="any"
						value={bound(layout.match.minWidth)}
						oninput={(e) => setBound('minWidth', e.currentTarget.value)}
					/>
				</label>
				<label class="block">
					<span class="field-label">Max container px</span>
					<input
						type="number"
						class="field"
						placeholder="any"
						value={bound(layout.match.maxWidth)}
						oninput={(e) => setBound('maxWidth', e.currentTarget.value)}
					/>
				</label>
			</div>
			<label class="block">
				<span class="field-label">Fit</span>
				<select bind:value={layout.fit} class="field">
					<option value="slice">Cover — fill the container, crop the edges</option>
					<option value="meet">Contain — show it all, letterbox</option>
				</select>
			</label>
		</Section>

		<Section title="Track" hint="This object only.">
			<label class="mb-3 block">
				<span class="field-label">Name</span>
				<input type="text" bind:value={track.name} class="field" />
			</label>
			<Slider
				label="Starts after"
				bind:value={track.offset}
				min={0}
				max={20}
				step={0.1}
				suffix="s"
				decimals={1}
				hint="Where this track sits on the scene timeline. The one thing that couples tracks to each other."
			/>
		</Section>

		<Section title="Object">
			<label class="mb-3 block">
				<span class="field-label">Starting shape</span>
				<select bind:value={track.startingAssetId} class="field">
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

		<Section title="Path">
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
			title="Physicality"
			hint="Procedural secondary motion: springs and noise, not keyframes. It runs on wall-clock time, so a paused frame snaps to its target and stays reproducible."
		>
			<Toggle
				label="Momentum"
				bind:checked={settings.momentum.enabled}
				hint="A spring chases the path heading instead of snapping to it, so the nose swings wide on a corner and settles."
			/>
			{#if settings.momentum.enabled}
				<Slider label="Responsiveness" bind:value={settings.momentum.responsiveness} min={0.5} max={12} step={0.1} decimals={1} />
				<Slider label="Overshoot" bind:value={settings.momentum.overshoot} min={0.05} max={1.5} step={0.05} decimals={2} hint="Below 1 rings; 1 settles clean." />
				<Slider label="Bank into turns" bind:value={settings.momentum.bank} min={0} max={45} step={1} suffix="°" decimals={0} />
				<Slider label="Pitch on speed change" bind:value={settings.momentum.pitch} min={0} max={30} step={1} suffix="°" decimals={0} />
			{/if}

			<Toggle
				label="Off-weight"
				bind:checked={settings.weight.enabled}
				hint="The body tilts against its own sideways acceleration, then overshoots back. Fakes mass."
			/>
			{#if settings.weight.enabled}
				<Slider label="Weight" bind:value={settings.weight.amount} min={0} max={45} step={1} suffix="°" decimals={0} />
				<Slider label="Responsiveness" bind:value={settings.weight.responsiveness} min={0.3} max={8} step={0.1} decimals={1} />
				<Slider label="Overshoot" bind:value={settings.weight.overshoot} min={0.05} max={1.5} step={0.05} decimals={2} />
			{/if}

			<Toggle label="Settle on arrival" bind:checked={settings.settle.enabled} hint="A damped wobble each time it reaches a marker." />
			{#if settings.settle.enabled}
				<Slider label="Settle angle" bind:value={settings.settle.amount} min={0} max={30} step={1} suffix="°" decimals={0} />
				<Slider label="Settle length" bind:value={settings.settle.duration} min={0.1} max={2} step={0.1} suffix="s" decimals={1} />
			{/if}

			<Toggle label="Recoil on morph" bind:checked={settings.morphRecoil.enabled} hint="A scale punch when the shape changes, so a grab lands." />
			{#if settings.morphRecoil.enabled}
				<Slider label="Recoil" bind:value={settings.morphRecoil.scale} min={0} max={0.5} step={0.01} decimals={2} />
				<Slider label="Recoil length" bind:value={settings.morphRecoil.duration} min={0.05} max={1} step={0.05} suffix="s" decimals={2} />
			{/if}
		</Section>

		<Section
			title="Idle life"
			hint="Continuous secondary motion. Runs on its own clock, independent of the timeline — this is the difference between a sprite sliding along a line and something that feels airborne."
		>
			<Toggle label="Enabled" bind:checked={settings.life.enabled} />
			{#if settings.life.enabled}
				<div class="mb-3">
					<span class="field-label">Character</span>
					<div class="flex gap-1">
						{#each [['sine', 'Mechanical'], ['organic', 'Organic']] as [value, label] (value)}
							<button
								type="button"
								class="flex-1 rounded-md border px-2 py-1.5 text-[11px] transition-colors {settings.life
									.mode === value
									? 'border-accent bg-accent/10 text-white'
									: 'border-line bg-panel-dark text-muted hover:text-white'}"
								onclick={() => (settings.life.mode = value)}
							>
								{label}
							</button>
						{/each}
					</div>
					<p class="hint mt-1">
						Sine loops repeat exactly and read as clockwork. Organic sums octaves of noise, which
						never line up the same way twice.
					</p>
				</div>
				{#if settings.life.mode === 'organic'}
					<Slider label="Turbulence" bind:value={settings.life.turbulence} min={0.1} max={4} step={0.1} decimals={1} />
				{/if}
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
