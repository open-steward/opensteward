/**
 * Spree is self-hosted: the token endpoint and the Platform API live on the
 * store's own host, and the OAuth application (client ID + secret) is created
 * in that store's admin — so all three are the customer's.
 *
 * The adapter read them from deployment config (which the admin UI cannot set)
 * and, lacking one, built an authorize URL on the placeholder
 * `https://your-spree-store.example`. Spree's Platform API authenticates with a
 * client_credentials grant (`scope=admin`), so the store URL, client ID and
 * secret now come from the credential form and are stored in
 * `credentials.extra`. The URL receives the client secret, so it must be https
 * and must not resolve to a private address.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import axios from 'axios'
import { setDnsResolver, SsrfBlockedError } from '@opensteward/shared'
import { SpreeAdapter } from '../../../../../../src/verticals/ecommerce/adapters/spree/index'

const FIELDS = { clientId: 'cid', clientSecret: 'sec' }

beforeEach(() => {
  setDnsResolver(async () => [{ address: '93.184.216.34' }])
})

afterEach(() => {
  vi.restoreAllMocks()
  setDnsResolver(undefined)
})

describe('SpreeAdapter per-customer store', () => {
  const adapter = new SpreeAdapter()

  it('collects store URL, client ID and secret on the credential form', () => {
    expect(adapter.credentialFields().map((f) => [f.name, f.required])).toEqual([
      ['baseUrl', true],
      ['clientId', true],
      ['clientSecret', true],
    ])
  })

  it('does not build an authorize URL on a placeholder host', () => {
    expect(() => adapter.getAuthUrl('st')).toThrow(
      'Spree connects with an OAuth client-credentials application: use the credential form (store URL, client ID, client secret), not a browser redirect.',
    )
  })

  it('runs client_credentials on the customer store and stores the normalised origin', async () => {
    const post = vi.spyOn(axios, 'post').mockResolvedValue({
      data: { access_token: 'tok', token_type: 'Bearer', expires_in: 7200 },
    })
    const creds = await adapter.exchangeCredentials({
      ...FIELDS,
      baseUrl: '  https://Shop.Example.com/admin/products?x=1 ',
    })
    expect(post).toHaveBeenCalledTimes(1)
    expect(post.mock.calls[0]![0]).toBe('https://shop.example.com/spree_oauth/token')
    expect(post.mock.calls[0]![1]).toEqual({
      grant_type: 'client_credentials',
      client_id: 'cid',
      client_secret: 'sec',
      scope: 'admin',
    })
    expect(creds.accessToken).toBe('tok')
    expect(creds.extra).toEqual({
      baseUrl: 'https://shop.example.com',
      clientId: 'cid',
      clientSecret: 'sec',
    })
  })

  it('rejects blank, invalid and non-https URLs, and missing secrets, before any request', async () => {
    const post = vi.spyOn(axios, 'post')
    await expect(adapter.exchangeCredentials({ ...FIELDS, baseUrl: ' ' })).rejects.toThrow(
      'Spree store URL is required (e.g. https://shop.example.com).',
    )
    await expect(adapter.exchangeCredentials({ ...FIELDS, baseUrl: 'https://' })).rejects.toThrow(
      'Spree store URL is not a valid URL.',
    )
    await expect(
      adapter.exchangeCredentials({ ...FIELDS, baseUrl: 'http://shop.example.com' }),
    ).rejects.toThrow('Spree store URL must use https://.')
    await expect(
      adapter.exchangeCredentials({ baseUrl: 'https://shop.example.com', clientId: 'cid', clientSecret: '' }),
    ).rejects.toThrow('Spree client ID and client secret are required.')
    expect(post).not.toHaveBeenCalled()
  })

  it('refuses a store that resolves to a private address before sending the secret', async () => {
    setDnsResolver(async () => [{ address: '192.168.1.10' }])
    const post = vi.spyOn(axios, 'post')
    await expect(
      adapter.exchangeCredentials({ ...FIELDS, baseUrl: 'https://spree.internal.example' }),
    ).rejects.toBeInstanceOf(SsrfBlockedError)
    await expect(
      adapter.refreshCredentials({
        accessToken: 'old',
        extra: { baseUrl: 'https://spree.internal.example', clientId: 'cid', clientSecret: 'sec' },
      }),
    ).rejects.toBeInstanceOf(SsrfBlockedError)
    expect(post).not.toHaveBeenCalled()
  })

  it('calls the Platform API on the store stored with the credentials', async () => {
    const fail = () => Promise.reject(new Error('offline'))
    const create = vi
      .spyOn(axios, 'create')
      .mockReturnValue({ get: fail, post: fail, patch: fail, delete: fail } as never)
    await adapter
      .listProducts({ accessToken: 'tok', extra: { baseUrl: 'https://shop.example.com' } }, {})
      .catch(() => undefined)
    expect((create.mock.calls[0]![0] as { baseURL?: string }).baseURL).toBe(
      'https://shop.example.com/api/v2/platform',
    )
  })
})
