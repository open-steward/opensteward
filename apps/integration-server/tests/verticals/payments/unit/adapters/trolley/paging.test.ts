/**
 * Trolley invoices, paged the way the router and the sync worker ask.
 *
 * `POST /v1/invoices/search` pages by number (https://developers.trolley.com/api/):
 * the body takes "The page number (default: 1)." and "Number of records in a
 * page (default: 10).", and the response carries `meta: { page, pages,
 * records }` ("Total number of pages in the result set."). The API-wide
 * Pagination section caps `pageSize`: "Defaults to 10, maximum 1000".
 *
 * The adapter used to send `{ pageSize }` alone, so page 2 was page 1 again.
 * The fake below honours only `page` and `pageSize`, and refuses a size
 * outside 1..1000.
 *
 * Recipients (`GET /v1/recipients`) page the same way, by query string.
 * Payouts have no flat list: they are the payments of every batch
 * (`GET /v1/batches`, then `GET /v1/batches/:batch-id/payments`), cut into
 * the caller's pages by pageByRows. The fakes honour only documented
 * parameters and return the documented `meta`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  _resetRowPager,
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
} from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import { TrolleyAdapter } from '../../../../../../src/verticals/payments/adapters/trolley'
import type { PaymentsAdapter } from '../../../../../../src/verticals/payments/adapter/interface'

const { postMock, getMock } = vi.hoisted(() => ({ postMock: vi.fn(), getMock: vi.fn() }))

vi.mock('../../../../../../src/verticals/payments/adapters/trolley/client', () => ({
  TrolleyClient: class {
    get = getMock
    post = postMock
    delete = vi.fn()
  },
}))

const adapter = new TrolleyAdapter()
const routed: PaymentsAdapter = adapter
const CREDS: Credentials = { accessToken: 'trolley_paging' }
const TROLLEY_MAX = 1000
const TROLLEY_DEFAULT = 10
const DOCUMENTED = new Set(['page', 'pageSize'])

function rowIds(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `I-${i + 1}`)
}

/** Serve `n` invoices from /invoices/search, honouring only `page` and `pageSize`. */
function serve(n: number) {
  const calls: Record<string, unknown>[] = []
  const ids = rowIds(n)
  postMock.mockImplementation(async (path: string, body: Record<string, unknown> = {}) => {
    if (path !== '/invoices/search') throw new Error(`unexpected path ${path}`)
    calls.push({ ...body })
    const size = body['pageSize'] === undefined ? TROLLEY_DEFAULT : Number(body['pageSize'])
    if (!Number.isInteger(size) || size < 1 || size > TROLLEY_MAX) {
      throw new Error(`invalid pageSize: ${String(body['pageSize'])}`)
    }
    const page = body['page'] === undefined ? 1 : Number(body['page'])
    if (!Number.isInteger(page) || page < 1) throw new Error('invalid page')
    const start = (page - 1) * size
    return {
      ok: true,
      invoices: ids
        .slice(start, start + size)
        .map((id) => ({ id, status: 'open', totalAmount: { value: '1.00', currency: 'EUR' } })),
      meta: { page, pages: Math.ceil(ids.length / size), records: ids.length },
    }
  })
  return calls
}

async function list(params: QueryParams): Promise<string[]> {
  return (await adapter.listInvoices(CREDS, params)).map((r) => r.id)
}

beforeEach(() => {
  postMock.mockReset()
  getMock.mockReset()
  _resetRowPager()
})

describe('TrolleyAdapter.listInvoices paging', () => {
  it('serves 2L+1 rows across three worker pages, each once and in order', async () => {
    const L = 10
    const calls = serve(2 * L + 1)
    const ids: string[] = []
    const hasMore: (boolean | undefined)[] = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: L })
      ids.push(...(await list(params)))
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(ids).toEqual(rowIds(2 * L + 1))
    expect(hasMore).toEqual([true, true, false])
    expect(calls[1]).toEqual({ page: 2, pageSize: L })
    for (const c of calls) for (const k of Object.keys(c)) expect(DOCUMENTED.has(k), k).toBe(true)
  })

  it('reports the meta end, not a full-page guess, when rows end on a page boundary', async () => {
    const L = 10
    serve(2 * L)
    const hasMore: (boolean | undefined)[] = []
    const totals: (number | undefined)[] = []
    for (let page = 1; page <= 2; page++) {
      const params = withPageSink({ page, limit: L })
      await list(params)
      hasMore.push(readUpstreamPage(params)?.hasMore)
      totals.push(readUpstreamPage(params)?.totalCount)
    }
    expect(hasMore).toEqual([true, false])
    expect(totals).toEqual([2 * L, 2 * L])
  })

  it('clamps a limit above 1000 and still serves every row', async () => {
    const N = 2 * TROLLEY_MAX + 1
    const calls = serve(N)
    const ids: string[] = []
    const hasMore: (boolean | undefined)[] = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: 1500 })
      ids.push(...(await list(params)))
      const report = readUpstreamPage(params)
      hasMore.push(report?.hasMore)
      expect(report?.pageSize).toBe(TROLLEY_MAX)
    }
    expect(ids).toEqual(rowIds(N))
    expect(hasMore).toEqual([true, true, false])
    expect(calls).toEqual([
      { page: 1, pageSize: TROLLEY_MAX },
      { page: 2, pageSize: TROLLEY_MAX },
      { page: 3, pageSize: TROLLEY_MAX },
    ])
  })

  it('API path: parseListQuery then listPage gives the right meta.hasMore', async () => {
    const L = 10
    serve(2 * L)
    const metas = []
    for (let page = 1; page <= 2; page++) {
      const params = parseListQuery({ page: String(page), limit: String(L) }, routed)
      const rows = await adapter.listInvoices(CREDS, params)
      metas.push(listPage(rows, params, 'trolley').meta)
    }
    expect(metas.map((m) => m.hasMore)).toEqual([true, false])
    expect(metas.map((m) => m.totalCount)).toEqual([2 * L, 2 * L])
  })

  it.each([
    ['a limit of 0', 0, 1],
    ['a negative limit', -5, 1],
    ['a fractional limit', 2.5, 2],
    ['a NaN limit', Number.NaN, 1],
  ])('sends a valid pageSize for %s', async (_label, limit, sent) => {
    const calls = serve(5)
    const params = withPageSink({ page: 1, limit })
    const ids = await list(params)
    expect(calls).toEqual([{ page: 1, pageSize: sent }])
    expect(ids).toHaveLength(sent)
  })

  it.each([
    ['no page', undefined, 1],
    ['page 0', 0, 1],
    ['a negative page', -3, 1],
    ['a fractional page', 2.5, 2],
  ])('sends a valid 1-based page for %s', async (_label, page, sent) => {
    const calls = serve(20)
    const params = withPageSink({ ...(page === undefined ? {} : { page }), limit: 5 })
    const ids = await list(params)
    expect(calls).toEqual([{ page: sent, pageSize: 5 }])
    expect(ids).toEqual(rowIds(20).slice((sent - 1) * 5, sent * 5))
  })

  it('sends the adapter default page size when no limit is given', async () => {
    const calls = serve(120)
    const ids = await list(withPageSink({ page: 1 }))
    expect(calls).toEqual([{ page: 1, pageSize: 50 }])
    expect(ids).toEqual(rowIds(50))
  })
})

// ── Recipients ───────────────────────────────────────────────────────────────

const RECIPIENT_PARAMS = new Set(['page', 'pageSize', 'startDate', 'orderBy', 'sortBy'])
const ORDER = { orderBy: 'createdAt', sortBy: 'asc' }

function recipientIds(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `R-${i + 1}`)
}

/** Serve `n` recipients from GET /recipients, honouring only documented query params. */
function serveRecipients(n: number) {
  const calls: Record<string, unknown>[] = []
  const ids = recipientIds(n)
  getMock.mockImplementation(async (path: string, query: Record<string, unknown> = {}) => {
    if (path !== '/recipients') throw new Error(`unexpected path ${path}`)
    const q = Object.fromEntries(Object.entries(query).filter(([, v]) => v !== undefined))
    for (const k of Object.keys(q))
      if (!RECIPIENT_PARAMS.has(k)) throw new Error(`undocumented ${k}`)
    calls.push(q)
    const size = q['pageSize'] === undefined ? TROLLEY_DEFAULT : Number(q['pageSize'])
    if (!Number.isInteger(size) || size < 1 || size > TROLLEY_MAX)
      throw new Error('invalid pageSize')
    const page = q['page'] === undefined ? 1 : Number(q['page'])
    const start = (page - 1) * size
    return {
      ok: true,
      recipients: ids.slice(start, start + size).map((id) => ({ id, email: `${id}@example.com` })),
      meta: { page, pages: Math.ceil(ids.length / size), records: ids.length },
    }
  })
  return calls
}

describe('TrolleyAdapter.listCustomers paging', () => {
  it('serves 2L+1 recipients across three pages, each once, hasMore exact', async () => {
    const L = 10
    const calls = serveRecipients(2 * L + 1)
    const ids: string[] = []
    const hasMore: (boolean | undefined)[] = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: L })
      ids.push(...(await adapter.listCustomers(CREDS, params)).map((c) => c.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(ids).toEqual(recipientIds(2 * L + 1))
    expect(hasMore).toEqual([true, true, false])
    expect(calls).toEqual([
      { page: 1, pageSize: L, ...ORDER },
      { page: 2, pageSize: L, ...ORDER },
      { page: 3, pageSize: L, ...ORDER },
    ])
  })

  it('clamps a limit above 1000 and reports the size it sent', async () => {
    const calls = serveRecipients(5)
    const params = withPageSink({ page: 1, limit: 5000 })
    await adapter.listCustomers(CREDS, params)
    expect(calls).toEqual([{ page: 1, pageSize: TROLLEY_MAX, ...ORDER }])
    expect(readUpstreamPage(params)?.pageSize).toBe(TROLLEY_MAX)
  })

  it('sends updatedAfter as the documented startDate filter', async () => {
    const calls = serveRecipients(3)
    await adapter.listCustomers(
      CREDS,
      withPageSink({ page: 1, limit: 10, updatedAfter: new Date('2025-01-23T05:05:00Z') }),
    )
    expect(calls).toEqual([
      { page: 1, pageSize: 10, ...ORDER, startDate: '2025-01-23T05:05:00.000Z' },
    ])
  })
})

// ── Payouts: payments flattened out of batches ───────────────────────────────

const BATCH_PARAMS = new Set(['page', 'pageSize', 'orderBy', 'sortBy'])
const PAYMENT_PARAMS = new Set(['page', 'pageSize'])

/**
 * Batches, each with its number of payments. The fake pages both lists at the
 * requested pageSize, so tests can shrink the documented 1000 by asking for
 * fewer rows per batch only through the data: here every page is one of
 * Trolley's 1000-row pages.
 */
function servePayouts(batchSizes: number[], opts: { batchMeta?: boolean } = {}) {
  const calls: { path: string; query: Record<string, unknown> }[] = []
  const batches = batchSizes.map((n, b) => ({
    id: `B-${b + 1}`,
    payments: Array.from({ length: n }, (_, i) => `P-${b + 1}-${i + 1}`),
  }))
  getMock.mockImplementation(async (path: string, query: Record<string, unknown> = {}) => {
    calls.push({ path, query: { ...query } })
    const size = Number(query['pageSize'] ?? TROLLEY_DEFAULT)
    const page = Number(query['page'] ?? 1)
    if (!Number.isInteger(size) || size < 1 || size > TROLLEY_MAX)
      throw new Error('invalid pageSize')
    const start = (page - 1) * size
    if (path === '/batches') {
      for (const k of Object.keys(query))
        if (!BATCH_PARAMS.has(k)) throw new Error(`undocumented ${k}`)
      return {
        ok: true,
        batches: batches.slice(start, start + size).map((b) => ({ id: b.id, status: 'complete' })),
        // The documented "List all batches" example response carries no meta.
        ...(opts.batchMeta === false
          ? {}
          : { meta: { page, pages: Math.ceil(batches.length / size), records: batches.length } }),
      }
    }
    const m = /^\/batches\/([^/]+)\/payments$/.exec(path)
    if (!m) throw new Error(`unexpected path ${path}`)
    for (const k of Object.keys(query))
      if (!PAYMENT_PARAMS.has(k)) throw new Error(`undocumented ${k}`)
    const batch = batches.find((b) => b.id === decodeURIComponent(m[1]!))
    if (!batch) throw new Error('not_found')
    return {
      ok: true,
      payments: batch.payments.slice(start, start + size).map((id) => ({
        id,
        status: 'processed',
        sourceAmount: '10.00',
        sourceCurrency: 'USD',
        batch: { id: batch.id },
      })),
      meta: {
        page,
        pages: Math.max(1, Math.ceil(batch.payments.length / size)),
        records: batch.payments.length,
      },
    }
  })
  return { calls, all: batches.flatMap((b) => b.payments) }
}

async function walkPayouts(L: number, pages: number) {
  const ids: string[] = []
  const hasMore: (boolean | undefined)[] = []
  for (let page = 1; page <= pages; page++) {
    const params = withPageSink({ page, limit: L })
    ids.push(...(await adapter.listPayouts(CREDS, params)).map((p) => p.id))
    hasMore.push(readUpstreamPage(params)?.hasMore)
  }
  return { ids, hasMore }
}

describe('TrolleyAdapter.listPayouts paging', () => {
  it('serves 2L+1 payments from uneven batches (including an empty one), each once', async () => {
    const L = 4
    // 9 = 2L+1 payments over batches of 3, 0, 5 and 1
    const { calls, all } = servePayouts([3, 0, 5, 1])
    expect(all).toHaveLength(2 * L + 1)
    const { ids, hasMore } = await walkPayouts(L, 3)
    expect(ids).toEqual(all)
    expect(new Set(ids).size).toBe(ids.length)
    expect(hasMore).toEqual([true, true, false])
    expect(calls[0]).toEqual({
      path: '/batches',
      query: { page: 1, pageSize: TROLLEY_MAX, orderBy: 'createdAt', sortBy: 'asc' },
    })
    for (const c of calls.slice(1)) expect(c.query).toEqual({ page: 1, pageSize: TROLLEY_MAX })
  })

  it('follows a batch whose payments span more than one Trolley page', async () => {
    const { calls, all } = servePayouts([TROLLEY_MAX + 2])
    const { ids, hasMore } = await walkPayouts(TROLLEY_MAX, 2)
    expect(ids).toEqual(all)
    expect(hasMore).toEqual([true, false])
    expect(
      calls.filter((c) => c.path === '/batches/B-1/payments').map((c) => c.query['page']),
    ).toEqual([1, 2])
  })

  it('reads the next page of batches when the first is full', async () => {
    const sizes: number[] = Array.from({ length: TROLLEY_MAX + 1 }, (_, i) =>
      i === TROLLEY_MAX ? 2 : 0,
    )
    sizes[0] = 1
    const { calls, all } = servePayouts(sizes)
    const { ids, hasMore } = await walkPayouts(2, 2)
    expect(ids).toEqual(all)
    expect(hasMore).toEqual([true, false])
    expect(calls.filter((c) => c.path === '/batches').map((c) => c.query['page'])).toEqual([1, 2])
  })

  it('without batch meta, a full 1000-batch page means another batch page is read', async () => {
    const sizes: number[] = Array.from({ length: TROLLEY_MAX + 1 }, (_, i) =>
      i === TROLLEY_MAX ? 2 : 0,
    )
    sizes[0] = 1
    const { calls, all } = servePayouts(sizes, { batchMeta: false })
    const { ids, hasMore } = await walkPayouts(2, 2)
    expect(ids).toEqual(all)
    expect(hasMore).toEqual([true, false])
    expect(calls.filter((c) => c.path === '/batches').map((c) => c.query['page'])).toEqual([1, 2])
  })

  it('without batch meta, a short batch page ends the walk', async () => {
    const { calls, all } = servePayouts([2, 1], { batchMeta: false })
    const { ids, hasMore } = await walkPayouts(3, 1)
    expect(ids).toEqual(all)
    expect(hasMore).toEqual([false])
    expect(calls.filter((c) => c.path === '/batches')).toHaveLength(1)
  })

  it('returns an empty last page for an account with no batches', async () => {
    servePayouts([])
    const { ids, hasMore } = await walkPayouts(10, 1)
    expect(ids).toEqual([])
    expect(hasMore).toEqual([false])
  })
})
