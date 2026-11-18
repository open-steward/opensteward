/**
 * RebillAdapter against a fake of Rebill's documented v3 HTTP surface.
 *
 * - Auth (https://docs.rebill.com/api/reference/authentication): "Every
 *   request to the Rebill API must include an API key in the `x-api-key`
 *   header."
 * - GET /v3/customers (https://docs.rebill.com/api/reference/customers):
 *   query `limit` ("Records per page. Defaults to `10`. Max `100`."),
 *   `starting_after` ("Pass the `id` of the last customer from the previous
 *   page"), `ending_before`; response `{ object, data, has_more, url }`.
 * - POST /v3/payments/search, /v3/subscriptions/search, /v3/plans/search:
 *   body `pagination` `{ limit, offset, sort, order }`; response
 *   `{ records, pagination: { totalItems, totalPages, currentPage,
 *   itemsPerPage, hasNextPage, hasPreviousPage } }`. Subscriptions and plans
 *   cap `limit` at 100; payments state no maximum.
 *
 * The fakes honour only those documented parameters and reject anything else.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { _resetCursorPager, readUpstreamPage, withPageSink } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import {
  documentedCustomer,
  documentedPayment,
  documentedPlan,
  documentedSubscription,
} from './fixtures/documented'

const { getMock, postMock, deleteMock, createMock } = vi.hoisted(() => {
  const getMock = vi.fn()
  const postMock = vi.fn()
  const deleteMock = vi.fn()
  const createMock = vi.fn((_cfg?: unknown) => ({
    get: getMock,
    post: postMock,
    delete: deleteMock,
  }))
  return { getMock, postMock, deleteMock, createMock }
})

vi.mock('axios', () => ({ default: { create: createMock } }))

import { RebillAdapter } from '../../../../../../src/verticals/payments/adapters/rebill'

const adapter = new RebillAdapter()
const CREDS: Credentials = { accessToken: 'sk_test_key' }

function sinkParams(p: QueryParams): QueryParams {
  return withPageSink({ ...p })
}

beforeEach(() => {
  getMock.mockReset()
  postMock.mockReset()
  deleteMock.mockReset()
  createMock.mockClear()
  _resetCursorPager()
})

describe('client', () => {
  it('sends the key in x-api-key against https://api.rebill.com/v3', async () => {
    getMock.mockResolvedValue({ data: documentedCustomer() })
    await adapter.getCustomer(CREDS, 'cus_1')
    const cfg = createMock.mock.calls[0]![0] as {
      baseURL: string
      headers: Record<string, string>
    }
    expect(cfg.baseURL).toBe('https://api.rebill.com/v3')
    expect(cfg.headers['x-api-key']).toBe('sk_test_key')
    expect(cfg.headers).not.toHaveProperty('Authorization')
  })
})

// ── customers: id keyset ─────────────────────────────────────────────────────

const CUSTOMER_KEYS = new Set(['limit', 'starting_after', 'ending_before'])

function serveCustomers(n: number) {
  const all = Array.from({ length: n }, (_, i) => ({
    ...documentedCustomer(),
    id: `cus_${String(i + 1).padStart(4, '0')}`,
  }))
  const calls: Record<string, unknown>[] = []
  getMock.mockImplementation(
    async (path: string, cfg: { params?: Record<string, unknown> } = {}) => {
      if (path !== '/customers') throw new Error(`unexpected path ${path}`)
      const params = cfg.params ?? {}
      calls.push({ ...params })
      for (const k of Object.keys(params)) {
        if (!CUSTOMER_KEYS.has(k)) throw new Error(`undocumented query param ${k}`)
      }
      const limit = params['limit'] === undefined ? 10 : Number(params['limit'])
      if (!Number.isInteger(limit) || limit < 1 || limit > 100)
        throw new Error(`bad limit ${limit}`)
      const after = params['starting_after'] as string | undefined
      const start = after ? all.findIndex((c) => c.id === after) + 1 : 0
      const data = all.slice(start, start + limit)
      return {
        data: { object: 'list', data, has_more: start + limit < all.length, url: '/v3/customers' },
      }
    },
  )
  return { calls, all }
}

describe('listCustomers', () => {
  it('walks N = 2L+1 customers by starting_after, each id once, hasMore exact', async () => {
    const L = 3
    const { calls, all } = serveCustomers(2 * L + 1)
    const seen: string[] = []
    const hasMore: (boolean | undefined)[] = []
    for (let page = 1; page <= 3; page++) {
      const params = sinkParams({ page, limit: L })
      const rows = await adapter.listCustomers(CREDS, params)
      seen.push(...rows.map((r) => r.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(all.map((c) => c.id))
    expect(new Set(seen).size).toBe(seen.length)
    expect(hasMore).toEqual([true, true, false])
    expect(calls[0]).toEqual({ limit: L })
    expect(calls[1]).toEqual({ limit: L, starting_after: 'cus_0003' })
    expect(calls[2]).toEqual({ limit: L, starting_after: 'cus_0006' })
  })

  it('clamps limit to the documented max of 100 and reports the size sent', async () => {
    const { calls } = serveCustomers(5)
    const params = sinkParams({ page: 1, limit: 250 })
    await adapter.listCustomers(CREDS, params)
    expect(calls[0]).toEqual({ limit: 100 })
    expect(readUpstreamPage(params)?.pageSize).toBe(100)
  })

  it('does not pass search through (no documented list parameter)', async () => {
    const { calls } = serveCustomers(2)
    await adapter.listCustomers(CREDS, { page: 1, limit: 10, search: 'ana' } as QueryParams)
    expect(calls[0]).toEqual({ limit: 10 })
  })

  it('getCustomer reads GET /customers/{customerId}', async () => {
    getMock.mockResolvedValue({ data: documentedCustomer() })
    const c = await adapter.getCustomer(CREDS, 'cus_786176c9d39f40d8af98428edb2aa3db')
    expect(getMock.mock.calls[0]![0]).toBe('/customers/cus_786176c9d39f40d8af98428edb2aa3db')
    expect(c.name).toBe('Ana Lopez')
  })
})

// ── search endpoints: offset in body.pagination ─────────────────────────────

function serveSearch(path: string, rows: Record<string, unknown>[], max: number | undefined) {
  const calls: unknown[] = []
  postMock.mockImplementation(async (p: string, body: Record<string, unknown>) => {
    if (p !== path) throw new Error(`unexpected path ${p}`)
    calls.push(body)
    for (const k of Object.keys(body ?? {})) {
      if (k !== 'pagination') throw new Error(`unexpected body key ${k}`)
    }
    const pag = (body?.pagination ?? {}) as Record<string, unknown>
    for (const k of Object.keys(pag)) {
      if (!['limit', 'offset', 'sort', 'order'].includes(k))
        throw new Error(`undocumented pagination.${k}`)
    }
    const limit = pag['limit'] === undefined ? 10 : Number(pag['limit'])
    if (!Number.isInteger(limit) || limit < 1 || (max !== undefined && limit > max))
      throw new Error(`bad limit ${limit}`)
    const offset = pag['offset'] === undefined ? 0 : Number(pag['offset'])
    const records = rows.slice(offset, offset + limit)
    return {
      data: {
        records,
        pagination: {
          totalItems: rows.length,
          totalPages: Math.ceil(rows.length / limit),
          currentPage: Math.floor(offset / limit) + 1,
          itemsPerPage: limit,
          hasNextPage: offset + limit < rows.length,
          hasPreviousPage: offset > 0,
        },
      },
    }
  })
  return calls
}

type ListFn = (c: Credentials, p: QueryParams) => Promise<{ id: string }[]>

async function walk(fn: ListFn, L: number, pages: number) {
  const seen: string[] = []
  const hasMore: (boolean | undefined)[] = []
  const totals: (number | undefined)[] = []
  for (let page = 1; page <= pages; page++) {
    const params = sinkParams({ page, limit: L })
    const rows = await fn(CREDS, params)
    seen.push(...rows.map((r) => r.id))
    const meta = readUpstreamPage(params)
    hasMore.push(meta?.hasMore)
    totals.push(meta?.totalCount)
  }
  return { seen, hasMore, totals }
}

const cases = [
  {
    name: 'listCharges',
    path: '/payments/search',
    max: undefined,
    make: (i: number) => ({ ...documentedPayment(), id: `pay_${i}` }),
    call: adapter.listCharges.bind(adapter) as ListFn,
  },
  {
    name: 'listSubscriptions',
    path: '/subscriptions/search',
    max: 100,
    make: (i: number) => ({ ...documentedSubscription(), id: `sub_${i}` }),
    call: adapter.listSubscriptions.bind(adapter) as ListFn,
  },
  {
    name: 'listPlans',
    path: '/plans/search',
    max: 100,
    make: (i: number) => ({ ...documentedPlan(), id: `pln_${i}` }),
    call: adapter.listPlans.bind(adapter) as ListFn,
  },
] as const

describe.each(cases)('$name', ({ path, max, make, call }) => {
  it(`walks N = 2L+1 rows over POST ${path}, each id once, hasMore exact`, async () => {
    const L = 3
    const rows = Array.from({ length: 2 * L + 1 }, (_, i) => make(i + 1))
    const calls = serveSearch(path, rows, max)
    const { seen, hasMore, totals } = await walk(call, L, 3)
    expect(seen).toEqual(rows.map((r) => r.id))
    expect(new Set(seen).size).toBe(seen.length)
    expect(hasMore).toEqual([true, true, false])
    expect(totals).toEqual([7, 7, 7])
    expect(calls).toEqual([
      { pagination: { limit: 3, offset: 0 } },
      { pagination: { limit: 3, offset: 3 } },
      { pagination: { limit: 3, offset: 6 } },
    ])
  })

  it('reads the end from pagination.hasNextPage when the last page is full', async () => {
    const L = 3
    const rows = Array.from({ length: 2 * L }, (_, i) => make(i + 1))
    serveSearch(path, rows, max)
    const { seen, hasMore } = await walk(call, L, 2)
    expect(seen).toEqual(rows.map((r) => r.id))
    expect(hasMore).toEqual([true, false])
  })

  it('does not pass search or other params into the body', async () => {
    const calls = serveSearch(path, [make(1)], max)
    await call(CREDS, {
      page: 1,
      limit: 5,
      search: 'x',
      updatedAfter: new Date('2026-01-01T00:00:00Z'),
    } as QueryParams)
    expect(calls).toEqual([{ pagination: { limit: 5, offset: 0 } }])
  })
})

describe('page-size clamps', () => {
  it('subscriptions and plans clamp to 100 and report the size sent', async () => {
    for (const c of cases.filter((x) => x.max === 100)) {
      const calls = serveSearch(c.path, [c.make(1)], 100)
      const params = sinkParams({ page: 2, limit: 150 })
      await c.call(CREDS, params)
      expect(calls[0]).toEqual({ pagination: { limit: 100, offset: 100 } })
      expect(readUpstreamPage(params)?.pageSize).toBe(100)
    }
  })

  it('payments search sends the caller limit (no documented maximum)', async () => {
    const calls = serveSearch('/payments/search', [documentedPayment()], undefined)
    const params = sinkParams({ page: 1, limit: 150 })
    await adapter.listCharges(CREDS, params)
    expect(calls[0]).toEqual({ pagination: { limit: 150, offset: 0 } })
    expect(readUpstreamPage(params)?.pageSize).toBeUndefined()
  })

  it('declares the documented max page size', () => {
    expect(adapter.capabilities.maxPageSize).toBe(100)
  })
})

describe('get by id', () => {
  it('getCharge reads GET /payments/:id', async () => {
    getMock.mockResolvedValue({ data: documentedPayment() })
    const c = await adapter.getCharge(CREDS, 'pay_d03f9b0c037f44e99107210bc39184fd')
    expect(getMock.mock.calls[0]![0]).toBe('/payments/pay_d03f9b0c037f44e99107210bc39184fd')
    expect(c.amount).toBe(1_000_000)
  })

  it('getSubscription reads GET /subscriptions/:id', async () => {
    getMock.mockResolvedValue({ data: documentedSubscription() })
    const s = await adapter.getSubscription(CREDS, 'sub_ad128372a40b8dbac50a8ca20c7305b')
    expect(getMock.mock.calls[0]![0]).toBe('/subscriptions/sub_ad128372a40b8dbac50a8ca20c7305b')
    expect(s.customerId).toBe('cus_647838573cf58d61bc659f6525f528ba')
  })

  it('getPlan reads GET /plans/{planId}', async () => {
    getMock.mockResolvedValue({ data: documentedPlan() })
    const p = await adapter.getPlan(CREDS, 'pln_3724ff11fa5c4853bea5a22b2867191b')
    expect(getMock.mock.calls[0]![0]).toBe('/plans/pln_3724ff11fa5c4853bea5a22b2867191b')
    expect(p.amount).toBe(9999)
  })
})

describe('refused resources', () => {
  it.each([
    ['listRefunds', () => adapter.listRefunds(CREDS, { page: 1, limit: 10 })],
    ['listInvoices', () => adapter.listInvoices(CREDS, { page: 1, limit: 10 })],
    ['getInvoice', () => adapter.getInvoice(CREDS, 'inv_1')],
  ])('%s throws 501 NOT_SUPPORTED and sends no request', async (_name, run) => {
    await expect(run()).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect(getMock).not.toHaveBeenCalled()
    expect(postMock).not.toHaveBeenCalled()
    expect(createMock).not.toHaveBeenCalled()
  })
})
