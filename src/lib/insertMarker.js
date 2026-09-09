import { gsap } from 'gsap';
import { CustomEase } from 'gsap/CustomEase';
import { planStops } from './engine.js';
import { makeMarker } from './model.js';
import { clamp01 } from './path.js';

gsap.registerPlugin(CustomEase);

/**
 * Inserting a marker without disturbing anything downstream.
 *
 * You often drop a marker mid-segment purely to keyframe a rotation tweak, and
 * the last thing you want is every later marker sliding in time. So the segment
 * it lands in keeps its total duration: the time is split between the two new
 * halves instead of a new segment being added.
 *
 * Splitting by path distance alone would still change the motion, because the
 * segment's easing means the object does not reach the halfway point at the
 * halfway time. Inverting the easing puts the split at the moment the object
 * ACTUALLY passes that point, and slicing the easing curve into two normalised
 * halves keeps the shape of the motion — so the insert is a visual no-op until
 * you edit the new marker.
 */

/** Numerically invert a GSAP ease: given eased output, find the input time. */
export function invertEase(ease, target, steps = 24) {
	const fn = gsap.parseEase(ease) ?? ((t) => t);
	// Eases are monotonic in the cases that matter here; bisection is plenty and
	// cannot diverge the way Newton can on a flat stretch.
	let lo = 0;
	let hi = 1;
	for (let i = 0; i < steps; i++) {
		const mid = (lo + hi) / 2;
		if (fn(mid) < target) lo = mid;
		else hi = mid;
	}
	return (lo + hi) / 2;
}

let sliceCount = 0;

/**
 * The portion of `ease` between t0 and t1, renormalised to run 0..1 over 0..1.
 * Returns an ease name usable anywhere a string ease is.
 */
export function sliceEase(ease, t0, t1, samples = 24) {
	const fn = gsap.parseEase(ease) ?? ((t) => t);
	const y0 = fn(t0);
	const y1 = fn(t1);
	const span = y1 - y0;
	const dt = t1 - t0;

	// A flat or degenerate slice has nothing to preserve; linear is honest.
	if (!Number.isFinite(span) || Math.abs(span) < 1e-6 || dt <= 0) return 'none';

	const points = [];
	for (let i = 0; i <= samples; i++) {
		const u = i / samples;
		const y = (fn(t0 + dt * u) - y0) / span;
		points.push(`${round(u)},${round(y)}`);
	}

	const name = `gaspSlice${++sliceCount}`;
	try {
		CustomEase.create(name, `M${points.join(' L')}`);
		return name;
	} catch {
		return 'none';
	}
}

const round = (n) => Math.round(n * 10000) / 10000;

/**
 * Where along a track's path a progress value sits, as a fraction of the
 * sub-path between two stops.
 */
function fractionBetween(from, to, progress) {
	const span = to - from;
	if (Math.abs(span) < 1e-9) return 0;
	return clamp01((progress - from) / span);
}

/**
 * Adds a marker at `progress`, optionally preserving the track's total timing.
 *
 * Returns the new marker. Mutates `track.markers`.
 */
export function insertMarker(track, progress, { keepTotalTiming = true } = {}) {
	const p = clamp01(progress);
	const marker = makeMarker(p);

	if (!keepTotalTiming) {
		track.markers = [...track.markers, marker];
		return marker;
	}

	// Which existing stop's travel does this land inside?
	const { stops } = planStops(track);
	const host = stops.find((s) => p > s.from && p < s.to);
	if (!host) {
		track.markers = [...track.markers, marker];
		return marker;
	}

	const f = fractionBetween(host.from, host.to, p);
	const t = invertEase(host.ease, f);
	const total = host.travel;

	// Guard against a split so lopsided that one half rounds to nothing.
	const first = Math.max(0.05, total * t);
	const second = Math.max(0.05, total - first);

	marker.duration = second;
	marker.ease = sliceEase(host.ease, t, 1);
	// Inherit the look, so nothing changes until the new marker is edited.
	marker.state = { ...host.state };

	if (host.isStart) {
		track.settings.startDuration = first;
		track.settings.startEase = sliceEase(host.ease, 0, t);
	} else {
		const source = track.markers.find((m) => m.id === host.id);
		if (source) {
			source.duration = first;
			source.ease = sliceEase(host.ease, 0, t);
		}
	}

	track.markers = [...track.markers, marker];
	return marker;
}
