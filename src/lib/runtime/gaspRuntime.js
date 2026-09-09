/**
 * Page runtime for webmotion-studio scenes.
 *
 * Playback model, which is the whole point of this file:
 *   - Tracks inside a scene share ONE master timeline. Their timing is related
 *     by design, so they scrub together (createSceneRenderer handles that).
 *   - Scenes on a page are INDEPENDENT. A hero animation and a footer loader
 *     have nothing to synchronise, so each gets its own timeline and its own
 *     trigger, and an off-screen scene stays paused and costs nothing.
 *
 * Usage:
 *   import { register, mount } from './gaspRuntime.js';
 *   import scene from './drone-delivery.json';
 *   register('drone-delivery', scene);
 *   const app = mount();            // scans [data-gasp], returns { destroy }
 *
 *   <div data-gasp="drone-delivery" data-gasp-trigger="inview-once"></div>
 */
import { gsap } from 'gsap';
import { createSceneRenderer } from '../engine.js';
import { migrate, pickLayout } from '../model.js';
import { hydrateAsset } from '../svg.js';
import { buildStageMarkup } from '../exportCode.js';

const scenes = new Map();

/** Registers a scene payload under a name. Accepts any exported file version. */
export function register(name, payload) {
	const project = migrate(payload);
	for (const asset of project.assets) hydrateAsset(asset);
	const scene = project.scenes.find((s) => s.name === name) ?? project.scenes[0];
	if (!scene) throw new Error(`[gasp] "${name}" contains no scene.`);
	scenes.set(name, { project, scene });
	return scene;
}

export function registered() {
	return [...scenes.keys()];
}

function readOptions(el, scene) {
	const d = el.dataset;
	return {
		trigger: d.gaspTrigger || scene.trigger?.type || 'inview-once',
		amount: d.gaspAmount != null ? Number(d.gaspAmount) : (scene.trigger?.amount ?? 0.35),
		delay: d.gaspDelay != null ? Number(d.gaspDelay) : (scene.trigger?.delay ?? 0)
	};
}

/**
 * Builds one scene into one element and keeps its layout current.
 *
 * The layout is re-picked from the element's measured size, so the same call the
 * editor's preview makes decides what a visitor sees. Switching layout rebuilds,
 * because the tracks and geometry are genuinely different.
 */
function createInstance(el, { project, scene }, options) {
	let renderer = null;
	let currentLayoutId = null;
	let progress = 0;
	let destroyed = false;

	function build(layout) {
		renderer?.destroy();
		el.innerHTML = buildStageMarkup({ layout, scene });

		const refsByTrack = {};
		for (const track of layout.tracks) {
			const root = el.querySelector(`[data-track="${track.id}"]`);
			if (!root) continue;
			refsByTrack[track.id] = {
				path: el.querySelector(`[data-track-path="${track.id}"]`),
				placer: root.querySelector('.gasp-place'),
				life: root.querySelector('.gasp-life'),
				fx: root.querySelector('.gasp-fx'),
				size: root.querySelector('.gasp-size'),
				orient: root.querySelector('.gasp-orient'),
				norm: root.querySelector('.gasp-norm'),
				morph: root.querySelector('.gasp-shape'),
				ghosts: [...root.querySelectorAll('.gasp-ghost')]
			};
		}

		renderer = createSceneRenderer();
		renderer.onFrame((p) => (progress = p));
		renderer.build(refsByTrack, { layout, scene, assets: project.assets }, { restore: progress });
		currentLayoutId = layout.id;
	}

	function sync() {
		if (destroyed) return;
		const rect = el.getBoundingClientRect();
		if (!rect.width) return;
		const layout = pickLayout(scene, rect.width, rect.height);
		if (layout && layout.id !== currentLayoutId) build(layout);
	}

	const ro = new ResizeObserver(sync);
	ro.observe(el);
	sync();

	return {
		el,
		get progress() {
			return progress;
		},
		play: () => renderer?.setPlaying(true),
		pause: () => renderer?.setPlaying(false),
		restart: () => {
			renderer?.restart();
			renderer?.setPlaying(true);
		},
		reset: () => {
			renderer?.setPlaying(false);
			renderer?.restart();
		},
		seek: (p) => renderer?.seek(p),
		finish: () => {
			renderer?.setPlaying(false);
			renderer?.seek(1);
		},
		destroy() {
			destroyed = true;
			ro.disconnect();
			renderer?.destroy();
			renderer = null;
		}
	};
}

function wireTrigger(instance, options) {
	const { trigger, amount, delay } = options;

	if (trigger === 'load') {
		gsap.delayedCall(delay, () => instance.play());
		return () => {};
	}
	if (trigger === 'manual') return () => {};

	const threshold = trigger === 'visible-amount' ? Math.min(0.99, Math.max(0, amount)) : 0.01;
	const observer = new IntersectionObserver(
		([entry]) => {
			if (entry.isIntersecting) {
				gsap.delayedCall(delay, () => instance.play());
				if (trigger === 'inview-once') observer.disconnect();
			} else if (trigger === 'inview') {
				// Reset rather than pause, so re-entering replays from the top.
				instance.reset();
			}
		},
		{ threshold }
	);
	observer.observe(instance.el);
	return () => observer.disconnect();
}

/** Scans `root` for [data-gasp] elements and brings each scene to life. */
export function mount(root = document) {
	const instances = new Map();
	const unwire = [];

	for (const el of root.querySelectorAll('[data-gasp]')) {
		const name = el.dataset.gasp;
		const entry = scenes.get(name);
		if (!entry) {
			console.warn(`[gasp] no scene registered as "${name}"`);
			continue;
		}
		const options = readOptions(el, entry.scene);
		const instance = createInstance(el, entry, options);
		instances.set(name, instance);
		unwire.push(wireTrigger(instance, options));
	}

	// Reduced motion gets the finished frame, not a frozen first frame: the point
	// of the animation is usually its end state.
	const media = gsap.matchMedia();
	media.add('(prefers-reduced-motion: reduce)', () => {
		instances.forEach((i) => i.finish());
	});

	return {
		instances,
		get(name) {
			return instances.get(name);
		},
		play: (name) => instances.get(name)?.play(),
		destroy() {
			unwire.forEach((fn) => fn());
			instances.forEach((i) => i.destroy());
			instances.clear();
			media.revert();
		}
	};
}
