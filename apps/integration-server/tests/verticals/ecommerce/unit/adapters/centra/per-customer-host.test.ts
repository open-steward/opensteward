/**
 * Every Centra Order API plugin has its own endpoint, copied from the plugin
 * page in the Centra backend, and the client reads it from
 * `credentials.extra.baseUrl`. The Connect Link form must collect it with the
 * API key and only accept a public https host, because the key is sent there
 * in the API-Authorization header on every request.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setDnsResolver } from '@opensteward/shared'
import { CentraAdapter } from '../../../../../../src/verticals/ecommerce/adapters/centra'
import { CentraClient } from '../../../../../../src/verticals/ecommerce/adapters/centra/client'

const PUBLIC_DNS = async () => [{ address: '93.184.216.34' }]
const PRIVATE_DNS = async () => [{ address: '127.0.0.53' }]

function httpDefaults(client: unknown): { baseURL?: string; headers: Record<string, unknown> } {
  return (client as { http: { defaults: { baseURL?: string; headers: Record<string, unknown> } } })
    .http.defaults
}

describe('Centra Connect Link form', () => {
  const adapter = new CentraAdapter()

  beforeEach(() => {
    delete process.env['OST_ALLOW_PRIVATE_HOSTS']
    setDnsResolver(PUBLIC_DNS)
  })
  afterEach(() => setDnsResolver(undefined))

  it('declares the Order API URL and API key the client reads', () => {
    const byName = Object.fromEntries(adapter.credentialFields().map((f) => [f.name, f]))
    expect(byName['baseUrl']).toMatchObject({ type: 'url', required: true })
    expect(byName['baseUrl']?.placeholder).toMatch(/^https:\/\//)
    expect(byName['baseUrl']?.helpText).toBeTruthy()
    expect(byName['apiKey']).toMatchObject({ type: 'password', required: true })
    expect(byName['apiKey']?.helpText).toBeTruthy()
  })

  it('rejects a blank Order API URL', async () => {
    await expect(
      adapter.exchangeCredentials({ baseUrl: '', apiKey: 'key' }),
    ).rejects.toThrow('Order API URL is required.')
  })

  it('rejects a blank API key', async () => {
    await expect(
      adapter.exchangeCredentials({ baseUrl: 'https://brand.centra.com/api/order-api', apiKey: ' ' }),
    ).rejects.toThrow('API key is required.')
  })

  it('rejects a value that is not a URL', async () => {
    await expect(
      adapter.exchangeCredentials({ baseUrl: 'brand centra', apiKey: 'key' }),
    ).rejects.toThrow('Order API URL must be a full URL')
  })

  it('rejects a non-https URL', async () => {
    await expect(
      adapter.exchangeCredentials({ baseUrl: 'http://brand.centra.com/api/order-api', apiKey: 'key' }),
    ).rejects.toThrow('Order API URL must start with https://')
  })

  it('rejects a host name that resolves to a private address', async () => {
    setDnsResolver(PRIVATE_DNS)
    await expect(
      adapter.exchangeCredentials({ baseUrl: 'https://centra.internal.example/api/order-api', apiKey: 'key' }),
    ).rejects.toThrow(
      'Order API URL must be a publicly reachable host; centra.internal.example resolves to a private or reserved address.',
    )
  })

  it('rejects a private IP literal', async () => {
    await expect(
      adapter.exchangeCredentials({ baseUrl: 'https://10.0.0.1/api/order-api', apiKey: 'key' }),
    ).rejects.toThrow(
      'Order API URL must be a publicly reachable host; 10.0.0.1 resolves to a private or reserved address.',
    )
  })

  it('rejects a URL carrying a query string', async () => {
    await expect(
      adapter.exchangeCredentials({ baseUrl: 'https://brand.centra.com/api/order-api?x=1', apiKey: 'key' }),
    ).rejects.toThrow('Order API URL must not contain a query string or fragment.')
  })

  it('returns the normalised URL and key in the shape the client reads', async () => {
    await expect(
      adapter.exchangeCredentials({ baseUrl: ' https://brand.centra.com/api/order-api/ ', apiKey: ' key ' }),
    ).resolves.toEqual({
      accessToken: 'key',
      extra: { baseUrl: 'https://brand.centra.com/api/order-api' },
    })
  })

  it('builds the client from the collected credentials', async () => {
    const creds = await adapter.exchangeCredentials({
      baseUrl: 'https://brand.centra.com/api/order-api',
      apiKey: 'key',
    })
    const defaults = httpDefaults(new CentraClient(creds))
    expect(defaults.baseURL).toBe('https://brand.centra.com/api/order-api')
    expect(defaults.headers['API-Authorization']).toBe('key')
  })
})
