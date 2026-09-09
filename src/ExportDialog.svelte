<script>
	import { project } from './lib/state.svelte.js';
	import { buildTimelineJs, buildMarkup, buildStandaloneHtml } from './lib/exportCode.js';

	let { onclose } = $props();

	let tab = $state('js');
	let copied = $state(false);

	const TABS = [
		{ id: 'js', label: 'GSAP timeline' },
		{ id: 'markup', label: 'SVG markup' },
		{ id: 'html', label: 'Standalone page' }
	];

	const code = $derived(
		tab === 'js'
			? buildTimelineJs(project)
			: tab === 'markup'
				? buildMarkup(project)
				: buildStandaloneHtml(project)
	);

	async function copy() {
		await navigator.clipboard.writeText(code);
		copied = true;
		setTimeout(() => (copied = false), 1400);
	}

	function download() {
		const name = project.name.replace(/\s+/g, '_') || 'animation';
		const ext = tab === 'html' ? 'html' : tab === 'markup' ? 'svg' : 'js';
		const blob = new Blob([code], { type: 'text/plain' });
		const url = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = url;
		a.download = `${name}.${ext}`;
		a.click();
		URL.revokeObjectURL(url);
	}
</script>

<div class="fixed inset-0 z-50 grid place-items-center bg-black/70 p-8">
	<div class="flex h-full w-full max-w-4xl flex-col overflow-hidden rounded-lg border border-line bg-panel">
		<div class="flex items-center justify-between border-b border-line px-4 py-3">
			<div class="flex gap-1">
				{#each TABS as t (t.id)}
					<button
						class="rounded-md px-3 py-1.5 text-xs transition-colors {tab === t.id
							? 'bg-accent text-ink'
							: 'text-muted hover:text-white'}"
						onclick={() => (tab = t.id)}>{t.label}</button
					>
				{/each}
			</div>
			<div class="flex items-center gap-2">
				<button
					class="rounded-md border border-line bg-raise px-3 py-1.5 text-xs transition-colors hover:border-accent"
					onclick={copy}>{copied ? 'Copied' : 'Copy'}</button
				>
				<button
					class="rounded-md border border-line bg-raise px-3 py-1.5 text-xs transition-colors hover:border-accent"
					onclick={download}>Download</button
				>
				<button class="px-2 text-muted transition-colors hover:text-white" onclick={onclose} aria-label="Close"
					>&times;</button
				>
			</div>
		</div>
		<pre class="flex-1 overflow-auto p-4 font-mono text-[11px] leading-relaxed text-[#c9d1d9]">{code}</pre>
	</div>
</div>
