/** Bezier spline helpers shared by the canvas, the engine and the code export. */

/**
 * Builds the motion path. Each point carries its own in/out handles, and a
 * closed path gets one extra curve back to the first point so the loop is
 * genuinely seamless instead of snapping.
 */
export function buildPathD(points, closed = false, tension = 1) {
	if (!points || points.length < 2) return '';

	let d = `M ${round(points[0].x)} ${round(points[0].y)}`;
	for (let i = 1; i < points.length; i++) {
		d += curveTo(points[i - 1], points[i], 1);
	}
	if (closed) {
		d += curveTo(points[points.length - 1], points[0], tension) + ' Z';
	}
	return d;
}

function curveTo(from, to, tension) {
	const c1x = from.x + from.outX * tension;
	const c1y = from.y + from.outY * tension;
	const c2x = to.x + to.inX * tension;
	const c2y = to.y + to.inY * tension;
	return ` C ${round(c1x)} ${round(c1y)} ${round(c2x)} ${round(c2y)} ${round(to.x)} ${round(to.y)}`;
}

function round(n) {
	return Math.round(n * 100) / 100;
}

/** Point at a 0..1 position along a live <path> element. */
export function pointAt(pathEl, progress) {
	if (!pathEl) return { x: 0, y: 0 };
	try {
		const total = pathEl.getTotalLength();
		return pathEl.getPointAtLength(total * clamp01(progress));
	} catch {
		return { x: 0, y: 0 };
	}
}

/**
 * Nearest position along the path to an arbitrary point. Coarse sweep followed
 * by a local refine, so dragging a marker tracks the cursor smoothly instead of
 * stepping between 300 fixed samples.
 */
export function projectToPath(pathEl, x, y, coarse = 240) {
	if (!pathEl) return 0;
	let total;
	try {
		total = pathEl.getTotalLength();
	} catch {
		return 0;
	}
	if (!total) return 0;

	let best = 0;
	let bestDist = Infinity;
	for (let i = 0; i <= coarse; i++) {
		const t = i / coarse;
		const p = pathEl.getPointAtLength(total * t);
		const dist = (p.x - x) ** 2 + (p.y - y) ** 2;
		if (dist < bestDist) {
			bestDist = dist;
			best = t;
		}
	}

	let step = 1 / coarse;
	for (let pass = 0; pass < 6; pass++) {
		step /= 2;
		for (const t of [best - step, best + step]) {
			if (t < 0 || t > 1) continue;
			const p = pathEl.getPointAtLength(total * t);
			const dist = (p.x - x) ** 2 + (p.y - y) ** 2;
			if (dist < bestDist) {
				bestDist = dist;
				best = t;
			}
		}
	}
	return clamp01(best);
}

export function clamp01(n) {
	return n < 0 ? 0 : n > 1 ? 1 : n;
}
