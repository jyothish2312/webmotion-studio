<script>
	import { onMount, untrack } from 'svelte';
	import {
		project,
		ui,
		controls,
		hydrateAssets,
		activeScene,
		activeLayout,
		activeTrack
	} from './lib/state.svelte.js';
	import { makeMarker, makePoint } from './lib/model.js';
	import { buildPathD, pointAt, projectToPath, clamp01 } from './lib/path.js';
	import { createEngine } from './lib/engine.js';

	let host = $state(null);
	let svgEl = $state(null);
	let pathEl = $state(null);
	let placerEl = $state(null);
	let lifeEl = $state(null);
	let fxEl = $state(null);
	let sizeEl = $state(null);
	let orientEl = $state(null);
	let normEl = $state(null);
	let morphEl = $state(null);
	let ghostEls = $state([]);

	let engine = null;
	let ready = $state(false);

	// --- Viewport -----------------------------------------------------------
	// The viewBox aspect ratio is kept identical to the container's, which is
	// what makes screen->SVG maths exact. Letterboxing was why the old pan and
	// zoom-to-cursor drifted away from the pointer.
	let view = $state({ x: 0, y: 0, w: 1200, h: 700 });
	let boxW = $state(1200);
	let boxH = $state(700);

	/** SVG units per CSS pixel — handles stay the same on-screen size at any zoom. */
	const unit = $derived(boxW > 0 ? view.w / boxW : 1);

	const scene = $derived(activeScene());
	const layout = $derived(activeLayout());
	const track = $derived(activeTrack());

	/**
	 * Preview mode drops the editor's free viewBox and frames the layout exactly,
	 * with the layout's own fit — so what you see is the crop a visitor gets, not
	 * wherever you happened to pan to.
	 */
	const viewBox = $derived(
		ui.preview && layout
			? `0 0 ${layout.viewBox.w} ${layout.viewBox.h}`
			: `${view.x} ${view.y} ${view.w} ${view.h}`
	);
	const aspect = $derived(ui.preview && layout ? `xMidYMid ${layout.fit}` : 'none');

	const pathD = $derived(
		track ? buildPathD(track.points, track.settings.closedPath, track.settings.loopTension) : ''
	);
	const ghostCount = $derived(
		track?.settings.trail.enabled ? Math.max(0, track.settings.trail.count) : 0
	);
	const ghostSlots = $derived(Array.from({ length: ghostCount }, (_, i) => i));

	let markerPoints = $state([]);
	let drag = $state(null);
	let panning = $state(false);
	let panFrom = { x: 0, y: 0, viewX: 0, viewY: 0 };

	onMount(() => {
		hydrateAssets();
		engine = createEngine();
		engine.onFrame((progress) => {
			ui.progress = progress;
		});
		// Exposed on a plain (non-reactive) object so the transport controls can
		// drive the timeline imperatively. Pushing progress back through reactive
		// state instead would fight the engine's own onFrame writes.
		controls.seek = (p) => engine?.seek(p);
		controls.restart = () => engine?.restart();
		controls.resetView = resetView;

		const ro = new ResizeObserver(([entry]) => {
			const r = entry.contentRect;
			if (!r.width || !r.height) return;
			boxW = r.width;
			boxH = r.height;
			// Preserve the horizontal span, re-derive height from the new aspect.
			view.h = view.w * (r.height / r.width);
		});
		ro.observe(host);
		ready = true;

		return () => {
			ro.disconnect();
			engine?.destroy();
			engine = null;
			controls.seek = null;
			controls.restart = null;
			controls.resetView = null;
		};
	});

	// Marker dots live on the rendered path, so this has to run after the DOM
	// update that applies the new `d` — which is exactly when $effect fires.
	$effect(() => {
		const d = pathD;
		const positions = track ? track.markers.map((m) => m.progress) : [];
		if (!pathEl || !d) return;
		markerPoints = positions.map((p) => pointAt(pathEl, p));
	});

	// Rebuild the whole animation whenever the project changes. Reading every
	// nested field is what subscribes to it; `trackDeep` walks the object without
	// allocating, where $state.snapshot would deep-clone on every drag frame.
	function trackDeep(value, depth = 0) {
		if (depth > 6 || !value || typeof value !== 'object') return;
		for (const key in value) trackDeep(value[key], depth + 1);
	}

	$effect(() => {
		const d = pathD;
		trackDeep(track);
		trackDeep(scene?.loop);
		const loopKey = `${scene?.loop}|${scene?.yoyo}`;
		// `__measured` is the hydration signature: path data plus every adjust
		// field. Keying on `d` alone missed orientation edits entirely.
		const assetKey = project.assets.map((a) => a.id + a.__measured).join('|');
		const ghosts = ghostEls.slice(0, ghostCount);

		if (!ready || !engine || !pathEl || !d || !track || !scene || !assetKey || !loopKey) return;

		untrack(() => {
			try {
				const result = engine.build(
					{
						path: pathEl,
						placer: placerEl,
						life: lifeEl,
						fx: fxEl,
						size: sizeEl,
						orient: orientEl,
						norm: normEl,
						morph: morphEl,
						ghosts
					},
					{ track, assets: project.assets, scene },
					{ restore: ui.progress, playing: ui.isPlaying }
				);
				if (result) {
					ui.duration = result.duration;
					ui.stops = result.stops;
					ui.engineError = null;
				}
			} catch (err) {
				ui.engineError = err?.message ?? String(err);
				console.error('[webmotion] build failed', err);
			}
		});
	});

	$effect(() => {
		const playing = ui.isPlaying;
		untrack(() => engine?.setPlaying(playing));
	});

	// --- Screen <-> SVG -----------------------------------------------------
	function toSvg(event) {
		const point = svgEl.createSVGPoint();
		point.x = event.clientX;
		point.y = event.clientY;
		return point.matrixTransform(svgEl.getScreenCTM().inverse());
	}

	function handleWheel(event) {
		const factor = event.deltaY > 0 ? 1.12 : 1 / 1.12;
		const next = view.w * factor;
		if (next < 120 || next > 20000) return;

		const p = toSvg(event);
		view.x = p.x - (p.x - view.x) * factor;
		view.y = p.y - (p.y - view.y) * factor;
		view.w = next;
		// Re-derive rather than multiply: the exact screen<->SVG mapping depends on
		// the viewBox aspect matching the container's, and repeated multiplication
		// drifts away from it.
		view.h = boxW > 0 ? next * (boxH / boxW) : next;
	}

	function resetView() {
		view.x = 0;
		view.y = 0;
		view.w = 1200;
		view.h = 1200 * (boxH / boxW);
	}

	// --- Editing ------------------------------------------------------------
	function handlePointerDown(event) {
		if (event.button === 1 || event.altKey) {
			panning = true;
			panFrom = { x: event.clientX, y: event.clientY, viewX: view.x, viewY: view.y };
			svgEl.setPointerCapture(event.pointerId);
			event.preventDefault();
			return;
		}
		if (event.button !== 0) return;

		if (!track) return;
		const el = event.target;
		const type = el.dataset?.type;
		const index = Number(el.dataset?.index);

		if (type === 'marker') {
			ui.selectedMarkerId = track.markers[index]?.id ?? null;
			ui.selectedPointIndex = null;
			drag = { kind: 'marker', index };
			svgEl.setPointerCapture(event.pointerId);
			return;
		}
		if (type === 'anchor' || type === 'in' || type === 'out') {
			if (type === 'anchor') {
				ui.selectedPointIndex = index;
				ui.selectedMarkerId = null;
			}
			drag = { kind: type, index };
			svgEl.setPointerCapture(event.pointerId);
			return;
		}

		const p = toSvg(event);
		if (ui.mode === 'add') {
			addPoint(p.x, p.y);
		} else if (ui.mode === 'marker') {
			addMarker(p.x, p.y);
		} else {
			ui.selectedMarkerId = null;
			ui.selectedPointIndex = null;
		}
	}

	function handlePointerMove(event) {
		if (panning) {
			view.x = panFrom.viewX - (event.clientX - panFrom.x) * unit;
			view.y = panFrom.viewY - (event.clientY - panFrom.y) * (view.h / boxH);
			return;
		}
		if (!drag || !track) return;

		const p = toSvg(event);
		if (drag.kind === 'marker') {
			const marker = track.markers[drag.index];
			if (marker) marker.progress = projectToPath(pathEl, p.x, p.y);
			return;
		}

		const point = track.points[drag.index];
		if (!point) return;

		if (drag.kind === 'anchor') {
			point.x = p.x;
			point.y = p.y;
		} else if (drag.kind === 'in') {
			point.inX = p.x - point.x;
			point.inY = p.y - point.y;
			if (!event.altKey) {
				point.outX = -point.inX;
				point.outY = -point.inY;
			}
		} else if (drag.kind === 'out') {
			point.outX = p.x - point.x;
			point.outY = p.y - point.y;
			if (!event.altKey) {
				point.inX = -point.outX;
				point.inY = -point.outY;
			}
		}
	}

	function handlePointerUp(event) {
		if (svgEl?.hasPointerCapture?.(event.pointerId)) {
			svgEl.releasePointerCapture(event.pointerId);
		}
		panning = false;
		drag = null;
	}

	function addPoint(x, y) {
		const last = track.points[track.points.length - 1];
		// Continue in the direction of travel so a new point curves in smoothly
		// instead of appearing with flat, arbitrary handles.
		const dx = last ? x - last.x : 120;
		const dy = last ? y - last.y : 0;
		const len = Math.hypot(dx, dy) || 1;
		const reach = Math.min(len * 0.35, 180);
		const ux = (dx / len) * reach;
		const uy = (dy / len) * reach;

		track.points = [...track.points, makePoint({ x, y, inX: -ux, inY: -uy, outX: ux, outY: uy })];
	}

	function addMarker(x, y) {
		const progress = projectToPath(pathEl, x, y);
		const marker = makeMarker(clamp01(progress));
		track.markers = [...track.markers, marker];
		ui.selectedMarkerId = marker.id;
		ui.mode = 'edit';
	}

	function handleKey(event) {
		if (event.target instanceof HTMLInputElement) return;
		if (event.target instanceof HTMLTextAreaElement) return;
		if (event.target instanceof HTMLSelectElement) return;
		// Never steal a browser shortcut: Ctrl+P must print, Cmd+V must paste.
		if (event.ctrlKey || event.metaKey) return;
		// A modal owns the keyboard while it is open.
		if (event.target instanceof Element && event.target.closest('[data-modal]')) return;
		if (document.querySelector('[data-modal]')) return;

		if (event.key === 'Delete' || event.key === 'Backspace') {
			if (!track) return;
			if (ui.selectedMarkerId) {
				track.markers = track.markers.filter((m) => m.id !== ui.selectedMarkerId);
				ui.selectedMarkerId = null;
				event.preventDefault();
			} else if (ui.selectedPointIndex !== null && track.points.length > 2) {
				track.points = track.points.filter((_, i) => i !== ui.selectedPointIndex);
				ui.selectedPointIndex = null;
				event.preventDefault();
			}
		} else if (event.key === ' ') {
			ui.isPlaying = !ui.isPlaying;
			event.preventDefault();
		} else if (event.key === '0') {
			resetView();
		} else if (event.key === 'v' || event.key === 'V') {
			ui.mode = 'edit';
		} else if (event.key === 'p' || event.key === 'P') {
			ui.mode = 'add';
		} else if (event.key === 'm' || event.key === 'M') {
			ui.mode = 'marker';
		}
	}
</script>

<svelte:window onkeydown={handleKey} />

<div bind:this={host} class="relative h-full w-full overflow-hidden bg-ink">
	<svg
		bind:this={svgEl}
		role="application"
		aria-label="Motion path canvas"
		class="block h-full w-full {panning
			? 'cursor-grabbing'
			: ui.mode === 'edit'
				? 'cursor-default'
				: 'cursor-crosshair'}"
		{viewBox}
		preserveAspectRatio={aspect}
		onpointerdown={ui.preview ? undefined : handlePointerDown}
		onpointermove={ui.preview ? undefined : handlePointerMove}
		onpointerup={ui.preview ? undefined : handlePointerUp}
		onpointercancel={ui.preview ? undefined : handlePointerUp}
		onwheel={ui.preview
			? undefined
			: (e) => {
					e.preventDefault();
					handleWheel(e);
				}}
	>
		<defs>
			<pattern id="grid-cell" width="40" height="40" patternUnits="userSpaceOnUse">
				<path d="M40 0 L0 0 0 40" fill="none" stroke="#30363d" stroke-width="1" />
			</pattern>
		</defs>

		{#if ui.preview && layout?.background}
			<image
				href={layout.background}
				x="0"
				y="0"
				width={layout.viewBox.w}
				height={layout.viewBox.h}
				preserveAspectRatio="xMidYMid slice"
			/>
		{:else if ui.preview}
			<rect x="0" y="0" width={layout?.viewBox.w ?? 0} height={layout?.viewBox.h ?? 0} fill="#0d1117" />
		{:else if layout?.background}
			<image
				href={layout.background}
				x="0"
				y="0"
				width={layout.viewBox.w}
				height={layout.viewBox.h}
				preserveAspectRatio="xMidYMid slice"
				opacity="0.45"
			/>
		{:else}
			<rect x="-6000" y="-6000" width="14000" height="14000" fill="url(#grid-cell)" />
		{/if}
		{#if !ui.preview}
		{#if layout}
			<rect
				x="0"
				y="0"
				width={layout.viewBox.w}
				height={layout.viewBox.h}
				fill="none"
				stroke="#30363d"
				stroke-width={unit}
				stroke-dasharray="{10 * unit} {6 * unit}"
			/>
		{/if}

		<!-- Motion path: a soft halo under the dashed guide line. -->
		<path d={pathD} fill="none" stroke="rgba(88,166,255,0.18)" stroke-width={9 * unit} stroke-linecap="round" />
		<path
			bind:this={pathEl}
			d={pathD}
			fill="none"
			stroke="#58a6ff"
			stroke-width={2 * unit}
			stroke-linecap="round"
			stroke-linejoin="round"
			stroke-dasharray="{7 * unit} {7 * unit}"
			opacity="0.85"
		/>

		<!-- Handles -->
		{#each track?.points ?? [] as point, i (point.id)}
			{@const showIn = i > 0 || track.settings.closedPath}
			{@const showOut = i < track.points.length - 1 || track.settings.closedPath}
			{#if showIn}
				<line
					x1={point.x}
					y1={point.y}
					x2={point.x + point.inX}
					y2={point.y + point.inY}
					stroke="#6e7681"
					stroke-width={1.2 * unit}
					stroke-dasharray="{4 * unit} {4 * unit}"
				/>
				<circle
					cx={point.x + point.inX}
					cy={point.y + point.inY}
					r={6 * unit}
					fill="#a371f7"
					stroke="#0d1117"
					stroke-width={1.5 * unit}
					class="cursor-grab"
					data-type="in"
					data-index={i}
				/>
			{/if}
			{#if showOut}
				<line
					x1={point.x}
					y1={point.y}
					x2={point.x + point.outX}
					y2={point.y + point.outY}
					stroke="#6e7681"
					stroke-width={1.2 * unit}
					stroke-dasharray="{4 * unit} {4 * unit}"
				/>
				<circle
					cx={point.x + point.outX}
					cy={point.y + point.outY}
					r={6 * unit}
					fill="#a371f7"
					stroke="#0d1117"
					stroke-width={1.5 * unit}
					class="cursor-grab"
					data-type="out"
					data-index={i}
				/>
			{/if}
			<circle
				cx={point.x}
				cy={point.y}
				r={8 * unit}
				fill={ui.selectedPointIndex === i ? '#ffffff' : '#f2cc60'}
				stroke="#0d1117"
				stroke-width={2 * unit}
				class="cursor-grab"
				data-type="anchor"
				data-index={i}
			/>
		{/each}

		<!-- Markers -->
		{#each track?.markers ?? [] as marker, i (marker.id)}
			{@const at = markerPoints[i]}
			{#if at}
				<g class="cursor-pointer" data-type="marker" data-index={i}>
					<circle
						cx={at.x}
						cy={at.y}
						r={13 * unit}
						fill="transparent"
						data-type="marker"
						data-index={i}
					/>
					<circle
						cx={at.x}
						cy={at.y}
						r={7 * unit}
						fill={ui.selectedMarkerId === marker.id ? '#ffffff' : '#ff7b72'}
						stroke={ui.selectedMarkerId === marker.id ? '#58a6ff' : '#0d1117'}
						stroke-width={2.5 * unit}
						data-type="marker"
						data-index={i}
					/>
					{#if marker.hold > 0}
						<circle
							cx={at.x}
							cy={at.y}
							r={12 * unit}
							fill="none"
							stroke="#ff7b72"
							stroke-width={1.2 * unit}
							stroke-dasharray="{3 * unit} {3 * unit}"
							opacity="0.7"
							data-type="marker"
							data-index={i}
						/>
					{/if}
				</g>
			{/if}
		{/each}

		{/if}

		<!-- Animated object. Each wrapper owns exactly one concern so GSAP never
		     has two things fighting over the same transform. -->
		<g class="pointer-events-none">
			{#each ghostSlots as i (i)}
				<g
					bind:this={ghostEls[i]}
					opacity={(track?.settings.trail.opacity ?? 0.3) * (1 - i / (ghostCount + 1))}
				>
					<use href="#gasp-body" />
				</g>
			{/each}

			<!-- Class names match the exported markup, so what you see here and what
			     the generated code drives are the same structure. -->
			<g bind:this={placerEl} class="gasp-place">
				<g bind:this={lifeEl} class="gasp-life">
					<g bind:this={fxEl} id="gasp-body" class="gasp-fx">
						<g bind:this={sizeEl} class="gasp-size">
							<g bind:this={orientEl} class="gasp-orient">
								<g bind:this={normEl} class="gasp-norm">
									<path
										bind:this={morphEl}
										class="gasp-shape"
										d=""
										fill="none"
										stroke="#e6edf3"
										stroke-width="2"
										stroke-linecap="round"
										stroke-linejoin="round"
										vector-effect="non-scaling-stroke"
									/>
								</g>
							</g>
						</g>
					</g>
				</g>
			</g>
		</g>
	</svg>

	{#if !ui.preview}
	<div class="pointer-events-none absolute bottom-3 left-3 flex gap-2 text-[10px] text-muted">
		<span class="rounded bg-panel/90 px-2 py-1">Alt+drag pan · wheel zoom · 0 reset</span>
		<span class="rounded bg-panel/90 px-2 py-1">Del removes selection · Space plays</span>
	</div>
	{/if}

	{#if ui.engineError}
		<div
			class="absolute top-3 left-3 max-w-md rounded border border-danger/60 bg-danger/15 px-3 py-2 text-xs text-danger"
		>
			{ui.engineError}
		</div>
	{/if}
</div>
