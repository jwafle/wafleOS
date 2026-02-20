<script lang="ts">
	import {
		addSetGroup,
		addSetToGroup,
		deleteWorkout,
		getExercisesForPicker,
		getWorkoutById,
		moveSetGroup,
		removeSetFromGroup,
		removeSetGroup,
		toggleSetComplete,
		toggleWorkoutComplete
	} from '../../workouts.remote';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	let addSetGroupDialog: HTMLDialogElement | null = $state(null);

	const workoutQuery = $derived(getWorkoutById(data.workoutId));
	const exercisesQuery = getExercisesForPicker();
</script>

{#if workoutQuery.error}
	<p>error</p>
{:else if !workoutQuery.current && workoutQuery.loading}
	<p>loading</p>
{:else if !workoutQuery.current}
	<p>workout not found</p>
{:else}
	{@const workout = workoutQuery.current}
	{@const exercises = exercisesQuery.current || []}
	{#if !workout}
		<p>Workout not found.</p>
	{:else}
		<h1>{workout.template?.name || 'unknown template name'}</h1>

		<form {...toggleWorkoutComplete}>
			<input type="hidden" name="workoutId" value={workout.id} />
			<button>{workout.finishedAt ? 'Mark workout incomplete' : 'Mark workout complete'}</button>
		</form>

		<form {...deleteWorkout}>
			<input type="hidden" name="workoutId" value={workout.id} />
			<button>Delete workout</button>
		</form>

		<button onclick={() => addSetGroupDialog?.showModal()}>Add set group</button>

		<dialog bind:this={addSetGroupDialog}>
			<h2>Select an exercise</h2>
			<ul>
				{#each exercises as exercise (exercise.id)}
					<li>
						<form {...addSetGroup.for(`add-set-group-${exercise.id}`)}>
							<input type="hidden" name="workoutId" value={workout.id} />
							<input type="hidden" name="exerciseId" value={exercise.id} />
							<button onclick={() => addSetGroupDialog?.close()}>{exercise.name}</button>
						</form>
					</li>
				{/each}
			</ul>
			<form method="dialog">
				<button>Cancel</button>
			</form>
		</dialog>

		{#each workout.setGroups as setGroup, setGroupIndex (setGroup.id)}
			<section>
				<h2>
					{setGroupIndex + 1}. {setGroup.exercise.name}
				</h2>

				<form {...moveSetGroup.for(`move-up-${setGroup.id}`)}>
					<input type="hidden" name="workoutId" value={workout.id} />
					<input type="hidden" name="setGroupId" value={setGroup.id} />
					<input type="hidden" name="direction" value="up" />
					<button disabled={setGroupIndex === 0}>Move up</button>
				</form>

				<form {...moveSetGroup.for(`move-down-${setGroup.id}`)}>
					<input type="hidden" name="workoutId" value={workout.id} />
					<input type="hidden" name="setGroupId" value={setGroup.id} />
					<input type="hidden" name="direction" value="down" />
					<button disabled={setGroupIndex === workout.setGroups.length - 1}>Move down</button>
				</form>

				<form {...removeSetGroup.for(setGroup.id)}>
					<input type="hidden" name="workoutId" value={workout.id} />
					<input type="hidden" name="setGroupId" value={setGroup.id} />
					<button>Remove set group</button>
				</form>

				<form {...addSetToGroup.for(setGroup.id)}>
					<input type="hidden" name="workoutId" value={workout.id} />
					<input type="hidden" name="setGroupId" value={setGroup.id} />
					<button>Add set</button>
				</form>

				{#each setGroup.sets as set, setIndex (set.id)}
					<div>
						<p>Set {setIndex + 1}</p>
						<p>{set.type}</p>
						<p>{set.finishedAt ? 'complete' : 'incomplete'}</p>

						<form {...toggleSetComplete.for(set.id)}>
							<input type="hidden" name="workoutId" value={workout.id} />
							<input type="hidden" name="setId" value={set.id} />
							<button>{set.finishedAt ? 'Mark incomplete' : 'Mark complete'}</button>
						</form>

						<form {...removeSetFromGroup.for(set.id)}>
							<input type="hidden" name="workoutId" value={workout.id} />
							<input type="hidden" name="setGroupId" value={setGroup.id} />
							<input type="hidden" name="setId" value={set.id} />
							<button>Remove set</button>
						</form>
					</div>
				{/each}
			</section>
		{/each}
	{/if}
{/if}
