import { describe, it, expect, afterEach } from 'vitest'
import { openDb } from '@opensteward/shared'
import type { DbHandle } from '@opensteward/shared'
import { DeliveryStore } from '../../src/core/db/delivery-store'

// SQLite always (`:memory:`); Postgres when TEST_DATABASE_URL is set (CI service
// container / local docker). Each `open()` drops the tables first so the shared
// Postgres db stays isolated per test.
const BACKENDS: Array<{ name: string; open: () => Promise<DbHandle> }> = [
  { name: 'sqlite', open: () => openDb({ sqlitePath: ':memory:' }) },
]
if (process.env.TEST_DATABASE_URL) {
  BACKENDS.push({
    name: 'postgres',
    open: () => openDb({ databaseUrl: process.env.TEST_DATABASE_URL }),
  })
}

describe.each(BACKENDS)('DeliveryStore [$name]', (backend) => {
  let store: DeliveryStore | undefined

  afterEach(async () => {
    await store?.close()
    store = undefined
  })

  async function open(): Promise<DeliveryStore> {
    const handle = await backend.open()
    await handle.execScript(
      'DROP TABLE IF EXISTS deliveries; DROP TABLE IF EXISTS _schema_migrations',
    )
    store = await DeliveryStore.create(handle)
    return store
  }

  it('creates a delivery and marks it delivered', async () => {
    const s = await open()
    const id = await s.createDelivery(
      'xero',
      'accounting',
      'http://localhost:3010/webhooks/xero',
      Buffer.from('{}'),
      {},
    )
    expect(id).toMatch(/^[0-9a-f-]{36}$/)

    await s.markDelivered(id, 200)
    const row = await s.getDelivery(id)
    expect(row!.status).toBe('delivered')
    expect(row!.status_code).toBe(200)
    expect(row!.attempts).toBe(1)
  })

  it('marks failed and schedules retry', async () => {
    const s = await open()
    const id = await s.createDelivery(
      'fedex',
      'logistics',
      'http://localhost:3010/webhooks/logistics/fedex',
      Buffer.from('{}'),
      {},
    )

    await s.markFailed(id, 500, 'Internal Server Error')
    const row = await s.getDelivery(id)
    expect(row!.status).toBe('failed')
    expect(row!.attempts).toBe(1)
    expect(row!.next_retry_at).not.toBeNull()
  })

  it('moves to DLQ after max attempts', async () => {
    const s = await open()
    const id = await s.createDelivery(
      'xero',
      'accounting',
      'http://localhost:3010/webhooks/xero',
      Buffer.from('{}'),
      {},
    )

    // Exhaust all retries (MAX_ATTEMPTS = 6)
    for (let i = 0; i < 6; i++) {
      await s.markFailed(id, 500, `Attempt ${i + 1}`)
    }

    const row = await s.getDelivery(id)
    expect(row!.status).toBe('dlq')
  })

  it('lists DLQ items', async () => {
    const s = await open()
    const id = await s.createDelivery(
      'xero',
      'accounting',
      'http://localhost:3010/webhooks/xero',
      Buffer.from('{}'),
      {},
    )
    for (let i = 0; i < 6; i++) await s.markFailed(id, 500, 'fail')

    const dlq = await s.listDLQ()
    expect(dlq).toHaveLength(1)
    expect(dlq[0].id).toBe(id)
  })

  it('retries a DLQ item', async () => {
    const s = await open()
    const id = await s.createDelivery(
      'xero',
      'accounting',
      'http://localhost:3010/webhooks/xero',
      Buffer.from('{}'),
      {},
    )
    for (let i = 0; i < 6; i++) await s.markFailed(id, 500, 'fail')

    const ok = await s.retryDLQ(id)
    expect(ok).toBe(true)

    const row = await s.getDelivery(id)
    expect(row!.status).toBe('failed')
    expect(row!.attempts).toBe(0)
  })

  it('lists recent deliveries', async () => {
    const s = await open()
    await s.createDelivery(
      'xero',
      'accounting',
      'http://localhost:3010/webhooks/xero',
      Buffer.from('{}'),
      {},
    )
    await s.createDelivery(
      'fedex',
      'logistics',
      'http://localhost:3010/webhooks/logistics/fedex',
      Buffer.from('{}'),
      {},
    )
    expect(await s.listRecent()).toHaveLength(2)
  })

  it('an unreadable headers_json row lists no header names instead of failing the log', async () => {
    const handle = await backend.open()
    await handle.execScript(
      'DROP TABLE IF EXISTS deliveries; DROP TABLE IF EXISTS _schema_migrations',
    )
    const s = await DeliveryStore.create(handle)
    store = s
    const bad = await s.createDelivery('xero', 'accounting', 'http://up/x', Buffer.from('{}'), {
      a: '1',
    })
    const good = await s.createDelivery('xero', 'accounting', 'http://up/x', Buffer.from('{}'), {
      'x-b': '2',
    })
    await handle.kysely
      .updateTable('deliveries')
      .set({ headers_json: '{not json' })
      .where('id', '=', bad)
      .execute()

    const rows = await s.listRecent()
    expect(rows.find((r) => r.id === bad)!.headerNames).toEqual([])
    expect(rows.find((r) => r.id === good)!.headerNames).toEqual(['x-b'])
  })
})
