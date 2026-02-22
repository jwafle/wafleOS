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

	type WorkoutWithGroups = {
		setGroups: Array<{
			restDuration: number | null;
			sets: Array<{
				finishedAt: unknown;
			}>;
		}>;
	};

	let { data }: PageProps = $props();
	let addSetGroupDialog: HTMLDialogElement | null = $state(null);
	let nowMs = $state(0);

	const workoutQuery = $derived(getWorkoutById(data.workoutId));
	const exercisesQuery = getExercisesForPicker();

	const toEpochMs = (value: unknown): number | null => {
		if (value === null || value === undefined) {
			return null;
		}

		if (value instanceof Date) {
			return value.getTime();
		}

		if (typeof value === 'number' && Number.isFinite(value)) {
			return value;
		}

		if (typeof value === 'string') {
			const asNumber = Number(value);
			if (Number.isFinite(asNumber)) {
				return asNumber;
			}

			const asDate = Date.parse(value);
			if (!Number.isNaN(asDate)) {
				return asDate;
			}
		}

		return null;
	};

	const formatClock = (totalSeconds: number) => {
		const safeSeconds = Math.max(0, Math.floor(totalSeconds));
		const hours = Math.floor(safeSeconds / 3600)
			.toString()
			.padStart(2, '0');
		const minutes = Math.floor((safeSeconds % 3600) / 60)
			.toString()
			.padStart(2, '0');
		const seconds = Math.floor(safeSeconds % 60)
			.toString()
			.padStart(2, '0');

		return `${hours}:${minutes}:${seconds}`;
	};

	const formatMsAsClock = (milliseconds: number) => formatClock(milliseconds / 1000);

	const getLatestCompletedSetInfo = (workout: WorkoutWithGroups) => {
		let latest: { finishedAtMs: number; restDurationSeconds: number } | null = null;

		for (const setGroup of workout.setGroups) {
			for (const set of setGroup.sets) {
				const finishedAtMs = toEpochMs(set.finishedAt);
				if (finishedAtMs === null) {
					continue;
				}

				if (!latest || finishedAtMs > latest.finishedAtMs) {
					latest = {
						finishedAtMs,
						restDurationSeconds: Math.max(0, setGroup.restDuration ?? 0)
					};
				}
			}
		}

		return latest;
	};

	$effect(() => {
		if (typeof window === 'undefined') {
			return;
		}

		nowMs = Date.now();

		const intervalId = window.setInterval(() => {
			nowMs = Date.now();
		}, 1000);

		return () => {
			window.clearInterval(intervalId);
		};
	});
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
		{@const workoutStartedAtMs = toEpochMs(workout.startedAt) ?? 0}
		{@const workoutFinishedAtMs = toEpochMs(workout.finishedAt)}
		{@const wallClockReferenceMs = workoutFinishedAtMs ?? nowMs}
		{@const wallClockElapsedMs = Math.max(0, wallClockReferenceMs - workoutStartedAtMs)}
		{@const latestCompletedSetInfo = getLatestCompletedSetInfo(workout)}
		{@const restEndsAtMs =
			latestCompletedSetInfo
				? latestCompletedSetInfo.finishedAtMs + latestCompletedSetInfo.restDurationSeconds * 1000
				: null}
		{@const restRemainingMs = restEndsAtMs === null ? null : Math.max(0, restEndsAtMs - nowMs)}

		<h1>{workout.template?.name || 'unknown template name'}</h1>

		<section class="timer-region">
			<div class="timer-card">
				<p>Workout time</p>
				<p>{formatMsAsClock(wallClockElapsedMs)}</p>
			</div>
			<div class="timer-card">
				<p>Rest timer</p>
				<p>{restRemainingMs === null ? '--:--:--' : formatMsAsClock(restRemainingMs)}</p>
			</div>
		</section>

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

<style>
	.timer-region {
		position: sticky;
		top: 0;
		z-index: 10;
		display: flex;
		gap: 0.75rem;
		margin: 0 0 1rem;
		padding: 0.75rem;
		border: 1px solid #ddd;
		border-radius: 0.5rem;
		background: #fff;
	}

	.timer-card {
		min-width: 10rem;
	}

	.timer-card p {
		margin: 0;
	}
</style>
