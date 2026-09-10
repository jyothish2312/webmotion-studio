/**
 * Editor chrome sizes and which disclosure panels are open.
 *
 * Kept apart from `ui` because none of it is project data — it is how this
 * person likes their workspace, so it persists to localStorage and never
 * touches the saved file.
 */

const KEY = 'webmotion.workspace.v1';

const DEFAULTS = {
	left: 268,
	right: 330,
	timeline: 118,
	leftOpen: true,
	rightOpen: true,
	/** Section id -> open. Anything missing falls back to `openByDefault`. */
	sections: {}
};

export const LIMITS = {
	left: { min: 200, max: 520 },
	right: { min: 260, max: 560 },
	timeline: { min: 96, max: 480 }
};

function read() {
	try {
		const raw = localStorage.getItem(KEY);
		if (!raw) return { ...DEFAULTS };
		const saved = JSON.parse(raw);
		return { ...DEFAULTS, ...saved, sections: { ...saved.sections } };
	} catch {
		// Private browsing, blocked storage, corrupt value — defaults are fine.
		return { ...DEFAULTS };
	}
}

export const workspace = $state(read());

let saveTimer = null;
export function persistWorkspace() {
	clearTimeout(saveTimer);
	saveTimer = setTimeout(() => {
		try {
			localStorage.setItem(KEY, JSON.stringify($state.snapshot(workspace)));
		} catch {
			/* not worth surfacing */
		}
	}, 250);
}

export const clamp = (n, { min, max }) => Math.min(max, Math.max(min, n));

export function resize(key, value) {
	workspace[key] = clamp(Math.round(value), LIMITS[key]);
	persistWorkspace();
}

export function resetSize(key) {
	workspace[key] = DEFAULTS[key];
	persistWorkspace();
}

export function isSectionOpen(id, openByDefault = true) {
	return workspace.sections[id] ?? openByDefault;
}

export function toggleSection(id, openByDefault = true) {
	workspace.sections[id] = !isSectionOpen(id, openByDefault);
	persistWorkspace();
}

export function setAllSections(ids, open) {
	for (const id of ids) workspace.sections[id] = open;
	persistWorkspace();
}
