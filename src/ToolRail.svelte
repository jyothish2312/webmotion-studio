<script>
	import { ui } from './lib/state.svelte.js';

	/**
	 * The three canvas tools, as a rail down the edge of the stage.
	 *
	 * They used to sit in the left panel, which is where you manage things, not
	 * where you point at things. Putting them against the canvas keeps the cursor
	 * near the work and gives the panel its space back.
	 */
	const TOOLS = [
		{
			id: 'edit',
			label: 'Select / edit',
			key: 'V',
			// A filled arrow reads instantly at 18px; an outlined one turns to mush.
			filled: 'M4 2 L4 17 L8 13.2 L10.6 18.5 L13 17.4 L10.4 12.3 L15.5 12.3 Z'
		},
		{
			id: 'add',
			label: 'Add path point',
			key: 'P',
			stroke: 'M2.5 14.5 C 6 6.5, 13 6.5, 16.5 14.5',
			filled: 'M7 12.5 h6 v6 h-6 z M6.5 12 h7 v7 h-7 z',
			node: { x: 10, y: 13.5 },
			plus: true
		},
		{
			id: 'marker',
			label: 'Add marker',
			key: 'M',
			stroke: 'M2.5 15 C 6 7, 13 7, 16.5 15',
			pin: true
		}
	];
</script>

<div class="flex w-11 shrink-0 flex-col items-center gap-1 border-r border-line bg-panel py-2">
	{#each TOOLS as tool (tool.id)}
		<button
			class="group relative grid h-8 w-8 place-items-center rounded-md border transition-colors {ui.mode ===
			tool.id
				? 'border-accent bg-accent text-ink'
				: 'border-transparent text-muted hover:border-line hover:text-white'}"
			onclick={() => (ui.mode = tool.id)}
			title="{tool.label} ({tool.key})"
			aria-label={tool.label}
			aria-pressed={ui.mode === tool.id}
			data-tool={tool.id}
		>
			<svg
				width="19"
				height="19"
				viewBox="0 0 20 20"
				fill="none"
				stroke="currentColor"
				stroke-width="1.5"
				stroke-linecap="round"
				stroke-linejoin="round"
			>
				{#if tool.stroke}<path d={tool.stroke} opacity="0.55" />{/if}
				{#if tool.filled && tool.id === 'edit'}<path d={tool.filled} fill="currentColor" stroke="none" />{/if}
				{#if tool.node}<rect
						x={tool.node.x - 2.4}
						y={tool.node.y - 2.4}
						width="4.8"
						height="4.8"
						fill="currentColor"
						stroke="none"
					/>{/if}
				{#if tool.plus}<path d="M15.5 3.5 v5 M13 6 h5" stroke-width="1.8" />{/if}
				{#if tool.pin}<circle cx="10" cy="11" r="3.1" fill="currentColor" stroke="none" /><path
						d="M10 11 v6"
						stroke-width="1.8"
					/>{/if}
			</svg>
		</button>
	{/each}
</div>
