/**
 * Request shape + pagination, mocked at the axios instance `FyndClient`
 * creates. Paths/params verified against `gofynd/fdk-client-javascript` @
 * commit `7598488bf04e7a75bc44088441745538d524abec`:
 *  - Catalog: `sdk/platform/Catalog/CatalogPlatformClient.js#getProducts`
 *  - Cart/Coupon: `sdk/platform/Cart/CartPlatformApplicationClient.js#createCoupon`
 *  - Page shape: `CatalogPlatformModel.Page()` (`item_total`, `has_next`, `current`)
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { withPageSink, readUpstreamPage } from '@opensteward/shared'
import { FyndAdapter } from '../../../../../../src/verticals/ecommerce/adapters/fynd/index'

const CFG = {
  clientId: 'cid',
  clientSecret: 'sec',
  redirectUri: 'https://app.example.com/auth/ecommerce/fynd/callback',
}

const CREDENTIALS = {
  accessToken: 'tok',
  extra: { companyId: '10000123', applicationId: 'app1' },
}

afterEach(() => {
  vi.restoreAllMocks()
})

function mockAxios(response: unknown) {
  const get = vi.fn().mockResolvedValue({ data: response })
  const post = vi.fn().mockResolvedValue({ data: response })
  vi.spyOn(axios, 'create').mockReturnValue({ get, post, patch: vi.fn(), put: vi.fn(), delete: vi.fn() } as never)
  return { get, post }
}

describe('listProducts request shape', () => {
  it('GETs the company-scoped v2.0 products path with a Bearer token and page_no/page_size', async () => {
    const { get } = mockAxios({ items: [], page: {} })
    const adapter = new FyndAdapter(CFG)
    await adapter.listProducts(CREDENTIALS, { page: 2, limit: 25 })
    expect(get).toHaveBeenCalledTimes(1)
    const [path, config] = get.mock.calls[0] as [string, { params: unknown; headers: Record<string, string> }]
    expect(path).toBe('/service/platform/catalog/v2.0/company/10000123/products/')
    expect(config.params).toEqual({ page_no: 2, page_size: 25 })
    expect(config.headers.Authorization).toBe('Bearer tok')
  })

  it('works with only { page, limit } — no other params required', async () => {
    const { get } = mockAxios({ items: [], page: {} })
    const adapter = new FyndAdapter(CFG)
    await expect(adapter.listProducts(CREDENTIALS, {})).resolves.toEqual([])
    const config = get.mock.calls[0][1] as { params: unknown }
    expect(config.params).toEqual({ page_no: 1, page_size: 10 })
  })

  it('reports the upstream page metadata for the sync worker', async () => {
    mockAxios({ items: [], page: { item_total: 120, current: 2, has_next: true } })
    const adapter = new FyndAdapter(CFG)
    const params = withPageSink({ page: 2, limit: 10 })
    await adapter.listProducts(CREDENTIALS, params)
    expect(readUpstreamPage(params)).toEqual({ totalCount: 120, currentPage: 2, hasMore: true })
  })
})

describe('createDiscount request shape', () => {
  it('POSTs the application-scoped coupon path, then re-fetches to return the full object', async () => {
    const get = vi.fn().mockResolvedValue({
      data: { _id: 'cpn_1', code: 'ACME10', type_slug: 'percentage', rule: [{ value: 10 }] },
    })
    const post = vi.fn().mockResolvedValue({ data: { success: true, _id: 'cpn_1' } })
    vi.spyOn(axios, 'create').mockReturnValue({ get, post, patch: vi.fn(), put: vi.fn(), delete: vi.fn() } as never)
    const adapter = new FyndAdapter(CFG)
    const result = await adapter.createDiscount(CREDENTIALS, { code: 'ACME10', type: 'PERCENTAGE', value: 10 })
    expect(post).toHaveBeenCalledWith(
      '/service/platform/cart/v1.0/company/10000123/application/app1/coupon',
      expect.objectContaining({ code: 'ACME10', type_slug: 'percentage' }),
      expect.objectContaining({ headers: { Authorization: 'Bearer tok' } }),
    )
    expect(get).toHaveBeenCalledWith(
      '/service/platform/cart/v1.0/company/10000123/application/app1/coupon/cpn_1',
      expect.objectContaining({ headers: { Authorization: 'Bearer tok' } }),
    )
    expect(result.id).toBe('cpn_1')
  })
})
