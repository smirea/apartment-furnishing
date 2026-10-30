<script lang="ts">
	import { onMount } from 'svelte';
	import { createViewer, type Mode } from '../lib/scene';

	let container: HTMLDivElement;
	let mode = $state<Mode>('orbit');
	let cutaway = $state(true);
	let viewer: ReturnType<typeof createViewer>;

	onMount(() => {
		viewer = createViewer(container, next => (mode = next));
		return () => viewer.dispose();
	});

	$effect(() => viewer?.setCutaway(cutaway));
</script>

<svelte:head>
	<title>84 East Ave #2209</title>
</svelte:head>

<div class="viewer" bind:this={container}></div>

<header class="hud">
	<h1>84 East Ave #2209 <span>Vesper B4 · 1,176 sqft</span></h1>
	<div class="actions">
		<button type="button" class="primary" onclick={() => viewer.setMode(mode === 'orbit' ? 'walk' : 'orbit')}>
			{mode === 'orbit' ? 'Walk inside' : 'Back to overview'}
		</button>
		{#if mode === 'orbit'}
			<label><input type="checkbox" bind:checked={cutaway} /> Cutaway walls</label>
		{/if}
	</div>
	<p class="help">
		{#if mode === 'orbit'}
			Drag to rotate, right-drag to pan, scroll to zoom.
		{:else}
			WASD or arrows to move, mouse to look, Shift to run, Esc to exit.
		{/if}
	</p>
</header>

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
