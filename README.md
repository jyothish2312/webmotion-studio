# webmotion-studio

A visual authoring tool for GSAP motion-path and SVG-morph animations. Draw a bezier
path, drop markers along it, say what the object should do at each one, then export
GSAP code you can paste into a real project.

Built for the "drone flies in from the corner, loops, stops to pick something up in
the middle, carries on to the right" kind of shot.

```bash
npm install
npm run dev
```

There is a full guide inside the app — the **?** button in the header, or press
`?`. It opens by itself the first time you run it.

## Workspace

Every divider drags. Double-click one to reset it, or use **Reset layout**. The
two side panels collapse from the header buttons, and every section in them
folds away. Panel sizes and which sections you left open persist locally, so the
editor keeps the shape you work in — none of it touches the saved project file.

## The model

```
Project
  assets[]                 shared everywhere; each carries its own orientation fix
  scenes[]                 one master timeline, one page trigger
    layouts[]              one stage per breakpoint, chosen at runtime by size
      tracks[]             one object: its own path, stops and behaviour
```

**Tracks inside a scene share one timeline** — their timing is related by design
(the crate lifts exactly when the drone arrives), so they scrub together and
`track.offset` says where each starts. **Scenes on a page are independent** —
own timeline, own trigger, and an off-screen scene stays paused.

Within a track, everything is a **stop**. A stop is:

```
arrive  ->  hold (optional dwell)  ->  travel to the next stop
```

The start of the path is stop 0 (configured under _First segment_); every marker you
place is another stop; the timeline ends at the end of the path.

At each stop you set:

| | |
|---|---|
| **Hold** | How long to sit still. This is what makes a pickup or a landing read as deliberate rather than as a glitch. |
| **Travel** | Seconds to reach the next stop, plus its easing. |
| **Morph** | Which shape to become, and whether that happens during the hold, during the travel, or over a custom length. |
| **Look** | Scale, rotation, opacity, stroke colour, stroke width, fill — tweened from this stop to the next. |

## Physicality

Beyond the authored stops, each track can carry procedural secondary motion —
springs and value noise, not a simulator, and all optional:

| | |
|---|---|
| **Momentum** | A spring chases the path heading instead of snapping to it, so the nose swings wide on a corner and settles. Rolls into turns by curvature × speed and pitches against acceleration. Takes rotation away from `autoRotate`. |
| **Off-weight** | The body tilts against its own sideways acceleration, then overshoots back. Fakes mass. |
| **Organic idle** | Summed octaves of noise instead of sine loops. Sines repeat exactly, which is why they read as clockwork. |
| **Settle / recoil** | A damped wobble on arrival and a scale punch on a morph. These *are* authored, so unlike the rest they scrub. |

Springs run on `gsap.ticker`, not the timeline — a track's timeline only fires
while the playhead is inside its window, so a finished track would otherwise
freeze. Seeking snaps every spring and drops its speed history, so a scrubbed
frame is reproducible no matter how you got there.

Two things are deliberately **not** on the scrub timeline:

- **Idle life** — bob, sway and breathe. Three loops at different periods, running on
  wall-clock time. This is most of the difference between "a sprite being dragged
  along a line" and "something airborne".
- **Motion trail** — ghost copies replaying earlier frames. They bunch up when the
  object slows and stretch when it speeds up, which is what reads as velocity.

### Path progress is not time

`marker.progress` is a position along the path's *length*. The timeline runs in
*seconds*. Holds and per-segment durations mean the two are not proportional — a
marker halfway along the path is rarely halfway through the animation. Anything that
needs to place a marker in time goes through `planStops()` in
[`src/lib/engine.js`](src/lib/engine.js); nothing should use `marker.progress` as a
time directly.

## Layout

| File | |
|---|---|
| `src/lib/model.js` | The v3 shape, factories that coerce untrusted input, `migrate()` from v1/v2, and `pickLayout()`. |
| `src/lib/engine.js` | `planStops` / `planScene` are pure — no DOM, no GSAP. `createTrackRenderer` builds one object; `createSceneRenderer` composes them onto a master. |
| `src/lib/dynamics.js` | Springs, angle springs and value noise. No DOM, no GSAP, so editor and runtime match exactly. |
| `src/lib/svg.js` | Gets arbitrary artwork into one shared coordinate space. Morphing only looks right if both shapes are measured the same way. |
| `src/lib/path.js` | Bezier path generation and projecting a click onto the path. |
| `src/lib/insertMarker.js` | Splits a segment instead of lengthening it, inverting and slicing its easing. |
| `src/lib/exportCode.js` | Emits the timeline **unrolled** — one explicit call per keyframe, so the output is readable and hand-editable. |
| `src/lib/runtime/` | `gaspRuntime.js` + `GaspScene.svelte` — copy these into the site that hosts the animation. |
| `src/lib/state.svelte.js` | Project state (Svelte 5 runes), navigation accessors, save/load. |
| `src/TrackObject.svelte` | One track's wrapper stack, mirrored exactly by the exporter. |
| `src/lib/panels.svelte.js` | Panel sizes and section state. Workspace preference, not project data, so it persists separately. |
| `src/lib/helpContent.js` | The in-app guide, as data so it can be searched. |

### Why nine nested `<g>` wrappers

```
.gasp-place       motion path: position (+ auto-rotation, unless momentum owns it)
  .gasp-dyn       ticker-driven: heading lag, bank, pitch, off-weight, organic idle
    .gasp-life    sine idle bob / sway / breathe
      .gasp-accent  settle and morph recoil (authored, so they scrub)
        .gasp-fx    per-stop scale, rotation, opacity
          .gasp-size    base object size
            .gasp-orient  the artwork's own rotation / flip / nudge
              .gasp-norm  measured centering, tweened during a morph
                .gasp-shape  the path MorphSVG rewrites
```

One concern each. GSAP composes transforms per element, so anything sharing a wrapper
would fight over the same matrix — which is exactly what made the earlier version
jitter.

## Shortcuts

`V` select · `P` add path point · `M` add marker · `Space` play/pause ·
`Del` delete selection · `0` reset view · `?` open the guide ·
`Alt`+drag pan · wheel zoom · `Alt` while dragging a handle breaks the mirror

## Putting it on a page

```svelte
<script>
  import GaspScene from '$lib/gasp/GaspScene.svelte';
  import droneDelivery from '$lib/gasp/drone-delivery.json';
</script>

<GaspScene name="drone-delivery" scene={droneDelivery} trigger="inview-once" />
```

Copy `src/lib/runtime/gaspRuntime.js` and `GaspScene.svelte` into your site. The
runtime re-picks the layout from the element's measured size using the same
`pickLayout` call the editor's preview makes, so the two cannot drift.

Triggers: `inview-once` (default), `inview`, `visible-amount`, `load`, `manual`.
IntersectionObserver, not ScrollTrigger — ScrollTrigger only earns its ~40KB if
a scene later needs scroll *scrubbing*. `prefers-reduced-motion` jumps to the
finished frame, since the end state is usually the point.

## Export

**Get GSAP code** gives you five views:

- **GSAP timeline** — the JS, unrolled, one section per track under a scene master.
- **SVG markup** — the stage that JS expects to find.
- **Standalone page** — both plus CDN script tags. Open it and it runs.
- **Scene data** — the JSON the runtime consumes, carrying only the assets used.
- **Svelte** — a copy-paste `<GaspScene>` snippet.

**Save** / **Open** handle the editable `.json` project (v1 and v2 files migrate).

## Tests

```bash
npm test           # unit: planning, model + migrations, layout picking, dynamics
npm run test:browser   # drives the built app in headless Chrome over CDP
```

The engine's failure modes are visual — an empty path at the origin, a morph
that snaps, a scrub landing on the wrong frame — so the browser check exists to
catch what unit tests structurally cannot. It found the majority of the real
bugs in this codebase.

## Adding a marker mid-segment

You often drop a marker in purely to keyframe a rotation tweak, and you do not
want every later marker sliding along the timeline. With **Keep total timing**
on (Scene panel, default), the segment you land in keeps its duration: the time
is split between the two halves, and the split lands at the moment the object
*actually* passes that point — the easing is inverted to find it, then sliced
into two normalised halves with `CustomEase`.

The result is that inserting a marker is a visual no-op until you edit it.

## Notes and limits

- Uses `MorphSVGPlugin`, which ships free in the public `gsap` package from 3.13.
- Uploaded SVGs have `rect`/`circle`/`polygon` etc. converted to paths automatically,
  but **element transforms are not baked in** — flatten them in your editor first or
  the shape will land in the wrong place.
- The object's stroke uses `vector-effect="non-scaling-stroke"`, so stroke width stays
  constant in screen pixels across zoom levels and across morphs between assets of
  very different scales.
- "Extra CSS classes" are snapped on at a stop, not tweened. They must already exist
  in your stylesheet — nothing generates them at runtime. Use the **Look** controls for
  anything that needs to animate.
- Editing anything rebuilds the whole timeline. That is intentional: patching a live
  GSAP timeline is where drift and orphaned tweens come from.
