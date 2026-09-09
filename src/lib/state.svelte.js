import { hydrateAsset } from './svg.js';
import { defaultProject, migrate, SCHEMA_VERSION } from './model.js';

export { EASES, TRIGGERS } from './model.js';

export const project = $state(defaultProject());

export const ui = $state({
	// selection / navigation
	activeSceneId: null,
	activeLayoutId: null,
	selectedTrackId: null,
	selectedMarkerId: null,
	selectedPointIndex: null,

	// editing
	mode: 'edit',
	preview: false,

	// transport (written by the engine every frame — read-only for the UI)
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

export function resetSelection() {
	ui.activeSceneId = project.scenes[0]?.id ?? null;
	ui.activeLayoutId = activeScene()?.layouts[0]?.id ?? null;
	ui.selectedTrackId = activeLayout()?.tracks[0]?.id ?? null;
	ui.selectedMarkerId = null;
	ui.selectedPointIndex = null;
	ui.progress = 0;
	ui.isPlaying = false;
}
