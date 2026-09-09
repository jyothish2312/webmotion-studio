import { gsap } from 'gsap';
import { MotionPathPlugin } from 'gsap/MotionPathPlugin';
import { MorphSVGPlugin } from 'gsap/MorphSVGPlugin';
import { clamp01 } from './path.js';

gsap.registerPlugin(MotionPathPlugin, MorphSVGPlugin);

/**
 * Turns the project into an ordered list of stops with absolute times.
 *
 * A stop is "arrive -> hold -> travel to the next stop". Marker positions are
 * expressed along the PATH (0..1 of its length) while the timeline runs in
 * SECONDS, and those two are not proportional once holds and per-segment
 * durations differ — so anything that needs to place a marker in time (the
 * scrubber, the code export) must go through here rather than reusing
 * `marker.progress` directly.
 *
 * Pure function: no DOM, no GSAP. Shared by the engine and the code export.
 */
export function planStops(project) {
	const s = project.settings;

	const nodes = [
		{
			id: 'start',
			progress: 0,
			hold: s.startHold,
			duration: s.startDuration,
			ease: s.startEase,
			classes: s.startClasses,
			state: s.startState,
			morphTarget: 'none',
			morphType: 'hold',
			morphDuration: 0
		},
		...project.markers.filter((m) => m.progress > 0).sort((a, b) => a.progress - b.progress)
	];

	const stops = [];
	let time = 0;

	for (let i = 0; i < nodes.length; i++) {
		const node = nodes[i];
		const hold = Math.max(0, Number(node.hold) || 0);
		const travel = Math.max(0.01, Number(node.duration) || 1);

		const stop = {
			id: node.id,
			index: i,
			isStart: i === 0,
			from: clamp01(node.progress),
			to: clamp01(nodes[i + 1] ? nodes[i + 1].progress : 1),
			arriveAt: time,
			hold,
			travelAt: time + hold,
			travel,
			leaveAt: time + hold + travel,
			ease: node.ease || 'none',
			classes: node.classes || '',
			state: node.state,
			morphTarget: node.morphTarget || 'none',
			morphType: node.morphType || 'hold',
			morphDuration: Math.max(0.01, Number(node.morphDuration) || 0.5)
		};

		stops.push(stop);
		time = stop.leaveAt;
	}

	return { stops, duration: time };
}

/** When the shape change happens, relative to the stop it belongs to. */
export function morphWindow(stop) {
	if (stop.morphTarget === 'none') return null;
	if (stop.morphType === 'custom') return { at: stop.arriveAt, duration: stop.morphDuration };
	if (stop.morphType === 'segment') return { at: stop.travelAt, duration: stop.travel };
	// 'hold' — the pickup case. Fall back to a short beat if there is no dwell.
	return { at: stop.arriveAt, duration: stop.hold > 0.02 ? stop.hold : 0.5 };
}

function transformOf(state) {
	return { scale: state.scale, rotation: state.rotate, opacity: state.opacity };
}

function paintOf(state) {
	return { stroke: state.stroke, strokeWidth: state.strokeWidth, fill: state.fill };
}

/**
 * Owns every GSAP object on screen. Rebuilt wholesale whenever the project
 * changes — cheap, and far easier to reason about than patching a live
 * timeline, which is where most of the drift and ghost-tween bugs came from.
 */
export function createEngine() {
	let refs = null;
	let timeline = null;
	let placer = null;
	let ghosts = [];
	let life = [];
	let plan = { stops: [], duration: 0 };
	let trail = { enabled: false, count: 0, lag: 3 };

	const proxy = { p: 0 };
	let history = [];
	let recording = false;
	let onFrame = null;

	/**
	 * Pushes the current path position onto the visible objects. The lead object
	 * reads `proxy.p` directly; each ghost reads an older frame, so the trail
	 * bunches up when the object slows and stretches when it accelerates.
	 */
	function frame() {
		const p = clamp01(proxy.p);
		if (placer) placer.progress(p);

		if (ghosts.length) {
			if (recording) {
				history.unshift(p);
				const max = ghosts.length * trail.lag + 2;
				if (history.length > max) history.length = max;
			}
			for (let i = 0; i < ghosts.length; i++) {
				const index = Math.min(history.length - 1, (i + 1) * trail.lag);
				ghosts[i].progress(clamp01(history[index] ?? p));
			}
		}

		onFrame?.(timeline ? timeline.progress() : 0, timeline ? timeline.time() : 0, plan.duration);
	}

	function resetHistory() {
		history = [clamp01(proxy.p)];
	}

	/** A paused tween does not render until its progress actually changes. */
	function seedTween(tween) {
		tween.progress(0.001);
		tween.progress(0);
	}

	function motionPathFor(element, project) {
		const s = project.settings;
		return gsap.to(element, {
			duration: 1,
			ease: 'none',
			paused: true,
			motionPath: {
				path: refs.path,
				align: refs.path,
				alignOrigin: [0.5, 0.5],
				autoRotate: s.autoRotate ? s.rotationOffset || true : false
			}
		});
	}

	function teardown() {
		timeline?.kill();
		placer?.kill();
		ghosts.forEach((g) => g.kill());
		life.forEach((t) => t.kill());
		timeline = null;
		placer = null;
		ghosts = [];
		life = [];
	}

	function build(nextRefs, project, { restore = 0, playing = false } = {}) {
		refs = nextRefs;
		if (!refs?.path || !refs.placer || !refs.morph) return null;

		// Everything that can bail out is resolved BEFORE teardown. Returning after
		// teardown would leave the engine dead with no timeline and no error, and
		// the caller would keep showing a stale duration.
		const s = project.settings;
		const assets = project.assets;
		const byId = (id) => assets.find((a) => a.id === id);
		const startAsset = byId(s.startingAssetId) ?? assets[0];
		if (!startAsset?.norm) {
			throw new Error('Starting shape has no measurements yet — asset not hydrated.');
		}

		teardown();

		plan = planStops(project);
		trail = s.trail;

		placer = motionPathFor(refs.placer, project);
		seedTween(placer);

		ghosts = (refs.ghosts ?? []).filter(Boolean).map((el) => {
			const tween = motionPathFor(el, project);
			seedTween(tween);
			return tween;
		});
		resetHistory();

		timeline = gsap.timeline({
			paused: true,
			repeat: s.loop ? -1 : 0,
			yoyo: s.loop && s.yoyo,
			onUpdate: frame
		});

		// Baseline, applied twice on purpose.
		//
		// Imperatively first: a paused timeline sitting at time 0 has nothing to
		// re-render, so its own t=0 children never fire and the very first frame
		// would paint an empty <path> at the origin.
		//
		// Then as timeline children as well, so scrubbing backwards past the first
		// morph restores the starting shape instead of leaving the last one on.
		const baseline = () => {
			gsap.set(refs.morph, { attr: { d: startAsset.d } });
			gsap.set(refs.norm, { ...startAsset.norm });
			gsap.set(refs.size, { scale: s.objectSize / 100 });
			gsap.set(refs.fx, { attr: { class: 'gasp-fx' } });
			gsap.set(refs.fx, transformOf(s.startState));
			gsap.set(refs.morph, paintOf(s.startState));
			// Killing a tween leaves its last rendered values on the element, so any
			// wrapper whose driving tweens might not be rebuilt has to be reset by
			// hand — otherwise turning idle life off freezes the object mid-bob.
			if (refs.life) gsap.set(refs.life, { x: 0, y: 0, rotation: 0, scale: 1 });
		};
		baseline();

		timeline.set(refs.morph, { attr: { d: startAsset.d } }, 0);
		timeline.set(refs.norm, { ...startAsset.norm }, 0);
		timeline.set(refs.size, { scale: s.objectSize / 100 }, 0);

		let shape = startAsset;

		for (let i = 0; i < plan.stops.length; i++) {
			const stop = plan.stops[i];
			const next = plan.stops[i + 1];
			const target = next ? next.state : stop.state;

			// --- Arrival: snap to this stop's look and freeze it for the hold.
			// The base class has to be re-stated: setting `class` replaces the whole
			// attribute, so omitting it would strip the element's own identity.
			timeline.set(refs.fx, { attr: { class: `gasp-fx ${stop.classes}`.trim() } }, stop.arriveAt);
			timeline.set(refs.fx, transformOf(stop.state), stop.arriveAt);
			timeline.set(refs.morph, paintOf(stop.state), stop.arriveAt);
			timeline.set(proxy, { p: stop.from }, stop.arriveAt);

			// --- Shape change.
			const win = morphWindow(stop);
			const targetAsset = win ? byId(stop.morphTarget) : null;
			if (win && targetAsset?.norm && targetAsset.d !== shape.d) {
				const fromShape = shape;
				timeline.set(refs.morph, { attr: { d: fromShape.d } }, win.at);
				timeline.to(
					refs.morph,
					{
						morphSVG: {
							shape: targetAsset.d,
							type: s.rotationalMorph ? 'rotational' : 'linear'
						},
						duration: win.duration,
						ease: stop.ease,
						immediateRender: false
					},
					win.at
				);
				timeline.fromTo(
					refs.norm,
					{ ...fromShape.norm },
					{ ...targetAsset.norm, duration: win.duration, ease: stop.ease, immediateRender: false },
					win.at
				);
				shape = targetAsset;
			}

			// --- Travel: move along the path and tween the look toward the next stop.
			// fromTo + immediateRender:false pins both ends explicitly, so seeking
			// to an arbitrary time gives the same frame as playing there.
			timeline.fromTo(
				proxy,
				{ p: stop.from },
				{ p: stop.to, duration: stop.travel, ease: stop.ease, immediateRender: false },
				stop.travelAt
			);
			timeline.fromTo(
				refs.fx,
				transformOf(stop.state),
				{ ...transformOf(target), duration: stop.travel, ease: stop.ease, immediateRender: false },
				stop.travelAt
			);
			timeline.fromTo(
				refs.morph,
				paintOf(stop.state),
				{ ...paintOf(target), duration: stop.travel, ease: stop.ease, immediateRender: false },
				stop.travelAt
			);
		}

		buildLife(project);

		timeline.pause(0);
		frame();
		if (restore > 0) {
			timeline.progress(clamp01(restore));
			resetHistory();
			frame();
		}
		setPlaying(playing);

		// A morph can legitimately outrun the stop it belongs to (a long 'custom'
		// morph on a short hold), which makes the real timeline longer than the sum
		// of holds and travels. Report the longer of the two, or the scrubber's
		// readout and its marker ticks are measured against the wrong total.
		plan.duration = Math.max(plan.duration, timeline.duration());
		return { stops: plan.stops, duration: plan.duration };
	}

	/**
	 * Continuous secondary motion, deliberately kept OFF the scrub timeline: it
	 * is wall-clock idle movement, not authored keyframes. Three loops at
	 * different periods beat one, because they never line up twice the same way.
	 */
	function buildLife(project) {
		const cfg = project.settings.life;
		if (!cfg?.enabled || !refs.life) return;

		if (cfg.bob > 0) {
			life.push(
				gsap.fromTo(
					refs.life,
					{ y: cfg.bob / 2 },
					{
						y: -cfg.bob / 2,
						duration: Math.max(0.1, cfg.bobSpeed) / 2,
						ease: 'sine.inOut',
						yoyo: true,
						repeat: -1,
						paused: true
					}
				)
			);
		}
		if (cfg.sway > 0) {
			life.push(
				gsap.fromTo(
					refs.life,
					{ rotation: -cfg.sway / 2 },
					{
						rotation: cfg.sway / 2,
						duration: Math.max(0.1, cfg.swaySpeed) / 2,
						ease: 'sine.inOut',
						yoyo: true,
						repeat: -1,
						paused: true
					}
				)
			);
		}
		if (cfg.pulse > 0) {
			life.push(
				gsap.fromTo(
					refs.life,
					{ scale: 1 - cfg.pulse },
					{
						scale: 1 + cfg.pulse,
						duration: Math.max(0.1, cfg.pulseSpeed) / 2,
						ease: 'sine.inOut',
						yoyo: true,
						repeat: -1,
						paused: true
					}
				)
			);
		}
	}

	function setPlaying(playing) {
		recording = playing;
		if (!playing) resetHistory();
		if (timeline) playing ? timeline.play() : timeline.pause();
		life.forEach((t) => (playing ? t.play() : t.pause()));
	}

	return {
		build,
		setPlaying,
		seek(progress) {
			if (!timeline) return;
			timeline.progress(clamp01(progress));
			resetHistory();
			frame();
		},
		restart() {
			if (!timeline) return;
			timeline.progress(0);
			resetHistory();
			frame();
		},
		get duration() {
			return plan.duration;
		},
		get stops() {
			return plan.stops;
		},
		onFrame(fn) {
			onFrame = fn;
		},
		destroy() {
			teardown();
			onFrame = null;
		}
	};
}
