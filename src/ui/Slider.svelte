<script>
	let {
		label,
		value = $bindable(0),
		min = 0,
		max = 1,
		step = 0.01,
		suffix = '',
		decimals = 2,
		hint = '',
		onchange = null
	} = $props();

	// Trim trailing zeros only past a decimal point — a naive strip turns 100 into 1.
	function tidy(text) {
		return text.includes('.') ? text.replace(/0+$/, '').replace(/\.$/, '') : text;
	}
	const shown = $derived(tidy(Number(value).toFixed(decimals)));
</script>

<div class="mb-3">
	<div class="mb-1 flex items-baseline justify-between gap-2">
		<span class="field-label mb-0">{label}</span>
		<span class="font-mono text-[11px] text-accent tabular-nums">{shown}{suffix}</span>
	</div>
	<input type="range" {min} {max} {step} bind:value oninput={onchange} class="h-1 w-full" />
	{#if hint}<p class="hint mt-1">{hint}</p>{/if}
</div>
