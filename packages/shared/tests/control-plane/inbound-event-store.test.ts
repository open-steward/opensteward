import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { openDb } from '../../src/db'
import type { DbHandle } from '../../src/db'
import { InboundEventStore } from '../../src/control-plane/inbound-event-store'

function ev(over?: Partial<Parameters<InboundEventStore['append']>[0]>) {
  return {
    dedupKey: 'k1',
    tenantId: 'owner1',
    vertical: 'payments',
    platform: 'stripe',
    connectionId: 'conn1',
    eventType: 'charge.succeeded',
    resourceType: 'charges',
    action: 'succeeded',
    resourceId: 'ch_1',
    payload: { id: 'ch_1' },
    ...over,
  }
}

describe('InboundEventStore', () => {
  let handle: DbHandle
  let store: InboundEventStore

  beforeEach(async () => {
    handle = await openDb({ sqlitePath: ':memory:' })
    store = await InboundEventStore.create(handle)
  })
  afterEach(async () => {
    await handle?.close()
  })

  it('appends and is idempotent on dedupKey', async () => {
    const a = await store.append(ev())
    expect(a.inserted).toBe(true)
    const b = await store.append(ev())
    expect(b.inserted).toBe(false)
    const rows = await store.listForTenant('owner1')
    expect(rows).toHaveLength(1)
    expect(rows[0]!.resourceId).toBe('ch_1')
  })

  it('lists for a tenant in seq order after a cursor', async () => {
    await store.append(ev({ dedupKey: 'k1', resourceId: 'ch_1' }))
    await store.append(ev({ dedupKey: 'k2', resourceId: 'ch_2' }))
    await store.append(ev({ dedupKey: 'k3', resourceId: 'ch_3' }))
    const all = await store.listForTenant('owner1')
    expect(all.map((r) => r.resourceId)).toEqual(['ch_1', 'ch_2', 'ch_3'])

    const after = await store.listForTenant('owner1', { afterSeq: all[0]!.seq })
    expect(after.map((r) => r.resourceId)).toEqual(['ch_2', 'ch_3'])
  })

  it('scopes by tenant', async () => {
    await store.append(ev({ dedupKey: 'k1', tenantId: 'owner1' }))
    await store.append(ev({ dedupKey: 'k2', tenantId: 'owner2' }))
    expect(await store.listForTenant('owner1')).toHaveLength(1)
    expect(await store.listForTenant('owner2')).toHaveLength(1)
  })

  it('gc deletes events older than a cutoff', async () => {
    await store.append(ev({ dedupKey: 'k1', receivedAt: 1000 }))
    await store.append(ev({ dedupKey: 'k2', receivedAt: 9_000_000_000_000 }))
    const deleted = await store.deleteOlderThan(1_000_000)
    expect(deleted).toBe(1)
    expect(await store.listForTenant('owner1')).toHaveLength(1)
  })
})
