<script lang="ts">
	import { finishAreasIn } from '@repo/shared/floorplan';
	import { FIXTURE_KEYS, type Fixture, type FixtureKey, type FixtureOption } from '@repo/shared/fixtures';
	import { planGeometry, TV_MOUNT_IN } from '@repo/shared/plan';
	import {
		carpetHitsWalls,
		carpetSpawn,
		closestSize,
		sameSize,
		sizeLabel,
		variantOf,
		type CarpetEntry,
		type CarpetSize,
	} from '@repo/shared/carpets';
	import {
		MOUNTS,
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
		type Mount,
		type Placement,
		type WallTexture,
		type WallTextureEntry,
	} from '@repo/shared/items';
	import { LAYOUT_HEADER, type LayoutList } from '@repo/shared/layouts';
	import { createMutation, createQuery, keepPreviousData, useQueryClient } from '@tanstack/svelte-query';
	import { onMount, tick } from 'svelte';
	import type { Attachment } from 'svelte/attachments';
	import type { MeasureState, MeasureTool } from '../lib/measure';
	import Configurator, { type ConfigAxis } from '../lib/Configurator.svelte';
	import { createViewer, type Mode, type Selection } from '../lib/scene';

	// Living room, clear of the island and the column.
	const SPAWN = { x: 15.5, z: 28 };
	const SAVE_DELAY_MS = 300;

	let container: HTMLDivElement;
	let overlay: HTMLDivElement;
	let mode = $state<Mode>('orbit');
	const OPTIONS_KEY = 'viewer-options';
	const saved = JSON.parse(localStorage.getItem(OPTIONS_KEY) ?? '{}');
	let cutaway = $state<boolean>(saved.cutaway ?? true);
	let doors = $state<boolean>(saved.doors ?? true);
	let open = $state<Record<FixtureKey | 'furniture' | 'wall' | 'carpets' | 'ideas', boolean>>({
		furniture: true,
		wall: true,
		carpets: true,
		...(Object.fromEntries(FIXTURE_KEYS.map(key => [key, true])) as Record<FixtureKey, boolean>),
		ideas: false,
		...saved.open,
	});
	let collapsedGroups = $state<string[]>(saved.collapsedGroups ?? []);
	let viewer = $state<ReturnType<typeof createViewer>>();
	let measure = $state<MeasureState>({ tool: null, draft: null, done: [] });
	const measureHints: Record<MeasureTool, string> = {
		line: 'Click points on the floor. Click the last point again or press Enter to finish.',
		area: 'Click the corners on the floor. Click the first corner again or press Enter to close the shape.',
	};

	// Everything the plan shows and changes belongs to this layout. Each request names the layout it was made for, so a
	// save still in flight when the layout switches lands where it was made.
	let layout = $state<string | null>(null);
	async function api<T>(path: string, init?: RequestInit, at = layout): Promise<T> {
		const res = await fetch(path, {
			...init,
			headers: { 'content-type': 'application/json', ...(at && { [LAYOUT_HEADER]: at }) },
		});
		const body = await res.json();
		if (!res.ok) throw new Error(body.error ?? `${res.status} ${res.statusText}`);
		return body;
	}
	const inLayout = <T>(name: string, path: string) => ({
		queryKey: [name, layout],
		queryFn: ({ queryKey }: { queryKey: readonly unknown[] }) => api<T>(path, undefined, queryKey[1] as string),
		enabled: !!layout,
	});

	const queryClient = useQueryClient();
	const layoutsQuery = createQuery(() => ({
		queryKey: ['layouts'],
		queryFn: () => api<LayoutList>('/api/layouts', undefined, null),
	}));
	$effect(() => {
		if (!layout && layoutsQuery.data) layout = layoutsQuery.data.active;
	});
	const catalogQuery = createQuery(() => ({
		...inLayout<CatalogEntry[]>('catalog', '/api/catalog'),
		// Only the products deleted from a layout differ between layouts, and nothing here edits a layout through them,
		// so the old list stands in while the new one loads. Fixtures and carpets show nothing until theirs arrive:
		// editing the last layout's copy would save it over the new one.
		placeholderData: keepPreviousData,
		refetchInterval: query =>
			query.state.data?.some(item => item.modelJob?.state === 'running' || item.grouping) ? 3000 : false,
	}));
	const catalogList = $derived(catalogQuery.data ?? []);
	const catalog = $derived(Object.fromEntries(catalogList.map(item => [item.id, item])));
	const fixturesQuery = createQuery(() => ({
		...inLayout<Fixture[]>('fixtures', '/api/fixtures'),
		// A poll answered while a pick is saving would show the old pick for a cycle.
		queryFn: async ({ queryKey }: { queryKey: readonly unknown[] }) => {
			const data = await api<Fixture[]>('/api/fixtures', undefined, queryKey[1] as string);
			return picksSaving ? (queryClient.getQueryData<Fixture[]>(queryKey) ?? data) : data;
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
	const placeable = $derived(catalogList.filter(item => !fixtureCategories.has(item.category)));
	// Wall pieces (art, mirrors, shelves) have a list of their own and only ever hang on a wall.
	const furnitureList = $derived(placeable.filter(item => item.mount !== 'wall'));
	const wallList = $derived(placeable.filter(item => item.mount === 'wall'));
	const grouped = (items: CatalogEntry[]) =>
		Object.entries(Object.groupBy(items, item => item.group ?? 'Other')).toSorted(([a], [b]) =>
			a === 'Other' ? 1 : b === 'Other' ? -1 : a.localeCompare(b),
		);
	const toggleGroup = (group: string) =>
		(collapsedGroups = collapsedGroups.includes(group)
			? collapsedGroups.filter(g => g !== group)
			: [...collapsedGroups, group]);
	const building = (job: Job | null | undefined) => job?.state === 'queued' || job?.state === 'running';
	let picksSaving = 0;
	// The newest pick per fixture; replies to older picks that land after it are dropped.
	const latestPick: Partial<Record<FixtureKey, number>> = {};
	// The plan draws picks from the catalog and texture lists, which only refresh on their own while a build they know
	// about runs. A pick or build started elsewhere, like the AR app importing a bed, has to refresh them from here.
	$effect(() => {
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

	function storeFixture(next: Fixture, at: string | null) {
		void queryClient.cancelQueries({ queryKey: ['fixtures', at] });
		queryClient.setQueryData<Fixture[]>(['fixtures', at], list => list?.map(f => (f.key === next.key ? next : f)));
	}
	type SectionKey = FixtureKey | 'furniture' | 'wall' | 'carpets';
	const importUrls = $state(
		Object.fromEntries([...FIXTURE_KEYS, 'furniture', 'wall', 'carpets'].map(key => [key, ''])) as Record<
			SectionKey,
			string
		>,
	);
	function fixtureMutations(key: FixtureKey) {
		return {
			select: createMutation(() => ({
				mutationFn: (selected: string | null) =>
					api<Fixture>(`/api/fixtures/${key}`, { method: 'PUT', body: JSON.stringify({ selected }) }),
				onMutate: async (selected: string | null) => {
					picksSaving++;
					const pick = (latestPick[key] ?? 0) + 1;
					latestPick[key] = pick;
					const at = layout;
					if (key === 'tv') dropTvDraft();
					await queryClient.cancelQueries({ queryKey: ['fixtures', at] });
					queryClient.setQueryData<Fixture[]>(['fixtures', at], list =>
						list?.map(f => (f.key === key ? { ...f, selected } : f)),
					);
					return { pick, at };
				},
				onSuccess: (
					next: Fixture,
					_selected: string | null,
					context: { pick: number; at: string | null } | undefined,
				) => {
					if (context && context.pick === latestPick[key]) storeFixture(next, context.at);
				},
				onError: () => queryClient.invalidateQueries({ queryKey: ['fixtures'] }),
				onSettled: () => picksSaving--,
			})),
			import: createMutation(() => ({
				mutationFn: (url: string) =>
					api<Fixture>(`/api/fixtures/${key}/import`, { method: 'POST', body: JSON.stringify({ url }) }),
				onMutate: () => ({ at: layout }),
				onSuccess: async (next: Fixture, _url: string, { at }: { at: string | null }) => {
					importUrls[key] = '';
					if (key === 'tv' && at === layout) dropTvDraft();
					storeFixture(next, at);
					await queryClient.invalidateQueries({ queryKey: [next.kind === 'wallTexture' ? 'textures' : 'catalog'] });
				},
			})),
			build: createMutation(() => ({
				mutationFn: (id: string) => api<Fixture>(`/api/fixtures/${key}/options/${id}/build`, { method: 'POST' }),
				onMutate: () => ({ at: layout }),
				onSuccess: async (next: Fixture, _id: string, { at }: { at: string | null }) => {
					storeFixture(next, at);
					await queryClient.invalidateQueries({ queryKey: [next.kind === 'wallTexture' ? 'textures' : 'catalog'] });
				},
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
			const res = await fetch('/ideas/readme.html');
			if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
			return res.text();
		},
		enabled: open.ideas,
	}));

	const texturesQuery = createQuery(() => ({
		...inLayout<WallTextureEntry[]>('textures', '/api/textures'),
		placeholderData: keepPreviousData,
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
	type Product = {
		name: string;
		image: string | null;
		url: string;
		facts: string[];
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
			[
				building(item.modelJob)
					? 'Building 3D model'
					: item.modelJob?.state === 'failed'
						? '3D model failed'
						: item.modelSource === 'generated'
							? 'AI 3D model'
							: item.model
								? '3D model'
								: 'No 3D model',
				placedCount(item.id) ? `${placedCount(item.id)} in the room` : null,
			]
				.filter(Boolean)
				.join(' · '),
		].filter(Boolean),
		warning,
	});
	function optionProduct(f: Fixture, option: FixtureOption): Product | null {
		const item = f.kind === 'item' ? catalog[option.id] : undefined;
		if (item) return itemProduct(item, option.warning);
		// The hand-sized TV has no listing to show.
		if (!option.url) return null;
		const { name, image, url, warning } = option;
		return { name, image, url, facts: [option.detail], warning };
	}
	const carpetProduct = (c: CarpetEntry): Product => ({
		name: c.name,
		image: carpetImage(c),
		url: c.url,
		facts: [carpetFacts(c), c.brand ?? ''].filter(Boolean),
		warning: null,
	});
	const host = (url: string) => new URL(url).hostname.replace('www.', '');

	// Every list in the side panel is a grid of these: click opens the card, hover peeks, the corner button adds it.
	type Tile = {
		id: string;
		name: string;
		image: string | null;
		// Wall textures tile their pattern at a fixed scale instead of fitting a photo.
		swatchSize: string | null;
		on: boolean;
		count: number;
		job: Job | null | undefined;
		warning: boolean;
		peek: () => PeekContent | null;
		open: () => void;
		action: { label: string; icon: '+' | '✓' | '↻'; run: () => void } | null;
	};
	function toggleAction(on: boolean, add: string, remove: string, run: (on: boolean) => void): Tile['action'] {
		return { label: on ? remove : add, icon: on ? '✓' : '+', run: () => run(on) };
	}
	function textureTile(t: WallTextureEntry): Tile {
		const select = fixtureActions.wallTexture.select;
		const built = t.texture && t.textureJob?.state !== 'failed';
		return {
			id: t.id,
			name: t.name,
			image: t.texture?.map ?? t.image,
			swatchSize: t.texture ? `${(t.texture.repeat.width / 12) * SWATCH_PX_PER_FT}px auto` : null,
			on: applied(t),
			count: 0,
			job: t.textureJob,
			warning: false,
			peek: () => ({ kind: 'texture', texture: t }),
			open: () => openCard({ kind: 'option', key: 'wallTexture', id: t.id }),
			action: building(t.textureJob)
				? null
				: built
					? toggleAction(applied(t), 'Put on the walls', 'Take off the walls', on => select.mutate(on ? null : t.id))
					: {
							label: t.textureJob ? 'Retry texture' : 'Build texture',
							icon: '↻',
							run: () => fixtureActions.wallTexture.build.mutate(t.id),
						},
		};
	}
	function optionTile(f: Fixture, option: FixtureOption): Tile {
		const actions = fixtureActions[f.key];
		return {
			id: option.id,
			name: option.name,
			image: option.image,
			swatchSize: null,
			on: option.id === f.selected,
			count: 0,
			job: option.job,
			warning: !!option.warning,
			peek: () => {
				const product = optionProduct(f, option);
				return product && { kind: 'product', product };
			},
			// A fixture holds one product, so a click picks it; the card has the button to take it out.
			open: () => {
				if (option.ready && option.id !== f.selected) actions.select.mutate(option.id);
				openCard({ kind: 'option', key: f.key, id: option.id });
			},
			action:
				option.job?.state === 'failed'
					? { label: 'Retry build', icon: '↻', run: () => actions.build.mutate(option.id) }
					: null,
		};
	}
	const itemTile = (item: CatalogEntry): Tile => ({
		id: item.id,
		name: item.name,
		image: item.image,
		swatchSize: null,
		on: placedCount(item.id) > 0,
		count: placedCount(item.id),
		job: item.modelJob,
		warning: false,
		peek: () => ({ kind: 'product', product: itemProduct(item) }),
		open: () => openCard({ kind: 'item', id: item.id }),
		action: { label: 'Add to room', icon: '+', run: () => void addToRoom(item.id) },
	});
	const carpetTile = (c: CarpetEntry): Tile => ({
		id: c.id,
		name: c.name,
		image: carpetImage(c),
		swatchSize: null,
		on: !!c.placement,
		count: 0,
		job: c.textureJobs[c.variant],
		warning: false,
		peek: () => ({ kind: 'product', product: carpetProduct(c) }),
		open: () => (c.placement ? viewer?.select({ kind: 'carpet', id: c.id }) : openCard({ kind: 'carpet', id: c.id })),
		action: toggleAction(!!c.placement, 'Add to room', 'Remove from room', on =>
			on ? removeCarpet(c) : void addCarpet(c),
		),
	});

	type Section = {
		key: SectionKey;
		title: string;
		summary: string;
		groups: (readonly [string | null, Tile[]])[];
		placeholder: string;
		importer: {
			mutate: (url: string) => void;
			isPending: boolean;
			isError: boolean;
			error: Error | null;
			variables: string | undefined;
		};
		errors: string[];
		loading: boolean;
	};
	const fixtureSection = (f: Fixture): Section => ({
		key: f.key,
		title: f.kind === 'wallTexture' ? `${f.room} wall texture` : f.title,
		summary: fixtureSummary(f),
		groups:
			f.kind === 'wallTexture'
				? textureGroups.map(([group, items]) => [group, items.map(textureTile)] as const)
				: [[null, f.options.map(o => optionTile(f, o))]],
		placeholder: f.importLabel,
		importer: fixtureActions[f.key].import,
		errors: [fixtureActions[f.key].select.error, fixtureActions[f.key].build.error].flatMap(e =>
			e ? [e.message] : [],
		),
		loading: f.kind === 'wallTexture' && texturesQuery.isPending,
	});

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
		saveTimer = setTimeout(savePlacements, SAVE_DELAY_MS);
	}
	function savePlacements() {
		clearTimeout(saveTimer);
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
	}
	async function pollPlacements() {
		const at = layout;
		if (!at) return;
		await saving.catch(() => {});
		const data = await api<Placement[]>('/api/placements', undefined, at);
		if (layout === at && !saveTimer && !unsaved.size) placements = data;
	}
	$effect(() => {
		const at = layout;
		if (!at) return;
		void api<Placement[]>('/api/placements', undefined, at).then(data => {
			if (layout !== at) return;
			placements = data;
			placementsLoaded = true;
		});
	});
	function patchPlacement(key: string, patch: Partial<Placement>) {
		updatePlacements(placements.map(p => (p.key === key ? { ...p, ...patch } : p)));
	}

	let selection = $state<Selection | null>(null);
	const selectedKey = $derived(selection?.kind === 'item' ? selection.key : null);
	const selectedPlacement = $derived(placements.find(p => p.key === selectedKey) ?? null);
	const selected = $derived(selectedPlacement ? catalog[selectedPlacement.itemId] : null);
	const placedCount = (itemId: string) => placements.filter(p => p.itemId === itemId).length;

	// A product opened from a list. Selecting in the plan replaces it, and opening one clears the plan's selection.
	type Opened =
		| { kind: 'item'; id: string }
		| { kind: 'carpet'; id: string }
		| { kind: 'option'; key: FixtureKey; id: string };
	let opened = $state<Opened | null>(null);
	function openCard(next: Opened) {
		viewer?.select(null);
		opened = next;
		peek = null;
	}
	function closeCard() {
		viewer?.select(null);
		opened = null;
	}
	type Card =
		| { kind: 'item'; item: CatalogEntry; placement: Placement | null; fixture: Fixture | null }
		| { kind: 'carpet'; carpet: CarpetEntry }
		| { kind: 'texture'; texture: WallTextureEntry; fixture: Fixture }
		| { kind: 'tv'; option: FixtureOption; fixture: Fixture };
	const card = $derived.by((): Card | null => {
		if (selected && selectedPlacement)
			return { kind: 'item', item: selected, placement: selectedPlacement, fixture: null };
		if (selectedCarpet) return { kind: 'carpet', carpet: selectedCarpet };
		const o = opened;
		if (o?.kind === 'item') {
			const item = catalog[o.id];
			return item ? { kind: 'item', item, placement: null, fixture: null } : null;
		}
		if (o?.kind === 'carpet') {
			const carpet = carpetList.find(c => c.id === o.id);
			return carpet ? { kind: 'carpet', carpet } : null;
		}
		const fixture = o && fixtures[o.key];
		const option = fixture?.options.find(x => x.id === o!.id);
		if (!fixture || !option) return null;
		if (fixture.kind === 'item') {
			const item = catalog[option.id];
			return item ? { kind: 'item', item, placement: null, fixture } : null;
		}
		if (fixture.kind === 'wallTexture') {
			const texture = textureList.find(t => t.id === option.id);
			return texture ? { kind: 'texture', texture, fixture } : null;
		}
		return { kind: 'tv', option, fixture };
	});
	const idOf = (c: Card) =>
		c.kind === 'item'
			? c.item.id
			: c.kind === 'carpet'
				? c.carpet.id
				: c.kind === 'texture'
					? c.texture.id
					: c.option.id;
	const cardId = $derived(card && idOf(card));

	// What deleting the card's product also takes away, for the confirmation.
	function deletion(c: Card): { name: string; path: string; also: string | null } {
		const id = encodeURIComponent(idOf(c));
		const option = (f: Fixture) => `/api/fixtures/${f.key}/options/${id}`;
		if (c.kind === 'item') {
			if (c.fixture)
				return {
					name: c.item.name,
					path: option(c.fixture),
					also: c.fixture.selected === c.item.id ? `The ${c.fixture.title.toLowerCase()} spot goes empty.` : null,
				};
			const n = placedCount(c.item.id);
			return {
				name: c.item.name,
				path: `/api/catalog/${id}`,
				also: n ? `The ${n === 1 ? 'one' : n} in the room ${n === 1 ? 'goes' : 'go'} too.` : null,
			};
		}
		if (c.kind === 'carpet')
			return {
				name: c.carpet.name,
				path: `/api/carpets/${id}`,
				also: c.carpet.placement ? 'It comes off the floor too.' : null,
			};
		if (c.kind === 'texture')
			return {
				name: c.texture.name,
				path: option(c.fixture),
				also: applied(c.texture) ? 'The walls go back to paint.' : null,
			};
		return {
			name: c.option.name,
			path: option(c.fixture),
			also: c.fixture.selected === c.option.id ? 'The TV stays up at this size.' : null,
		};
	}
	const deleteMutation = createMutation(() => ({
		mutationFn: ({ path }: { path: string; itemId: string | null }) => api(path, { method: 'DELETE' }),
		onSuccess: async (_: unknown, { itemId }: { path: string; itemId: string | null }) => {
			closeCard();
			// The server dropped the item's placements; a save of one still pending would only fail.
			if (itemId) {
				for (const p of placements) if (p.itemId === itemId) unsaved.delete(p.key);
				placements = placements.filter(p => p.itemId !== itemId);
			}
			await Promise.all(
				['catalog', 'carpets', 'textures', 'fixtures'].map(key => queryClient.invalidateQueries({ queryKey: [key] })),
			);
		},
	}));
	function deleteCard(c: Card) {
		const { name, path, also } = deletion(c);
		if (!confirm(`Delete ${name}?${also ? ` ${also}` : ''} Layouts that still have it in the room keep it.`)) return;
		deleteMutation.mutate({ path, itemId: c.kind === 'item' ? c.item.id : null });
	}
	const inches = (n: number) => `${Math.round(n * 10) / 10}"`;
	const money = (item: CatalogItem) =>
		item.price === null ? null : item.price.toLocaleString('en-US', { style: 'currency', currency: item.currency });

	// An import that finishes after the plan switched layouts lands in the layout it was pasted in, saved straight away
	// since that room isn't on screen.
	async function addToRoom(itemId: string, at = layout) {
		const key = crypto.randomUUID();
		const elevation = (catalog[itemId]?.defaultElevationIn ?? 0) / 12;
		const placement: Placement = { key, itemId, position: [SPAWN.x, elevation, SPAWN.z], rotation: [0, 0, 0] };
		if (at !== layout) {
			await api(`/api/placements/${key}`, { method: 'PUT', body: JSON.stringify(placement) }, at);
			return;
		}
		viewer?.snapWhenLoaded(key);
		updatePlacements([...placements, placement]);
		await tick();
		viewer?.select({ kind: 'item', key });
	}

	function rotate(delta: number) {
		if (!selectedPlacement) return;
		const [rx, ry, rz] = selectedPlacement.rotation;
		const deg = ((((ry + delta + 180) % 360) + 360) % 360) - 180;
		patchPlacement(selectedPlacement.key, { rotation: [rx, deg, rz] });
	}

	const mountLabel: Record<Mount, string> = {
		floor: 'Stands on the floor',
		wall: 'Hangs on a wall',
		ceiling: 'Hangs from the ceiling',
		surface: 'Sits on a surface',
	};

	function removeSelected() {
		if (!selectedKey) return;
		updatePlacements(placements.filter(p => p.key !== selectedKey));
		selection = null;
	}

	const plan = planGeometry();
	let carpetSavesPending = 0;
	let carpetSaves = 0;
	const carpetsQuery = createQuery(() => ({
		...inLayout<CarpetEntry[]>('carpets', '/api/carpets'),
		// A poll answered while a move is saving would put the carpet back for a cycle.
		queryFn: async ({ queryKey }: { queryKey: readonly unknown[] }) => {
			const data = await api<CarpetEntry[]>('/api/carpets', undefined, queryKey[1] as string);
			return carpetSavesPending ? (queryClient.getQueryData<CarpetEntry[]>(queryKey) ?? data) : data;
		},
		refetchInterval: query =>
			query.state.data?.some(c => Object.values(c.textureJobs).some(job => job.state !== 'failed')) ? 3000 : false,
	}));
	const carpetList = $derived(carpetsQuery.data ?? []);
	const selectedCarpet = $derived(
		selection?.kind === 'carpet' ? (carpetList.find(c => c.id === (selection as { id: string }).id) ?? null) : null,
	);
	let carpetError = $state<string | null>(null);
	// Saved optimistically; a reply to an older save that lands after a newer one is dropped.
	async function saveCarpet(id: string, patch: Partial<Pick<CarpetEntry, 'variant' | 'size' | 'placement'>>) {
		const n = ++carpetSaves;
		const key = ['carpets', layout];
		carpetError = null;
		carpetSavesPending++;
		void queryClient.cancelQueries({ queryKey: key });
		queryClient.setQueryData<CarpetEntry[]>(key, list => list?.map(c => (c.id === id ? { ...c, ...patch } : c)));
		try {
			const next = await api<CarpetEntry>(`/api/carpets/${id}`, { method: 'PUT', body: JSON.stringify(patch) });
			if (n === carpetSaves)
				queryClient.setQueryData<CarpetEntry[]>(key, list => list?.map(c => (c.id === next.id ? next : c)));
		} catch (error) {
			carpetError = (error as Error).message;
			if (n === carpetSaves) void queryClient.invalidateQueries({ queryKey: key });
		} finally {
			carpetSavesPending--;
		}
	}

	async function addCarpet(carpet: CarpetEntry) {
		const placement = carpetSpawn(carpet.size, plan);
		if (!placement) {
			carpetError = `At ${sizeLabel(carpet.size)} it doesn't fit in the middle of the living room`;
			return;
		}
		void saveCarpet(carpet.id, { placement });
		await tick();
		viewer?.select({ kind: 'carpet', id: carpet.id });
	}
	function removeCarpet(carpet: CarpetEntry) {
		if (selectedCarpet?.id === carpet.id) viewer?.select(null);
		void saveCarpet(carpet.id, { placement: null });
	}
	function turnCarpet(carpet: CarpetEntry, delta: number) {
		if (!carpet.placement) return;
		const yaw = ((((carpet.placement.yaw + delta + 180) % 360) + 360) % 360) - 180;
		const placement = { ...carpet.placement, yaw };
		if (carpetHitsWalls(placement, carpet.size, plan)) {
			carpetError = 'No room to turn it here. Drag it away from the wall first.';
			return;
		}
		void saveCarpet(carpet.id, { placement });
	}
	function resizeCarpet(carpet: CarpetEntry, size: CarpetSize) {
		if (carpet.placement && carpetHitsWalls(carpet.placement, size, plan)) {
			carpetError = `At ${sizeLabel(size)} it would cross a wall here. Drag it into open floor first.`;
			return;
		}
		void saveCarpet(carpet.id, { size });
	}
	// Another look keeps the size when it comes in it, else takes the closest one it does.
	function changeLook(carpet: CarpetEntry, id: string) {
		const look = carpet.variants.find(v => v.id === id)!;
		const size = closestSize(look.sizes, carpet.size);
		if (carpet.placement && carpetHitsWalls(carpet.placement, size, plan)) {
			carpetError = `${look.name} comes no closer to this size than ${sizeLabel(size)}, which would cross a wall here. Drag it into open floor first.`;
			return;
		}
		void saveCarpet(carpet.id, { variant: id, size });
	}
	const carpetImage = (c: CarpetEntry) => {
		const look = variantOf(c);
		return look.texture?.map ?? look.image;
	};
	const formatPrice = (price: number | null, currency: string) =>
		price === null ? null : price.toLocaleString('en-US', { style: 'currency', currency });
	// The layout saved the size with the price it had then; the listing's current price wins.
	const carpetPrice = (c: CarpetEntry) =>
		formatPrice(variantOf(c).sizes.find(s => sameSize(s, c.size))?.price ?? c.size.price, c.currency);
	const plural = (n: number, noun: string) => `${n} ${noun.toLowerCase()}${n === 1 ? '' : 's'}`;
	const carpetFacts = (c: CarpetEntry) => {
		const look = variantOf(c);
		return [
			[look.name, sizeLabel(c.size)].filter(Boolean).join(', '),
			carpetPrice(c),
			c.variants.length > 1 ? plural(c.variants.length, c.variantLabel) : null,
			look.sizes.length > 1 ? plural(look.sizes.length, 'size') : null,
		]
			.filter(Boolean)
			.join(' · ');
	};
	function carpetAxes(c: CarpetEntry): ConfigAxis[] {
		const look = variantOf(c);
		const axes: ConfigAxis[] = [];
		if (c.variants.length > 1)
			axes.push({
				key: 'look',
				label: c.variantLabel,
				selected: c.variant,
				pick: id => changeLook(c, id),
				choices: c.variants.map(v => ({
					id: v.id,
					label: v.name,
					image: v.texture?.map ?? v.image,
					busy: building(c.textureJobs[v.id]),
				})),
			});
		if (look.sizes.length > 1)
			axes.push({
				key: 'size',
				label: 'Size',
				selected: String(look.sizes.findIndex(s => sameSize(s, c.size))),
				pick: i => resizeCarpet(c, look.sizes[Number(i)]!),
				choices: look.sizes.map((s, i) => ({
					id: String(i),
					label: sizeLabel(s),
					detail: formatPrice(s.price, c.currency),
				})),
			});
		return axes;
	}
	// The selected product's configuration, shown over it in the plan.
	const selectedAxes = $derived(selectedCarpet ? carpetAxes(selectedCarpet) : []);

	const carpetImport = createMutation(() => ({
		mutationFn: (url: string) =>
			api<CarpetEntry>('/api/carpets/import', { method: 'POST', body: JSON.stringify({ url }) }),
		onMutate: () => ({ at: layout }),
		onSuccess: async (carpet: CarpetEntry, _url: string, { at }: { at: string | null }) => {
			importUrls.carpets = '';
			carpetError = null;
			await queryClient.invalidateQueries({ queryKey: ['carpets'] });
			// The server laid it on the floor of the layout it was pasted in.
			if (at !== layout) return;
			if (!carpet.placement) {
				carpetError = `At ${sizeLabel(carpet.size)} it doesn't fit in the middle of the living room`;
				return;
			}
			await tick();
			viewer?.select({ kind: 'carpet', id: carpet.id });
		},
	}));
	const carpetBuild = createMutation(() => ({
		mutationFn: ({ id, variant }: { id: string; variant: string }) =>
			api<CarpetEntry>(`/api/carpets/${id}/build`, { method: 'POST', body: JSON.stringify({ variant }) }),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ['carpets'] }),
	}));

	const importMutation = createMutation(() => ({
		mutationFn: (url: string) =>
			api<CatalogItem>('/api/catalog/import', { method: 'POST', body: JSON.stringify({ url }) }),
		onMutate: () => ({ at: layout }),
		onSuccess: async (item: CatalogItem, _url: string, { at }: { at: string | null }) => {
			importUrls.furniture = '';
			await queryClient.invalidateQueries({ queryKey: ['catalog'] });
			const fixture = fixtureCategories.get(item.category);
			if (!fixture) {
				// Codex can read a product as wall-mounted, which lists it under Wall.
				if (item.mount === 'wall') open.wall = true;
				return addToRoom(item.id, at);
			}
			// The server made it the fixture's pick.
			open[fixture] = true;
			await queryClient.invalidateQueries({ queryKey: ['fixtures'] });
		},
	}));
	// Whatever is pasted in the Wall panel hangs on a wall.
	const wallImport = createMutation(() => ({
		mutationFn: (url: string) =>
			api<CatalogItem>('/api/catalog/import', { method: 'POST', body: JSON.stringify({ url, mount: 'wall' }) }),
		onMutate: () => ({ at: layout }),
		onSuccess: async (item: CatalogItem, _url: string, { at }: { at: string | null }) => {
			importUrls.wall = '';
			await queryClient.invalidateQueries({ queryKey: ['catalog'] });
			await addToRoom(item.id, at);
		},
	}));

	// The item rebuilds under its new mount, and every copy in this room settles again as it loads: off a wall onto the
	// floor, or onto the nearest wall.
	const mountMutation = createMutation(() => ({
		mutationFn: ({ id, mount }: { id: string; mount: Mount }) =>
			api(`/api/catalog/${id}`, { method: 'PATCH', body: JSON.stringify({ mount }) }),
		onSuccess: async (_: unknown, { id, mount }: { id: string; mount: Mount }) => {
			for (const p of placements) if (p.itemId === id) viewer?.snapWhenLoaded(p.key);
			if (mount === 'wall') open.wall = true;
			else open.furniture = true;
			await queryClient.invalidateQueries({ queryKey: ['catalog'] });
		},
	}));

	const generateMutation = createMutation(() => ({
		mutationFn: (id: string) => api(`/api/catalog/${id}/model`, { method: 'POST' }),
		onSuccess: () => queryClient.invalidateQueries({ queryKey: ['catalog'] }),
	}));

	const sections = $derived<Section[]>([
		...fixtureList.map(fixtureSection),
		{
			key: 'furniture',
			title: 'Furniture',
			summary: String(furnitureList.length),
			groups: grouped(furnitureList).map(([group, items]) => [group, items!.map(itemTile)] as const),
			placeholder: 'Paste an Amazon or Walmart link',
			importer: importMutation,
			errors: [],
			loading: catalogQuery.isPending,
		},
		{
			key: 'wall',
			title: 'Wall',
			summary: String(wallList.length),
			groups: grouped(wallList).map(([group, items]) => [group, items!.map(itemTile)] as const),
			placeholder: 'Paste a link to art, a mirror or a wall shelf',
			importer: wallImport,
			errors: [],
			loading: catalogQuery.isPending,
		},
		{
			key: 'carpets',
			title: 'Carpets',
			summary: String(carpetList.length),
			groups: [[null, carpetList.map(carpetTile)]],
			placeholder: 'Paste a rug link',
			importer: carpetImport,
			errors: carpetError && !selectedCarpet ? [carpetError] : [],
			loading: carpetsQuery.isPending,
		},
	]);

	// Hand edits stay local until their save lands, so a fixtures poll can't snap the inputs back mid-drag.
	let tvDraft = $state<TvSettings | null>(null);
	const tv = $derived(tvDraft ?? fixtures.tv?.tv ?? null);
	let tvError = $state<string | null>(null);
	let tvSaveTimer: ReturnType<typeof setTimeout> | undefined;
	function updateTv(patch: Partial<TvSettings>) {
		if (!tv) return;
		tvDraft = { ...tv, ...patch };
		clearTimeout(tvSaveTimer);
		tvSaveTimer = setTimeout(saveTv, SAVE_DELAY_MS);
	}
	let tvSaving: Promise<unknown> = Promise.resolve();
	function saveTv() {
		clearTimeout(tvSaveTimer);
		tvSaveTimer = undefined;
		const sent = $state.snapshot(tvDraft);
		const at = layout;
		const request = api<Fixture>('/api/tv', { method: 'PUT', body: JSON.stringify(sent) });
		tvSaving = request.then(
			saved => {
				storeFixture(saved, at);
				if (layout !== at) return;
				tvError = null;
				if (!tvSaveTimer && JSON.stringify($state.snapshot(tvDraft)) === JSON.stringify(sent)) tvDraft = null;
			},
			error => {
				if (layout === at) tvError = (error as Error).message;
			},
		);
	}
	function dropTvDraft() {
		clearTimeout(tvSaveTimer);
		tvSaveTimer = undefined;
		tvDraft = null;
	}
	// Edits still waiting out their debounce are sent now, to the layout they were made in.
	function flushEdits() {
		if (saveTimer) savePlacements();
		if (tvSaveTimer) saveTv();
		return Promise.all([saving.catch(() => {}), tvSaving]);
	}
	function switchLayout(id: string) {
		if (id === layout) return;
		void flushEdits();
		closeCard();
		peek = null;
		tvDraft = null;
		carpetError = null;
		placements = [];
		placementsLoaded = false;
		layout = id;
	}
	const layoutList = $derived(layoutsQuery.data?.layouts ?? []);
	const activateLayout = createMutation(() => ({
		mutationFn: (id: string) =>
			api<LayoutList>('/api/layouts/active', { method: 'PUT', body: JSON.stringify({ id }) }, null),
		onMutate: switchLayout,
		onSuccess: (list: LayoutList) => queryClient.setQueryData(['layouts'], list),
	}));
	// Duplicate and new name the layout in a field that stands in for the dropdown until Enter or Escape.
	let naming = $state<'duplicate' | 'new' | null>(null);
	let layoutName = $state('');
	function startNaming(kind: 'duplicate' | 'new') {
		createLayout.reset();
		if (naming === kind) {
			naming = null;
			return;
		}
		naming = kind;
		const current = layoutList.find(l => l.id === layout)?.name;
		layoutName = kind === 'duplicate' && current ? `${current} copy` : '';
	}
	const createLayout = createMutation(() => ({
		mutationFn: async ({ name, from }: { name: string; from: string | null }) => {
			// A copy is made on the server, from what it has saved.
			if (from) await flushEdits();
			return api<LayoutList>('/api/layouts', { method: 'POST', body: JSON.stringify({ name, from }) }, null);
		},
		onSuccess: (list: LayoutList) => {
			queryClient.setQueryData(['layouts'], list);
			naming = null;
			switchLayout(list.active);
		},
	}));
	const deleteLayout = createMutation(() => ({
		// The plan moves to the layout the server will make active before the delete, so its polls never ask for a layout
		// that is gone. Edits still pending are saved to the old one first.
		onMutate: (id: string) => switchLayout(layoutList.find(l => l.id !== id)!.id),
		mutationFn: async (id: string) => {
			await flushEdits();
			return api<LayoutList>(`/api/layouts/${encodeURIComponent(id)}`, { method: 'DELETE' }, null);
		},
		onSuccess: (list: LayoutList) => {
			queryClient.setQueryData(['layouts'], list);
			switchLayout(list.active);
		},
	}));
	function confirmDeleteLayout() {
		const current = layoutList.find(l => l.id === layout);
		if (current && confirm(`Delete the layout ${current.name}? Its room, picks and carpets go with it.`))
			deleteLayout.mutate(current.id);
	}
	const focusAndSelect: Attachment<HTMLInputElement> = el => {
		el.focus();
		el.select();
	};

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
	const tvReach = (tv: TvSettings) => round1((TV_MOUNT_IN + tv.widthIn) / Math.SQRT2);
	function setDiagonal(value: string) {
		const diagonal = positive(value);
		if (!tv || !diagonal) return;
		const k = diagonal / tvDiagonal(tv);
		updateTv({ widthIn: tv.widthIn * k, heightIn: tv.heightIn * k });
	}

	function onKey(e: KeyboardEvent) {
		if (mode !== 'orbit' || (e.target as HTMLElement).closest('input, textarea, select')) return;
		if (e.key === 'Escape' && card) closeCard();
		else if (selection && (e.key === 'Delete' || e.key === 'Backspace')) {
			if (selectedCarpet) removeCarpet(selectedCarpet);
			else removeSelected();
		}
	}

	onMount(() => {
		const v = createViewer(
			container,
			next => (mode = next),
			next => {
				selection = next;
				if (next) opened = null;
			},
			(key, position, rotation) => patchPlacement(key, { position, rotation }),
			(id, placement) => void saveCarpet(id, { placement }),
			state => (measure = state),
		);
		v.setOverlay(overlay);
		viewer = v;
		const poll = setInterval(() => void pollPlacements().catch(() => {}), 2000);
		return () => {
			clearInterval(poll);
			v.dispose();
		};
	});

	$effect(() => viewer?.setCutaway(cutaway));
	$effect(() => viewer?.setDoors(doors));
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
		viewer?.setCarpets($state.snapshot(carpetList));
	});
	$effect(() => {
		const id = fixtures.wallTexture?.selected;
		viewer?.setWallTexture(textureList.find(t => t.id === id) ?? null);
	});
	$effect(() => localStorage.setItem(OPTIONS_KEY, JSON.stringify({ cutaway, doors, open, collapsedGroups })));
</script>

<svelte:window onkeydown={onKey} />

<svelte:head>
	<title>Apartment</title>
</svelte:head>

<div class="viewer" bind:this={container}>
	<div class="overlay" bind:this={overlay}>
		{#if selectedAxes.length}
			<div class="panel">
				<Configurator axes={selectedAxes} compact />
				{#if carpetError}<p class="error">{carpetError}</p>{/if}
			</div>
		{/if}
	</div>
</div>

<div class="left panel">
	{#if import.meta.env.DEV}<p class="dev-band">local dev database</p>{/if}
	<header class="hud">
		<div class="layouts">
			<button
				type="button"
				class="icon"
				aria-label="Delete layout"
				title={layoutList.length > 1 ? 'Delete layout' : 'The last layout cannot be deleted'}
				disabled={layoutList.length < 2 || !!naming || deleteLayout.isPending}
				onclick={confirmDeleteLayout}
			>
				<svg viewBox="0 0 16 16" aria-hidden="true"
					><path
						d="M2.5 4h11M6 4V2.5h4V4M4 4l.7 9.1a1 1 0 0 0 1 .9h4.6a1 1 0 0 0 1-.9L12 4M6.75 6.5v5M9.25 6.5v5"
					/></svg
				>
			</button>
			{#if naming}
				<input
					type="text"
					aria-label={naming === 'duplicate' ? 'Name of the copy' : 'Name of the new layout'}
					placeholder={naming === 'duplicate' ? 'Name of the copy' : 'New layout name'}
					bind:value={layoutName}
					disabled={createLayout.isPending}
					{@attach focusAndSelect}
					onkeydown={e => {
						if (e.key === 'Escape') naming = null;
						else if (e.key === 'Enter' && layoutName.trim())
							createLayout.mutate({ name: layoutName.trim(), from: naming === 'duplicate' ? layout : null });
					}}
				/>
			{:else}
				<select
					aria-label="Layout"
					value={layout}
					disabled={!layoutList.length}
					onchange={e => activateLayout.mutate(e.currentTarget.value)}
				>
					{#each layoutList as l (l.id)}<option value={l.id}>{l.name}</option>{/each}
				</select>
			{/if}
			<button
				type="button"
				class="icon"
				aria-label="Duplicate layout"
				title="Duplicate layout"
				aria-pressed={naming === 'duplicate'}
				onclick={() => startNaming('duplicate')}
			>
				<svg viewBox="0 0 16 16" aria-hidden="true"
					><rect x="5" y="5" width="9" height="9" rx="1.5" /><path
						d="M11 5V3.5A1.5 1.5 0 0 0 9.5 2h-6A1.5 1.5 0 0 0 2 3.5v6A1.5 1.5 0 0 0 3.5 11H5"
					/></svg
				>
			</button>
			<button
				type="button"
				class="icon"
				aria-label="New layout"
				title="New layout"
				aria-pressed={naming === 'new'}
				onclick={() => startNaming('new')}
			>
				<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3v10M3 8h10" /></svg>
			</button>
		</div>
		{#if createLayout.isError}<p class="error">{createLayout.error.message}</p>{/if}
		{#if deleteLayout.isError}<p class="error">{deleteLayout.error.message}</p>{/if}
		{#if activateLayout.isError}<p class="error">{activateLayout.error.message}</p>{/if}
		{#if layoutsQuery.isError}<p class="error">{layoutsQuery.error.message}</p>{/if}
		<button type="button" class="primary" onclick={() => viewer?.setMode(mode === 'orbit' ? 'walk' : 'orbit')}>
			{mode === 'orbit' ? 'Walk inside' : 'Back to overview'}
		</button>
		{#if mode === 'orbit'}
			<div class="toggles">
				<label><input type="checkbox" bind:checked={cutaway} /> Cutaway walls</label>
				<label><input type="checkbox" bind:checked={doors} /> Render doors</label>
			</div>
		{:else}
			<p class="help">WASD or arrows to move, mouse to look, click to inspect, Shift to run, Esc to exit.</p>
		{/if}
	</header>

	{#if mode === 'orbit'}
		{#if !fixtureList.length}
			<p class="muted">{fixturesQuery.isError ? fixturesQuery.error.message : 'Loading…'}</p>
		{/if}
		{#each sections as s (s.key)}
			<section>
				<button
					type="button"
					class="section-toggle"
					aria-expanded={open[s.key]}
					onclick={() => (open[s.key] = !open[s.key])}
				>
					{s.title} <span class="muted">{s.summary}</span>
				</button>
				{#if open[s.key]}
					{#if s.key === 'tv' && tv}
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
							Bottom {round1(tv.centerIn - tv.heightIn / 2)}″ · top {round1(
								tv.centerIn + tv.heightIn / 2,
							)}″{#if tv.placement === 'corner'}
								· {tvReach(tv)}″ along each wall{/if}
						</p>
						{#if tvError}<p class="error">{tvError}</p>{/if}
					{/if}
					{#if s.key === 'wallTexture'}
						{#each s.groups as [group, tiles] (group)}
							<h3 class="group">{group} <span class="muted">{tiles.length}</span></h3>
							<div class="swatches">
								{#each tiles as t (t.id)}{@render swatch(t)}{/each}
							</div>
						{/each}
						{#if s.importer.isPending}<div class="swatches">
								<span class="swatch busy" aria-label="Importing"></span>
							</div>{/if}
					{:else}{#each s.groups as [group, tiles] (group)}
							{@const groupKey = `${s.key}/${group}`}
							{@const expanded = !collapsedGroups.includes(groupKey)}
							{#if group}
								<button
									type="button"
									class="section-toggle group-toggle"
									aria-expanded={expanded}
									onclick={() => toggleGroup(groupKey)}
								>
									{group} <span>{tiles.length}</span>
								</button>
							{/if}
							{#if !group || expanded}
								<div class="tiles">
									{#each tiles as t (t.id)}{@render tile(t)}{/each}
								</div>
							{/if}
						{/each}{/if}
					{#if s.importer.isPending && s.key !== 'wallTexture'}
						<div class="tiles">
							<div class="tile busy">
								<span class="face"><span class="name">{host(s.importer.variables!)}</span></span>
							</div>
						</div>
					{:else if s.loading}
						<p class="muted">Loading…</p>
					{/if}
					{#each s.errors as error (error)}<p class="error">{error}</p>{/each}
					<form
						class="import"
						onsubmit={e => {
							e.preventDefault();
							if (importUrls[s.key].trim()) s.importer.mutate(importUrls[s.key].trim());
						}}
					>
						<input
							type="url"
							placeholder={s.placeholder}
							bind:value={importUrls[s.key]}
							disabled={s.importer.isPending}
						/>
						<button type="submit" class="primary" disabled={s.importer.isPending || !importUrls[s.key].trim()}>
							{s.importer.isPending ? 'Importing…' : 'Import'}
						</button>
					</form>
					{#if s.importer.isError}<p class="error">{s.importer.error?.message}</p>{/if}
				{/if}
			</section>
		{/each}
	{/if}
</div>

<!-- Wall textures stay a dense grid of pattern swatches at one scale, so slat widths compare at a glance. A click puts
	the texture on the walls (or builds it) and opens its card. -->
{#snippet swatch(t: Tile)}
	<button
		type="button"
		class="swatch"
		class:on-target={t.on}
		class:open={t.id === cardId}
		class:busy={building(t.job)}
		class:failed={t.job?.state === 'failed'}
		style:background-image="url({t.image})"
		style:background-size={t.swatchSize ?? 'cover'}
		aria-label={t.name}
		onclick={() => {
			if (!t.on) t.action?.run();
			t.open();
		}}
		{@attach peekOn(() => t.peek())}
	></button>
{/snippet}

{#snippet tile(t: Tile)}
	<div
		class="tile"
		class:on={t.on}
		class:open={t.id === cardId}
		class:busy={building(t.job)}
		class:failed={t.job?.state === 'failed'}
		{@attach peekOn(() => t.peek())}
	>
		<button
			type="button"
			class="face"
			aria-label={t.name}
			onclick={t.open}
			style:background-image={t.swatchSize ? `url(${t.image})` : null}
			style:background-size={t.swatchSize}
		>
			{#if t.swatchSize}{:else if t.image}<img src={t.image} alt="" loading="lazy" />{:else}<span class="name"
					>{t.name}</span
				>{/if}
		</button>
		{#if t.count > 1}<span class="badge count">{t.count}</span>{/if}
		{#if t.warning}<span class="badge warning" aria-hidden="true">!</span>{/if}
		{#if t.action}
			{@const action = t.action}
			<button
				type="button"
				class="add"
				class:on={action.icon === '✓'}
				aria-label={action.label}
				title={action.label}
				onclick={action.run}>{action.icon}</button
			>
		{/if}
	</div>
{/snippet}

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

	{#if card}
		{@const cardJob =
			card.kind === 'item'
				? card.item.modelJob
				: card.kind === 'carpet'
					? (card.carpet.textureJobs[card.carpet.variant] ?? null)
					: null}
		<aside class="panel card">
			<button type="button" class="close" aria-label="Close" onclick={closeCard}>×</button>
			{#if card.kind === 'item'}
				{@const item = card.item}
				{@const placement = card.placement}
				{@const fixture = card.fixture}
				{#if item.image}<img src={item.image} alt={item.name} />{/if}
				<h2>{item.name}</h2>
				<p class="meta">
					{#if money(item)}<strong>{money(item)}</strong>{/if}
					{#if item.brand}<span>{item.brand}</span>{/if}
					{#if fixture}<span>{mountLabel[item.mount]}</span>{/if}
				</p>
				{#if item.dimensions}
					<p class="dims">
						{inches(item.dimensions.width)} W × {inches(item.dimensions.height)} H × {inches(item.dimensions.depth)} D{#if item.weightLb}
							· {item.weightLb} lb{/if}
					</p>
				{/if}

				<div class="controls">
					{#if !fixture}
						<label class="row">
							<span>Placed</span>
							<select
								value={item.mount}
								disabled={mountMutation.isPending}
								onchange={e => mountMutation.mutate({ id: item.id, mount: e.currentTarget.value as Mount })}
							>
								{#each MOUNTS as mount (mount)}
									<option value={mount}>{mountLabel[mount]}</option>
								{/each}
							</select>
						</label>
						{#if mountMutation.isError}<p class="error">{mountMutation.error.message}</p>{/if}
					{/if}
					{#if placement}
						<!-- A wall piece faces out of the wall it hangs on. -->
						{#if item.mount !== 'wall'}
							<div class="row">
								<span>Turn</span>
								<button type="button" onclick={() => rotate(-90)}>↺ 90°</button>
								<button type="button" onclick={() => rotate(-15)}>−15°</button>
								<button type="button" onclick={() => rotate(15)}>+15°</button>
								<button type="button" onclick={() => rotate(90)}>↻ 90°</button>
							</div>
						{/if}
						<label class="row">
							<span>Height off floor</span>
							<input
								type="number"
								min="0"
								max="100"
								step="1"
								value={Math.round(placement.position[1] * 12 * 10) / 10}
								oninput={e => {
									const [x, , z] = placement.position;
									patchPlacement(placement.key, { position: [x, (Number(e.currentTarget.value) || 0) / 12, z] });
								}}
							/>
							<span class="muted">in</span>
						</label>
						<div class="row">
							<button type="button" onclick={() => addToRoom(item.id)}>Add another</button>
							<button type="button" class="danger" onclick={removeSelected}>Remove from room</button>
						</div>
					{:else if fixture}
						{@const picked = fixture.selected === item.id}
						<div class="row">
							<button
								type="button"
								class:danger={picked}
								onclick={() => fixtureActions[fixture.key].select.mutate(picked ? null : item.id)}
							>
								{picked ? 'Take out of the room' : 'Put in the room'}
							</button>
						</div>
					{:else}
						<div class="row">
							<button type="button" onclick={() => addToRoom(item.id)}>Add to room</button>
							{#if placedCount(item.id)}<span class="muted">{placedCount(item.id)} in the room</span>{/if}
						</div>
					{/if}
				</div>

				<p class="model-status">
					{#if cardJob?.state === 'queued' || cardJob?.state === 'running'}
						<span class="status busy">Building 3D model · 2–5 min</span>
					{:else}
						{#if cardJob?.state === 'failed'}<span class="error">3D model failed: {cardJob.error}</span>
						{:else if item.modelSource === 'listing'}<span class="muted">3D model from the listing</span>
						{:else if item.modelSource === 'generated'}<span class="muted">AI 3D model</span>
						{:else}<span class="muted">No 3D model</span>{/if}
						{#if item.modelSource !== 'listing'}
							<button type="button" onclick={() => generateMutation.mutate(item.id)}>
								{item.modelSource === 'generated' ? 'Regenerate' : 'Generate'} 3D model
							</button>
						{/if}
					{/if}
				</p>

				<a href={item.url} target="_blank" rel="noreferrer">View on {host(item.url)} ↗</a>
			{:else if card.kind === 'carpet'}
				{@const c = card.carpet}
				{@const look = variantOf(c)}
				{@const drawing = Object.values(c.textureJobs).filter(building).length}
				{#if carpetImage(c)}<img src={carpetImage(c)} alt={c.name} />{/if}
				<h2>{c.name}</h2>
				<p class="meta">
					{#if carpetPrice(c)}<strong>{carpetPrice(c)}</strong>{/if}
					{#if c.brand}<span>{c.brand}</span>{/if}
					<span>Carpet</span>
				</p>
				<p class="dims">{[look.name, sizeLabel(c.size)].filter(Boolean).join(', ')}</p>

				<div class="controls">
					{#if carpetAxes(c).length}<Configurator axes={carpetAxes(c)} />{/if}
					{#if c.placement}
						<div class="row">
							<span>Turn</span>
							<button type="button" onclick={() => turnCarpet(c, -90)}>↺ 90°</button>
							<button type="button" onclick={() => turnCarpet(c, -15)}>−15°</button>
							<button type="button" onclick={() => turnCarpet(c, 15)}>+15°</button>
							<button type="button" onclick={() => turnCarpet(c, 90)}>↻ 90°</button>
						</div>
						<div class="row">
							<button type="button" class="danger" onclick={() => removeCarpet(c)}>Remove from room</button>
						</div>
					{:else}
						<div class="row">
							<button type="button" onclick={() => addCarpet(c)}>Add to room</button>
						</div>
					{/if}
					{#if carpetError}<p class="error">{carpetError}</p>{/if}
				</div>

				<p class="model-status">
					{#if cardJob?.state === 'queued' || cardJob?.state === 'running'}
						<span class="status busy">Drawing the rug · 2–5 min</span>
					{:else}
						{#if cardJob?.state === 'failed'}<span class="error">Drawing the rug failed: {cardJob.error}</span>
						{:else if !look.texture}<span class="muted">No rug image yet</span>{/if}
						<button type="button" onclick={() => carpetBuild.mutate({ id: c.id, variant: c.variant })}>
							{look.texture ? 'Redraw' : 'Draw'}
							{look.name || 'the rug'}
						</button>
					{/if}
					{#if drawing > 1 || (drawing === 1 && !building(cardJob))}
						<span class="muted">{plural(drawing, c.variantLabel)} still being drawn</span>
					{/if}
				</p>

				<a href={c.url} target="_blank" rel="noreferrer">View on {host(c.url)} ↗</a>
			{:else if card.kind === 'texture'}
				{@const t = card.texture}
				{@const building = t.textureJob?.state === 'queued' || t.textureJob?.state === 'running'}
				{#if t.texture}<span class="tip-swatch" style:background-image="url({t.texture.map})"></span>
				{:else if t.image}<img src={t.image} alt={t.name} />{/if}
				<h2>{t.name}</h2>
				<div class="controls">
					<div class="row">
						{#if t.texture && !building}
							<button
								type="button"
								class:danger={applied(t)}
								onclick={() => fixtureActions.wallTexture.select.mutate(applied(t) ? null : t.id)}
							>
								{applied(t) ? 'Take off the walls' : 'Put on the TV wall and column'}
							</button>
						{/if}
						{#if building}
							<span class="status busy">Building texture · 2–5 min</span>
						{:else}
							<button type="button" onclick={() => fixtureActions.wallTexture.build.mutate(t.id)}>
								{t.texture ? 'Rebuild' : 'Build'} texture
							</button>
						{/if}
					</div>
					{#if t.textureJob?.state === 'failed'}<p class="error">
							Texture failed: {t.textureJob.error.slice(0, 300)}
						</p>{/if}
				</div>
				{@render textureFacts(t)}
			{:else}
				{@const option = card.option}
				{@const picked = card.fixture.selected === option.id}
				{#if option.image}<img src={option.image} alt={option.name} />{/if}
				<h2>{option.name}</h2>
				<p class="meta"><span>{option.detail}</span></p>
				<div class="controls">
					<div class="row">
						<button
							type="button"
							class:danger={picked}
							onclick={() => fixtureActions[card.fixture.key].select.mutate(picked ? null : option.id)}
						>
							{picked ? 'Hide the TV' : 'Use this TV'}
						</button>
					</div>
				</div>
				{#if option.url}<a href={option.url} target="_blank" rel="noreferrer">View on {host(option.url)} ↗</a>{/if}
			{/if}
			{#if card.kind !== 'tv' || card.option.url}
				<div class="delete">
					<button type="button" class="danger" disabled={deleteMutation.isPending} onclick={() => deleteCard(card)}>
						{deleteMutation.isPending ? 'Deleting…' : 'Delete'}
					</button>
				</div>
				{#if deleteMutation.isError}<p class="error">{deleteMutation.error.message}</p>{/if}
			{/if}
		</aside>
	{/if}
</div>

{#snippet textureFacts(t: WallTextureEntry)}
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
	{#if applied(t)}<span class="applied">On the TV wall and column</span>{/if}
	<a href={t.url} target="_blank" rel="noreferrer">View on {host(t.url)} ↗</a>
{/snippet}

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
				<span class="error">Texture failed: {t.textureJob.error.slice(0, 160)}</span>
			{:else if !t.texture}
				<span class="muted">No texture yet</span>
			{/if}
			{@render textureFacts(t)}
		{:else}
			{@const p = peek.content.product}
			{#if p.image}<img src={p.image} alt={p.name} />{/if}
			<strong>{p.name}</strong>
			{#each p.facts as fact (fact)}<span>{fact}</span>{/each}
			{#if p.warning}<span class="error">{p.warning}</span>{/if}
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

	/* Placed above the selected thing by the viewer; above the canvas, below the side panels. */
	.overlay {
		position: absolute;
		top: 0;
		left: 0;
		z-index: 1;
		visibility: hidden;
		pointer-events: none;
	}

	.overlay .panel {
		display: grid;
		gap: 0.4rem;
		max-width: min(19rem, calc(100vw - 2rem));
		padding: 0.55rem 0.65rem;
	}

	.panel {
		padding: 1rem;
		border: 1px solid var(--app-border);
		border-radius: 0.5rem;
		background: color-mix(in srgb, var(--app-panel) 92%, transparent);
		color: var(--app-panel-text);
		pointer-events: auto;
	}

	/* One panel scrolled as a whole, so the plan stays clickable below it. */
	.left {
		position: fixed;
		top: 1rem;
		left: 1rem;
		display: flex;
		flex-direction: column;
		width: 20rem;
		max-height: calc(100vh - 2rem);
		overflow-y: auto;
		overscroll-behavior: contain;
		padding: 0;
		font-size: 0.85rem;
		scrollbar-width: thin;
	}

	.left > * {
		flex-shrink: 0;
	}

	/* Pinned while the panel scrolls, so a change made here is never mistaken for one made in production. */
	.left > .dev-band {
		position: sticky;
		top: 0;
		z-index: 1;
		margin: 0;
		padding: 0.3rem 0.75rem;
		background: #b45309;
		color: #fff;
		font-weight: 600;
		text-align: center;
	}

	.hud {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem 0.75rem;
		align-items: center;
		padding: 0.75rem;
	}

	.toggles {
		display: grid;
		gap: 0.2rem;
	}

	.layouts {
		display: flex;
		flex-basis: 100%;
		gap: 0.4rem;
	}

	.layouts select,
	.layouts input {
		flex: 1;
		min-width: 0;
		border: 1px solid var(--app-border);
		border-radius: 0.375rem;
		padding: 0.4rem 0.5rem;
		background: var(--app-bg);
		color: var(--app-text);
		font: inherit;
	}

	.hud .error {
		flex-basis: 100%;
	}

	button.icon {
		display: grid;
		place-items: center;
		flex: none;
		width: 2.1rem;
		padding: 0;
	}

	button.icon svg {
		width: 1rem;
		height: 1rem;
		fill: none;
		stroke: currentColor;
		stroke-linecap: round;
		stroke-linejoin: round;
		stroke-width: 1.5;
	}

	button.icon[aria-pressed='true'] {
		border-color: var(--app-accent);
		color: var(--app-accent);
	}

	.left > p {
		padding: 0 0.75rem 0.75rem;
	}

	.left section {
		display: grid;
		gap: 0.5rem;
		padding: 0.6rem 0.75rem 0.75rem;
		border-top: 1px solid var(--app-border);
	}

	.left section:has(> .section-toggle[aria-expanded='false']) {
		padding-bottom: 0.6rem;
	}

	.section-toggle.group-toggle {
		margin-top: 0.15rem;
		color: var(--app-muted);
		font-size: 0.7rem;
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.left h3.group {
		margin: 0.2rem 0 -0.2rem;
		font-size: 0.75rem;
		font-weight: 600;
	}

	.swatches {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(2.6rem, 1fr));
		gap: 0.35rem;
	}

	.swatch {
		position: relative;
		aspect-ratio: 1;
		padding: 0;
		border: none;
		border-radius: 0.3rem;
		background-color: #fff;
		background-position: center;
		background-repeat: repeat;
	}

	/* Outlines sit outside the square, so a picked or open swatch keeps its full image. */
	.swatch.open,
	.tile.open .face {
		outline: 2px solid var(--app-panel-text);
		outline-offset: 2px;
	}

	.swatch.on-target,
	.tile.on .face {
		outline: 2px solid var(--app-accent);
		outline-offset: 2px;
	}

	.swatch.busy::after,
	.swatch.failed::after {
		content: '';
		position: absolute;
		inset: 0;
		border-radius: 0.3rem;
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

	.tiles {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 0.4rem;
	}

	.tile {
		position: relative;
		aspect-ratio: 1;
	}

	.tile .face {
		display: grid;
		place-items: center;
		width: 100%;
		height: 100%;
		overflow: hidden;
		padding: 0;
		border: none;
		border-radius: 0.4rem;
		background-color: #fff;
		background-position: center;
		background-repeat: repeat;
	}

	.tile img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.tile .name {
		overflow: hidden;
		padding: 0.3rem;
		color: #1c1f24;
		font-size: 0.7rem;
		font-weight: 600;
		line-height: 1.2;
		text-align: center;
		overflow-wrap: anywhere;
	}

	.tile.busy .face::after,
	.tile.failed .face::after {
		content: '';
		position: absolute;
		inset: 0;
		border-radius: 0.4rem;
		background: rgb(0 0 0 / 0.45);
	}

	.tile.failed .face::after {
		background: color-mix(in srgb, var(--app-error) 45%, transparent);
	}

	.tile.busy .face::before {
		content: '';
		position: absolute;
		z-index: 1;
		inset: 35%;
		border: 2px solid #fff;
		border-right-color: transparent;
		border-radius: 50%;
		animation: spin 0.8s linear infinite;
	}

	.tile .add {
		position: absolute;
		right: 0.25rem;
		bottom: 0.25rem;
		z-index: 2;
		display: grid;
		place-items: center;
		width: 1.6rem;
		height: 1.6rem;
		padding: 0;
		border: none;
		border-radius: 50%;
		background: rgb(28 31 36 / 0.8);
		color: #fff;
		font-size: 1rem;
		line-height: 1;
	}

	.tile .add:hover {
		background: rgb(28 31 36);
	}

	.tile .add.on {
		background: var(--app-accent);
		color: var(--app-accent-ink);
		font-size: 0.8rem;
	}

	.tile .badge {
		position: absolute;
		top: 0.25rem;
		z-index: 2;
		display: grid;
		place-items: center;
		min-width: 1.2rem;
		height: 1.2rem;
		padding: 0 0.3rem;
		border-radius: 0.6rem;
		font-size: 0.7rem;
		font-weight: 700;
		pointer-events: none;
	}

	.tile .count {
		left: 0.25rem;
		background: var(--app-accent);
		color: var(--app-accent-ink);
	}

	.tile .warning {
		right: 0.25rem;
		background: var(--app-error);
		color: #fff;
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

	.peek img {
		width: 100%;
		height: 14rem;
		margin-bottom: 0.2rem;
		border-radius: 0.375rem;
		background: #fff;
		object-fit: contain;
	}

	.peek a {
		justify-self: start;
		margin-top: 0.2rem;
		color: var(--app-accent);
		font-weight: 600;
	}

	.tip-swatch {
		height: 4.5rem;
		border-radius: 0.3rem;
		background-size: 3rem auto;
	}

	.peek .applied,
	.card .applied {
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

	.controls select {
		border: 1px solid var(--app-border);
		border-radius: 0.375rem;
		padding: 0.3rem 0.4rem;
		background: var(--app-bg);
		color: var(--app-text);
	}

	button.danger {
		border-color: var(--app-error);
		color: var(--app-error);
	}

	button:disabled {
		opacity: 0.5;
		cursor: default;
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

	.card p {
		margin: 0;
	}

	.card .meta {
		display: flex;
		gap: 0.75rem;
		align-items: baseline;
	}

	.card .meta span {
		color: var(--app-muted);
	}

	.card .delete {
		display: flex;
		gap: 0.6rem;
		align-items: center;
		padding-top: 0.6rem;
		border-top: 1px solid var(--app-border);
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
