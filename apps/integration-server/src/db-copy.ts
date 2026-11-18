#!/usr/bin/env node
/**
 * db-copy for integration-server's two databases, each ⇄ Postgres in either
 * direction. On SQLite they are two files; on Postgres both live in the one
 * DATABASE_URL database, next to admin-api's tables.
 *
 *   node dist/db-copy.js --db credentials \
 *     --from sqlite:/app/apps/integration-server/data/credentials.db --to env:DATABASE_URL
 *   node dist/db-copy.js --db resources \
 *     --from sqlite:/app/apps/integration-server/data/resources.db --to env:DATABASE_URL
 *
 * Stop integration-server first. `--help` for every option; see
 * docs/operations/switching-databases.md.
 *
 * Not copied: the read-only SQL access principals (`analytics` namespace).
 * They exist only on Postgres and describe Postgres roles, so there is nothing
 * to carry to SQLite, and on the way to Postgres integration-server creates
 * them at boot.
 */
import {
  AdapterSettingsStore,
  ApiKeyStore,
  ConnectSessionStore,
  CredentialStore,
  EndUserStore,
  EndUserTokenStore,
  InboundEventStore,
  OAuthClientStore,
  ResourceStore,
  SandboxStore,
  SyncStore,
  WebhookDeliveryStore,
  WebhookSubscriptionStore,
} from '@opensteward/shared'
import { runDbCopyCli, SCHEMA_ONLY_SECRET, type DbCopyProfile } from '@opensteward/shared/db-copy'
import { DestinationStore } from '@opensteward/destinations'
import { LicenseStateStore } from '@opensteward/shared/licensing'

/**
 * The credential-store family: every store buildServer() (server.ts) opens on
 * `credHandle`, in the same order, minus the Postgres-only analytics
 * principals. A store added there must be added here — the copy refuses a
 * SQLite source holding tables this profile does not know, and
 * tests/db-copy/profiles.test.ts compares the lists.
 */
export const CREDENTIALS_DB_PROFILE: DbCopyProfile = {
  name: 'credentials',
  description:
    'integration-server: connections (encrypted credentials), adapter settings, end users, ' +
    'Connect Links, API keys, OAuth clients, webhooks, inbound events, sandbox, ' +
    'the license clock-rollback state',
  defaultSqlitePath: '/app/apps/integration-server/data/credentials.db',
  open: async (handle) => {
    await CredentialStore.create(handle, SCHEMA_ONLY_SECRET)
    await LicenseStateStore.create(handle)
    await AdapterSettingsStore.create(handle, SCHEMA_ONLY_SECRET)
    await EndUserStore.create(handle, SCHEMA_ONLY_SECRET)
    await ConnectSessionStore.create(handle)
    await ApiKeyStore.create(handle, SCHEMA_ONLY_SECRET)
    await OAuthClientStore.create(handle)
    await EndUserTokenStore.create(handle, SCHEMA_ONLY_SECRET)
    await WebhookSubscriptionStore.create(handle, SCHEMA_ONLY_SECRET)
    await WebhookDeliveryStore.create(handle)
    await InboundEventStore.create(handle)
    await SandboxStore.create(handle)
  },
}

/** The data-store family: every store buildServer() opens on `dataHandle`. */
export const RESOURCES_DB_PROFILE: DbCopyProfile = {
  name: 'resources',
  description: 'integration-server: synced records cache, sync jobs, destinations',
  defaultSqlitePath: '/app/apps/integration-server/data/resources.db',
  open: async (handle) => {
    await ResourceStore.create(handle)
    await SyncStore.create(handle)
    await DestinationStore.create(handle, SCHEMA_ONLY_SECRET)
  },
}

export const INTEGRATION_SERVER_DB_PROFILES = [CREDENTIALS_DB_PROFILE, RESOURCES_DB_PROFILE]

const isMain =
  process.argv[1] != null &&
  (process.argv[1].endsWith('db-copy.js') || process.argv[1].endsWith('db-copy.ts'))
if (isMain) {
  void runDbCopyCli(process.argv.slice(2), INTEGRATION_SERVER_DB_PROFILES, {
    program: 'node dist/db-copy.js',
  }).then((code) => process.exit(code))
}
