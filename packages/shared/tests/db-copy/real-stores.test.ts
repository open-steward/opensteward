/**
 * db-copy with the real credential, resource and sync stores' migrations —
 * the integration-server's credentials.db and resources.db families. Data is
 * written through the stores and read back through them on the target, so
 * this proves the copied database is one the service can use: credentials
 * decrypt with the same STORE_SECRET (the ciphertext is byte-identical), the
 * resource cache and sync history read back, and the tombstone feed's id
 * sequence carries on past the copied ids.
 */
import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { CredentialStore } from '../../src/auth/store'
import { ResourceStore } from '../../src/data-store/resource-store'
import { SyncStore } from '../../src/data-store/sync-store'
import { copyDatabase, type DbCopyProfile } from '../../src/db-copy'
import { DIRECTIONS, makeSide, query, removeTmpRoot, type Side } from './helpers'

const SECRET = 'db-copy-real-store-secret-0123456789abcdef'
const TOKEN = 'sk_live_TOKEN_THAT_MUST_NEVER_BE_PRINTED'

// The same stores integration-server opens on each handle (the full
// profiles live in apps/integration-server/src/db-copy.ts).
const CREDENTIALS: DbCopyProfile = {
  name: 'credentials',
  description: 'credential store',
  open: async (h) => {
    await CredentialStore.create(h, SECRET)
  },
}
const RESOURCES: DbCopyProfile = {
  name: 'resources',
  description: 'resource cache + sync jobs',
  open: async (h) => {
    await ResourceStore.create(h)
    await SyncStore.create(h)
  },
}

const sides: Side[] = []
async function side(kind: Side['kind']): Promise<Side> {
  const s = await makeSide(kind)
  sides.push(s)
  return s
}
afterEach(async () => {
  while (sides.length) await sides.pop()!.cleanup()
})
afterAll(() => removeTmpRoot())

describe.each(DIRECTIONS)('db-copy with the real stores %s → %s', (fromKind, toKind) => {
  it('credentials: ciphertext byte-identical, decrypts with the same secret', async () => {
    const from = await side(fromKind)
    const to = await side(toKind)
    const h = await from.open()
    let id: string
    try {
      const store = await CredentialStore.create(h, SECRET)
      id = await store.create(
        'xero',
        'tenant-a',
        { accessToken: TOKEN, scope: 'read' },
        'Main',
        'accounting',
        'tenant-a',
      )
      await store.create('stripe', null, { accessToken: 'other' }, null, 'payments', null)
      await store.linkExternalAccount('xero', 'org-123', id, 'accounting')
    } finally {
      await h.close()
    }
    const before = await query<{ id: string; data: string }>(
      from,
      `SELECT id, data FROM credentials ORDER BY id`,
    )

    const lines: string[] = []
    const report = await copyDatabase({
      profile: CREDENTIALS,
      from: from.endpoint,
      to: to.endpoint,
      log: (l) => lines.push(l),
    })
    expect(report.namespaces.map((n) => n.namespace)).toEqual([
      'credentials',
      'connection_external_accounts',
    ])

    const after = await query<{ id: string; data: string }>(
      to,
      `SELECT id, data FROM credentials ORDER BY id`,
    )
    expect(after).toEqual(before)
    const t = await to.open()
    try {
      const store = await CredentialStore.create(t, SECRET)
      expect(await store.loadById(id)).toMatchObject({ accessToken: TOKEN, scope: 'read' })
      expect((await store.findByExternalAccount('xero', 'org-123'))?.id).toBe(id)
      expect(await store.list()).toHaveLength(2)
    } finally {
      await t.close()
    }
    const out = lines.join('\n')
    expect(out).not.toContain(TOKEN)
    for (const row of before) expect(out).not.toContain(row.data)
  })

  it('resources + sync jobs: rows, tombstones and the tombstone id sequence', async () => {
    const from = await side(fromKind)
    const to = await side(toKind)
    const h = await from.open()
    let jobId: string
    try {
      const rs = await ResourceStore.create(h)
      const ss = await SyncStore.create(h)
      for (const n of [1, 2, 3, 4]) {
        await rs.upsert('crm', 'hubspot', 'tenant-a', 'contacts', `c${n}`, {
          id: `c${n}`,
          name: `Contact ${n}`,
        })
      }
      await rs.delete('crm', 'hubspot', 'tenant-a', 'contacts', 'c4')
      await rs.markCollectionComplete('crm', 'hubspot', 'tenant-a', 'contacts')
      jobId = (await ss.create('crm', 'conn-1', 'hubspot', 'tenant-a', null)).id
      await ss.markCompleted(jobId, {})
    } finally {
      await h.close()
    }

    const report = await copyDatabase({
      profile: RESOURCES,
      from: from.endpoint,
      to: to.endpoint,
      log: () => {},
    })
    const counts = Object.fromEntries(report.tables.map((r) => [r.table, r.copied]))
    expect(counts).toMatchObject({
      resources: 3,
      resource_tombstones: 1,
      sync_jobs: 1,
      collection_sync: 1,
    })

    const t = await to.open()
    try {
      const rs = await ResourceStore.create(t)
      const ss = await SyncStore.create(t)
      expect(await rs.get('crm', 'hubspot', 'tenant-a', 'contacts', 'c2')).toEqual({
        id: 'c2',
        name: 'Contact 2',
      })
      expect(await rs.count()).toBe(3)
      expect((await ss.get(jobId))?.status).toBe('completed')
      // The feed cursor continues: the next tombstone is not a reused id.
      const lastCopied = await rs.latestTombstoneId()
      expect(lastCopied).toBe(1)
      await rs.delete('crm', 'hubspot', 'tenant-a', 'contacts', 'c3')
      const tombs = await rs.tombstonesSince(0)
      expect(tombs.map((x) => x.id)).toEqual([1, 2])
    } finally {
      await t.close()
    }
  })
})
