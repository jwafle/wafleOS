<script lang="ts">
	import {
		addSetToTemplateGroup,
		addTemplateSetGroup,
		createExerciseAndAddTemplateSetGroup,
		deleteTemplate,
		getExercisesForPicker,
		getTemplateById,
		moveTemplateSetGroup,
		removeSetFromTemplateGroup,
		removeTemplateSetGroup,
		renameTemplate
	} from '../../templates.remote';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	let addSetGroupDialog: HTMLDialogElement | null = $state(null);
	let showCreateExerciseForm = $state(false);

	const templateQuery = $derived(getTemplateById(data.templateId));
	const exercisesQuery = getExercisesForPicker();
	const createExerciseForm = createExerciseAndAddTemplateSetGroup.for('create-template-exercise');

	const closeAddSetGroupDialog = () => {
		addSetGroupDialog?.close();
		showCreateExerciseForm = false;
	};

	$effect(() => {
		const result = createExerciseForm.result;
		if (!result?.closeDialog) {
			return;
		}

		closeAddSetGroupDialog();
	});
</script>

{#if templateQuery.error}
	<article class="section-card" role="alert" data-variant="danger">
		<p>Unable to load template.</p>
	</article>
{:else if !templateQuery.current && templateQuery.loading}
	<article class="section-card" role="status">
		<p class="spinner" aria-label="Loading template"></p>
	</article>
{:else if !templateQuery.current}
	<article class="section-card" role="alert" data-variant="warning">
		<p>Template not found.</p>
	</article>
{:else}
	{@const template = templateQuery.current}
	{@const exercises = exercisesQuery.current || []}
	{#if !template}
		<article class="section-card" role="alert" data-variant="warning">
			<p>Template not found.</p>
		</article>
	{:else}
		<section class="page-shell">
			<header class="page-head active-border">
				<div class="stack-dense">
					<a href="/fitness">Back to fitness</a>
					<h1>{template.name}</h1>
					<p>Manage exercise groups and default sets for future workouts.</p>
				</div>
			</header>

			<article class="section-card stack-tight">
				<h2>Template settings</h2>
				<form {...renameTemplate} class="form-grid">
					<input type="hidden" name="templateId" value={template.id} />
					<label>
						Template name
						<input {...renameTemplate.fields.name.as('text')} maxlength="100" />
					</label>
					{#if renameTemplate.fields.name.issues()?.[0]}
						<p class="error-text" role="alert">{renameTemplate.fields.name.issues()?.[0]?.message}</p>
					{/if}
					<div class="actions-row">
						<button type="submit" data-variant="primary">Rename template</button>
					</div>
				</form>
				<form {...deleteTemplate}>
					<input type="hidden" name="templateId" value={template.id} />
					<button type="submit" data-variant="danger" class="outline-soft">Delete template</button>
				</form>
			</article>

			<article class="section-card stack-tight">
				<div class="group-header">
					<h2>Set groups</h2>
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

				<dialog bind:this={addSetGroupDialog} class="section-card">
					<h2>Select exercise</h2>
					<ul class="dialog-list">
						{#each exercises as exercise (exercise.id)}
							<li>
								<form {...addTemplateSetGroup.for(`add-set-group-${exercise.id}`)}>
									<input type="hidden" name="templateId" value={template.id} />
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
								<input type="hidden" name="templateId" value={template.id} />

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
									<p class="error-text" role="alert">
										{createExerciseForm.fields.name.issues()?.[0]?.message}
									</p>
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
					{#each template.templateSetGroups as setGroup, setGroupIndex (setGroup.id)}
						<article class="set-group {setGroupIndex === 0 ? 'active-border' : ''}">
							<div class="group-header">
								<h3>{setGroupIndex + 1}. {setGroup.exercise.name}</h3>
							</div>

							<div class="group-controls">
								<form {...moveTemplateSetGroup.for(`move-up-${setGroup.id}`)}>
									<input type="hidden" name="templateId" value={template.id} />
									<input type="hidden" name="setGroupId" value={setGroup.id} />
									<input type="hidden" name="direction" value="up" />
									<button type="submit" class="outline-soft" disabled={setGroupIndex === 0}>Move up</button>
								</form>

								<form {...moveTemplateSetGroup.for(`move-down-${setGroup.id}`)}>
									<input type="hidden" name="templateId" value={template.id} />
									<input type="hidden" name="setGroupId" value={setGroup.id} />
									<input type="hidden" name="direction" value="down" />
									<button
										type="submit"
										class="outline-soft"
										disabled={setGroupIndex === template.templateSetGroups.length - 1}
									>
										Move down
									</button>
								</form>

								<form {...addSetToTemplateGroup.for(setGroup.id)}>
									<input type="hidden" name="templateId" value={template.id} />
									<input type="hidden" name="setGroupId" value={setGroup.id} />
									<button type="submit">Add set</button>
								</form>

								<form {...removeTemplateSetGroup.for(setGroup.id)}>
									<input type="hidden" name="templateId" value={template.id} />
									<input type="hidden" name="setGroupId" value={setGroup.id} />
									<button type="submit" class="outline-soft" data-variant="danger">Remove set group</button>
								</form>
							</div>

							<div class="set-list">
								{#each setGroup.templateSets as set, setIndex (set.id)}
									<div class="set-row">
										<div class="set-meta">
											<span>Set {setIndex + 1}</span>
											<span>{set.type}</span>
										</div>
										<form {...removeSetFromTemplateGroup.for(set.id)}>
											<input type="hidden" name="templateId" value={template.id} />
											<input type="hidden" name="setGroupId" value={setGroup.id} />
											<input type="hidden" name="setId" value={set.id} />
											<button type="submit" class="outline-soft">Remove set</button>
										</form>
									</div>
								{/each}
							</div>
						</article>
					{/each}
				</div>
			</article>
		</section>
	{/if}
{/if}
