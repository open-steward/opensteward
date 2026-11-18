/**
 * ColorMe Shop adapter — request shape, pagination (page/limit → limit/offset),
 * and refreshCredentials no-op, with HTTP mocked.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { ColormeShopAdapter } from '../../../../../../src/verticals/ecommerce/adapters/colorme-shop/index'
import { ColormeShopClient } from '../../../../../../src/verticals/ecommerce/adapters/colorme-shop/client'
import { withPageSink, readUpstreamPage } from '@opensteward/shared'

const CFG = { clientId: 'cid', clientSecret: 'sec', redirectUri: 'https://app.example.com/callback' }
const CREDS = { accessToken: 'tok-abc' }

afterEach(() => vi.restoreAllMocks())

function fakeColorme(handlers: { get?: (path: string, params?: Record<string, unknown>) => unknown }) {
  const getCalls: Array<{ path: string; params?: Record<string, unknown> }> = []
  const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
    getCalls.push({ path, params: cfg?.params })
    return { data: handlers.get?.(path, cfg?.params) ?? {} }
  })
  vi.spyOn(axios, 'create').mockReturnValue({ get } as never)
  return { getCalls }
}

describe('ColormeShopAdapter', () => {
  it('getAuthUrl builds the api.shop-pro.jp authorize URL', () => {
    const adapter = new ColormeShopAdapter(CFG)
    const url = new URL(adapter.getAuthUrl('state1'))
    expect(url.hostname).toBe('api.shop-pro.jp')
    expect(url.pathname).toBe('/oauth/authorize')
  })

  it('refreshCredentials is a true no-op — the platform issues no refresh token', async () => {
    const adapter = new ColormeShopAdapter(CFG)
    await expect(adapter.refreshCredentials(CREDS)).resolves.toBe(CREDS)
  })

  it('converts page/limit into limit/offset and clamps limit to 50', async () => {
    const { getCalls } = fakeColorme({ get: () => ({ products: [] }) })
    const adapter = new ColormeShopAdapter(CFG)
    await adapter.listProducts(CREDS, { page: 3, limit: 500 })
    const call = getCalls.find((c) => c.path === 'products')!
    expect(call.params).toEqual({ limit: 50, offset: 100 })
  })

  it('hits api.shop-pro.jp/v1 with Authorization: Bearer <token>', () => {
    const create = vi.spyOn(axios, 'create')
    new ColormeShopClient(CREDS)
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: 'https://api.shop-pro.jp/v1',
        headers: expect.objectContaining({ Authorization: 'Bearer tok-abc' }),
      }),
    )
  })
})

describe('ColormeShopAdapter.listVariants (store-wide) reports where the products page ends', () => {
  // Store-wide variants are flattened from a page of products, and a product
  // without options has no variants. With `maxPageSize: 50` declared, a page
  // of 50 such products would otherwise read as a short page — the proven end
  // — so a sync would stop there, vouch for it, and remove every cached
  // variant of the products it never asked for.
  const products = (n: number) => Array.from({ length: n }, (_, i) => ({ id: i + 1, variants: [] }))

  it('a full page of products with no variants is not the end', async () => {
    fakeColorme({ get: () => ({ products: products(50) }) })
    const params = withPageSink({ page: 1, limit: 50 })
    expect(await new ColormeShopAdapter(CFG).listVariants(CREDS, params)).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })

  it('a short page of products is the end', async () => {
    fakeColorme({ get: () => ({ products: products(3) }) })
    const params = withPageSink({ page: 2, limit: 50 })
    await new ColormeShopAdapter(CFG).listVariants(CREDS, params)
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })
})
