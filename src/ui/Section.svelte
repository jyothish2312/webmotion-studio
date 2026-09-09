<script>
	let { title, hint = '', children, tone = 'plain' } = $props();
</script>

<div class="border-b border-line">
	<div
		class="px-4 py-2.5 text-[11px] font-bold tracking-wider {tone === 'active'
			? 'bg-accent/10 text-white'
			: 'text-muted'}"
	>
		{title.toUpperCase()}
	</div>
	{#if hint}<p class="hint px-4 pb-2">{hint}</p>{/if}
	<div class="px-4 pt-1 pb-4">
		{@render children?.()}
	</div>
</div>
