/**
 * Aimeos has no fixed API entry point — the JSON API URL is whatever the host
 * application routes it to (Laravel's default is `/admin/{site}/jsonadm`). The
 * Connect Link form must collect that URL plus the token, and only accept a
 * public https host because the token is sent there on every request.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setDnsResolver } from '@opensteward/shared'
import { AimeosAdapter } from '../../../../../../src/verticals/ecommerce/adapters/aimeos'
import { AimeosClient } from '../../../../../../src/verticals/ecommerce/adapters/aimeos/client'

const PUBLIC_DNS = async () => [{ address: '93.184.216.34' }]
const PRIVATE_DNS = async () => [{ address: '192.168.1.20' }]

function httpDefaults(client: unknown): { baseURL?: string; headers: Record<string, unknown> } {
  return (client as { http: { defaults: { baseURL?: string; headers: Record<string, unknown> } } })
    .http.defaults
}

describe('Aimeos Connect Link form', () => {
  const adapter = new AimeosAdapter()

  beforeEach(() => {
    delete process.env['OST_ALLOW_PRIVATE_HOSTS']
    setDnsResolver(PUBLIC_DNS)
  })
  afterEach(() => setDnsResolver(undefined))

  it('declares the JSON API URL and the token the client reads', () => {
    const byName = Object.fromEntries(adapter.credentialFields().map((f) => [f.name, f]))
    expect(byName['apiUrl']).toMatchObject({ type: 'url', required: true })
    expect(byName['apiUrl']?.placeholder).toMatch(/^https:\/\//)
    expect(byName['apiUrl']?.helpText).toBeTruthy()
    expect(byName['accessToken']).toMatchObject({ type: 'password', required: true })
    expect(byName['accessToken']?.helpText).toBeTruthy()
  })

  it('rejects a blank JSON API URL', async () => {
    await expect(
      adapter.exchangeCredentials({ apiUrl: '', accessToken: 'tok' }),
    ).rejects.toThrow('Aimeos JSON API URL is required.')
  })

  it('rejects a blank token', async () => {
    await expect(
      adapter.exchangeCredentials({ apiUrl: 'https://shop.example.com/admin/default/jsonadm', accessToken: '' }),
    ).rejects.toThrow('API token is required.')
  })

  it('rejects a value that is not a URL', async () => {
    await expect(
      adapter.exchangeCredentials({ apiUrl: 'not a url', accessToken: 'tok' }),
    ).rejects.toThrow('Aimeos JSON API URL must be a full URL')
  })

  it('rejects a non-https URL', async () => {
    await expect(
      adapter.exchangeCredentials({ apiUrl: 'http://shop.example.com/admin/default/jsonadm', accessToken: 'tok' }),
    ).rejects.toThrow('Aimeos JSON API URL must start with https://')
  })

  it('rejects a host name that resolves to a private address', async () => {
    setDnsResolver(PRIVATE_DNS)
    await expect(
      adapter.exchangeCredentials({ apiUrl: 'https://aimeos.lan.example/jsonadm', accessToken: 'tok' }),
    ).rejects.toThrow(
      'Aimeos JSON API URL must be a publicly reachable host; aimeos.lan.example resolves to a private or reserved address.',
    )
  })

  it('rejects a private IP literal', async () => {
    await expect(
      adapter.exchangeCredentials({ apiUrl: 'https://10.1.2.3/admin/default/jsonadm', accessToken: 'tok' }),
    ).rejects.toThrow(
      'Aimeos JSON API URL must be a publicly reachable host; 10.1.2.3 resolves to a private or reserved address.',
    )
  })

  it('returns the normalised URL and token in the shape the client reads', async () => {
    await expect(
      adapter.exchangeCredentials({
        apiUrl: ' https://shop.example.com/admin/default/jsonadm/ ',
        accessToken: ' tok ',
      }),
    ).resolves.toEqual({
      accessToken: 'tok',
      extra: { apiUrl: 'https://shop.example.com/admin/default/jsonadm' },
    })
  })

  it('sends requests to the collected JSON API URL as-is', async () => {
    const creds = await adapter.exchangeCredentials({
      apiUrl: 'https://shop.example.com/admin/default/jsonadm',
      accessToken: 'tok',
    })
    const defaults = httpDefaults(new AimeosClient(creds))
    expect(defaults.baseURL).toBe('https://shop.example.com/admin/default/jsonadm')
    expect(defaults.headers['Authorization']).toBe('Bearer tok')
  })

  it('still reads a legacy extra.baseUrl connection', () => {
    const defaults = httpDefaults(
      new AimeosClient({ accessToken: 'tok', extra: { baseUrl: 'https://shop.example.com/' } }),
    )
    expect(defaults.baseURL).toBe('https://shop.example.com/api')
  })
})
