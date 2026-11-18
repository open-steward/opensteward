/**
 * OrderchampClient — GraphQL request shape, Bearer auth, GraphQL-error
 * surfacing, and the Throttled-retry path.
 * Docs: https://developers.orderchamp.com/authentication
 *       https://developers.orderchamp.com/rate-limits
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Credentials } from '@opensteward/shared'

const { post } = vi.hoisted(() => ({ post: vi.fn() }))
vi.mock('axios', () => ({
  default: { create: vi.fn(() => ({ post })) },
}))

import { OrderchampClient, OrderchampGraphQLError } from '../../../../../../src/verticals/ecommerce/adapters/orderchamp/client'
import axios from 'axios'

const CREDENTIALS: Credentials = { accessToken: 'tok_live_abc123' }

describe('OrderchampClient', () => {
  beforeEach(() => {
    post.mockReset()
    vi.mocked(axios.create).mockClear()
  })

  it('throws when there is no access token', () => {
    expect(() => new OrderchampClient({ accessToken: '' })).toThrow(/missing an access token/)
  })

  it('creates the axios instance with the fixed endpoint and a Bearer header', () => {
    new OrderchampClient(CREDENTIALS)
    const config = vi.mocked(axios.create).mock.calls[0]![0]!
    expect(config.baseURL).toBe('https://api.orderchamp.com/v1/graphql')
    expect(config.headers).toMatchObject({ Authorization: 'Bearer tok_live_abc123' })
  })

  it('POSTs { query, variables } and returns data on success', async () => {
    post.mockResolvedValueOnce({ data: { data: { orders: { edges: [] } } } })
    const client = new OrderchampClient(CREDENTIALS)
    const result = await client.request('query { orders { edges { node { id } } } }', { first: 10 })
    expect(post).toHaveBeenCalledWith('', {
      query: 'query { orders { edges { node { id } } } }',
      variables: { first: 10 },
    })
    expect(result).toEqual({ orders: { edges: [] } })
  })

  it('throws OrderchampGraphQLError for a non-throttle GraphQL error', async () => {
    post.mockResolvedValue({ data: { errors: [{ message: 'Brand must be filled in' }] } })
    const client = new OrderchampClient(CREDENTIALS)
    await expect(client.request('mutation { productCreate { userErrors { message } } }')).rejects.toMatchObject({
      message: 'Brand must be filled in',
    })
    await expect(client.request('mutation { productCreate { userErrors { message } } }')).rejects.toBeInstanceOf(
      OrderchampGraphQLError,
    )
  })

  it('retries a Throttled GraphQL error with backoff and succeeds on the second attempt', async () => {
    post
      .mockResolvedValueOnce({ data: { errors: [{ message: 'Throttled' }] } })
      .mockResolvedValueOnce({ data: { data: { ok: true } } })
    const client = new OrderchampClient(CREDENTIALS)
    const result = await client.request<{ ok: boolean }>('query { ok }')
    expect(result).toEqual({ ok: true })
    expect(post).toHaveBeenCalledTimes(2)
  }, 10_000)
})
