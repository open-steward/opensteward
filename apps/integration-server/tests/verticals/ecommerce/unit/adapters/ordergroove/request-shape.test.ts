/**
 * Ordergroove request shape: `x-api-key` header, and the production vs.
 * staging host confirmed at
 * https://developer.ordergroove.com/reference/start /
 * https://developer.ordergroove.com/reference/developer-fundamentals
 * (`https://restapi.ordergroove.com` / `https://staging.restapi.ordergroove.com`
 * — the legacy, deprecated host is `https://api.ordergroove.com`, not used
 * here).
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { OrdergrooveAdapter } from '../../../../../../src/verticals/ecommerce/adapters/ordergroove/index'

const CREDS = { accessToken: 'ogk_live_abc123' }

afterEach(() => vi.restoreAllMocks())

describe('Ordergroove request shape', () => {
  it('sends x-api-key against the production host by default', () => {
    const createSpy = vi.spyOn(axios, 'create').mockReturnValue({ get: vi.fn() } as never)
    const adapter = new OrdergrooveAdapter()
    void adapter.listProducts(CREDS, {}).catch(() => undefined)

    const config = createSpy.mock.calls[0]![0] as { baseURL: string; headers: Record<string, string> }
    expect(config.baseURL).toBe('https://restapi.ordergroove.com')
    expect(config.headers['x-api-key']).toBe('ogk_live_abc123')
  })

  it('uses the staging host when credentials.extra.sandbox is true', () => {
    const createSpy = vi.spyOn(axios, 'create').mockReturnValue({ get: vi.fn() } as never)
    const adapter = new OrdergrooveAdapter()
    void adapter.listProducts({ accessToken: 'ogk_live_abc123', extra: { sandbox: true } }, {}).catch(() => undefined)

    const config = createSpy.mock.calls[0]![0] as { baseURL: string }
    expect(config.baseURL).toBe('https://staging.restapi.ordergroove.com')
  })

  it('lists GET /products/ with page_size', async () => {
    const get = vi.fn(async (_path: string, _config: { params: Record<string, unknown> }) => ({
      data: { results: [] as unknown[] },
    }))
    vi.spyOn(axios, 'create').mockReturnValue({ get } as never)
    const adapter = new OrdergrooveAdapter()
    await adapter.listProducts(CREDS, { limit: 25 })

    const [path, config] = get.mock.calls[0]!
    expect(path).toBe('/products/')
    expect(config.params).toMatchObject({ page_size: 25 })
  })

  it('gets a product at GET /products/{external_product_id}/', async () => {
    const get = vi.fn(async (_path: string) => ({ data: { external_product_id: 'p1', name: 'Widget' } }))
    vi.spyOn(axios, 'create').mockReturnValue({ get } as never)
    const adapter = new OrdergrooveAdapter()
    await adapter.getProduct(CREDS, 'p1')
    expect(get.mock.calls[0]![0]).toBe('/products/p1/')
  })

  it('updates a product via PATCH /products/{external_product_id}/', async () => {
    const patch = vi.fn(async (_path: string, _body: unknown) => ({
      data: { external_product_id: 'p1', name: 'Widget' },
    }))
    vi.spyOn(axios, 'create').mockReturnValue({ patch, get: vi.fn() } as never)
    const adapter = new OrdergrooveAdapter()
    await adapter.updateProduct!(CREDS, 'p1', { metadata: { price: 12.5 } })
    expect(patch.mock.calls[0]![0]).toBe('/products/p1/')
    expect(patch.mock.calls[0]![1]).toEqual({ price: 12.5 })
  })

  it('cancels an order via PATCH /orders/{public_id}/cancel/', async () => {
    const patch = vi.fn(async (_path: string) => ({ data: { public_id: 'o1' } }))
    vi.spyOn(axios, 'create').mockReturnValue({ patch, get: vi.fn() } as never)
    const adapter = new OrdergrooveAdapter()
    await adapter.cancelOrder!(CREDS, 'o1')
    expect(patch.mock.calls[0]![0]).toBe('/orders/o1/cancel/')
  })

  it('creates a customer via POST /customers/create/', async () => {
    const post = vi.fn(async (_path: string, _body: unknown) => ({ data: { merchant_user_id: 'u1' } }))
    vi.spyOn(axios, 'create').mockReturnValue({ post, get: vi.fn() } as never)
    const adapter = new OrdergrooveAdapter()
    await adapter.createCustomer!(
      { accessToken: 'ogk_live_abc123', extra: { merchantId: 'merch_1' } },
      {
        id: 'u1',
        email: 'jane@acme.example',
        firstName: 'Jane',
        lastName: 'Doe',
        phone: '+15551231234',
        metadata: { session_id: 'sess-1', user_token_id: 'tok-1', phone_type: 2, locale: 'en-US' },
      },
    )
    const [path, body] = post.mock.calls[0]!
    expect(path).toBe('/customers/create/')
    expect(body).toMatchObject({ merchant: 'merch_1', merchant_user_id: 'u1', email: 'jane@acme.example' })
  })
})
