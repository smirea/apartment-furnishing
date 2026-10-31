<script lang="ts">
	import { onMount } from 'svelte';
	import { createViewer, type Mode } from '../lib/scene';
	import { catalog } from '../lib/items';

	let container: HTMLDivElement;
	let mode = $state<Mode>('orbit');
	const OPTIONS_KEY = 'viewer-options';
	const saved = JSON.parse(localStorage.getItem(OPTIONS_KEY) ?? '{}');
	let cutaway = $state<boolean>(saved.cutaway ?? true);
	let labels = $state<boolean>(saved.labels ?? false);
	let viewer = $state<ReturnType<typeof createViewer>>();
	let selectedId = $state<string | null>(null);
	const selected = $derived(selectedId ? catalog[selectedId] : null);
	const inches = (n: number) => `${Math.round(n * 10) / 10}"`;

	onMount(() => {
		const v = createViewer(
			container,
			next => (mode = next),
			id => (selectedId = id),
		);
		viewer = v;
		return () => v.dispose();
	});

	$effect(() => viewer?.setCutaway(cutaway));
	$effect(() => viewer?.setLabels(labels));
	$effect(() => localStorage.setItem(OPTIONS_KEY, JSON.stringify({ cutaway, labels })));
</script>

<svelte:head>
	<title>84 East Ave #2209</title>
</svelte:head>

<div class="viewer" bind:this={container}></div>

<header class="hud">
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
			Drag to rotate, right-drag to pan, scroll to zoom. Click an item for details.
		{:else}
			WASD or arrows to move, mouse to look, click to inspect, Shift to run, Esc to exit.
		{/if}
	</p>
</header>

{#if selected}
	<aside class="card">
		<button type="button" class="close" aria-label="Close" onclick={() => (selectedId = null)}>×</button>
		{#if selected.image}<img src={selected.image} alt={selected.name} />{/if}
		<h2>{selected.name}</h2>
		<p class="meta">
			{#if selected.price !== null}<strong
					>{selected.price.toLocaleString('en-US', { style: 'currency', currency: selected.currency })}</strong
				>{/if}
			{#if selected.brand}<span>{selected.brand}</span>{/if}
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

	.hud {
		position: fixed;
		top: 1rem;
		left: 1rem;
		display: grid;
		gap: 0.75rem;
		max-width: 22rem;
		padding: 1rem;
		border: 1px solid var(--app-border);
		border-radius: 0.5rem;
		background: color-mix(in srgb, var(--app-panel) 88%, transparent);
		color: var(--app-panel-text);
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
