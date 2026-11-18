/**
 * TrueLayer Payments API v3 client.
 *
 * The API "Production server" is `https://api.truelayer.com` (the OpenAPI
 * `servers` block of
 * https://docs.truelayer.com/reference/merchant-account-get-transactions), and
 * every request carries the client-credentials `access_token` as a Bearer
 * token (https://docs.truelayer.com/reference/generateaccesstoken).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Credentials } from '@opensteward/shared'

const { create, httpGet, mintToken } = vi.hoisted(() => {
  const httpGet = vi.fn()
  return {
    httpGet,
    create: vi.fn(() => ({ get: httpGet })),
    mintToken: vi.fn(),
  }
})

vi.mock('axios', () => ({ default: { create } }))
vi.mock('../../../../../../src/verticals/payments/adapters/truelayer/auth', async (orig) => ({
  ...(await orig<object>()),
  mintToken,
}))

import { TrueLayerClient } from '../../../../../../src/verticals/payments/adapters/truelayer/client'

const EXTRA = { clientId: 'client', clientSecret: 'secret' }
const FRESH: Credentials = {
  accessToken: 'old',
  expiresAt: new Date(Date.now() + 3_600_000),
  extra: EXTRA,
}
const auth = (call: unknown[]) =>
  (call[1] as { headers: Record<string, string> }).headers.Authorization

beforeEach(() => {
  create.mockClear()
  httpGet.mockReset()
  mintToken.mockReset()
  mintToken.mockResolvedValue({ accessToken: 'new', extra: EXTRA })
})

describe('TrueLayerClient', () => {
  it('targets the documented production host', () => {
    new TrueLayerClient(FRESH)
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ baseURL: 'https://api.truelayer.com' }),
    )
  })

  it('sends the stored token as Bearer with the caller params and headers', async () => {
    httpGet.mockResolvedValue({ data: { ok: 1 } })
    const out = await new TrueLayerClient(FRESH).get('/v3/x', { a: 1 }, { h: 'v' })
    expect(out).toEqual({ ok: 1 })
    expect(mintToken).not.toHaveBeenCalled()
    expect(httpGet).toHaveBeenCalledWith('/v3/x', {
      params: { a: 1 },
      headers: { h: 'v', Authorization: 'Bearer old' },
    })
  })

  it('mints a token first when the stored one has expired', async () => {
    httpGet.mockResolvedValue({ data: {} })
    await new TrueLayerClient({ ...FRESH, expiresAt: new Date(Date.now() - 1000) }).get('/v3/x')
    expect(mintToken).toHaveBeenCalledTimes(1)
    expect(mintToken).toHaveBeenCalledWith(EXTRA)
    expect(auth(httpGet.mock.calls[0]!)).toBe('Bearer new')
  })

  it('mints once more and retries on a 401', async () => {
    httpGet
      .mockRejectedValueOnce(Object.assign(new Error('401'), { response: { status: 401 } }))
      .mockResolvedValueOnce({ data: { ok: 2 } })
    const out = await new TrueLayerClient(FRESH).get('/v3/x')
    expect(out).toEqual({ ok: 2 })
    expect(mintToken).toHaveBeenCalledTimes(1)
    expect(httpGet).toHaveBeenCalledTimes(2)
    expect(auth(httpGet.mock.calls[0]!)).toBe('Bearer old')
    expect(auth(httpGet.mock.calls[1]!)).toBe('Bearer new')
  })

  it('does not re-mint on other errors', async () => {
    httpGet.mockRejectedValue(Object.assign(new Error('404'), { response: { status: 404 } }))
    await expect(new TrueLayerClient(FRESH).get('/v3/x')).rejects.toThrow('404')
    expect(mintToken).not.toHaveBeenCalled()
    expect(httpGet).toHaveBeenCalledTimes(1)
  })
})
