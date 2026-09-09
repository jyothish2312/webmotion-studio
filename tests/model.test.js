import { describe, expect, it } from 'vitest';
import { defaultProject, makeMarker, makeState, makeTrack, migrate, SCHEMA_VERSION } from '../src/lib/model.js';

describe('defaults', () => {
	it('produces a fully-populated v3 project', () => {
		const p = defaultProject();
		expect(p.version).toBe(SCHEMA_VERSION);
		expect(p.scenes).toHaveLength(1);
		expect(p.scenes[0].layouts).toHaveLength(1);
		expect(p.scenes[0].layouts[0].tracks).toHaveLength(1);
		expect(p.scenes[0].layouts[0].tracks[0].points.length).toBeGreaterThanOrEqual(2);
	});
});

describe('factories coerce junk', () => {
	it('clamps and defaults numeric fields', () => {
		const m = makeMarker('nonsense', { hold: -4, duration: 0, morphDuration: NaN });
		expect(m.progress).toBe(0.5);
		expect(m.hold).toBe(0);
		expect(m.duration).toBeGreaterThan(0);
		expect(m.morphDuration).toBeGreaterThan(0);
	});

	it('rejects an unknown morphType', () => {
		expect(makeMarker(0.5, { morphType: 'sideways' }).morphType).toBe('hold');
	});

	it('keeps opacity inside 0..1 and colours as strings', () => {
		expect(makeState({ opacity: 5 }).opacity).toBe(1);
		expect(makeState({ opacity: -2 }).opacity).toBe(0);
		expect(makeState({ stroke: 42 }).stroke).toBe('#e6edf3');
	});

	it('replaces a degenerate path with the default one', () => {
		expect(makeTrack({ points: [{ x: 1, y: 1 }] }).points.length).toBeGreaterThanOrEqual(2);
	});
});

describe('migrate', () => {
	it('rejects non-objects', () => {
		expect(() => migrate(null)).toThrow();
		expect(() => migrate('nope')).toThrow();
	});

	it('wraps a flat v2 file into scene / layout / track', () => {
		const v2 = {
			version: 2,
			name: 'Old',
			assets: [{ id: 'a', name: 'A', d: 'M0 0 L10 10' }],
			background: 'data:image/png;base64,xx',
			points: [
				{ id: 'p1', x: 0, y: 0, inX: -1, inY: 0, outX: 1, outY: 0 },
				{ id: 'p2', x: 50, y: 50, inX: -1, inY: 0, outX: 1, outY: 0 }
			],
			markers: [{ id: 'm', progress: 0.5, hold: 1 }],
			settings: { startingAssetId: 'a', loop: false, yoyo: true, objectSize: 80 }
		};
		const p = migrate(v2);

		expect(p.version).toBe(SCHEMA_VERSION);
		expect(p.name).toBe('Old');
		expect(p.scenes).toHaveLength(1);

		const scene = p.scenes[0];
		const layout = scene.layouts[0];
		const track = layout.tracks[0];

		// loop/yoyo belong to the scene now; everything else stays on the track.
		expect(scene.loop).toBe(false);
		expect(scene.yoyo).toBe(true);
		expect(track.settings.objectSize).toBe(80);
		expect(track.settings).not.toHaveProperty('loop');

		expect(layout.background).toBe(v2.background);
		expect(track.points).toHaveLength(2);
		expect(track.markers[0].hold).toBe(1);
		expect(track.startingAssetId).toBe('a');
	});

	it('folds v1 class strings into a real state plus literal classes', () => {
		const v1 = {
			projectName: 'Ancient',
			assetLibrary: [{ id: 'a', name: 'A', d: 'M0 0 L1 1' }],
			pathPoints: [
				{ x: 0, y: 0, inX: -1, inY: 0, outX: 1, outY: 0 },
				{ x: 9, y: 9, inX: -1, inY: 0, outX: 1, outY: 0 }
			],
			markers: [{ id: 1, progress: 0.4, instantClasses: 'stroke-white', transitionClasses: 'opacity-50' }],
			motionSettings: { startingAssetId: 'a', initialDuration: 3, initialEase: 'bounce.out' }
		};
		const track = migrate(v1).scenes[0].layouts[0].tracks[0];

		expect(track.markers[0].classes).toBe('stroke-white opacity-50');
		expect(track.markers[0].state).toEqual(makeState());
		expect(track.settings.startDuration).toBe(3);
		expect(track.settings.startEase).toBe('bounce.out');
		expect(typeof track.markers[0].id).toBe('string');
	});

	it('repoints dangling asset references instead of rendering nothing', () => {
		const p = migrate({
			version: 3,
			name: 'x',
			assets: [{ id: 'keep', name: 'Keep', d: 'M0 0 L1 1' }],
			scenes: [
				{
					layouts: [
						{
							tracks: [
								{
									startingAssetId: 'deleted',
									markers: [{ progress: 0.5, morphTarget: 'also-deleted' }]
								}
							]
						}
					]
				}
			]
		});
		const track = p.scenes[0].layouts[0].tracks[0];
		expect(track.startingAssetId).toBe('keep');
		expect(track.markers[0].morphTarget).toBe('none');
	});

	it('falls back to default assets when the file has none usable', () => {
		const p = migrate({ version: 3, name: 'x', assets: [{ id: 'broken' }], scenes: [] });
		expect(p.assets.length).toBeGreaterThan(0);
		expect(p.scenes.length).toBe(1);
	});

	it('is idempotent', () => {
		const once = migrate(defaultProject());
		const twice = migrate(JSON.parse(JSON.stringify(once)));
		expect(twice.scenes[0].layouts[0].tracks[0].settings).toEqual(
			once.scenes[0].layouts[0].tracks[0].settings
		);
	});
});
