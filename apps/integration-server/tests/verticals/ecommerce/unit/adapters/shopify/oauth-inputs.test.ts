/**
 * Shopify OAuth is per-store: authorize and token endpoints live on
 * `{shop}.myshopify.com`. The adapter used to take `shop` only from its
 * deployment-level config — which nothing could set — so every OAuth start
 * died with `Cannot read properties of undefined (reading 'endsWith')`.
 *
 * Now the store is an `oauthField` the customer supplies at connect time. It
 * reaches `getAuthUrl`, the token exchange, and (via `credentials.extra`) the
 * API client. A deployment-wide `shop` in config remains a fallback.
 */
import { describe, it, expect, vi } from 'vitest'
import axios from 'axios'
import { ShopifyAdapter } from '../../../../../../src/verticals/ecommerce/adapters/shopify/index'
import { normaliseShop } from '../../../../../../src/verticals/ecommerce/adapters/shopify/auth'

const CFG = {
  clientId: 'cid',
  clientSecret: 'sec',
  redirectUri: 'http://localhost:3010/auth/ecommerce/shopify/callback',
}

describe('normaliseShop', () => {
  it.each([
    ['my-store', 'my-store'],
    ['my-store.myshopify.com', 'my-store'],
    ['https://my-store.myshopify.com/', 'my-store'],
    ['https://my-store.myshopify.com/admin', 'my-store'],
    ['  My-Store.MYSHOPIFY.com ', 'my-store'],
  ])('%s → %s', (input, want) => {
    expect(normaliseShop(input)).toBe(want)
  })

  it('rejects blanks with a message that names what is missing', () => {
    expect(() => normaliseShop('')).toThrow(/store/i)
    expect(() => normaliseShop('   ')).toThrow(/store/i)
    expect(() => normaliseShop(undefined)).toThrow(/store/i)
  })

  it('rejects hosts outside myshopify.com — the token exchange must not go elsewhere', () => {
    expect(() => normaliseShop('evil.example.com')).toThrow(/myshopify\.com/)
    expect(() => normaliseShop('my-store.myshopify.com.evil.example')).toThrow(/myshopify\.com/)
  })
})

describe('ShopifyAdapter with a per-customer store', () => {
  const adapter = new ShopifyAdapter(CFG)

  it('declares the store as a required oauthField', () => {
    expect(adapter.oauthFields()).toEqual([
      expect.objectContaining({ name: 'shop', required: true, type: 'text' }),
    ])
  })

  it('builds the authorize URL on the customer’s store', () => {
    const u = new URL(adapter.getAuthUrl('st', undefined, undefined, { shop: 'acme.myshopify.com' }))
    expect(u.host).toBe('acme.myshopify.com')
    expect(u.pathname).toBe('/admin/oauth/authorize')
    expect(u.searchParams.get('state')).toBe('st')
    expect(u.searchParams.get('client_id')).toBe('cid')
  })

  it('fails with a readable message, not a TypeError, when no store is known at all', () => {
    expect(() => adapter.getAuthUrl('st')).toThrow(/store/i)
  })

  it('exchanges against that store and records it in extra', async () => {
    const post = vi
      .spyOn(axios, 'post')
      .mockResolvedValue({ data: { access_token: 'tok', scope: 'read_products' } })
    try {
      const creds = await adapter.exchangeCodeWithInputs('code', CFG.redirectUri, { shop: 'Acme' })
      expect(post.mock.calls[0][0]).toBe('https://acme.myshopify.com/admin/oauth/access_token')
      expect(creds).toEqual({ accessToken: 'tok', scope: 'read_products', extra: { shop: 'acme' } })
    } finally {
      post.mockRestore()
    }
  })

  it('falls back to the deployment-wide store when one is configured', () => {
    const fixed = new ShopifyAdapter({ ...CFG, shop: 'fixed' })
    expect(new URL(fixed.getAuthUrl('st')).host).toBe('fixed.myshopify.com')
  })

  it('calls the API on the store stored with the credentials', async () => {
    const get = vi.spyOn(axios, 'create')
    try {
      await adapter
        .listLocations({ accessToken: 'tok', extra: { shop: 'acme' } }, {})
        .catch(() => undefined) // the request itself is not under test
      const baseURL = (get.mock.calls.at(-1)?.[0] as { baseURL?: string } | undefined)?.baseURL
      expect(baseURL).toMatch(/^https:\/\/acme\.myshopify\.com\/admin\/api\//)
    } finally {
      get.mockRestore()
    }
  })
})
