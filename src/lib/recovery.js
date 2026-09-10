/**
 * Crash / forgot-to-save insurance.
 *
 * The editor never writes files on its own, so a closed tab used to take
 * everything with it. This keeps the last edit in localStorage and offers it
 * back on the next visit.
 *
 * It is a safety net, not a save system: **Save** is still the thing that
 * produces a file you own. The snapshot is deliberately lossy — background
 * images are data URLs that routinely run to several megabytes and would blow
 * the ~5MB quota on their own, taking the rest of the project with them.
 */
const KEY = 'webmotion.recovery.v1';

/** Roughly how much of the quota we are willing to spend before giving up. */
const MAX_BYTES = 2_000_000;

/**
 * Strips what must not be stored and reports whether anything was dropped, so
 * the restore prompt can be honest about it.
 */
export function trimForStorage(snapshot) {
	let droppedBackgrounds = 0;
	const scenes = snapshot.scenes.map((scene) => ({
		...scene,
		layouts: scene.layouts.map((layout) => {
			if (layout.background) droppedBackgrounds++;
			return { ...layout, background: null };
		})
	}));
	return { payload: { ...snapshot, scenes }, droppedBackgrounds };
}

export function saveRecovery(snapshot) {
	try {
		const { payload, droppedBackgrounds } = trimForStorage(snapshot);
		const body = JSON.stringify({
			savedAt: Date.now(),
			droppedBackgrounds,
			project: payload
		});
		if (body.length > MAX_BYTES) {
			// A project this big is beyond what a safety net should be holding;
			// dropping it is better than evicting whatever else the origin stores.
			localStorage.removeItem(KEY);
			return { ok: false, reason: 'too large' };
		}
		localStorage.setItem(KEY, body);
		return { ok: true, bytes: body.length, droppedBackgrounds };
	} catch (err) {
		return { ok: false, reason: err?.name === 'QuotaExceededError' ? 'quota' : 'unavailable' };
	}
}

export function readRecovery() {
	try {
		const raw = localStorage.getItem(KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw);
		if (!parsed?.project?.scenes) return null;
		return parsed;
	} catch {
		return null;
	}
}

export function clearRecovery() {
	try {
		localStorage.removeItem(KEY);
	} catch {
		/* nothing to do */
	}
}

/** "3 minutes ago" — the prompt is useless without knowing how stale it is. */
export function describeAge(savedAt) {
	const seconds = Math.max(0, Math.round((Date.now() - savedAt) / 1000));
	if (seconds < 60) return 'moments ago';
	const minutes = Math.round(seconds / 60);
	if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
	const hours = Math.round(minutes / 60);
	if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
	const days = Math.round(hours / 24);
	return `${days} day${days === 1 ? '' : 's'} ago`;
}
