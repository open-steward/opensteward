/**
 * On Postgres, admin-api's and integration-server's databases are ONE
 * database (and webhook-gateway's can be too, when given the same
 * DATABASE_URL). db-copy clears a profile's tables before copying into them,
 * so two profiles that shared a table or a migration namespace would wipe or
 * version each other's data. This records every service's real db-copy
 * profile and requires them pairwise disjoint.
 *
 * Needs the workspace built (`pnpm run build`): the profiles import the
 * built @opensteward/shared and @opensteward/destinations.
 */
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { recordProfile, type RecordedProfile } from '../packages/shared/src/db-copy/profile.ts'
import { ADMIN_DB_PROFILE } from '../apps/admin-api/src/db-copy.ts'
import {
  CREDENTIALS_DB_PROFILE,
  RESOURCES_DB_PROFILE,
} from '../apps/integration-server/src/db-copy.ts'
import { WEBHOOK_DB_PROFILE } from '../apps/webhook-gateway/src/db-copy.ts'

test('every db-copy profile owns tables and namespaces no other profile owns', async () => {
  const recorded: RecordedProfile[] = []
  for (const p of [
    ADMIN_DB_PROFILE,
    CREDENTIALS_DB_PROFILE,
    RESOURCES_DB_PROFILE,
    WEBHOOK_DB_PROFILE,
  ]) {
    recorded.push(await recordProfile(p))
  }
  const clashes: string[] = []
  for (let i = 0; i < recorded.length; i++) {
    for (let j = i + 1; j < recorded.length; j++) {
      const a = recorded[i]!
      const b = recorded[j]!
      const bNs = new Set(b.namespaces.map((n) => n.namespace))
      for (const n of a.namespaces) {
        if (bNs.has(n.namespace))
          clashes.push(`namespace ${n.namespace}: ${a.profile.name} and ${b.profile.name}`)
      }
      for (const t of a.tables) {
        if (b.tables.includes(t))
          clashes.push(`table ${t}: ${a.profile.name} and ${b.profile.name}`)
      }
    }
  }
  assert.deepEqual(clashes, [])
  // And the profiles are not trivially empty.
  for (const r of recorded) assert.ok(r.tables.length > 0, `${r.profile.name} records no tables`)
})
