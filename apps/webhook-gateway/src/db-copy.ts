#!/usr/bin/env node
/**
 * db-copy for webhook-gateway's database: webhook-gateway.db ⇄ Postgres, in
 * either direction.
 *
 *   node dist/db-copy.js --from sqlite:/app/apps/webhook-gateway/data/webhook-gateway.db \
 *     --to env:DATABASE_URL --dry-run
 *
 * Stop webhook-gateway first. `--help` for every option; see
 * docs/operations/switching-databases.md.
 */
import { runDbCopyCli, type DbCopyProfile } from '@opensteward/shared/db-copy'
import { DeliveryStore } from './core/db/delivery-store'

/**
 * Every store buildServer() (core/server.ts) opens on its handle. A store
 * added there must be added here; tests/unit/db-copy.test.ts compares them.
 */
export const WEBHOOK_DB_PROFILE: DbCopyProfile = {
  name: 'webhook',
  description: 'webhook-gateway: captured inbound webhooks and their delivery/retry state',
  defaultSqlitePath: '/app/apps/webhook-gateway/data/webhook-gateway.db',
  open: async (handle) => {
    await DeliveryStore.create(handle)
  },
}

const isMain =
  process.argv[1] != null &&
  (process.argv[1].endsWith('db-copy.js') || process.argv[1].endsWith('db-copy.ts'))
if (isMain) {
  void runDbCopyCli(process.argv.slice(2), [WEBHOOK_DB_PROFILE], {
    program: 'node dist/db-copy.js',
  }).then((code) => process.exit(code))
}
