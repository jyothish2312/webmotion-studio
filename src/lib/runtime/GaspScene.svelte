<script>
	import { onMount } from 'svelte';
	import { register, mount } from './gaspRuntime.js';

	/**
	 * Drops one authored scene onto a page.
	 *
	 * Each instance mounts its own runtime, so two scenes on a page stay
	 * independent — separate timelines, separate triggers, and an off-screen one
	 * stays paused.
	 */
	let {
		name,
		scene,
		trigger = 'inview-once',
		amount = 0.35,
		delay = 0,
		class: className = '',
		style = ''
	} = $props();

	let el = $state(null);
	let app = $state(null);

	onMount(() => {
		register(name, scene);
		app = mount(el.parentNode ?? document);
		return () => app?.destroy();
	});

	export function play() {
		app?.get(name)?.play();
	}
	export function restart() {
		app?.get(name)?.restart();
	}
</script>

<div
	bind:this={el}
	data-gasp={name}
	data-gasp-trigger={trigger}
	data-gasp-amount={amount}
	data-gasp-delay={delay}
	class={className}
	{style}
></div>
