/**
 * MarketplacerClient — GraphQL request shape, header auth, GraphQL-error
 * surfacing, and 429 retry.
 * Docs: https://api.marketplacer.com/docs/seller-api/getting_started/
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Credentials } from '@opensteward/shared'

const { post } = vi.hoisted(() => ({ post: vi.fn() }))
vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => ({ post })),
  },
}))

import { MarketplacerClient, MarketplacerGraphQLError } from '../../../../../../src/verticals/ecommerce/adapters/marketplacer/client'
import axios from 'axios'

const CREDENTIALS: Credentials = {
  accessToken: 'sk_live_abc123',
  extra: { instanceHost: 'https://bestfriendbazaar.com', apiKey: 'sk_live_abc123' },
}

describe('MarketplacerClient', () => {
  beforeEach(() => {
    post.mockReset()
    vi.mocked(axios.create).mockClear()
  })

  it('throws when instanceHost or apiKey is missing', () => {
    expect(() => new MarketplacerClient({ accessToken: '', extra: {} })).toThrow(
      /missing extra\.instanceHost/,
    )
  })

  it('creates the axios instance with the marketplacer-api-key header and no Authorization by default', () => {
    new MarketplacerClient(CREDENTIALS)
    const config = vi.mocked(axios.create).mock.calls[0]![0]!
    expect(config.baseURL).toBe('https://bestfriendbazaar.com/graphql')
    expect(config.headers).toMatchObject({ 'marketplacer-api-key': 'sk_live_abc123' })
    expect(config.auth).toBeUndefined()
  })

  it('adds HTTP Basic auth when basicAuthUsername/Password are supplied', () => {
    new MarketplacerClient({
      ...CREDENTIALS,
      extra: { ...CREDENTIALS.extra, basicAuthUsername: 'u', basicAuthPassword: 'p' },
    })
    const config = vi.mocked(axios.create).mock.calls[0]![0]!
    expect(config.auth).toEqual({ username: 'u', password: 'p' })
  })

  it('POSTs { query, variables } and returns data on success', async () => {
    post.mockResolvedValueOnce({ data: { data: { invoices: { totalCount: 0 } } } })
    const client = new MarketplacerClient(CREDENTIALS)
    const result = await client.request('query { invoices { totalCount } }', { first: 10 })
    expect(post).toHaveBeenCalledWith('', {
      query: 'query { invoices { totalCount } }',
      variables: { first: 10 },
    })
    expect(result).toEqual({ invoices: { totalCount: 0 } })
  })

  it('throws MarketplacerGraphQLError carrying every message when errors[] is present', async () => {
    post.mockResolvedValue({
      data: { errors: [{ message: 'title must be filled in' }, { message: 'description must be filled in' }] },
    })
    const client = new MarketplacerClient(CREDENTIALS)
    await expect(client.request('mutation { advertUpsert { status } }')).rejects.toMatchObject({
      message: 'title must be filled in; description must be filled in',
    })
    await expect(client.request('mutation { advertUpsert { status } }')).rejects.toBeInstanceOf(
      MarketplacerGraphQLError,
    )
  })

  it('retries once on an HTTP 429 and succeeds on the second attempt', async () => {
    const rateLimited = Object.assign(new Error('rate limited'), { response: { status: 429 } })
    post.mockRejectedValueOnce(rateLimited).mockResolvedValueOnce({ data: { data: { ok: true } } })
    const client = new MarketplacerClient(CREDENTIALS)
    const result = await client.request<{ ok: boolean }>('query { ok }')
    expect(result).toEqual({ ok: true })
    expect(post).toHaveBeenCalledTimes(2)
  }, 10_000)
})
