<script lang="ts">
	import { finishAreasIn } from '@repo/shared/floorplan';
	import { FIXTURE_KEYS, type Fixture, type FixtureKey, type FixtureOption } from '@repo/shared/fixtures';
	import { TV_MOUNT_IN } from '@repo/shared/plan';
	import {
		panelsNeeded,
		TV_PLACEMENTS,
		TV_RATIOS,
		tvDiagonal,
		tvSize,
		type TvPlacement,
		type TvSettings,
		type CatalogEntry,
		type CatalogItem,
		type FinishSurface,
		type Job,
		type Placement,
		type WallTexture,
		type WallTextureEntry,
	} from '@repo/shared/items';
	import { createMutation, createQuery, useQueryClient } from '@tanstack/svelte-query';
	import { onMount, tick } from 'svelte';
	import type { Attachment } from 'svelte/attachments';
	import type { MeasureState, MeasureTool } from '../lib/measure';
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
	let open = $state<Record<FixtureKey | 'furniture' | 'ideas', boolean>>({
		furniture: true,
		...(Object.fromEntries(FIXTURE_KEYS.map(key => [key, true])) as Record<FixtureKey, boolean>),
		ideas: false,
		...saved.open,
	});
	let viewer = $state<ReturnType<typeof createViewer>>();
	let measure = $state<MeasureState>({ tool: null, draft: null, done: [] });
	const measureHints: Record<MeasureTool, string> = {
		line: 'Click points on the floor. Click the last point again or press Enter to finish.',
		area: 'Click the corners on the floor. Click the first corner again or press Enter to close the shape.',
	};

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
	const fixturesQuery = createQuery(() => ({
		queryKey: ['fixtures'],
		// A poll answered while a pick is saving would show the old pick for a cycle.
		queryFn: async () => {
			const data = await api<Fixture[]>('/api/fixtures');
			return picksSaving ? (queryClient.getQueryData<Fixture[]>(['fixtures']) ?? data) : data;
		},
		// The AR app switches fixtures too, and model and texture builds report progress through it.
		refetchInterval: 3000,
	}));
	const fixtureList = $derived(fixturesQuery.data ?? []);
	const fixtures = $derived(
		Object.fromEntries(fixtureList.map(f => [f.key, f])) as Partial<Record<FixtureKey, Fixture>>,
	);
	// Products that belong to an item fixture, like beds, are picked in its panel rather than placed as furniture.
	const fixtureCategories = $derived(
		new Map(fixtureList.flatMap(f => (f.kind === 'item' ? [[f.category, f.key] as const] : []))),
	);
	const furnitureList = $derived(catalogList.filter(item => !fixtureCategories.has(item.category)));
	let picksSaving = 0;
	// The newest pick per fixture; replies to older picks that land after it are dropped.
	const latestPick: Partial<Record<FixtureKey, number>> = {};
	// The plan draws picks from the catalog and texture lists, which only refresh on their own while a build they know
	// about runs. A pick or build started elsewhere, like the AR app importing a bed, has to refresh them from here.
	$effect(() => {
		const building = (job: Job | null | undefined) => job?.state === 'queued' || job?.state === 'running';
		for (const f of fixtureList) {
			const textures = f.kind === 'wallTexture';
			if (!textures && f.kind !== 'item') continue;
			const known = textures
				? texturesQuery.data?.map(t => ({ id: t.id, job: t.textureJob }))
				: catalogQuery.data?.map(item => ({ id: item.id, job: item.modelJob }));
			if (!known) continue;
			const stale =
				(f.selected && !known.some(x => x.id === f.selected)) ||
				f.options.some(o => building(o.job) && !building(known.find(x => x.id === o.id)?.job));
			if (stale) void queryClient.invalidateQueries({ queryKey: [textures ? 'textures' : 'catalog'] });
		}
	});

	function storeFixture(next: Fixture) {
		void queryClient.cancelQueries({ queryKey: ['fixtures'] });
		queryClient.setQueryData<Fixture[]>(['fixtures'], list => list?.map(f => (f.key === next.key ? next : f)));
	}
	const fixtureUrls = $state(Object.fromEntries(FIXTURE_KEYS.map(key => [key, ''])) as Record<FixtureKey, string>);
	function fixtureMutations(key: FixtureKey) {
		return {
			select: createMutation(() => ({
				mutationFn: (selected: string | null) =>
					api<Fixture>(`/api/fixtures/${key}`, { method: 'PUT', body: JSON.stringify({ selected }) }),
				onMutate: async (selected: string | null) => {
					picksSaving++;
					const pick = (latestPick[key] ?? 0) + 1;
					latestPick[key] = pick;
					if (key === 'tv') dropTvDraft();
					await queryClient.cancelQueries({ queryKey: ['fixtures'] });
					queryClient.setQueryData<Fixture[]>(['fixtures'], list =>
						list?.map(f => (f.key === key ? { ...f, selected } : f)),
					);
					return { pick };
				},
				onSuccess: (next: Fixture, _selected: string | null, context: { pick: number } | undefined) => {
					if (context?.pick === latestPick[key]) storeFixture(next);
				},
				onError: () => queryClient.invalidateQueries({ queryKey: ['fixtures'] }),
				onSettled: () => picksSaving--,
			})),
			import: createMutation(() => ({
				mutationFn: (url: string) =>
					api<Fixture>(`/api/fixtures/${key}/import`, { method: 'POST', body: JSON.stringify({ url }) }),
				onSuccess: async (next: Fixture) => {
					fixtureUrls[key] = '';
					if (key === 'tv') dropTvDraft();
					storeFixture(next);
					await queryClient.invalidateQueries({ queryKey: [next.kind === 'wallTexture' ? 'textures' : 'catalog'] });
				},
			})),
			build: createMutation(() => ({
				mutationFn: (id: string) => api<Fixture>(`/api/fixtures/${key}/options/${id}/build`, { method: 'POST' }),
				onSuccess: async (next: Fixture) => {
					storeFixture(next);
					await queryClient.invalidateQueries({ queryKey: [next.kind === 'wallTexture' ? 'textures' : 'catalog'] });
				},
			})),
			remove: createMutation(() => ({
				mutationFn: (id: string) => api<Fixture>(`/api/fixtures/${key}/options/${id}`, { method: 'DELETE' }),
				onSuccess: storeFixture,
			})),
		};
	}
	const fixtureActions = Object.fromEntries(FIXTURE_KEYS.map(key => [key, fixtureMutations(key)])) as Record<
		FixtureKey,
		ReturnType<typeof fixtureMutations>
	>;

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
	// Swatches show the tile at a fixed scale so slat widths compare across products.
	const SWATCH_PX_PER_FT = 40;
	const textureGroups = $derived(
		Object.entries(Object.groupBy(textureList, t => t.group ?? 'Other'))
			.map(([group, items]) => [group, items!.toSorted((a, b) => a.name.localeCompare(b.name))] as const)
			.toSorted(([a], [b]) => a.localeCompare(b)),
	);
	const applied = (t: WallTexture) => fixtures.wallTexture?.selected === t.id;
	function clickSwatch(t: WallTextureEntry) {
		if (t.texture && t.textureJob?.state !== 'failed')
			fixtureActions.wallTexture.select.mutate(applied(t) ? null : t.id);
		else if (!t.textureJob || t.textureJob.state === 'failed') fixtureActions.wallTexture.build.mutate(t.id);
	}
	type Product = {
		name: string;
		image: string | null;
		url: string;
		facts: string[];
		summary: string | null;
		warning: string | null;
	};
	type PeekContent = { kind: 'texture'; texture: WallTextureEntry } | { kind: 'product'; product: Product };
	const itemProduct = (item: CatalogEntry, warning: string | null = null): Product => ({
		name: item.name,
		image: item.image,
		url: item.url,
		facts: [
			[money(item), item.brand].filter(Boolean).join(' · '),
			item.dimensions
				? `${inches(item.dimensions.width)} W × ${inches(item.dimensions.height)} H × ${inches(item.dimensions.depth)} D` +
					(item.weightLb ? ` · ${item.weightLb} lb` : '')
				: '',
		].filter(Boolean),
		summary: item.summary,
		warning,
	});
	function optionProduct(f: Fixture, option: FixtureOption): Product | null {
		const item = f.kind === 'item' ? catalog[option.id] : undefined;
		if (item) return itemProduct(item, option.warning);
		// The hand-sized TV has no listing to show.
		if (!option.url) return null;
		const { name, image, url, warning } = option;
		return { name, image, url, facts: [option.detail], summary: null, warning };
	}
	const host = (url: string) => new URL(url).hostname.replace('www.', '');

	// The card takes the pointer so its link can be clicked, so leaving the row hides it only after long enough to
	// cross into it. It sits beside the row's panel rather than the row so it never covers the neighboring rows.
	let peek = $state<{ anchor: HTMLElement; content: PeekContent } | null>(null);
	let peekTimer: ReturnType<typeof setTimeout> | undefined;
	function keepPeek() {
		clearTimeout(peekTimer);
	}
	function hidePeek() {
		clearTimeout(peekTimer);
		peekTimer = setTimeout(() => (peek = null), 150);
	}
	function peekOn(content: () => PeekContent | null): Attachment<HTMLElement> {
		return el => {
			const show = () => {
				const next = content();
				if (!next) return;
				keepPeek();
				peek = { anchor: el, content: next };
			};
			const enter = (e: PointerEvent) => e.pointerType === 'mouse' && show();
			const focus = (e: FocusEvent) => (e.target as Element).matches(':focus-visible') && show();
			el.addEventListener('pointerenter', enter);
			el.addEventListener('pointerleave', hidePeek);
			el.addEventListener('focusin', focus);
			el.addEventListener('focusout', hidePeek);
			return () => {
				el.removeEventListener('pointerenter', enter);
				el.removeEventListener('pointerleave', hidePeek);
				el.removeEventListener('focusin', focus);
				el.removeEventListener('focusout', hidePeek);
				// A removed row never fires pointerleave.
				if (peek?.anchor === el) peek = null;
			};
		};
	}
	function placePeek(anchor: HTMLElement): Attachment<HTMLElement> {
		return el => {
			const place = () => {
				const row = anchor.getBoundingClientRect();
				const side = (anchor.closest('.panel') ?? anchor).getBoundingClientRect();
				const { offsetWidth: w, offsetHeight: h } = el;
				const x = side.right + 8 + w > innerWidth ? side.left - w - 8 : side.right + 8;
				el.style.left = `${Math.max(8, Math.min(x, innerWidth - w - 8))}px`;
				el.style.top = `${Math.max(8, Math.min(row.top, innerHeight - h - 8))}px`;
			};
			const observer = new ResizeObserver(place);
			observer.observe(el);
			addEventListener('scroll', place, { capture: true, passive: true });
			return () => {
				observer.disconnect();
				removeEventListener('scroll', place, { capture: true });
			};
		};
	}

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
	const furnitureFacts = (item: CatalogEntry) =>
		[
			money(item),
			item.modelSource === 'generated' ? 'AI 3D' : item.model ? '3D' : item.modelJob ? null : 'no 3D',
			placedCount(item.id) ? `${placedCount(item.id)} placed` : null,
		]
			.filter(Boolean)
			.join(' · ');

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
			const fixture = fixtureCategories.get(item.category);
			if (!fixture) return addToRoom(item.id);
			// The server made it the fixture's pick.
			open[fixture] = true;
			await queryClient.invalidateQueries({ queryKey: ['fixtures'] });
		},
	}));

	const generateMutation = createMutation(() => ({
		mutationFn: (id: string) => api(`/api/catalog/${id}/model`, { method: 'POST' }),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ['catalog'] }),
	}));

	// Hand edits stay local until their save lands, so a fixtures poll can't snap the inputs back mid-drag.
	let tvDraft = $state<TvSettings | null>(null);
	const tv = $derived(tvDraft ?? fixtures.tv?.tv ?? null);
	let tvError = $state<string | null>(null);
	let tvSaveTimer: ReturnType<typeof setTimeout> | undefined;
	function updateTv(patch: Partial<TvSettings>) {
		if (!tv) return;
		tvDraft = { ...tv, ...patch };
		clearTimeout(tvSaveTimer);
		tvSaveTimer = setTimeout(() => void saveTv(), SAVE_DELAY_MS);
	}
	async function saveTv() {
		tvSaveTimer = undefined;
		const sent = $state.snapshot(tvDraft);
		try {
			storeFixture(await api<Fixture>('/api/tv', { method: 'PUT', body: JSON.stringify(sent) }));
			tvError = null;
			if (!tvSaveTimer && JSON.stringify($state.snapshot(tvDraft)) === JSON.stringify(sent)) tvDraft = null;
		} catch (error) {
			tvError = (error as Error).message;
		}
	}
	function dropTvDraft() {
		clearTimeout(tvSaveTimer);
		tvSaveTimer = undefined;
		tvDraft = null;
	}
	const round1 = (n: number) => Math.round(n * 10) / 10;
	function fixtureSummary(f: Fixture) {
		if (f.kind === 'tv') return tv?.visible ? `${round1(tvDiagonal(tv))}″` : 'off';
		if (f.kind === 'wallTexture') return String(f.options.length);
		const d = f.selected ? catalog[f.selected]?.dimensions : null;
		return d ? `${round1(d.width)}″ × ${round1(d.depth)}″` : '';
	}
	const positive = (value: string) => (Number(value) > 0 ? Number(value) : null);
	const tvRatio = $derived(
		tv ? TV_RATIOS.findIndex(([w, h]) => Math.abs(tv!.widthIn / tv!.heightIn - w / h) < 0.01) : -1,
	);
	// The corner TV's back edge clears both walls by the mount's standoff, so it reaches (mount + width) / √2 along each.
	const tvWhere = (tv: TvSettings) =>
		({
			backWall: 'centered on the back wall',
			pillarWall: 'centered between the column and the back wall',
			corner: `across the corner, reaching ${round1((TV_MOUNT_IN + tv.widthIn) / Math.SQRT2)}″ along each wall`,
		})[tv.placement];
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
			state => (measure = state),
		);
		viewer = v;
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
		if (!viewer || !catalogQuery.data) return;
		for (const f of fixtureList)
			if (f.kind === 'item') viewer.setWallItem(f.key, f.spot, f.selected ? (catalog[f.selected] ?? null) : null);
	});
	$effect(() => {
		if (viewer && (placementsLoaded || placements.length)) viewer.setPlacements($state.snapshot(placements), catalog);
	});
	$effect(() => {
		const id = fixtures.wallTexture?.selected;
		viewer?.setWallTexture(textureList.find(t => t.id === id) ?? null);
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
		{#each fixtureList as f (f.key)}
			{@const actions = fixtureActions[f.key]}
			<section class="panel items fixture">
				<button
					type="button"
					class="section-toggle"
					aria-expanded={open[f.key]}
					onclick={() => (open[f.key] = !open[f.key])}
				>
					{f.kind === 'wallTexture' ? `${f.room} wall texture` : f.title}
					<span class="muted">{fixtureSummary(f)}</span>
				</button>
				{#if open[f.key]}
					{#if f.kind === 'tv' && tv}
						<label class="check"
							><input
								type="checkbox"
								checked={tv.visible}
								onchange={e => updateTv({ visible: e.currentTarget.checked })}
							/>
							Show the TV</label
						>
						<div class="tv-fields">
							<label class="wide"
								>Placement
								<select
									value={tv.placement}
									onchange={e => updateTv({ placement: e.currentTarget.value as TvPlacement })}
								>
									{#each Object.entries(TV_PLACEMENTS) as [value, label] (value)}<option {value}>{label}</option>{/each}
								</select>
							</label>
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
									{#if tvRatio === -1}<option value={-1} disabled>{round1((tv.widthIn / tv.heightIn) * 9)}:9</option
										>{/if}
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
							)}″, {tvWhere(tv)}.
						</p>
						{#if tvError}<p class="error">{tvError}</p>{/if}
					{/if}
					{#if actions.select.isError}<p class="error">{actions.select.error.message}</p>{/if}
					{#if actions.build.isError}<p class="error">{actions.build.error.message}</p>{/if}
					{#if f.kind === 'wallTexture'}
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
										{@attach peekOn(() => ({ kind: 'texture', texture: t }))}
									>
									</button>
								{/each}
							</div>
						{/each}
						{#if actions.import.isPending}<div class="swatches">
								<span class="swatch busy" aria-label="Importing"></span>
							</div>{/if}
					{:else}
						<ul>
							{#if actions.import.isPending}
								<li class="fixture-option">
									<span class="pick">
										<span class="thumb"></span>
										<span class="text">
											<strong>{host(actions.import.variables)} link</strong>
											<span class="status busy">Importing · reading the page (about a minute)</span>
										</span>
									</span>
								</li>
							{/if}
							{#each f.options as option (option.id)}
								<li
									class="fixture-option"
									class:current={option.id === f.selected}
									{@attach peekOn(() => {
										const product = optionProduct(f, option);
										return product && { kind: 'product', product };
									})}
								>
									<button
										type="button"
										class="pick"
										aria-pressed={option.id === f.selected}
										disabled={!option.ready}
										onclick={() => actions.select.mutate(option.id === f.selected ? null : option.id)}
									>
										{#if option.image}<img src={option.image} alt="" />{:else}<span class="thumb"></span>{/if}
										<span class="text">
											<strong>{option.name}</strong>
											<span class="muted">{option.detail}</span>
											{#if option.warning}<span class="error">{option.warning}</span>{/if}
											{#if option.job?.state === 'queued' || option.job?.state === 'running'}
												<span class="status busy">Building · 2–5 min</span>
											{:else if option.job?.state === 'failed'}
												<span class="status failed" title={option.job.error}>Build failed</span>
											{/if}
										</span>
									</button>
									{#if option.job?.state === 'failed'}
										<button type="button" onclick={() => actions.build.mutate(option.id)}>Retry</button>
									{:else if option.url}
										<a href={option.url} target="_blank" rel="noreferrer" aria-label="Open {option.name} listing">↗</a>
									{/if}
									{#if f.removable && option.url}
										<button
											type="button"
											class="remove"
											aria-label="Remove {option.name}"
											onclick={() => actions.remove.mutate(option.id)}>×</button
										>
									{/if}
								</li>
							{:else}
								{#if !actions.import.isPending}
									<li class="muted">Nothing yet. Paste a link below.</li>
								{/if}
							{/each}
						</ul>
					{/if}
					{#if f.kind === 'item'}
						<p class="muted">
							Back flush to the wall, centered on its {round1(f.spot.span * 12)}″. Click one to switch to it, again to
							clear the room.
						</p>
					{/if}
					<form
						class="import"
						onsubmit={e => {
							e.preventDefault();
							if (fixtureUrls[f.key].trim()) actions.import.mutate(fixtureUrls[f.key].trim());
						}}
					>
						<input
							type="url"
							placeholder={f.importLabel}
							bind:value={fixtureUrls[f.key]}
							disabled={actions.import.isPending}
						/>
						<button type="submit" class="primary" disabled={actions.import.isPending || !fixtureUrls[f.key].trim()}>
							{actions.import.isPending ? 'Importing…' : 'Import'}
						</button>
					</form>
					{#if actions.import.isError}<p class="error">{actions.import.error.message}</p>{/if}
				{/if}
			</section>
		{:else}
			<section class="panel items">
				<p class="muted">{fixturesQuery.isError ? fixturesQuery.error.message : 'Loading…'}</p>
			</section>
		{/each}

		<section class="panel items">
			<button
				type="button"
				class="section-toggle"
				aria-expanded={open.furniture}
				onclick={() => (open.furniture = !open.furniture)}
			>
				Furniture <span class="muted">{furnitureList.length}</span>
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
								<strong>{host(importMutation.variables)} link</strong>
								<span class="status busy">Importing · reading the page (about a minute)</span>
							</div>
						</li>
					{/if}
					{#each furnitureList as item (item.id)}
						<li {@attach peekOn(() => ({ kind: 'product', product: itemProduct(item) }))}>
							{#if item.image}<img src={item.image} alt="" />{:else}<span class="thumb"></span>{/if}
							<div>
								<strong>{item.name}</strong>
								{#if item.modelJob?.state === 'running'}
									<span class="status busy">Building 3D model · 2–5 min</span>
								{:else if item.modelJob?.state === 'failed'}
									<span class="status failed" title={item.modelJob.error}>3D model failed · select it to retry</span>
								{/if}
								<span class="muted">{furnitureFacts(item)}</span>
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
		<div class="toolbar">
			<div class="panel measure-tools" role="group" aria-label="Measure">
				<span>Measure</span>
				{#each ['line', 'area'] as const as tool (tool)}
					<button
						type="button"
						aria-pressed={measure.tool === tool}
						onclick={() => viewer?.setMeasureTool(measure.tool === tool ? null : tool)}
					>
						{tool === 'line' ? 'Line' : 'Area'}
					</button>
				{/each}
			</div>
			<div class="panel ideas-toggle">
				<button
					type="button"
					class="section-toggle"
					aria-expanded={open.ideas}
					onclick={() => (open.ideas = !open.ideas)}
				>
					Ideas
				</button>
			</div>
		</div>
		{#if measure.tool || measure.done.length}
			<section class="panel measure">
				{#if measure.tool}
					<p class="muted">{measureHints[measure.tool]} Shift keeps a segment straight.</p>
					{#if measure.draft}
						<div class="measure-row draft">
							<span>{measure.draft.value} <span class="muted">{measure.draft.detail}</span></span>
							<button type="button" onclick={() => viewer?.finishMeasurement()}>Done</button>
						</div>
					{/if}
				{/if}
				{#each measure.done as m (m.id)}
					<div class="measure-row">
						<span>
							<span class="muted">{m.tool === 'line' ? 'Line' : 'Area'}</span>
							<strong>{m.value}</strong> <span class="muted">{m.detail}</span>
						</span>
						<button
							type="button"
							class="remove"
							aria-label="Remove measurement {m.value}"
							onclick={() => viewer?.removeMeasurement(m.id)}>×</button
						>
					</div>
				{/each}
				{#if measure.done.length > 1}
					<button type="button" class="clear" onclick={() => viewer?.clearMeasurements()}>Clear all</button>
				{/if}
			</section>
		{/if}
		{#if open.ideas}
			<section class="panel ideas">
				{#if ideasQuery.data}
					<!-- Our own ideas/README.md, rendered by the server. -->
					<div class="ideas-doc">{@html ideasQuery.data}</div>
				{:else if ideasQuery.isError}
					<p class="error">{ideasQuery.error.message}</p>
				{:else}
					<p class="muted">Loading…</p>
				{/if}
			</section>
		{/if}
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
			<a href={selected.url} target="_blank" rel="noreferrer">View on {host(selected.url)} ↗</a>
		</aside>
	{/if}
</div>

{#if peek}
	<div
		class="peek panel"
		role="tooltip"
		{@attach placePeek(peek.anchor)}
		onpointerenter={keepPeek}
		onpointerleave={hidePeek}
	>
		{#if peek.content.kind === 'texture'}
			{@const id = peek.content.texture.id}
			{@const t = textureList.find(x => x.id === id) ?? peek.content.texture}
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
			<a href={t.url} target="_blank" rel="noreferrer">View on {host(t.url)} ↗</a>
		{:else}
			{@const p = peek.content.product}
			{#if p.image}<img src={p.image} alt={p.name} />{/if}
			<strong>{p.name}</strong>
			{#each p.facts as fact (fact)}<span>{fact}</span>{/each}
			{#if p.warning}<span class="error">{p.warning}</span>{/if}
			{#if p.summary}<p class="muted summary">{p.summary}</p>{/if}
			<a href={p.url} target="_blank" rel="noreferrer">View on {host(p.url)} ↗</a>
		{/if}
	</div>
{/if}

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

	.tv-fields .wide {
		grid-column: 1 / -1;
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

	.fixture-option .remove {
		padding: 0 0.4rem;
		border: none;
		color: var(--app-muted);
		font-size: 1.1rem;
	}

	.items li.fixture-option {
		grid-template-columns: 1fr;
		grid-auto-columns: auto;
		grid-auto-flow: column;
	}

	.fixture-option .pick {
		display: grid;
		grid-template-columns: 3rem 1fr;
		gap: 0.6rem;
		align-items: center;
		min-width: 0;
		padding: 0.3rem;
		border: 1px solid transparent;
		font-weight: inherit;
		text-align: left;
	}

	.fixture-option.current .pick {
		border-color: var(--app-accent);
	}

	.fixture-option .text {
		display: grid;
		min-width: 0;
	}

	.fixture-option .text strong {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.fixture-option a {
		padding: 0 0.4rem;
		color: var(--app-muted);
		text-decoration: none;
	}

	.peek {
		position: fixed;
		z-index: 10;
		display: grid;
		gap: 0.3rem;
		width: 20rem;
		max-height: calc(100vh - 1rem);
		overflow-y: auto;
		background: var(--app-panel);
		font-size: 0.8rem;
	}

	.peek p {
		margin: 0;
	}

	.peek img {
		width: 100%;
		height: 14rem;
		margin-bottom: 0.2rem;
		border-radius: 0.375rem;
		background: #fff;
		object-fit: contain;
	}

	.peek .summary {
		display: -webkit-box;
		overflow: hidden;
		-webkit-box-orient: vertical;
		-webkit-line-clamp: 5;
		line-clamp: 5;
	}

	.peek a {
		justify-self: start;
		margin-top: 0.2rem;
		color: var(--app-accent);
		font-weight: 600;
	}

	.peek .note {
		font-size: 0.72rem;
		color: var(--app-muted);
	}

	.tip-swatch {
		height: 4.5rem;
		border-radius: 0.3rem;
		background-size: 3rem auto;
	}

	.peek .applied {
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

	.toolbar {
		display: flex;
		gap: 0.5rem;
		align-items: stretch;
	}

	.toolbar > .panel {
		display: flex;
		gap: 0.4rem;
		align-items: center;
		padding: 0.4rem 0.6rem;
		font-size: 0.85rem;
	}

	.measure-tools > span {
		padding: 0 0.2rem;
		font-weight: 600;
	}

	.measure-tools button {
		padding: 0.25rem 0.6rem;
	}

	.measure-tools button[aria-pressed='true'] {
		border-color: var(--app-accent);
		background: var(--app-accent);
		color: var(--app-accent-ink);
	}

	.ideas-toggle {
		padding-inline: 1rem;
	}

	.ideas-toggle .section-toggle {
		width: auto;
	}

	.measure {
		display: grid;
		gap: 0.5rem;
		width: 20rem;
		max-width: 100%;
		padding: 0.75rem 1rem;
		font-size: 0.85rem;
	}

	.measure-row {
		display: flex;
		gap: 0.5rem;
		align-items: center;
		justify-content: space-between;
		font-variant-numeric: tabular-nums;
	}

	.measure-row.draft {
		color: #5eead4;
		font-weight: 600;
	}

	.measure-row button {
		padding: 0.15rem 0.5rem;
	}

	.measure-row .remove {
		border: none;
		font-size: 1.1rem;
		line-height: 1;
	}

	.measure .clear {
		justify-self: end;
		padding: 0.25rem 0.6rem;
	}

	:global(.measure-label) {
		padding: 0.1rem 0.35rem;
		border-radius: 0.25rem;
		background: rgb(0 0 0 / 0.7);
		color: #fbbf24;
		font-size: 0.72rem;
		font-weight: 650;
		font-variant-numeric: tabular-nums;
		white-space: nowrap;
	}

	:global(.measure-label.area) {
		font-size: 0.8rem;
	}

	:global(.measure-dot) {
		width: 0.5rem;
		height: 0.5rem;
		border: 2px solid #fbbf24;
		border-radius: 50%;
		background: #1c1f24;
	}

	:global(.measure-dot.draft) {
		border-color: #5eead4;
	}

	.ideas {
		display: flex;
		flex: 1 1 0;
		flex-direction: column;
		gap: 0.6rem;
		width: 100%;
		min-height: 12rem;
		padding: 0.6rem 1rem;
		font-size: 0.85rem;
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

		.toolbar {
			justify-content: flex-end;
		}

		.measure {
			width: auto;
		}

		.right:has(.ideas) {
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
