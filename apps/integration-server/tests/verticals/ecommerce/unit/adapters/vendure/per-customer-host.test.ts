/**
 * Vendure is self-hosted: the client posts to the merchant's own Admin API URL
 * (`credentials.extra.apiUrl`) with a bearer token, optionally channel-scoped
 * via `extra.channelToken`. The Connect Link form must collect all three and
 * only accept a public https host.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { setDnsResolver } from '@opensteward/shared'
import { VendureAdapter } from '../../../../../../src/verticals/ecommerce/adapters/vendure'
import { VendureClient } from '../../../../../../src/verticals/ecommerce/adapters/vendure/client'

const PUBLIC_DNS = async () => [{ address: '93.184.216.34' }]
const PRIVATE_DNS = async () => [{ address: '172.16.5.5' }]

function clientState(client: VendureClient): { apiUrl: string; token: string; channelToken: string } {
  return client as unknown as { apiUrl: string; token: string; channelToken: string }
}

describe('Vendure Connect Link form', () => {
  const adapter = new VendureAdapter({ apiUrl: '', appToken: '' })

  beforeEach(() => {
    delete process.env['OST_ALLOW_PRIVATE_HOSTS']
    setDnsResolver(PUBLIC_DNS)
  })
  afterEach(() => setDnsResolver(undefined))

  it('declares the Admin API URL, token and optional channel token the client reads', () => {
    const byName = Object.fromEntries(adapter.credentialFields().map((f) => [f.name, f]))
    expect(byName['apiUrl']).toMatchObject({ type: 'url', required: true })
    expect(byName['apiUrl']?.placeholder).toMatch(/^https:\/\//)
    expect(byName['apiUrl']?.helpText).toBeTruthy()
    expect(byName['accessToken']).toMatchObject({ type: 'password', required: true })
    expect(byName['accessToken']?.helpText).toBeTruthy()
    expect(byName['channelToken']).toMatchObject({ type: 'text', required: false })
    expect(byName['channelToken']?.helpText).toBeTruthy()
  })

  it('rejects a blank Admin API URL', async () => {
    await expect(
      adapter.exchangeCredentials({ apiUrl: '', accessToken: 'tok' }),
    ).rejects.toThrow('Admin API URL is required.')
  })

  it('rejects a blank token', async () => {
    await expect(
      adapter.exchangeCredentials({ apiUrl: 'https://shop.example.com/admin-api', accessToken: ' ' }),
    ).rejects.toThrow('Admin API token is required.')
  })

  it('rejects a value that is not a URL', async () => {
    await expect(
      adapter.exchangeCredentials({ apiUrl: 'shop.example.com admin', accessToken: 'tok' }),
    ).rejects.toThrow('Admin API URL must be a full URL')
  })

  it('rejects a non-https URL', async () => {
    await expect(
      adapter.exchangeCredentials({ apiUrl: 'http://shop.example.com/admin-api', accessToken: 'tok' }),
    ).rejects.toThrow('Admin API URL must start with https://')
  })

  it('rejects the Shop API endpoint', async () => {
    await expect(
      adapter.exchangeCredentials({ apiUrl: 'https://shop.example.com/shop-api', accessToken: 'tok' }),
    ).rejects.toThrow('Admin API URL must point at the Admin API')
  })

  it('rejects a host name that resolves to a private address', async () => {
    setDnsResolver(PRIVATE_DNS)
    await expect(
      adapter.exchangeCredentials({ apiUrl: 'https://vendure.corp.example/admin-api', accessToken: 'tok' }),
    ).rejects.toThrow(
      'Admin API URL must be a publicly reachable host; vendure.corp.example resolves to a private or reserved address.',
    )
  })

  it('rejects a private IP literal', async () => {
    await expect(
      adapter.exchangeCredentials({ apiUrl: 'https://[::1]/admin-api', accessToken: 'tok' }),
    ).rejects.toThrow(
      'Admin API URL must be a publicly reachable host; ::1 resolves to a private or reserved address.',
    )
  })

  it('appends /admin-api to a bare server URL and trims the token', async () => {
    await expect(
      adapter.exchangeCredentials({ apiUrl: 'https://shop.example.com/', accessToken: ' tok ' }),
    ).resolves.toEqual({ accessToken: 'tok', extra: { apiUrl: 'https://shop.example.com/admin-api' } })
  })

  it('keeps an explicit Admin API path and stores the channel token', async () => {
    await expect(
      adapter.exchangeCredentials({
        apiUrl: 'https://api.example.com/admin-api/',
        accessToken: 'tok',
        channelToken: ' eu-channel ',
      }),
    ).resolves.toEqual({
      accessToken: 'tok',
      extra: { apiUrl: 'https://api.example.com/admin-api', channelToken: 'eu-channel' },
    })
  })

  it('builds the client from the collected credentials', async () => {
    const creds = await adapter.exchangeCredentials({
      apiUrl: 'https://shop.example.com/admin-api',
      accessToken: 'tok',
      channelToken: 'eu-channel',
    })
    expect(clientState(new VendureClient(creds))).toMatchObject({
      apiUrl: 'https://shop.example.com/admin-api',
      token: 'tok',
      channelToken: 'eu-channel',
    })
  })
})
