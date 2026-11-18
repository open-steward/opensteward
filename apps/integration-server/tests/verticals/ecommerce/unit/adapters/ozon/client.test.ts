/**
 * Ozon Seller API request shape.
 *
 * The Seller API is RPC over HTTP: every method is a POST with a JSON body to
 * a versioned path on `https://api-seller.ozon.ru` (the only server in
 * Ozon's official spec), authenticated by the `Client-Id` and `Api-Key`
 * headers — never by anything in the URL. Rate-limit breaches answer 429.
 *   https://docs.ozon.ru/api/seller/
 *   https://web.archive.org/web/20240531073337/https://docs.ozon.ru/api/seller/swagger.json
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { OzonClient } from '../../../../../../src/verticals/ecommerce/adapters/ozon/client'

const CREDS = { accessToken: 'api-key-secret', extra: { clientId: '1943980' } }

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

describe('OzonClient', () => {
  it('targets api-seller.ozon.ru with both auth headers', () => {
    const create = vi.spyOn(axios, 'create').mockReturnValue({ post: vi.fn() } as never)
    new OzonClient(CREDS)
    const cfg = create.mock.calls[0]![0]!
    expect(cfg.baseURL).toBe('https://api-seller.ozon.ru')
    expect(cfg.headers).toMatchObject({
      'Client-Id': '1943980',
      'Api-Key': 'api-key-secret',
      'Content-Type': 'application/json',
    })
    expect(JSON.stringify(cfg.baseURL)).not.toContain('api-key-secret')
  })

  it('POSTs the JSON body to the method path and returns the response body', async () => {
    const post = vi.fn(async () => ({ data: { result: [] } }))
    vi.spyOn(axios, 'create').mockReturnValue({ post } as never)
    const res = await new OzonClient(CREDS).post('/v1/warehouse/list', {})
    expect(post).toHaveBeenCalledWith('/v1/warehouse/list', {})
    expect(res).toEqual({ result: [] })
  })

  it('refuses to build a client without a Client ID', () => {
    vi.spyOn(axios, 'create').mockReturnValue({ post: vi.fn() } as never)
    expect(() => new OzonClient({ accessToken: 'k' })).toThrow(/Client-Id/)
  })

  it('refuses to build a client without an API key', () => {
    vi.spyOn(axios, 'create').mockReturnValue({ post: vi.fn() } as never)
    expect(() => new OzonClient({ accessToken: '', extra: { clientId: '1' } })).toThrow(/Api-Key/)
  })

  it('retries a 429 and returns the eventual success', async () => {
    vi.useFakeTimers()
    const tooMany = Object.assign(new Error('Request failed with status code 429'), { response: { status: 429 } })
    const post = vi.fn().mockRejectedValueOnce(tooMany).mockResolvedValueOnce({ data: { result: true } })
    vi.spyOn(axios, 'create').mockReturnValue({ post } as never)
    const pending = new OzonClient(CREDS).post('/v2/posting/fbs/cancel', { posting_number: 'p' })
    await vi.runAllTimersAsync()
    await expect(pending).resolves.toEqual({ result: true })
    expect(post).toHaveBeenCalledTimes(2)
  })
})
