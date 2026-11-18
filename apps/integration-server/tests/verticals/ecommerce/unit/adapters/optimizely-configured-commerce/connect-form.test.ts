/**
 * Optimizely Configured Commerce Connect Link form — credential exchange
 * and instance-URL host confinement (mirrors woocommerce's
 * per-customer-host tests, since the password grant sends the API user's
 * password to this instance on every refresh). Docs:
 * https://docs.developers.optimizely.com/configured-commerce/reference/getting-started-with-the-b2b-commerce-rest-apis
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import { setDnsResolver } from '@opensteward/shared'
import { OptimizelyConfiguredCommerceAdapter } from '../../../../../../src/verticals/ecommerce/adapters/optimizely-configured-commerce/index'

const VALID = {
  instance: 'https://mystore.insitesandbox.com',
  username: 'api-user',
  password: 'hunter2',
}

describe('Optimizely Connect Link form', () => {
  let adapter: OptimizelyConfiguredCommerceAdapter

  beforeEach(() => {
    vi.stubEnv('OST_ALLOW_PRIVATE_HOSTS', '')
    setDnsResolver(async () => [{ address: '93.184.216.34' }])
    adapter = new OptimizelyConfiguredCommerceAdapter()
  })

  afterEach(() => {
    setDnsResolver(undefined)
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('declares instance/username/password, secrets masked', () => {
    const fields = adapter.credentialFields()
    const byName = Object.fromEntries(fields.map((f) => [f.name, f]))
    expect(Object.keys(byName).sort()).toEqual(['instance', 'password', 'username'])
    expect(byName['instance']!.type).toBe('url')
    expect(byName['password']!.type).toBe('password')
    for (const f of fields) expect(f.required).toBe(true)
  })

  it.each([
    ['instance', /Instance URL is required/],
    ['username', /API user username is required/],
    ['password', /API user password is required/],
  ])('rejects a blank %s', async (field, message) => {
    await expect(adapter.exchangeCredentials({ ...VALID, [field]: '   ' })).rejects.toThrow(
      message,
    )
  })

  it('rejects a non-https instance URL', async () => {
    await expect(
      adapter.exchangeCredentials({ ...VALID, instance: 'http://mystore.insitesandbox.com' }),
    ).rejects.toThrow(/Instance URL must use https/)
  })

  it('rejects an instance URL carrying a username or password', async () => {
    await expect(
      adapter.exchangeCredentials({ ...VALID, instance: 'https://admin:pw@mystore.insitesandbox.com' }),
    ).rejects.toThrow(/Instance URL must not contain a username or password/)
  })

  it('rejects a private IP literal', async () => {
    await expect(
      adapter.exchangeCredentials({ ...VALID, instance: 'https://10.0.0.5' }),
    ).rejects.toThrow(/Instance URL must be a public address.*10\.0\.0\.5/)
  })

  it('rejects a hostname that resolves to a private address', async () => {
    setDnsResolver(async () => [{ address: '127.0.0.1' }])
    await expect(
      adapter.exchangeCredentials({ ...VALID, instance: 'https://mystore.internal.example' }),
    ).rejects.toThrow(/Instance URL must be a public address/)
  })

  it('mints a token via the password grant and stores what refreshCredentials needs', async () => {
    const post = vi
      .spyOn(axios, 'post')
      .mockResolvedValue({ data: { access_token: 'tok_1', expires_in: 3600 } })

    const creds = await adapter.exchangeCredentials(VALID)

    expect(post).toHaveBeenCalledWith(
      'https://mystore.insitesandbox.com/identity/connect/token',
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: expect.stringMatching(/^Basic /),
          'Content-Type': 'application/x-www-form-urlencoded',
        }),
      }),
    )
    expect(creds.accessToken).toBe('tok_1')
    expect(creds.extra).toEqual({
      instance: 'https://mystore.insitesandbox.com',
      username: 'api-user',
      password: 'hunter2',
    })
  })

  it('drops path/query/fragment from a pasted instance URL, keeping only the origin', async () => {
    vi.spyOn(axios, 'post').mockResolvedValue({ data: { access_token: 'tok', expires_in: 3600 } })
    const creds = await adapter.exchangeCredentials({
      ...VALID,
      instance: 'MyStore.InsiteSandbox.com/storefront/?utm=1#x',
    })
    expect(creds.extra?.['instance']).toBe('https://mystore.insitesandbox.com')
  })
})
