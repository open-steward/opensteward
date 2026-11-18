/**
 * FastSpring pagination tests.
 *
 * Products/orders/accounts: `page`/`limit` in, `nextPage`/`total` out
 * (https://developer.fastspring.com/reference/list-all-orders). Coupons:
 * `GET /coupons` returns every id with no page/limit/total at all
 * (https://developer.fastspring.com/reference/list-all-coupons) — the
 * adapter paginates that one client-side.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { withPageSink, readUpstreamPage } from '@opensteward/shared'
import type { QueryParams } from '@opensteward/shared'
import { FastspringAdapter } from '../../../../../../src/verticals/ecommerce/adapters/fastspring/index'

const CREDS = { accessToken: 'fs-user', extra: { apiUsername: 'fs-user', apiPassword: 'fs-pass' } }

function fakeFastSpring(handlers: Record<string, (params: Record<string, unknown>) => unknown>) {
  const calls: { path: string; params: Record<string, unknown> }[] = []
  const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
    const params = cfg?.params ?? {}
    calls.push({ path, params })
    if (handlers[path]) return { data: handlers[path]!(params) }
    // Fall back to the longest registered prefix this path nests under, so
    // an exact `/products/a` handler wins over the `/products` list handler.
    const prefixMatches = Object.keys(handlers)
      .filter((k) => path.startsWith(`${k}/`))
      .sort((a, b) => b.length - a.length)
    if (prefixMatches[0]) return { data: handlers[prefixMatches[0]]!(params) }
    throw new Error(`unexpected path in test: ${path}`)
  })
  vi.spyOn(axios, 'create').mockReturnValue({ get, defaults: {} } as never)
  return calls
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('FastSpring pagination — server-paginated (products)', () => {
  it('reports hasMore/totalCount/currentPage from the documented envelope', async () => {
    fakeFastSpring({
      '/products': () => ({ page: 1, limit: 2, nextPage: 2, total: 3, products: ['a', 'b'] }),
      '/products/a': () => ({ products: [{ product: 'a', display: { en: 'A' } }] }),
      '/products/b': () => ({ products: [{ product: 'b', display: { en: 'B' } }] }),
    })
    const adapter = new FastspringAdapter()
    const params = withPageSink({ page: 1, limit: 2 } as QueryParams)
    const products = await adapter.listProducts!(CREDS, params)
    expect(products.map((p) => p.id)).toEqual(['a', 'b'])
    expect(readUpstreamPage(params)).toEqual({ hasMore: true, totalCount: 3, currentPage: 1 })
  })

  it('reports hasMore: false on the last page (nextPage absent)', async () => {
    fakeFastSpring({
      '/products': () => ({ page: 2, limit: 2, nextPage: null, total: 3, products: ['c'] }),
      '/products/c': () => ({ products: [{ product: 'c', display: { en: 'C' } }] }),
    })
    const adapter = new FastspringAdapter()
    const params = withPageSink({ page: 2, limit: 2 } as QueryParams)
    await adapter.listProducts!(CREDS, params)
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('clamps the requested limit to MAX_PAGE_SIZE', async () => {
    const calls = fakeFastSpring({ '/products': () => ({ products: [] }) })
    const adapter = new FastspringAdapter()
    await adapter.listProducts!(CREDS, { page: 1, limit: 9_999 } as QueryParams)
    expect(calls[0]!.params['limit']).toBe(adapter.capabilities!.maxPageSize)
  })
})

describe('FastSpring pagination — client-paginated (coupons/discounts)', () => {
  it('paginates the full id list locally and reports hasMore honestly', async () => {
    fakeFastSpring({
      '/coupons': () => ({ coupons: ['a', 'b', 'c'] }),
      '/coupons/a': () => ({ coupon: 'a', discount: { type: 'percent', percent: 10 } }),
      '/coupons/b': () => ({ coupon: 'b', discount: { type: 'percent', percent: 20 } }),
    })
    const adapter = new FastspringAdapter()
    const params = withPageSink({ page: 1, limit: 2 } as QueryParams)
    const discounts = await adapter.listDiscounts!(CREDS, params)
    expect(discounts.map((d) => d.id)).toEqual(['a', 'b'])
    expect(readUpstreamPage(params)).toEqual({ hasMore: true, totalCount: 3, pagedLocally: true })
  })

  it('reports hasMore: false once the last coupon id has been served', async () => {
    fakeFastSpring({
      '/coupons': () => ({ coupons: ['a', 'b', 'c'] }),
      '/coupons/c': () => ({ coupon: 'c', discount: { type: 'percent', percent: 5 } }),
    })
    const adapter = new FastspringAdapter()
    const params = withPageSink({ page: 2, limit: 2 } as QueryParams)
    const discounts = await adapter.listDiscounts!(CREDS, params)
    expect(discounts.map((d) => d.id)).toEqual(['c'])
    expect(readUpstreamPage(params)).toEqual({ hasMore: false, totalCount: 3, pagedLocally: true })
  })
})
