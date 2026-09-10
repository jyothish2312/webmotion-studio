<script>
	import { HELP, SHORTCUTS, renderMarkup, sectionText } from './lib/helpContent.js';

	let { onclose } = $props();

	let query = $state('');
	let activeId = $state(HELP[0].id);
	let scroller = $state(null);

	const needle = $derived(query.trim().toLowerCase());
	const sections = $derived(
		needle ? HELP.filter((s) => sectionText(s).includes(needle)) : HELP
	);

	function jump(id) {
		activeId = id;
		scroller?.querySelector(`[data-help="${id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
	}

	function onKeydown(event) {
		if (event.key === 'Escape') onclose?.();
	}
</script>

<svelte:window onkeydown={onKeydown} />

<div
	data-modal
	role="dialog"
	aria-modal="true"
	aria-label="How to use webmotion studio"
	class="fixed inset-0 z-50 grid place-items-center bg-black/70 p-4 sm:p-8"
>
	<div
		class="flex h-full w-full max-w-5xl flex-col overflow-hidden rounded-lg border border-line bg-panel shadow-2xl"
	>
		<header class="flex shrink-0 items-center gap-3 border-b border-line px-4 py-3">
			<h2 class="m-0 text-sm font-semibold text-white">How to use this</h2>
			<input
				type="search"
				class="field ml-2 max-w-64 flex-1 py-1"
				placeholder="Search the guide…"
				bind:value={query}
			/>
			<span class="ml-auto hidden text-[10px] text-muted sm:inline">Esc to close</span>
			<button
				class="grid h-7 w-7 place-items-center rounded text-muted transition-colors hover:bg-raise hover:text-white"
				onclick={onclose}
				aria-label="Close">&times;</button
			>
		</header>

		<div class="grid min-h-0 flex-1 grid-cols-[180px_1fr]">
			<nav class="overflow-y-auto border-r border-line py-2">
				{#each HELP as section (section.id)}
					{@const dimmed = needle && !sections.some((s) => s.id === section.id)}
					<button
						class="block w-full px-3 py-1.5 text-left text-[12px] transition-colors {activeId ===
						section.id
							? 'bg-accent/10 text-accent'
							: dimmed
								? 'text-muted/40'
								: 'text-muted hover:text-white'}"
						onclick={() => jump(section.id)}
					>
						{section.title}
					</button>
				{/each}
			</nav>

			<div bind:this={scroller} class="overflow-y-auto px-6 py-5">
				{#if !sections.length}
					<p class="text-sm text-muted">Nothing in the guide matches “{query}”.</p>
				{/if}

				{#each sections as section (section.id)}
					<article data-help={section.id} class="mb-9 scroll-mt-4">
						<h3 class="mb-3 text-[15px] font-semibold text-white">{section.title}</h3>

						{#each section.blocks as block, i (i)}
							{#if block.type === 'body'}
								<p class="mb-3 text-[13px] leading-relaxed text-[#c9d1d9]">
									{#each renderMarkup(block.text) as part, p (p)}{#if part.kind === 'strong'}<strong
												class="font-semibold text-white">{part.value}</strong
											>{:else if part.kind === 'code'}<code
												class="rounded bg-panel-dark px-1 py-0.5 font-mono text-[11px] text-accent"
												>{part.value}</code
											>{:else}{part.value}{/if}{/each}
								</p>
							{:else if block.type === 'steps'}
								<ol class="mb-4 flex flex-col gap-2">
									{#each block.items as item, n (n)}
										<li class="flex gap-3 text-[13px] leading-relaxed text-[#c9d1d9]">
											<span
												class="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-accent/15 text-[10px] font-bold text-accent"
												>{n + 1}</span
											>
											<span>
												{#each renderMarkup(item) as part, p (p)}{#if part.kind === 'strong'}<strong
															class="font-semibold text-white">{part.value}</strong
														>{:else if part.kind === 'code'}<code
															class="rounded bg-panel-dark px-1 py-0.5 font-mono text-[11px] text-accent"
															>{part.value}</code
														>{:else}{part.value}{/if}{/each}
											</span>
										</li>
									{/each}
								</ol>
							{:else if block.type === 'list'}
								<dl class="mb-4 grid grid-cols-[minmax(120px,auto)_1fr] gap-x-4 gap-y-2">
									{#each block.items as [term, detail] (term)}
										<dt class="text-[12px] font-semibold text-white">{term}</dt>
										<dd class="m-0 text-[12.5px] leading-relaxed text-[#c9d1d9]">{detail}</dd>
									{/each}
								</dl>
							{:else if block.type === 'pre'}
								<pre
									class="mb-4 overflow-x-auto rounded-md border border-line bg-panel-dark px-3 py-2 font-mono text-[11.5px] leading-relaxed text-muted">{block.text}</pre>
							{:else if block.type === 'keys'}
								<table class="mb-4 w-full max-w-md">
									<tbody>
										{#each SHORTCUTS as [key, what] (key)}
											<tr>
												<td class="w-36 py-1 align-top">
													<kbd
														class="rounded border border-line bg-panel-dark px-1.5 py-0.5 font-mono text-[10.5px] text-white"
														>{key}</kbd
													>
												</td>
												<td class="py-1 text-[12.5px] text-[#c9d1d9]">{what}</td>
											</tr>
										{/each}
									</tbody>
								</table>
							{:else if block.type === 'note'}
								<p
									class="mb-4 rounded-md border-l-2 px-3 py-2 text-[12.5px] leading-relaxed {block.tone ===
									'warn'
										? 'border-point bg-point/10 text-[#e6d9a8]'
										: 'border-accent bg-accent/8 text-[#c9d1d9]'}"
								>
									{#each renderMarkup(block.text) as part, p (p)}{#if part.kind === 'strong'}<strong
												class="font-semibold text-white">{part.value}</strong
											>{:else if part.kind === 'code'}<code
												class="rounded bg-panel-dark px-1 py-0.5 font-mono text-[11px] text-accent"
												>{part.value}</code
											>{:else}{part.value}{/if}{/each}
								</p>
							{/if}
						{/each}
					</article>
				{/each}
			</div>
		</div>
	</div>
</div>
