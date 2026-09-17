// lib/history.svelte.js
/**
 * Undo / redo.
 *
 * Snapshots rather than inverse operations: every mutation site in the app would
 * otherwise need a hand-written undo, and one forgotten site corrupts the stack
 * silently. Cloning is already the established cost here — recovery.js clones the
 * whole project every 800ms — so the expensive part is not the clone, it is
 * capturing at the right MOMENT.
 *
 * Hence explicit commits. A slider drag is one entry, not two hundred, because
 * the caller says when a gesture ended rather than an effect guessing.
 */
import { project, serialize, load } from './state.svelte.js';

const LIMIT = 60;

let past = [];
let future = [];
let baseline = null;
let applying = false;
let coalesceKey = null;
let coalesceTimer = null;

export const history = $state({ canUndo: false, canRedo: false });

function sync() {
	history.canUndo = past.length > 0;
	history.canRedo = future.length > 0;
}

/** The state to restore TO is the one before the edit, so capture lazily. */
function currentBaseline() {
	if (!baseline) baseline = serialize();
	return baseline;
}

/**
 * Records an edit. Call AFTER mutating.
 *
 * `key` coalesces: consecutive commits with the same key inside the window
 * collapse into one entry, so dragging a slider or a group of points undoes as
 * a single action. Pass a distinct key (or none) for discrete edits.
 */
export function commit(key = null) {
	if (applying) return;

	if (key && key === coalesceKey) {
		clearTimeout(coalesceTimer);
		coalesceTimer = setTimeout(() => (coalesceKey = null), 600);
		return; // baseline already captured by the first commit of this gesture
	}

	past.push(currentBaseline());
	if (past.length > LIMIT) past.shift();
	future = [];
	baseline = serialize();

	coalesceKey = key;
	clearTimeout(coalesceTimer);
	if (key) coalesceTimer = setTimeout(() => (coalesceKey = null), 600);
	sync();
}

function apply(snapshot) {
	applying = true;
	try {
		load(snapshot);
	} finally {
		// A throwing load must not wedge the stack permanently.
		applying = false;
	}
	baseline = serialize();
	coalesceKey = null;
}

export function undo() {
	if (!past.length) return;
	future.push(serialize());
	apply(past.pop());
	sync();
}

export function redo() {
	if (!future.length) return;
	past.push(serialize());
	apply(future.pop());
	sync();
}

export function resetHistory() {
	past = [];
	future = [];
	baseline = null;
	coalesceKey = null;
	clearTimeout(coalesceTimer);
	sync();
}