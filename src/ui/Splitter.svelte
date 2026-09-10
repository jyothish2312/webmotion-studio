<script>
	import { LIMITS, resize, resetSize, workspace } from '../lib/panels.svelte.js';

	/**
	 * A drag handle between two panes.
	 *
	 * `side` says which way a positive drag grows the pane, since the right panel
	 * grows as the pointer moves left and the timeline grows as it moves up.
	 * Arrow keys nudge it and Enter resets, so it is reachable without a mouse.
	 */
	let { target, side = 'left', label } = $props();

	let dragging = $state(false);
	let start = 0;
	let startValue = 0;

	const vertical = $derived(target === 'timeline');

	function delta(event) {
		if (side === 'left') return event.clientX - start;
		if (side === 'right') return start - event.clientX;
		return start - event.clientY; // 'up'
	}

	function down(event) {
		dragging = true;
		start = vertical ? event.clientY : event.clientX;
		startValue = workspace[target];
		event.currentTarget.setPointerCapture(event.pointerId);
		event.preventDefault();
	}

	function move(event) {
		if (!dragging) return;
		resize(target, startValue + delta(event));
	}

	function up(event) {
		if (!dragging) return;
		dragging = false;
		if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
			event.currentTarget.releasePointerCapture(event.pointerId);
		}
	}

	function key(event) {
		const step = event.shiftKey ? 40 : 10;
		if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
			resize(target, workspace[target] + (side === 'left' ? -step : step));
		} else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
			resize(target, workspace[target] + (side === 'left' ? step : -step));
		} else if (event.key === 'Enter' || event.key === ' ') {
			resetSize(target);
		} else {
			return;
		}
		event.preventDefault();
	}
</script>

<div
	role="separator"
	aria-orientation={vertical ? 'horizontal' : 'vertical'}
	aria-label={label}
	aria-valuenow={workspace[target]}
	aria-valuemin={LIMITS[target].min}
	aria-valuemax={LIMITS[target].max}
	tabindex="0"
	data-splitter={target}
	class="group relative shrink-0 {vertical
		? 'h-1 w-full cursor-row-resize'
		: 'h-full w-1 cursor-col-resize'} bg-line transition-colors hover:bg-accent focus-visible:bg-accent focus-visible:outline-none {dragging
		? 'bg-accent'
		: ''}"
	onpointerdown={down}
	onpointermove={move}
	onpointerup={up}
	onpointercancel={up}
	ondblclick={() => resetSize(target)}
	onkeydown={key}
	title="{label} — drag, arrow keys to nudge, double-click to reset"
>
	<!-- A 1px line is a cruel hit target; this widens it invisibly. -->
	<span
		class="absolute {vertical ? '-inset-y-1.5 inset-x-0' : '-inset-x-1.5 inset-y-0'}"
		aria-hidden="true"
	></span>
</div>
