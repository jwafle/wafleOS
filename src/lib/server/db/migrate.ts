import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import * as schema from './schema';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { Database } from 'bun:sqlite';

const sqlite = new Database('wafleOS.db');
const db = drizzle(sqlite, { schema });
migrate(db, { migrationsFolder: './drizzle' });

console.log('Migration complete.');
