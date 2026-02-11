This directory contains the database instance, migration script, and schema.

Drizzle ORM is used with bun's SQLite driver for database management.

Relevant commands:
- `bunx --bun drizzle-kit generate` to generate the migration files
- `bun --bun run ~/git/wafleOS/src/lib/server/db/migrate.ts` to execute the migrations
- `bun --bun run ~/git/wafleOS/src/lib/server/db/seed.ts` to execute seeding
