/**
 * Marketplacer Connect Link form — per-operator instance host + currency.
 *
 * A Marketplacer connection needs the operator's instance URL, a Seller API
 * key, the marketplace's currency (Marketplacer's API reports none of its
 * own — see transform/product.ts and transform/order.ts) and optional Basic
 * auth for non-production instances.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setDnsResolver } from '@opensteward/shared'
import { CONNECT_FORM } from '../../../../../../src/verticals/ecommerce/adapters/marketplacer/connect-form'

const VALID = {
  instanceUrl: 'https://bestfriendbazaar.com',
  apiKey: 'sk_live_abc123',
  currency: 'AUD',
}

describe('Marketplacer Connect Link form', () => {
  beforeEach(() => {
    vi.stubEnv('OST_ALLOW_PRIVATE_HOSTS', '')
    setDnsResolver(async () => [{ address: '93.184.216.34' }])
  })

  afterEach(() => {
    setDnsResolver(undefined)
    vi.unstubAllEnvs()
  })

  it('declares every value the client reads', () => {
    const fields = CONNECT_FORM.credentialFields()
    const byName = Object.fromEntries(fields.map((f) => [f.name, f]))
    expect(Object.keys(byName).sort()).toEqual([
      'apiKey',
      'basicAuthPassword',
      'basicAuthUsername',
      'currency',
      'instanceUrl',
    ])
    expect(byName['instanceUrl']!.type).toBe('url')
    expect(byName['apiKey']!.type).toBe('password')
    expect(byName['instanceUrl']!.required).toBe(true)
    expect(byName['apiKey']!.required).toBe(true)
    expect(byName['currency']!.required).toBe(true)
    expect(byName['basicAuthUsername']!.required).toBe(false)
    expect(byName['basicAuthPassword']!.required).toBe(false)
  })

  it('rejects a blank API key', async () => {
    await expect(CONNECT_FORM.exchangeCredentials({ ...VALID, apiKey: '  ' })).rejects.toThrow(
      /Seller API key is required/,
    )
  })

  it('rejects a blank currency', async () => {
    await expect(CONNECT_FORM.exchangeCredentials({ ...VALID, currency: '' })).rejects.toThrow(
      /Marketplace currency is required/,
    )
  })

  it('rejects a currency that is not a 3-letter ISO 4217 code', async () => {
    await expect(CONNECT_FORM.exchangeCredentials({ ...VALID, currency: 'Australian Dollars' })).rejects.toThrow(
      /3-letter ISO 4217/,
    )
  })

  it('rejects a non-https instance URL', async () => {
    await expect(
      CONNECT_FORM.exchangeCredentials({ ...VALID, instanceUrl: 'http://bestfriendbazaar.com' }),
    ).rejects.toThrow(/must use https:\/\//)
  })

  it('rejects an instance URL carrying a username or password', async () => {
    await expect(
      CONNECT_FORM.exchangeCredentials({ ...VALID, instanceUrl: 'https://admin:pw@bestfriendbazaar.com' }),
    ).rejects.toThrow(/must not contain a username or password/)
  })

  it('rejects a private IP literal — the API key must not be sent to a private address', async () => {
    await expect(CONNECT_FORM.exchangeCredentials({ ...VALID, instanceUrl: 'https://10.0.0.5' })).rejects.toThrow(
      /must be a public address.*10\.0\.0\.5/,
    )
  })

  it('rejects a hostname that resolves to a private address', async () => {
    setDnsResolver(async () => [{ address: '127.0.0.1' }])
    await expect(
      CONNECT_FORM.exchangeCredentials({ ...VALID, instanceUrl: 'https://internal.example' }),
    ).rejects.toThrow(/must be a public address.*internal\.example/)
  })

  it('requires basic auth username and password together, or neither', async () => {
    await expect(
      CONNECT_FORM.exchangeCredentials({ ...VALID, basicAuthUsername: 'user' }),
    ).rejects.toThrow(/must be supplied together/)
  })

  it('returns normalised credentials in the shape the client reads', async () => {
    const creds = await CONNECT_FORM.exchangeCredentials({
      instanceUrl: 'BestFriendBazaar.com/some/path?x=1',
      apiKey: '  sk_live_abc123 ',
      currency: 'aud',
    })
    expect(creds).toEqual({
      accessToken: 'sk_live_abc123',
      extra: {
        apiKey: 'sk_live_abc123',
        instanceHost: 'https://bestfriendbazaar.com',
        currency: 'AUD',
      },
    })
  })

  it('carries basic auth through to extra when supplied', async () => {
    const creds = await CONNECT_FORM.exchangeCredentials({
      ...VALID,
      basicAuthUsername: 'staging-user',
      basicAuthPassword: 'staging-pass',
    })
    expect(creds.extra).toMatchObject({
      basicAuthUsername: 'staging-user',
      basicAuthPassword: 'staging-pass',
    })
  })
})
