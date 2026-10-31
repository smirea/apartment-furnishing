<script lang="ts">
	import type { CatalogItem, Placement } from '@repo/shared/items';
	import { createMutation, createQuery, useQueryClient } from '@tanstack/svelte-query';
	import { onMount, tick } from 'svelte';
	import { createViewer, type Mode } from '../lib/scene';

	// Living room, clear of the island and the column.
	const SPAWN = { x: 15.5, z: 28 };
	const SAVE_DELAY_MS = 300;

	let container: HTMLDivElement;
	let mode = $state<Mode>('orbit');
	const OPTIONS_KEY = 'viewer-options';
	const saved = JSON.parse(localStorage.getItem(OPTIONS_KEY) ?? '{}');
	let cutaway = $state<boolean>(saved.cutaway ?? true);
	let labels = $state<boolean>(saved.labels ?? false);
	let viewer = $state<ReturnType<typeof createViewer>>();

	async function api<T>(path: string, init?: RequestInit): Promise<T> {
		const res = await fetch(path, { ...init, headers: { 'content-type': 'application/json' } });
		const body = await res.json();
		if (!res.ok) throw new Error(body.error ?? `${res.status} ${res.statusText}`);
		return body;
	}

	const queryClient = useQueryClient();
	const catalogQuery = createQuery(() => ({
		queryKey: ['catalog'],
		queryFn: () => api<CatalogItem[]>('/api/catalog'),
	}));
	const catalogList = $derived(catalogQuery.data ?? []);
	const catalog = $derived(Object.fromEntries(catalogList.map(item => [item.id, item])));

	let placements = $state<Placement[]>([]);
	let placementsLoaded = false;
	let saveTimer: ReturnType<typeof setTimeout> | undefined;
	function updatePlacements(next: Placement[]) {
		placements = next;
		clearTimeout(saveTimer);
		saveTimer = setTimeout(
			() => void api('/api/placements', { method: 'PUT', body: JSON.stringify($state.snapshot(placements)) }),
			SAVE_DELAY_MS,
		);
	}
	function patchPlacement(key: string, patch: Partial<Placement>) {
		updatePlacements(placements.map(p => (p.key === key ? { ...p, ...patch } : p)));
	}

	let selectedKey = $state<string | null>(null);
	const selectedPlacement = $derived(placements.find(p => p.key === selectedKey) ?? null);
	const selected = $derived(selectedPlacement ? catalog[selectedPlacement.itemId] : null);
	const placedCount = (itemId: string) => placements.filter(p => p.itemId === itemId).length;
	const inches = (n: number) => `${Math.round(n * 10) / 10}"`;
	const money = (item: CatalogItem) =>
		item.price === null ? null : item.price.toLocaleString('en-US', { style: 'currency', currency: item.currency });

	async function addToRoom(itemId: string) {
		const key = crypto.randomUUID();
		const elevation = (catalog[itemId]?.defaultElevationIn ?? 0) / 12;
		viewer?.snapWhenLoaded(key);
		updatePlacements([...placements, { key, itemId, position: [SPAWN.x, elevation, SPAWN.z], rotation: [0, 0, 0] }]);
		await tick();
		viewer?.select(key);
	}

	function rotate(delta: number) {
		if (!selectedPlacement) return;
		const [rx, ry, rz] = selectedPlacement.rotation;
		const deg = ((((ry + delta + 180) % 360) + 360) % 360) - 180;
		patchPlacement(selectedPlacement.key, { rotation: [rx, deg, rz] });
	}

	let gizmo = $state<'translate' | 'rotate'>('translate');
	$effect(() => viewer?.setGizmoMode(gizmo));
	const mountLabel = {
		floor: 'Stands on the floor',
		wall: 'Wall-mounted',
		ceiling: 'Hangs from the ceiling',
		surface: 'Sits on a surface',
	};

	function removeSelected() {
		if (!selectedKey) return;
		updatePlacements(placements.filter(p => p.key !== selectedKey));
		selectedKey = null;
	}

	let importUrl = $state('');
	const importMutation = createMutation(() => ({
		mutationFn: (url: string) =>
			api<CatalogItem>('/api/catalog/import', { method: 'POST', body: JSON.stringify({ url }) }),
		onSuccess: async (item: CatalogItem) => {
			importUrl = '';
			await queryClient.invalidateQueries({ queryKey: ['catalog'] });
			await addToRoom(item.id);
		},
	}));

	function onKey(e: KeyboardEvent) {
		if (!selectedKey || mode !== 'orbit' || (e.target as HTMLElement).closest('input, textarea')) return;
		if (e.key === 't' || e.key === 'T') gizmo = 'translate';
		else if (e.key === 'r' || e.key === 'R') gizmo = 'rotate';
		else if (e.key === 'Delete' || e.key === 'Backspace') removeSelected();
		else if (e.key === 'Escape') viewer?.select(null);
	}

	onMount(() => {
		const v = createViewer(
			container,
			next => (mode = next),
			key => (selectedKey = key),
			(key, position, rotation) => patchPlacement(key, { position, rotation }),
		);
		viewer = v;
		void api<Placement[]>('/api/placements').then(data => {
			placements = data;
			placementsLoaded = true;
		});
		return () => v.dispose();
	});

	$effect(() => viewer?.setCutaway(cutaway));
	$effect(() => viewer?.setLabels(labels));
	$effect(() => {
		if (viewer && (placementsLoaded || placements.length)) viewer.setPlacements($state.snapshot(placements), catalog);
	});
	$effect(() => localStorage.setItem(OPTIONS_KEY, JSON.stringify({ cutaway, labels })));
</script>

<svelte:window onkeydown={onKey} />

<svelte:head>
	<title>84 East Ave #2209</title>
</svelte:head>

<div class="viewer" bind:this={container}></div>

<div class="left">
	<header class="panel hud">
		<h1>84 East Ave #2209 <span>Vesper B4 · 1,176 sqft</span></h1>
		<div class="actions">
			<button type="button" class="primary" onclick={() => viewer?.setMode(mode === 'orbit' ? 'walk' : 'orbit')}>
				{mode === 'orbit' ? 'Walk inside' : 'Back to overview'}
			</button>
			{#if mode === 'orbit'}
				<label><input type="checkbox" bind:checked={cutaway} /> Cutaway walls</label>
				<label><input type="checkbox" bind:checked={labels} /> Room labels</label>
			{/if}
		</div>
		<p class="help">
			{#if mode === 'orbit'}
				Drag the room to rotate, right-drag to pan, scroll to zoom. Drag an item to slide it, or use its gizmo (T move,
				R rotate). Items snap to walls, floors and surfaces.
			{:else}
				WASD or arrows to move, mouse to look, click to inspect, Shift to run, Esc to exit.
			{/if}
		</p>
	</header>

	{#if mode === 'orbit'}
		<section class="panel items">
			<form
				class="import"
				onsubmit={e => {
					e.preventDefault();
					if (importUrl.trim()) importMutation.mutate(importUrl.trim());
				}}
			>
				<input
					type="url"
					placeholder="Paste an Amazon or Walmart link"
					bind:value={importUrl}
					disabled={importMutation.isPending}
				/>
				<button type="submit" class="primary" disabled={importMutation.isPending || !importUrl.trim()}>
					{importMutation.isPending ? 'Importing…' : 'Import'}
				</button>
			</form>
			{#if importMutation.isPending}
				<p class="muted">Reading the page and downloading the model. This takes about a minute.</p>
			{:else if importMutation.isError}
				<p class="error">{importMutation.error.message}</p>
			{/if}

			<ul>
				{#each catalogList as item (item.id)}
					<li>
						{#if item.image}<img src={item.image} alt="" />{:else}<span class="thumb"></span>{/if}
						<div>
							<strong>{item.name}</strong>
							<span class="muted">
								{money(item) ?? ''}{#if item.model}
									· 3D{/if}{#if placedCount(item.id)}
									· {placedCount(item.id)} placed{/if}
							</span>
						</div>
						<button type="button" onclick={() => addToRoom(item.id)}>Add</button>
					</li>
				{:else}
					<li class="muted">{catalogQuery.isPending ? 'Loading…' : 'No items yet. Paste a link above.'}</li>
				{/each}
			</ul>
		</section>
	{/if}
</div>

{#if selected && selectedPlacement}
	<aside class="panel card">
		<button type="button" class="close" aria-label="Close" onclick={() => viewer?.select(null)}>×</button>
		{#if selected.image}<img src={selected.image} alt={selected.name} />{/if}
		<h2>{selected.name}</h2>
		<p class="meta">
			{#if money(selected)}<strong>{money(selected)}</strong>{/if}
			{#if selected.brand}<span>{selected.brand}</span>{/if}
			<span>{mountLabel[selected.mount]}</span>
		</p>
		{#if selected.dimensions}
			<p class="dims">
				{inches(selected.dimensions.width)} W × {inches(selected.dimensions.height)} H × {inches(
					selected.dimensions.depth,
				)} D{#if selected.weightLb}
					· {selected.weightLb} lb{/if}
			</p>
			{#if selected.dimensionsNote}<p class="note">{selected.dimensionsNote}</p>{/if}
		{/if}

		<div class="controls">
			<div class="row">
				<span>Gizmo</span>
				<button type="button" class:active={gizmo === 'translate'} onclick={() => (gizmo = 'translate')}
					>Move (T)</button
				>
				<button type="button" class:active={gizmo === 'rotate'} onclick={() => (gizmo = 'rotate')}>Rotate (R)</button>
			</div>
			<div class="row">
				<span>Turn</span>
				<button type="button" onclick={() => rotate(-90)}>↺ 90°</button>
				<button type="button" onclick={() => rotate(-15)}>−15°</button>
				<button type="button" onclick={() => rotate(15)}>+15°</button>
				<button type="button" onclick={() => rotate(90)}>↻ 90°</button>
			</div>
			<label class="row">
				<span>Height off floor</span>
				<input
					type="number"
					min="0"
					max="100"
					step="1"
					value={Math.round(selectedPlacement.position[1] * 12 * 10) / 10}
					oninput={e => {
						const [x, , z] = selectedPlacement.position;
						patchPlacement(selectedPlacement.key, { position: [x, (Number(e.currentTarget.value) || 0) / 12, z] });
					}}
				/>
				<span class="muted">in</span>
			</label>
			<div class="row">
				<button type="button" onclick={() => addToRoom(selected.id)}>Add another</button>
				<button type="button" class="danger" onclick={removeSelected}>Remove from room</button>
			</div>
		</div>

		<p>{selected.summary}</p>
		{#if selected.highlights.length}
			<ul>
				{#each selected.highlights as h (h)}<li>{h}</li>{/each}
			</ul>
		{/if}
		<a href={selected.url} target="_blank" rel="noreferrer"
			>View on {new URL(selected.url).hostname.replace('www.', '')} ↗</a
		>
	</aside>
{/if}

<style>
	.viewer {
		position: fixed;
		inset: 0;
		background: var(--app-bg);
	}

	.left {
		position: fixed;
		top: 1rem;
		left: 1rem;
		bottom: 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		width: 22rem;
		pointer-events: none;
	}

	.panel {
		padding: 1rem;
		border: 1px solid var(--app-border);
		border-radius: 0.5rem;
		background: color-mix(in srgb, var(--app-panel) 92%, transparent);
		color: var(--app-panel-text);
		pointer-events: auto;
	}

	.hud {
		display: grid;
		gap: 0.75rem;
	}

	.items {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		min-height: 0;
		font-size: 0.85rem;
	}

	.import {
		display: flex;
		gap: 0.5rem;
	}

	.import input {
		flex: 1;
		min-width: 0;
	}

	input[type='url'],
	input[type='number'] {
		border: 1px solid var(--app-border);
		border-radius: 0.375rem;
		padding: 0.45rem 0.6rem;
		background: var(--app-bg);
		color: var(--app-text);
	}

	input[type='number'] {
		width: 4.5rem;
	}

	.items ul {
		display: grid;
		gap: 0.5rem;
		margin: 0;
		padding: 0;
		overflow-y: auto;
		list-style: none;
	}

	.items li {
		display: grid;
		grid-template-columns: 3rem 1fr auto;
		gap: 0.6rem;
		align-items: center;
	}

	.items li img,
	.items .thumb {
		width: 3rem;
		height: 3rem;
		border-radius: 0.25rem;
		background: #fff;
		object-fit: contain;
	}

	.items li div {
		display: grid;
		min-width: 0;
	}

	.items li strong {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.items li button {
		padding: 0.3rem 0.7rem;
	}

	.muted {
		margin: 0;
		color: var(--app-muted);
	}

	.error {
		margin: 0;
		color: var(--app-error);
	}

	.controls {
		display: grid;
		gap: 0.5rem;
		padding: 0.6rem 0;
		border-block: 1px solid var(--app-border);
	}

	.controls .row {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4rem;
		align-items: center;
	}

	.controls .row > span:first-child {
		min-width: 3.5rem;
		color: var(--app-muted);
	}

	.controls button {
		padding: 0.3rem 0.6rem;
	}

	button.active {
		border-color: var(--app-accent);
		color: var(--app-accent);
	}

	button.danger {
		border-color: var(--app-error);
		color: var(--app-error);
	}

	button:disabled {
		opacity: 0.5;
		cursor: default;
	}

	h1 {
		margin: 0;
		font-size: 1.05rem;
		font-weight: 650;
	}

	h1 span {
		display: block;
		color: var(--app-muted);
		font-size: 0.8rem;
		font-weight: 500;
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.75rem;
		font-size: 0.875rem;
	}

	.help {
		margin: 0;
		color: var(--app-muted);
		font-size: 0.8rem;
	}

	button {
		border: 1px solid var(--app-border);
		border-radius: 0.375rem;
		padding: 0.5rem 1rem;
		background: transparent;
		color: var(--app-text);
		font-weight: 600;
		cursor: pointer;
	}

	button.primary {
		border-color: var(--app-accent);
		background: var(--app-accent);
		color: var(--app-accent-ink);
	}

	.card {
		position: fixed;
		top: 1rem;
		right: 1rem;
		display: grid;
		gap: 0.6rem;
		width: 20rem;
		max-height: calc(100vh - 2rem);
		overflow-y: auto;
		padding: 1rem;
		border: 1px solid var(--app-border);
		border-radius: 0.5rem;
		background: color-mix(in srgb, var(--app-panel) 94%, transparent);
		color: var(--app-panel-text);
		font-size: 0.85rem;
	}

	.card img {
		width: 100%;
		max-height: 12rem;
		object-fit: contain;
		border-radius: 0.375rem;
		background: #fff;
	}

	.card h2 {
		margin: 0;
		padding-right: 1.5rem;
		font-size: 1rem;
	}

	.card p,
	.card ul {
		margin: 0;
	}

	.card ul {
		padding-left: 1.1rem;
		color: var(--app-muted);
	}

	.card .meta {
		display: flex;
		gap: 0.75rem;
		align-items: baseline;
	}

	.card .meta span,
	.card .note {
		color: var(--app-muted);
	}

	.card .note {
		font-size: 0.75rem;
	}

	.card .close {
		position: absolute;
		top: 0.5rem;
		right: 0.5rem;
		padding: 0 0.5rem;
		border: none;
		font-size: 1.25rem;
	}

	.card a {
		color: var(--app-accent);
		font-weight: 600;
	}

	:global(.room-label) {
		display: grid;
		justify-items: center;
		padding: 0.15rem 0.4rem;
		border-radius: 0.25rem;
		background: rgb(0 0 0 / 0.55);
		color: #fff;
		font-size: 0.7rem;
		font-weight: 600;
		white-space: nowrap;
	}

	:global(.room-label small) {
		font-weight: 400;
		opacity: 0.75;
	}
</style>
