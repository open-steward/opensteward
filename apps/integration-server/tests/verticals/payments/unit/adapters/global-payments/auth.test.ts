/**
 * GP-API token exchange and request headers
 * (https://developer.globalpayments.com/api/access-token): POST /accesstoken
 * with app_id, nonce, secret = SHA512(nonce + app key) and grant_type
 * client_credentials; every call carries X-GP-Version and a Bearer token.
 */
import { createHash } from 'node:crypto'
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { postMock, getMock, createMock } = vi.hoisted(() => {
  const getMock = vi.fn()
  return { postMock: vi.fn(), getMock, createMock: vi.fn(() => ({ get: getMock })) }
})

vi.mock('axios', () => ({ default: { post: postMock, create: createMock } }))

import { GlobalPaymentsAdapter } from '../../../../../../src/verticals/payments/adapters/global-payments'
import { GlobalPaymentsClient } from '../../../../../../src/verticals/payments/adapters/global-payments/client'

beforeEach(() => {
  postMock.mockReset()
  getMock.mockReset()
  createMock.mockClear()
})

describe('global-payments auth', () => {
  it('mints a token from the app id and key', async () => {
    postMock.mockResolvedValueOnce({
      data: { token: 'AEI2ptJfKM1Wb5TFZxBDWFZA7Se7', type: 'Bearer', seconds_to_expire: 86400 },
    })
    const creds = await new GlobalPaymentsAdapter().exchangeCredentials({
      appId: 'app-1',
      appKey: 'key-1',
    })
    expect(postMock).toHaveBeenCalledTimes(1)
    const [url, body, config] = postMock.mock.calls[0]!
    expect(url).toBe('https://apis.globalpay.com/ucp/accesstoken')
    expect(Object.keys(body).sort()).toEqual(['app_id', 'grant_type', 'nonce', 'secret'])
    expect(body.app_id).toBe('app-1')
    expect(body.grant_type).toBe('client_credentials')
    expect(body.secret).toBe(
      createHash('sha512')
        .update(body.nonce + 'key-1')
        .digest('hex'),
    )
    expect(config.headers['X-GP-Version']).toBe('2021-03-22')
    expect(creds.accessToken).toBe('AEI2ptJfKM1Wb5TFZxBDWFZA7Se7')
    expect(creds.extra).toEqual({ appId: 'app-1', appKey: 'key-1' })
    expect(creds.expiresAt!.getTime()).toBeGreaterThan(Date.now())
  })

  it('uses a fresh nonce per token request', async () => {
    postMock.mockResolvedValue({ data: { token: 't' } })
    const adapter = new GlobalPaymentsAdapter()
    await adapter.exchangeCredentials({ appId: 'a', appKey: 'k' })
    await adapter.exchangeCredentials({ appId: 'a', appKey: 'k' })
    expect(postMock.mock.calls[0]![1].nonce).not.toBe(postMock.mock.calls[1]![1].nonce)
  })

  it('refuses a form without the app credentials, before any request', async () => {
    await expect(new GlobalPaymentsAdapter().exchangeCredentials({ appId: 'a' })).rejects.toThrow(
      /required/,
    )
    expect(postMock).not.toHaveBeenCalled()
  })

  it('keeps a submitted accountName on credentials.extra', async () => {
    postMock.mockResolvedValueOnce({ data: { token: 't' } })
    const creds = await new GlobalPaymentsAdapter().exchangeCredentials({
      appId: 'a',
      appKey: 'k',
      accountName: ' Settlement Account ',
    })
    expect(creds.extra).toEqual({ appId: 'a', appKey: 'k', accountName: 'Settlement Account' })
  })

  it('reads seconds_to_expire as seconds', async () => {
    postMock.mockResolvedValueOnce({ data: { token: 't', seconds_to_expire: 86400 } })
    const before = Date.now()
    const creds = await new GlobalPaymentsAdapter().exchangeCredentials({ appId: 'a', appKey: 'k' })
    const ms = creds.expiresAt!.getTime() - before
    expect(ms).toBeGreaterThanOrEqual(86400 * 1000)
    expect(ms).toBeLessThan(86400 * 1000 + 60_000)
  })

  it('rejects an access-token response that carries no token', async () => {
    postMock.mockResolvedValueOnce({ data: { type: 'Bearer', seconds_to_expire: 60 } })
    await expect(
      new GlobalPaymentsAdapter().exchangeCredentials({ appId: 'a', appKey: 'k' }),
    ).rejects.toThrow(/no token/)
  })

  it('has no authorization-code flow', () => {
    expect(() => new GlobalPaymentsAdapter().getAuthUrl()).toThrow(/app credentials/)
  })
})

describe('global-payments client', () => {
  it('sends X-GP-Version and the Bearer token to the production host', async () => {
    getMock.mockResolvedValueOnce({ data: { ok: true } })
    await new GlobalPaymentsClient({ accessToken: 'tok' }).get('/transactions', { page: 1 })
    const createArgs = (
      createMock.mock.calls as unknown as [{ baseURL: string; headers: Record<string, string> }][]
    )[0]![0]
    expect(createArgs.baseURL).toBe('https://apis.globalpay.com/ucp')
    expect(createArgs.headers['X-GP-Version']).toBe('2021-03-22')
    expect(getMock).toHaveBeenCalledWith('/transactions', {
      params: { page: 1 },
      headers: { Authorization: 'Bearer tok' },
    })
  })

  it('mints a new token when the stored one has expired', async () => {
    postMock.mockResolvedValueOnce({ data: { token: 'fresh' } })
    getMock.mockResolvedValueOnce({ data: {} })
    await new GlobalPaymentsClient({
      accessToken: 'old',
      expiresAt: new Date(Date.now() - 1000),
      extra: { appId: 'a', appKey: 'k' },
    }).get('/transactions')
    expect(postMock).toHaveBeenCalledTimes(1)
    expect(getMock.mock.calls[0]![1].headers.Authorization).toBe('Bearer fresh')
  })

  it('mints a new token once and retries on a 401', async () => {
    postMock.mockResolvedValueOnce({ data: { token: 'fresh' } })
    getMock
      .mockRejectedValueOnce(Object.assign(new Error('401'), { response: { status: 401 } }))
      .mockResolvedValueOnce({ data: { ok: 1 } })
    const out = await new GlobalPaymentsClient({
      accessToken: 'stale',
      extra: { appId: 'a', appKey: 'k' },
    }).get('/transactions')
    expect(out).toEqual({ ok: 1 })
    expect(postMock).toHaveBeenCalledTimes(1)
    expect(getMock).toHaveBeenCalledTimes(2)
    expect(getMock.mock.calls[0]![1].headers.Authorization).toBe('Bearer stale')
    expect(getMock.mock.calls[1]![1].headers.Authorization).toBe('Bearer fresh')
  })

  it('refuses to mint without an app id and key, sending nothing', async () => {
    await expect(
      new GlobalPaymentsClient({
        accessToken: 'old',
        expiresAt: new Date(Date.now() - 1000),
      }).get('/transactions'),
    ).rejects.toThrow(/app id and app key/)
    expect(postMock).not.toHaveBeenCalled()
    expect(getMock).not.toHaveBeenCalled()
  })
})
