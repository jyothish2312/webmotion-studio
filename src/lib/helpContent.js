/**
 * The in-app manual.
 *
 * Kept as data rather than markup so the dialog can search it and so the
 * wording lives in one place. Block types: `body` (paragraph), `steps`
 * (numbered), `list` (term + explanation), `pre` (fixed layout), `note`
 * (callout), `keys` (the shortcut table).
 *
 * **bold** and `code` are the only markup; renderMarkup handles both.
 */
export const HELP = [
	{
		id: 'start',
		title: 'Quick start',
		blocks: [
			{
				type: 'body',
				text: 'Five minutes to a drone that flies in, picks something up, and carries on.'
			},
			{
				type: 'steps',
				items: [
					'Pick a shape under **Shapes**, or upload your own SVG. If it faces the wrong way, open its **Adjust** panel and rotate it — that corrects the artwork everywhere it is used.',
					'Shape the path: drag the yellow anchors and their purple handles on the canvas. Press **P** to add more points.',
					'Press **M** and click the path where the pickup should happen. That drops a marker.',
					'With the marker selected, give it a **Hold** of about a second, and morph it into another shape **during the hold**. That is the grab.',
					'Press **Space** to watch it, then **Get GSAP code** when you like it.'
				]
			},
			{
				type: 'note',
				text: '**Save** writes a `.json` you can re-open later; **Get GSAP code** produces what you actually ship. There is also a recovery copy kept in this browser — if you close the tab without saving, the next visit offers it back. It is a safety net, not a save: it lives only here, and it does not keep background images.'
			}
		]
	},
	{
		id: 'model',
		title: 'How it is organised',
		blocks: [
			{
				type: 'pre',
				text: `Project
  Shapes          shared everywhere
  Scene           one timeline, one page trigger
    Layout        one stage per screen size
      Track       one object: its own path and stops`
			},
			{
				type: 'list',
				items: [
					[
						'Scene',
						'One animation on a page. Scenes are independent of each other — each has its own timeline and its own trigger, and an off-screen one stays paused.'
					],
					[
						'Layout',
						'A stage for one screen size. A phone gets its own path rather than a squashed copy of the desktop one.'
					],
					[
						'Track',
						'One moving object. Tracks inside a scene share a timeline, because their timing is the reason they are together — the crate lifts exactly when the drone arrives.'
					],
					['Stop', 'A point in a track: arrive, hold, then travel on to the next one.']
				]
			},
			{
				type: 'note',
				text: 'Only **track offset** couples tracks to each other. Everything else about a track is its own.'
			}
		]
	},
	{
		id: 'stops',
		title: 'Stops and timing',
		blocks: [
			{ type: 'body', text: 'Every marker you drop is a stop, and a stop is three things in order:' },
			{ type: 'pre', text: 'arrive  ->  hold (optional)  ->  travel to the next stop' },
			{
				type: 'list',
				items: [
					[
						'Hold',
						'How long it sits still. This is what makes a pickup or a landing read as deliberate instead of as a glitch. A morph set to "during the hold" is the grab.'
					],
					['Travel', 'Seconds to reach the next stop, plus its easing.'],
					[
						'Look',
						'Scale, rotation, opacity, stroke and fill, tweened from this stop to the next.'
					]
				]
			},
			{
				type: 'note',
				tone: 'warn',
				text: 'Position along the path is **not** position in time. Holds and per-segment durations mean a marker halfway along the path is rarely halfway through the animation. The scrubber shows the true timing; the canvas shows the true geometry.'
			},
			{
				type: 'body',
				text: 'Adding a marker mid-segment keeps the total timing by default: the segment splits rather than the scene getting longer, and its easing is sliced so the motion is unchanged until you edit the new marker. Turn that off under **Scene** if you would rather it extend.'
			}
		]
	},
	{
		id: 'canvas',
		title: 'Canvas',
		blocks: [
			{
				type: 'list',
				items: [
					['Anchors', 'The yellow dots. Drag to move a point.'],
					[
						'Handles',
						'The purple dots. Drag to bend the curve. They mirror each other — hold Alt while dragging to break that.'
					],
					[
						'Markers',
						'The red dots on the path. Drag along the path to re-time one; a dashed ring means it has a hold.'
					],
					['Other tracks', 'Drawn as faint paths. Click one to switch to it.']
				]
			},
			{ type: 'keys' }
		]
	},
	{
		id: 'timeline',
		title: 'Timeline',
		blocks: [
			{
				type: 'body',
				text: 'One lane per track. The bar across the top is the scrubber — drag it to move through the scene.'
			},
			{
				type: 'list',
				items: [
					['Lane body', 'Drag it sideways to change when that track starts.'],
					['Red ticks', 'Markers. Click one to select it.'],
					['Shaded blocks', 'Holds — the object is parked, not travelling.']
				]
			},
			{
				type: 'note',
				text: 'The scrubber and the lanes are separate targets on purpose: with a single full-width track the lane would cover the whole bar and leave nowhere to scrub.'
			}
		]
	},
	{
		id: 'shapes',
		title: 'Shapes and morphing',
		blocks: [
			{
				type: 'body',
				text: 'Upload any SVG. Rectangles, circles and polygons are converted to paths for you, and every subpath is rewritten to absolute coordinates so multi-path icons do not scatter.'
			},
			{
				type: 'list',
				items: [
					[
						'Adjust',
						'Rotate, flip, scale and nudge the artwork itself. This is not animation — it corrects the drawing, and applies everywhere that shape is used.'
					],
					[
						'Morph',
						'Set a marker to become another shape. Both are measured the same way, so they land on top of each other instead of jumping in size.'
					],
					[
						'Rotational morphing',
						'Usually smoother between icons. Turn it off under Object if a morph turns inside out.'
					]
				]
			},
			{
				type: 'body',
				text: 'If a morph throws pieces across the icon, the fix is almost always **How it morphs** on that marker. It decides which piece of the first shape becomes which piece of the second, and whether they move in straight lines or swing on arcs.'
			},
			{
				type: 'list',
				items: [
					[
						'Minimal',
						'Each piece pairs with the nearest one and moves straight there. Start here whenever the two shapes are versions of the same thing — a drone with its claw open and the same drone carrying a crate.'
					],
					[
						'Balanced',
						'Pairs by size instead of position. Worth trying when the shapes share a structure but sit in different places.'
					],
					[
						'Organic',
						'Anchors swing on arcs. It reads better between genuinely different shapes, and badly between similar ones — this is the setting that makes near-identical icons fly apart.'
					],
					['By detail', 'Pairs pieces with similar numbers of anchor points. The one to try when the other three all look wrong.'],
					['Custom', 'The raw pairing, arc and start-point-offset controls, if you want to hand-tune one.']
				]
			},
			{
				type: 'note',
				tone: 'warn',
				text: 'Element transforms in an uploaded SVG are **not** baked in. Flatten them in your editor first, or the shape will land in the wrong place.'
			}
		]
	},
	{
		id: 'alive',
		title: 'Making it feel alive',
		blocks: [
			{
				type: 'body',
				text: 'A path plus keyframes gets you a sprite sliding along a line. These are what make it read as a thing that exists:'
			},
			{
				type: 'list',
				items: [
					[
						'Momentum',
						'A spring chases the path heading instead of snapping to it, so the nose swings wide on a corner and settles. It also rolls into turns and pitches when it speeds up or slows down.'
					],
					[
						'Off-weight',
						'The body tilts against its own sideways acceleration and overshoots back. Cheap, convincing mass.'
					],
					[
						'Idle life',
						'Bob, sway and breathe. Switch it to Organic — the sine version repeats exactly, which is why it reads as clockwork.'
					],
					[
						'Motion trail',
						'Ghosts replaying earlier frames. They bunch up when it slows and stretch when it accelerates, which is what reads as speed.'
					],
					[
						'Settle and recoil',
						'A wobble on arrival and a punch on a morph. Small, and they sell the grab.'
					]
				]
			},
			{
				type: 'note',
				text: 'Momentum, off-weight and organic idle run on wall-clock time, so they only move while playing. Pausing snaps them to rest — that is what keeps a scrubbed frame reproducible.'
			}
		]
	},
	{
		id: 'responsive',
		title: 'Different screen sizes',
		blocks: [
			{
				type: 'body',
				text: 'Add a layout per breakpoint. A new layout copies the tracks you already tuned, so the workflow is duplicate, then adjust.'
			},
			{
				type: 'body',
				text: 'Layouts are matched in tab order: the first one whose minimum width fits wins, and the last is the fallback. Turn on **Preview** and switch between Desktop, Tablet and Mobile to watch the picker choose — it is the same code the real page runs, so what you see is what ships.'
			},
			{
				type: 'note',
				text: 'Paths are drawn per layout rather than stretched. A stretched path bends wrong when the aspect flips, and the object itself never stretches with it.'
			}
		]
	},
	{
		id: 'ship',
		title: 'Putting it on a page',
		blocks: [
			{ type: 'body', text: '**Get GSAP code** gives you five things:' },
			{
				type: 'list',
				items: [
					[
						'GSAP timeline',
						'The JavaScript, written out one call per keyframe so you can read and edit it.'
					],
					['SVG markup', 'The stage that code expects to find.'],
					['Standalone page', 'Both, plus script tags. Open the file and it runs.'],
					['Scene data', 'The JSON the runtime reads. This is the one to use for a real site.'],
					['Svelte', 'A copy-paste component for a Svelte or SvelteKit site.']
				]
			},
			{
				type: 'body',
				text: 'For a site, copy `gaspRuntime.js` and `GaspScene.svelte` out of `src/lib/runtime/`, save the Scene data next to them, and drop the component in. Choose when it starts under **Scene → Starts on a page when**.'
			},
			{
				type: 'note',
				text: 'Reduced-motion visitors get the finished frame rather than a frozen first one, since the end state is usually the point.'
			}
		]
	},
	{
		id: 'trouble',
		title: 'When something looks wrong',
		blocks: [
			{
				type: 'list',
				items: [
					[
						'The shape scattered on upload',
						'It had element transforms. Flatten them in your vector editor and upload it again.'
					],
					[
						'It faces the wrong way',
						'Use Adjust on the shape, not Rotation offset. Adjust corrects the drawing; the offset is a per-track trim on top of it.'
					],
					[
						'A morph turns inside out or flings pieces about',
						'Set that marker’s How it morphs to Minimal. Organic (and the old Rotational morphing switch) swings anchors on arcs, which looks wrong between shapes that are nearly the same.'
					],
					[
						'It will not rotate along the path',
						'Momentum takes rotation over when it is on. Turn Momentum off, or use its own dials instead.'
					],
					[
						'A marker vanished',
						'A marker dragged all the way to the very start is absorbed by the start stop. Drag it back out along the path.'
					],
					[
						'A track sits still',
						'Check its offset under Track — it may not have started yet at the point you are scrubbed to.'
					],
					[
						'The panels are a mess',
						'Drag any divider to resize, double-click one to reset it, or use View → Reset workspace in the header.'
					]
				]
			}
		]
	}
];

export const SHORTCUTS = [
	['V', 'Select and edit'],
	['P', 'Add path point'],
	['M', 'Add marker'],
	['Space', 'Play / pause'],
	['Del', 'Delete the selected marker or point'],
	['0', 'Reset the view'],
	['Alt + drag', 'Pan the canvas'],
	['Wheel', 'Zoom to the cursor'],
	['Alt + drag handle', 'Break the handle mirror'],
	['?', 'Open this guide'],
	['Esc', 'Close a dialog']
];

/** Turns `**bold**` and `` `code` `` into segments the template can render. */
export function renderMarkup(text) {
	const out = [];
	const pattern = /(\*\*[^*]+\*\*|`[^`]+`)/g;
	let last = 0;
	let match;

	while ((match = pattern.exec(text))) {
		if (match.index > last) out.push({ kind: 'text', value: text.slice(last, match.index) });
		const token = match[0];
		out.push(
			token.startsWith('**')
				? { kind: 'strong', value: token.slice(2, -2) }
				: { kind: 'code', value: token.slice(1, -1) }
		);
		last = match.index + token.length;
	}
	if (last < text.length) out.push({ kind: 'text', value: text.slice(last) });
	return out;
}

/** Flattens a section to plain text, for the search box. */
export function sectionText(section) {
	const parts = [section.title];
	for (const block of section.blocks) {
		if (block.text) parts.push(block.text);
		if (block.items) {
			for (const item of block.items) parts.push(Array.isArray(item) ? item.join(' ') : item);
		}
		if (block.type === 'keys') for (const [k, v] of SHORTCUTS) parts.push(`${k} ${v}`);
	}
	return parts.join(' ').toLowerCase();
}
