/**
 * DestinationStore — secrets encrypted at rest and never returned, config
 * validation, cursors (the tombstone watermark survives a backfill), the
 * conditional-UPDATE lease, due scheduling and run history.
 *
 * SQLite always; Postgres too when TEST_DATABASE_URL is set.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { DATA_STORE_BLOBS, decrypt, openDb, type DbHandle } from '@opensteward/shared'
import { DestinationStore, DESTINATIONS_SALT, TOMBSTONE_CURSOR_KEY } from '../src/store'
import { DestinationConfigError } from '../src/types'

const SECRET = 's'.repeat(40)

const BACKENDS: Array<{ name: string; open: () => Promise<DbHandle> }> = [
  { name: 'sqlite', open: () => openDb({ sqlitePath: ':memory:' }) },
]
if (process.env.TEST_DATABASE_URL) {
  BACKENDS.push({
    name: 'postgres',
    open: () => openDb({ databaseUrl: process.env.TEST_DATABASE_URL }),
  })
}

const S3 = {
  name: 'Lake',
  type: 's3',
  config: { bucket: 'my-bucket', region: 'eu-north-1', prefix: '/exports/prod' },
  secrets: { accessKeyId: 'AKIAEXAMPLE', secretAccessKey: 'super-secret-key' },
  scope: { tenants: '*' as const },
}

describe('registry', () => {
  it('the rotation registry carries the store salt', () => {
    expect(DATA_STORE_BLOBS).toContainEqual({
      table: 'destinations',
      column: 'encrypted_secrets',
      salt: DESTINATIONS_SALT,
    })
  })
})

describe.each(BACKENDS)('DestinationStore [$name]', (backend) => {
  let handle: DbHandle
  let store: DestinationStore
  let clock = 1_000_000

  beforeEach(async () => {
    handle = await backend.open()
    if (handle.dialect === 'postgres') {
      await handle.execScript('DROP SCHEMA public CASCADE; CREATE SCHEMA public')
    }
    clock = 1_000_000
    store = await DestinationStore.create(handle, SECRET, { now: () => clock })
  })

  afterEach(async () => {
    await handle.close()
  })

  it('encrypts secrets at rest and never returns them', async () => {
    const d = await store.create({ ...S3, actor: 'user-1' })
    expect(d.secretFieldsSet).toEqual(['accessKeyId', 'secretAccessKey'])
    expect(JSON.stringify(d)).not.toContain('super-secret-key')
    expect(JSON.stringify(await store.list())).not.toContain('super-secret-key')
    expect(d.config).toMatchObject({
      bucket: 'my-bucket',
      prefix: 'exports/prod/',
      compression: 'zstd',
    })
    expect(d.createdBy).toBe('user-1')
    expect(d.piiApprovedBy).toBeNull()

    const raw = (await handle.kysely
      .selectFrom('destinations')
      .select(['encrypted_secrets', 'config_json'])
      .where('id', '=', d.id)
      .executeTakeFirstOrThrow()) as { encrypted_secrets: string; config_json: string }
    expect(raw.encrypted_secrets).not.toContain('super-secret-key')
    expect(raw.config_json).not.toContain('super-secret-key')
    expect(JSON.parse(decrypt(raw.encrypted_secrets, SECRET, DESTINATIONS_SALT))).toEqual(
      S3.secrets,
    )
    expect(await store.getSecrets(d.id)).toEqual(S3.secrets)
  })

  it('rotates credentials by replacing the whole secret set', async () => {
    const d = await store.create(S3)
    const after = await store.setSecrets(d.id, {
      accessKeyId: 'NEW',
      secretAccessKey: 'new-secret',
    })
    expect(after!.secretFieldsSet).toEqual(['accessKeyId', 'secretAccessKey'])
    expect(await store.getSecrets(d.id)).toEqual({
      accessKeyId: 'NEW',
      secretAccessKey: 'new-secret',
    })
    const cleared = await store.setSecrets(d.id, {})
    expect(cleared!.secretFieldsSet).toEqual([])
    expect(await store.getSecrets(d.id)).toEqual({})
  })

  it('stores a loader and keeps config and credentials consistent', async () => {
    const d = await store.create({
      name: 'Lakehouse',
      type: 'databricks',
      config: {
        host: 'dbc.example.com',
        httpPath: '/sql/1.0/warehouses/abc',
        schema: 'opensteward',
        stage: { type: 's3', url: 's3://lake/dbx/' },
      },
      secrets: { token: 'dapi-secret-token' },
      scope: { tenants: '*' },
    })
    expect(d).toMatchObject({ type: 'databricks', secretFieldsSet: ['token'] })
    // Re-pointing the stage at Azure needs Azure upload credentials first.
    await expect(
      store.update(d.id, {
        config: {
          ...d.config,
          stage: { type: 'azure', url: 'azure://acct1.blob.core.windows.net/c01/' },
        },
      }),
    ).rejects.toThrow(/stageAccountKey or stageSasToken/)
    await store.setSecrets(d.id, {
      token: 'dapi-secret-token',
      stageSasToken: 'sv=2024&sig=abcdef',
    })
    const moved = await store.update(d.id, {
      config: {
        ...d.config,
        stage: { type: 'azure', url: 'azure://acct1.blob.core.windows.net/c01/' },
      },
    })
    expect(moved!.config['stage']).toMatchObject({ type: 'azure' })
    // …and the credentials can't then drop them.
    await expect(store.setSecrets(d.id, { token: 'dapi-secret-token' })).rejects.toBeInstanceOf(
      DestinationConfigError,
    )
  })

  it('rejects invalid config, half-set secrets and unimplemented types', async () => {
    await expect(store.create({ ...S3, config: { region: 'x' } })).rejects.toBeInstanceOf(
      DestinationConfigError,
    )
    await expect(
      store.create({ ...S3, secrets: { accessKeyId: 'only-half' } }),
    ).rejects.toBeInstanceOf(DestinationConfigError)
    await expect(store.create({ ...S3, type: 'oracle' })).rejects.toThrow(/not supported/)
    // A loader type validates its own config shape.
    await expect(store.create({ ...S3, type: 'snowflake' })).rejects.toThrow(
      'Invalid destination config.',
    )
    await expect(
      store.create({ ...S3, config: { ...S3.config, prefix: '../escape' } }),
    ).rejects.toBeInstanceOf(DestinationConfigError)
    await expect(
      store.create({
        name: 'az',
        type: 'azure_blob',
        config: { accountName: 'acct', container: 'exports' },
        scope: { tenants: '*' },
      }),
    ).rejects.toThrow(/accountKey or a sasToken/)
  })

  it('records the PII approver and clears it when PII is turned off', async () => {
    const d = await store.create({ ...S3, includePii: true, actor: 'admin-1' })
    expect(d.includePii).toBe(true)
    expect(d.piiApprovedBy).toBe('admin-1')
    const off = await store.update(d.id, { includePii: false, actor: 'admin-2' })
    expect(off).toMatchObject({ includePii: false, piiApprovedBy: null })
    const on = await store.update(d.id, { includePii: true, actor: 'admin-3' })
    expect(on!.piiApprovedBy).toBe('admin-3')
  })

  it('patches fields and re-validates config', async () => {
    const d = await store.create(S3)
    clock += 5
    const u = await store.update(d.id, {
      name: 'Renamed',
      intervalSec: 5,
      enabled: false,
      scope: { tenants: ['t1'], verticals: { crm: ['contacts'] } },
    })
    expect(u).toMatchObject({
      name: 'Renamed',
      intervalSec: 60, // clamped to the minimum
      enabled: false,
      scope: { tenants: ['t1'], verticals: { crm: ['contacts'] } },
      updatedAt: 1_000_005,
    })
    await expect(store.update(d.id, { config: { nope: true } })).rejects.toBeInstanceOf(
      DestinationConfigError,
    )
    expect(await store.update('missing', { name: 'x' })).toBeNull()
  })

  it('leases: one claim wins, renew needs ownership, expiry frees it', async () => {
    const d = await store.create(S3)
    expect(await store.claimLease(d.id, 'w1', 100, 1000)).toBe(true)
    expect(await store.claimLease(d.id, 'w2', 200, 1000)).toBe(false)
    expect(await store.renewLease(d.id, 'w2', 200, 1000)).toBe(false)
    expect(await store.renewLease(d.id, 'w1', 200, 1000)).toBe(true)
    // Expired (renewed to 1200): another worker may take it.
    expect(await store.claimLease(d.id, 'w2', 1201, 1000)).toBe(true)
    expect(await store.renewLease(d.id, 'w1', 1300, 1000)).toBe(false)
    await store.releaseLease(d.id, 'w1') // not the owner: no-op
    expect((await store.leaseOf(d.id))!.owner).toBe('w2')
    await store.releaseLease(d.id, 'w2')
    expect(await store.leaseOf(d.id)).toEqual({ owner: null, expiresAt: null })
  })

  it('lists due destinations by interval, enabled flag and lease', async () => {
    const a = await store.create({ ...S3, name: 'a', intervalSec: 60 })
    const b = await store.create({ ...S3, name: 'b', intervalSec: 60, enabled: false })
    expect((await store.listDue(0)).map((d) => d.id)).toEqual([a.id])
    await store.markResult(a.id, 'success', null, 10_000)
    expect(await store.listDue(69_999)).toEqual([])
    expect((await store.listDue(70_000)).map((d) => d.id)).toEqual([a.id])
    await store.claimLease(a.id, 'w1', 70_000, 1000)
    expect(await store.listDue(70_500)).toEqual([])
    expect(b.enabled).toBe(false)
  })

  it('cursors: backfill resets row watermarks but keeps the tombstone one', async () => {
    const d = await store.create(S3)
    await store.setRowCursor(d.id, 'crm', 'contacts', 500, 'pk-5')
    await store.setRowCursor(d.id, 'crm', 'deals', 600, 'pk-6')
    await store.setRowCursor(d.id, 'ecommerce', 'orders', 700, 'pk-7')
    await store.setTombstoneCursor(d.id, 42)
    await store.setRowCursor(d.id, 'crm', 'contacts', 800, 'pk-8')
    expect(await store.getCursor(d.id, 'crm', 'contacts')).toMatchObject({
      changedAt: 800,
      pk: 'pk-8',
    })
    expect(await store.resetCursors(d.id, { vertical: 'crm', resourceType: 'deals' })).toBe(1)
    expect(await store.getCursor(d.id, 'crm', 'deals')).toBeNull()
    expect(await store.resetCursors(d.id)).toBe(2)
    const left = await store.listCursors(d.id)
    expect(left).toHaveLength(1)
    expect(left[0]).toMatchObject({
      vertical: TOMBSTONE_CURSOR_KEY,
      resourceType: TOMBSTONE_CURSOR_KEY,
      tombstoneId: 42,
    })
  })

  it('runs: start, finish, list newest first; orphans are failed', async () => {
    const d = await store.create(S3)
    const r1 = await store.startRun(d.id, 'schedule', 100)
    await store.finishRun(r1, {
      status: 'success',
      finishedAt: 150,
      rowsWritten: 10,
      deletesWritten: 1,
      files: [{ path: 'a.parquet', kind: 'rows', rows: 10 }],
    })
    const r2 = await store.startRun(d.id, 'manual', 200)
    const runs = await store.listRuns(d.id)
    expect(runs.map((r) => r.id)).toEqual([r2, r1])
    expect(runs[1]).toMatchObject({
      status: 'success',
      rowsWritten: 10,
      deletesWritten: 1,
      files: [{ path: 'a.parquet', kind: 'rows', rows: 10 }],
    })
    // r2 is `running` with no live lease → a crashed worker's run.
    expect(await store.failOrphanedRuns(300)).toBe(1)
    expect((await store.listRuns(d.id))[0]).toMatchObject({ status: 'failed', finishedAt: 300 })
  })

  it('remembers exported connections and deletes everything with the destination', async () => {
    const d = await store.create(S3)
    await store.recordConnections(
      d.id,
      new Map([
        ['c1', 't1'],
        ['c2', null],
      ]),
    )
    await store.recordConnections(d.id, new Map([['c1', 't-other']]))
    expect(await store.knownConnections(d.id)).toEqual(
      new Map([
        ['c1', 't1'],
        ['c2', null],
      ]),
    )
    await store.setRowCursor(d.id, 'crm', 'contacts', 1, 'p')
    await store.startRun(d.id, 'manual', 1)
    expect(await store.delete(d.id)).toBe(true)
    expect(await store.get(d.id)).toBeNull()
    expect(await store.listCursors(d.id)).toEqual([])
    expect(await store.listRuns(d.id)).toEqual([])
    expect((await store.knownConnections(d.id)).size).toBe(0)
    expect(await store.delete(d.id)).toBe(false)
  })
})
