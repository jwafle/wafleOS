<script lang="ts">
	import {
		addSetGroup,
		addSetToGroup,
		createExerciseAndAddSetGroup,
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
	let showCreateExerciseForm = $state(false);
	let nowMs = $state(0);
	let restTimerEndsAtMs = $state<number | null>(null);
	let lastAppliedCompletionAtMs = $state<number | null>(null);

	const workoutQuery = $derived(getWorkoutById(data.workoutId));
	const exercisesQuery = getExercisesForPicker();
	const createExerciseForm = createExerciseAndAddSetGroup.for('create-workout-exercise');

	const closeAddSetGroupDialog = () => {
		addSetGroupDialog?.close();
		showCreateExerciseForm = false;
	};

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
		const result = createExerciseForm.result;
		if (!result?.closeDialog) {
			return;
		}

		closeAddSetGroupDialog();
	});

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
	<article class="section-card" role="alert" data-variant="danger">
		<p>Unable to load workout.</p>
	</article>
{:else if !workoutQuery.current && workoutQuery.loading}
	<article class="section-card" role="status">
		<p class="spinner" aria-label="Loading workout"></p>
	</article>
{:else if !workoutQuery.current}
	<article class="section-card" role="alert" data-variant="warning">
		<p>Workout not found.</p>
	</article>
{:else}
	{@const workout = workoutQuery.current}
	{@const exercises = exercisesQuery.current || []}
	{#if !workout}
		<article class="section-card" role="alert" data-variant="warning">
			<p>Workout not found.</p>
		</article>
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

		<section class="page-shell">
			<header class="page-head active-border">
				<div class="stack-dense">
					<a href="/fitness">Back to fitness</a>
					<h1>{workout.template?.name || 'unknown template name'}</h1>
					<p>Track each set with dense controls and keep rest pacing visible at all times.</p>
				</div>
			</header>

			<section class="timer-region">
				<div class="timer-card active-border">
					<p>Workout time</p>
					<p>{formatMsAsClock(wallClockElapsedMs)}</p>
				</div>
				<div class="timer-card {restRemainingMs !== null && restRemainingMs > 0 ? 'active-border' : ''}">
					<p>Rest timer</p>
					<p>{restRemainingMs === null ? '--:--:--' : formatMsAsClock(restRemainingMs)}</p>
					{#if practicalNextSetGroup && practicalNextSetGroupIndex !== null}
						<p class="timer-subtext">
							Up next: {practicalNextSetGroupIndex + 1}. {practicalNextSetGroup.exercise.name}
						</p>
					{/if}
				</div>
			</section>

			<article class="section-card stack-dense">
				<div class="actions-row">
					<form {...toggleWorkoutComplete}>
						<input type="hidden" name="workoutId" value={workout.id} />
						<button type="submit" data-variant="primary">
							{workout.finishedAt ? 'Mark workout incomplete' : 'Mark workout complete'}
						</button>
					</form>

					<form {...deleteWorkout}>
						<input type="hidden" name="workoutId" value={workout.id} />
						<button type="submit" class="outline-soft" data-variant="danger">Delete workout</button>
					</form>

					<button
						type="button"
						data-variant="secondary"
						onclick={() => {
							showCreateExerciseForm = false;
							addSetGroupDialog?.showModal();
						}}
					>
						Add set group
					</button>
				</div>
			</article>

			<dialog bind:this={addSetGroupDialog} class="section-card">
				<h2>Select exercise</h2>
				<ul class="dialog-list">
					{#each exercises as exercise (exercise.id)}
						<li>
							<form {...addSetGroup.for(`add-set-group-${exercise.id}`)}>
								<input type="hidden" name="workoutId" value={workout.id} />
								<input type="hidden" name="exerciseId" value={exercise.id} />
								<button type="submit" class="outline-soft" onclick={() => closeAddSetGroupDialog()}>
									{exercise.name}
								</button>
							</form>
						</li>
					{/each}
				</ul>

				{#if !showCreateExerciseForm}
					<div class="actions-row mt-4">
						<button type="button" onclick={() => (showCreateExerciseForm = true)}>
							Add a new exercise
						</button>
					</div>
				{:else}
					<section class="stack-tight mt-4">
						<h3>Create new exercise</h3>
						<form
							class="form-grid"
							{...createExerciseForm.enhance(async ({ form, submit }) => {
								await submit();
								if (!createExerciseForm.result || createExerciseForm.result.closeDialog) {
									return;
								}

								form.reset();
							})}
						>
							<input type="hidden" name="workoutId" value={workout.id} />

							<label>
								Exercise name
								<input
									type="text"
									name="name"
									maxlength="100"
									required
									placeholder="e.g. Incline Dumbbell Press"
								/>
							</label>
							{#if createExerciseForm.fields.name.issues()?.[0]}
								<p class="error-text" role="alert">{createExerciseForm.fields.name.issues()?.[0]?.message}</p>
							{/if}

							<label>
								Measured by
								<select name="measuredIn" required>
									<option value="" disabled selected>Select one</option>
									<option value="duration">Duration</option>
									<option value="reps">Reps</option>
									<option value="reps_and_weight">Reps and weight</option>
								</select>
							</label>
							{#if createExerciseForm.fields.measuredIn.issues()?.[0]}
								<p class="error-text" role="alert">
									{createExerciseForm.fields.measuredIn.issues()?.[0]?.message}
								</p>
							{/if}

							<div class="actions-row">
								<button type="submit" name="closeAfterAdd" value="false">Create & add another</button>
								<button type="submit" name="closeAfterAdd" value="true" data-variant="primary">
									Create, add & close
								</button>
								<button type="button" class="outline-soft" onclick={() => (showCreateExerciseForm = false)}>
									Cancel
								</button>
							</div>
						</form>
					</section>
				{/if}

				<form method="dialog" class="actions-row mt-4">
					<button type="submit" class="outline-soft" onclick={() => (showCreateExerciseForm = false)}>
						Close
					</button>
				</form>
			</dialog>

			<div class="stack-tight">
				{#each workout.setGroups as setGroup, setGroupIndex (setGroup.id)}
					<article
						class={`set-group ${practicalNextSetGroupIndex === setGroupIndex ? 'active-border' : ''}`}
					>
						<div class="group-header">
							<h2>{setGroupIndex + 1}. {setGroup.exercise.name}</h2>
							<div class="group-header-actions">
								<form {...moveSetGroup.for(`move-up-${setGroup.id}`)}>
									<input type="hidden" name="workoutId" value={workout.id} />
									<input type="hidden" name="setGroupId" value={setGroup.id} />
									<input type="hidden" name="direction" value="up" />
									<button
										type="submit"
										class="outline-soft icon-control"
										disabled={setGroupIndex === 0}
										aria-label="Move set group up"
									>
										↑
									</button>
								</form>

								<form {...moveSetGroup.for(`move-down-${setGroup.id}`)}>
									<input type="hidden" name="workoutId" value={workout.id} />
									<input type="hidden" name="setGroupId" value={setGroup.id} />
									<input type="hidden" name="direction" value="down" />
									<button
										type="submit"
										class="outline-soft icon-control"
										disabled={setGroupIndex === workout.setGroups.length - 1}
										aria-label="Move set group down"
									>
										↓
									</button>
								</form>

								<form {...removeSetGroup.for(setGroup.id)}>
									<input type="hidden" name="workoutId" value={workout.id} />
									<input type="hidden" name="setGroupId" value={setGroup.id} />
									<button
										type="submit"
										class="outline-soft icon-control icon-control-danger"
										aria-label="Remove set group"
									>
										X
									</button>
								</form>
							</div>
						</div>

						<div class="set-list">
							{#each setGroup.sets as set, setIndex (set.id)}
								{@const metricPrefillValues = getSetMetricPrefillValues(workout, setGroup, set)}
								{@const toggleSetCompleteForm = toggleSetComplete.for(set.id)}
								<div class="set-row">
									<div class="set-row-header">
										<p class="set-row-title">
											Set {setIndex + 1}
											<span class="set-row-type">{set.type}</span>
										</p>

										<form {...removeSetFromGroup.for(set.id)}>
											<input type="hidden" name="workoutId" value={workout.id} />
											<input type="hidden" name="setGroupId" value={setGroup.id} />
											<input type="hidden" name="setId" value={set.id} />
											<button
												type="submit"
												class="outline-soft icon-control"
												aria-label="Remove set"
											>
												C
											</button>
										</form>
									</div>

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
										<button type="submit">{set.finishedAt ? 'Mark incomplete' : 'Mark complete'}</button>
										{#if toggleSetCompleteForm.fields.setId.issues()?.[0]}
											<p class="set-error error-text" role="alert">
												{toggleSetCompleteForm.fields.setId.issues()?.[0]?.message}
											</p>
										{/if}
									</form>

								</div>
							{/each}
						</div>

						<form {...addSetToGroup.for(setGroup.id)} class="set-group-add-form">
							<input type="hidden" name="workoutId" value={workout.id} />
							<input type="hidden" name="setGroupId" value={setGroup.id} />
							<button type="submit" class="outline-soft">Add set</button>
						</form>
					</article>
				{/each}
			</div>
		</section>
	{/if}
{/if}

<style>
	.group-header {
		align-items: flex-start;
	}

	.group-header-actions {
		display: flex;
		gap: var(--space-2);
	}

	.group-header-actions form,
	.set-row-header form,
	.set-group-add-form {
		margin: 0;
	}

	.icon-control {
		min-width: 2.25rem;
		padding: var(--space-2);
		font-family: var(--font-mono);
		line-height: 1;
	}

	.icon-control-danger {
		border-color: rgb(from var(--danger) r g b / 0.5);
		color: var(--danger-foreground);
	}

	.icon-control-danger:hover {
		background: rgb(from var(--danger) r g b / 0.16);
	}

	.set-row-header {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: var(--space-3);
	}

	.set-row-title {
		margin: 0;
		font-family: var(--font-mono);
		font-size: 13px;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}

	.set-row-type {
		margin-inline-start: var(--space-2);
		text-transform: capitalize;
	}

	.set-complete-form,
	.set-group-add-form {
		width: 100%;
	}

	.set-complete-form button,
	.set-group-add-form button {
		width: 100%;
	}
</style>
