<script>
	let { label, checked = $bindable(false), hint = '' } = $props();
</script>

<label class="mb-2 block cursor-pointer">
	<span class="flex items-center justify-between gap-3 py-1">
		<span class="text-[13px] text-white">{label}</span>
		<input type="checkbox" bind:checked class="h-4 w-4 accent-accent" />
	</span>
	{#if hint}<span class="hint block">{hint}</span>{/if}
</label>
