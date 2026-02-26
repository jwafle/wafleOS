<script lang="ts">
	import { createTemplate, getTemplatesPaginated } from './templates.remote';
	import { getCurrentWorkout, startWorkout, deleteWorkout } from './workouts.remote';
</script>

<section class="page-shell">
	<header class="page-head active-border">
		<h1>Fitness Control</h1>
		<p>Track active workouts, launch from templates, and keep progress moving.</p>
	</header>

	{#await getCurrentWorkout()}
		<article class="section-card" role="status">
			<p class="spinner" aria-label="Loading workout status"></p>
		</article>
	{:then currentWorkout}
		{#if currentWorkout}
			<article class="section-card stack-dense" role="alert" data-variant="info">
				<h2>Active workout detected</h2>
				<p>{currentWorkout.template.name} is currently in progress.</p>
				<div class="actions-row">
					<a href="/fitness/workouts/{currentWorkout.id}" class="outline-soft">Resume</a>
					<form {...deleteWorkout}>
						<input type="hidden" name="workoutId" value={currentWorkout.id} />
						<button type="submit" data-variant="danger" class="outline-soft">Delete workout</button>
					</form>
				</div>
			</article>
		{/if}

		<article class="section-card stack-tight">
			<h2>Start from template</h2>
			<ul class="list-reset stack-dense">
				{#each await getTemplatesPaginated(0) as template}
					<li class="set-group">
						<div class="group-header">
							<h3>{template.name}</h3>
						</div>
						<div class="actions-row">
							<form {...startWorkout.for(template.id)}>
								<input type="hidden" name="templateId" value={template.id} />
								<button type="submit" disabled={Boolean(currentWorkout)} data-variant="primary">
									Start
								</button>
							</form>
							<a href="/fitness/templates/{template.id}" class="outline-soft">Edit template</a>
						</div>
					</li>
				{/each}
			</ul>
		</article>
	{/await}

	<article class="section-card stack-tight">
		<h2>Create template</h2>
		<form {...createTemplate} class="form-grid">
			<label>
				Template name
				<input
					{...createTemplate.fields.name.as('text')}
					maxlength="100"
					placeholder="e.g. Push Day A"
				/>
			</label>
			{#if createTemplate.fields.name.issues()?.[0]}
				<p class="error-text" role="alert">{createTemplate.fields.name.issues()?.[0]?.message}</p>
			{/if}
			<div class="form-actions">
				<button type="submit" data-variant="primary">Create workout template</button>
			</div>
		</form>
	</article>
</section>
