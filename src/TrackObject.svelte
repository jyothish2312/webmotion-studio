<script>
	/**
	 * One track's rendered object: the ghost trail plus the wrapper stack the
	 * engine drives. Each wrapper owns exactly one concern so GSAP never has two
	 * things fighting over the same transform.
	 *
	 * Class names match the exported markup, so what you see here and what the
	 * generated code drives are the same structure. The `id` is per track because
	 * the ghosts <use> it.
	 */
	import { untrack } from 'svelte';

	let { track, onrefs } = $props();

	let placerEl = $state(null);
	let dynEl = $state(null);
	let lifeEl = $state(null);
	let accentEl = $state(null);
	let fxEl = $state(null);
	let sizeEl = $state(null);
	let orientEl = $state(null);
	let normEl = $state(null);
	let morphEl = $state(null);
	let ghostEls = $state([]);

	const bodyId = $derived(`gasp-body-${track.id}`);
	const ghostCount = $derived(
		track.settings.trail.enabled ? Math.max(0, track.settings.trail.count) : 0
	);
	const ghostSlots = $derived(Array.from({ length: ghostCount }, (_, i) => i));

	$effect(() => {
		const refs = {
			placer: placerEl,
			dyn: dynEl,
			life: lifeEl,
			accent: accentEl,
			fx: fxEl,
			size: sizeEl,
			orient: orientEl,
			norm: normEl,
			morph: morphEl,
			ghosts: ghostEls.slice(0, ghostCount)
		};
		untrack(() => onrefs?.(track.id, refs));
	});
</script>

<g class="pointer-events-none" data-track={track.id}>
	{#each ghostSlots as i (i)}
		<g bind:this={ghostEls[i]} opacity={track.settings.trail.opacity * (1 - i / (ghostCount + 1))}>
			<use href="#{bodyId}" />
		</g>
	{/each}

	<!--
		place   motion path position (and autoRotate, unless momentum owns rotation)
		dyn     ticker-driven: heading lag, bank, pitch, weight, organic idle
		life    sine idle tweens
		accent  settle and morph recoil, authored so they scrub
		fx      per-stop scale / rotation / opacity
		size    base object size
		orient  the artwork's own correction
		norm    measured centering, tweened across a morph
	-->
	<g bind:this={placerEl} class="gasp-place">
		<g bind:this={dynEl} class="gasp-dyn">
			<g bind:this={lifeEl} class="gasp-life">
				<g bind:this={accentEl} class="gasp-accent">
					<g bind:this={fxEl} id={bodyId} class="gasp-fx">
						<g bind:this={sizeEl} class="gasp-size">
							<g bind:this={orientEl} class="gasp-orient">
								<g bind:this={normEl} class="gasp-norm">
									<path
										bind:this={morphEl}
										class="gasp-shape"
										d=""
										fill="none"
										stroke="#e6edf3"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
										vector-effect="non-scaling-stroke"
									/>
								</g>
							</g>
						</g>
					</g>
				</g>
			</g>
		</g>
	</g>
</g>
