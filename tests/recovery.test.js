import { describe, expect, it } from 'vitest';
import { describeAge, trimForStorage } from '../src/lib/recovery.js';
import { defaultProject } from '../src/lib/model.js';

describe('trimForStorage', () => {
	it('drops background images and says how many', () => {
		// A background is a data URL, routinely megabytes. Keeping one would blow
		// the quota and take the rest of the project down with it.
		const snapshot = defaultProject();
		snapshot.scenes[0].layouts[0].background = 'data:image/png;base64,AAAA';
		const { payload, droppedBackgrounds } = trimForStorage(snapshot);
		expect(droppedBackgrounds).toBe(1);
		expect(payload.scenes[0].layouts[0].background).toBeNull();
	});

	it('reports zero when there was nothing to drop', () => {
		expect(trimForStorage(defaultProject()).droppedBackgrounds).toBe(0);
	});

	it('leaves the rest of the project intact', () => {
		const snapshot = defaultProject();
		const { payload } = trimForStorage(snapshot);
		const before = snapshot.scenes[0].layouts[0].tracks[0];
		const after = payload.scenes[0].layouts[0].tracks[0];
		expect(after.markers).toEqual(before.markers);
		expect(after.points).toEqual(before.points);
		expect(payload.assets).toEqual(snapshot.assets);
	});

	it('does not mutate what it was handed', () => {
		const snapshot = defaultProject();
		snapshot.scenes[0].layouts[0].background = 'data:image/png;base64,AAAA';
		trimForStorage(snapshot);
		expect(snapshot.scenes[0].layouts[0].background).toBe('data:image/png;base64,AAAA');
	});
});

describe('describeAge', () => {
	const now = Date.now();
	it('reads as a person would say it', () => {
		expect(describeAge(now)).toBe('moments ago');
		expect(describeAge(now - 90_000)).toBe('2 minutes ago');
		expect(describeAge(now - 60_000)).toBe('1 minute ago');
		expect(describeAge(now - 3 * 3600_000)).toBe('3 hours ago');
		expect(describeAge(now - 50 * 3600_000)).toBe('2 days ago');
	});

	it('never reads as negative if the clock moved', () => {
		expect(describeAge(now + 60_000)).toBe('moments ago');
	});
});
