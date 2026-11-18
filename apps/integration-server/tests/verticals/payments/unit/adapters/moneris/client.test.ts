import { describe, it, expect, vi, beforeEach } from 'vitest'

const { createMock } = vi.hoisted(() => ({ createMock: vi.fn() }))
vi.mock('axios', () => ({ default: { create: createMock } }))

import { MonerisClient } from '../../../../../../src/verticals/payments/adapters/moneris/client'
import { buildCredentials } from '../../../../../../src/verticals/payments/adapters/moneris/auth'
import { MonerisAdapter } from '../../../../../../src/verticals/payments/adapters/moneris'

beforeEach(() => createMock.mockReset())

describe('moneris client auth', () => {
  it('sends X-Api-Key, X-Merchant-Id and Api-Version to the documented production host', () => {
    createMock.mockReturnValue({ get: vi.fn() })
    new MonerisClient(buildCredentials({ apiKey: 'key_live', merchantId: '0123456789101' }))
    const cfg = createMock.mock.calls[0]![0]
    expect(cfg.baseURL).toBe('https://api.moneris.io')
    expect(cfg.headers['X-Api-Key']).toBe('key_live')
    expect(cfg.headers['X-Merchant-Id']).toBe('0123456789101')
    expect(cfg.headers['Api-Version']).toBe('2026-08-14')
    expect(cfg.headers.Authorization).toBeUndefined()
  })

  it('refuses a connection with no API key or a merchant id that is not 13 characters', () => {
    expect(() => buildCredentials({ merchantId: '0123456789101' })).toThrow(/API key/)
    expect(() => buildCredentials({ apiKey: 'k' })).toThrow(/Merchant ID/)
    expect(() => buildCredentials({ apiKey: 'k', merchantId: '0123' })).toThrow(/Merchant ID/)
  })

  it('refuses a stored connection with no merchant id (501) before any request', async () => {
    const adapter = new MonerisAdapter()
    await expect(
      adapter.getCustomer({ accessToken: 'key_live' }, 'ci0105ARZ3NDEKTSV4RRFFQ69G5FAV'),
    ).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect(createMock).not.toHaveBeenCalled()
  })
})
