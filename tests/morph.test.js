import { describe, expect, it } from 'vitest';
import { makeMarker, makeTrackSettings, normalizeShapeIndex, resolveMorph } from '../src/lib/model.js';
import { migrate } from '../src/lib/model.js';

const settings = (over = {}) => makeTrackSettings(over);

describe('resolveMorph', () => {
	it('minimal pairs by position and interpolates straight', () => {
		// Measured on the example drones: size+rotational overshot the shared box
		// by 21% and travelled twice as far as position+linear.
		expect(resolveMorph({ morphStyle: 'minimal' }, settings())).toEqual({
			map: 'position',
			type: 'linear',
			shapeIndex: 'auto'
		});
	});

	it('organic is the one that swings anchors on arcs', () => {
		expect(resolveMorph({ morphStyle: 'organic' }, settings()).type).toBe('rotational');
	});

	it('balanced and detail stay linear', () => {
		expect(resolveMorph({ morphStyle: 'balanced' }, settings())).toMatchObject({ map: 'size', type: 'linear' });
		expect(resolveMorph({ morphStyle: 'detail' }, settings())).toMatchObject({ map: 'complexity', type: 'linear' });
	});

	it('auto follows the track switch, both ways', () => {
		expect(resolveMorph({ morphStyle: 'auto' }, settings({ rotationalMorph: true })).type).toBe('rotational');
		expect(resolveMorph({ morphStyle: 'auto' }, settings({ rotationalMorph: false })).type).toBe('linear');
	});

	it('treats a missing style as auto rather than guessing', () => {
		expect(resolveMorph({}, settings({ rotationalMorph: true })).type).toBe('rotational');
		expect(resolveMorph(undefined, settings({ rotationalMorph: false })).type).toBe('linear');
	});

	it('custom passes the raw options through', () => {
		const marker = {
			morphStyle: 'custom',
			morphMap: 'complexity',
			morphRotational: true,
			morphShapeIndex: 3
		};
		expect(resolveMorph(marker, settings())).toEqual({
			map: 'complexity',
			type: 'rotational',
			shapeIndex: 3
		});
	});

	it('custom rejects a nonsense map instead of handing it to the plugin', () => {
		expect(resolveMorph({ morphStyle: 'custom', morphMap: 'sideways' }, settings()).map).toBe('position');
	});
});

describe('normalizeShapeIndex', () => {
	it('keeps the two keywords the plugin understands', () => {
		expect(normalizeShapeIndex('auto')).toBe('auto');
		expect(normalizeShapeIndex('reverse')).toBe('reverse');
	});

	it('rounds numbers and falls back to auto for junk', () => {
		expect(normalizeShapeIndex('4')).toBe(4);
		expect(normalizeShapeIndex(2.7)).toBe(3);
		expect(normalizeShapeIndex(-2)).toBe(-2);
		expect(normalizeShapeIndex('')).toBe('auto');
		expect(normalizeShapeIndex('nonsense')).toBe('auto');
		expect(normalizeShapeIndex(null)).toBe('auto');
		expect(normalizeShapeIndex(undefined)).toBe('auto');
		// 0 is a real setting ("no offset"), so it must survive rather than
		// collapsing into the default.
		expect(normalizeShapeIndex(0)).toBe(0);
	});
});

describe('defaults and migration', () => {
	it('a brand new marker gets the least-movement style', () => {
		expect(makeMarker(0.5).morphStyle).toBe('minimal');
	});

	it('rejects an unknown style', () => {
		expect(makeMarker(0.5, { morphStyle: 'wobbly' }).morphStyle).toBe('minimal');
	});

	it('an existing project keeps the look it had', () => {
		// Files written before per-marker styles followed the track switch; loading
		// one must not silently restyle every morph in it.
		const p = migrate({
			version: 3,
			name: 'old',
			assets: [{ id: 'a', name: 'A', d: 'M0 0 L10 10' }],
			scenes: [
				{
					layouts: [
						{
							tracks: [
								{
									startingAssetId: 'a',
									settings: { rotationalMorph: true },
									markers: [{ progress: 0.5, morphTarget: 'a' }]
								}
							]
						}
					]
				}
			]
		});
		const track = p.scenes[0].layouts[0].tracks[0];
		expect(track.markers[0].morphStyle).toBe('auto');
		expect(resolveMorph(track.markers[0], track.settings).type).toBe('rotational');
	});

	it('an explicit style in a file survives the round trip', () => {
		const p = migrate({
			version: 3,
			name: 'x',
			assets: [{ id: 'a', name: 'A', d: 'M0 0 L1 1' }],
			scenes: [
				{ layouts: [{ tracks: [{ startingAssetId: 'a', markers: [{ progress: 0.4, morphStyle: 'organic' }] }] }] }
			]
		});
		expect(p.scenes[0].layouts[0].tracks[0].markers[0].morphStyle).toBe('organic');
	});
});
