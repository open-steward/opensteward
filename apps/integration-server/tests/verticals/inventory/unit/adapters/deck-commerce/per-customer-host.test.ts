/**
 * Deck Commerce signs every request with a site API key (per-request SHA-256
 * token) and sends it to a tenant-specific API base URL. Both are collected by
 * `credentialFields()`, which the Connect page renders once the platform is
 * relabelled from `oauth2` to `api_key` — there is no OAuth flow at all.
 *
 * The base URL is free-form and every call to it carries a credential-derived
 * token, so it must be https and must resolve to a public address before any
 * request is made.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import { setDnsResolver } from '@opensteward/shared'
import { DeckCommerceAdapter } from '../../../../../../src/verticals/inventory/adapters/deck-commerce/index'
import { normaliseDeckApiBaseUrl } from '../../../../../../src/verticals/inventory/adapters/deck-commerce/auth'

const PUBLIC_DNS = async () => [{ address: '93.184.216.34' }]
const PRIVATE_DNS = async () => [{ address: '10.0.0.5' }]

const FIELDS = {
  apiBaseUrl: 'https://Acme.DeckCommerce.com/api/',
  siteCode: 'ACME',
  siteApiKey: 'key',
}
const STORED = {
  accessToken: 'key',
  extra: { siteCode: 'ACME', apiBaseUrl: 'https://acme.deckcommerce.com/api' },
}

beforeEach(() => {
  vi.stubEnv('OST_ALLOW_PRIVATE_HOSTS', '')
  setDnsResolver(PUBLIC_DNS)
})

afterEach(() => {
  setDnsResolver(undefined)
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('normaliseDeckApiBaseUrl', () => {
  it.each([
    ['https://acme.deckcommerce.com/api/', 'https://acme.deckcommerce.com/api'],
    ['acme.deckcommerce.com/api', 'https://acme.deckcommerce.com/api'],
    [' https://ACME.deckcommerce.com/api?x=1#frag ', 'https://acme.deckcommerce.com/api'],
  ])('%s → %s', (input, want) => {
    expect(normaliseDeckApiBaseUrl(input)).toBe(want)
  })

  it('rejects blanks with a message naming the field', () => {
    for (const v of ['', '   ', undefined]) {
      expect(() => normaliseDeckApiBaseUrl(v)).toThrow(/Deck Commerce API base URL is required/)
    }
  })

  it('rejects http, embedded credentials, and non-URLs', () => {
    expect(() => normaliseDeckApiBaseUrl('http://acme.deckcommerce.com/api')).toThrow(
      /Deck Commerce API base URL must use https/,
    )
    expect(() => normaliseDeckApiBaseUrl('https://u:p@acme.deckcommerce.com/api')).toThrow(
      /Deck Commerce API base URL must not contain credentials/,
    )
    expect(() => normaliseDeckApiBaseUrl('not a url')).toThrow(
      /Deck Commerce API base URL is not a valid URL/,
    )
  })
})

describe('DeckCommerceAdapter with a per-tenant API base URL', () => {
  const adapter = new DeckCommerceAdapter({ inventoryFeedName: 'FEED' })

  it('declares the base URL on the credential form (renders once relabelled api_key)', () => {
    expect(adapter.credentialFields()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'apiBaseUrl', required: true, type: 'url' }),
        expect.objectContaining({ name: 'siteCode', required: true }),
        expect.objectContaining({ name: 'siteApiKey', required: true, type: 'password' }),
      ]),
    )
  })

  it('stores the normalised base URL in extra', async () => {
    const creds = await adapter.exchangeCredentials(FIELDS)
    expect(creds).toEqual(STORED)
  })

  it.each([
    [{ ...FIELDS, apiBaseUrl: '' }, /Deck Commerce API base URL is required/],
    [
      { ...FIELDS, apiBaseUrl: 'http://acme.deckcommerce.com/api' },
      /Deck Commerce API base URL must use https/,
    ],
    [{ ...FIELDS, siteCode: ' ' }, /Site code is required/],
    [{ ...FIELDS, siteApiKey: '' }, /Site API key is required/],
  ])('rejects %o', async (fields, message) => {
    await expect(adapter.exchangeCredentials(fields)).rejects.toThrow(message)
  })

  it('refuses a base URL that resolves to a private address', async () => {
    setDnsResolver(PRIVATE_DNS)
    await expect(adapter.exchangeCredentials(FIELDS)).rejects.toThrow(
      /SSRF block: acme\.deckcommerce\.com/,
    )
  })

  it('calls the API on the base URL stored with the credentials', async () => {
    const post = vi.spyOn(axios, 'post').mockResolvedValue({ data: { Items: [] } })
    await adapter.getStockLevel(STORED, 'SKU-1').catch(() => undefined)
    expect(post).toHaveBeenCalledTimes(1)
    expect(post.mock.calls[0]![0]).toBe('https://acme.deckcommerce.com/api/api/piminventorylookup')
  })

  it('sends no signed request to a stored base URL that resolves privately', async () => {
    setDnsResolver(PRIVATE_DNS)
    const post = vi.spyOn(axios, 'post').mockResolvedValue({ data: { Items: [] } })
    await expect(adapter.getStockLevel(STORED, 'SKU-1')).rejects.toThrow(
      /SSRF block: acme\.deckcommerce\.com/,
    )
    expect(post).not.toHaveBeenCalled()
  })

  it('sends no signed request to a stored plain-http base URL', async () => {
    const post = vi.spyOn(axios, 'post').mockResolvedValue({ data: { Items: [] } })
    await expect(
      adapter.getStockLevel(
        { ...STORED, extra: { ...STORED.extra, apiBaseUrl: 'http://acme.deckcommerce.com/api' } },
        'SKU-1',
      ),
    ).rejects.toThrow(/Deck Commerce API base URL must use https/)
    expect(post).not.toHaveBeenCalled()
  })
})
