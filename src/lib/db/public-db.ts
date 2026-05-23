import { drizzle } from 'drizzle-orm/postgres-js'
import { pool } from './pool'
import * as schema from './schema/public'

export const publicDb = drizzle(pool, { schema })

export type PublicDB = typeof publicDb
