import { describe, expect, it } from 'vitest';
import { makeLayout, makeScene, pickLayout } from '../src/lib/model.js';

const scene = (...layouts) => makeScene({ layouts });

describe('pickLayout', () => {
	const responsive = scene(
		makeLayout({ name: 'desktop', match: { minWidth: 1024 } }),
		makeLayout({ name: 'tablet', match: { minWidth: 640 } }),
		makeLayout({ name: 'mobile', match: {} })
	);

	it('takes the first match, in tab order', () => {
		expect(pickLayout(responsive, 1440, 900).name).toBe('desktop');
		expect(pickLayout(responsive, 800, 900).name).toBe('tablet');
		expect(pickLayout(responsive, 390, 800).name).toBe('mobile');
	});

	it('treats a boundary width as inclusive', () => {
		expect(pickLayout(responsive, 1024, 800).name).toBe('desktop');
		expect(pickLayout(responsive, 1023, 800).name).toBe('tablet');
		expect(pickLayout(responsive, 640, 800).name).toBe('tablet');
		expect(pickLayout(responsive, 639, 800).name).toBe('mobile');
	});

	it('falls back to the last layout when nothing matches', () => {
		// Every layout demands a big container; a phone still has to render.
		const strict = scene(
			makeLayout({ name: 'a', match: { minWidth: 2000 } }),
			makeLayout({ name: 'b', match: { minWidth: 1600 } })
		);
		expect(pickLayout(strict, 320, 640).name).toBe('b');
	});

	it('honours maxWidth', () => {
		const s = scene(
			makeLayout({ name: 'narrow', match: { maxWidth: 500 } }),
			makeLayout({ name: 'wide', match: {} })
		);
		expect(pickLayout(s, 400, 800).name).toBe('narrow');
		expect(pickLayout(s, 501, 800).name).toBe('wide');
	});

	it('honours an aspect window', () => {
		const s = scene(
			makeLayout({ name: 'portrait', match: { aspect: [0, 1] } }),
			makeLayout({ name: 'landscape', match: {} })
		);
		expect(pickLayout(s, 400, 800).name).toBe('portrait');
		expect(pickLayout(s, 1600, 900).name).toBe('landscape');
	});

	it('survives a zero height instead of dividing by zero', () => {
		const s = scene(makeLayout({ name: 'only', match: { aspect: [0.5, 2] } }));
		expect(pickLayout(s, 800, 0).name).toBe('only');
	});

	it('returns null when a scene has no layouts', () => {
		expect(pickLayout({ layouts: [] }, 800, 600)).toBeNull();
		expect(pickLayout(null, 800, 600)).toBeNull();
	});
});
