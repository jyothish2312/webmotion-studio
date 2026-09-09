import { MorphSVGPlugin } from 'gsap/MorphSVGPlugin';

/**
 * Everything in this file exists to get arbitrary SVG artwork into ONE shared
 * coordinate space. Morphing only looks right when both shapes are measured the
 * same way, so every asset is reduced to `{ d, norm }` where `norm` is the
 * transform that drops the shape, centred, into a CANONICAL_SIZE box at 0,0.
 */
export const CANONICAL_SIZE = 100;

let scratch = null;

function getScratch() {
	if (scratch) return scratch;
	const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	svg.setAttribute('width', '0');
	svg.setAttribute('height', '0');
	svg.style.cssText = 'position:absolute;left:-9999px;top:-9999px;opacity:0;pointer-events:none';
	const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
	svg.appendChild(path);
	document.body.appendChild(svg);
	scratch = { svg, path };
	return scratch;
}

/** Real rendered bounds of a path string — more reliable than a declared viewBox. */
export function measurePath(d) {
	const { path } = getScratch();
	path.setAttribute('d', d);
	let box;
	try {
		box = path.getBBox();
	} catch {
		box = null;
	}
	if (!box || !box.width || !box.height) return { x: 0, y: 0, width: 24, height: 24 };
	return { x: box.x, y: box.y, width: box.width, height: box.height };
}

/**
 * GSAP applies transforms as translate() -> rotate() -> scale(), so mapping a
 * point p to scale * (p + offset) means the translation itself must be scaled.
 */
export function normalizeFrom(box, size = CANONICAL_SIZE) {
	const scale = size / Math.max(box.width, box.height);
	const offsetX = -(box.x + box.width / 2);
	const offsetY = -(box.y + box.height / 2);
	return { scale, x: scale * offsetX, y: scale * offsetY };
}

/** Attaches measurement data to an asset. Safe to call more than once. */
export function hydrateAsset(asset) {
	if (asset.norm) return asset;
	asset.norm = normalizeFrom(measurePath(asset.d));
	return asset;
}

/**
 * Rewrites a `d` string as absolute cubic beziers.
 *
 * SVG's "a leading relative `m` counts as absolute" rule only holds while that
 * `m` is the FIRST command of its path. The moment several `d` strings are
 * concatenated, every subpath after the first is measured from the previous
 * path's end point and the artwork flies apart — which is exactly the
 * "deconstructed on upload" a multi-<path> icon shows. Normalising each path
 * to absolutes first makes the join safe; it also turns arcs into beziers,
 * which morph far better than arcs do.
 */
export function absolutizePath(d) {
	try {
		const out = MorphSVGPlugin.rawPathToString(MorphSVGPlugin.stringToRawPath(d));
		return out && out.length > 2 ? out : d;
	} catch {
		return d; // a possibly-wrong path still beats dropping it
	}
}

/**
 * Pulls a single morphable path out of an uploaded file. Primitive shapes
 * (rect/circle/polygon/...) are converted rather than rejected, and every
 * subpath is absolutised before being joined.
 */
export function parseSvgFile(text, fallbackName = 'asset') {
	const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
	if (doc.querySelector('parsererror')) throw new Error('That file is not valid SVG.');

	const root = doc.querySelector('svg');
	if (!root) throw new Error('No <svg> root element found.');

	if (root.querySelector('[transform]')) {
		// Element transforms are not baked into `d`, so the shape would land in
		// the wrong place. Warn rather than silently misplace it.
		console.warn('[gasp-tool] SVG has element transforms — flatten them in your editor first.');
	}

	const primitives = root.querySelectorAll('rect, circle, ellipse, line, polyline, polygon');
	if (primitives.length) {
		try {
			MorphSVGPlugin.convertToPath(Array.from(primitives));
		} catch {
			/* Keep whatever real <path> elements exist. */
		}
	}

	const d = Array.from(root.querySelectorAll('path'))
		.map((p) => p.getAttribute('d'))
		.filter(Boolean)
		.map(absolutizePath)
		.join(' ')
		.trim();

	if (!d) throw new Error('No drawable shapes found in that SVG.');

	return { name: fallbackName, d };
}

/** Inline preview markup for the asset list, drawn in the canonical box. */
export function previewSvg(asset) {
	const n = asset.norm ?? normalizeFrom(measurePath(asset.d));
	const half = CANONICAL_SIZE / 2;
	const transform = `translate(${n.x} ${n.y}) scale(${n.scale})`;
	return (
		`<svg viewBox="${-half} ${-half} ${CANONICAL_SIZE} ${CANONICAL_SIZE}" fill="none" ` +
		`stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">` +
		`<g transform="${transform}"><path d="${asset.d}"/></g></svg>`
	);
}
