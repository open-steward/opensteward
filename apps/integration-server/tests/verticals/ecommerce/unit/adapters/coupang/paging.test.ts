/**
 * Coupang lists seller products (`GET /v2/providers/seller_api/apis/api/v1/
 * marketplace/seller-products`) with an opaque `nextToken` cursor. `nextToken`
 * is the "Key value to call the next page. Not needed, or enter 1, to call the
 * 1st page"; `maxPerPage` is "Default: 10, Max.:100"; and the response's
 * top-level `nextToken` is a "Null string if the next page is unavailable"
 * (https://developers.coupang.com/en/api/products/product-list-paging-query).
 *
 * The documented response is `{ code, message, nextToken, data: [...] }`: `data`
 * IS the product array. listProducts used to always send `nextToken=1`, so
 * page 2 repeated page 1, and read `data.sellerProducts`, so it found no rows.
 *
 * The fake below honours ONLY the documented parameters, `maxPerPage` and
 * `nextToken`, and caps a page at the documented maximum of 100.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import {
  _resetCursorPager,
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
} from '@opensteward/shared'
import type { QueryParams } from '@opensteward/shared'
import { CoupangAdapter } from '../../../../../../src/verticals/ecommerce/adapters/coupang/index'

const PATH = '/v2/providers/seller_api/apis/api/v1/marketplace/seller-products'

const CREDS = {
  accessToken: 'access-key',
  extra: { secretKey: 'secret', vendorId: 'A00012345' },
}

interface Call {
  path: string
  params: Record<string, unknown>
}

const tokenFor = (i: number): string => `tok-${i + 1000}`
const offsetOf = (t: string): number => Number(t.slice(4)) - 1000

function fakeCoupang(products: number): Call[] {
  const calls: Call[] = []
  const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
    const params = { ...(cfg?.params ?? {}) }
    calls.push({ path, params })
    if (path !== PATH) throw new Error(`unexpected GET ${path}`)
    const asked = params['maxPerPage'] === undefined ? 10 : Number(params['maxPerPage'])
    if (asked > 100) throw new Error(`maxPerPage ${asked} exceeds the documented max of 100`)
    const raw = params['nextToken']
    const start = raw === undefined || String(raw) === '1' ? 0 : offsetOf(String(raw))
    const end = Math.min(start + asked, products)
    const data = []
    for (let i = start; i < end; i++)
      data.push({ sellerProductId: i + 1, sellerProductName: `P${i + 1}`, statusName: 'APPROVED' })
    return {
      data: {
        code: 'SUCCESS',
        message: '',
        nextToken: end < products ? tokenFor(end) : '',
        data,
      },
    }
  })
  vi.spyOn(axios, 'create').mockReturnValue({
    get,
    interceptors: { request: { use: vi.fn() } },
  } as never)
  return calls
}

afterEach(() => {
  vi.restoreAllMocks()
  _resetCursorPager()
})

async function walk(
  limit: number,
  pages: number,
): Promise<{ ids: string[]; hasMore: (boolean | undefined)[]; sizes: number[] }> {
  const adapter = new CoupangAdapter()
  const ids: string[] = []
  const hasMore: (boolean | undefined)[] = []
  const sizes: number[] = []
  for (let k = 1; k <= pages; k++) {
    const params = withPageSink({ page: k, limit })
    const rows = await adapter.listProducts(CREDS, params)
    ids.push(...rows.map((r) => r.id))
    sizes.push(rows.length)
    hasMore.push(readUpstreamPage(params)?.hasMore)
  }
  return { ids, hasMore, sizes }
}

const ids = (n: number): string[] => Array.from({ length: n }, (_, i) => String(i + 1))

describe('Coupang listProducts pages by the nextToken cursor', () => {
  it('serves 2L+1 rows over three pages, each once, in order, hasMore exact', async () => {
    const calls = fakeCoupang(7)
    const r = await walk(3, 3)
    expect(r.ids).toEqual(ids(7))
    expect(r.sizes).toEqual([3, 3, 1])
    expect(r.hasMore).toEqual([true, true, false])
    expect(calls.map((c) => c.params['maxPerPage'])).toEqual([3, 3, 3])
    expect(calls).toHaveLength(3)
  })

  it('ends exactly on a full last page: 2L rows read hasMore [true, false]', async () => {
    fakeCoupang(6)
    const r = await walk(3, 2)
    expect(r.ids).toEqual(ids(6))
    expect(r.hasMore).toEqual([true, false])
  })

  it('the page-2 request carries the nextToken from page 1', async () => {
    const calls = fakeCoupang(7)
    await walk(3, 2)
    expect(calls[0]!.params).toMatchObject({ vendorId: 'A00012345', maxPerPage: 3, nextToken: '1' })
    expect(calls[1]!.params).toMatchObject({ maxPerPage: 3, nextToken: tokenFor(3) })
  })

  it('a cold page 2 walks the cursor chain rather than repeating page 1', async () => {
    fakeCoupang(7)
    const params = withPageSink({ page: 2, limit: 3 })
    const rows = await new CoupangAdapter().listProducts(CREDS, params)
    expect(rows.map((r) => r.id)).toEqual(['4', '5', '6'])
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })

  it('clamps a limit above 100 to maxPerPage=100 and still serves every row', async () => {
    const calls = fakeCoupang(150)
    const r = await walk(250, 3)
    expect(r.ids).toEqual(ids(150))
    expect(r.sizes).toEqual([100, 50, 0])
    expect(r.hasMore).toEqual([true, false, false])
    expect(calls.map((c) => c.params['maxPerPage'])).toEqual([100, 100])
  })

  it('reports the clamped size it sent, so a 100-row page is not read as the end', async () => {
    fakeCoupang(150)
    const params = withPageSink({ page: 1, limit: 500 })
    const rows = await new CoupangAdapter().listProducts(CREDS, params)
    expect(rows).toHaveLength(100)
    expect(readUpstreamPage(params)).toMatchObject({ hasMore: true, pageSize: 100 })
  })

  it('reports meta.hasMore through parseListQuery and listPage', async () => {
    fakeCoupang(7)
    const adapter = new CoupangAdapter()
    const p2 = parseListQuery({ limit: '3', page: '2' })
    const env2 = listPage(await adapter.listProducts(CREDS, p2), p2, 'coupang')
    expect(env2.data.map((r) => r.id)).toEqual(['4', '5', '6'])
    expect(env2.meta.hasMore).toBe(true)
    const p3 = parseListQuery({ limit: '3', page: '3' })
    const env3 = listPage(await adapter.listProducts(CREDS, p3), p3, 'coupang')
    expect(env3.data.map((r) => r.id)).toEqual(['7'])
    expect(env3.meta.hasMore).toBe(false)
  })

  it('two connections to the same vendor keep separate cursor walks', async () => {
    const calls = fakeCoupang(7)
    const adapter = new CoupangAdapter()
    await adapter.listProducts(CREDS, withPageSink({ page: 1, limit: 3 }))
    calls.length = 0
    const credsB = { ...CREDS, accessToken: 'access-key-b' }
    const rows = await adapter.listProducts(credsB, withPageSink({ page: 2, limit: 3 }))
    expect(rows.map((r) => r.id)).toEqual(['4', '5', '6'])
    expect(calls).toHaveLength(2)
    expect(calls[0]!.params['nextToken']).toBe('1')
  })

  it('a changed limit starts a fresh walk instead of reusing a cursor minted at another size', async () => {
    const calls = fakeCoupang(12)
    const adapter = new CoupangAdapter()
    await adapter.listProducts(CREDS, withPageSink({ page: 1, limit: 3 }))
    calls.length = 0
    const rows = await adapter.listProducts(CREDS, withPageSink({ page: 2, limit: 5 }))
    expect(rows.map((r) => r.id)).toEqual(['6', '7', '8', '9', '10'])
    expect(calls).toHaveLength(2)
    expect(calls[0]!.params).toMatchObject({ maxPerPage: 5, nextToken: '1' })
    expect(calls[1]!.params).toMatchObject({ maxPerPage: 5, nextToken: tokenFor(5) })
  })

  it('an explicit nextToken fetches that one page and reports hasMore', async () => {
    const calls = fakeCoupang(7)
    const params = withPageSink({ page: 1, limit: 3, nextToken: tokenFor(6) } as QueryParams)
    const rows = await new CoupangAdapter().listProducts(CREDS, params)
    expect(rows.map((r) => r.id)).toEqual(['7'])
    expect(calls).toHaveLength(1)
    expect(calls[0]!.params['nextToken']).toBe(tokenFor(6))
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })
})
