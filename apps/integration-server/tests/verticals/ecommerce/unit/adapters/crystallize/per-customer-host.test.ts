/**
 * Every Crystallize API URL carries the tenant identifier
 * (`https://api.crystallize.com/{tenant}/catalogue`), and the tenant is the
 * customer's. Crystallize has no OAuth flow for third-party apps: API access
 * is an access-token ID + secret pair created in the Crystallize app and sent
 * as `X-Crystallize-Access-Token-Id` / `X-Crystallize-Access-Token-Secret`.
 *
 * The adapter read the tenant from deployment config (which the admin UI
 * cannot set), "authorized" by linking to the PIM settings page, and treated
 * the returned code as the token. It also sent the token as its own ID and
 * never sent a secret. The tenant, token ID and secret now come from the
 * credential form, and the client sends them as Crystallize documents.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { CrystallizeAdapter } from '../../../../../../src/verticals/ecommerce/adapters/crystallize/index'

afterEach(() => {
  vi.restoreAllMocks()
})

const FORM = { tenantIdentifier: 'acme', accessTokenId: 'tid', accessTokenSecret: 'tsecret' }

describe('CrystallizeAdapter per-customer tenant', () => {
  const adapter = new CrystallizeAdapter()

  it('collects tenant identifier, token ID and token secret on the credential form', () => {
    expect(adapter.credentialFields().map((f) => [f.name, f.type, f.required])).toEqual([
      ['tenantIdentifier', 'text', true],
      ['accessTokenId', 'text', true],
      ['accessTokenSecret', 'password', true],
    ])
  })

  it('has no browser-redirect flow to start', () => {
    expect(() => adapter.getAuthUrl('st')).toThrow(
      'Crystallize uses access tokens created in the Crystallize app: use the credential form (tenant identifier, access token ID and secret), not a browser redirect.',
    )
  })

  it('stores the tenant and token ID in extra and the secret as the access token', async () => {
    const creds = await adapter.exchangeCredentials({
      tenantIdentifier: ' @acme-shop ',
      accessTokenId: ' tid ',
      accessTokenSecret: 'tsecret',
    })
    expect(creds).toEqual({
      accessToken: 'tsecret',
      extra: { tenantIdentifier: 'acme-shop', accessTokenId: 'tid' },
    })
  })

  it('rejects a blank or path-unsafe tenant, and a missing token, with specific messages', async () => {
    await expect(adapter.exchangeCredentials({ ...FORM, tenantIdentifier: '  ' })).rejects.toThrow(
      'Crystallize tenant identifier is required.',
    )
    await expect(
      adapter.exchangeCredentials({ ...FORM, tenantIdentifier: 'acme/../other' }),
    ).rejects.toThrow(
      'Crystallize tenant identifier must contain only letters, digits, hyphens and underscores.',
    )
    await expect(adapter.exchangeCredentials({ ...FORM, accessTokenSecret: '' })).rejects.toThrow(
      'Crystallize access token ID and secret are required.',
    )
  })

  it('calls the tenant’s API with the token ID and secret headers', async () => {
    const post = vi.spyOn(axios, 'post').mockRejectedValue(new Error('offline'))
    await adapter
      .listProducts({ accessToken: 'tsecret', extra: { tenantIdentifier: 'acme', accessTokenId: 'tid' } }, {})
      .catch(() => undefined)
    expect(post).toHaveBeenCalled()
    const [url, , config] = post.mock.calls[0]!
    expect(String(url).startsWith('https://api.crystallize.com/acme/')).toBe(true)
    const headers = (config as { headers: Record<string, string> }).headers
    expect(headers['X-Crystallize-Access-Token-Id']).toBe('tid')
    expect(headers['X-Crystallize-Access-Token-Secret']).toBe('tsecret')
    expect(headers['Authorization']).toBeUndefined()
  })

  it('refuses a path-unsafe stored tenant before any request', async () => {
    const post = vi.spyOn(axios, 'post')
    await expect(
      adapter.listProducts(
        { accessToken: 'tsecret', extra: { tenantIdentifier: 'acme/../x', accessTokenId: 'tid' } },
        {},
      ),
    ).rejects.toThrow(
      'Crystallize tenant identifier must contain only letters, digits, hyphens and underscores.',
    )
    expect(post).not.toHaveBeenCalled()
  })
})
