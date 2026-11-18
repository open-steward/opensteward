/**
 * GoCardless list methods, paged the way the router and the sync worker ask.
 *
 * Every GoCardless list endpoint is cursor-paginated
 * (https://docs.gocardless.com/docs/api-reference/data-conventions): "To page
 * through all results, keep passing the after cursor from each response until
 * the array is empty or shorter than the requested limit." `limit` is
 * "Maximum number of objects to return. Default 50, max 500, min 1." and
 * `meta.cursors.after` is the "ID of the last resource returned."
 *
 * The adapter used to send `{ limit }` alone (or nothing at all for
 * instalment schedules and plans), so page 2 was page 1 again. The fake below
 * honours only `after` and `limit` (plus the `payout` filter on
 * /payout_items), and refuses a limit outside 1..500.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  _resetCursorPager,
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
} from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import { GoCardlessAdapter } from '../../../../../../src/verticals/payments/adapters/gocardless'
import type { PaymentsAdapter } from '../../../../../../src/verticals/payments/adapter/interface'
import { DEFAULT_PAGE_SIZE } from '../../../../../../src/verticals/payments/adapters/gocardless/constants'

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }))

vi.mock('../../../../../../src/verticals/payments/adapters/gocardless/client', () => ({
  // The client is built per call from the connection's credentials; the token
  // is passed to the fake so two connections can be served different data.
  GoCardlessClient: class {
    private readonly token: string | undefined
    constructor(credentials: { accessToken?: string }) {
      this.token = credentials.accessToken
    }
    get = (path: string, params?: Record<string, unknown>) => getMock(path, params, this.token)
    post = vi.fn()
  },
}))

const adapter = new GoCardlessAdapter()
const routed: PaymentsAdapter = adapter
const CREDS: Credentials = { accessToken: 'sandbox_paging', extra: { environment: 'sandbox' } }
const GC_MAX = 500
const GC_DEFAULT = 50
const PAYOUT = 'PO123'

type ListMethod =
  | 'listCustomers'
  | 'listPaymentMethods'
  | 'listCharges'
  | 'listRefunds'
  | 'listSubscriptions'
  | 'listPlans'
  | 'listInvoices'
  | 'listPayouts'
  | 'listBalanceTransactions'

/** method, path, envelope key, fixed filters the method must send. */
const METHODS: [ListMethod, string, string, Record<string, unknown>][] = [
  ['listCustomers', '/customers', 'customers', {}],
  ['listPaymentMethods', '/mandates', 'mandates', {}],
  ['listCharges', '/payments', 'payments', {}],
  ['listRefunds', '/refunds', 'refunds', {}],
  ['listSubscriptions', '/subscriptions', 'subscriptions', {}],
  ['listPlans', '/subscriptions', 'subscriptions', {}],
  ['listInvoices', '/instalment_schedules', 'instalment_schedules', {}],
  ['listPayouts', '/payouts', 'payouts', {}],
  ['listBalanceTransactions', '/payout_items', 'payout_items', { payout: PAYOUT }],
]

function rowIds(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `ID${String(i + 1).padStart(4, '0')}`)
}

/**
 * Serve `n` rows at `path` under `key`, honouring only `after`, `limit` and
 * the method's fixed filters. `meta.cursors.after` is the last id returned,
 * or null once nothing follows (`nullAtEnd`) — the docs promise only the
 * former, so by default it is set on every non-empty page.
 */
function serve(
  path: string,
  key: string,
  n: number,
  filters: Record<string, unknown> = {},
  opts: { nullAtEnd?: boolean } = {},
) {
  const calls: Record<string, unknown>[] = []
  const ids = rowIds(n)
  const documented = new Set(['after', 'limit', ...Object.keys(filters)])
  getMock.mockImplementation(async (p: string, params: Record<string, unknown> = {}) => {
    if (p !== path) throw new Error(`unexpected path ${p}`)
    calls.push({ ...params })
    for (const k of Object.keys(params)) {
      if (!documented.has(k)) throw new Error(`undocumented param ${k}`)
    }
    for (const [k, v] of Object.entries(filters)) {
      if (params[k] !== v) throw new Error(`missing filter ${k}`)
    }
    const limit = params['limit'] === undefined ? GC_DEFAULT : Number(params['limit'])
    if (!Number.isInteger(limit) || limit < 1 || limit > GC_MAX) {
      throw new Error(`invalid_limit: ${String(params['limit'])}`)
    }
    const after = params['after'] as string | undefined
    const start = after === undefined ? 0 : ids.indexOf(after) + 1
    if (after !== undefined && start === 0) throw new Error(`unknown cursor ${after}`)
    const page = ids.slice(start, start + limit)
    const more = start + limit < ids.length
    const cursor = page.length === 0 || (opts.nullAtEnd && !more) ? null : page[page.length - 1]
    return {
      [key]: page.map((id) => ({ id, amount: 100, currency: 'GBP' })),
      meta: { cursors: { before: null, after: cursor }, limit },
    }
  })
  return calls
}

function base(method: ListMethod): Record<string, unknown> {
  return method === 'listBalanceTransactions' ? { payout_id: PAYOUT } : {}
}

async function call(method: ListMethod, params: QueryParams): Promise<{ id: string }[]> {
  const fn = adapter[method].bind(adapter) as (
    c: Credentials,
    p: QueryParams,
  ) => Promise<{ id: string }[]>
  return fn(CREDS, params)
}

beforeEach(() => {
  getMock.mockReset()
  _resetCursorPager()
})

describe('GoCardlessAdapter capabilities', () => {
  it('declares the documented maximum of 500', () => {
    expect(adapter.capabilities?.maxPageSize).toBe(GC_MAX)
  })
})

describe.each(METHODS)('GoCardlessAdapter.%s paging', (method, path, key, filters) => {
  it('serves 2L+1 rows across three worker pages, each once and in order', async () => {
    const L = 10
    const calls = serve(path, key, 2 * L + 1, filters)
    const ids: string[] = []
    const hasMore: (boolean | undefined)[] = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ ...base(method), page, limit: L })
      const rows = await call(method, params)
      ids.push(...rows.map((r) => r.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(ids).toEqual(rowIds(2 * L + 1))
    expect(hasMore).toEqual([true, true, false])
    expect(calls).toHaveLength(3)
    expect(calls[0]).toEqual({ ...filters, limit: L })
    expect(calls[1]).toEqual({ ...filters, limit: L, after: rowIds(L)[L - 1] })
  })

  it('reports the end when meta.cursors.after is null on a full last page', async () => {
    const L = 10
    serve(path, key, 2 * L, filters, { nullAtEnd: true })
    const hasMore: (boolean | undefined)[] = []
    for (let page = 1; page <= 2; page++) {
      const params = withPageSink({ ...base(method), page, limit: L })
      await call(method, params)
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(hasMore).toEqual([true, false])
  })

  it('clamps a limit above 500 and still serves every row', async () => {
    const N = 2 * GC_MAX + 1
    const calls = serve(path, key, N, filters)
    const ids: string[] = []
    const hasMore: (boolean | undefined)[] = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ ...base(method), page, limit: 1000 })
      const rows = await call(method, params)
      ids.push(...rows.map((r) => r.id))
      const report = readUpstreamPage(params)
      hasMore.push(report?.hasMore)
      expect(report?.pageSize).toBe(GC_MAX)
    }
    expect(ids).toEqual(rowIds(N))
    expect(hasMore).toEqual([true, true, false])
    expect(calls.map((c) => c['limit'])).toEqual([GC_MAX, GC_MAX, GC_MAX])
  })

  it('API path: parseListQuery then listPage gives the right meta.hasMore', async () => {
    const L = 10
    serve(path, key, 2 * L + 1, filters)
    const metas = []
    const ids: string[] = []
    for (let page = 1; page <= 3; page++) {
      const params = parseListQuery({ page: String(page), limit: String(L) }, routed)
      Object.assign(params, base(method))
      const rows = await call(method, params)
      ids.push(...rows.map((r) => r.id))
      metas.push(listPage(rows, params, 'gocardless').meta)
    }
    expect(ids).toEqual(rowIds(2 * L + 1))
    expect(metas.map((m) => m.hasMore)).toEqual([true, true, false])
  })
})

describe('GoCardlessAdapter page size guards (direct calls, outside the router)', () => {
  it.each([
    ['a limit of 0', 0, 1],
    ['a negative limit', -5, 1],
    ['a fractional limit', 2.5, 2],
    ['a NaN limit', Number.NaN, DEFAULT_PAGE_SIZE],
  ])('sends a valid limit for %s', async (_label, limit, sent) => {
    const calls = serve('/customers', 'customers', 200)
    const params = withPageSink({ page: 1, limit })
    const rows = await call('listCustomers', params)
    expect(calls).toEqual([{ limit: sent }])
    expect(rows).toHaveLength(sent)
  })

  it('falls back to DEFAULT_PAGE_SIZE when no limit is given', async () => {
    const calls = serve('/customers', 'customers', 3)
    await call('listCustomers', {} as QueryParams)
    expect(calls).toEqual([{ limit: DEFAULT_PAGE_SIZE }])
  })

  it('keeps plans and subscriptions on separate cursor walks', async () => {
    const L = 5
    const calls = serve('/subscriptions', 'subscriptions', 3 * L)
    await call('listSubscriptions', withPageSink({ page: 1, limit: L }))
    await call('listSubscriptions', withPageSink({ page: 2, limit: L }))
    // Plans page 2 must walk its own chain, not reuse the subscriptions cursor
    // for page 3.
    const plans = await call('listPlans', withPageSink({ page: 2, limit: L }))
    expect(plans.map((r) => r.id)).toEqual(rowIds(3 * L).slice(L, 2 * L))
    expect(calls).toHaveLength(4)
  })
})

/**
 * A cursor-paginated fake over several independent collections at one path.
 * `pick` chooses the collection from the request (its filters or the
 * connection's token). Cursors are ids, so a cursor from another collection is
 * rejected, just as GoCardless would not find it in this one.
 */
function serveMany(
  path: string,
  key: string,
  collections: Record<string, string[]>,
  pick: (params: Record<string, unknown>, token: string | undefined) => string,
) {
  const calls: { collection: string; params: Record<string, unknown> }[] = []
  getMock.mockImplementation(
    async (p: string, params: Record<string, unknown> = {}, token?: string) => {
      if (p !== path) throw new Error(`unexpected path ${p}`)
      const collection = pick(params, token)
      const ids = collections[collection]
      if (!ids) throw new Error(`unknown collection ${collection}`)
      calls.push({ collection, params: { ...params } })
      const limit = Number(params['limit'])
      const after = params['after'] as string | undefined
      const start = after === undefined ? 0 : ids.indexOf(after) + 1
      if (after !== undefined && start === 0) throw new Error(`resource_not_found: ${after}`)
      const page = ids.slice(start, start + limit)
      return {
        [key]: page.map((id) => ({ id, amount: 100, currency: 'GBP' })),
        meta: {
          cursors: { before: null, after: page.length ? page[page.length - 1] : null },
          limit,
        },
      }
    },
  )
  return calls
}

function prefixed(prefix: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => `${prefix}${String(i + 1).padStart(4, '0')}`)
}

describe('GoCardlessAdapter pager keys', () => {
  it('keeps each connection on its own cursor walk', async () => {
    const L = 5
    const A: Credentials = { accessToken: 'sandbox_conn_a', extra: { environment: 'sandbox' } }
    const B: Credentials = { accessToken: 'sandbox_conn_b', extra: { environment: 'sandbox' } }
    const calls = serveMany(
      '/customers',
      'customers',
      { sandbox_conn_a: prefixed('CA', 3 * L), sandbox_conn_b: prefixed('CB', 3 * L) },
      (_params, token) => token ?? '',
    )
    await adapter.listCustomers(A, withPageSink({ page: 1, limit: L }))
    await adapter.listCustomers(A, withPageSink({ page: 2, limit: L }))
    // Connection B's page 2 must come from B's own page 1, never A's cursor.
    const rows = await adapter.listCustomers(B, withPageSink({ page: 2, limit: L }))
    expect(rows.map((r) => r.id)).toEqual(prefixed('CB', 3 * L).slice(L, 2 * L))
    const bCalls = calls.filter((c) => c.collection === 'sandbox_conn_b').map((c) => c.params)
    expect(bCalls).toEqual([{ limit: L }, { limit: L, after: `CB${String(L).padStart(4, '0')}` }])
  })

  it('keeps each payout on its own payout_items walk', async () => {
    const L = 5
    const calls = serveMany(
      '/payout_items',
      'payout_items',
      { PO_A: prefixed('PA', 3 * L), PO_B: prefixed('PB', 3 * L) },
      (params) => String(params['payout']),
    )
    await call('listBalanceTransactions', withPageSink({ payout_id: 'PO_A', page: 1, limit: L }))
    await call('listBalanceTransactions', withPageSink({ payout_id: 'PO_A', page: 2, limit: L }))
    const rows = await call(
      'listBalanceTransactions',
      withPageSink({ payout_id: 'PO_B', page: 2, limit: L }),
    )
    expect(rows.map((r) => r.id)).toEqual(prefixed('PB', 3 * L).slice(L, 2 * L))
    const bCalls = calls.filter((c) => c.collection === 'PO_B').map((c) => c.params)
    expect(bCalls).toEqual([
      { payout: 'PO_B', limit: L },
      { payout: 'PO_B', limit: L, after: `PB${String(L).padStart(4, '0')}` },
    ])
  })

  it('does not reuse a cursor minted at another limit', async () => {
    const calls = serve('/customers', 'customers', 30)
    await call('listCustomers', withPageSink({ page: 1, limit: 5 }))
    await call('listCustomers', withPageSink({ page: 2, limit: 5 }))
    // Page 2 at limit 7 starts after the 7th row, not after the 5th.
    const rows = await call('listCustomers', withPageSink({ page: 2, limit: 7 }))
    expect(rows.map((r) => r.id)).toEqual(rowIds(30).slice(7, 14))
    expect(calls.slice(2)).toEqual([{ limit: 7 }, { limit: 7, after: rowIds(30)[6] }])
  })
})

describe('GoCardlessAdapter stop rule', () => {
  it('ends on a short page even when meta.cursors.after is still set', async () => {
    // "keep passing the after cursor ... until the array is empty or shorter
    // than the requested limit". The fake sets after on every non-empty page.
    const L = 10
    const calls = serve('/customers', 'customers', 2 * L - 1)
    const hasMore: (boolean | undefined)[] = []
    for (let page = 1; page <= 2; page++) {
      const params = withPageSink({ page, limit: L })
      await call('listCustomers', params)
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(hasMore).toEqual([true, false])
    expect(calls).toHaveLength(2)
  })
})
