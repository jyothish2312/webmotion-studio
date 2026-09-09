import { describe, expect, it } from 'vitest';
import { planScene } from '../src/lib/engine.js';
import { makeLayout, makeMarker, makeTrack } from '../src/lib/model.js';

const track = (name, over = {}) =>
	makeTrack({
		name,
		settings: { startHold: 0, startDuration: 2, ...(over.settings ?? {}) },
		...over
	});

describe('planScene', () => {
	it('shifts each track by its offset and ends with the last one', () => {
		const layout = makeLayout({
			tracks: [track('drone'), track('crate', { offset: 3 })]
		});
		const { lanes, duration } = planScene(layout);

		expect(lanes.map((l) => l.name)).toEqual(['drone', 'crate']);
		expect(lanes[0].offset).toBe(0);
		expect(lanes[0].endsAt).toBeCloseTo(2, 9);
		expect(lanes[1].offset).toBe(3);
		expect(lanes[1].endsAt).toBeCloseTo(5, 9);
		// The master runs until the LAST track finishes, not the longest one.
		expect(duration).toBeCloseTo(5, 9);
	});

	it('keeps stop times track-relative so the scene can place them', () => {
		const layout = makeLayout({
			tracks: [
				track('late', {
					offset: 4,
					markers: [makeMarker(0.5, { hold: 1, duration: 1 })]
				})
			]
		});
		const [lane] = planScene(layout).lanes;

		// planStops is relative to the track; the offset is applied by the scene.
		expect(lane.stops[0].arriveAt).toBe(0);
		expect(lane.stops[1].arriveAt).toBeCloseTo(2, 9);
		expect(lane.offset + lane.stops[1].arriveAt).toBeCloseTo(6, 9);
	});

	it('clamps a negative offset rather than shifting time backwards', () => {
		const layout = makeLayout({ tracks: [track('a', { offset: -5 })] });
		expect(planScene(layout).lanes[0].offset).toBe(0);
	});

	it('skips hidden tracks', () => {
		const layout = makeLayout({
			tracks: [track('shown'), track('gone', { hidden: true, offset: 10 })]
		});
		const { lanes, duration } = planScene(layout);
		expect(lanes).toHaveLength(1);
		expect(duration).toBeCloseTo(2, 9);
	});

	it('solo wins over the rest', () => {
		const layout = makeLayout({
			tracks: [track('a'), track('b', { solo: true }), track('c')]
		});
		expect(planScene(layout).lanes.map((l) => l.name)).toEqual(['b']);
	});

	it('a hidden solo track still hides', () => {
		const layout = makeLayout({
			tracks: [track('a'), track('b', { solo: true, hidden: true })]
		});
		expect(planScene(layout).lanes).toHaveLength(0);
	});

	it('onlyVisible:false is what the exporter uses to see everything', () => {
		const layout = makeLayout({ tracks: [track('a'), track('b', { hidden: true })] });
		expect(planScene(layout, { onlyVisible: false }).lanes).toHaveLength(2);
	});

	it('an empty layout has zero duration rather than NaN', () => {
		const { lanes, duration } = planScene({ tracks: [] });
		expect(lanes).toEqual([]);
		expect(duration).toBe(0);
	});
});
