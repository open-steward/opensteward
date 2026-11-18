/**
 * Pepperi request shape: HTTP Basic auth (TokenAuth:<APIToken>) plus the
 * X-Pepperi-ConsumerKey header on every call — confirmed at
 * https://developer.pepperi.com/introduction/: "Start making API requests
 * using user name 'TokenAuth' and your API Token as password + Your App
 * Consumer Key as the X-Pepperi-ConsumerKey header value."
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { PepperiAdapter } from '../../../../../../src/verticals/ecommerce/adapters/pepperi/index'

const CREDS = { accessToken: 'tok_abc123', extra: { consumerKey: 'ck_xyz' } }

afterEach(() => vi.restoreAllMocks())

describe('Pepperi request shape', () => {
  it('sends Basic auth (TokenAuth:<token>) and X-Pepperi-ConsumerKey on the underlying axios instance', () => {
    const createSpy = vi.spyOn(axios, 'create').mockReturnValue({ get: vi.fn() } as never)
    const adapter = new PepperiAdapter()
    // Trigger client construction indirectly via a private method is not
    // possible from outside — go through a public list call instead.
    void adapter.listProducts(CREDS, {}).catch(() => undefined)

    expect(createSpy).toHaveBeenCalledTimes(1)
    const config = createSpy.mock.calls[0]![0] as {
      baseURL: string
      headers: Record<string, string>
    }
    expect(config.baseURL).toBe('https://api.pepperi.com/v1.0')
    expect(config.headers['Authorization']).toBe(
      `Basic ${Buffer.from('TokenAuth:tok_abc123').toString('base64')}`,
    )
    expect(config.headers['X-Pepperi-ConsumerKey']).toBe('ck_xyz')
  })

  it('honours a per-account BaseURI from credentials.extra instead of the default host', () => {
    const createSpy = vi.spyOn(axios, 'create').mockReturnValue({ get: vi.fn() } as never)
    const adapter = new PepperiAdapter()
    void adapter
      .listProducts(
        { accessToken: 'tok_abc123', extra: { consumerKey: 'ck_xyz', baseUri: 'https://eu.pepperi.com/v1.0' } },
        {},
      )
      .catch(() => undefined)

    const config = createSpy.mock.calls[0]![0] as { baseURL: string }
    expect(config.baseURL).toBe('https://eu.pepperi.com/v1.0')
  })

  it('lists /items with page/page_size/include_count query params', async () => {
    const get = vi.fn(async (_path: string, _config: { params: Record<string, unknown> }) => ({
      data: [] as unknown[],
      headers: {} as Record<string, string>,
    }))
    vi.spyOn(axios, 'create').mockReturnValue({ get } as never)
    const adapter = new PepperiAdapter()
    await adapter.listProducts(CREDS, { page: 2, limit: 50 })

    expect(get).toHaveBeenCalledTimes(1)
    const [path, config] = get.mock.calls[0]!
    expect(path).toBe('/items')
    expect(config.params).toMatchObject({ page: 2, page_size: 50, include_count: true })
  })

  it('leaves a record out of the page instead of failing the whole list when ExternalID/Name is missing', async () => {
    const get = vi.fn(async () => ({
      data: [
        { InternalID: 1, ExternalID: 'good-1', Name: 'Good Item' },
        { InternalID: 2, ExternalID: null, Name: 'No External Id' },
        { InternalID: 3, ExternalID: 'good-3', Name: null },
      ],
      headers: {},
    }))
    vi.spyOn(axios, 'create').mockReturnValue({ get } as never)
    const adapter = new PepperiAdapter()
    const products = await adapter.listProducts(CREDS, {})
    expect(products.map((p) => p.id)).toEqual(['good-1'])
  })

  it('gets/updates/deletes a product by ExternalID via /items/externalid/{id}', async () => {
    const get = vi.fn(async (_path: string) => ({ data: { InternalID: 1, ExternalID: 'p1', Name: 'Widget' } }))
    const post = vi.fn(async (_path: string, _body: unknown) => ({
      data: { InternalID: 1, ExternalID: 'p1', Name: 'Widget v2' },
    }))
    const del = vi.fn(async (_path: string) => undefined)
    vi.spyOn(axios, 'create').mockReturnValue({ get, post, delete: del } as never)
    const adapter = new PepperiAdapter()

    await adapter.getProduct(CREDS, 'p1')
    expect(get.mock.calls[0]![0]).toBe('/items/externalid/p1')

    await adapter.updateProduct!(CREDS, 'p1', { title: 'Widget v2' })
    expect(post.mock.calls[0]![0]).toBe('/items')
    expect(post.mock.calls[0]![1]).toEqual({ Name: 'Widget v2', ExternalID: 'p1' })

    await adapter.deleteProduct!(CREDS, 'p1')
    expect(del.mock.calls[0]![0]).toBe('/items/externalid/p1')
  })

  it('gets/updates/deletes a customer by ExternalID via /accounts/externalid/{id}', async () => {
    const get = vi.fn(async (_path: string) => ({ data: { InternalID: 1, ExternalID: 'c1', Name: 'Acme' } }))
    const post = vi.fn(async (_path: string, _body: unknown) => ({
      data: { InternalID: 1, ExternalID: 'c1', Name: 'Acme Inc' },
    }))
    const del = vi.fn(async (_path: string) => undefined)
    vi.spyOn(axios, 'create').mockReturnValue({ get, post, delete: del } as never)
    const adapter = new PepperiAdapter()

    await adapter.getCustomer(CREDS, 'c1')
    expect(get.mock.calls[0]![0]).toBe('/accounts/externalid/c1')

    await adapter.updateCustomer!(CREDS, 'c1', { lastName: 'Acme Inc' })
    expect(post.mock.calls[0]![0]).toBe('/accounts')
    expect(post.mock.calls[0]![1]).toEqual({ Name: 'Acme Inc', ExternalID: 'c1' })

    await adapter.deleteCustomer!(CREDS, 'c1')
    expect(del.mock.calls[0]![0]).toBe('/accounts/externalid/c1')
  })

  it('throws a clear error when consumerKey is missing from credentials and adapter config', async () => {
    vi.spyOn(axios, 'create').mockReturnValue({ get: vi.fn() } as never)
    const adapter = new PepperiAdapter()
    await expect(adapter.listProducts({ accessToken: 'tok_abc123' }, {})).rejects.toThrow(
      /consumerKey/,
    )
  })
})
