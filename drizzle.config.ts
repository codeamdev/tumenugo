import { defineConfig } from 'drizzle-kit'

export default defineConfig({
  schema: './src/lib/db/schema/public.ts',
  out: './drizzle/public',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  schemaFilter: ['public'],
})
