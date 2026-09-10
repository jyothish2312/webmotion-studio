<script>
	import { isSectionOpen, toggleSection } from '../lib/panels.svelte.js';

	/**
	 * A disclosure section.
	 *
	 * The Inspector has nine of these; expanded all at once it was a single scroll
	 * several screens long. Open/closed is remembered per section, so the panel
	 * settles into whatever shape you actually work in.
	 */
	let {
		title,
		hint = '',
		children,
		tone = 'plain',
		open: openByDefault = true,
		badge = null,
		id = null
	} = $props();

	const key = $derived(id ?? title);
	const open = $derived(isSectionOpen(key, openByDefault));
</script>

<section class="border-b border-line" data-section={key}>
	<h3 class="m-0">
		<button
			type="button"
			class="flex w-full items-center gap-2 px-3 py-2 text-left text-[11px] font-bold tracking-wider transition-colors {tone ===
			'active'
				? 'bg-accent/10 text-white'
				: 'text-muted hover:text-white'}"
			aria-expanded={open}
			onclick={() => toggleSection(key, openByDefault)}
		>
			<svg
				width="9"
				height="9"
				viewBox="0 0 10 10"
				fill="currentColor"
				class="shrink-0 transition-transform duration-150 {open ? 'rotate-90' : ''}"
				aria-hidden="true"><path d="M2 0 L9 5 L2 10 Z" /></svg
			>
			<span class="flex-1 truncate">{title.toUpperCase()}</span>
			{#if badge}
				<span class="rounded-full bg-raise px-1.5 py-0.5 text-[9px] font-normal text-muted">
					{badge}
				</span>
			{/if}
		</button>
	</h3>

	{#if open}
		{#if hint}<p class="hint px-3 pb-2">{hint}</p>{/if}
		<div class="px-3 pt-1 pb-4">
			{@render children?.()}
		</div>
	{/if}
</section>
