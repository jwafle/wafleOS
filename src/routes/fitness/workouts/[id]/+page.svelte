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
		toggleWorkoutComplete,
		updateSetMetrics
	} from '../../workouts.remote';
	import type { PageProps } from './$types';

	type WorkoutSetGroup = {
		id: number;
		index: number;
		isSuperset: boolean;
		restDuration: number | null;
		exercise: {
			id: number;
			name: string;
			measured_in: 'duration' | 'reps' | 'reps_and_weight';
		};
		sets: Array<{
			id: number;
			index: number;
			type: 'warmup' | 'working';
			reps: number | null;
			weight: number | null;
			duration: number | null;
			finishedAt: unknown;
		}>;
	};

	type WorkoutWithGroups = {
		setGroups: WorkoutSetGroup[];
	};

	let { data }: PageProps = $props();
	let addSetGroupDialog: HTMLDialogElement | null = $state(null);
	let nowMs = $state(0);
	let restTimerEndsAtMs = $state<number | null>(null);
	let lastAppliedCompletionAtMs = $state<number | null>(null);

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

	const isSetFinished = (finishedAt: unknown) => toEpochMs(finishedAt) !== null;

	const isSetGroupComplete = (setGroup: WorkoutSetGroup) =>
		setGroup.sets.length > 0 && setGroup.sets.every((set) => isSetFinished(set.finishedAt));

	const buildSupersetChains = (setGroups: WorkoutSetGroup[]) => {
		const chains: number[][] = [];
		let pointer = 0;

		while (pointer < setGroups.length) {
			const chain: number[] = [pointer];
			while (setGroups[pointer]?.isSuperset && pointer + 1 < setGroups.length) {
				pointer += 1;
				chain.push(pointer);
			}

			chains.push(chain);
			pointer += 1;
		}

		return chains;
	};

	const getPracticalNextSetGroupIndex = (
		setGroups: WorkoutSetGroup[],
		latestCompletedSetGroupIndex: number
	) => {
		if (setGroups.length === 0 || latestCompletedSetGroupIndex < 0) {
			return null;
		}

		const supersetChains = buildSupersetChains(setGroups);
		const currentChain =
			supersetChains.find((chain) => chain.includes(latestCompletedSetGroupIndex)) ?? null;
		if (!currentChain) {
			return null;
		}

		const currentPosition = currentChain.indexOf(latestCompletedSetGroupIndex);
		const chainLength = currentChain.length;
		const hasIncompleteGroup = currentChain.some(
			(chainIndex) => !isSetGroupComplete(setGroups[chainIndex])
		);
		if (!hasIncompleteGroup) {
			return currentChain[0] ?? null;
		}

		for (let offset = 1; offset <= chainLength; offset += 1) {
			const chainIndex = currentChain[(currentPosition + offset) % chainLength];
			if (!isSetGroupComplete(setGroups[chainIndex])) {
				return chainIndex;
			}
		}

		return currentChain[0] ?? null;
	};

	const getLatestCompletedSetInfo = (workout: WorkoutWithGroups) => {
		let latest: {
			setId: number;
			setGroupId: number;
			setGroupIndex: number;
			finishedAtMs: number;
			restDurationSeconds: number;
		} | null = null;

		for (const [setGroupIndex, setGroup] of workout.setGroups.entries()) {
			for (const set of setGroup.sets) {
				const finishedAtMs = toEpochMs(set.finishedAt);
				if (finishedAtMs === null) {
					continue;
				}

				if (!latest || finishedAtMs > latest.finishedAtMs) {
					latest = {
						setId: set.id,
						setGroupId: setGroup.id,
						setGroupIndex,
						finishedAtMs,
						restDurationSeconds: Math.max(0, setGroup.restDuration ?? 0)
					};
				}
			}
		}

		return latest;
	};

	const toMetricInputValue = (value: number | null | undefined) =>
		value === null || value === undefined ? '' : String(value);

	const getSetGroupCompletionAtMs = (setGroup: WorkoutSetGroup) => {
		if (setGroup.sets.length === 0) {
			return null;
		}

		let latestCompletionAtMs = 0;
		for (const set of setGroup.sets) {
			const finishedAtMs = toEpochMs(set.finishedAt);
			if (finishedAtMs === null) {
				return null;
			}

			if (finishedAtMs > latestCompletionAtMs) {
				latestCompletionAtMs = finishedAtMs;
			}
		}

		return latestCompletionAtMs;
	};

	const getMostRecentCompletedSameExerciseSet = (
		workout: WorkoutWithGroups,
		setGroup: WorkoutSetGroup,
		setIndex: number
	) => {
		let latestMatch: {
			completionAtMs: number;
			set: WorkoutSetGroup['sets'][number];
		} | null = null;

		for (const candidateSetGroup of workout.setGroups) {
			if (
				candidateSetGroup.exercise.id !== setGroup.exercise.id ||
				candidateSetGroup.id === setGroup.id
			) {
				continue;
			}

			const completionAtMs = getSetGroupCompletionAtMs(candidateSetGroup);
			if (completionAtMs === null) {
				continue;
			}

			const matchingSet = candidateSetGroup.sets.find(
				(candidateSet) => candidateSet.index === setIndex
			);
			if (!matchingSet) {
				continue;
			}

			if (!latestMatch || completionAtMs > latestMatch.completionAtMs) {
				latestMatch = {
					completionAtMs,
					set: matchingSet
				};
			}
		}

		return latestMatch?.set ?? null;
	};

	const getSetMetricPrefillValues = (
		workout: WorkoutWithGroups,
		setGroup: WorkoutSetGroup,
		set: WorkoutSetGroup['sets'][number]
	) => {
		const sameExerciseCompletedSet = getMostRecentCompletedSameExerciseSet(
			workout,
			setGroup,
			set.index
		);

		return {
			reps: toMetricInputValue(set.reps ?? sameExerciseCompletedSet?.reps ?? null),
			weight: toMetricInputValue(set.weight ?? sameExerciseCompletedSet?.weight ?? null),
			duration: toMetricInputValue(set.duration ?? sameExerciseCompletedSet?.duration ?? null)
		};
	};

	const autosaveMetricOnBlur = (event: FocusEvent) => {
		const input = event.currentTarget;
		if (!(input instanceof HTMLInputElement)) {
			return;
		}

		input.form?.requestSubmit();
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

	$effect(() => {
		const workout = workoutQuery.current;
		if (!workout) {
			return;
		}

		const latestCompletedSetInfo = getLatestCompletedSetInfo(workout);
		if (!latestCompletedSetInfo) {
			return;
		}

		if (
			lastAppliedCompletionAtMs === null ||
			latestCompletedSetInfo.finishedAtMs > lastAppliedCompletionAtMs
		) {
			lastAppliedCompletionAtMs = latestCompletedSetInfo.finishedAtMs;
			restTimerEndsAtMs =
				latestCompletedSetInfo.finishedAtMs + latestCompletedSetInfo.restDurationSeconds * 1000;
		}
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
		{@const practicalNextSetGroupIndex =
			latestCompletedSetInfo === null
				? null
				: getPracticalNextSetGroupIndex(workout.setGroups, latestCompletedSetInfo.setGroupIndex)}
		{@const practicalNextSetGroup =
			practicalNextSetGroupIndex === null ? null : workout.setGroups[practicalNextSetGroupIndex]}
		{@const restRemainingMs =
			restTimerEndsAtMs === null ? null : Math.max(0, restTimerEndsAtMs - nowMs)}

		<h1>{workout.template?.name || 'unknown template name'}</h1>

		<section class="timer-region">
			<div class="timer-card">
				<p>Workout time</p>
				<p>{formatMsAsClock(wallClockElapsedMs)}</p>
			</div>
			<div class="timer-card">
				<p>Rest timer</p>
				<p>{restRemainingMs === null ? '--:--:--' : formatMsAsClock(restRemainingMs)}</p>
				{#if practicalNextSetGroup && practicalNextSetGroupIndex !== null}
					<p class="timer-subtext">
						Up next: {practicalNextSetGroupIndex + 1}. {practicalNextSetGroup.exercise.name}
					</p>
				{/if}
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
					{@const metricPrefillValues = getSetMetricPrefillValues(workout, setGroup, set)}
					{@const toggleSetCompleteForm = toggleSetComplete.for(set.id)}
					<div class="set-row">
						<p>Set {setIndex + 1}</p>
						<p>{set.type}</p>
						<p>{set.finishedAt ? 'complete' : 'incomplete'}</p>

						<div class="metric-inputs">
							{#if setGroup.exercise.measured_in === 'duration'}
								<form
									{...updateSetMetrics
										.for(`set-${set.id}-duration`)
										.enhance(({ submit }) => submit())}
									class="metric-field"
								>
									<input type="hidden" name="workoutId" value={workout.id} />
									<input type="hidden" name="setId" value={set.id} />
									<label>
										Duration (sec)
										<input
											type="number"
											name="duration"
											min="1"
											step="1"
											value={metricPrefillValues.duration}
											onblur={autosaveMetricOnBlur}
										/>
									</label>
								</form>
							{:else if setGroup.exercise.measured_in === 'reps'}
								<form
									{...updateSetMetrics
										.for(`set-${set.id}-reps`)
										.enhance(({ submit }) => submit())}
									class="metric-field"
								>
									<input type="hidden" name="workoutId" value={workout.id} />
									<input type="hidden" name="setId" value={set.id} />
									<label>
										Reps
										<input
											type="number"
											name="reps"
											min="1"
											step="1"
											value={metricPrefillValues.reps}
											onblur={autosaveMetricOnBlur}
										/>
									</label>
								</form>
							{:else}
								<form
									{...updateSetMetrics
										.for(`set-${set.id}-reps`)
										.enhance(({ submit }) => submit())}
									class="metric-field"
								>
									<input type="hidden" name="workoutId" value={workout.id} />
									<input type="hidden" name="setId" value={set.id} />
									<label>
										Reps
										<input
											type="number"
											name="reps"
											min="1"
											step="1"
											value={metricPrefillValues.reps}
											onblur={autosaveMetricOnBlur}
										/>
									</label>
								</form>
								<form
									{...updateSetMetrics
										.for(`set-${set.id}-weight`)
										.enhance(({ submit }) => submit())}
									class="metric-field"
								>
									<input type="hidden" name="workoutId" value={workout.id} />
									<input type="hidden" name="setId" value={set.id} />
									<label>
										Weight (lbs)
										<input
											type="number"
											name="weight"
											min="0.1"
											step="0.1"
											value={metricPrefillValues.weight}
											onblur={autosaveMetricOnBlur}
										/>
									</label>
								</form>
							{/if}
						</div>

						<form {...toggleSetCompleteForm} class="set-complete-form">
							<input type="hidden" name="workoutId" value={workout.id} />
							<input type="hidden" name="setId" value={set.id} />
							<button>{set.finishedAt ? 'Mark incomplete' : 'Mark complete'}</button>
							{#if toggleSetCompleteForm.fields.setId.issues()?.[0]}
								<p class="set-error" role="alert">
									{toggleSetCompleteForm.fields.setId.issues()?.[0]?.message}
								</p>
							{/if}
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

	.timer-subtext {
		margin-top: 0.25rem;
		font-size: 0.85rem;
		opacity: 0.8;
	}

	.set-row {
		margin-bottom: 0.75rem;
	}

	.set-complete-form {
		margin: 0.35rem 0;
	}

	.set-error {
		margin: 0.35rem 0 0;
		color: #b42318;
		font-size: 0.9rem;
	}

	.metric-inputs {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.metric-field {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.metric-field label {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
</style>
