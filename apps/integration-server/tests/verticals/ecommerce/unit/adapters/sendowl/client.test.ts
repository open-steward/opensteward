/**
 * SendOwlClient request shape and pagination.
 *
 * Verified against https://dashboard.sendowl.com/developers/api/introduction:
 *  - HTTP Basic auth (API key as username, API secret as password)
 *  - `Accept: application/json` (SendOwl is XML-by-default; JSON is opt-in)
 *  - pagination via `page` (default 1) + `per_page` (max 50)
 */
import { describe, it, expect, vi } from 'vitest'
import { SendOwlClient } from '../../../../../../src/verticals/ecommerce/adapters/sendowl/client'
import type { Credentials } from '@opensteward/shared'

function creds(overrides: Partial<Credentials> = {}): Credentials {
  return {
    accessToken: 'test-api-key',
    extra: { apiSecret: 'test-api-secret' },
    ...overrides,
  }
}

describe('SendOwlClient', () => {
  it('throws when the API key is missing', () => {
    expect(() => new SendOwlClient(creds({ accessToken: '' }))).toThrow(/apiKey/)
  })

  it('throws when the API secret is missing', () => {
    expect(() => new SendOwlClient(creds({ extra: {} }))).toThrow(/apiSecret/)
  })

  it('builds the base URL and a Basic auth header from key:secret', () => {
    const client = new SendOwlClient(creds())
    const defaults = client['http'].defaults
    expect(defaults.baseURL).toBe('https://api.sendowl.com')
    const expected = Buffer.from('test-api-key:test-api-secret').toString('base64')
    expect(defaults.headers['Authorization']).toBe(`Basic ${expected}`)
  })

  it('sends Accept and Content-Type as application/json', () => {
    const client = new SendOwlClient(creds())
    const defaults = client['http'].defaults
    expect(defaults.headers['Accept']).toBe('application/json')
    expect(defaults.headers['Content-Type']).toBe('application/json')
  })

  it('GET issues the exact path and params given', async () => {
    const client = new SendOwlClient(creds())
    let seenPath: string | undefined
    let seenParams: unknown
    client['http'].get = (async (path: string, config?: { params?: unknown }) => {
      seenPath = path
      seenParams = config?.params
      return { data: { product: { id: 1 } }, headers: {} }
    }) as typeof client['http']['get']
    await client.get('/api/v1/products/1')
    expect(seenPath).toBe('/api/v1/products/1')
    expect(seenParams).toBeUndefined()
  })

  it('listWithPage clamps per_page to the documented max of 50', async () => {
    const client = new SendOwlClient(creds())
    let seenParams: Record<string, unknown> | undefined
    client['http'].get = (async (_path: string, config?: { params?: Record<string, unknown> }) => {
      seenParams = config?.params
      return { data: [], headers: {} }
    }) as typeof client['http']['get']
    await client.listWithPage('/api/v1/products', 'product', { per_page: 500, page: 2 })
    expect(seenParams).toEqual({ per_page: 50, page: 2 })
  })

  it('listWithPage defaults page to 1 and per_page to the documented default of 10', async () => {
    const client = new SendOwlClient(creds())
    let seenParams: Record<string, unknown> | undefined
    client['http'].get = (async (_path: string, config?: { params?: Record<string, unknown> }) => {
      seenParams = config?.params
      return { data: [], headers: {} }
    }) as typeof client['http']['get']
    await client.listWithPage('/api/v1/products', 'product', {})
    expect(seenParams).toEqual({ per_page: 10, page: 1 })
  })

  it('listWithPage unwraps each array element from its singular wrapper key', async () => {
    const client = new SendOwlClient(creds())
    client['http'].get = (async () => ({
      data: [{ product: { id: 1, name: 'A' } }, { product: { id: 2, name: 'B' } }],
      headers: {},
    })) as typeof client['http']['get']
    const result = await client.listWithPage<{ id: number; name: string }>(
      '/api/v1/products',
      'product',
      {},
    )
    expect(result.items).toEqual([
      { id: 1, name: 'A' },
      { id: 2, name: 'B' },
    ])
  })

  it('listWithPage reports hasMore=true only when a full page came back', async () => {
    const client = new SendOwlClient(creds())
    client['http'].get = (async () => ({
      data: Array.from({ length: 10 }, (_, i) => ({ product: { id: i } })),
      headers: {},
    })) as typeof client['http']['get']
    const full = await client.listWithPage('/api/v1/products', 'product', { per_page: 10 })
    expect(full.hasMore).toBe(true)

    client['http'].get = (async () => ({
      data: [{ product: { id: 1 } }],
      headers: {},
    })) as typeof client['http']['get']
    const short = await client.listWithPage('/api/v1/products', 'product', { per_page: 10 })
    expect(short.hasMore).toBe(false)
  })

  it('retries once on a 429 and then succeeds', async () => {
    vi.useFakeTimers()
    try {
      const client = new SendOwlClient(creds())
      let calls = 0
      client['http'].get = (async () => {
        calls += 1
        if (calls === 1) {
          const err = new Error('rate limited') as Error & { response?: { status: number } }
          err.response = { status: 429 }
          throw err
        }
        return { data: { product: { id: 1 } }, headers: {} }
      }) as typeof client['http']['get']
      const promise = client.get<{ product: { id: number } }>('/api/v1/products/1')
      await vi.advanceTimersByTimeAsync(1000)
      const result = await promise
      expect(calls).toBe(2)
      expect(result).toEqual({ product: { id: 1 } })
    } finally {
      vi.useRealTimers()
    }
  })
})
