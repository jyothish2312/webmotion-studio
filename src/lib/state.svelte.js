import { hydrateAsset } from './svg.js';

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

const PLANE_D =
	'M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.2-1.1.6L3 8l6 5-4 4-3-1-2 2 5 2 2 5 2-2-1-3 4-4 5 6l1.2-.7c.4-.2.7-.6.6-1.1z';

const BOX_D = 'M3 3h18v18H3V3z M3 9h18 M9 21V9';

const DRONE_D =
	'M5 5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z M19 5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z M5 7.5 9.5 12 M19 7.5 14.5 12 M9.5 12h5v4h-5z M12 16v4';

/** A fresh look-state. These are real tweenable values, not CSS classes. */
export function makeState(overrides = {}) {
	return {
		scale: 1,
		rotate: 0,
		opacity: 1,
		stroke: '#e6edf3',
		strokeWidth: 2,
		fill: 'none',
		...overrides
	};
}

export function makeMarker(progress, overrides = {}) {
	return {
		id: crypto.randomUUID(),
		progress,
		hold: 0,
		duration: 1.6,
		ease: 'power1.inOut',
		morphTarget: 'none',
		morphType: 'hold',
		morphDuration: 0.6,
		classes: '',
		state: makeState(),
		...overrides
	};
}

export function makeSettings(overrides = {}) {
	return {
		startingAssetId: 'plane',
		objectSize: 54,
		autoRotate: true,
		rotationOffset: 0,
		closedPath: true,
		loopTension: 1,
		loop: true,
		yoyo: false,
		rotationalMorph: true,

		// Segment from progress 0 up to the first marker.
		startHold: 0,
		startDuration: 2,
		startEase: 'power1.inOut',
		startClasses: '',
		startState: makeState(),

		// Continuous secondary motion. This is what stops it reading as a
		// sprite being dragged along a line.
		life: {
			enabled: true,
			bob: 3,
			bobSpeed: 1.4,
			sway: 4,
			swaySpeed: 2.3,
			pulse: 0.02,
			pulseSpeed: 1.1
		},

		trail: {
			enabled: true,
			count: 5,
			lag: 3,
			opacity: 0.3
		},
		...overrides
	};
}

function defaultAssets() {
	return [
		{ id: 'plane', name: 'Plane', d: PLANE_D },
		{ id: 'drone', name: 'Drone', d: DRONE_D },
		{ id: 'box', name: 'Payload Box', d: BOX_D }
	];
}

function defaultPoints() {
	return [
		{ id: 'p1', x: 140, y: 520, outX: 180, outY: 140, inX: -60, inY: 60 },
		{ id: 'p2', x: 600, y: 560, outX: 190, outY: -60, inX: -190, inY: 110 },
		{ id: 'p3', x: 900, y: 250, outX: 120, outY: -140, inX: -160, inY: 60 },
		{ id: 'p4', x: 1060, y: 470, outX: 60, outY: 160, inX: -30, inY: -150 }
	];
}

export const project = $state({
	name: 'Untitled Animation',
	assets: defaultAssets(),
	background: null,
	points: defaultPoints(),
	markers: [
		makeMarker(0.45, {
			hold: 0.8,
			duration: 1.8,
			ease: 'power2.out',
			morphTarget: 'box',
			morphType: 'hold',
			state: makeState({ scale: 1.05 })
		})
	],
	settings: makeSettings()
});

export const ui = $state({
	mode: 'edit',
	selectedMarkerId: null,
	selectedPointIndex: null,
	isPlaying: false,
	progress: 0,
	duration: 0,
	stops: [],
	engineError: null
});

/**
 * Imperative handles into the canvas, deliberately NOT reactive state. The
 * engine writes `ui.progress` every frame; if the scrubber wrote it back
 * through the same channel the two would chase each other.
 */
export const controls = {
	seek: null,
	restart: null,
	resetView: null
};

export function assetById(id) {
	return project.assets.find((a) => a.id === id) ?? project.assets[0] ?? null;
}

export function selectedMarker() {
	return project.markers.find((m) => m.id === ui.selectedMarkerId) ?? null;
}

/** Called once on mount and after every import, so `norm` is always present. */
export function hydrateAssets() {
	for (const asset of project.assets) hydrateAsset(asset);
}

export function serialize() {
	return {
		version: 2,
		name: project.name,
		// `norm` is measured from `d`, so it is derived data and stays out of the file.
		assets: project.assets.map(({ id, name, d }) => ({ id, name, d })),
		background: project.background,
		points: $state.snapshot(project.points),
		markers: $state.snapshot(project.markers),
		settings: $state.snapshot(project.settings)
	};
}

export function load(data) {
	if (!data || typeof data !== 'object') throw new Error('Not a project file.');

	project.name = data.name ?? data.projectName ?? 'Imported Project';
	project.assets = (data.assets ?? data.assetLibrary ?? defaultAssets())
		.filter((a) => a && a.d)
		.map((a) => ({ id: a.id, name: a.name ?? 'Asset', d: a.d }));
	if (!project.assets.length) project.assets = defaultAssets();

	project.background = data.background ?? data.environmentBg ?? null;
	project.points = (data.points ?? data.pathPoints ?? defaultPoints()).map((p, i) => ({
		id: p.id ?? `p${i}`,
		x: p.x,
		y: p.y,
		outX: p.outX ?? 80,
		outY: p.outY ?? 0,
		inX: p.inX ?? -80,
		inY: p.inY ?? 0
	}));

	// v1 files stored look-state as Tailwind class strings, which could not be
	// tweened or scrubbed. Keep the text, but give every marker real state.
	project.markers = (data.markers ?? []).map((m) =>
		makeMarker(m.progress ?? 0.5, {
			...m,
			id: m.id != null ? String(m.id) : crypto.randomUUID(),
			hold: m.hold ?? 0,
			classes: m.classes ?? [m.instantClasses, m.transitionClasses].filter(Boolean).join(' '),
			morphType: ['hold', 'segment', 'custom'].includes(m.morphType) ? m.morphType : 'hold',
			state: makeState(m.state ?? {})
		})
	);

	const s = data.settings ?? data.motionSettings ?? {};
	project.settings = makeSettings({
		...s,
		startState: makeState(s.startState ?? {}),
		life: { ...makeSettings().life, ...(s.life ?? {}) },
		trail: { ...makeSettings().trail, ...(s.trail ?? {}) }
	});

	if (!project.assets.some((a) => a.id === project.settings.startingAssetId)) {
		project.settings.startingAssetId = project.assets[0].id;
	}

	hydrateAssets();
	ui.selectedMarkerId = null;
	ui.progress = 0;
}
