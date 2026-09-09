<script>
	import { CANONICAL_SIZE, measurePath, normalizeFrom, orientFrom } from '../lib/svg.js';

	/**
	 * Renders an asset in the canonical box, with the author's orientation
	 * correction applied — so the library thumbnail matches what lands on stage.
	 *
	 * This is a component rather than an interpolated string fed to {@html} on
	 * purpose: `asset.d` can come straight out of an imported project file, and
	 * {@html} would happily inject whatever markup that string closes into.
	 * Svelte escapes attribute values, so the path data stays path data.
	 */
	let { asset, strokeWidth = 6 } = $props();

	const half = CANONICAL_SIZE / 2;
	const norm = $derived(asset.norm ?? normalizeFrom(measurePath(asset.d)));
	const orient = $derived(asset.orient ?? orientFrom(asset.adjust ?? {}));
</script>

<svg
	viewBox="{-half} {-half} {CANONICAL_SIZE} {CANONICAL_SIZE}"
	fill="none"
	stroke="currentColor"
	stroke-width={strokeWidth}
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true"
>
	<!-- Outer wrapper mirrors .gasp-orient, inner mirrors .gasp-norm. -->
	<g
		transform="translate({orient.x} {orient.y}) rotate({orient.rotation}) scale({orient.scaleX} {orient.scaleY})"
	>
		<g transform="translate({norm.x} {norm.y}) scale({norm.scale})">
			<path d={asset.d} />
		</g>
	</g>
</svg>
