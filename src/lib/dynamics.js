/**
 * Procedural secondary motion: springs and value noise.
 *
 * These are NOT a physics simulation and NOT authored keyframes. They are
 * wall-clock behaviour layered on top of the timeline, which is why they live
 * in their own module and get stepped by the ticker rather than being scrubbed.
 *
 * No DOM, no GSAP — the editor and the page runtime both import this, so the
 * two produce identical motion.
 */

/**
 * A damped harmonic spring.
 *
 * `frequency` is how fast it chases (Hz-ish) and `damping` is how much it
 * overshoots: 1 is critically damped and settles without a wobble, below 1
 * overshoots and rings, above 1 crawls in.
 */
export function createSpring(frequency = 4, damping = 1) {
	let value = 0;
	let velocity = 0;

	return {
		get value() {
			return value;
		},
		get velocity() {
			return velocity;
		},
		/** Jump straight to a value and kill the motion. Used when paused. */
		snap(target) {
			value = target;
			velocity = 0;
			return value;
		},
		step(target, dt) {
			// Long frames (a background tab, a slow rebuild) would otherwise inject
			// a huge impulse and fling the spring; clamp instead of exploding.
			const h = Math.min(dt, 1 / 30);
			const w = 2 * Math.PI * frequency;
			const accel = w * w * (target - value) - 2 * damping * w * velocity;
			velocity += accel * h;
			value += velocity * h;
			return value;
		}
	};
}

/** Shortest signed distance from a to b in degrees, so 359 -> 1 is +2. */
export function shortestAngle(a, b) {
	return ((((b - a) % 360) + 540) % 360) - 180;
}

/**
 * An angle spring that always chases the short way round, so a heading crossing
 * 360 does not unwind the whole circle.
 */
export function createAngleSpring(frequency = 4, damping = 1) {
	const spring = createSpring(frequency, damping);
	let base = 0;

	return {
		get value() {
			return base + spring.value;
		},
		snap(target) {
			base = target;
			spring.snap(0);
			return base;
		},
		step(target, dt) {
			// Track the target in a local frame so the spring only ever sees a small
			// offset, then fold the result back into the absolute angle.
			const delta = shortestAngle(base, target);
			spring.step(delta, dt);
			base += spring.value;
			spring.snap(0);
			return base;
		}
	};
}

const fract = (n) => n - Math.floor(n);

/** Deterministic hash in 0..1. Same seed and index always give the same value. */
function hash(seed, i) {
	return fract(Math.sin(seed * 127.1 + i * 311.7) * 43758.5453);
}

const smooth = (t) => t * t * (3 - 2 * t);

/**
 * Layered 1D value noise in roughly -1..1.
 *
 * Three sine loops at different periods still read as clockwork because they
 * repeat exactly; summed octaves of noise never line up the same way twice,
 * which is most of the difference between "alive" and "mechanical".
 */
export function createNoise(seed = 1, octaves = 3) {
	return (t) => {
		let sum = 0;
		let amplitude = 1;
		let total = 0;
		let freq = 1;

		for (let o = 0; o < octaves; o++) {
			const x = t * freq;
			const i = Math.floor(x);
			const f = smooth(x - i);
			const a = hash(seed + o * 17, i);
			const b = hash(seed + o * 17, i + 1);
			const value = (a + (b - a) * f) * 2 - 1; // 0..1 -> -1..1
			sum += value * amplitude;
			total += amplitude;
			amplitude *= 0.5;
			freq *= 2.03; // slightly off 2 so octaves never phase-lock
		}
		return total ? sum / total : 0;
	};
}

/**
 * Heading and curvature of a path at a 0..1 position, by sampling either side.
 *
 * MotionPathPlugin can rotate an object to the tangent itself, but it snaps to
 * it exactly. To lag and bank into turns we need the raw numbers.
 */
export function samplePath(pathEl, progress, total) {
	const len = total ?? pathEl.getTotalLength();
	if (!len) return { angle: 0, curvature: 0 };

	const eps = Math.max(0.5, len * 0.002);
	const at = progress * len;
	const before = pathEl.getPointAtLength(Math.max(0, at - eps));
	const here = pathEl.getPointAtLength(Math.min(len, Math.max(0, at)));
	const after = pathEl.getPointAtLength(Math.min(len, at + eps));

	const a1 = Math.atan2(here.y - before.y, here.x - before.x) * (180 / Math.PI);
	const a2 = Math.atan2(after.y - here.y, after.x - here.x) * (180 / Math.PI);

	return { angle: a2, curvature: shortestAngle(a1, a2) };
}
