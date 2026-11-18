/**
 * db-copy with webhook-gateway's real profile (dist/db-copy.js in the image):
 * webhook-gateway.db ⇄ Postgres. A captured webhook body must come back
 * byte-for-byte — it is what gets re-delivered, and signatures are computed
 * over those bytes.
 *
 * SQLite → SQLite always; the Postgres directions with TEST_DATABASE_URL,
 * each Postgres side in a throwaway schema (the delivery-store suite resets
 * `deliveries` in the shared one, and this workspace runs files in parallel).
 */
import { afterAll, afterEach, describe, expect, it } from 'vitest'
import { randomBytes } from 'crypto'
import { mkdtempSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join, resolve } from 'path'
import { openDb, type DbHandle } from '@opensteward/shared'
import {
  callsReceiving,
  copyDatabase,
  recordProfile,
  type Endpoint,
} from '@opensteward/shared/db-copy'
import { WEBHOOK_DB_PROFILE } from '../../src/db-copy'
import { DeliveryStore } from '../../src/core/db/delivery-store'

const PG = process.env.TEST_DATABASE_URL
type Kind = 'sqlite' | 'postgres'
const DIRECTIONS: Array<[Kind, Kind]> = [['sqlite', 'sqlite']]
if (PG) DIRECTIONS.push(['sqlite', 'postgres'], ['postgres', 'sqlite'])

const dir = mkdtempSync(join(tmpdir(), 'webhook-db-copy-'))
afterAll(() => rmSync(dir, { recursive: true, force: true }))
const cleanups: Array<() => Promise<void>> = []
afterEach(async () => {
  while (cleanups.length) await cleanups.pop()!()
})

async function onPg(sql: string): Promise<void> {
  const h = await openDb({ databaseUrl: PG, poolMax: 1 })
  try {
    await h.execScript(sql)
  } finally {
    await h.close()
  }
}

async function side(kind: Kind): Promise<{ endpoint: Endpoint; open(): Promise<DbHandle> }> {
  if (kind === 'sqlite') {
    const path = join(dir, `${randomBytes(6).toString('hex')}.db`)
    return { endpoint: { kind: 'sqlite', path }, open: () => openDb({ sqlitePath: path }) }
  }
  const schema = `dbcopy_${randomBytes(6).toString('hex')}`
  await onPg(`CREATE SCHEMA ${schema}`)
  cleanups.push(() => onPg(`DROP SCHEMA IF EXISTS ${schema} CASCADE`))
  const u = new URL(PG!)
  u.searchParams.set('options', `-c search_path=${schema}`)
  const url = u.toString()
  return {
    endpoint: { kind: 'postgres', url },
    open: () => openDb({ databaseUrl: url, poolMax: 2 }),
  }
}

describe('WEBHOOK_DB_PROFILE', () => {
  it('opens every store buildServer() opens on its handle', () => {
    const server = readFileSync(resolve(__dirname, '../../src/core/server.ts'), 'utf8')
    const profile = readFileSync(resolve(__dirname, '../../src/db-copy.ts'), 'utf8')
    // Anything handed the handle, in any call shape; none is excluded today.
    expect(callsReceiving(server, 'handle')).toEqual(['DeliveryStore'])
    expect(callsReceiving(profile, 'handle')).toEqual(callsReceiving(server, 'handle'))
  })

  it('records the deliveries namespace', async () => {
    const rec = await recordProfile(WEBHOOK_DB_PROFILE)
    expect(rec.namespaces.map((n) => n.namespace)).toEqual(['deliveries'])
    expect(rec.tables).toEqual(['deliveries'])
  })
})

describe.each(DIRECTIONS)('webhook db-copy %s → %s', (fromKind, toKind) => {
  it('copies captured deliveries byte-for-byte with their retry state', async () => {
    const from = await side(fromKind)
    const to = await side(toKind)
    const body = Buffer.from('{"event":"invoice.paid","amount":1234,"note":"ünïcødé ✓"}', 'utf8')
    const h = await from.open()
    let ok: string
    let failed: string
    try {
      const store = await DeliveryStore.create(h)
      ok = await store.createDelivery('stripe', 'payments', 'http://x/webhooks', body, {
        'stripe-signature': 't=1,v1=abc',
      })
      failed = await store.createDelivery('xero', 'accounting', 'http://x/webhooks', body, {})
      await store.markDelivered(ok, 200)
      await store.markFailed(failed, 502, 'upstream 502')
    } finally {
      await h.close()
    }
    const source = await from.open()
    let before: unknown[]
    try {
      const s = await DeliveryStore.create(source)
      before = [await s.getDelivery(ok), await s.getDelivery(failed)]
    } finally {
      await source.close()
    }

    const report = await copyDatabase({
      profile: WEBHOOK_DB_PROFILE,
      from: from.endpoint,
      to: to.endpoint,
      log: () => {},
    })
    expect(report.tables).toEqual([
      { table: 'deliveries', sourceRows: 2, targetRowsBefore: null, copied: 2 },
    ])

    const t = await to.open()
    try {
      const s = await DeliveryStore.create(t)
      const after = [await s.getDelivery(ok), await s.getDelivery(failed)]
      expect(after).toEqual(before)
    } finally {
      await t.close()
    }
  })
})
