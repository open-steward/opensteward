/**
 * FastSpringClient request-shape tests.
 *
 * Docs: https://developer.fastspring.com/reference/api-overview
 * (Basic Auth, mandatory User-Agent, host, 429 rate limit) and
 * https://developer.fastspring.com/reference/list-all-orders (list envelope
 * shape: `{ page, limit, nextPage, total, orders: [...] }`).
 */
import { describe, it, expect, vi } from 'vitest'
import { FastSpringClient } from '../../../../../../src/verticals/ecommerce/adapters/fastspring/client'
import type { Credentials } from '@opensteward/shared'

function makeCredentials(overrides: Partial<Credentials> = {}): Credentials {
  return {
    accessToken: 'fs-user',
    extra: { apiUsername: 'fs-user', apiPassword: 'fs-pass' },
    ...overrides,
  }
}

describe('FastSpringClient', () => {
  it('throws when apiUsername is missing', () => {
    expect(() => new FastSpringClient(makeCredentials({ accessToken: '', extra: {} }))).toThrow(
      /apiUsername/,
    )
  })

  it('throws when apiPassword is missing', () => {
    expect(
      () => new FastSpringClient(makeCredentials({ extra: { apiUsername: 'fs-user' } })),
    ).toThrow(/apiPassword/)
  })

  it('configures the fixed FastSpring host, Basic auth, and a mandatory User-Agent', () => {
    const client = new FastSpringClient(makeCredentials())
    const defaults = (client as unknown as { http: { defaults: Record<string, unknown> } }).http
      .defaults
    expect(defaults['baseURL']).toBe('https://api.fastspring.com')
    expect(defaults['auth']).toEqual({ username: 'fs-user', password: 'fs-pass' })
    expect((defaults['headers'] as Record<string, unknown>)['User-Agent']).toMatch(/fastspring/i)
  })

  it('listIds reads the id array and page/limit/nextPage/total envelope fields', async () => {
    const client = new FastSpringClient(makeCredentials())
    const http = (client as unknown as { http: { get: (...a: unknown[]) => unknown } }).http
    vi.spyOn(http, 'get').mockResolvedValue({
      data: {
        action: 'order.getall',
        result: 'success',
        page: 1,
        limit: 50,
        nextPage: 2,
        total: 2,
        orders: ['abcDEFgHiJklM1N-3OP9q', 'rST2uv1wXy279zABCd_E2f'],
      },
    } as never)
    const result = await client.listIds('/orders', 'orders', { page: 1, limit: 50 })
    expect(result).toEqual({
      ids: ['abcDEFgHiJklM1N-3OP9q', 'rST2uv1wXy279zABCd_E2f'],
      page: 1,
      limit: 50,
      nextPage: 2,
      total: 2,
    })
    expect(http.get).toHaveBeenCalledWith('/orders', { params: { page: 1, limit: 50 } })
  })

  it('listIds tolerates an envelope with no pagination metadata (coupons)', async () => {
    const client = new FastSpringClient(makeCredentials())
    const http = (client as unknown as { http: { get: (...a: unknown[]) => unknown } }).http
    vi.spyOn(http, 'get').mockResolvedValue({ data: { coupons: ['summer-sale-2026'] } } as never)
    const result = await client.listIds('/coupons', 'coupons', {})
    expect(result).toEqual({
      ids: ['summer-sale-2026'],
      page: undefined,
      limit: undefined,
      nextPage: undefined,
      total: undefined,
    })
  })

  it('get() sends the path and params through to the underlying client', async () => {
    const client = new FastSpringClient(makeCredentials())
    const http = (client as unknown as { http: { get: (...a: unknown[]) => unknown } }).http
    vi.spyOn(http, 'get').mockResolvedValue({ data: { ok: true } } as never)
    await client.get('/products/premium-laptop', { page: 2 })
    expect(http.get).toHaveBeenCalledWith('/products/premium-laptop', { params: { page: 2 } })
  })

  it('post() sends the request body unmodified', async () => {
    const client = new FastSpringClient(makeCredentials())
    const http = (client as unknown as { http: { post: (...a: unknown[]) => unknown } }).http
    vi.spyOn(http, 'post').mockResolvedValue({ data: { ok: true } } as never)
    await client.post('/returns', { returns: [{ order: 'ord_1' }] })
    expect(http.post).toHaveBeenCalledWith('/returns', { returns: [{ order: 'ord_1' }] })
  })

  it('retries once on a 429 and then succeeds (withRetry)', async () => {
    const client = new FastSpringClient(makeCredentials())
    const http = (client as unknown as { http: { get: (...a: unknown[]) => unknown } }).http
    const rateLimited = Object.assign(new Error('Too Many Requests'), {
      isAxiosError: true,
      response: { status: 429 },
    })
    const spy = vi
      .spyOn(http, 'get')
      .mockRejectedValueOnce(rateLimited)
      .mockResolvedValueOnce({ data: { ok: true } } as never)
    const result = await client.get('/products')
    expect(result).toEqual({ ok: true })
    expect(spy).toHaveBeenCalledTimes(2)
  }, 10_000)
})
