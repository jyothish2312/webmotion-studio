import { describe, expect, it } from 'vitest';
import { morphWindow, planStops } from '../src/lib/engine.js';

const state = () => ({
	scale: 1,
	rotate: 0,
	opacity: 1,
	stroke: '#fff',
	strokeWidth: 2,
	fill: 'none'
});

const settings = (over = {}) => ({
	startHold: 0.5,
	startDuration: 2,
	startEase: 'power1.inOut',
	startClasses: '',
	startState: state(),
	...over
});

const marker = (id, progress, over = {}) => ({
	id,
	progress,
	hold: 0,
	duration: 1,
	ease: 'none',
	state: state(),
	morphTarget: 'none',
	morphType: 'hold',
	morphDuration: 0.5,
	...over
});

describe('planStops', () => {
	const project = {
		settings: settings(),
		markers: [
			marker('b', 0.8),
			marker('a', 0.4, { hold: 1.5, duration: 3, morphTarget: 'box' })
		]
	};
	const { stops, duration } = planStops(project);

	it('prepends a synthetic start stop and sorts markers by path progress', () => {
		expect(stops.map((s) => s.id)).toEqual(['start', 'a', 'b']);
		expect(stops[0].isStart).toBe(true);
	});

	it('chains each stop to the next along the path, ending at 1', () => {
		expect([stops[0].from, stops[0].to]).toEqual([0, 0.4]);
		expect([stops[1].from, stops[1].to]).toEqual([0.4, 0.8]);
		expect([stops[2].from, stops[2].to]).toEqual([0.8, 1]);
	});

	it('lays stops out in seconds: 0.5 + 2 + 1.5 + 3 + 0 + 1', () => {
		expect(duration).toBeCloseTo(8, 9);
		expect(stops[1].arriveAt).toBeCloseTo(2.5, 9);
		expect(stops[1].travelAt).toBeCloseTo(4, 9);
		expect(stops[2].arriveAt).toBeCloseTo(7, 9);
	});

	it('keeps time position distinct from path position', () => {
		// The whole reason planStops exists: marker "a" sits 40% along the path but
		// only 31.25% through the animation. Anything placing a marker in time has
		// to come through here rather than reusing marker.progress.
		expect(stops[1].from).toBe(0.4);
		expect(stops[1].arriveAt / duration).toBeCloseTo(0.3125, 9);
	});

	it('still produces a timeline when there are no markers', () => {
		const empty = planStops({ settings: settings(), markers: [] });
		expect(empty.stops).toHaveLength(1);
		expect(empty.duration).toBeCloseTo(2.5, 9);
	});

	it('clamps garbage input to finite times and valid progress', () => {
		const bad = planStops({
			settings: settings({ startDuration: 0, startHold: -5 }),
			markers: [marker('x', 2, { hold: NaN, duration: undefined })]
		});
		expect(bad.stops.every((s) => Number.isFinite(s.arriveAt) && Number.isFinite(s.leaveAt))).toBe(true);
		expect(bad.stops[1].from).toBe(1);
		expect(bad.stops[0].hold).toBe(0);
		expect(bad.stops[0].travel).toBeGreaterThan(0);
	});
});

describe('morphWindow', () => {
	const base = planStops({
		settings: settings(),
		markers: [marker('a', 0.4, { hold: 1.5, duration: 3, morphTarget: 'box' })]
	}).stops[1];

	it('returns null when nothing morphs', () => {
		expect(morphWindow({ ...base, morphTarget: 'none' })).toBeNull();
	});

	it('spans the dwell for a hold morph', () => {
		expect(morphWindow(base)).toEqual({ at: 2.5, duration: 1.5 });
	});

	it('falls back to a short beat when there is no dwell', () => {
		expect(morphWindow({ ...base, hold: 0 }).duration).toBe(0.5);
	});

	it('starts on departure for a segment morph', () => {
		expect(morphWindow({ ...base, morphType: 'segment' })).toEqual({
			at: base.travelAt,
			duration: base.travel
		});
	});

	it('uses the explicit length for a custom morph', () => {
		expect(morphWindow({ ...base, morphType: 'custom', morphDuration: 4 })).toEqual({
			at: base.arriveAt,
			duration: 4
		});
	});
});
