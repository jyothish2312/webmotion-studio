# Example shapes

Upload these through **Shapes → Upload SVG shape**. All are stroke-only, 48×48
viewBox (except `the-spinner.svg`), and are built from primitives so the tool
converts and normalises them on import.

| File | What it is |
|---|---|
| `drone-top.svg` | Quadcopter seen from above — good "cruising" state |
| `drone-cruise.svg` | Quadcopter, side view, nothing attached |
| `drone-hook.svg` | Side view with a tether and an open hook — approaching a pickup |
| `drone-claw-open.svg` | Side view, three-finger claw spread open |
| `drone-carry.svg` | Claw closed on a crate, tucked up — carrying |
| `claw-open.svg` | Just the grabber, fingers open |
| `claw-closed.svg` | Grabber, fingers shut |
| `claw-grab.svg` | Grabber closed around a box |
| `crate.svg` | Isometric crate — the thing being picked up |
| `parcel.svg` | Taped parcel, front view |
| `the-spinner.svg` | The multi-`<path>` icon that used to import scattered — kept as a regression check |

## A pickup sequence to try

1. Start shape: `drone-cruise`
2. Marker at ~0.35, hold 0.6s, morph → `drone-hook` during the hold
3. Marker at ~0.55, hold 1.0s, morph → `drone-carry` during the hold (this is the grab)
4. Let it run to the end carrying the crate

Add a second object on its own path for the crate if you want it to visibly leave
the ground — see the runtime notes in the top-level README.

## Note on your own SVGs

Fingers/arms drawn as separate subpaths in a consistent order morph cleanly. If a
morph turns inside-out, toggle **Rotational morphing** off in the Object panel, or
reorder the subpaths in your editor so they correspond between the two shapes.
