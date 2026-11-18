/**
 * Trolley request signing (https://developers.trolley.com/api/#authentication):
 *
 *   "The REQUEST_SIGNATURE is computed by creating a sha256 HMAC using the
 *    secret key on the prehash string and timestamp + '\n' + method + '\n' +
 *    requestPath + '\n' + body + '\n'"
 *   requestPath: "The full request path including all query parameters"
 *   header: "Authorization: prsign ACCESS_KEY:REQUEST_SIGNATURE", plus X-PR-Timestamp.
 *
 * The client's axios adapter is replaced so the test sees the exact request.
 */
import { createHmac } from 'node:crypto'
import { describe, it, expect, vi, afterEach } from 'vitest'
import type { AxiosRequestConfig } from 'axios'
import type { Credentials } from '@opensteward/shared'
import {
  TrolleyClient,
  buildAuthHeaders,
} from '../../../../../../src/verticals/payments/adapters/trolley/client'
import { TrolleyAdapter } from '../../../../../../src/verticals/payments/adapters/trolley'

const CREDS: Credentials = { accessToken: 'ACCESSKEY', extra: { secretKey: 'SECRET' } }

function capture(client: TrolleyClient, data: unknown = { ok: true }) {
  const seen: AxiosRequestConfig[] = []
  const http = (client as unknown as { http: { defaults: { adapter: unknown } } }).http
  http.defaults.adapter = async (config: AxiosRequestConfig) => {
    seen.push(config)
    return { data, status: 200, statusText: 'OK', headers: {}, config }
  }
  return seen
}

function expectedSig(ts: number, method: string, path: string, body: string): string {
  return createHmac('sha256', 'SECRET').update(`${ts}\n${method}\n${path}\n${body}\n`).digest('hex')
}

afterEach(() => {
  vi.useRealTimers()
})

describe('Trolley request signing', () => {
  it('builds prsign ACCESS_KEY:HMAC over timestamp, METHOD, path and body', () => {
    const h = buildAuthHeaders('ACCESSKEY', 'SECRET', 'get', '/v1/recipients', '', 1656393402)
    expect(h['X-PR-Timestamp']).toBe('1656393402')
    expect(h.Authorization).toBe(
      `prsign ACCESSKEY:${expectedSig(1656393402, 'GET', '/v1/recipients', '')}`,
    )
  })

  it('signs a GET over the full path including its query string, on api.trolley.com', async () => {
    vi.useFakeTimers({ now: new Date(1_700_000_000_000), toFake: ['Date'] })
    const client = new TrolleyClient(CREDS)
    const seen = capture(client)
    await client.get('/recipients', { page: 2, pageSize: 5, startDate: undefined })
    expect(seen).toHaveLength(1)
    const req = seen[0]!
    expect(req.baseURL).toBe('https://api.trolley.com')
    expect(req.url).toBe('/v1/recipients?page=2&pageSize=5')
    expect(req.method?.toUpperCase()).toBe('GET')
    const headers = req.headers as Record<string, string>
    expect(headers['X-PR-Timestamp']).toBe('1700000000')
    expect(headers['Authorization']).toBe(
      `prsign ACCESSKEY:${expectedSig(1700000000, 'GET', '/v1/recipients?page=2&pageSize=5', '')}`,
    )
  })

  it('signs a POST over the exact JSON body it sends', async () => {
    vi.useFakeTimers({ now: new Date(1_700_000_000_000), toFake: ['Date'] })
    const client = new TrolleyClient(CREDS)
    const seen = capture(client)
    await client.post('/invoices/search', { page: 1, pageSize: 10 })
    const req = seen[0]!
    expect(req.url).toBe('/v1/invoices/search')
    expect(req.data).toBe('{"page":1,"pageSize":10}')
    const headers = req.headers as Record<string, string>
    expect(headers['Content-Type']).toBe('application/json')
    expect(headers['Authorization']).toBe(
      `prsign ACCESSKEY:${expectedSig(1700000000, 'POST', '/v1/invoices/search', '{"page":1,"pageSize":10}')}`,
    )
  })

  it('refuses to build a client without the secret key, before any request', () => {
    expect(() => new TrolleyClient({ accessToken: 'ACCESSKEY' })).toThrow(/secret key/)
  })
})

describe('Trolley credentials', () => {
  const adapter = new TrolleyAdapter()

  it('asks for the access key and the secret key', () => {
    expect(adapter.credentialFields().map((f) => f.name)).toEqual(['accessKey', 'secretKey'])
  })

  it('stores the access key as the token and the secret key in extra', async () => {
    await expect(adapter.exchangeCredentials({ accessKey: 'A', secretKey: 'S' })).resolves.toEqual({
      accessToken: 'A',
      extra: { secretKey: 'S' },
    })
  })

  it('rejects a form missing either key', async () => {
    await expect(adapter.exchangeCredentials({ accessKey: 'A' })).rejects.toThrow(/secret key/)
    await expect(adapter.exchangeCredentials({ secretKey: 'S' })).rejects.toThrow(/access key/)
  })
})
