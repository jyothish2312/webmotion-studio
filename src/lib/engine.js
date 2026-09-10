import { gsap } from 'gsap';
import { MotionPathPlugin } from 'gsap/MotionPathPlugin';
import { MorphSVGPlugin } from 'gsap/MorphSVGPlugin';
import { clamp01 } from './path.js';
import { ORIENT_KEYS } from './svg.js';
import { createAngleSpring, createNoise, createSpring, samplePath } from './dynamics.js';
import { resolveMorph } from './model.js';

gsap.registerPlugin(MotionPathPlugin, MorphSVGPlugin);

/**
 * Turns one track into an ordered list of stops with absolute times.
 *
 * A stop is "arrive -> hold -> travel to the next stop". Marker positions are
 * expressed along the PATH (0..1 of its length) while the timeline runs in
 * SECONDS, and those two are not proportional once holds and per-segment
 * durations differ — so anything that needs to place a marker in time (the
 * scrubber, the code export) must go through here rather than reusing
 * `marker.progress` directly.
 *
 * Times are relative to the track's own start; the scene applies `track.offset`
 * when it adds the track to the master timeline.
 *
 * Pure function: no DOM, no GSAP. Shared by the engine and the code export.
 */
export function planStops(track) {
	const s = track.settings;

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
		...track.markers.filter((m) => m.progress > 0).sort((a, b) => a.progress - b.progress)
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
			morphDuration: Math.max(0.01, Number(node.morphDuration) || 0.5),
			// Carried through so the renderer and the exporter resolve the same
			// MorphSVG options from the same place.
			morphStyle: node.morphStyle ?? 'auto',
			morphMap: node.morphMap,
			morphRotational: node.morphRotational,
			morphShapeIndex: node.morphShapeIndex
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

function pick(source, keys) {
	const out = {};
	for (const key of keys) out[key] = source[key];
	return out;
}

function sameOrient(a, b) {
	return a && b && ORIENT_KEYS.every((k) => a[k] === b[k]);
}

/**
 * Lays a scene's tracks out in absolute scene time.
 *
 * Track times come out of planStops() relative to the track's own start; the
 * scene shifts each by `track.offset`. That offset is the ONLY coupling between
 * tracks, and it is the reason they share a timeline at all: the crate lifts
 * exactly when the drone arrives, so you scrub them together.
 *
 * Pure function. Shared by the scene renderer, the scrubber lanes and the export.
 */
export function planScene(layout, { onlyVisible = true } = {}) {
	const all = layout?.tracks ?? [];
	const solo = all.some((t) => t.solo);
	const tracks = onlyVisible ? all.filter((t) => (solo ? t.solo && !t.hidden : !t.hidden)) : all;

	const lanes = tracks.map((track) => {
		const { stops, duration } = planStops(track);
		const offset = Math.max(0, Number(track.offset) || 0);
		return {
			id: track.id,
			name: track.name,
			track,
			offset,
			stops,
			duration,
			endsAt: offset + duration
		};
	});

	return { lanes, duration: lanes.reduce((max, l) => Math.max(max, l.endsAt), 0) };
}

/**
 * Renders one track: its motion path, its stops, its ghosts and its idle life.
 *
 * The returned `timeline` is finite and starts at zero — the scene decides where
 * it sits. Idle life is deliberately NOT on that timeline: it is wall-clock
 * secondary motion, not authored keyframes, so it must not be scrubbed.
 */
export function createTrackRenderer() {
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

	/**
	 * Wall-clock secondary motion. Stepped by the scene's ticker, never by the
	 * timeline: it is behaviour, not authored keyframes. When the scene is paused
	 * every spring snaps to its target, so a scrubbed frame is deterministic.
	 */
	let dyn = null;

	function resetDynamics(track) {
		const s = track.settings;
		dyn = {
			cfg: s,
			heading: createAngleSpring(s.momentum.responsiveness, s.momentum.overshoot),
			bank: createSpring(s.momentum.responsiveness * 0.8, 0.9),
			lean: createSpring(s.weight.responsiveness, s.weight.overshoot),
			noiseY: createNoise(11),
			noiseR: createNoise(29),
			noiseS: createNoise(53),
			clock: 0,
			lastP: clamp01(proxy.p),
			speed: 0,
			lastSpeed: 0,
			pathLength: 0,
			primed: false
		};
	}

	/**
	 * Reads the path heading and how fast the object is covering it, then lets the
	 * springs chase those. Returns nothing; it writes straight to the wrappers.
	 */
	function stepDynamics(dt, playing) {
		if (!dyn || !refs?.dyn) return;
		const s = dyn.cfg;
		const p = clamp01(proxy.p);

		if (!dyn.pathLength) {
			try {
				dyn.pathLength = refs.path.getTotalLength();
			} catch {
				dyn.pathLength = 0;
			}
		}

		// dt === 0 means "we just seeked". Bank and pitch are derived from smoothed
		// speed history, so that history has to be dropped as well — otherwise
		// scrubbing to the same time twice gives two slightly different frames
		// depending on how you got there.
		if (dt <= 0) {
			dyn.speed = 0;
			dyn.lastSpeed = 0;
			dyn.lastP = p;
		} else {
			// Speed along the path in units/second, smoothed a little so a single
			// long frame does not spike the bank.
			const instant = (Math.abs(p - dyn.lastP) * dyn.pathLength) / dt;
			dyn.lastSpeed = dyn.speed;
			dyn.speed += (instant - dyn.speed) * Math.min(1, dt * 8);
			dyn.lastP = p;
			dyn.clock += dt;
		}

		let rotation = 0;
		let extraY = 0;
		let extraScale = 1;

		if (s.momentum.enabled) {
			const { angle, curvature } = samplePath(refs.path, p, dyn.pathLength);
			const target = angle + (s.autoRotate ? s.rotationOffset : 0);
			const heading = playing && dyn.primed ? dyn.heading.step(target, dt) : dyn.heading.snap(target);

			// Roll into the corner in proportion to how sharply it is turning and
			// how fast it is going, and pitch against the change in speed.
			const speedNorm = Math.min(1, dyn.speed / 600);
			const bankTarget = -curvature * speedNorm * (s.momentum.bank / 10);
			const bank = playing && dyn.primed ? dyn.bank.step(bankTarget, dt) : dyn.bank.snap(bankTarget);
			const accel = dt > 0 ? (dyn.speed - dyn.lastSpeed) / dt : 0;
			const pitch = Math.max(-25, Math.min(25, (-accel / 2000) * s.momentum.pitch));

			rotation += heading + bank + pitch;
		}

		if (s.weight.enabled) {
			const accel = dt > 0 ? (dyn.speed - dyn.lastSpeed) / dt : 0;
			const target = Math.max(-45, Math.min(45, (-accel / 1500) * s.weight.amount));
			rotation += playing && dyn.primed ? dyn.lean.step(target, dt) : dyn.lean.snap(target);
		}

		const life = s.life;
		if (life.enabled && life.mode === 'organic' && playing) {
			const t = dyn.clock * life.turbulence;
			extraY += dyn.noiseY(t / Math.max(0.1, life.bobSpeed)) * life.bob;
			rotation += dyn.noiseR(t / Math.max(0.1, life.swaySpeed)) * life.sway;
			extraScale += dyn.noiseS(t / Math.max(0.1, life.pulseSpeed)) * life.pulse;
		}

		dyn.primed = true;
		gsap.set(refs.dyn, { rotation, y: extraY, scale: extraScale });
	}

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
	}

	function resetHistory() {
		history = [clamp01(proxy.p)];
	}

	/** A paused tween does not render until its progress actually changes. */
	function seedTween(tween) {
		tween.progress(0.001);
		tween.progress(0);
	}

	function motionPathFor(element, track) {
		const s = track.settings;
		return gsap.to(element, {
			duration: 1,
			ease: 'none',
			paused: true,
			motionPath: {
				path: refs.path,
				align: refs.path,
				alignOrigin: [0.5, 0.5],
				// With momentum on, a spring owns the heading instead — autoRotate
				// snaps to the tangent exactly, which is what we are replacing.
				autoRotate: s.momentum.enabled ? false : s.autoRotate ? s.rotationOffset || true : false
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

	function buildLife(track) {
		const cfg = track.settings.life;
		// Organic idle is noise stepped by the ticker, not tweens.
		if (!cfg?.enabled || cfg.mode === 'organic' || !refs.life) return;

		const loop = (from, to) =>
			life.push(
				gsap.fromTo(refs.life, from, {
					...to,
					ease: 'sine.inOut',
					yoyo: true,
					repeat: -1,
					paused: true
				})
			);

		// Three periods rather than one: they never line up the same way twice,
		// which is most of the difference between alive and clockwork.
		if (cfg.bob > 0) {
			loop({ y: cfg.bob / 2 }, { y: -cfg.bob / 2, duration: Math.max(0.1, cfg.bobSpeed) / 2 });
		}
		if (cfg.sway > 0) {
			loop(
				{ rotation: -cfg.sway / 2 },
				{ rotation: cfg.sway / 2, duration: Math.max(0.1, cfg.swaySpeed) / 2 }
			);
		}
		if (cfg.pulse > 0) {
			loop(
				{ scale: 1 - cfg.pulse },
				{ scale: 1 + cfg.pulse, duration: Math.max(0.1, cfg.pulseSpeed) / 2 }
			);
		}
	}

	function build(nextRefs, { track, assets }) {
		refs = nextRefs;
		if (!refs?.path || !refs.placer || !refs.morph) return null;

		// Everything that can bail out is resolved BEFORE teardown. Returning after
		// teardown would leave the renderer dead with no timeline and no error.
		const s = track.settings;
		const byId = (id) => assets.find((a) => a.id === id);
		const startAsset = byId(track.startingAssetId) ?? assets[0];
		if (!startAsset?.norm) {
			throw new Error('Track "' + track.name + '": starting shape has no measurements yet.');
		}

		teardown();

		plan = planStops(track);
		trail = s.trail;

		placer = motionPathFor(refs.placer, track);
		seedTween(placer);

		ghosts = (refs.ghosts ?? []).filter(Boolean).map((el) => {
			const tween = motionPathFor(el, track);
			seedTween(tween);
			return tween;
		});
		resetHistory();

		timeline = gsap.timeline({ paused: true, onUpdate: frame });

		// Baseline, applied twice on purpose.
		//
		// Imperatively first: a paused timeline sitting at time 0 has nothing to
		// re-render, so its own t=0 children never fire and the very first frame
		// would paint an empty <path> at the origin. A track that starts late has
		// no rendered frame at all until its offset arrives, so this matters more
		// with several tracks than it did with one.
		//
		// Then as timeline children as well, so scrubbing backwards past the first
		// morph restores the starting shape instead of leaving the last one on.
		gsap.set(refs.morph, { attr: { d: startAsset.d } });
		gsap.set(refs.norm, { ...startAsset.norm });
		gsap.set(refs.orient, { ...startAsset.orient, svgOrigin: '0 0' });
		gsap.set(refs.size, { scale: s.objectSize / 100 });
		gsap.set(refs.fx, { attr: { class: 'gasp-fx' } });
		gsap.set(refs.fx, transformOf(s.startState));
		gsap.set(refs.morph, paintOf(s.startState));
		// Killing a tween leaves its last rendered values on the element, so any
		// wrapper whose driving tweens might not be rebuilt has to be reset by
		// hand — otherwise turning idle life off freezes the object mid-bob.
		if (refs.life) gsap.set(refs.life, { x: 0, y: 0, rotation: 0, scale: 1 });
		if (refs.dyn) gsap.set(refs.dyn, { x: 0, y: 0, rotation: 0, scale: 1 });
		if (refs.accent) gsap.set(refs.accent, { scale: 1, rotation: 0 });
		resetDynamics(track);

		timeline.set(refs.morph, { attr: { d: startAsset.d } }, 0);
		timeline.set(refs.norm, { ...startAsset.norm }, 0);
		timeline.set(refs.orient, { ...startAsset.orient }, 0);
		timeline.set(refs.size, { scale: s.objectSize / 100 }, 0);

		let shape = startAsset;

		for (let i = 0; i < plan.stops.length; i++) {
			const stop = plan.stops[i];
			const next = plan.stops[i + 1];
			const target = next ? next.state : stop.state;

			// --- Arrival: snap to this stop's look and freeze it for the hold.
			// The base class has to be re-stated: setting `class` replaces the whole
			// attribute, so omitting it would strip the element's own identity.
			timeline.set(refs.fx, { attr: { class: ('gasp-fx ' + stop.classes).trim() } }, stop.arriveAt);
			timeline.set(refs.fx, transformOf(stop.state), stop.arriveAt);
			timeline.set(refs.morph, paintOf(stop.state), stop.arriveAt);
			timeline.set(proxy, { p: stop.from }, stop.arriveAt);

			// --- Settle: a damped wobble on arrival. Authored on its own wrapper so
			// it scrubs with the timeline and never fights the per-stop state tweens.
			if (s.settle.enabled && refs.accent && !stop.isStart) {
				timeline.fromTo(
					refs.accent,
					{ rotation: s.settle.amount },
					{
						rotation: 0,
						duration: s.settle.duration,
						ease: `elastic.out(1, ${Math.min(0.9, 0.18 + s.settle.duration / 6)})`,
						immediateRender: false
					},
					stop.arriveAt
				);
			}

			// --- Shape change.
			const win = morphWindow(stop);
			const targetAsset = win ? byId(stop.morphTarget) : null;
			if (win && targetAsset?.norm && targetAsset.d !== shape.d) {
				const fromShape = shape;
				timeline.set(refs.morph, { attr: { d: fromShape.d } }, win.at);
				timeline.to(
					refs.morph,
					{
						morphSVG: { shape: targetAsset.d, ...resolveMorph(stop, s) },
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
				// Two assets can be drawn facing different ways; ease between their
				// corrections rather than snapping mid-morph.
				if (refs.orient && !sameOrient(fromShape.orient, targetAsset.orient)) {
					timeline.fromTo(
						refs.orient,
						pick(fromShape.orient, ORIENT_KEYS),
						{
							...pick(targetAsset.orient, ORIENT_KEYS),
							duration: win.duration,
							ease: stop.ease,
							immediateRender: false
						},
						win.at
					);
				}
				// A scale punch on the shape change, so a grab lands rather than
				// dissolving. Rides the accent wrapper alongside settle.
				if (s.morphRecoil.enabled && s.morphRecoil.scale > 0 && refs.accent) {
					timeline.fromTo(
						refs.accent,
						{ scale: 1 },
						{
							scale: 1 + s.morphRecoil.scale,
							duration: s.morphRecoil.duration / 2,
							ease: 'power2.out',
							yoyo: true,
							repeat: 1,
							immediateRender: false
						},
						win.at
					);
				}

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

		buildLife(track);

		// A morph can legitimately outrun the stop it belongs to (a long custom
		// morph on a short hold), so the real timeline can be longer than the sum
		// of holds and travels. Report the longer of the two, or the scrubber
		// readout and its marker ticks are measured against the wrong total.
		plan.duration = Math.max(plan.duration, timeline.duration());

		timeline.pause(0);
		frame();
		return { stops: plan.stops, duration: plan.duration };
	}

	return {
		build,
		frame,
		stepDynamics,
		resetHistory,
		get timeline() {
			return timeline;
		},
		get duration() {
			return plan.duration;
		},
		setRecording(on) {
			recording = on;
			if (!on) resetHistory();
		},
		setLifePlaying(playing) {
			life.forEach((t) => (playing ? t.play() : t.pause()));
		},
		destroy: teardown
	};
}

/**
 * Composes a scene: one master timeline with every visible track added at its
 * own offset.
 *
 * Tracks inside a scene DO share a timeline, because their timing relationship
 * is the reason they are in the same scene. Separate scenes on a page do not —
 * they get independent timelines and independent triggers.
 */
export function createSceneRenderer() {
	let master = null;
	const renderers = new Map();
	let plan = { lanes: [], duration: 0 };
	let onFrame = null;
	let playing = false;
	let ticking = false;
	let lastTick = 0;

	/**
	 * Secondary motion runs on the ticker, not the timeline.
	 *
	 * A track's own timeline only fires onUpdate while the playhead is inside its
	 * window, so a track that has finished — or has not started yet — would sit
	 * frozen. Wall-clock behaviour has to keep going regardless.
	 */
	function tick() {
		const now = gsap.ticker.time;
		const dt = lastTick ? Math.max(0, now - lastTick) : 1 / 60;
		lastTick = now;
		renderers.forEach((r) => r.stepDynamics(dt, playing));
	}

	function setTicking(on) {
		if (on === ticking) return;
		ticking = on;
		if (on) {
			lastTick = gsap.ticker.time;
			gsap.ticker.add(tick);
		} else {
			gsap.ticker.remove(tick);
		}
	}

	function teardown() {
		setTicking(false);
		master?.kill();
		master = null;
		renderers.forEach((r) => r.destroy());
		renderers.clear();
	}

	function report() {
		onFrame?.(master ? master.progress() : 0, master ? master.time() : 0, plan.duration);
	}

	function build(refsByTrack, { layout, scene, assets }, { restore = 0, playing = false } = {}) {
		if (!layout || !scene) return null;

		const next = planScene(layout);

		// Stage every track before tearing anything down: a track whose elements
		// have not mounted yet must not leave the scene half-built.
		const staged = [];
		for (const lane of next.lanes) {
			const refs = refsByTrack[lane.id];
			if (!refs?.path || !refs.placer || !refs.morph) return null;
			staged.push({ lane, refs });
		}

		teardown();
		plan = next;

		master = gsap.timeline({
			paused: true,
			repeat: scene.loop ? -1 : 0,
			yoyo: scene.loop && scene.yoyo,
			onUpdate: report
		});

		for (const { lane, refs } of staged) {
			const renderer = createTrackRenderer();
			const result = renderer.build(refs, { track: lane.track, assets });
			if (!result) continue;
			renderers.set(lane.id, renderer);
			lane.duration = result.duration;
			lane.stops = result.stops;
			lane.endsAt = lane.offset + result.duration;
			master.add(renderer.timeline, lane.offset);
			// The track timeline is built paused so it can be rendered at frame 0
			// before it joins the scene. A paused CHILD stays frozen even when its
			// parent plays, so hand control back to the master once it is in.
			renderer.timeline.paused(false);
		}

		plan.duration = plan.lanes.reduce((max, l) => Math.max(max, l.endsAt), 0);

		master.pause(0);
		if (restore > 0) master.progress(clamp01(restore));
		setPlaying(playing);
		report();

		return { lanes: plan.lanes, duration: plan.duration };
	}

	function setPlaying(next) {
		playing = next;
		renderers.forEach((r) => {
			r.setRecording(next);
			r.setLifePlaying(next);
		});
		if (master) next ? master.play() : master.pause();
		// Keep ticking for one settle pass after a pause so the springs land on
		// their targets rather than freezing mid-swing.
		setTicking(true);
		if (!next) tick();
	}

	/** Re-push the current frame to every track after a seek. */
	function refresh() {
		renderers.forEach((r) => {
			r.resetHistory();
			r.frame();
			// Snap, do not integrate: a scrubbed frame has to be reproducible.
			r.stepDynamics(0, false);
		});
	}

	return {
		build,
		setPlaying,
		seek(progress) {
			if (!master) return;
			master.progress(clamp01(progress));
			refresh();
			report();
		},
		restart() {
			if (!master) return;
			master.progress(0);
			refresh();
			report();
		},
		get duration() {
			return plan.duration;
		},
		get lanes() {
			return plan.lanes;
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
