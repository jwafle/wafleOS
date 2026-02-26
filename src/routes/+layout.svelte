<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';

	let { children } = $props();
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>

<div class="ash-shell">
	<header class="site-header active-border" aria-label="Site header">
		<div class="site-brand">
			<span>wafleOS</span>
			<small>ash</small>
		</div>
		<nav class="site-nav" aria-label="Primary">
			<a href="/">Home</a>
			<a href="/fitness">Fitness</a>
		</nav>
	</header>

	<main class="site-main">
		{@render children()}
	</main>
</div>
