/**
 * VirtoCommerceClient request shape and pagination.
 *
 * Verified against the live demo instance's Swagger
 * (VirtoCommerce.Platform/swagger.json `securitySchemes.api_key_header`:
 * apiKey auth via the `api_key` header) and every module's `*SearchCriteria`
 * schema (`skip`/`take` fields — e.g. `ProductIndexedSearchCriteria`,
 * `CustomerOrderSearchCriteria`), fetched 2026-09-13.
 */
import { describe, it, expect, vi } from 'vitest'
import { VirtoCommerceClient } from '../../../../../../src/verticals/ecommerce/adapters/virto-commerce/client'
import type { Credentials } from '@opensteward/shared'

function creds(overrides: Partial<Credentials> = {}): Credentials {
  return {
    accessToken: 'test-api-key',
    extra: { platformUrl: 'https://vc.example.com' },
    ...overrides,
  }
}

describe('VirtoCommerceClient', () => {
  it('throws when the API key is missing', () => {
    expect(() => new VirtoCommerceClient(creds({ accessToken: '' }))).toThrow(/apiKey/)
  })

  it('throws when platformUrl is missing', () => {
    expect(() => new VirtoCommerceClient(creds({ extra: {} }))).toThrow(/platformUrl/)
  })

  it('builds the base URL and sends the api key via the api_key header', () => {
    const client = new VirtoCommerceClient(creds())
    const defaults = client['http'].defaults
    expect(defaults.baseURL).toBe('https://vc.example.com')
    expect(defaults.headers['api_key']).toBe('test-api-key')
    expect(defaults.headers['Accept']).toBe('application/json')
  })

  it('search POSTs the given path with skip/take clamped to the documented max', async () => {
    const client = new VirtoCommerceClient(creds())
    let seenPath: string | undefined
    let seenBody: Record<string, unknown> | undefined
    client['http'].post = (async (path: string, body?: Record<string, unknown>) => {
      seenPath = path
      seenBody = body
      return { data: { totalCount: 0, items: [] } }
    }) as typeof client['http']['post']
    await client.search('/api/catalog/search/products', { take: 10000, skip: 40 }, 'items')
    expect(seenPath).toBe('/api/catalog/search/products')
    expect(seenBody).toEqual({ take: 200, skip: 40 })
  })

  it('search defaults skip to 0 and take to the documented default', async () => {
    const client = new VirtoCommerceClient(creds())
    let seenBody: Record<string, unknown> | undefined
    client['http'].post = (async (_path: string, body?: Record<string, unknown>) => {
      seenBody = body
      return { data: { totalCount: 0, results: [] } }
    }) as typeof client['http']['post']
    await client.search('/api/members/search', {}, 'results')
    expect(seenBody).toEqual({ take: 20, skip: 0 })
  })

  it('search reads items or results depending on resultKey, and returns totalCount', async () => {
    const client = new VirtoCommerceClient(creds())
    client['http'].post = (async () => ({
      data: { totalCount: 2, items: [{ id: 'a' }, { id: 'b' }] },
    })) as typeof client['http']['post']
    const result = await client.search<{ id: string }>('/x', {}, 'items')
    expect(result.items).toEqual([{ id: 'a' }, { id: 'b' }])
    expect(result.totalCount).toBe(2)
  })

  it('retries once on a 429 and then succeeds', async () => {
    vi.useFakeTimers()
    try {
      const client = new VirtoCommerceClient(creds())
      let calls = 0
      client['http'].get = (async () => {
        calls += 1
        if (calls === 1) {
          const err = new Error('rate limited') as Error & { response?: { status: number } }
          err.response = { status: 429 }
          throw err
        }
        return { data: { id: '1' } }
      }) as typeof client['http']['get']
      const promise = client.get('/api/catalog/products/1')
      await vi.advanceTimersByTimeAsync(1000)
      const result = await promise
      expect(calls).toBe(2)
      expect(result).toEqual({ id: '1' })
    } finally {
      vi.useRealTimers()
    }
  })
})
