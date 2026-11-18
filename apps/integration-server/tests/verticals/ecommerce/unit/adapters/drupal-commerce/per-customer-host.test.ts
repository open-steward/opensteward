/**
 * The Drupal Commerce client needs the merchant's own site URL
 * (`credentials.extra.baseUrl`) as well as a token. The Connect Link form must
 * collect both, and — because the token is sent to that host on every request —
 * only accept a public https host.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setDnsResolver } from '@opensteward/shared'
import { DrupalCommerceAdapter } from '../../../../../../src/verticals/ecommerce/adapters/drupal-commerce'
import { DrupalCommerceClient } from '../../../../../../src/verticals/ecommerce/adapters/drupal-commerce/client'

const PUBLIC_DNS = async () => [{ address: '93.184.216.34' }]
const PRIVATE_DNS = async () => [{ address: '10.0.0.7' }]

function httpDefaults(client: unknown): { baseURL?: string; headers: Record<string, unknown> } {
  return (client as { http: { defaults: { baseURL?: string; headers: Record<string, unknown> } } })
    .http.defaults
}

describe('Drupal Commerce Connect Link form', () => {
  const adapter = new DrupalCommerceAdapter()

  beforeEach(() => {
    delete process.env['OST_ALLOW_PRIVATE_HOSTS']
    setDnsResolver(PUBLIC_DNS)
  })
  afterEach(() => setDnsResolver(undefined))

  it('declares the site URL and the access token the client reads', () => {
    const byName = Object.fromEntries(adapter.credentialFields().map((f) => [f.name, f]))
    expect(byName['baseUrl']).toMatchObject({ type: 'url', required: true })
    expect(byName['baseUrl']?.placeholder).toMatch(/^https:\/\//)
    expect(byName['baseUrl']?.helpText).toBeTruthy()
    expect(byName['accessToken']).toMatchObject({ type: 'password', required: true })
    expect(byName['accessToken']?.helpText).toBeTruthy()
  })

  it('rejects a blank site URL', async () => {
    await expect(
      adapter.exchangeCredentials({ baseUrl: '  ', accessToken: 'tok' }),
    ).rejects.toThrow('Drupal site URL is required.')
  })

  it('rejects a blank access token', async () => {
    await expect(
      adapter.exchangeCredentials({ baseUrl: 'https://shop.example.com', accessToken: ' ' }),
    ).rejects.toThrow('Access token is required.')
  })

  it('rejects a value that is not a URL', async () => {
    await expect(
      adapter.exchangeCredentials({ baseUrl: 'shop example com', accessToken: 'tok' }),
    ).rejects.toThrow('Drupal site URL must be a full URL')
  })

  it('rejects a non-https URL', async () => {
    await expect(
      adapter.exchangeCredentials({ baseUrl: 'http://shop.example.com', accessToken: 'tok' }),
    ).rejects.toThrow('Drupal site URL must start with https://')
  })

  it('rejects a host name that resolves to a private address', async () => {
    setDnsResolver(PRIVATE_DNS)
    await expect(
      adapter.exchangeCredentials({ baseUrl: 'https://drupal.internal.example', accessToken: 'tok' }),
    ).rejects.toThrow(
      'Drupal site URL must be a publicly reachable host; drupal.internal.example resolves to a private or reserved address.',
    )
  })

  it('rejects a private IP literal', async () => {
    await expect(
      adapter.exchangeCredentials({ baseUrl: 'https://127.0.0.1', accessToken: 'tok' }),
    ).rejects.toThrow(
      'Drupal site URL must be a publicly reachable host; 127.0.0.1 resolves to a private or reserved address.',
    )
  })

  it('returns the normalised site URL and token in the shape the client reads', async () => {
    await expect(
      adapter.exchangeCredentials({ baseUrl: ' https://shop.example.com/jsonapi/ ', accessToken: ' tok ' }),
    ).resolves.toEqual({ accessToken: 'tok', extra: { baseUrl: 'https://shop.example.com' } })
  })

  it('keeps a Drupal site installed under a sub-path', async () => {
    const creds = await adapter.exchangeCredentials({
      baseUrl: 'https://example.com/store/',
      accessToken: 'tok',
    })
    expect(creds.extra).toEqual({ baseUrl: 'https://example.com/store' })
  })

  it('points the client at the JSON:API root of the collected site', async () => {
    const creds = await adapter.exchangeCredentials({
      baseUrl: 'https://shop.example.com',
      accessToken: 'tok',
    })
    const defaults = httpDefaults(new DrupalCommerceClient(creds))
    expect(defaults.baseURL).toBe('https://shop.example.com/jsonapi')
    expect(defaults.headers['Authorization']).toBe('Bearer tok')
  })
})
