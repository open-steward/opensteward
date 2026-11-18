/**
 * One invoice's line items are never served as another's.
 *
 * `/v1/invoices/:id/line_items` is the only list route whose parent is in the
 * PATH. Its query string is empty, so `cachedList` treated the page as the
 * whole 'invoice_line_items' collection of the connection and marked it
 * complete — but the store keys rows by resource type, not by invoice. The
 * next unfiltered read, for a DIFFERENT invoice, was a cache hit that served
 * the first invoice's line items.
 *
 * Driven through the REAL payments invoices router, the real `cachedList` and
 * a real SQLite resource store in database mode.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import Fastify, { type FastifyInstance } from 'fastify'
import { openDb, ResourceStore, type DbHandle } from '@opensteward/shared'
import { createInvoicesRouter } from '../../../../../src/verticals/payments/router/invoices'

const CONNECTION_ID = '00000000-0000-4000-8000-000000000003'
const LINE_ITEMS: Record<string, Array<{ id: string; invoiceId: string }>> = {
  in_A: [
    { id: 'li_A1', invoiceId: 'in_A' },
    { id: 'li_A2', invoiceId: 'in_A' },
  ],
  in_B: [{ id: 'li_B1', invoiceId: 'in_B' }],
}

describe('payments invoice line items and the cache', () => {
  let dir: string
  let handle: DbHandle
  let store: ResourceStore
  let fastify: FastifyInstance
  let calls: string[]

  beforeEach(async () => {
    dir = mkdtempSync(join(tmpdir(), 'os-line-items-'))
    handle = await openDb({ sqlitePath: join(dir, 'resources.db') })
    store = await ResourceStore.create(handle)
    calls = []
    const adapter = {
      platform: 'stripe',
      version: '0.0.0-test',
      listInvoiceLineItems: async (_creds: unknown, invoiceId: string) => {
        calls.push(invoiceId)
        return LINE_ITEMS[invoiceId] ?? []
      },
    }
    fastify = Fastify({ logger: false })
    fastify.addHook('preHandler', async (request, reply) => {
      Object.assign(request, {
        adapter,
        credentials: { accessToken: 'test' },
        vertical: 'payments',
        platform: 'stripe',
        connectionId: CONNECTION_ID,
        cacheMode: 'database',
        resourceStore: store,
        cacheReply: reply,
      })
    })
    await fastify.register(createInvoicesRouter(), { prefix: '/v1' })
    await fastify.ready()
  })

  afterEach(async () => {
    await fastify.close()
    await handle.close()
    rmSync(dir, { recursive: true, force: true })
  })

  const ids = (body: { data: Array<{ id: string }> }) => body.data.map((l) => l.id)

  it('serves each invoice its own line items', async () => {
    const a = await fastify.inject({ method: 'GET', url: '/v1/invoices/in_A/line_items' })
    const b = await fastify.inject({ method: 'GET', url: '/v1/invoices/in_B/line_items' })
    expect(ids(a.json())).toEqual(['li_A1', 'li_A2'])
    expect(ids(b.json())).toEqual(['li_B1'])
    expect(b.headers['x-opensteward-cache']).toBe('miss')
    expect(calls).toEqual(['in_A', 'in_B'])
  })

  it('never marks one invoice’s line items as the cached collection', async () => {
    await fastify.inject({ method: 'GET', url: '/v1/invoices/in_A/line_items' })
    expect(
      await store.collectionCompletedAt('payments', 'stripe', CONNECTION_ID, 'invoice_line_items'),
    ).toBeNull()
  })
})
