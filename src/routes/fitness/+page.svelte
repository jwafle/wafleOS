<script lang="ts">
	import { createTemplate, getTemplatesPaginated } from './templates.remote';
	import { getCurrentWorkout, startWorkout, deleteWorkout } from './workouts.remote';
</script>

{#await getCurrentWorkout()}
	<p>loading</p>
{:then currentWorkout}
	{#if currentWorkout}
		<p>Looks like your {currentWorkout.template.name} workout is ongoing</p>
		<a href="/fitness/workouts/{currentWorkout.id}">Resume</a>
		<form {...deleteWorkout}>
			<input type="hidden" name="workoutId" value={currentWorkout.id} />
			<button>Delete</button>
		</form>
	{/if}

	<h2>start a new workout from a template</h2>
	<ul>
		{#each await getTemplatesPaginated(0) as template}
			<li>
				<form {...startWorkout.for(template.id)}>
					<input type="hidden" name="templateId" value={template.id} />
					<button disabled={Boolean(currentWorkout)}>{template.name}</button>
				</form>
				<a href="/fitness/templates/{template.id}">Edit template</a>
			</li>
		{/each}
	</ul>
{/await}

<form {...createTemplate}>
	<input type="hidden" name="name" value="New Template" />
	{#if createTemplate.fields.name.issues()?.[0]}
		<p>{createTemplate.fields.name.issues()?.[0]?.message}</p>
	{/if}
	<button>Create a new workout template</button>
</form>
