/**
 * Mollie list methods, paged the way the router and the sync worker ask.
 *
 * Every Mollie list endpoint fixed here is cursor-paginated by item id
 * (e.g. https://docs.mollie.com/reference/list-payments): `from` — "Provide an
 * ID to start the result set from the item with the given ID and onwards.
 * This allows you to paginate the result set." — and `limit` — "The maximum
 * number of items to return. Defaults to 50 items." (schema maximum 250).
 * "If more items are available, a `_links.next` URL will be present in the
 * result as well."
 *
 * `from` is INCLUSIVE, so the next cursor must be read from
 * `_links.next.href`, never from the last row of the current page. The
 * adapter used to send `{ limit }` alone (or nothing at all for payouts and
 * chargebacks), so page 2 was page 1 again. The fake below honours only
 * `from` and `limit`, and refuses a limit outside 1..250.
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
import { MollieAdapter } from '../../../../../../src/verticals/payments/adapters/mollie'
import type { PaymentsAdapter } from '../../../../../../src/verticals/payments/adapter/interface'

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }))

vi.mock('../../../../../../src/verticals/payments/adapters/mollie/client', () => ({
  // The client is built per call from the connection's credentials; the token
  // is passed to the fake so two connections can be served different data.
  MollieClient: class {
    private readonly token: string | undefined
    constructor(credentials: { accessToken?: string }) {
      this.token = credentials.accessToken
    }
    get = (path: string, params?: Record<string, unknown>) => getMock(path, params, this.token)
    post = vi.fn()
    delete = vi.fn()
  },
}))

const adapter = new MollieAdapter()
const routed: PaymentsAdapter = adapter
const CREDS: Credentials = { accessToken: 'test_paging' }
const MOLLIE_MAX = 250
const MOLLIE_DEFAULT = 50
const BASE = 'https://api.mollie.com/v2'
/** The adapter's default page size, unchanged by the paging fix; pinned here, not imported. */
const ADAPTER_DEFAULT = 100

type ListMethod =
  'listCustomers' | 'listCharges' | 'listRefunds' | 'listInvoices' | 'listPayouts' | 'listDisputes'

/** method, path, `_embedded` key, id prefix. */
const METHODS: [ListMethod, string, string, string][] = [
  ['listCustomers', '/customers', 'customers', 'cst_'],
  ['listCharges', '/payments', 'payments', 'tr_'],
  ['listRefunds', '/refunds', 'refunds', 're_'],
  ['listInvoices', '/invoices', 'invoices', 'inv_'],
  ['listPayouts', '/payouts', 'payouts', 'payout_'],
  ['listDisputes', '/chargebacks', 'chargebacks', 'chb_'],
]

function rowIds(prefix: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => `${prefix}${String(i + 1).padStart(4, '0')}`)
}

/**
 * Serve collections at `path` under `_embedded[key]`, honouring only `from`
 * and `limit`. `pick` chooses the collection (by the connection's token), so
 * a cursor from another collection is rejected just as Mollie would.
 * `_links.next` is a HAL link whose href carries the next page's `from`, and
 * null on the last page.
 */
function serveMany(
  path: string,
  key: string,
  collections: Record<string, string[]>,
  pick: (token: string | undefined) => string,
  onCall: (params: Record<string, unknown>) => void = () => {},
) {
  const calls: { collection: string; params: Record<string, unknown> }[] = []
  getMock.mockImplementation(
    async (p: string, params: Record<string, unknown> = {}, token?: string) => {
      if (p !== path) throw new Error(`unexpected path ${p}`)
      const collection = pick(token)
      const ids = collections[collection]
      if (!ids) throw new Error(`unknown collection ${collection}`)
      calls.push({ collection, params: { ...params } })
      onCall({ ...params })
      for (const k of Object.keys(params)) {
        if (k !== 'from' && k !== 'limit') throw new Error(`undocumented param ${k}`)
      }
      const limit = params['limit'] === undefined ? MOLLIE_DEFAULT : Number(params['limit'])
      if (!Number.isInteger(limit) || limit < 1 || limit > MOLLIE_MAX) {
        throw new Error(`422 invalid limit: ${String(params['limit'])}`)
      }
      const from = params['from'] as string | undefined
      const start = from === undefined ? 0 : ids.indexOf(from)
      if (start < 0) throw new Error(`404 unknown from ${from}`)
      const page = ids.slice(start, start + limit)
      const nextId = ids[start + limit]
      return {
        count: page.length,
        _embedded: {
          [key]: page.map((id) => ({ id, amount: { value: '1.00', currency: 'EUR' } })),
        },
        _links: {
          self: { href: `${BASE}${path}?limit=${limit}`, type: 'application/hal+json' },
          previous: null,
          next:
            nextId === undefined
              ? null
              : {
                  href: `${BASE}${path}?from=${nextId}&limit=${limit}`,
                  type: 'application/hal+json',
                },
        },
      }
    },
  )
  return calls
}

/** One collection; the returned array fills with each request's params. */
function serve(path: string, key: string, ids: string[]): Record<string, unknown>[] {
  const calls: Record<string, unknown>[] = []
  serveMany(
    path,
    key,
    { only: ids },
    () => 'only',
    (p) => calls.push(p),
  )
  return calls
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

describe.each(METHODS)('MollieAdapter.%s paging', (method, path, key, prefix) => {
  it('serves 2L+1 rows across three worker pages, each once and in order', async () => {
    const L = 10
    const all = rowIds(prefix, 2 * L + 1)
    const calls = serve(path, key, all)
    const ids: string[] = []
    const hasMore: (boolean | undefined)[] = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: L })
      const rows = await call(method, params)
      ids.push(...rows.map((r) => r.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(ids).toEqual(all)
    expect(hasMore).toEqual([true, true, false])
    expect(calls).toHaveLength(3)
    expect(calls[0]).toEqual({ limit: L })
    // `from` is inclusive: page 2 starts AT row L+1, taken from _links.next.
    expect(calls[1]).toEqual({ limit: L, from: all[L] })
    expect(calls[2]).toEqual({ limit: L, from: all[2 * L] })
  })

  it('reports the end on a full last page when _links.next is null', async () => {
    const L = 10
    serve(path, key, rowIds(prefix, 2 * L))
    const hasMore: (boolean | undefined)[] = []
    for (let page = 1; page <= 2; page++) {
      const params = withPageSink({ page, limit: L })
      await call(method, params)
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(hasMore).toEqual([true, false])
  })

  it('clamps a limit above 250 and still serves every row', async () => {
    const N = 2 * MOLLIE_MAX + 1
    const all = rowIds(prefix, N)
    const calls = serve(path, key, all)
    const ids: string[] = []
    const hasMore: (boolean | undefined)[] = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: 500 })
      const rows = await call(method, params)
      ids.push(...rows.map((r) => r.id))
      const report = readUpstreamPage(params)
      hasMore.push(report?.hasMore)
      expect(report?.pageSize).toBe(MOLLIE_MAX)
    }
    expect(ids).toEqual(all)
    expect(hasMore).toEqual([true, true, false])
    expect(calls.map((c) => c['limit'])).toEqual([MOLLIE_MAX, MOLLIE_MAX, MOLLIE_MAX])
  })

  it('API path: parseListQuery then listPage gives the right meta.hasMore', async () => {
    const L = 10
    const all = rowIds(prefix, 2 * L + 1)
    serve(path, key, all)
    const metas = []
    const ids: string[] = []
    for (let page = 1; page <= 3; page++) {
      const params = parseListQuery({ page: String(page), limit: String(L) }, routed)
      const rows = await call(method, params)
      ids.push(...rows.map((r) => r.id))
      metas.push(listPage(rows, params, 'mollie').meta)
    }
    expect(ids).toEqual(all)
    expect(metas.map((m) => m.hasMore)).toEqual([true, true, false])
  })
})

describe('MollieAdapter page size guards (direct calls, outside the router)', () => {
  it.each([
    ['a limit of 0', 0, 1],
    ['a negative limit', -5, 1],
    ['a fractional limit', 2.5, 2],
    ['a NaN limit', Number.NaN, ADAPTER_DEFAULT],
  ])('sends a valid limit for %s', async (_label, limit, sent) => {
    const calls = serve('/customers', 'customers', rowIds('cst_', 200))
    const rows = await call('listCustomers', withPageSink({ page: 1, limit }))
    expect(calls).toEqual([{ limit: sent }])
    expect(rows).toHaveLength(sent)
  })

  it('falls back to a limit of 100 when no limit is given', async () => {
    const calls = serve('/customers', 'customers', rowIds('cst_', 3))
    await call('listCustomers', {} as QueryParams)
    expect(calls).toEqual([{ limit: ADAPTER_DEFAULT }])
  })
})

describe('MollieAdapter pager keys', () => {
  it('keeps each connection on its own cursor walk', async () => {
    const L = 5
    const A: Credentials = { accessToken: 'test_conn_a' }
    const B: Credentials = { accessToken: 'test_conn_b' }
    const calls = serveMany(
      '/payments',
      'payments',
      { test_conn_a: rowIds('tr_A', 3 * L), test_conn_b: rowIds('tr_B', 3 * L) },
      (token) => token ?? '',
    )
    await adapter.listCharges(A, withPageSink({ page: 1, limit: L }))
    await adapter.listCharges(A, withPageSink({ page: 2, limit: L }))
    // Connection B's page 2 must come from B's own page 1, never A's cursor.
    const rows = await adapter.listCharges(B, withPageSink({ page: 2, limit: L }))
    expect(rows.map((r) => r.id)).toEqual(rowIds('tr_B', 3 * L).slice(L, 2 * L))
    const bCalls = calls.filter((c) => c.collection === 'test_conn_b').map((c) => c.params)
    expect(bCalls).toEqual([{ limit: L }, { limit: L, from: rowIds('tr_B', 3 * L)[L] }])
  })

  it('does not reuse a cursor minted at another limit', async () => {
    const all = rowIds('cst_', 30)
    const calls = serve('/customers', 'customers', all)
    await call('listCustomers', withPageSink({ page: 1, limit: 5 }))
    await call('listCustomers', withPageSink({ page: 2, limit: 5 }))
    // Page 2 at limit 7 starts at the 8th row, not the 6th.
    const rows = await call('listCustomers', withPageSink({ page: 2, limit: 7 }))
    expect(rows.map((r) => r.id)).toEqual(all.slice(7, 14))
    expect(calls.slice(2)).toEqual([{ limit: 7 }, { limit: 7, from: all[7] }])
  })

  it('keeps each collection on its own cursor walk', async () => {
    const L = 5
    serve('/payments', 'payments', rowIds('tr_', 3 * L))
    await call('listCharges', withPageSink({ page: 1, limit: L }))
    const refunds = rowIds('re_', 3 * L)
    const calls = serve('/refunds', 'refunds', refunds)
    const rows = await call('listRefunds', withPageSink({ page: 2, limit: L }))
    expect(rows.map((r) => r.id)).toEqual(refunds.slice(L, 2 * L))
    expect(calls).toEqual([{ limit: L }, { limit: L, from: refunds[L] }])
  })
})

describe('MollieAdapter next-link handling', () => {
  function serveWithNext(next: { href: string } | null): Record<string, unknown>[] {
    const calls: Record<string, unknown>[] = []
    getMock.mockImplementation(async (_p: string, params: Record<string, unknown> = {}) => {
      calls.push({ ...params })
      return {
        count: 1,
        _embedded: { payments: [{ id: 'tr_0001', amount: { value: '1.00', currency: 'EUR' } }] },
        _links: { self: null, previous: null, next },
      }
    })
    return calls
  }

  it('follows a relative _links.next href instead of reporting the end', async () => {
    const calls = serveWithNext({ href: '/v2/payments?from=tr_0002&limit=1' })
    const p1 = withPageSink({ page: 1, limit: 1 })
    await adapter.listCharges(CREDS, p1)
    expect(readUpstreamPage(p1)?.hasMore).toBe(true)
    await adapter.listCharges(CREDS, withPageSink({ page: 2, limit: 1 }))
    expect(calls[1]).toEqual({ limit: 1, from: 'tr_0002' })
  })

  it('fails loudly when _links.next carries no from cursor', async () => {
    serveWithNext({ href: `${BASE}/payments?limit=1` })
    await expect(adapter.listCharges(CREDS, withPageSink({ page: 1, limit: 1 }))).rejects.toThrow(
      /no 'from' cursor/,
    )
  })
})
