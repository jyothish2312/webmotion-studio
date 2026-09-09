/**
 * End-to-end smoke test: serves `dist/`, drives it in headless Chrome over CDP,
 * and asserts the animation actually runs.
 *
 * The engine's failure modes are visual (an empty path at the origin, a morph
 * that snaps, a scrub that lands on the wrong frame) so unit tests cannot see
 * them. Run with `npm run test:browser`.
 */
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ROOT = join(REPO, 'dist');
const PORT = Number(process.env.GASP_PORT ?? 5199);
const CDP_PORT = Number(process.env.GASP_CDP_PORT ?? 9333);

const CHROME_CANDIDATES = [
	process.env.CHROME_PATH,
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'/usr/bin/google-chrome',
	'/usr/bin/chromium',
	'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
].filter(Boolean);

const CHROME = CHROME_CANDIDATES.find((p) => existsSync(p));
if (!CHROME) {
	console.error('No Chrome/Edge found. Set CHROME_PATH to a Chromium binary.');
	process.exit(2);
}
if (!existsSync(join(ROOT, 'index.html'))) {
	console.error('dist/ is missing — run `npm run build` first.');
	process.exit(2);
}

const TYPES = {
	'.html': 'text/html',
	'.js': 'text/javascript',
	'.css': 'text/css',
	'.json': 'application/json',
	'.svg': 'image/svg+xml'
};

const server = createServer(async (req, res) => {
	try {
		const url = req.url.split('?')[0];
		const file = normalize(join(ROOT, url === '/' ? 'index.html' : url));
		if (!file.startsWith(ROOT)) throw new Error('escaped root');
		const body = await readFile(file);
		res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' });
		res.end(body);
	} catch {
		res.writeHead(404).end('not found');
	}
});
await new Promise((r) => server.listen(PORT, '127.0.0.1', r));

const chrome = spawn(
	CHROME,
	[
		'--headless=new',
		`--remote-debugging-port=${CDP_PORT}`,
		`--user-data-dir=${join(REPO, 'node_modules', '.cache', 'gasp-cdp')}`,
		'--no-first-run',
		'--no-default-browser-check',
		'--disable-gpu',
		'--window-size=1600,900',
		'about:blank'
	],
	{ stdio: 'ignore' }
);

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

let wsUrl;
for (let i = 0; i < 60 && !wsUrl; i++) {
	try {
		const list = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/list`)).json();
		wsUrl = list.find((t) => t.type === 'page')?.webSocketDebuggerUrl;
	} catch {
		/* not up yet */
	}
	if (!wsUrl) await wait(250);
}
if (!wsUrl) {
	console.error('Chrome never exposed a debugging target.');
	process.exit(1);
}

const ws = new WebSocket(wsUrl);
await new Promise((res, rej) => {
	ws.onopen = res;
	ws.onerror = rej;
});

let nextId = 1;
const pending = new Map();
const consoleErrors = [];
const pageErrors = [];

ws.onmessage = (event) => {
	const msg = JSON.parse(event.data);
	if (msg.id && pending.has(msg.id)) {
		pending.get(msg.id)(msg);
		pending.delete(msg.id);
		return;
	}
	if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
		consoleErrors.push(msg.params.args.map((a) => a.value ?? a.description ?? a.type).join(' '));
	}
	if (msg.method === 'Runtime.exceptionThrown') {
		pageErrors.push(
			msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text
		);
	}
};

const send = (method, params = {}) =>
	new Promise((resolve) => {
		const id = nextId++;
		pending.set(id, resolve);
		ws.send(JSON.stringify({ id, method, params }));
	});

const evaluate = async (expression) => {
	const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
	if (r.result?.exceptionDetails) {
		return { __error: r.result.exceptionDetails.exception?.description };
	}
	return r.result?.result?.value;
};

let failures = 0;
const check = (label, ok, detail = '') => {
	console.log(`${ok ? 'ok  ' : 'FAIL'}: ${label}${detail ? ' -> ' + detail : ''}`);
	if (!ok) failures++;
};

await send('Runtime.enable');
await send('Page.enable');
await send('Log.enable');
await send('Page.navigate', { url: `http://127.0.0.1:${PORT}/` });
await wait(2500);

const PROBE = `(() => {
  const q = (s) => document.querySelector(s);
  const shape = q('.gasp-shape');
  const place = q('.gasp-place');
  const life  = q('.gasp-life');
  const norm  = q('.gasp-norm');
  const box = place ? place.getBoundingClientRect() : null;
  const tf = (el) => el ? (el.style.transform || el.getAttribute('transform') || '') : null;
  return {
    mounted: document.getElementById('app').children.length > 0,
    panels: document.querySelectorAll('aside').length,
    shapeD: shape ? (shape.getAttribute('d') || '').slice(0, 32) : null,
    shapeDLen: shape ? (shape.getAttribute('d') || '').length : 0,
    placeTransform: tf(place),
    normTransform: tf(norm),
    orientTransform: tf(q('.gasp-orient')),
    lifeTransform: tf(life),
    ghostUses: document.querySelectorAll('use[href="#gasp-body"]').length,
    center: box ? [Math.round(box.x + box.width/2), Math.round(box.y + box.height/2)] : null,
    readout: [...document.querySelectorAll('.tabular-nums')]
      .map(e => e.textContent.replace(/\\s+/g,' ').trim())
      .find(t => /\\d+\\.\\d\\d \\/ \\d+\\.\\d\\ds/.test(t)) || null
  };
})()`;

const before = await evaluate(PROBE);
console.log('\n--- initial frame ---');
console.log(JSON.stringify(before, null, 2));

check('app mounted', before?.mounted === true);
check('side panels rendered', before?.panels === 2, `got ${before?.panels}`);
check('start shape painted on the first frame', before?.shapeDLen > 20, `d length ${before?.shapeDLen}`);
check('motion path placed the object', !!before?.placeTransform, before?.placeTransform);
check('normalisation applied', !!before?.normTransform, before?.normTransform);
check('orient wrapper exists', before?.orientTransform !== null, before?.orientTransform);
check('object is on screen, not parked at the origin', before?.center?.[0] > 20 && before?.center?.[1] > 20, JSON.stringify(before?.center));
check('timeline reports a duration', /[1-9]/.test(before?.readout ?? ''), before?.readout);

// --- playback -------------------------------------------------------------
await evaluate(`document.querySelector('[aria-label="Play or pause"]').click()`);
await wait(120);
const t1 = await evaluate(PROBE);
await wait(900);
const t2 = await evaluate(PROBE);
await evaluate(`document.querySelector('[aria-label="Play or pause"]').click()`);
await wait(200);

const moved =
	t1?.center && t2?.center &&
	Math.abs(t1.center[0] - t2.center[0]) + Math.abs(t1.center[1] - t2.center[1]) > 5;
check('object travels along the path while playing', moved, `${JSON.stringify(t1?.center)} -> ${JSON.stringify(t2?.center)}`);

// --- scrubbing ------------------------------------------------------------
const track = await evaluate(
	`(() => { const t = document.querySelector('.cursor-ew-resize'); const r = t.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; })()`
);

async function scrubTo(fraction) {
	const x = track[0] + track[2] * fraction;
	const y = track[1] + track[3] / 2;
	await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1, buttons: 1 });
	await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1, buttons: 0 });
	await wait(150);
	return evaluate(PROBE);
}

const forward = [];
for (const f of [0, 0.3, 0.5, 0.62, 0.8, 0.98]) {
	const s = await scrubTo(f);
	forward.push({ f, len: s?.shapeDLen, center: s?.center, d: s?.shapeD });
}
console.log('\n--- scrub forward ---');
forward.forEach((s) => console.log(`  ${s.f.toFixed(2)}  len=${String(s.len).padStart(5)}  center=${JSON.stringify(s.center)}`));

check('shape morphs across the timeline', new Set(forward.map((s) => s.d)).size > 1, `${new Set(forward.map((s) => s.d)).size} distinct shapes`);
check('scrubbing moves the object', new Set(forward.map((s) => JSON.stringify(s.center))).size > 3);
check('an intermediate morph frame exists (it interpolates, not snaps)', forward.some((s) => s.len > Math.max(forward[0].len, forward.at(-1).len)));

const startShape = forward[0].d;
await scrubTo(0.9);
const back = await scrubTo(0);
check('reverse scrub restores the starting shape', back?.shapeD === startShape, `${back?.shapeD} vs ${startShape}`);

// --- idle life reset ------------------------------------------------------
// Killing a tween leaves its last values on the element; disabling idle life
// must clear them or the object stays permanently tilted.
await evaluate(`document.querySelector('[aria-label="Play or pause"]').click()`);
await wait(700);
await evaluate(`document.querySelector('[aria-label="Play or pause"]').click()`);
await wait(200);
await evaluate(
	`(() => { const l = [...document.querySelectorAll('aside label')].filter(l => l.textContent.trim().startsWith('Enabled')); l[0]?.querySelector('input[type=checkbox]')?.click(); })()`
);
await wait(600);
const afterLifeOff = await evaluate(PROBE);
const identity = (t) => !t || t === 'none' || /matrix\(1,\s*0,\s*0,\s*1,\s*0,\s*0\)/.test(t.replace(/\s+/g, ' '));
check('disabling idle life resets its wrapper', identity(afterLifeOff?.lifeTransform), afterLifeOff?.lifeTransform);

// --- asset orientation ----------------------------------------------------
// adjust.rotate rides on a wrapper OUTSIDE .gasp-norm, so it pivots about the
// shape's centre rather than the artboard origin.
const beforeShape = await evaluate(
  `(() => { const b = document.querySelector('.gasp-shape').getBoundingClientRect(); return [Math.round(b.x+b.width/2), Math.round(b.y+b.height/2), Math.round(b.width), Math.round(b.height)]; })()`
);
await evaluate(`(() => {
  const btn = document.querySelector('[aria-label="Adjust artwork"]');
  btn.click();
})()`);
await wait(400);
const spun = await evaluate(`(() => {
  const b = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === '⟳ 90°');
  if (!b) return 'no rotate button';
  b.click(); return 'rotated';
})()`);
await wait(600);
const afterShape = await evaluate(
  `(() => { const b = document.querySelector('.gasp-shape').getBoundingClientRect(); return [Math.round(b.x+b.width/2), Math.round(b.y+b.height/2), Math.round(b.width), Math.round(b.height)]; })()`
);
const orientNow = await evaluate(`(() => { const e = document.querySelector('.gasp-orient'); return e.style.transform || e.getAttribute('transform') || ''; })()`);
const centreDrift = Math.hypot(afterShape[0] - beforeShape[0], afterShape[1] - beforeShape[1]);
const identityTf = (t) => !t || t === 'none' || /matrix\(1,\s*0,\s*0,\s*1,\s*0,\s*0\)/.test(String(t).replace(/\s+/g, ' '));
check('rotating an asset reaches .gasp-orient', !identityTf(orientNow), `${spun} -> ${orientNow}`);
check('rotation pivots about the shape centre, not the artboard origin', centreDrift < 25,
  `centre moved ${centreDrift.toFixed(0)}px; box ${beforeShape[2]}x${beforeShape[3]} -> ${afterShape[2]}x${afterShape[3]}`);

// --- preview mode ---------------------------------------------------------
await evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Preview').click()`);
await wait(500);
const previewing = await evaluate(`({
  chrome: document.querySelectorAll('circle[data-type="anchor"]').length,
  asides: document.querySelectorAll('aside').length,
  shape: !!document.querySelector('.gasp-shape'),
  viewBox: document.querySelector('svg[role=application]').getAttribute('viewBox')
})`);
check('preview hides the editor chrome', previewing?.chrome === 0 && previewing?.asides === 0, JSON.stringify(previewing));
check('preview keeps the object and frames the layout', previewing?.shape === true && previewing?.viewBox === '0 0 1200 700', previewing?.viewBox);
await evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Exit preview').click()`);
await wait(400);
const restored = await evaluate(`document.querySelectorAll('circle[data-type="anchor"]').length`);
check('exiting preview restores the chrome', restored > 0, `${restored} anchors`);

// --- untrusted project file ----------------------------------------------
// `asset.d` is written verbatim by load(). It must never reach the DOM as
// markup — asset previews render it as an attribute, not as {@html}.
await evaluate(`(() => {
  const evil = '"/><desc id="pwned-marker">x</desc><path d="';
  const proj = { version: 2, name: 'evil',
    assets: [{ id: 'evil', name: 'evil-asset', d: evil }],
    points: [{ id:'a', x:100, y:100, outX:50, outY:0, inX:-50, inY:0 },
             { id:'b', x:400, y:300, outX:50, outY:0, inX:-50, inY:0 }],
    markers: [], settings: { startingAssetId: 'evil' } };
  const dt = new DataTransfer();
  dt.items.add(new File([JSON.stringify(proj)], 'evil.json', { type: 'application/json' }));
  const input = [...document.querySelectorAll('input[type=file]')].find(i => (i.accept||'').includes('json'));
  input.files = dt.files;
  input.dispatchEvent(new Event('change', { bubbles: true }));
})()`);
await wait(1200);
const injection = await evaluate(
	`({ pwned: !!document.getElementById('pwned-marker'), imported: [...document.querySelectorAll('aside .truncate')].map(e => e.textContent.trim()) })`
);
check('untrusted asset.d cannot inject DOM nodes', injection?.pwned === false, `imported assets: ${JSON.stringify(injection?.imported)}`);

console.log('\n--- console errors ---');
console.log(consoleErrors.length ? consoleErrors.join('\n') : '(none)');
console.log('--- uncaught exceptions ---');
console.log(pageErrors.length ? pageErrors.join('\n') : '(none)');
check('no uncaught exceptions', pageErrors.length === 0);

ws.close();
chrome.kill();
server.close();
console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : failures + ' CHECK(S) FAILED'}`);
process.exit(failures === 0 ? 0 : 1);
