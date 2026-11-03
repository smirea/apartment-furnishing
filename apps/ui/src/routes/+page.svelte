<script lang="ts">
	import { finishAreasIn } from '@repo/shared/floorplan';
	import {
		panelsNeeded,
		TV_RATIOS,
		tvDiagonal,
		tvSize,
		type TvModel,
		type TvSettings,
		type CatalogEntry,
		type CatalogItem,
		type Finishes,
		type FinishSurface,
		type Placement,
		type WallTexture,
		type WallTextureEntry,
	} from '@repo/shared/items';
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
	let open = $state<{ furniture: boolean; textures: boolean; tv: boolean; ideas: boolean }>({
		furniture: true,
		textures: true,
		tv: true,
		ideas: false,
		...saved.open,
	});
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
		queryFn: () => api<CatalogEntry[]>('/api/catalog'),
		refetchInterval: query => (query.state.data?.some(item => item.modelJob?.state === 'running') ? 3000 : false),
	}));
	const catalogList = $derived(catalogQuery.data ?? []);
	const catalog = $derived(Object.fromEntries(catalogList.map(item => [item.id, item])));

	const ideasQuery = createQuery(() => ({
		queryKey: ['ideas'],
		queryFn: async () => {
			const res = await fetch('/api/ideas');
			if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
			return res.text();
		},
		enabled: open.ideas,
	}));

	const texturesQuery = createQuery(() => ({
		queryKey: ['textures'],
		queryFn: () => api<WallTextureEntry[]>('/api/textures'),
		refetchInterval: query =>
			query.state.data?.some(t => t.textureJob && t.textureJob.state !== 'failed') ? 3000 : false,
	}));
	const textureList = $derived(texturesQuery.data ?? []);
	const finishesQuery = createQuery(() => ({
		queryKey: ['finishes'],
		queryFn: () => api<Finishes>('/api/finishes'),
	}));
	const finishes = $derived(finishesQuery.data ?? { tvWall: null, column: null });
	const finishMutation = createMutation(() => ({
		mutationFn: (patch: Partial<Finishes>) =>
			api<Finishes>('/api/finishes', { method: 'PUT', body: JSON.stringify(patch) }),
		onSuccess: (next: Finishes) => queryClient.setQueryData(['finishes'], next),
	}));
	// Swatches show the tile at a fixed scale so slat widths compare across products.
	const SWATCH_PX_PER_FT = 40;
	const textureGroups = $derived(
		Object.entries(Object.groupBy(textureList, t => t.group ?? 'Other'))
			.map(([group, items]) => [group, items!.toSorted((a, b) => a.name.localeCompare(b.name))] as const)
			.toSorted(([a], [b]) => a.localeCompare(b)),
	);
	// One texture dresses both the TV wall and the column.
	const applied = (t: WallTexture) => finishes.tvWall === t.id || finishes.column === t.id;
	function clickSwatch(t: WallTextureEntry) {
		if (t.texture && t.textureJob?.state !== 'failed') {
			const id = applied(t) ? null : t.id;
			finishMutation.mutate({ tvWall: id, column: id });
		} else if (!t.textureJob || t.textureJob.state === 'failed') textureGenerate.mutate(t.id);
	}
	let tip = $state<{ texture: WallTextureEntry; x: number; y: number } | null>(null);
	function showTip(texture: WallTextureEntry, el: HTMLElement) {
		const r = el.getBoundingClientRect();
		const width = 288;
		const x = r.right + 8 + width > innerWidth ? Math.max(8, r.left - width - 8) : r.right + 8;
		tip = { texture, x: Math.min(x, innerWidth - width - 8), y: Math.max(8, Math.min(r.top, innerHeight - 300)) };
	}

	let textureUrl = $state('');
	const textureImport = createMutation(() => ({
		mutationFn: (url: string) =>
			api<WallTexture>('/api/textures/import', { method: 'POST', body: JSON.stringify({ url }) }),
		onSuccess: async () => {
			textureUrl = '';
			await queryClient.invalidateQueries({ queryKey: ['textures'] });
		},
	}));
	const textureGenerate = createMutation(() => ({
		mutationFn: (id: string) => api(`/api/textures/${id}/generate`, { method: 'POST' }),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ['textures'] }),
	}));

	function estimate(t: WallTexture, surface: FinishSurface) {
		if (!t.panel) return null;
		const panels = panelsNeeded(t.panel, finishAreasIn[surface]);
		const packs = Math.ceil(panels / t.panelsPerPack);
		const cost =
			t.price === null
				? ''
				: ` ≈ ${(packs * t.price).toLocaleString('en-US', { style: 'currency', currency: t.currency, maximumFractionDigits: 0 })}`;
		return `${panels} panels${cost}`;
	}

	let placements = $state<Placement[]>([]);
	let placementsLoaded = false;
	let saveTimer: ReturnType<typeof setTimeout> | undefined;
	// Keys edited here and not yet saved. Only these are sent, and polls wait until they are, so the AR app's moves
	// are neither overwritten by this tab's older copy nor reverted on screen.
	const unsaved = new Set<string>();
	let saving: Promise<unknown> = Promise.resolve();
	function updatePlacements(next: Placement[]) {
		for (const p of next) if (placements.find(old => old.key === p.key) !== p) unsaved.add(p.key);
		for (const p of placements) if (!next.some(n => n.key === p.key)) unsaved.add(p.key);
		placements = next;
		clearTimeout(saveTimer);
		saveTimer = setTimeout(() => {
			saveTimer = undefined;
			const keys = [...unsaved];
			unsaved.clear();
			const byKey = new Map($state.snapshot(placements).map(p => [p.key, p]));
			saving = Promise.all(
				keys.map(key => {
					const placement = byKey.get(key);
					return placement
						? api(`/api/placements/${key}`, { method: 'PUT', body: JSON.stringify(placement) })
						: api(`/api/placements/${key}`, { method: 'DELETE' });
				}),
			);
		}, SAVE_DELAY_MS);
	}
	async function pollPlacements() {
		await saving.catch(() => {});
		const data = await api<Placement[]>('/api/placements');
		if (!saveTimer && !unsaved.size) placements = data;
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

	const generateMutation = createMutation(() => ({
		mutationFn: (id: string) => api(`/api/catalog/${id}/model`, { method: 'POST' }),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ['catalog'] }),
	}));

	let tv = $state<TvSettings | null>(null);
	let tvError = $state<string | null>(null);
	let tvSaveTimer: ReturnType<typeof setTimeout> | undefined;
	function updateTv(patch: Partial<TvSettings>) {
		if (!tv) return;
		tv = { ...tv, ...patch };
		clearTimeout(tvSaveTimer);
		tvSaveTimer = setTimeout(() => {
			api<TvSettings>('/api/tv', { method: 'PUT', body: JSON.stringify($state.snapshot(tv)) }).then(
				() => (tvError = null),
				(error: Error) => (tvError = error.message),
			);
		}, SAVE_DELAY_MS);
	}
	const round1 = (n: number) => Math.round(n * 10) / 10;
	const tvModelsQuery = createQuery(() => ({ queryKey: ['tvs'], queryFn: () => api<TvModel[]>('/api/tvs') }));
	const tvModels = $derived(tvModelsQuery.data ?? []);
	let tvUrl = $state('');
	// Adding a TV link also switches to its size, since that is why it was pasted.
	const tvImport = createMutation(() => ({
		mutationFn: (url: string) => api<TvModel>('/api/tvs/import', { method: 'POST', body: JSON.stringify({ url }) }),
		onSuccess: async (m: TvModel) => {
			tvUrl = '';
			updateTv({ widthIn: m.widthIn, heightIn: m.heightIn });
			await queryClient.invalidateQueries({ queryKey: ['tvs'] });
		},
	}));
	const tvRemove = createMutation(() => ({
		mutationFn: (id: string) => api(`/api/tvs/${id}`, { method: 'DELETE' }),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ['tvs'] }),
	}));
	const positive = (value: string) => (Number(value) > 0 ? Number(value) : null);
	const tvRatio = $derived(
		tv ? TV_RATIOS.findIndex(([w, h]) => Math.abs(tv!.widthIn / tv!.heightIn - w / h) < 0.01) : -1,
	);
	function setDiagonal(value: string) {
		const diagonal = positive(value);
		if (!tv || !diagonal) return;
		const k = diagonal / tvDiagonal(tv);
		updateTv({ widthIn: tv.widthIn * k, heightIn: tv.heightIn * k });
	}

	function onKey(e: KeyboardEvent) {
		if (!selectedKey || mode !== 'orbit' || (e.target as HTMLElement).closest('input, textarea')) return;
		if (e.key === 'Delete' || e.key === 'Backspace') removeSelected();
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
		void api<TvSettings>('/api/tv').then(data => (tv = data));
		void api<Placement[]>('/api/placements').then(data => {
			placements = data;
			placementsLoaded = true;
		});
		const poll = setInterval(() => void pollPlacements().catch(() => {}), 2000);
		return () => {
			clearInterval(poll);
			v.dispose();
		};
	});

	$effect(() => viewer?.setCutaway(cutaway));
	$effect(() => viewer?.setLabels(labels));
	$effect(() => {
		if (viewer && tv) viewer.setTv($state.snapshot(tv));
	});
	$effect(() => {
		if (viewer && (placementsLoaded || placements.length)) viewer.setPlacements($state.snapshot(placements), catalog);
	});
	$effect(() => {
		const byId = Object.fromEntries(textureList.map(t => [t.id, t]));
		viewer?.setFinishes({ tvWall: byId[finishes.tvWall ?? ''] ?? null, column: byId[finishes.column ?? ''] ?? null });
	});
	$effect(() => localStorage.setItem(OPTIONS_KEY, JSON.stringify({ cutaway, labels, open })));
</script>

<svelte:window onkeydown={onKey} />

<svelte:head>
	<title>Apartment</title>
</svelte:head>

<div class="viewer" bind:this={container}></div>

<div class="left">
	<header class="panel hud">
		<h1>Apartment <span>2 bed · 2 bath · 1,176 sqft</span></h1>
		<div class="actions">
			<button type="button" class="primary" onclick={() => viewer?.setMode(mode === 'orbit' ? 'walk' : 'orbit')}>
				{mode === 'orbit' ? 'Walk inside' : 'Back to overview'}
			</button>
			{#if mode === 'orbit'}
				<label><input type="checkbox" bind:checked={cutaway} /> Cutaway walls</label>
				<label><input type="checkbox" bind:checked={labels} /> Room labels</label>
			{/if}
		</div>
		{#if mode === 'walk'}
			<p class="help">WASD or arrows to move, mouse to look, click to inspect, Shift to run, Esc to exit.</p>
		{/if}
	</header>

	{#if mode === 'orbit'}
		<section class="panel items textures">
			<button
				type="button"
				class="section-toggle"
				aria-expanded={open.textures}
				onclick={() => (open.textures = !open.textures)}
			>
				Living room wall texture <span class="muted">{textureList.length}</span>
			</button>
			{#if open.textures}
				{#if finishMutation.isError}
					<p class="error">{finishMutation.error.message}</p>
				{/if}
				{#each textureGroups as [group, items] (group)}
					<h3 class="group">{group} <span class="muted">{items.length}</span></h3>
					<div class="swatches">
						{#each items as t (t.id)}
							<button
								type="button"
								class="swatch"
								class:on-target={applied(t)}
								class:busy={t.textureJob?.state === 'queued' || t.textureJob?.state === 'running'}
								class:failed={t.textureJob?.state === 'failed'}
								style:background-image="url({t.texture?.map ?? t.image})"
								style:background-size={t.texture
									? `${(t.texture.repeat.width / 12) * SWATCH_PX_PER_FT}px auto`
									: 'cover'}
								aria-label={t.name}
								onclick={() => clickSwatch(t)}
								onpointerenter={e => showTip(t, e.currentTarget)}
								onpointerleave={() => (tip = null)}
								onfocus={e => showTip(t, e.currentTarget)}
								onblur={() => (tip = null)}
							>
							</button>
						{/each}
					</div>
				{/each}
				{#if textureImport.isPending}<div class="swatches">
						<span class="swatch busy" aria-label="Importing"></span>
					</div>{/if}
				{#if !textureList.length && !textureImport.isPending}
					<p class="muted">
						{texturesQuery.isPending ? 'Loading…' : 'Paste a wall panel link to cover the TV wall and the column.'}
					</p>
				{/if}
				<form
					class="import"
					onsubmit={e => {
						e.preventDefault();
						if (textureUrl.trim()) textureImport.mutate(textureUrl.trim());
					}}
				>
					<input
						type="url"
						placeholder="Paste a wall panel link"
						bind:value={textureUrl}
						disabled={textureImport.isPending}
					/>
					<button type="submit" class="primary" disabled={textureImport.isPending || !textureUrl.trim()}>
						{textureImport.isPending ? 'Importing…' : 'Import'}
					</button>
				</form>
				{#if textureImport.isError}
					<p class="error">{textureImport.error.message}</p>
				{/if}
			{/if}
		</section>

		<section class="panel items tv">
			<button type="button" class="section-toggle" aria-expanded={open.tv} onclick={() => (open.tv = !open.tv)}>
				TV <span class="muted">{tv ? `${round1(tvDiagonal(tv))}″` : ''}</span>
			</button>
			{#if open.tv && tv}
				<label class="check"
					><input type="checkbox" checked={tv.visible} onchange={e => updateTv({ visible: e.currentTarget.checked })} />
					On the TV wall</label
				>
				<div class="tv-fields">
					<label
						>Diagonal
						<input
							type="number"
							min="10"
							step="1"
							value={round1(tvDiagonal(tv))}
							onchange={e => setDiagonal(e.currentTarget.value)}
						/>
					</label>
					<label
						>Ratio
						<select
							value={tvRatio}
							onchange={e => updateTv(tvSize(tvDiagonal(tv!), TV_RATIOS[Number(e.currentTarget.value)]!))}
						>
							{#each TV_RATIOS as [w, h], i (i)}<option value={i}>{w}:{h}</option>{/each}
							{#if tvRatio === -1}<option value={-1} disabled>{round1((tv.widthIn / tv.heightIn) * 9)}:9</option>{/if}
						</select>
					</label>
					<label
						>Width
						<input
							type="number"
							min="1"
							step="0.1"
							value={round1(tv.widthIn)}
							onchange={e => {
								const widthIn = positive(e.currentTarget.value);
								if (widthIn) updateTv({ widthIn });
							}}
						/>
					</label>
					<label
						>Height
						<input
							type="number"
							min="1"
							step="0.1"
							value={round1(tv.heightIn)}
							onchange={e => {
								const heightIn = positive(e.currentTarget.value);
								if (heightIn) updateTv({ heightIn });
							}}
						/>
					</label>
					<label
						>Center {round1(tv.centerIn)}″
						<input
							type="range"
							min={Math.ceil(tv.heightIn / 2)}
							max={Math.floor(120 - tv.heightIn / 2)}
							step="0.5"
							value={tv.centerIn}
							oninput={e => updateTv({ centerIn: Number(e.currentTarget.value) })}
						/>
					</label>
					<label
						>Tilt {tv.tiltDeg}°
						<input
							type="range"
							min="0"
							max="15"
							step="1"
							value={tv.tiltDeg}
							oninput={e => updateTv({ tiltDeg: Number(e.currentTarget.value) })}
						/>
					</label>
				</div>
				<p class="muted">
					Inches. Bottom edge {round1(tv.centerIn - tv.heightIn / 2)}″ off the floor, top {round1(
						tv.centerIn + tv.heightIn / 2,
					)}″, centered on the wall.
				</p>
				{#if tvError}<p class="error">{tvError}</p>{/if}
				{#if tvModels.length}
					<ul class="tv-models">
						{#each tvModels as m (m.id)}
							<li class:current={Math.abs(m.widthIn - tv.widthIn) < 0.05 && Math.abs(m.heightIn - tv.heightIn) < 0.05}>
								<button
									type="button"
									class="pick"
									onclick={() => updateTv({ widthIn: m.widthIn, heightIn: m.heightIn })}
									>{round1(tvDiagonal(m))}″</button
								>
								<a href={m.url} target="_blank" rel="noreferrer" title={m.name}>{m.name}</a>
								<button type="button" class="remove" aria-label="Remove {m.name}" onclick={() => tvRemove.mutate(m.id)}
									>×</button
								>
							</li>
						{/each}
					</ul>
				{/if}
				<form
					class="import"
					onsubmit={e => {
						e.preventDefault();
						if (tvUrl.trim()) tvImport.mutate(tvUrl.trim());
					}}
				>
					<input
						type="url"
						placeholder="Paste a TV link for its size"
						bind:value={tvUrl}
						disabled={tvImport.isPending}
					/>
					<button type="submit" class="primary" disabled={tvImport.isPending || !tvUrl.trim()}>
						{tvImport.isPending ? 'Reading…' : 'Add'}
					</button>
				</form>
				{#if tvImport.isError}<p class="error">{tvImport.error.message}</p>{/if}
			{/if}
		</section>

		<section class="panel items">
			<button
				type="button"
				class="section-toggle"
				aria-expanded={open.furniture}
				onclick={() => (open.furniture = !open.furniture)}
			>
				Furniture <span class="muted">{catalogList.length}</span>
			</button>
			{#if open.furniture}
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
				{#if importMutation.isError}
					<p class="error">{importMutation.error.message}</p>
				{/if}

				<ul>
					{#if importMutation.isPending}
						<li>
							<span class="thumb"></span>
							<div>
								<strong>{new URL(importMutation.variables).hostname.replace('www.', '')} link</strong>
								<span class="status busy">Importing · reading the page (about a minute)</span>
							</div>
						</li>
					{/if}
					{#each catalogList as item (item.id)}
						<li>
							{#if item.image}<img src={item.image} alt="" />{:else}<span class="thumb"></span>{/if}
							<div>
								<strong>{item.name}</strong>
								{#if item.modelJob?.state === 'running'}
									<span class="status busy">Building 3D model · 2–5 min</span>
								{:else if item.modelJob?.state === 'failed'}
									<span class="status failed" title={item.modelJob.error}>3D model failed · select it to retry</span>
								{/if}
								<span class="muted">
									{money(item) ?? ''}{#if item.modelSource === 'generated'}
										· AI 3D{:else if item.model}
										· 3D{:else if !item.modelJob}
										· no 3D{/if}{#if placedCount(item.id)}
										· {placedCount(item.id)} placed{/if}
								</span>
							</div>
							<button type="button" onclick={() => addToRoom(item.id)}>Add</button>
						</li>
					{:else}
						<li class="muted">
							{catalogQuery.isPending
								? 'Loading…'
								: importMutation.isPending
									? ''
									: 'No items yet. Paste a link above.'}
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	{/if}
</div>

<div class="right">
	{#if mode === 'orbit'}
		<section class="panel ideas" class:open={open.ideas}>
			<button
				type="button"
				class="section-toggle"
				aria-expanded={open.ideas}
				onclick={() => (open.ideas = !open.ideas)}
			>
				Ideas
			</button>
			{#if open.ideas}
				{#if ideasQuery.data}
					<!-- Our own ideas/README.md, rendered by the server. -->
					<div class="ideas-doc">{@html ideasQuery.data}</div>
				{:else if ideasQuery.isError}
					<p class="error">{ideasQuery.error.message}</p>
				{:else}
					<p class="muted">Loading…</p>
				{/if}
			{/if}
		</section>
	{/if}

	{#if tip}
		{@const t = textureList.find(x => x.id === tip?.texture.id) ?? tip.texture}
		<div class="tip panel" role="tooltip" style:left="{tip.x}px" style:top="{tip.y}px">
			{#if t.texture}<span class="tip-swatch" style:background-image="url({t.texture.map})"></span>{/if}
			<strong>{t.name}</strong>
			{#if t.textureJob?.state === 'queued'}
				<span class="status busy">Waiting for a texture builder</span>
			{:else if t.textureJob?.state === 'running'}
				<span class="status busy">Building texture · 2–5 min</span>
			{:else if t.textureJob?.state === 'failed'}
				<span class="error">Texture failed: {t.textureJob.error.slice(0, 160)} · click to retry</span>
			{:else if !t.texture}
				<span class="muted">No texture yet · click to build it</span>
			{/if}
			<span>
				{t.price === null ? 'No price' : t.price.toLocaleString('en-US', { style: 'currency', currency: t.currency })}
				{#if t.panelsPerPack > 1}for {t.panelsPerPack} panels{/if}{#if t.brand}
					· {t.brand}{/if}
			</span>
			{#if t.panel}
				<span class="muted">Panel {t.panel.width}" × {t.panel.height}" × {t.panel.depth}"</span>
				<span>TV wall: {estimate(t, 'tvWall')}</span>
				<span>Column: {estimate(t, 'column')}</span>
			{/if}
			<p class="muted">{t.summary}</p>
			{#if t.texture}<p class="note">{t.texture.note}</p>{/if}
			{#if applied(t)}<span class="applied">On the TV wall and column</span>{/if}
		</div>
	{/if}

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

			<p class="model-status">
				{#if selected.modelJob?.state === 'running'}
					<span class="status busy"
						>Codex is building a 3D model from the listing photos (2–5 min). Shown as a box until then.</span
					>
				{:else}
					{#if selected.modelJob?.state === 'failed'}<span class="error"
							>Model generation failed: {selected.modelJob.error}</span
						>
					{:else if selected.modelSource === 'listing'}<span class="muted">3D model from the listing.</span>
					{:else if selected.modelSource === 'generated'}<span class="muted"
							>3D model approximated by Codex from the listing photos.</span
						>
					{:else}<span class="muted">The listing has no 3D model.</span>{/if}
					{#if selected.modelSource !== 'listing'}
						<button type="button" onclick={() => generateMutation.mutate(selected.id)}>
							{selected.modelSource === 'generated' ? 'Regenerate' : 'Generate'} 3D model
						</button>
					{/if}
				{/if}
			</p>

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
</div>

<style>
	.viewer {
		position: fixed;
		inset: 0;
		background: var(--app-bg);
	}

	/* Sized to its panels and scrolled as a whole, so no panel gets squeezed and the plan stays clickable below. */
	.left {
		position: fixed;
		top: 1rem;
		left: 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
		width: 22rem;
		max-height: calc(100vh - 2rem);
		overflow-y: auto;
		overscroll-behavior: contain;
		scrollbar-width: thin;
	}

	.left > * {
		flex-shrink: 0;
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

	.tv-fields {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.5rem 0.75rem;
	}

	.tv-fields label {
		display: grid;
		gap: 0.2rem;
		color: var(--app-muted);
	}

	.tv-fields input[type='number'],
	.tv-fields select {
		width: 100%;
		border: 1px solid var(--app-border);
		border-radius: 0.375rem;
		padding: 0.4rem 0.5rem;
		background: var(--app-bg);
		color: var(--app-text);
	}

	.check {
		display: flex;
		gap: 0.4rem;
		align-items: center;
	}

	.import {
		display: flex;
		gap: 0.5rem;
	}

	.section-toggle {
		display: flex;
		gap: 0.4rem;
		align-items: baseline;
		width: 100%;
		padding: 0;
		border: none;
		font-size: 0.9rem;
		text-align: left;
	}

	.section-toggle::after {
		content: '▾';
		margin-left: auto;
		color: var(--app-muted);
		transition: transform 0.15s;
	}

	.section-toggle[aria-expanded='false']::after {
		transform: rotate(-90deg);
	}

	.items h3.group {
		margin: 0.2rem 0 -0.2rem;
		font-size: 0.75rem;
		font-weight: 600;
	}

	.swatches {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(2.6rem, 1fr));
		gap: 0.35rem;
		min-height: 0;
		overflow-y: auto;
	}

	.swatch {
		position: relative;
		aspect-ratio: 1;
		padding: 0;
		border: 2px solid transparent;
		border-radius: 0.3rem;
		background-color: #fff;
		background-position: center;
		background-repeat: repeat;
		box-shadow: inset 0 0 0 1px rgb(0 0 0 / 0.25);
	}

	.swatch.on-target {
		border-color: var(--app-accent);
	}

	.swatch.busy::after,
	.swatch.failed::after {
		content: '';
		position: absolute;
		inset: 0;
		border-radius: 0.2rem;
		background: rgb(0 0 0 / 0.45);
	}

	.swatch.busy::before {
		content: '';
		position: absolute;
		z-index: 1;
		inset: 30%;
		border: 2px solid #fff;
		border-right-color: transparent;
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	.swatch.failed::after {
		background: color-mix(in srgb, var(--app-error) 55%, transparent);
	}

	.tv-models {
		display: grid;
		gap: 0.25rem;
		margin: 0;
		padding: 0;
		list-style: none;
	}

	.tv-models li {
		display: grid;
		grid-template-columns: auto 1fr auto;
		gap: 0.5rem;
		align-items: center;
	}

	.tv-models a {
		overflow: hidden;
		color: var(--app-text);
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.tv-models .pick {
		min-width: 3.4rem;
		padding: 0.2rem 0.4rem;
	}

	.tv-models li.current .pick {
		border-color: var(--app-accent);
		background: var(--app-accent);
		color: var(--app-accent-ink);
	}

	.tv-models .remove {
		padding: 0 0.4rem;
		border: none;
		color: var(--app-muted);
		font-size: 1.1rem;
	}

	.tip {
		position: fixed;
		z-index: 10;
		display: grid;
		gap: 0.3rem;
		width: 18rem;
		font-size: 0.8rem;
		pointer-events: none;
	}

	.tip p {
		margin: 0;
	}

	.tip .note {
		font-size: 0.72rem;
		color: var(--app-muted);
	}

	.tip-swatch {
		height: 4.5rem;
		border-radius: 0.3rem;
		background-size: 3rem auto;
	}

	.tip .applied {
		color: var(--app-accent);
		font-weight: 600;
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

	.card .model-status {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
	}

	.status {
		display: inline-flex;
		align-items: center;
		gap: 0.4rem;
		font-weight: 600;
	}

	.status.busy {
		color: var(--app-accent);
	}

	.status.busy::before {
		content: '';
		flex: none;
		width: 0.7rem;
		height: 0.7rem;
		border: 2px solid currentColor;
		border-right-color: transparent;
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	.status.failed {
		color: var(--app-error);
	}

	@keyframes spin {
		to {
			transform: rotate(1turn);
		}
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

	.right {
		position: fixed;
		top: 1rem;
		right: 1rem;
		bottom: 1rem;
		display: flex;
		flex-direction: column;
		align-items: flex-end;
		gap: 0.75rem;
		width: min(28rem, calc(100vw - 25rem));
		pointer-events: none;
	}

	.ideas {
		display: flex;
		flex-direction: column;
		gap: 0.6rem;
		min-height: 0;
		padding: 0.6rem 1rem;
		font-size: 0.85rem;
	}

	.ideas.open {
		flex: 1 1 0;
		width: 100%;
		min-height: 12rem;
	}

	.ideas-doc {
		display: grid;
		gap: 0.6rem;
		min-height: 0;
		overflow-y: auto;
	}

	.ideas-doc :global(*) {
		margin: 0;
	}

	/* The README's title and its note about the folder layout are for reading it on GitHub. */
	.ideas-doc :global(h1),
	.ideas-doc :global(h1 + p) {
		display: none;
	}

	.ideas-doc :global(h2) {
		font-size: 1rem;
	}

	.ideas-doc :global(ul) {
		padding-left: 1.1rem;
		list-style: disc;
	}

	.ideas-doc :global(p > img) {
		width: 100%;
		border-radius: 0.375rem;
	}

	.ideas-doc :global(a) {
		color: var(--app-accent);
		font-weight: 600;
	}

	.ideas-doc :global(table),
	.ideas-doc :global(tbody),
	.ideas-doc :global(td) {
		display: block;
	}

	.ideas-doc :global(thead) {
		display: none;
	}

	.ideas-doc :global(tr) {
		display: grid;
		grid-template-columns: 4.5rem auto 1fr;
		gap: 0.15rem 0.6rem;
		align-items: start;
		padding: 0.5rem 0;
		border-top: 1px solid var(--app-border);
	}

	.ideas-doc :global(td:nth-child(1)) {
		grid-row: 1 / span 3;
	}

	.ideas-doc :global(td img) {
		width: 4.5rem;
		height: 4.5rem;
		border-radius: 0.25rem;
		background: #fff;
		object-fit: contain;
	}

	.ideas-doc :global(td:nth-child(2)),
	.ideas-doc :global(td:nth-child(5)) {
		grid-column: 2 / span 2;
	}

	.ideas-doc :global(td:nth-child(3)) {
		font-weight: 600;
	}

	.ideas-doc :global(td:nth-child(4)),
	.ideas-doc :global(td:nth-child(5)) {
		color: var(--app-muted);
	}

	.ideas-doc :global(td:nth-child(4))::before {
		content: '· ';
	}

	.card {
		position: relative;
		display: grid;
		flex: 0 1 auto;
		gap: 0.6rem;
		width: 20rem;
		max-width: 100%;
		min-height: 0;
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

	@media (max-width: 640px) {
		.left {
			top: 0.5rem;
			right: 0.5rem;
			left: 0.5rem;
			width: auto;
			max-height: 55vh;
		}

		.help {
			display: none;
		}

		.right {
			top: auto;
			right: 0.5rem;
			bottom: 0.5rem;
			left: 0.5rem;
			flex-direction: column-reverse;
			align-items: stretch;
			width: auto;
			max-height: 50vh;
		}

		.right:has(.ideas.open) {
			height: 50vh;
		}

		.card {
			width: auto;
		}

		.right .panel {
			background: var(--app-panel);
		}
	}
</style>
