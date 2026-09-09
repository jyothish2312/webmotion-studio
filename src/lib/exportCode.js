import { planStops, planScene, morphWindow } from './engine.js';
import { buildPathD } from './path.js';

// jsDelivr mirrors npm, so the bonus plugins are guaranteed to be present.
const GSAP_CDN = 'https://cdn.jsdelivr.net/npm/gsap@3.13.0/dist';

const j = (v) => JSON.stringify(v);
const n = (v) => Math.round(v * 1000) / 1000;
const oneLine = (s) => String(s ?? '').replace(/[\r\n]+/g, ' ');

/**
 * Resolve against the assets that were PASSED IN, never a global store — the
 * exporter has to be able to emit a scene it is not currently editing.
 */
const assetFrom = (assets, id) => assets.find((a) => a.id === id) ?? assets[0] ?? null;

/**
 * Emits the timeline UNROLLED — one explicit call per keyframe rather than a
 * loop over exported data. It is longer, but it is the form you can actually
 * read, diff and hand-edit afterwards, which is the whole point of authoring
 * here instead of writing the GSAP by hand.
 */
function buildTrackJs({ project, scene, track, index }) {
	const assets = project.assets;
	const s = track.settings;
	const { stops, duration } = planStops(track);
	const startAsset = assetFrom(assets, track.startingAssetId);
	const lines = [];
	const push = (line = '') => lines.push(line);

	const k = index;
	push(`// ===== track ${index}: ${oneLine(track.name)} — ${n(duration)}s, starts at ${n(track.offset)}s`);
	push(`const root${k}  = stage.querySelector('[data-track="${track.id}"]');`);
	push(`const path${k}  = stage.querySelector('[data-track-path="${track.id}"]');`);
	push(`const place${k} = root${k}.querySelector('.gasp-place');`);
	push(`const life${k}  = root${k}.querySelector('.gasp-life');`);
	push(`const fx${k}    = root${k}.querySelector('.gasp-fx');`);
	push(`const size${k}  = root${k}.querySelector('.gasp-size');`);
	push(`const orient${k} = root${k}.querySelector('.gasp-orient');`);
	push(`const norm${k}  = root${k}.querySelector('.gasp-norm');`);
	push(`const shape${k} = root${k}.querySelector('.gasp-shape');`);
	push();
	push(`// A paused tween that maps 0..1 onto a position along the path.`);
	push(`const placer${k} = gsap.to(place${k}, {`);
	push(`  duration: 1, ease: 'none', paused: true,`);
	push(`  motionPath: {`);
	push(`    path: path${k}, align: path${k}, alignOrigin: [0.5, 0.5],`);
	push(`    autoRotate: ${s.autoRotate ? s.rotationOffset || true : false}`);
	push(`  }`);
	push(`});`);
	push(`placer${k}.progress(0.001); placer${k}.progress(0); // force the first render`);
	push();
	push(`const at${k} = { p: 0 };`);
	push(`const tl${k} = gsap.timeline({`);
	push(`  paused: true,`);
	push(`  onUpdate() { placer${k}.progress(at${k}.p); }`);
	push(`});`);
	push();
	push(`// svgOrigin pins the artwork pivot to the origin; the default is the`);
	push(`// bounding-box centre, which moves as the shape morphs.`);
	push(`gsap.set(orient${k}, { ...${j(startAsset.orient)}, svgOrigin: '0 0' });`);
	push();
	push(`tl${k}.set(shape${k}, { attr: { d: ${j(startAsset.d)} } }, 0)`);
	push(`  .set(norm${k}, ${j(startAsset.norm)}, 0)`);
	push(`  .set(orient${k}, ${j(startAsset.orient)}, 0)`);
	push(`  .set(size${k}, { scale: ${n(s.objectSize / 100)} }, 0);`);
	push();

	let shape = startAsset;

	stops.forEach((stop, i) => {
		const next = stops[i + 1];
		const target = next ? next.state : stop.state;
		const label = stop.isStart ? 'start' : `marker ${i}`;

		push(
			`// ---- ${label}: arrive ${n(stop.arriveAt)}s @ path ${n(stop.from)}` +
				(stop.hold ? `, hold ${n(stop.hold)}s` : '') +
				` -> path ${n(stop.to)} over ${n(stop.travel)}s`
		);

		push(`tl${k}.set(fx${k}, { attr: { class: ${j(('gasp-fx ' + stop.classes).trim())} } }, ${n(stop.arriveAt)})`);
		push(`  .set(fx${k}, ${j(pickTransform(stop.state))}, ${n(stop.arriveAt)})`);
		push(`  .set(shape${k}, ${j(pickPaint(stop.state))}, ${n(stop.arriveAt)})`);
		push(`  .set(at${k}, { p: ${n(stop.from)} }, ${n(stop.arriveAt)});`);

		const win = morphWindow(stop);
		const targetAsset = win ? assetFrom(assets, stop.morphTarget) : null;
		if (win && targetAsset && targetAsset.d !== shape.d) {
			push();
			push(`tl${k}.set(shape${k}, { attr: { d: ${j(shape.d)} } }, ${n(win.at)})`);
			push(`  .to(shape${k}, {`);
			push(
				`    morphSVG: { shape: ${j(targetAsset.d)}, type: ${j(s.rotationalMorph ? 'rotational' : 'linear')} },`
			);
			push(`    duration: ${n(win.duration)}, ease: ${j(stop.ease)}, immediateRender: false`);
			push(`  }, ${n(win.at)})`);
			push(`  .fromTo(norm${k}, ${j(shape.norm)},`);
			push(
				`    { ...${j(targetAsset.norm)}, duration: ${n(win.duration)}, ease: ${j(stop.ease)}, immediateRender: false },`
			);
			push(`    ${n(win.at)});`);
			if (JSON.stringify(shape.orient) !== JSON.stringify(targetAsset.orient)) {
				push(`tl${k}.fromTo(orient${k}, ${j(shape.orient)},`);
				push(
					`    { ...${j(targetAsset.orient)}, duration: ${n(win.duration)}, ease: ${j(stop.ease)}, immediateRender: false },`
				);
				push(`    ${n(win.at)});`);
			}
			shape = targetAsset;
		}

		push();
		push(`tl${k}.fromTo(at${k}, { p: ${n(stop.from)} },`);
		push(
			`    { p: ${n(stop.to)}, duration: ${n(stop.travel)}, ease: ${j(stop.ease)}, immediateRender: false }, ${n(stop.travelAt)})`
		);
		push(`  .fromTo(fx${k}, ${j(pickTransform(stop.state))},`);
		push(
			`    { ...${j(pickTransform(target))}, duration: ${n(stop.travel)}, ease: ${j(stop.ease)}, immediateRender: false }, ${n(stop.travelAt)})`
		);
		push(`  .fromTo(shape${k}, ${j(pickPaint(stop.state))},`);
		push(
			`    { ...${j(pickPaint(target))}, duration: ${n(stop.travel)}, ease: ${j(stop.ease)}, immediateRender: false }, ${n(stop.travelAt)});`
		);
		push();
	});

	const cfg = s.life;
	if (cfg?.enabled && (cfg.bob > 0 || cfg.sway > 0 || cfg.pulse > 0)) {
		push(`// ---- idle life: wall-clock secondary motion, independent of the timeline`);
		if (cfg.bob > 0) push(lifeTween(`life${k}`, 'y', cfg.bob / 2, -cfg.bob / 2, cfg.bobSpeed));
		if (cfg.sway > 0) push(lifeTween(`life${k}`, 'rotation', -cfg.sway / 2, cfg.sway / 2, cfg.swaySpeed));
		if (cfg.pulse > 0) push(lifeTween(`life${k}`, 'scale', 1 - cfg.pulse, 1 + cfg.pulse, cfg.pulseSpeed));
		push();
	}

	if (s.trail?.enabled && s.trail.count > 0) {
		const cap = s.trail.count * s.trail.lag + 2;
		push(`// ---- motion trail: each ghost replays an older frame of the lead object`);
		push(`const ghosts${k} = Array.from(root${k}.querySelectorAll('.gasp-ghost')).map(el => {`);
		push(`  const t = gsap.to(el, {`);
		push(`    duration: 1, ease: 'none', paused: true,`);
		push(
			`    motionPath: { path: path${k}, align: path${k}, alignOrigin: [0.5, 0.5], autoRotate: ${s.autoRotate ? s.rotationOffset || true : false} }`
		);
		push(`  });`);
		push(`  t.progress(0.001); t.progress(0);`);
		push(`  return t;`);
		push(`});`);
		push(`const history${k} = [];`);
		push(`gsap.ticker.add(() => {`);
		push(`  history${k}.unshift(at${k}.p);`);
		push(`  if (history${k}.length > ${cap}) history${k}.length = ${cap};`);
		push(
			`  ghosts${k}.forEach((t, i) => t.progress(history${k}[Math.min(history${k}.length - 1, (i + 1) * ${s.trail.lag})]));`
		);
		push(`});`);
	}

	return lines.join('\n');
}

/**
 * The whole scene, unrolled: one section per track, each added to a master
 * timeline at its own offset.
 *
 * Unrolled rather than a loop over exported data because this is the form you
 * can read, diff and hand-edit — which is the point of authoring here instead
 * of writing the GSAP by hand.
 */
export function buildTimelineJs({ project, scene, layout }) {
	const { lanes, duration } = planScene(layout);
	const out = [];

	out.push(`// ${oneLine(project.name)} — ${oneLine(scene.name)} / ${oneLine(layout.name)}`);
	out.push(`// generated by webmotion-studio · ${lanes.length} track(s) · total ${n(duration)}s`);
	out.push(`gsap.registerPlugin(MotionPathPlugin, MorphSVGPlugin);`);
	out.push(``);
	out.push(`const stage = document.querySelector('[data-gasp-stage]');`);
	out.push(``);
	out.push(`// Tracks in a scene share ONE master timeline: their timing is related by`);
	out.push(`// design, so they scrub together. track.offset is where each one starts.`);
	out.push(`const master = gsap.timeline({`);
	out.push(`  repeat: ${scene.loop ? -1 : 0},`);
	out.push(`  yoyo: ${Boolean(scene.loop && scene.yoyo)}`);
	out.push(`});`);
	out.push(``);

	lanes.forEach((lane, index) => {
		out.push(...buildTrackJs({ project, scene, track: lane.track, index }).split(String.fromCharCode(10)));
		out.push(`// A child timeline must not stay paused, or the master cannot drive it.`);
		out.push(`tl${index}.paused(false);`);
		out.push(`master.add(tl${index}, ${n(lane.offset)});`);
		out.push(``);
	});

	return out.join(String.fromCharCode(10));
}

function lifeTween(el, prop, from, to, speed) {
	return (
		`gsap.fromTo(${el}, { ${prop}: ${n(from)} }, { ${prop}: ${n(to)}, ` +
		`duration: ${n(Math.max(0.1, speed) / 2)}, ease: 'sine.inOut', yoyo: true, repeat: -1 });`
	);
}

function pickTransform(state) {
	return { scale: state.scale, rotation: state.rotate, opacity: state.opacity };
}

function pickPaint(state) {
	return { stroke: state.stroke, strokeWidth: state.strokeWidth, fill: state.fill };
}

/** One track's object stack, including its ghost trail. */
function trackMarkup(track, pad, depth) {
	const s = track.settings;
	const ghosts = s.trail?.enabled ? s.trail.count : 0;
	const bodyId = `gasp-body-${track.id}`;
	const rows = [];

	rows.push(`${pad(depth)}<g data-track="${track.id}">`);
	for (let i = 0; i < ghosts; i++) {
		rows.push(
			`${pad(depth + 1)}<g class="gasp-ghost" opacity="${n(s.trail.opacity * (1 - i / (ghosts + 1)))}">` +
				`<use href="#${bodyId}"/></g>`
		);
	}
	rows.push(`${pad(depth + 1)}<g class="gasp-place">`);
	rows.push(`${pad(depth + 2)}<g class="gasp-life">`);
	rows.push(`${pad(depth + 3)}<g class="gasp-fx" id="${bodyId}">`);
	rows.push(`${pad(depth + 4)}<g class="gasp-size">`);
	rows.push(`${pad(depth + 5)}<g class="gasp-orient">`);
	rows.push(`${pad(depth + 6)}<g class="gasp-norm">`);
	rows.push(
		`${pad(depth + 7)}<path class="gasp-shape" d="" fill="none" stroke="#e6edf3" stroke-width="2" ` +
			`stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>`
	);
	for (let i = 6; i >= 1; i--) rows.push(`${pad(depth + i)}</g>`);
	rows.push(`${pad(depth)}</g>`);
	return rows;
}

/**
 * The full stage for one layout: every visible track's motion path, then every
 * track's object. Paths come first so objects draw over them, and they stay in
 * the document because they are the geometry MotionPathPlugin measures.
 */
export function buildStageMarkup({ layout, scene }, { indent = '' } = {}) {
	const pad = (depth) => indent + '  '.repeat(depth);
	const { lanes } = planScene(layout);
	const rows = [];

	rows.push(
		`${indent}<svg data-gasp-stage viewBox="0 0 ${layout.viewBox.w} ${layout.viewBox.h}" ` +
			`preserveAspectRatio="xMidYMid ${layout.fit}" xmlns="http://www.w3.org/2000/svg">`
	);
	if (layout.background) {
		rows.push(
			`${pad(1)}<image href="${escapeHtml(layout.background)}" x="0" y="0" ` +
				`width="${layout.viewBox.w}" height="${layout.viewBox.h}" preserveAspectRatio="xMidYMid slice"/>`
		);
	}
	for (const lane of lanes) {
		const t = lane.track;
		const d = buildPathD(t.points, t.settings.closedPath, t.settings.loopTension);
		rows.push(`${pad(1)}<path data-track-path="${t.id}" d="${d}" fill="none" stroke="none"/>`);
	}
	for (const lane of lanes) rows.push(...trackMarkup(lane.track, pad, 1));
	rows.push(`${indent}</svg>`);
	return rows.join('\n');
}

/** Back-compat alias for the single-track markup used before scenes existed. */
export function buildMarkup(ctx, opts) {
	return buildStageMarkup(ctx, opts);
}

/** A standalone page: open it in a browser and the animation just runs. */
export function buildStandaloneHtml(ctx) {
	const markup = buildStageMarkup(ctx, { indent: '    ' });
	const js = buildTimelineJs(ctx)
		.split('\n')
		.map((l) => (l ? '      ' + l : ''))
		.join('\n');

	return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(ctx.project.name)}</title>
    <style>
      html, body { margin: 0; height: 100%; background: #0d1117; }
      svg[data-gasp-stage] { width: 100%; height: 100%; display: block; }
    </style>
  </head>
  <body>
${markup}

    <script src="${GSAP_CDN}/gsap.min.js"><\/script>
    <script src="${GSAP_CDN}/MotionPathPlugin.min.js"><\/script>
    <script src="${GSAP_CDN}/MorphSVGPlugin.min.js"><\/script>
    <script>
${js}
    <\/script>
  </body>
</html>
`;
}

function escapeHtml(str) {
	return String(str).replace(
		/[&<>"]/g,
		(c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]
	);
}

/**
 * The data a page needs: this scene plus the assets it references.
 *
 * Only the assets actually used are included, so a big shared library does not
 * ride along into every scene bundle.
 */
export function buildSceneJson({ project, scene }) {
	const used = new Set();
	for (const layout of scene.layouts) {
		for (const track of layout.tracks) {
			used.add(track.startingAssetId);
			for (const marker of track.markers) {
				if (marker.morphTarget !== 'none') used.add(marker.morphTarget);
			}
		}
	}
	const payload = {
		version: 3,
		name: project.name,
		assets: project.assets
			.filter((a) => used.has(a.id))
			.map(({ id, name, d, adjust }) => ({ id, name, d, adjust })),
		scenes: [scene]
	};
	return JSON.stringify(payload, null, 2);
}

/** Copy-paste integration for a Svelte or SvelteKit site. */
export function buildSvelteSnippet({ scene }) {
	const file = String(scene.name).replace(/\s+/g, '-').toLowerCase();
	return `<!--
  1. Save the "Scene data" tab as  src/lib/gasp/${file}.json
  2. Copy  src/lib/runtime/gaspRuntime.js  and  GaspScene.svelte  from
     webmotion-studio into  src/lib/gasp/
  3. Drop this component wherever the animation belongs.

  Scenes on a page are independent: each gets its own timeline and its own
  trigger, so an off-screen one stays paused and costs nothing.
-->
<script>
  import GaspScene from '$lib/gasp/GaspScene.svelte';
  import ${camel(scene.name)} from '$lib/gasp/${file}.json';
</script>

<GaspScene
  name="${escapeAttr(scene.name)}"
  scene={${camel(scene.name)}}
  trigger="${scene.trigger?.type ?? 'inview-once'}"
  amount={${scene.trigger?.amount ?? 0.35}}
  delay={${scene.trigger?.delay ?? 0}}
  style="aspect-ratio: ${scene.layouts[0]?.viewBox.w ?? 1200} / ${scene.layouts[0]?.viewBox.h ?? 700}"
/>
`;
}

function camel(name) {
	const parts = String(name).split(/[^A-Za-z0-9]+/).filter(Boolean);
	if (!parts.length) return 'sceneData';
	return parts[0].toLowerCase() + parts.slice(1).map((p) => p[0].toUpperCase() + p.slice(1)).join('');
}

function escapeAttr(str) {
	return String(str).replace(/"/g, '&quot;');
}
