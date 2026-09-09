# webmotion-studio — build plan

Status: proposal. Nothing here is built yet. Current shipped state is the flat
single-object editor described in the top-level [README](../README.md).

This plan takes the tool from **one object on one path** to **a multi-object,
multi-layout scene system** that drops into a SvelteKit site and starts on a
trigger you choose.

---

## 1. Where we are

```
Project (flat)
  assets[]            id, name, d           (+ derived: norm)
  background
  points[]            bezier anchors + handles
  markers[]           progress, hold, duration, ease, morph*, state, classes
  settings            one object's behaviour (autoRotate, size, loop, life, trail, first-segment)
```

- `src/lib/state.svelte.js` — the `project` / `ui` / `controls` stores, `serialize` / `load`.
- `src/lib/engine.js` — `planStops(project)` (pure) + `createEngine()` (one GSAP timeline, one object).
- `src/lib/path.js` — bezier path string, point-at-length, click→path projection.
- `src/lib/svg.js` — upload parsing, `absolutizePath`, measurement + normalisation, preview.
- `src/lib/exportCode.js` — `buildTimelineJs` / `buildMarkup` / `buildStandaloneHtml`.
- Components: `App`, `Canvas`, `Timeline`, `Inspector`, `AssetPanel`, `ExportDialog`, `ui/*`.

The object is a stack of single-concern wrappers:

```
.gasp-place   motion path — position + auto-rotation
  .gasp-life  idle bob / sway / breathe   (wall-clock, off the timeline)
    .gasp-fx  per-stop scale / rotate / opacity
      .gasp-size   base object size
        .gasp-norm normalisation — measured centering, tweened during a morph
          .gasp-shape  the path MorphSVG rewrites
```

---

## 2. Target architecture

```
Project
  assets[]                     shared everywhere; gain an `adjust` transform
  scenes[]
    Scene
      name
      loop / yoyo              master-timeline level (not per object)
      trigger                  how the runtime starts it on a real page
      layouts[]
        Layout
          name                 "desktop" / "tablet" / "mobile"
          match                 which container sizes this layout wins
          viewBox               authoring aspect (w, h)
          background
          tracks[]
            Track               ≈ today's whole project, minus assets/background
              name
              offset            seconds to wait before this track starts
              startingAssetId
              points[]          its own path
              markers[]         its own stops
              settings          its own behaviour (autoRotate, size, life, trail, first-segment;
                                + momentum / weight / settle / … in M5, see §13)
              follow?           M5: this track hangs off another (crate under the drone), see §13
```

Three ideas, each with a clear home:

| Concern | Lives on | Rule |
|---|---|---|
| Art orientation (tilt / facing / mirror) | **asset** | fixed once, applies wherever the asset is used |
| Where the object goes | **track.points** | per track, per layout |
| When objects move relative to each other | **track.offset** on the scene master timeline | tracks in one scene are *meant* to be in sync |
| When the whole thing starts on a page | **scene.trigger** | website glue, not baked into motion data |
| Which path for this screen | **layout** | runtime picks by container size |

**Playback model — the load-bearing decision:**

- **Between scenes on a page:** independent timelines, each on its own trigger. They share nothing.
- **Tracks within one scene:** one GSAP master timeline, `master.add(trackTimeline, track.offset)`. They are in the same scene *because* their timing is related (the crate lifts exactly when the drone arrives). Scrub the scene → scrub every track together.

`idle life` and `trail` stay per-track and off the master (wall-clock), exactly as today.

---

## 3. Feature 1 — asset orientation

**Not** an in-app path editor. Five controls, baked into the asset:

```js
asset.adjust = {
  rotate: 0,      // degrees
  flipX: false,
  flipY: false,
  scale: 1,       // uniform, on top of normalisation
  nudgeX: 0,      // canonical units (0..100), shift art within its box
  nudgeY: 0
}
```

### Mechanics

- `hydrateAsset()` reads `adjust`, folds `nudge` into the measured centering offset, and
  produces two derived transforms:
  - `asset.norm` — `{ scale, x, y }` (measured centering, nudge folded in) — unchanged shape, still tweened during a morph.
  - `asset.orient` — `{ rotate, scaleX: flipX ? -1 : 1, scaleY: flipY ? -1 : 1, scale }`.
- New wrapper **`.gasp-orient`** between `.gasp-norm` and `.gasp-shape`.
  - `transformOrigin` at the shape's centre (which is the origin after `norm` centres it — **verify** GSAP `svgOrigin` / `transformOrigin: '0px 0px'` on a `<g>` behaves).
- Engine: during a morph, tween `.gasp-orient` from `fromAsset.orient` to `toAsset.orient`
  alongside the existing `.gasp-norm` tween. Base rotations rarely differ much between two
  assets in one animation, but if they do it should ease, not snap.

### How it relates to the rotation dials that already exist

| Layer | Answers | Field |
|---|---|---|
| `asset.adjust.rotate` | "art is drawn nose-up, forward should be right" | **new**, per asset |
| `settings.autoRotate` | "turn to follow the path at all?" | exists |
| `settings.rotationOffset` | "follows the path but banks Nº into turns" / global trim | exists — becomes a fine dial once `adjust.rotate` exists |
| `marker.state.rotate` | "spin 180º while parked at the pickup" | exists — **additive** on top of the above |

"Don't rotate" = `autoRotate: false`; the object then holds `adjust.rotate` + `state.rotate`.

### UI

`AssetPanel` — a collapsible **Adjust** section per asset row:
rotate slider + `±90°` buttons, flip-H / flip-V toggles, uniform scale, nudge X / Y,
live preview (`previewSvg` extended to apply `orient`).

### Cost

~0.5 day. Independent of everything else. Ships with the v3 model bump (§8).

---

## 4. Feature 2 — multiple objects per scene

The biggest change. This is the "real timeline system" — it turns the bottom bar into a
multi-lane editor.

### Data

`Track` = today's `{ points, markers, settings }` + `{ id, name, offset, hidden, solo, startingAssetId }`.
A scene's `tracks[]` all share the layout's stage (viewBox + background) and the project's assets.

`loop` / `yoyo` move from `settings` to the **scene**. Track timelines are finite; the scene
master owns the repeat. A track that should hover forever after arriving = author a hold to
the end of the scene, or lean on `idle life`.

### Engine

- `planStops(project)` → `planTrack(track, scene)` — same stop logic, reads `track.settings`.
- New `planScene(layout, scene)` → `{ tracks: [{ track, stops, duration }], duration: max(offset + duration) }`.
- `createEngine()` → `createSceneRenderer()`:
  - owns one master `gsap.timeline({ repeat: scene.loop ? -1 : 0, yoyo: scene.yoyo })`
  - one **track renderer** per track — the current engine internals (7-wrapper stack incl. `.gasp-orient`), parameterised by that track's element refs
  - `master.add(trackRenderer.timeline, track.offset)`
  - per-track `life` + `trail` built as today, off the master
  - `build(refsByTrack, scene, layout, opts)` rebuilds wholesale behind the generation counter, same as now
- Elements scoped by a `<g data-track="{id}">` wrapper; class names stay the same inside.

### Canvas

- Render one object stack per **visible** track (`!hidden`, and if any `solo` then only solo'd).
- Motion paths: the **selected** track's path is drawn interactive (anchors + handles); every
  other visible track's path is drawn ghosted and non-interactive.
- Marker dots: selected track only.
- `ui` gains `selectedTrackId`. Clicking a ghosted path or its object selects that track.

### Timeline (multi-lane)

- One lane per track, stacked. Lane content offset by `track.offset / masterDuration`.
- Each lane shows that track's arrive / hold / travel segments and its markers (reusing the
  current tick + hold-window rendering, per lane).
- Drag a lane body horizontally → set `track.offset`. Drag a marker within a lane → its `progress`.
- One playhead spanning all lanes. Time readout = master time.

### Left panel

New **TracksList** component above the tools:
add / remove / duplicate / reorder / rename inline / eye (hidden) / solo. Selection drives
`ui.selectedTrackId`.

### Inspector — now three levels

```
ui.selectedMarkerId            → Marker settings   (unchanged)
else ui.selectedTrackId        → Track settings    (today's "global" panel, per track:
                                                    object, path & loop*, first segment, life, trail)
else                           → Scene settings    (name, loop, yoyo, trigger, layout list)
```
\* per-track `loop` / `yoyo` controls removed from the track panel; `closedPath` / `loopTension` stay (they're path geometry).

### Cost

~4–6 days. Do it against a single implicit layout first (§5 wraps it).

---

## 5. Feature 3 — layouts (responsive paths)

### Why named layouts and not fluid coordinates

- **% / anchor coordinates** (points as 0–1 of the container): bezier handles distort
  non-uniformly when the aspect flips, auto-rotate angles shift because the path derivative
  changes under non-uniform scale, and the object itself doesn't stretch — so its motion reads
  wrong against a stretched path. Much math, still loses to a hand-tuned mobile path.
- **Scale-to-fit** (contain / cover): a wide desktop path on a 9:16 phone either shrinks to a
  letterboxed strip or crops the object off-screen.

### Model

`Layout = { id, name, match, viewBox: {w, h}, background, tracks: [Track] }`.

**Shared across a scene's layouts:** assets (project level), scene name, `loop` / `yoyo`, `trigger`.
**Not shared:** path geometry, timing, markers, backgrounds.

Cross-layout "this is the same marker in both" linking is **out of scope for v3** — the
workflow is *duplicate layout → adjust*. Revisit only if the duplication actually hurts.

### `match` and runtime selection

```js
match = { maxWidth?: number, minWidth?: number, aspect?: [min, max] }
```

- Ordered list per scene, first match wins, a final layout with `match: {}` is the fallback.
- Runtime: **`ResizeObserver` on the mount container** (not `window` — a scene can live in a
  sidebar), debounced. On a layout change, rebuild the scene renderer for the new layout.
- Within a layout the container still won't match the authored aspect exactly → SVG
  `preserveAspectRatio="xMidYMid slice"` (cover) by default, per-layout override to `meet`.

### Authoring

- Layout tabs in the header or above the canvas; `ui.activeLayoutId`.
- Canvas frame + viewBox use `layout.viewBox`.
- "Duplicate layout" copies all tracks into a new layout for tweaking.
- Optional safe-zone overlay: outlines for 16:9 / 16:10 / 4:3 / 9:16 inside the current layout
  so you keep the action clear of crop edges.

### Cost

~2–3 days on top of §4.

---

## 6. Feature 4 — multiple scenes, runtime, SvelteKit

### Project holds scenes

`Project = { version: 3, name, assets, scenes: [Scene] }`. The editor gets a scene switcher
(dropdown or tabs); one scene is active at a time. `ui.activeSceneId`.

### `gasp-runtime.js` (new, ~100 lines, deps: gsap + MotionPathPlugin + MorphSVGPlugin)

```js
import { register, mount } from 'gasp-runtime';

register('drone-delivery', sceneConfig);   // sceneConfig = the exported scene JSON
const app = mount(document);               // scans [data-gasp], returns { destroy }
```

Per `[data-gasp="name"]` element:
1. `ResizeObserver` → choose the layout by `match`.
2. Build the scene: for each track `buildMarkup(track)` → inject → collect refs →
   `createSceneRenderer().build(...)`. (`buildMarkup` already emits the wrapper stack.)
3. Wire the trigger (below). Scene starts `paused`.
4. `gsap.matchMedia()` `(prefers-reduced-motion: reduce)` → `master.progress(1).pause()`.

### Triggers (export presets)

| Preset | Behaviour |
|---|---|
| `inview` | play when it enters the viewport; pause + reset to 0 when it leaves |
| `inview-once` | play on first entry, then disconnect |
| `visible-amount` | play when ≥ N% visible |
| `load` | play immediately on mount |
| `manual` | do nothing; expose `app.play('name')` |

Default trigger is `inview-once`. `IntersectionObserver`, not ScrollTrigger — ScrollTrigger
(~40 KB) only earns its weight if some scenes later need scroll-*scrubbing*. The trigger is a
scene field so it round-trips through the file, but it's read only by the runtime.

### SvelteKit integration

`$lib/gasp/` in the consuming site:
- `GaspScene.svelte` — wraps `mount` for one scene, props `{ name, trigger, amount, once }`.
- `gaspScene` action — `<div use:gaspScene={{ name: 'drone-delivery' }}>`.

The export dialog emits, per scene: the `scene.json`, a ready `<GaspScene .../>` snippet, and
(as today) an optional single-file standalone HTML for quick embeds.

### Cost

~3–4 days.

---

## 7. Feature 5 — preview mode

A way to watch the animation as a visitor would — no editor chrome — without exporting.

### Basic (ships with M1)

A **Preview** toggle in the header. When on, the canvas hides everything that isn't the
finished frame:

- gone: grid, motion-path guide + halo, anchors, handles, marker dots, safe-zone overlays,
  the editor frame rect, the pan/zoom affordance
- kept: the layout's `viewBox` framed exactly (letterbox to its aspect), background, the
  animated object(s)
- a minimal transport strip (play / restart / scrub) pinned at the bottom, or press space
- `Esc` or the toggle exits

Cheap because the canvas already separates the chrome layer from the object layer — preview
just stops rendering the chrome group and clamps the SVG to `layout.viewBox` with
`preserveAspectRatio` from the layout.

### Device-frame preview (with M3)

Once layouts exist, preview gains a width selector — **Desktop / Tablet / Mobile / Fit** —
that resizes the preview frame and lets the runtime layout picker choose, so you see the
actual mobile path get selected at a narrow width. Optional phone/tablet bezel art around
the frame.

### Trigger preview (with M4)

A "simulate trigger" button: hides the scene, shows a mock scrollport, and fires the
configured trigger (`inview` etc.) when the frame scrolls into it — so you can check the
first-frame state and the entry timing before it's on the real site.

### Cost

~0.5 day basic · +1 day device frames · +0.5 day trigger sim.

---

## 8. Data model v3 + migration

### v3 file

```jsonc
{
  "version": 3,
  "name": "My project",
  "assets": [{ "id": "...", "name": "...", "d": "...", "adjust": { "rotate": 0, "flipX": false, "flipY": false, "scale": 1, "nudgeX": 0, "nudgeY": 0 } }],
  "scenes": [{
    "id": "...", "name": "Drone delivery",
    "loop": true, "yoyo": false,
    "trigger": { "type": "inview-once", "amount": 0.35 },
    "keepTotalTimingOnInsert": true,          // M6, §14 — editor-only, ignored by the runtime
    "layouts": [{
      "id": "...", "name": "desktop",
      "match": { "minWidth": 768 },
      "viewBox": { "w": 1200, "h": 700 },
      "background": null,
      "tracks": [{
        "id": "...", "name": "drone", "offset": 0,
        "startingAssetId": "...",
        "points": [ /* ... */ ],
        "markers": [ /* ... */ ],
        "settings": { /* autoRotate, rotationOffset, objectSize, closedPath, loopTension,
                         rotationalMorph, startHold, startDuration, startEase, startState,
                         startClasses, life{}, trail{}
                         — M5 adds: momentum{}, weight{}, settle{}, morphRecoil{}, speedLink{};
                           life{} gains mode: 'sine' | 'organic' */ }
      }]
    }]
  }]
}
```

`norm` / `orient` stay derived (measured from `d` + `adjust`), never written.

### Migration

- **v2 → v3**: wrap everything.
  `project.settings.{loop,yoyo}` → `scene`. The rest of `settings` → the single track.
  `project.points/markers` → that track. `project.background` → the single layout
  (`name: "desktop"`, `match: {}`, `viewBox: { w: 1200, h: 700 }`). `assets` gain default `adjust`.
- **v1 → v3**: existing v1→v2 path (class strings → real state, `pathPoints`/`motionSettings`
  key aliases) then v2→v3.
- `serialize()` / `load()` rewritten around the new shape. `hydrateAssets()` applies `adjust`.

### Editor `ui` additions

`activeSceneId`, `activeLayoutId`, `selectedTrackId` (alongside the existing
`selectedMarkerId` / `selectedPointIndex`).

---

## 9. Module layout after the refactor

```
src/lib/
  state.svelte.js     project/ui/controls, serialize, load, migrations
  model.js            makeAsset / makeTrack / makeLayout / makeScene / makeMarker / makeState / makeSettings
  path.js             (unchanged)
  svg.js              + adjust → norm/orient
  engine/
    planTrack.js      pure: track → stops + duration
    planScene.js      pure: layout+scene → tracks[] + master duration
    sceneRenderer.js  master timeline + per-track renderers + life/trail
  export/
    markup.js         buildMarkup(track) / buildStage(layout)
    timelineJs.js     buildSceneJs(scene, layout)
    standalone.js     buildStandaloneHtml(scene)
  dynamics.js         spring integrators + value noise, shared by editor + runtime
  runtime/
    gasp-runtime.js   register / mount / triggers / layout picker
    GaspScene.svelte  SvelteKit wrapper (shipped as a copy-paste snippet)

src/
  App.svelte
  panels/  ScenePanel  TracksList  Inspector  AssetPanel  ExportDialog
  Canvas.svelte  Timeline.svelte (multi-lane)  PreviewFrame.svelte
  ui/  Slider Toggle Section LookEditor  (+ LaneRow, Tabs)
```

---

## 10. Milestones

| # | Scope | Depends on | Est. |
|---|---|---|---|
| **M0** | v3 model + migration + `serialize`/`load`, no behaviour change (implicit single scene/layout/track). Ship. | — | 1–2 d |
| **M1** | Asset **Adjust** controls + `.gasp-orient` wrapper + morph-time orient tween. **Basic preview mode** (§7). | M0 | 1 d |
| **M2** | **Multi-track**: TracksList, scene master timeline, per-track renderers, ghosted non-selected paths, multi-lane timeline, Inspector 3-level split. Single implicit layout. | M0 | 4–6 d |
| **M3** | **Layouts**: tabs, `match`, per-layout viewBox/background, duplicate-layout. **Device-frame preview**. | M2 | 3–4 d |
| **M4** | **Multiple scenes** + `gasp-runtime.js` + `GaspScene.svelte` + export rework + trigger presets + **trigger preview**. | M3 | 4–5 d |
| **M5** | **Physicality & richer life** (§13) — cherry-pickable; momentum + organic noise first. | M2 | 5–9 d |
| **M6** | **Insert-marker timing preservation** (§14) — low priority, slots in any time after M2. | M2 | 1 d |
| Post | Cross-layout marker linking · easing curve editor · onion-skinning · scroll-scrub trigger · copy motion between tracks. | — | — |

Rough total for M0–M4: **~13–18 days** (≈ 3–4 focused weeks, one dev). M5 adds 5–9,
M6 adds 1 — both optional and cherry-pickable.

---

## 11. Non-goals for v3

- No in-app SVG **path/node** editing (rotate/flip/scale/nudge only; redraw in Figma/Illustrator).
- No scroll-**scrubbed** scenes (trigger-to-play only; scrub can be a later trigger type).
- No rigid-body / collision physics, 3D, or particle systems. The §13 dynamics are
  procedural secondary motion (springs + noise), not a simulator.
- No per-frame keyframe editor — **markers stay the authoring model**.
- No cross-layout "same marker" linking (duplicate + tweak).

---

## 12. Open questions

1. **`.gasp-orient` transformOrigin** — confirm GSAP rotates a `<g>` about the intended point
   after `norm` has centred the shape at the origin. May need explicit `svgOrigin`.
2. **Layout `match` priority** — width breakpoints only, or width + aspect? Proposal: ordered
   list, first match wins, width primary, aspect as an optional extra constraint.
3. **Background on layout vs scene** — proposal: layout (mobile crops / swaps art often).
4. **Track naming** — "Track" (timeline term, matches the lane UI) vs "Actor" / "Object" / "Layer".
   Proposal: Track.
5. **Export granularity** — one `scene.json` per scene + shared `gasp-runtime.js`; optional
   single-file standalone per scene. Whole-project bundle only if a site needs many scenes.
6. **A track that never ends** — hold-to-scene-end vs a per-track "freeze at last frame" flag.
   Proposal: hold-to-end, revisit if it's annoying.
7. **Dynamics wrapper depth** — momentum, off-weight and settle are all spring-driven dynamic
   offsets. One `.gasp-dynamics` wrapper whose transform is composed in the frame callback
   (keeps the stack ~8 deep) vs one wrapper each (clearer, ~10 deep). Proposal: one combined
   wrapper.
8. **Where dynamics run** — editor frame loop and `gasp-runtime` must produce identical
   motion, so the spring/noise integrators live in a shared `dynamics.js` the export inlines.
   Confirm the exported standalone stays dependency-free (no runtime import).
9. **Insert-marker easing split** — accept a sub-frame visual discrepancy from re-applying the
   parent easing in two pieces, or slice it exactly with `CustomEase` (free in gsap ≥ 3.11)?
   Proposal: exact slice; fall back to linear halves if `CustomEase` is unavailable.

---

## 13. After v3 — physicality & richer life (M5)

The current "alive" layer is three sine loops (`bob` / `sway` / `pulse`). It's too regular —
it reads as clockwork, which is most of what "doesn't look alive" means. This section replaces
and extends it with **motion-derived** secondary movement. All of it is procedural (springs +
value noise), none of it is a physics simulation, and every effect is a toggle with 2–4 dials.

Effects live on a single `.gasp-dynamics` wrapper (see open question 7); its transform is
composed each frame in the scene renderer's `frame()` callback, which already samples path
position. The integrators sit in a shared `dynamics.js` so the editor and `gasp-runtime`
produce byte-identical motion.

### Momentum / lag / bank

The object stops snapping to the exact path tangent. Turn GSAP `autoRotate` off; compute the
tangent ourselves (finite difference on `getPointAtLength`) and drive rotation through a
**critically-damped spring** toward it. Effects that fall out:

- on a sharp turn the nose swings wide, then settles
- extra **roll into turns** proportional to `curvature × speed`
- **pitch** proportional to along-path acceleration (leans back accelerating, forward braking)

`track.settings.momentum = { enabled, responsiveness, overshoot, bank, pitch }`
(`overshoot` = spring damping < 1; `responsiveness` = natural frequency.)

### Off-weight

Fakes mass. Two versions:

- **Single-object** — the shape swings about a pivot (`pivotY`, 0 = top of the norm box),
  rotation driven by the parent's horizontal acceleration through a damped spring: jerk left,
  the body tilts right and overshoots back. Same integrator as momentum, different input.
  `track.settings.weight = { enabled, amount, pivotY, springiness, damping }`
- **Follower track** (needs M2) — a track declares
  `follow = { leaderId, lagMs, tether: { length, stiffness, damping } }`. Its position is the
  leader's position `lagMs` ago (reuse the trail history buffer) plus a **pendulum** offset
  integrated from the leader's acceleration + gravity. This makes "crate on a line under the
  drone" a real thing — it genuinely swings and settles. Bigger lift; do it if the delivery
  scene needs it.

### Organic idle (replaces the sines)

`life` gains a mode: `sine` (current) or `organic`. Organic sums 2–3 octaves of value noise
(simplex) for position and rotation, amplitude `turbulence`. Wind buffeting a hovering drone.
Keep `sine` for mechanical objects.

### Settle on arrival

At each stop's `arriveAt`, a short **damped oscillation** on position + rotation offset, on the
dynamics wrapper so it doesn't fight authored `state`. `settle = { enabled, amount, bounces, duration }`.

### Recoil on morph

When a morph fires — especially `morphType: 'hold'`, the grab — a scale-punch
(`1 → 1.1 → 1` over ~0.2 s) and/or a 1–2 px shake. Per-marker override, global default.
`morphRecoil = { scale, shake, duration }`.

### Anticipation (lower value)

Auto-generated counter-move before a big direction change or before a hold ends. Toggle +
magnitude. List it; build last.

### Speed-linked coupling

Optionally scale `trail.count`, idle amplitude, and a "rotor blur" opacity by normalised
instantaneous path speed, so fast passages *look* fast. `speedLink = { trail, life, blur }`.

### Order within M5

momentum → organic idle (these two do most of the work) → settle → recoil → off-weight
single → follower track → speed-link → anticipation. Each is independently shippable.

---

## 14. Lower priority — insert a marker without shifting the timeline (M6)

Purely an authoring convenience. You often add a marker mid-segment *just* to keyframe a
rotation tweak for liveness — and you don't want that to move everything downstream in time.

### Toggle

Scene-level **"Keep total timing when inserting markers"** (default on). Only affects the
*insert* action; editing durations by hand afterwards is unaffected.

### Behaviour

Inserting marker `N` at path progress `p_N` between existing stops `A` and `B`, where `A→B`
currently takes `d_AB` seconds with easing `ease_A`:

1. `f = arcLengthFraction(p_N)` within the `A→B` sub-path (0..1).
2. `t = easeInverse_A(f)` — numerically invert `A`'s easing (binary search on
   `gsap.parseEase(ease_A)`), so `t` is *when*, in eased time, the object currently passes `p_N`.
3. `A.duration = d_AB · t` , `N.duration = d_AB · (1 − t)`.
4. Easing on the two halves: slice `ease_A` into `CustomEase` curves for `0..t` and `t..1`,
   each renormalised to `0..1` and assigned to `A` and `N`. (Fallback: `none` on both halves —
   sub-frame drift only.)

Result: `d_AB` is preserved so every downstream marker keeps its absolute time, **and** the
object still passes through `p_N` at exactly the same instant — inserting the marker is a
visual no-op until you actually tweak `N`.

With the toggle **off**, insert keeps today's behaviour: `A.duration` unchanged, `N.duration`
= default, total time grows.

### Cost

~1 day. Independent; any time after M2 (which reshapes the marker/track model).
