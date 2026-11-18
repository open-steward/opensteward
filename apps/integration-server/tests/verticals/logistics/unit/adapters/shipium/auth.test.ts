/**
 * Shipium API-key auth — https://docs.shipium.com/docs/api-key-based-authentication.md
 *   "To use your API key within an application context, you must provide it as a
 *    Base64-encoded value via the Authorization header. Add a trailing colon (:) to
 *    the end of your key before encoding."
 *   "* Use the Basic Auth username value when providing your API key."
 *
 * Connect Link stores the raw key the user typed (`simpleApiKey`), so the client
 * must do the encoding. Before this fix it sent `Basic <raw key>`.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { ShipiumAdapter } from '../../../../../../src/verticals/logistics/adapters/shipium/index'
import {
  authHeader,
  exchangeApiKey,
} from '../../../../../../src/verticals/logistics/adapters/shipium/auth'

afterEach(() => vi.restoreAllMocks())

describe('shipium auth', () => {
  it('sends Basic base64("<key>:")', () => {
    expect(authHeader('abc123')).toBe(`Basic ${Buffer.from('abc123:').toString('base64')}`)
  })

  it('the client is created with that header from a Connect Link credential', async () => {
    const create = vi.spyOn(axios, 'create').mockReturnValue({ get: vi.fn() } as never)
    const adapter = new ShipiumAdapter()
    const creds = await adapter.exchangeCredentials({ apiKey: 'abc123' })
    await adapter.getWarehouse(creds, 'w1').catch(() => undefined)
    const cfg = create.mock.calls[0]![0] as { baseURL: string; headers: Record<string, string> }
    expect(cfg.baseURL).toBe('https://api.shipium.com/api/v1')
    expect(cfg.headers['Authorization']).toBe(`Basic ${Buffer.from('abc123:').toString('base64')}`)
  })

  it('exchangeCode stores the raw key, dropping the curl-style trailing colon', async () => {
    expect(await exchangeApiKey('abc123')).toEqual({ accessToken: 'abc123' })
    expect(await exchangeApiKey(' abc123: ')).toEqual({ accessToken: 'abc123' })
  })
})
