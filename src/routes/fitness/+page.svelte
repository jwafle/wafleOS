<script lang="ts">
	import { getTemplatesPaginated } from './templates.remote';
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
{/await}

<ul>
	{#each await getTemplatesPaginated(0) as template}
		<li>
			<form {...startWorkout.for(template.id)}>
				<input type="hidden" name="templateId" value={template.id} />
				<button>{template.name}</button>
			</form>
		</li>
	{/each}
</ul>
<button>create a new workout template</button>
