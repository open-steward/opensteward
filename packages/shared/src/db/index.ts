/**
 * Runtime-selectable storage backend.
 *
 * `openDb()` returns a `DbHandle` over SQLite (default) or Postgres
 * (`DATABASE_URL` set); stores sit on top of the handle.
 */
export { openDb } from './open'
export { resolveDbConfig } from './config'
export { validateMigrations, applySqliteMigrations } from './migrate'
export { isUniqueViolation } from './sql-errors'
export type {
  Dialect,
  DbSchema,
  DbHandle,
  DualMigration,
  OpenDbOptions,
  ResolvedDbConfig,
  AppliedMigrationsReport,
  ApplyMigrationsOptions,
} from './types'
