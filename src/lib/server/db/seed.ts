import { db } from './db';
import * as schema from './schema';

console.log(`Seeding exercises...`);
await db.insert(schema.exercisesTable).values([
	{ name: 'Bench Press', measured_in: 'reps_and_weight' },
	{ name: 'Squat', measured_in: 'reps_and_weight' },
	{ name: 'Deadlift', measured_in: 'reps_and_weight' },
	{ name: 'Pull-ups', measured_in: 'reps' },
	{ name: 'Push-ups', measured_in: 'reps' },
	{ name: 'Running', measured_in: 'duration' },
	{ name: 'Plank', measured_in: 'duration' }
]);
console.log(`Seeding exercises complete.`);

console.log(`Seeding templates...`);
await db
	.insert(schema.templatesTable)
	.values([{ name: 'Push Day' }, { name: 'Pull Day' }, { name: 'Leg Day' }, { name: 'Full Body' }]);
console.log(`Seeding templates complete.`);

console.log(`Seeding template set groups...`);
await db.insert(schema.templateSetGroupsTable).values([
	{ exercise: 1, template: 1, index: 0, restDuration: 120 },
	{ exercise: 5, template: 1, index: 1, restDuration: 90 },
	{ exercise: 6, template: 1, index: 2, restDuration: 60 }
]);
console.log(`Seeding template set groups complete.`);

console.log(`Seeding template sets...`);
await db.insert(schema.templateSetsTable).values([
	{ exercise: 1, templateSetGroup: 1, template: 1, index: 0, type: 'warmup' },
	{ exercise: 1, templateSetGroup: 1, template: 1, index: 1, type: 'working' },
	{ exercise: 1, templateSetGroup: 1, template: 1, index: 2, type: 'working' },
	{ exercise: 5, templateSetGroup: 2, template: 1, index: 0, type: 'working' },
	{ exercise: 5, templateSetGroup: 2, template: 1, index: 1, type: 'working' },
	{ exercise: 6, templateSetGroup: 3, template: 1, index: 0, type: 'working' }
]);
console.log(`Seeding template sets complete.`);

console.log(`Seeding workouts...`);
await db.insert(schema.workoutsTable).values([{ template: 1 }, { template: 2 }]);
console.log(`Seeding workouts complete.`);

console.log(`Seeding set groups...`);
await db.insert(schema.setGroupsTable).values([
	{ exercise: 1, workout: 1, index: 0, restDuration: 120 },
	{ exercise: 5, workout: 1, index: 1, restDuration: 90 }
]);
console.log(`Seeding set groups complete.`);

console.log(`Seeding sets...`);
await db.insert(schema.setsTable).values([
	{ exercise: 1, setGroup: 1, workout: 1, index: 0, type: 'warmup', reps: 5, weight: 135 },
	{ exercise: 1, setGroup: 1, workout: 1, index: 1, type: 'working', reps: 5, weight: 185 },
	{ exercise: 1, setGroup: 1, workout: 1, index: 2, type: 'working', reps: 5, weight: 185 },
	{ exercise: 5, setGroup: 2, workout: 1, index: 0, type: 'working', reps: 20 },
	{ exercise: 5, setGroup: 2, workout: 1, index: 1, type: 'working', reps: 15 }
]);
console.log(`Seeding sets complete.`);

console.log(`Seeding complete.`);
