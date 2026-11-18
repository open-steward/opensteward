/**
 * Pin Payments paging contract: every list method except listPaymentMethods.
 *
 * https://pinpayments.com/developers/api-reference (Pagination):
 *
 *   "When a paginated collection is returned, there is a pagination property
 *    that describes the total size of the collection and the current page
 *    number. ... To request the next page of a resource collection, pass a
 *    page parameter with the incremented page value."
 *
 * and (Responses): "Successful responses have a top-level key, response,
 * containing the data representing the resource."
 *
 * Pin documents no request parameter that sets the page size: per_page appears
 * only in the response's pagination object (25 in every example). So one
 * upstream page is not one caller page, and the adapter cuts the caller's
 * rows out of Pin's pages with pageByRows.
 *
 * The pagination object on customers, charges, refunds, transfers and
 * disputes carries `next` (null on the last page); on plans and subscriptions
 * the examples show only `count`, `per_page` and `current`. The fake serves
 * each shape. It honours ONLY the documented `page` parameter: anything else
 * the adapter sends is ignored, as an unknown parameter would be.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import {
  withPageSink,
  readUpstreamPage,
  parseListQuery,
  listPage,
  _resetRowPager,
  MAX_PAGE_LIMIT,
} from '@opensteward/shared'
import type { PageMaxBearing, QueryParams } from '@opensteward/shared'
import { PinPaymentsAdapter } from '../../../../../../src/verticals/payments/adapters/pin-payments/index'

const CREDS = { accessToken: 'cGluX3Rlc3Q6' }
/** Pin's page size, as its examples show it. Read from the response, never sent. */
const PER_PAGE = 25

type ListFn =
  | 'listCustomers'
  | 'listCharges'
  | 'listRefunds'
  | 'listPayouts'
  | 'listDisputes'
  | 'listPlans'
  | 'listSubscriptions'

interface Case {
  method: ListFn
  path: string
  /** Whether the documented pagination object carries next/previous/pages. */
  withNext: boolean
}

const CASES: Case[] = [
  { method: 'listCustomers', path: '/customers', withNext: true },
  { method: 'listCharges', path: '/charges', withNext: true },
  { method: 'listRefunds', path: '/refunds', withNext: true },
  { method: 'listPayouts', path: '/transfers', withNext: true },
  { method: 'listDisputes', path: '/disputes', withNext: true },
  { method: 'listPlans', path: '/plans', withNext: false },
  { method: 'listSubscriptions', path: '/subscriptions', withNext: false },
]

interface Request {
  path: string
  params: Record<string, unknown>
}

/** A fake Pin collection at `path` holding `n` rows, paged 25 at a time by `page` only. */
function fakePin(
  c: Case,
  n: number,
  perPage = PER_PAGE,
): { requests: Request[]; tokens: string[] } {
  const tokens = Array.from({ length: n }, (_, i) => `tok_${String(i).padStart(4, '0')}`)
  const requests: Request[] = []
  const get = vi.fn(async (path: string, config?: { params?: Record<string, unknown> }) => {
    const params = { ...(config?.params ?? {}) }
    requests.push({ path, params })
    if (path !== c.path) throw new Error(`unexpected path ${path}`)
    const raw = params['page']
    const page = raw === undefined ? 1 : Number(raw)
    if (!Number.isInteger(page) || page < 1) {
      throw Object.assign(new Error('invalid page'), { response: { status: 422 } })
    }
    const pages = Math.max(1, Math.ceil(n / perPage))
    const from = (page - 1) * perPage
    const rows = tokens.slice(from, from + perPage).map((token) => ({ token }))
    const pagination = c.withNext
      ? {
          current: page,
          previous: page > 1 ? page - 1 : null,
          next: page < pages ? page + 1 : null,
          per_page: perPage,
          pages,
          count: n,
        }
      : { count: n, per_page: perPage, current: page }
    return { data: { response: rows, count: rows.length, pagination } }
  })
  vi.spyOn(axios, 'create').mockReturnValue({ get, post: vi.fn(), defaults: {} } as never)
  return { requests, tokens }
}

async function drive(
  method: ListFn,
  L: number,
  pages: number,
): Promise<{ ids: string[]; hasMore: Array<boolean | undefined>; sizes: number[] }> {
  const adapter = new PinPaymentsAdapter()
  const ids: string[] = []
  const hasMore: Array<boolean | undefined> = []
  const sizes: number[] = []
  for (let page = 1; page <= pages; page++) {
    const params = withPageSink({ page, limit: L } as QueryParams)
    const out = await adapter[method](CREDS, params)
    sizes.push(out.length)
    ids.push(...out.map((r) => r.id))
    hasMore.push(readUpstreamPage(params)?.hasMore)
  }
  return { ids, hasMore, sizes }
}

afterEach(() => {
  vi.restoreAllMocks()
  _resetRowPager()
})

describe.each(CASES)('Pin Payments $method paging', (c) => {
  it('serves 2L+1 rows once each, in order, across pages 1..3 with exact hasMore', async () => {
    const L = 4
    const { tokens } = fakePin(c, 2 * L + 1)
    const { ids, hasMore, sizes } = await drive(c.method, L, 3)
    expect(ids).toEqual(tokens)
    expect(sizes).toEqual([L, L, 1])
    expect(hasMore).toEqual([true, true, false])
  })

  it('serves 2L+1 rows once each across upstream page boundaries', async () => {
    const L = 20
    const { tokens } = fakePin(c, 2 * L + 1)
    const { ids, hasMore, sizes } = await drive(c.method, L, 3)
    expect(ids).toEqual(tokens)
    expect(sizes).toEqual([L, L, 1])
    expect(hasMore).toEqual([true, true, false])
  })

  it('sends the documented page parameter for the next upstream page, and no size', async () => {
    const L = PER_PAGE
    const { requests } = fakePin(c, 2 * L + 1)
    await drive(c.method, L, 2)
    expect(requests.map((r) => r.params['page'])).toEqual([1, 2, 3])
    for (const r of requests) {
      expect(Object.keys(r.params)).toEqual(['page'])
    }
  })

  it('reads per_page from the response rather than assuming 25', async () => {
    const L = 4
    const { tokens } = fakePin(c, 2 * L + 1, 3)
    const { ids, hasMore } = await drive(c.method, L, 3)
    expect(ids).toEqual(tokens)
    expect(hasMore).toEqual([true, true, false])
  })

  it('reports an exact end when the collection is a multiple of the page size', async () => {
    const L = PER_PAGE
    const { tokens, requests } = fakePin(c, 2 * L)
    const { ids, hasMore } = await drive(c.method, L, 2)
    expect(ids).toEqual(tokens)
    expect(hasMore).toEqual([true, false])
    // The last full page is known to be the end: no empty page 3 is fetched.
    expect(requests.map((r) => r.params['page'])).toEqual([1, 2])
  })

  it('keeps the old default page size of 50 when the caller gives no limit', async () => {
    const { tokens } = fakePin(c, 120)
    const params = withPageSink({ page: 1 } as QueryParams)
    const out = await new PinPaymentsAdapter()[c.method](CREDS, params)
    expect(out.map((r) => r.id)).toEqual(tokens.slice(0, 50))
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })

  it('serves an empty collection with hasMore false', async () => {
    fakePin(c, 0)
    const { ids, hasMore } = await drive(c.method, 10, 1)
    expect(ids).toEqual([])
    expect(hasMore).toEqual([false])
  })

  it('serves a page asked for cold, with no earlier page in memory', async () => {
    const L = 30
    const { tokens } = fakePin(c, 2 * L + 1)
    const params = withPageSink({ page: 2, limit: L } as QueryParams)
    const out = await new PinPaymentsAdapter()[c.method](CREDS, params)
    expect(out.map((r) => r.id)).toEqual(tokens.slice(L, 2 * L))
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })

  it('clamps a limit above the maximum and still serves every row', async () => {
    const n = MAX_PAGE_LIMIT + 7
    const { tokens } = fakePin(c, n)
    const adapter = new PinPaymentsAdapter()
    const got: string[] = []
    const more: Array<boolean | null> = []
    for (const page of ['1', '2']) {
      const p = parseListQuery({ limit: '5000', page }, adapter as unknown as PageMaxBearing)
      expect(p.limit).toBe(MAX_PAGE_LIMIT)
      const env = listPage<{ id: string }>(await adapter[c.method](CREDS, p), p, 'pin-payments')
      got.push(...env.data.map((r) => r.id))
      more.push(env.meta.hasMore)
    }
    expect(got).toEqual(tokens)
    expect(more).toEqual([true, false])
  })

  it('gives meta.hasMore through parseListQuery and listPage', async () => {
    const { tokens } = fakePin(c, 7)
    const adapter = new PinPaymentsAdapter()
    const p1 = parseListQuery({ limit: '3', page: '1' }, adapter as unknown as PageMaxBearing)
    const e1 = listPage<{ id: string }>(await adapter[c.method](CREDS, p1), p1, 'pin-payments')
    expect(e1.data.map((r) => r.id)).toEqual(tokens.slice(0, 3))
    expect(e1.meta.hasMore).toBe(true)

    const p3 = parseListQuery({ limit: '3', page: '3' }, adapter as unknown as PageMaxBearing)
    const e3 = listPage<{ id: string }>(await adapter[c.method](CREDS, p3), p3, 'pin-payments')
    expect(e3.data.map((r) => r.id)).toEqual(tokens.slice(6))
    expect(e3.meta.hasMore).toBe(false)
  })
})

describe('Pin Payments pager keys', () => {
  it('never serves one connection the rows another connection fetched', async () => {
    const c = CASES[1]!
    const L = 30
    const adapter = new PinPaymentsAdapter()
    fakePin(c, 2 * L + 1)
    await adapter.listCharges(
      { accessToken: 'conn_a' },
      withPageSink({ page: 1, limit: L } as QueryParams),
    )
    // Connection B sees different rows, so a leaked slot would show.
    const tokensB = Array.from({ length: 2 * L + 1 }, (_, i) => `b_tok_${i}`)
    const get = vi.fn(async (_path: string, config?: { params?: Record<string, unknown> }) => {
      const page = Number(config?.params?.['page'] ?? 1)
      const from = (page - 1) * PER_PAGE
      const rows = tokensB.slice(from, from + PER_PAGE).map((token) => ({ token }))
      const pages = Math.ceil(tokensB.length / PER_PAGE)
      return {
        data: {
          response: rows,
          pagination: {
            current: page,
            next: page < pages ? page + 1 : null,
            per_page: PER_PAGE,
            pages,
            count: tokensB.length,
          },
        },
      }
    })
    vi.restoreAllMocks()
    vi.spyOn(axios, 'create').mockReturnValue({ get, post: vi.fn(), defaults: {} } as never)
    const out = await adapter.listCharges(
      { accessToken: 'conn_b' },
      withPageSink({ page: 2, limit: L } as QueryParams),
    )
    expect(out.map((r) => r.id)).toEqual(tokensB.slice(L, 2 * L))
  })
})

/** A fake whose body for each (path, page) is scripted by the test. */
function scriptedPin(
  body: (path: string, page: number) => { response: Array<{ token: string }>; pagination: object },
): Request[] {
  const requests: Request[] = []
  const get = vi.fn(async (path: string, config?: { params?: Record<string, unknown> }) => {
    const params = { ...(config?.params ?? {}) }
    requests.push({ path, params })
    return { data: body(path, Number(params['page'] ?? 1)) }
  })
  vi.spyOn(axios, 'create').mockReturnValue({ get, post: vi.fn(), defaults: {} } as never)
  return requests
}

const rowsOf = (prefix: string, page: number, n: number): Array<{ token: string }> =>
  Array.from({ length: n }, (_, i) => ({ token: `${prefix}_${page}_${i}` }))

describe('Pin Payments pager keys per collection', () => {
  it('never serves one collection the rows another collection fetched', async () => {
    const L = 30
    const requests = scriptedPin((path, page) => {
      const prefix = path.slice(1)
      return {
        response: page <= 3 ? rowsOf(prefix, page, PER_PAGE) : [],
        pagination: { current: page, next: page < 3 ? page + 1 : null, per_page: PER_PAGE },
      }
    })
    const adapter = new PinPaymentsAdapter()
    await adapter.listCustomers(CREDS, withPageSink({ page: 1, limit: L } as QueryParams))
    const out = await adapter.listCharges(CREDS, withPageSink({ page: 2, limit: L } as QueryParams))
    expect(out).toHaveLength(L)
    for (const r of out) expect(r.id.startsWith('charges_')).toBe(true)
    expect(requests.filter((r) => r.path === '/charges').length).toBeGreaterThan(0)
  })
})

describe.each(CASES.filter((c) => c.withNext))('Pin Payments $method pagination.next', (c) => {
  it('stops where `next` is null even when count says there are more rows', async () => {
    const requests = scriptedPin((path, page) => {
      if (path !== c.path) throw new Error(`unexpected path ${path}`)
      return {
        response: rowsOf('t', page, PER_PAGE),
        pagination: { current: page, next: null, per_page: PER_PAGE, pages: 4, count: 100 },
      }
    })
    const params = withPageSink({ page: 1, limit: 40 } as QueryParams)
    const out = await new PinPaymentsAdapter()[c.method](CREDS, params)
    expect(out).toHaveLength(PER_PAGE)
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    expect(requests.map((r) => r.params['page'])).toEqual([1])
  })

  it('ends the walk on a `next` that does not advance', async () => {
    const requests = scriptedPin((_path, page) => ({
      response: rowsOf('t', page, PER_PAGE),
      pagination: { current: page, next: page, per_page: PER_PAGE, count: 100 },
    }))
    const params = withPageSink({ page: 1, limit: 40 } as QueryParams)
    const out = await new PinPaymentsAdapter()[c.method](CREDS, params)
    expect(out).toHaveLength(PER_PAGE)
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    expect(requests).toHaveLength(1)
  })

  it('ends the walk on an empty page even when `next` points further', async () => {
    const requests = scriptedPin((_path, page) => ({
      response: page === 1 ? rowsOf('t', page, PER_PAGE) : [],
      pagination: { current: page, next: page + 1, per_page: PER_PAGE },
    }))
    const params = withPageSink({ page: 1, limit: 40 } as QueryParams)
    const out = await new PinPaymentsAdapter()[c.method](CREDS, params)
    expect(out).toHaveLength(PER_PAGE)
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    expect(requests.map((r) => r.params['page'])).toEqual([1, 2])
  })
})
