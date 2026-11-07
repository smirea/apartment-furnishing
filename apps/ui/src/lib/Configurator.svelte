<script lang="ts" module>
	// One way a product can be configured, like a rug's color or its size. The plan shows a product's axes over it when
	// it is selected and in its card.
	export type ConfigChoice = {
		id: string;
		label: string;
		detail?: string | null;
		// Choices with pictures show as swatches, the rest as a menu.
		image?: string | null;
		busy?: boolean;
	};
	export type ConfigAxis = {
		key: string;
		label: string;
		choices: ConfigChoice[];
		selected: string;
		pick: (id: string) => void;
	};
</script>

<script lang="ts">
	let { axes, compact = false }: { axes: ConfigAxis[]; compact?: boolean } = $props();
</script>

<div class="config" class:compact>
	{#each axes as axis (axis.key)}
		{@const picked = axis.choices.find(c => c.id === axis.selected)}
		{#if axis.choices.some(c => c.image)}
			<div class="axis">
				<span class="label">
					{axis.label}{#if picked}: <strong>{picked.label}</strong>{#if picked.detail}
							<span class="detail">· {picked.detail}</span>{/if}{/if}
				</span>
				<div class="swatches" role="radiogroup" aria-label={axis.label}>
					{#each axis.choices as choice (choice.id)}
						<button
							type="button"
							role="radio"
							aria-checked={choice.id === axis.selected}
							aria-label={choice.label}
							title={[choice.label, choice.detail].filter(Boolean).join(' · ')}
							class:busy={choice.busy}
							onclick={() => choice.id !== axis.selected && axis.pick(choice.id)}
						>
							{#if choice.image}<img src={choice.image} alt="" loading="lazy" />{/if}
						</button>
					{/each}
				</div>
			</div>
		{:else}
			<label class="axis menu">
				<span class="label">{axis.label}</span>
				<!-- A pick the product refuses leaves the menu showing what is still selected. -->
				<select
					value={axis.selected}
					onchange={e => {
						const id = e.currentTarget.value;
						e.currentTarget.value = axis.selected;
						axis.pick(id);
					}}
				>
					{#each axis.choices as choice (choice.id)}
						<option value={choice.id}>{choice.label}{choice.detail ? ` · ${choice.detail}` : ''}</option>
					{/each}
				</select>
			</label>
		{/if}
	{/each}
</div>

<style>
	.config {
		display: grid;
		gap: 0.6rem;
	}

	.axis {
		display: grid;
		gap: 0.35rem;
		min-width: 0;
	}

	.menu {
		grid-template-columns: auto minmax(0, 1fr);
		align-items: center;
		gap: 0.5rem;
	}

	.label {
		color: var(--app-muted);
		font-size: 0.85rem;
	}

	.label strong {
		color: var(--app-text);
		font-weight: 600;
	}

	.detail {
		color: var(--app-muted);
	}

	select {
		min-width: 0;
		max-width: 100%;
	}

	.swatches {
		display: flex;
		flex-wrap: wrap;
		gap: 0.35rem;
	}

	.swatches button {
		position: relative;
		width: 2.4rem;
		height: 2.4rem;
		padding: 0;
		overflow: hidden;
		border: 1px solid var(--app-border);
		border-radius: 0.35rem;
		background: var(--app-bg);
		cursor: pointer;
	}

	.swatches button[aria-checked='true'] {
		outline: 2px solid var(--app-accent);
		outline-offset: 1px;
	}

	.swatches img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}

	/* A look still being drawn shows its listing photo, dimmed, with a spinner. */
	.swatches button.busy img {
		opacity: 0.45;
	}

	.swatches button.busy::after {
		content: '';
		position: absolute;
		inset: 0;
		margin: auto;
		width: 0.9rem;
		height: 0.9rem;
		border: 2px solid var(--app-text);
		border-right-color: transparent;
		border-radius: 50%;
		animation: spin 0.9s linear infinite;
	}

	@keyframes spin {
		to {
			transform: rotate(1turn);
		}
	}

	.compact {
		gap: 0.45rem;
	}

	.compact .swatches {
		max-width: min(17rem, calc(100vw - 3rem));
	}

	.compact .swatches button {
		width: 1.9rem;
		height: 1.9rem;
	}

	.compact .label {
		font-size: 0.8rem;
	}
</style>
