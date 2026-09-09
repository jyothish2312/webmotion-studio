# gasp-tool

A visual authoring tool for GSAP motion-path and SVG-morph animations. Draw a bezier
path, drop markers along it, say what the object should do at each one, then export
GSAP code you can paste into a real project.

Built for the "drone flies in from the corner, loops, stops to pick something up in
the middle, carries on to the right" kind of shot.

```bash
npm install
npm run dev
```

## The model

Everything is a **stop**. A stop is:

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
| `src/lib/engine.js` | Builds the GSAP timeline. `planStops()` is pure — no DOM, no GSAP — and is shared with the code export. |
| `src/lib/svg.js` | Gets arbitrary artwork into one shared coordinate space. Morphing only looks right if both shapes are measured the same way. |
| `src/lib/path.js` | Bezier path generation and projecting a click onto the path. |
| `src/lib/exportCode.js` | Emits the timeline **unrolled** — one explicit call per keyframe, so the output is readable and hand-editable. |
| `src/lib/state.svelte.js` | Project state (Svelte 5 runes) plus save/load, including migration from v1 files. |
| `src/Canvas.svelte` | The editor surface and the five nested wrappers the engine drives. |

### Why five nested `<g>` wrappers

```
.gasp-place   motion path: position + auto-rotation
  .gasp-life  idle bob / sway / breathe
    .gasp-fx  per-stop scale, rotation, opacity
      .gasp-size   base object size
        .gasp-norm normalisation, tweened during a morph
          .gasp-shape  the path MorphSVG rewrites
```

One concern each. GSAP composes transforms per element, so anything sharing a wrapper
would fight over the same matrix — which is exactly what made the earlier version
jitter.

## Shortcuts

`V` select · `P` add path point · `M` add marker · `Space` play/pause ·
`Del` delete selection · `0` reset view · `Alt`+drag pan · wheel zoom ·
`Alt` while dragging a handle breaks the mirror

## Export

**Get GSAP code** gives you three views:

- **GSAP timeline** — the JS, unrolled.
- **SVG markup** — the structure that JS expects to find.
- **Standalone page** — both plus CDN script tags. Open it in a browser and it runs.

**Save** / **Open** handle the editable `.json` project.

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
