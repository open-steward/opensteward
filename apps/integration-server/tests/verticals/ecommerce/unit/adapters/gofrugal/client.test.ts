/**
 * GofrugalClient request-shape tests.
 *
 * Docs: https://community.gofrugal.com/portal/en/kb/gofrugalretaileasy/ecommerce-integration/api-integration/articles/api-integration
 * (`X-Auth-Token` header, merchant-hosted base URL).
 */
import { describe, it, expect, vi } from 'vitest'
import { GofrugalClient } from '../../../../../../src/verticals/ecommerce/adapters/gofrugal/client'
import type { Credentials } from '@opensteward/shared'

function makeCredentials(overrides: Partial<Credentials> = {}): Credentials {
  return {
    accessToken: 'gf-key',
    extra: {
      apiKey: 'gf-key',
      baseUrl: 'https://retaileasy.example.com/WebReporter/api/v1',
      currency: 'INR',
    },
    ...overrides,
  }
}

describe('GofrugalClient', () => {
  it('throws when apiKey is missing', () => {
    expect(() => new GofrugalClient(makeCredentials({ accessToken: '', extra: {} }))).toThrow(
      /apiKey/,
    )
  })

  it('throws when baseUrl is missing', () => {
    expect(() => new GofrugalClient(makeCredentials({ extra: { apiKey: 'gf-key' } }))).toThrow(
      /baseUrl/,
    )
  })

  it('throws a descriptive error when currency is missing rather than defaulting one', () => {
    expect(
      () =>
        new GofrugalClient(
          makeCredentials({
            extra: { apiKey: 'gf-key', baseUrl: 'https://retaileasy.example.com/WebReporter/api/v1' },
          }),
        ),
    ).toThrow(/credentials\.extra\.currency is required/)
  })

  it('exposes the connection currency — never a hardcoded default (e.g. AED, not INR)', () => {
    const client = new GofrugalClient(makeCredentials({ extra: { apiKey: 'gf-key', baseUrl: 'https://retaileasy.example.com/WebReporter/api/v1', currency: 'AED' } }))
    expect(client.currency).toBe('AED')
  })

  it('configures the merchant base URL and the X-Auth-Token header', () => {
    const client = new GofrugalClient(makeCredentials())
    const defaults = (client as unknown as { http: { defaults: Record<string, unknown> } }).http
      .defaults
    expect(defaults['baseURL']).toBe('https://retaileasy.example.com/WebReporter/api/v1')
    expect((defaults['headers'] as Record<string, unknown>)['X-Auth-Token']).toBe('gf-key')
    expect(client.currency).toBe('INR')
  })

  it('get() sends the path and params through to the underlying client', async () => {
    const client = new GofrugalClient(makeCredentials())
    const http = (client as unknown as { http: { get: (...a: unknown[]) => unknown } }).http
    vi.spyOn(http, 'get').mockResolvedValue({ data: { items: [] } } as never)
    await client.get('/items', { page: 1 })
    expect(http.get).toHaveBeenCalledWith('/items', { params: { page: 1 } })
  })

  it('post() sends the request body unmodified', async () => {
    const client = new GofrugalClient(makeCredentials())
    const http = (client as unknown as { http: { post: (...a: unknown[]) => unknown } }).http
    vi.spyOn(http, 'post').mockResolvedValue({ data: { result: { status: 'Success', id: 1 } } } as never)
    await client.post('/salesOrders', { salesOrder: { customerId: '1' } })
    expect(http.post).toHaveBeenCalledWith('/salesOrders', { salesOrder: { customerId: '1' } })
  })

  it('retries once on a 429 and then succeeds (withRetry)', async () => {
    const client = new GofrugalClient(makeCredentials())
    const http = (client as unknown as { http: { get: (...a: unknown[]) => unknown } }).http
    const rateLimited = Object.assign(new Error('Too Many Requests'), {
      isAxiosError: true,
      response: { status: 429 },
    })
    const spy = vi
      .spyOn(http, 'get')
      .mockRejectedValueOnce(rateLimited)
      .mockResolvedValueOnce({ data: { items: [] } } as never)
    const result = await client.get('/items')
    expect(result).toEqual({ items: [] })
    expect(spy).toHaveBeenCalledTimes(2)
  }, 10_000)
})
