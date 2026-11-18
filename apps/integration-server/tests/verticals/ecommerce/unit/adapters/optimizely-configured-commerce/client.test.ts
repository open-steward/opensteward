/**
 * OptimizelyClient — request shape (base URL, Authorization header, method,
 * body/params) for GET/POST/PATCH.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import { OptimizelyClient } from '../../../../../../src/verticals/ecommerce/adapters/optimizely-configured-commerce/client'

const CREDENTIALS = {
  accessToken: 'tok_1',
  extra: { instance: 'https://mystore.insitesandbox.com' },
}

describe('OptimizelyClient construction', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('throws when instance is missing', () => {
    expect(() => new OptimizelyClient({ accessToken: 'x', extra: {} })).toThrow(
      /extra.instance is required/,
    )
  })

  it('throws when accessToken is missing', () => {
    expect(
      () => new OptimizelyClient({ extra: { instance: 'https://h' } } as never),
    ).toThrow(/accessToken is required/)
  })

  it('builds the base URL and Authorization header', () => {
    const create = vi.spyOn(axios, 'create')
    new OptimizelyClient(CREDENTIALS)
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: 'https://mystore.insitesandbox.com',
        headers: expect.objectContaining({ Authorization: 'Bearer tok_1' }),
      }),
    )
  })
})

describe('OptimizelyClient.get', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('sends a GET with the given path and params', async () => {
    const get = vi.fn().mockResolvedValue({ data: { products: [] } })
    vi.spyOn(axios, 'create').mockReturnValue({ get } as never)

    const client = new OptimizelyClient(CREDENTIALS)
    await client.get('/api/v1/products', { 'model.page': 2, 'model.pageSize': 25 })

    expect(get).toHaveBeenCalledWith('/api/v1/products', {
      params: { 'model.page': 2, 'model.pageSize': 25 },
    })
  })
})

describe('OptimizelyClient.post', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('sends a POST with the given path and body', async () => {
    const post = vi.fn().mockResolvedValue({ data: { realTimeInventoryResults: [] } })
    vi.spyOn(axios, 'create').mockReturnValue({ post } as never)

    const client = new OptimizelyClient(CREDENTIALS)
    await client.post('/api/v1/realtimeinventory', { productIds: ['p1'] })

    expect(post).toHaveBeenCalledWith('/api/v1/realtimeinventory', { productIds: ['p1'] })
  })
})

describe('OptimizelyClient.patch', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('sends a PATCH with the given path and body', async () => {
    const patch = vi.fn().mockResolvedValue({ data: { account: { id: '1' } } })
    vi.spyOn(axios, 'create').mockReturnValue({ patch } as never)

    const client = new OptimizelyClient(CREDENTIALS)
    await client.patch('/api/v1/accounts/1', { firstName: 'Jane' })

    expect(patch).toHaveBeenCalledWith('/api/v1/accounts/1', { firstName: 'Jane' })
  })
})
