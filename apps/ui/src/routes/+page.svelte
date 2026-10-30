<script lang="ts">
	import { createQuery } from '@tanstack/svelte-query';

	type Theme = 'dark' | 'light';
	type Status = { ok: boolean; now: string };

	let theme = $state<Theme>('dark');
	const status = createQuery(() => ({
		queryKey: ['status'],
		queryFn: fetchStatus,
	}));

	$effect(() => {
		if (typeof document === 'undefined') return;
		document.documentElement.dataset.theme = theme;
	});

	async function fetchStatus(): Promise<Status> {
		const response = await fetch('/api/status');
		if (!response.ok) throw new Error(await response.text());
		return response.json();
	}
</script>

<svelte:head>
	<title>Svelte App</title>
</svelte:head>

<main class="app">
	<section class="shell">
		<div class="intro">
			<p class="eyebrow">SvelteKit + Bun</p>
			<h1>Start here.</h1>
			<p class="lede">A tiny Svelte route, Tailwind v4 theme tokens, and a Bun API server are wired together.</p>
		</div>

		<div class="actions">
			<button type="button" class="primary" onclick={() => (theme = theme === 'dark' ? 'light' : 'dark')}>
				{theme === 'dark' ? 'Light' : 'Dark'} theme
			</button>
			<button type="button" onclick={() => void status.refetch()}> Ping server </button>
		</div>

		<div class="status">
			<p class="eyebrow">API</p>
			{#if status.isError}
				<p class="error">{status.error.message}</p>
			{:else if status.isPending}
				<p class="muted">Checking server...</p>
			{:else if status.data}
				<p>Server is online.</p>
				<p class="muted">{status.data.now}</p>
			{/if}
		</div>
	</section>
</main>

<style>
	.app {
		min-height: 100vh;
		background: var(--app-bg);
		color: var(--app-text);
	}

	.shell {
		display: flex;
		flex-direction: column;
		justify-content: center;
		gap: 2rem;
		width: min(100%, 48rem);
		min-height: 100vh;
		margin: 0 auto;
		padding: 3rem 1.5rem;
	}

	.intro {
		display: grid;
		gap: 1rem;
	}

	.eyebrow {
		margin: 0;
		color: var(--app-muted);
		font-size: 0.875rem;
		font-weight: 600;
	}

	h1 {
		margin: 0;
		color: var(--app-text);
		font-size: clamp(3rem, 8vw, 5rem);
		font-weight: 650;
		letter-spacing: 0;
		line-height: 1;
	}

	.lede {
		max-width: 40rem;
		margin: 0;
		color: var(--app-muted);
		font-size: 1.125rem;
		line-height: 1.7;
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
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

	button:hover {
		border-color: var(--app-accent);
	}

	button.primary {
		border-color: var(--app-accent);
		background: var(--app-accent);
		color: var(--app-accent-ink);
	}

	.status {
		border: 1px solid var(--app-border);
		border-radius: 0.5rem;
		background: var(--app-panel);
		color: var(--app-panel-text);
		padding: 1rem;
	}

	.status p {
		margin: 0.5rem 0 0;
	}

	.status .eyebrow {
		margin-top: 0;
	}

	.muted {
		color: var(--app-muted);
		font-size: 0.875rem;
	}

	.error {
		color: var(--app-error);
	}
</style>
