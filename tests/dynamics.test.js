import { describe, expect, it } from 'vitest';
import { createAngleSpring, createNoise, createSpring, shortestAngle } from '../src/lib/dynamics.js';

describe('shortestAngle', () => {
	it('always goes the short way round', () => {
		expect(shortestAngle(350, 10)).toBe(20);
		expect(shortestAngle(10, 350)).toBe(-20);
		expect(shortestAngle(0, -179)).toBe(-179);
		expect(shortestAngle(720, 725)).toBe(5);
	});

	it('resolves the half turn to one side rather than flip-flopping', () => {
		// At exactly 180 both directions are the same length; the result lands in
		// [-180, 180), so it is always -180. Either is the same rotation, but it
		// has to be consistent or the spring would jitter between them.
		expect(shortestAngle(0, 180)).toBe(-180);
		expect(shortestAngle(180, 0)).toBe(-180);
	});
});

describe('createSpring', () => {
	it('converges on its target', () => {
		const s = createSpring(4, 1);
		for (let i = 0; i < 300; i++) s.step(10, 1 / 60);
		expect(s.value).toBeCloseTo(10, 3);
		expect(Math.abs(s.velocity)).toBeLessThan(0.01);
	});

	it('overshoots when underdamped and does not when critically damped', () => {
		const loose = createSpring(4, 0.2);
		const tight = createSpring(4, 1);
		let loosePeak = 0;
		let tightPeak = 0;
		for (let i = 0; i < 120; i++) {
			loosePeak = Math.max(loosePeak, loose.step(10, 1 / 60));
			tightPeak = Math.max(tightPeak, tight.step(10, 1 / 60));
		}
		expect(loosePeak).toBeGreaterThan(10);
		expect(tightPeak).toBeLessThanOrEqual(10.001);
	});

	it('clamps a long frame instead of exploding', () => {
		const s = createSpring(8, 0.4);
		// A backgrounded tab can hand back a multi-second delta.
		s.step(100, 5);
		expect(Number.isFinite(s.value)).toBe(true);
		expect(Math.abs(s.value)).toBeLessThan(1000);
	});

	it('snap kills the motion so a paused frame is reproducible', () => {
		const s = createSpring(4, 0.3);
		for (let i = 0; i < 10; i++) s.step(10, 1 / 60);
		expect(s.snap(3)).toBe(3);
		expect(s.velocity).toBe(0);
	});
});

describe('createAngleSpring', () => {
	it('crosses 360 the short way rather than unwinding', () => {
		const a = createAngleSpring(6, 1);
		a.snap(350);
		for (let i = 0; i < 300; i++) a.step(10, 1 / 60);
		// 350 -> 370 is +20; going the long way would land near 10.
		expect(a.value).toBeCloseTo(370, 0);
	});
});

describe('createNoise', () => {
	const noise = createNoise(7);

	it('stays inside -1..1', () => {
		let min = Infinity;
		let max = -Infinity;
		for (let i = 0; i < 5000; i++) {
			const v = noise(i * 0.03);
			min = Math.min(min, v);
			max = Math.max(max, v);
		}
		expect(min).toBeGreaterThanOrEqual(-1);
		expect(max).toBeLessThanOrEqual(1);
		// It should actually use the range, not hover near zero.
		expect(max - min).toBeGreaterThan(0.8);
	});

	it('is deterministic for a seed, and different across seeds', () => {
		expect(createNoise(3)(1.234)).toBe(createNoise(3)(1.234));
		expect(createNoise(3)(1.234)).not.toBe(createNoise(4)(1.234));
	});

	it('is continuous — no jumps between adjacent samples', () => {
		let biggest = 0;
		let prev = noise(0);
		for (let i = 1; i < 2000; i++) {
			const v = noise(i * 0.01);
			biggest = Math.max(biggest, Math.abs(v - prev));
			prev = v;
		}
		expect(biggest).toBeLessThan(0.25);
	});

	it('does not repeat on a short cycle the way stacked sines do', () => {
		// Sample a long window; a periodic signal would show near-exact repeats.
		const a = [];
		for (let i = 0; i < 400; i++) a.push(noise(i * 0.05));
		const b = [];
		for (let i = 0; i < 400; i++) b.push(noise(100 + i * 0.05));
		const diff = a.reduce((sum, v, i) => sum + Math.abs(v - b[i]), 0) / a.length;
		expect(diff).toBeGreaterThan(0.1);
	});
});
