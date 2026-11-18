/**
 * Shift4Shop refunds are RMAs.
 *
 * The REST reference documents no `Returns` resource. Returns are RMAs
 * (https://apirest.3dcart.com/v1/rma/index.html):
 *   "GET https://apirest.3dcart.com/3dCartWebAPI/v1/RMA"
 *     URL parameters: rmastatusid, rmareasonid, rmamethodid, catalogid, sku,
 *     datestart, dateend, limit ("Maximum number of items that can be
 *     returned"), offset ("Starting point for the return data"), countonly;
 *     404 "No RMAs found."
 *   "GET https://apirest.3dcart.com/3dCartWebAPI/v1/RMA/{rmaid}"
 * Batch size (https://apirest.3dcart.com/v1/getting-started/index.html):
 * "All Others: 500".
 *
 * Before the rebuild the adapter called GET Returns, GET Orders/{id}/Returns
 * and GET Returns/{id}, none of which is documented.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import axios from 'axios'
import {
  _resetRowPager,
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type QueryParams,
} from '@opensteward/shared'
import { Shift4ShopAdapter } from '../../../../../../src/verticals/ecommerce/adapters/shift4shop/index'
import type { EcommerceAdapter } from '../../../../../../src/verticals/ecommerce/adapter/interface'
import { RefundSchema } from '../../../../../../src/verticals/ecommerce/schema/refund'

const CREDS = { accessToken: 'pk_test', extra: { token: 'tok_test' } }
const BATCH = 500

type Row = Record<string, unknown>

interface Call {
  path: string
  params: Record<string, unknown>
  privateKey: string
}

function httpError(status: number): Error {
  return Object.assign(new Error(`Request failed with status code ${status}`), {
    isAxiosError: true,
    response: { status, data: [] },
  })
}

/**
 * A fake serving GET RMA by `limit` and `offset` only (any other parameter is
 * refused, as is a limit above the batch size) and GET RMA/{rmaid}. An empty
 * result is the documented 404. Stores are told apart by the PrivateKey header.
 */
function fakeRma(byPrivateKey: Record<string, Row[]>, opts: { status?: number } = {}) {
  const calls: Call[] = []
  vi.spyOn(axios, 'create').mockImplementation(((cfg?: { headers?: Record<string, unknown> }) => {
    const privateKey = String(cfg?.headers?.['PrivateKey'] ?? '')
    const get = vi.fn(async (path: string, reqCfg?: { params?: Record<string, unknown> }) => {
      const params = { ...(reqCfg?.params ?? {}) }
      calls.push({ path, params, privateKey })
      if (opts.status != null) throw httpError(opts.status)
      const rows = byPrivateKey[privateKey] ?? byPrivateKey['*']
      if (!rows) throw new Error(`no store for ${privateKey}`)
      const one = /^RMA\/(\d+)$/.exec(path)
      if (one) {
        if (Object.keys(params).length > 0) throw new Error('RMA/{rmaid} takes no query')
        const hit = rows.filter((r) => String(r['RMAID']) === one[1])
        if (hit.length === 0) throw httpError(404)
        return { data: hit }
      }
      if (path !== 'RMA') throw new Error(`undocumented path ${path}`)
      const extra = Object.keys(params).filter((k) => !['limit', 'offset'].includes(k))
      if (extra.length > 0) throw new Error(`undocumented query parameter(s): ${extra.join(', ')}`)
      const limit = Number(params['limit'])
      const offset = Number(params['offset'])
      if (!Number.isInteger(limit) || limit < 1 || limit > BATCH)
        throw new Error(`bad limit ${limit}`)
      if (!Number.isInteger(offset) || offset < 0) throw new Error(`bad offset ${offset}`)
      const page = rows.slice(offset, offset + limit)
      if (page.length === 0) throw httpError(404)
      return { data: page }
    })
    return { get, post: vi.fn(), put: vi.fn(), delete: vi.fn() }
  }) as never)
  return { calls }
}

const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1)

function rma(i: number, orderId = i): Row {
  return {
    RMAID: i,
    RmaDate: '03/28/2019 17:28',
    OrderID: orderId,
    RMAReasonID: 1,
    RMAMethodID: 1,
    RMAStatusID: 1,
    Comments: `rma ${i}`,
    RMAItemList: [
      { CatalogID: 100 + i, ReturnQuantity: 1, ReceivedQuantity: 0, RestockQuantity: 0 },
    ],
  }
}

const adapter = () => new Shift4ShopAdapter()
/** The adapter as the router holds it, and hands to parseListQuery. */
const router = (): EcommerceAdapter => new Shift4ShopAdapter()
const listRefunds = (params: QueryParams, creds = CREDS) => adapter().listRefunds(creds, params)

beforeEach(() => _resetRowPager())
afterEach(() => vi.restoreAllMocks())

describe('shift4shop listRefunds (GET RMA)', () => {
  it.each([2, 5])(
    'N = 2L+1 at limit %i: pages 1..3 serve every RMA once, hasMore exact',
    async (L) => {
      const n = 2 * L + 1
      fakeRma({ '*': range(n).map((i) => rma(i)) })
      const seen: string[] = []
      const hasMore: Array<boolean | undefined> = []
      for (let k = 1; k <= 3; k++) {
        const params = withPageSink({ page: k, limit: L })
        const rows = await listRefunds(params)
        for (const r of rows) RefundSchema.parse(r)
        seen.push(...rows.map((r) => r.id))
        hasMore.push(readUpstreamPage(params)?.hasMore)
      }
      expect(seen).toEqual(range(n).map(String))
      expect(hasMore).toEqual([true, true, false])
    },
  )

  it('sends only the documented limit and offset to GET RMA', async () => {
    const { calls } = fakeRma({ '*': range(11).map((i) => rma(i)) })
    await listRefunds(withPageSink({ page: 2, limit: 5 }))
    expect(calls.map(({ path, params }) => ({ path, params }))).toEqual([
      { path: 'RMA', params: { limit: 5, offset: 5 } },
    ])
  })

  it('a page past the end (the documented 404 "No RMAs found.") is empty and final', async () => {
    fakeRma({ '*': range(4).map((i) => rma(i)) })
    const params = withPageSink({ page: 3, limit: 2 })
    expect(await listRefunds(params)).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('a limit above the batch size of 500 is clamped and reported', async () => {
    const { calls } = fakeRma({ '*': range(BATCH + 1).map((i) => rma(i)) })
    const params = withPageSink({ page: 1, limit: 600 })
    expect(await listRefunds(params)).toHaveLength(BATCH)
    expect(calls.map((c) => c.params)).toEqual([{ limit: BATCH, offset: 0 }])
    expect(readUpstreamPage(params)).toMatchObject({ hasMore: true, pageSize: BATCH })
  })

  it('through the API path, page 1 of 7 at limit 3 says hasMore true and page 3 false', async () => {
    fakeRma({ '*': range(7).map((i) => rma(i)) })
    const p1 = parseListQuery({ page: '1', limit: '3' }, router())
    const env1 = listPage(await listRefunds(p1), p1, 'shift4shop')
    expect(env1.data.map((r) => r.id)).toEqual(['1', '2', '3'])
    expect(env1.meta.hasMore).toBe(true)
    const p3 = parseListQuery({ page: '3', limit: '3' }, router())
    const env3 = listPage(await listRefunds(p3), p3, 'shift4shop')
    expect(env3.data.map((r) => r.id)).toEqual(['7'])
    expect(env3.meta.hasMore).toBe(false)
  })

  it.each([401, 403])('a %i is an error, not an empty page', async (status) => {
    fakeRma({ '*': range(3).map((i) => rma(i)) }, { status })
    await expect(listRefunds(withPageSink({ page: 1, limit: 5 }))).rejects.toThrow(String(status))
  })

  it('an empty orderId is no filter: the caller page goes straight to GET RMA', async () => {
    const { calls } = fakeRma({ '*': range(7).map((i) => rma(i)) })
    const rows = await listRefunds(withPageSink({ page: 2, limit: 3, orderId: '' } as QueryParams))
    expect(rows.map((r) => r.id)).toEqual(['4', '5', '6'])
    expect(calls.map((c) => c.params)).toEqual([{ limit: 3, offset: 3 }])
  })

  // GET RMA documents no search parameter, so a search is refused, not dropped.
  it('refuses a search with 501 NOT_SUPPORTED and sends no request', async () => {
    const { calls } = fakeRma({ '*': range(3).map((i) => rma(i)) })
    await expect(
      listRefunds(withPageSink({ page: 1, limit: 5, search: 'blue' })),
    ).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(calls).toEqual([])
  })
})

// GET RMA documents no order filter, so one order's RMAs are cut out of the
// whole RMA walk by OrderID, a batch of 500 at a time.
describe('shift4shop listRefunds for one order', () => {
  // 11 = 2·5 + 1 RMAs for order 42, spread unevenly over 1,100 RMAs (three upstream pages).
  const MINE = [3, 4, 499, 500, 501, 502, 750, 999, 1000, 1001, 1100]
  const store = () => range(1100).map((i) => rma(i, MINE.includes(i) ? 42 : 7))

  it('N = 2L+1 at limit 5: pages 1..3 serve every RMA of the order once, hasMore exact', async () => {
    const { calls } = fakeRma({ '*': store() })
    const seen: string[] = []
    const hasMore: Array<boolean | undefined> = []
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink({ page: k, limit: 5, orderId: '42' } as QueryParams)
      const rows = await listRefunds(params)
      for (const r of rows) expect(r.orderId).toBe('42')
      seen.push(...rows.map((r) => r.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(MINE.map(String))
    expect(hasMore).toEqual([true, true, false])
    expect(calls.map((c) => c.params)).toEqual([
      { limit: BATCH, offset: 0 },
      { limit: BATCH, offset: 500 },
      { limit: BATCH, offset: 1000 },
    ])
  })

  it('page 2 alone reaches past the first batch of RMAs', async () => {
    fakeRma({ '*': store() })
    const rows = await listRefunds(
      withPageSink({ page: 2, limit: 5, orderId: '42' } as QueryParams),
    )
    expect(rows.map((r) => r.id)).toEqual(MINE.slice(5, 10).map(String))
  })

  it('an order with no RMAs is an empty, final page', async () => {
    fakeRma({ '*': range(20).map((i) => rma(i, 7)) })
    const params = withPageSink({ page: 1, limit: 5, orderId: '42' } as QueryParams)
    expect(await listRefunds(params)).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('page 2 of one order never continues the walk of another order or connection', async () => {
    const a = range(10).map((i) => rma(i, i <= 5 ? 1 : 2))
    const b = range(10).map((i) => rma(100 + i, 1))
    fakeRma({ pk_a: a, pk_b: b })
    const credsA = { accessToken: 'pk_a', extra: { token: 't' } }
    const credsB = { accessToken: 'pk_b', extra: { token: 't' } }
    const p1 = await listRefunds(
      withPageSink({ page: 1, limit: 2, orderId: '1' } as QueryParams),
      credsA,
    )
    expect(p1.map((r) => r.id)).toEqual(['1', '2'])
    const other = await listRefunds(
      withPageSink({ page: 2, limit: 2, orderId: '2' } as QueryParams),
      credsA,
    )
    expect(other.map((r) => r.id)).toEqual(['8', '9'])
    const p2b = await listRefunds(
      withPageSink({ page: 2, limit: 2, orderId: '1' } as QueryParams),
      credsB,
    )
    expect(p2b.map((r) => r.id)).toEqual(['103', '104'])
  })
})

describe('shift4shop getRefund (GET RMA/{rmaid})', () => {
  it('reads one RMA by its documented path', async () => {
    const { calls } = fakeRma({ '*': range(3).map((i) => rma(i)) })
    const out = RefundSchema.parse(await adapter().getRefund(CREDS, '2'))
    expect(out.id).toBe('2')
    expect(calls.map((c) => c.path)).toEqual(['RMA/2'])
  })

  it('a non-array body (the docs show an array) is an error, not a record', async () => {
    vi.spyOn(axios, 'create').mockImplementation((() => ({
      get: vi.fn(async () => ({ data: rma(2) })),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    })) as never)
    await expect(adapter().getRefund(CREDS, '2')).rejects.toThrow('non-array')
  })

  it('an unknown id (404 "No RMAs found.") is an error', async () => {
    fakeRma({ '*': range(3).map((i) => rma(i)) })
    await expect(adapter().getRefund(CREDS, '9')).rejects.toThrow('404')
  })
})
