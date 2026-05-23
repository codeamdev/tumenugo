import { defineConfig } from 'drizzle-kit'

// Generates migration SQL for tenant schemas.
// Uses a temporary schema "tenant_migration_target" for introspection.
// The migration runner applies the generated SQL to each real tenant schema.
export default defineConfig({
  schema: './src/lib/db/schema/tenant.ts',
  out: './drizzle/tenant',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  schemaFilter: ['tenant_migration_target'],
})
