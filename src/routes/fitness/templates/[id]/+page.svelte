<script lang="ts">
	import {
		addSetToTemplateGroup,
		addTemplateSetGroup,
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

	const templateQuery = $derived(getTemplateById(data.templateId));
	const exercisesQuery = getExercisesForPicker();
</script>

{#if templateQuery.error}
	<p>error</p>
{:else if !templateQuery.current && templateQuery.loading}
	<p>loading</p>
{:else if !templateQuery.current}
	<p>template not found</p>
{:else}
	{@const template = templateQuery.current}
	{@const exercises = exercisesQuery.current || []}
	{#if !template}
		<p>Template not found.</p>
	{:else}
		<h1>{template.name}</h1>

		<form {...renameTemplate}>
			<input type="hidden" name="templateId" value={template.id} />
			<input {...renameTemplate.fields.name.as('text')} />
			{#if renameTemplate.fields.name.issues()?.[0]}
				<p>{renameTemplate.fields.name.issues()?.[0]?.message}</p>
			{/if}
			<button>Rename template</button>
		</form>

		<form {...deleteTemplate}>
			<input type="hidden" name="templateId" value={template.id} />
			<button>Delete template</button>
		</form>

		<button onclick={() => addSetGroupDialog?.showModal()}>Add set group</button>

		<dialog bind:this={addSetGroupDialog}>
			<h2>Select an exercise</h2>
			<ul>
				{#each exercises as exercise (exercise.id)}
					<li>
						<form {...addTemplateSetGroup.for(`add-set-group-${exercise.id}`)}>
							<input type="hidden" name="templateId" value={template.id} />
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

		{#each template.templateSetGroups as setGroup, setGroupIndex (setGroup.id)}
			<section>
				<h2>
					{setGroupIndex + 1}. {setGroup.exercise.name}
				</h2>

				<form {...moveTemplateSetGroup.for(`move-up-${setGroup.id}`)}>
					<input type="hidden" name="templateId" value={template.id} />
					<input type="hidden" name="setGroupId" value={setGroup.id} />
					<input type="hidden" name="direction" value="up" />
					<button disabled={setGroupIndex === 0}>Move up</button>
				</form>

				<form {...moveTemplateSetGroup.for(`move-down-${setGroup.id}`)}>
					<input type="hidden" name="templateId" value={template.id} />
					<input type="hidden" name="setGroupId" value={setGroup.id} />
					<input type="hidden" name="direction" value="down" />
					<button disabled={setGroupIndex === template.templateSetGroups.length - 1}>
						Move down
					</button>
				</form>

				<form {...removeTemplateSetGroup.for(setGroup.id)}>
					<input type="hidden" name="templateId" value={template.id} />
					<input type="hidden" name="setGroupId" value={setGroup.id} />
					<button>Remove set group</button>
				</form>

				<form {...addSetToTemplateGroup.for(setGroup.id)}>
					<input type="hidden" name="templateId" value={template.id} />
					<input type="hidden" name="setGroupId" value={setGroup.id} />
					<button>Add set</button>
				</form>

				{#each setGroup.templateSets as set, setIndex (set.id)}
					<div>
						<p>Set {setIndex + 1}</p>
						<p>{set.type}</p>

						<form {...removeSetFromTemplateGroup.for(set.id)}>
							<input type="hidden" name="templateId" value={template.id} />
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
