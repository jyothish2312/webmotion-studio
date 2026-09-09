/**
 * The v3 project shape and its migrations.
 *
 *   Project
 *     assets[]                    shared by every scene
 *     scenes[]
 *       Scene                     one master timeline, one page trigger
 *         layouts[]
 *           Layout                one stage aspect; chosen at runtime by size
 *             tracks[]
 *               Track             one object: its own path, stops and behaviour
 *
 * Every factory returns a plain object with every field present, so nothing
 * downstream has to guess whether a key exists. `migrate()` is the only entry
 * point for untrusted data — components should never see a v1 or v2 shape.
 */

export const SCHEMA_VERSION = 3;

export const EASES = [
	{ value: 'none', label: 'Linear' },
	{ value: 'sine.inOut', label: 'Sine (gentle)' },
	{ value: 'power1.inOut', label: 'Smooth' },
	{ value: 'power2.out', label: 'Ease out' },
	{ value: 'power3.inOut', label: 'Fast' },
	{ value: 'back.out(1.7)', label: 'Overshoot' },
	{ value: 'bounce.out', label: 'Bounce' },
	{ value: 'elastic.out(1, 0.4)', label: 'Elastic' },
	{ value: 'steps(6)', label: 'Stepped' }
];

const uid = () =>
	globalThis.crypto?.randomUUID?.() ?? `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** Coerce to a finite number, else the fallback. Untrusted files carry junk. */
export const num = (value, fallback = 0) => {
	const n = Number(value);
	return Number.isFinite(n) ? n : fallback;
};

const clamp = (n, lo, hi) => (n < lo ? lo : n > hi ? hi : n);

// --- assets ---------------------------------------------------------------

/** How the artwork itself is oriented, independent of any animation. */
export function makeAdjust(over = {}) {
	return {
		rotate: num(over.rotate, 0),
		flipX: Boolean(over.flipX),
		flipY: Boolean(over.flipY),
		scale: num(over.scale, 1) || 1,
		nudgeX: num(over.nudgeX, 0),
		nudgeY: num(over.nudgeY, 0)
	};
}

export function makeAsset(over = {}) {
	return {
		id: over.id ? String(over.id) : uid(),
		name: over.name ? String(over.name) : 'Asset',
		d: String(over.d ?? ''),
		adjust: makeAdjust(over.adjust)
	};
}

// --- look state -----------------------------------------------------------

/** Real tweenable values, not CSS classes — this is what lets a look scrub. */
export function makeState(over = {}) {
	return {
		scale: num(over.scale, 1),
		rotate: num(over.rotate, 0),
		opacity: clamp(num(over.opacity, 1), 0, 1),
		stroke: typeof over.stroke === 'string' ? over.stroke : '#e6edf3',
		strokeWidth: num(over.strokeWidth, 2),
		fill: typeof over.fill === 'string' ? over.fill : 'none'
	};
}

// --- markers --------------------------------------------------------------

export function makeMarker(progress, over = {}) {
	return {
		id: over.id != null ? String(over.id) : uid(),
		progress: clamp(num(progress, 0.5), 0, 1),
		hold: Math.max(0, num(over.hold, 0)),
		duration: Math.max(0.1, num(over.duration, 1.6)),
		ease: typeof over.ease === 'string' ? over.ease : 'power1.inOut',
		morphTarget: over.morphTarget ? String(over.morphTarget) : 'none',
		morphType: ['hold', 'segment', 'custom'].includes(over.morphType) ? over.morphType : 'hold',
		morphDuration: Math.max(0.1, num(over.morphDuration, 0.6)),
		classes: typeof over.classes === 'string' ? over.classes : '',
		state: makeState(over.state)
	};
}

// --- tracks ---------------------------------------------------------------

export function makeLife(over = {}) {
	return {
		enabled: over.enabled !== false,
		// 'sine' repeats exactly and reads as clockwork; 'organic' sums octaves of
		// value noise so it never lines up the same way twice.
		mode: over.mode === 'organic' ? 'organic' : 'sine',
		turbulence: Math.max(0, num(over.turbulence, 1)),
		bob: Math.max(0, num(over.bob, 3)),
		bobSpeed: Math.max(0.1, num(over.bobSpeed, 1.4)),
		sway: Math.max(0, num(over.sway, 4)),
		swaySpeed: Math.max(0.1, num(over.swaySpeed, 2.3)),
		pulse: Math.max(0, num(over.pulse, 0.02)),
		pulseSpeed: Math.max(0.1, num(over.pulseSpeed, 1.1))
	};
}

export function makeTrail(over = {}) {
	return {
		enabled: over.enabled !== false,
		count: clamp(Math.round(num(over.count, 5)), 0, 12),
		lag: clamp(Math.round(num(over.lag, 3)), 1, 12),
		opacity: clamp(num(over.opacity, 0.3), 0, 1)
	};
}

/**
 * How the object lags behind the path instead of snapping to its tangent.
 * Turning this on takes rotation away from MotionPathPlugin's autoRotate so a
 * spring can chase the heading, overshoot on a corner and settle.
 */
export function makeMomentum(over = {}) {
	return {
		enabled: Boolean(over.enabled),
		responsiveness: Math.max(0.2, num(over.responsiveness, 3)),
		overshoot: clamp(num(over.overshoot, 0.6), 0.05, 1.5),
		bank: num(over.bank, 12),
		pitch: num(over.pitch, 6)
	};
}

/** Fakes mass: the body tilts against its own sideways acceleration. */
export function makeWeight(over = {}) {
	return {
		enabled: Boolean(over.enabled),
		amount: num(over.amount, 14),
		responsiveness: Math.max(0.2, num(over.responsiveness, 2.2)),
		overshoot: clamp(num(over.overshoot, 0.45), 0.05, 1.5)
	};
}

/** A scale punch when a shape change fires — the grab wants a beat. */
export function makeRecoil(over = {}) {
	return {
		enabled: over.enabled !== false,
		scale: num(over.scale, 0.1),
		duration: Math.max(0.05, num(over.duration, 0.25))
	};
}

/** Damped oscillation on arriving at a stop. Authored, so it stays scrubbable. */
export function makeSettle(over = {}) {
	return {
		enabled: Boolean(over.enabled),
		amount: num(over.amount, 6),
		duration: Math.max(0.1, num(over.duration, 0.7))
	};
}

/** Per-object behaviour. Loop/yoyo deliberately live on the scene, not here. */
export function makeTrackSettings(over = {}) {
	return {
		objectSize: Math.max(1, num(over.objectSize, 54)),
		autoRotate: over.autoRotate !== false,
		rotationOffset: num(over.rotationOffset, 0),
		closedPath: Boolean(over.closedPath ?? true),
		loopTension: num(over.loopTension, 1),
		rotationalMorph: over.rotationalMorph !== false,

		// The segment from the start of the path to the first marker.
		startHold: Math.max(0, num(over.startHold, 0)),
		startDuration: Math.max(0.1, num(over.startDuration, 2)),
		startEase: typeof over.startEase === 'string' ? over.startEase : 'power1.inOut',
		startClasses: typeof over.startClasses === 'string' ? over.startClasses : '',
		startState: makeState(over.startState),

		life: makeLife(over.life),
		trail: makeTrail(over.trail),
		momentum: makeMomentum(over.momentum),
		weight: makeWeight(over.weight),
		morphRecoil: makeRecoil(over.morphRecoil),
		settle: makeSettle(over.settle)
	};
}

export function makePoint(over = {}, index = 0) {
	return {
		id: over.id ? String(over.id) : uid(),
		x: num(over.x, 100 + index * 200),
		y: num(over.y, 350),
		inX: num(over.inX, -80),
		inY: num(over.inY, 0),
		outX: num(over.outX, 80),
		outY: num(over.outY, 0)
	};
}

export function makeTrack(over = {}) {
	return {
		id: over.id ? String(over.id) : uid(),
		name: over.name ? String(over.name) : 'Object',
		offset: Math.max(0, num(over.offset, 0)),
		hidden: Boolean(over.hidden),
		solo: Boolean(over.solo),
		startingAssetId: over.startingAssetId ? String(over.startingAssetId) : '',
		points: Array.isArray(over.points) && over.points.length >= 2
			? over.points.map(makePoint)
			: defaultPoints(),
		markers: Array.isArray(over.markers) ? over.markers.map((m) => makeMarker(m.progress, m)) : [],
		settings: makeTrackSettings(over.settings)
	};
}

// --- layouts & scenes -----------------------------------------------------

/** Which container sizes this layout wins. An empty match is the fallback. */
export function makeMatch(over = {}) {
	const m = {};
	if (Number.isFinite(Number(over.minWidth))) m.minWidth = Number(over.minWidth);
	if (Number.isFinite(Number(over.maxWidth))) m.maxWidth = Number(over.maxWidth);
	if (Array.isArray(over.aspect) && over.aspect.length === 2) {
		m.aspect = [num(over.aspect[0], 0), num(over.aspect[1], 99)];
	}
	return m;
}

export function makeLayout(over = {}) {
	return {
		id: over.id ? String(over.id) : uid(),
		name: over.name ? String(over.name) : 'desktop',
		match: makeMatch(over.match),
		viewBox: {
			w: Math.max(1, num(over.viewBox?.w, 1200)),
			h: Math.max(1, num(over.viewBox?.h, 700))
		},
		fit: over.fit === 'meet' ? 'meet' : 'slice',
		background: typeof over.background === 'string' ? over.background : null,
		tracks: Array.isArray(over.tracks) && over.tracks.length
			? over.tracks.map(makeTrack)
			: [makeTrack()]
	};
}

/**
 * Chooses the layout for a container of this size.
 *
 * Ordered list, first match wins, and the last layout is the fallback — so a
 * layout with an empty `match` should sit last. The editor's preview and the
 * page runtime both go through here, which is what makes the preview faithful.
 *
 * Pure: no DOM. Takes measurements, not elements.
 */
export function pickLayout(scene, width, height) {
	const layouts = scene?.layouts ?? [];
	if (!layouts.length) return null;
	const aspect = height > 0 ? width / height : 1;

	for (const layout of layouts) {
		const m = layout.match ?? {};
		if (m.minWidth != null && width < m.minWidth) continue;
		if (m.maxWidth != null && width > m.maxWidth) continue;
		if (m.aspect && (aspect < m.aspect[0] || aspect > m.aspect[1])) continue;
		return layout;
	}
	return layouts[layouts.length - 1];
}

/** Preview frame widths, and the shape each one stands for. */
export const DEVICES = [
	{ id: 'fit', label: 'Fit', width: null },
	{ id: 'desktop', label: 'Desktop', width: 1440 },
	{ id: 'tablet', label: 'Tablet', width: 834 },
	{ id: 'mobile', label: 'Mobile', width: 390 }
];

export const TRIGGERS = [
	{ value: 'inview-once', label: 'Play once when it scrolls into view' },
	{ value: 'inview', label: 'Play on enter, reset on leave' },
	{ value: 'visible-amount', label: 'Play when a share of it is visible' },
	{ value: 'load', label: 'Play immediately' },
	{ value: 'manual', label: 'Only when code calls play()' }
];

export function makeTrigger(over = {}) {
	const type = TRIGGERS.some((t) => t.value === over.type) ? over.type : 'inview-once';
	return { type, amount: clamp(num(over.amount, 0.35), 0, 1), delay: Math.max(0, num(over.delay, 0)) };
}

export function makeScene(over = {}) {
	return {
		id: over.id ? String(over.id) : uid(),
		name: over.name ? String(over.name) : 'Scene',
		loop: over.loop !== false,
		yoyo: Boolean(over.yoyo),
		trigger: makeTrigger(over.trigger),
		keepTotalTimingOnInsert: over.keepTotalTimingOnInsert !== false,
		layouts: Array.isArray(over.layouts) && over.layouts.length
			? over.layouts.map(makeLayout)
			: [makeLayout()]
	};
}

// --- defaults -------------------------------------------------------------

const PLANE_D =
	'M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.2-1.1.6L3 8l6 5-4 4-3-1-2 2 5 2 2 5 2-2-1-3 4-4 5 6l1.2-.7c.4-.2.7-.6.6-1.1z';
const BOX_D = 'M3 3h18v18H3V3z M3 9h18 M9 21V9';
const DRONE_D =
	'M5 5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z M19 5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z M5 7.5 9.5 12 M19 7.5 14.5 12 M9.5 12h5v4h-5z M12 16v4';

export function defaultAssets() {
	return [
		makeAsset({ id: 'plane', name: 'Plane', d: PLANE_D }),
		makeAsset({ id: 'drone', name: 'Drone', d: DRONE_D }),
		makeAsset({ id: 'box', name: 'Payload Box', d: BOX_D })
	];
}

export function defaultPoints() {
	return [
		{ id: 'p1', x: 140, y: 520, outX: 180, outY: 140, inX: -60, inY: 60 },
		{ id: 'p2', x: 600, y: 560, outX: 190, outY: -60, inX: -190, inY: 110 },
		{ id: 'p3', x: 900, y: 250, outX: 120, outY: -140, inX: -160, inY: 60 },
		{ id: 'p4', x: 1060, y: 470, outX: 60, outY: 160, inX: -30, inY: -150 }
	].map(makePoint);
}

export function defaultProject() {
	return {
		version: SCHEMA_VERSION,
		name: 'Untitled Animation',
		assets: defaultAssets(),
		scenes: [
			makeScene({
				name: 'Scene 1',
				layouts: [
					makeLayout({
						name: 'desktop',
						tracks: [
							makeTrack({
								name: 'Drone',
								startingAssetId: 'plane',
								markers: [
									makeMarker(0.45, {
										hold: 0.8,
										duration: 1.8,
										ease: 'power2.out',
										morphTarget: 'box',
										morphType: 'hold',
										state: makeState({ scale: 1.05 })
									})
								]
							})
						]
					})
				]
			})
		]
	};
}

// --- migration ------------------------------------------------------------

/**
 * Normalises any accepted file version into v3.
 *
 * v1 stored look-state as Tailwind class strings, which could not be tweened or
 * scrubbed; those become real state plus a literal `classes` string. v2 was flat
 * (one object, one path), so it becomes a single scene / layout / track.
 */
export function migrate(data) {
	if (!data || typeof data !== 'object') throw new Error('Not a project file.');

	if (Number(data.version) >= 3 && Array.isArray(data.scenes)) return normalizeV3(data);

	// v1 used different key names for the same ideas.
	const flat = {
		name: data.name ?? data.projectName ?? 'Imported Project',
		assets: data.assets ?? data.assetLibrary ?? [],
		background: data.background ?? data.environmentBg ?? null,
		points: data.points ?? data.pathPoints ?? [],
		markers: data.markers ?? [],
		settings: data.settings ?? data.motionSettings ?? {}
	};

	const assets = flat.assets.filter((a) => a && a.d).map(makeAsset);
	if (!assets.length) assets.push(...defaultAssets());

	const s = flat.settings;
	const markers = (Array.isArray(flat.markers) ? flat.markers : []).map((m) =>
		makeMarker(m.progress, {
			...m,
			// v1 split classes into instant + transition; only the instant half ever
			// worked, and the transition half is now the tweened `state`.
			classes: m.classes ?? [m.instantClasses, m.transitionClasses].filter(Boolean).join(' ')
		})
	);

	const track = makeTrack({
		name: 'Object',
		startingAssetId: assets.some((a) => a.id === s.startingAssetId) ? s.startingAssetId : assets[0].id,
		points: Array.isArray(flat.points) && flat.points.length >= 2 ? flat.points : undefined,
		markers,
		settings: {
			...s,
			startClasses: s.startClasses ?? s.initialInstantClasses ?? '',
			startDuration: s.startDuration ?? s.initialDuration,
			startEase: s.startEase ?? s.initialEase
		}
	});

	return normalizeV3({
		version: SCHEMA_VERSION,
		name: flat.name,
		assets,
		scenes: [
			makeScene({
				name: 'Scene 1',
				loop: s.loop,
				yoyo: s.yoyo,
				layouts: [makeLayout({ name: 'desktop', background: flat.background, tracks: [track] })]
			})
		]
	});
}

function normalizeV3(data) {
	const assets = (Array.isArray(data.assets) ? data.assets : []).filter((a) => a && a.d).map(makeAsset);
	if (!assets.length) assets.push(...defaultAssets());

	const scenes = (Array.isArray(data.scenes) && data.scenes.length ? data.scenes : [{}]).map(makeScene);

	// A track pointing at a deleted asset would silently render nothing.
	for (const scene of scenes) {
		for (const layout of scene.layouts) {
			for (const track of layout.tracks) {
				if (!assets.some((a) => a.id === track.startingAssetId)) {
					track.startingAssetId = assets[0].id;
				}
				for (const marker of track.markers) {
					if (marker.morphTarget !== 'none' && !assets.some((a) => a.id === marker.morphTarget)) {
						marker.morphTarget = 'none';
					}
				}
			}
		}
	}

	return {
		version: SCHEMA_VERSION,
		name: data.name ? String(data.name) : 'Imported Project',
		assets,
		scenes
	};
}
