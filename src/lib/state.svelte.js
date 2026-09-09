import { hydrateAsset } from './svg.js';
import { defaultProject, migrate, SCHEMA_VERSION } from './model.js';

export { EASES, TRIGGERS, DEVICES, pickLayout } from './model.js';

export const project = $state(defaultProject());

export const ui = $state({
	// selection / navigation
	activeSceneId: null,
	activeLayoutId: null,
	selectedTrackId: null,
	selectedMarkerId: null,
	selectedPointIndex: null,
	renamingTrackId: null,
	renamingLayoutId: null,

	// editing
	mode: 'edit',
	preview: false,
	/** Preview frame width in CSS px; null means fill the canvas. */
	previewDevice: 'fit',

	// transport (written by the engine every frame — read-only for the UI)
	isPlaying: false,
	progress: 0,
	duration: 0,
	/** Per-track scrubber lanes, produced by the scene renderer. */
	lanes: [],
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

// --- navigation -----------------------------------------------------------
// Each accessor falls back to the first entry, so the editor always has
// something selected even before the ids are set or after a delete.

export function activeScene() {
	return project.scenes.find((s) => s.id === ui.activeSceneId) ?? project.scenes[0] ?? null;
}

export function activeLayout() {
	const scene = activeScene();
	if (!scene) return null;
	return scene.layouts.find((l) => l.id === ui.activeLayoutId) ?? scene.layouts[0] ?? null;
}

/** Adds a scene and switches to it. */
export function addScene(scene) {
	project.scenes = [...project.scenes, scene];
	ui.activeSceneId = scene.id;
	ui.activeLayoutId = scene.layouts[0]?.id ?? null;
	ui.selectedTrackId = scene.layouts[0]?.tracks[0]?.id ?? null;
	ui.selectedMarkerId = null;
	return scene;
}

export function removeScene(id) {
	if (project.scenes.length <= 1) return;
	project.scenes = project.scenes.filter((s) => s.id !== id);
	if (ui.activeSceneId === id) {
		const first = project.scenes[0];
		ui.activeSceneId = first.id;
		ui.activeLayoutId = first.layouts[0]?.id ?? null;
		ui.selectedTrackId = first.layouts[0]?.tracks[0]?.id ?? null;
	}
	ui.selectedMarkerId = null;
}

/** Adds a layout to the active scene and switches to it. */
export function addLayout(layout) {
	const scene = activeScene();
	if (!scene) return null;
	scene.layouts = [...scene.layouts, layout];
	ui.activeLayoutId = layout.id;
	ui.selectedTrackId = layout.tracks[0]?.id ?? null;
	ui.selectedMarkerId = null;
	return layout;
}

export function removeLayout(id) {
	const scene = activeScene();
	if (!scene || scene.layouts.length <= 1) return;
	scene.layouts = scene.layouts.filter((l) => l.id !== id);
	if (ui.activeLayoutId === id) {
		ui.activeLayoutId = scene.layouts[0].id;
		ui.selectedTrackId = scene.layouts[0].tracks[0]?.id ?? null;
	}
	ui.selectedMarkerId = null;
}

export function moveLayout(id, delta) {
	const scene = activeScene();
	if (!scene) return;
	const from = scene.layouts.findIndex((l) => l.id === id);
	const to = from + delta;
	if (from < 0 || to < 0 || to >= scene.layouts.length) return;
	const next = [...scene.layouts];
	const [moved] = next.splice(from, 1);
	next.splice(to, 0, moved);
	scene.layouts = next;
}

export function activeTracks() {
	return activeLayout()?.tracks ?? [];
}

export function activeTrack() {
	const tracks = activeTracks();
	return tracks.find((t) => t.id === ui.selectedTrackId) ?? tracks[0] ?? null;
}

export function assetById(id) {
	return project.assets.find((a) => a.id === id) ?? project.assets[0] ?? null;
}

export function selectedMarker() {
	return activeTrack()?.markers.find((m) => m.id === ui.selectedMarkerId) ?? null;
}

/** Tracks that should be drawn: everything, unless something is solo'd. */
export function visibleTracks() {
	const tracks = activeTracks();
	const solo = tracks.filter((t) => t.solo);
	return (solo.length ? solo : tracks).filter((t) => !t.hidden);
}

// --- assets ---------------------------------------------------------------

/** Called once on mount and after every import, so `norm` is always present. */
export function hydrateAssets() {
	for (const asset of project.assets) hydrateAsset(asset);
}

// --- persistence ----------------------------------------------------------

export function serialize() {
	const snapshot = $state.snapshot(project);
	return {
		version: SCHEMA_VERSION,
		name: snapshot.name,
		// `norm` / `orient` are measured from `d` + `adjust`; derived data stays out.
		assets: snapshot.assets.map(({ id, name, d, adjust }) => ({ id, name, d, adjust })),
		scenes: snapshot.scenes
	};
}

export function load(data) {
	const next = migrate(data);
	project.version = next.version;
	project.name = next.name;
	project.assets = next.assets;
	project.scenes = next.scenes;

	hydrateAssets();
	resetSelection();
}

/** Adds a track to the active layout and selects it. */
export function addTrack(track) {
	const layout = activeLayout();
	if (!layout) return null;
	layout.tracks = [...layout.tracks, track];
	ui.selectedTrackId = track.id;
	ui.selectedMarkerId = null;
	ui.selectedPointIndex = null;
	return track;
}

export function removeTrack(id) {
	const layout = activeLayout();
	if (!layout || layout.tracks.length <= 1) return;
	layout.tracks = layout.tracks.filter((t) => t.id !== id);
	if (ui.selectedTrackId === id) ui.selectedTrackId = layout.tracks[0].id;
	ui.selectedMarkerId = null;
}

export function moveTrack(id, delta) {
	const layout = activeLayout();
	if (!layout) return;
	const from = layout.tracks.findIndex((t) => t.id === id);
	const to = from + delta;
	if (from < 0 || to < 0 || to >= layout.tracks.length) return;
	const next = [...layout.tracks];
	const [moved] = next.splice(from, 1);
	next.splice(to, 0, moved);
	layout.tracks = next;
}

export function resetSelection() {
	ui.activeSceneId = project.scenes[0]?.id ?? null;
	ui.activeLayoutId = activeScene()?.layouts[0]?.id ?? null;
	ui.selectedTrackId = activeLayout()?.tracks[0]?.id ?? null;
	ui.selectedMarkerId = null;
	ui.selectedPointIndex = null;
	ui.progress = 0;
	ui.isPlaying = false;
}
