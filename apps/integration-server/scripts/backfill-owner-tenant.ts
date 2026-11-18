#!/usr/bin/env tsx
/**
 * Repair tool: populate `credentials.owner_tenant_id` from
 * `connect_sessions.tenant_id` for connection rows where it is NULL.
 *
 * Usage:
 *   pnpm --filter integration-server tsx scripts/backfill-owner-tenant.ts [--dry-run]
 *
 * What it does:
 *  1. SELECT every credentials row where owner_tenant_id IS NULL.
 *  2. For each, look up the most recent consumed connect_sessions row
 *     whose `connection_id` matches.
 *  3. UPDATE credentials.owner_tenant_id with that session's tenant_id.
 *
 * Idempotent — re-runs are no-ops once owner_tenant_id is populated.
 *
 * Why: the data-store cascade (when a connection is deleted, drop its
 * cached resource rows) reads `row.vertical` AND uses the connection's
 * id as the cache partition key. Connections without `owner_tenant_id`
 * also can't auto-sync on consume / on boot since there's no tenant to
 * route the sync job's emitted events to. Backfill closes both gaps.
 */
import 'dotenv/config'
import Database from 'better-sqlite3'
import path from 'node:path'

const args = new Set(process.argv.slice(2))
const dryRun = args.has('--dry-run')
const storePath =
  process.env['STORE_PATH'] ?? path.resolve('./apps/integration-server/data/credentials.db')

interface CredentialRow {
  id: string
  vertical: string | null
  platform: string
}

interface SessionRow {
  tenant_id: string
}

function main(): void {
  const db = new Database(storePath, { readonly: dryRun })
  try {
    const orphans = db
      .prepare(
        `SELECT id, vertical, platform FROM credentials
          WHERE owner_tenant_id IS NULL OR owner_tenant_id = ''`,
      )
      .all() as CredentialRow[]

    if (orphans.length === 0) {
      console.log('backfill: no credentials with NULL owner_tenant_id — nothing to do')
      return
    }

    console.log(`backfill: scanning ${orphans.length} connection(s) with NULL owner_tenant_id`)

    const findSession = db.prepare(
      `SELECT tenant_id FROM connect_sessions
        WHERE connection_id = ? AND consumed_at IS NOT NULL
        ORDER BY consumed_at DESC LIMIT 1`,
    )
    const update = db.prepare(
      `UPDATE credentials SET owner_tenant_id = ?, updated_at = ? WHERE id = ?`,
    )

    let updated = 0
    let skipped = 0
    for (const c of orphans) {
      const session = findSession.get(c.id) as SessionRow | undefined
      if (!session) {
        skipped++
        console.log(
          `backfill: skip ${c.id} (${c.vertical ?? '?'}:${c.platform}) — no consumed connect_session`,
        )
        continue
      }
      if (dryRun) {
        console.log(
          `backfill: DRY-RUN would update ${c.id} (${c.vertical ?? '?'}:${c.platform}) → owner_tenant_id="${session.tenant_id}"`,
        )
      } else {
        update.run(session.tenant_id, Date.now(), c.id)
        console.log(
          `backfill: updated ${c.id} (${c.vertical ?? '?'}:${c.platform}) → owner_tenant_id="${session.tenant_id}"`,
        )
      }
      updated++
    }

    console.log(
      `backfill: ${dryRun ? 'DRY-RUN ' : ''}done — updated=${updated}, skipped=${skipped}`,
    )
  } finally {
    db.close()
  }
}

main()
