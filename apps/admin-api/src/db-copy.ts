#!/usr/bin/env node
/**
 * db-copy for admin-api's database: admin.db ⇄ Postgres, in either direction.
 *
 *   node dist/db-copy.js --from sqlite:/app/apps/admin-api/data/admin.db \
 *     --to env:DATABASE_URL --dry-run
 *
 * Stop admin-api first. `--help` for every option; the procedure for moving a
 * whole stack is docs/operations/switching-databases.md (and
 * scripts/switch-db.sh, which runs this in a one-off container of this image).
 */
import { runDbCopyCli, SCHEMA_ONLY_SECRET, type DbCopyProfile } from '@opensteward/shared/db-copy'
import { AdminStore } from './core/db/admin-store'
import { DashboardStore } from './core/db/dashboard-store'
import { IdentityStore } from './core/db/identity-store'
import { LogoStore } from './core/db/logo-store'
import { RuntimeSettingsStore } from './core/db/runtime-settings-store'
import { SupersetDashboardStore } from './core/db/superset-dashboard-store'

/**
 * Every store buildServer() (core/server.ts) opens on its one handle, in the
 * same order. A store added there must be added here: the copy refuses a
 * SQLite source holding tables this profile does not know, and
 * tests/unit/db-copy-profile.test.ts compares the two lists.
 */
export const ADMIN_DB_PROFILE: DbCopyProfile = {
  name: 'admin',
  description: 'admin-api: users, tenants, roles, settings, audit log, SSO, dashboards',
  defaultSqlitePath: '/app/apps/admin-api/data/admin.db',
  open: async (handle) => {
    await AdminStore.create(handle)
    await IdentityStore.create(handle, SCHEMA_ONLY_SECRET)
    await RuntimeSettingsStore.create(handle)
    await LogoStore.create(handle)
    await DashboardStore.create(handle)
    await SupersetDashboardStore.create(handle)
  },
}

const isMain =
  process.argv[1] != null &&
  (process.argv[1].endsWith('db-copy.js') || process.argv[1].endsWith('db-copy.ts'))
if (isMain) {
  void runDbCopyCli(process.argv.slice(2), [ADMIN_DB_PROFILE], {
    program: 'node dist/db-copy.js',
  }).then((code) => process.exit(code))
}
