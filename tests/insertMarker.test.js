import { describe, expect, it } from 'vitest';
import { insertMarker, invertEase, sliceEase } from '../src/lib/insertMarker.js';
import { planStops } from '../src/lib/engine.js';
import { makeMarker, makeTrack } from '../src/lib/model.js';
import { gsap } from 'gsap';

const track = (over = {}) =>
	makeTrack({
		settings: { startHold: 0, startDuration: 4, startEase: 'power2.inOut', ...(over.settings ?? {}) },
		markers: over.markers ?? []
	});

describe('invertEase', () => {
	it('round-trips through the ease', () => {
		for (const name of ['none', 'power2.inOut', 'power3.out', 'sine.inOut']) {
			const fn = gsap.parseEase(name);
			for (const target of [0.1, 0.35, 0.5, 0.8]) {
				expect(fn(invertEase(name, target))).toBeCloseTo(target, 3);
			}
		}
	});

	it('is the identity for a linear ease', () => {
		expect(invertEase('none', 0.42)).toBeCloseTo(0.42, 3);
	});
});

describe('sliceEase', () => {
	it('produces an ease that spans 0..1 over 0..1', () => {
		const name = sliceEase('power2.inOut', 0.25, 0.75);
		const fn = gsap.parseEase(name);
		expect(fn(0)).toBeCloseTo(0, 3);
		expect(fn(1)).toBeCloseTo(1, 3);
	});

	it('keeps the shape of the original stretch', () => {
		// The back half of an inOut is an ease-out: it should be ahead of linear.
		const fn = gsap.parseEase(sliceEase('power2.inOut', 0.5, 1));
		expect(fn(0.5)).toBeGreaterThan(0.5);
	});

	it('falls back to linear on a degenerate slice', () => {
		expect(sliceEase('power2.inOut', 0.4, 0.4)).toBe('none');
	});
});

describe('insertMarker', () => {
	it('leaves the total duration untouched', () => {
		const t = track();
		const before = planStops(t).duration;
		insertMarker(t, 0.5);
		expect(planStops(t).duration).toBeCloseTo(before, 6);
	});

	it('splits the segment it lands in, not appends to it', () => {
		const t = track();
		insertMarker(t, 0.5);
		const { stops } = planStops(t);
		expect(stops).toHaveLength(2);
		expect(stops[0].travel + stops[1].travel).toBeCloseTo(4, 6);
	});

	it('splits at the moment the object actually passes the point', () => {
		const t = track();
		insertMarker(t, 0.5);
		const { stops } = planStops(t);
		// power2.inOut reaches halfway at exactly half the time, so a midpoint
		// insert splits 2s / 2s.
		expect(stops[0].travel).toBeCloseTo(2, 2);

		const skewed = track({ settings: { startEase: 'power3.out', startDuration: 4 } });
		insertMarker(skewed, 0.5);
		const s2 = planStops(skewed).stops;
		// An ease-out covers half the distance early, so the first half is shorter.
		expect(s2[0].travel).toBeLessThan(2);
		expect(s2[0].travel + s2[1].travel).toBeCloseTo(4, 6);
	});

	it('does not move any later marker in time', () => {
		const t = track({ markers: [makeMarker(0.8, { duration: 2, hold: 1 })] });
		const at = (tr) => planStops(tr).stops.find((s) => s.id !== 'start')?.arriveAt;
		const before = at(t);
		insertMarker(t, 0.4);
		const after = planStops(t).stops.find((s) => Math.abs(s.from - 0.8) < 1e-9)?.arriveAt;
		expect(after).toBeCloseTo(before, 6);
	});

	it('inherits the look so the insert changes nothing visually', () => {
		const t = track();
		t.settings.startState.scale = 1.5;
		const m = insertMarker(t, 0.5);
		expect(m.state.scale).toBe(1.5);
	});

	it('appends without touching timing when the toggle is off', () => {
		const t = track();
		const before = planStops(t).duration;
		insertMarker(t, 0.5, { keepTotalTiming: false });
		expect(planStops(t).duration).toBeGreaterThan(before);
	});

	it('appends when the point is outside every segment', () => {
		const t = track();
		const before = planStops(t).duration;
		insertMarker(t, 1);
		// Nothing to split at the very end, so it is a plain append.
		expect(planStops(t).duration).toBeGreaterThan(before);
	});

	it('never produces a zero-length half', () => {
		const t = track();
		insertMarker(t, 0.0001);
		for (const stop of planStops(t).stops) expect(stop.travel).toBeGreaterThan(0);
	});
});
