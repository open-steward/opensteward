/**
 * BigCommerce identifies the store in every API URL
 * (`https://api.bigcommerce.com/stores/{store_hash}/v3`), and the store is the
 * customer's — not the deployment's. BigCommerce's authorize and token
 * endpoints are global, and the token response names the store in `context`
 * (`stores/{store_hash}`).
 *
 * The exchange used to parse that hash but return it as a bare top-level
 * `storeHash`, which the credential store does not persist, while the API
 * client read `storeHash` from deployment config — which the admin UI cannot
 * set. Every customer connection therefore called `/stores/undefined/v3`.
 *
 * Now the hash is stored in `credentials.extra.storeHash` and the client reads
 * it from there.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { BigCommerceAdapter } from '../../../../../../src/verticals/ecommerce/adapters/bigcommerce/index'

const CFG = {
  clientId: 'cid',
  clientSecret: 'sec',
  redirectUri: 'http://localhost:3010/auth/ecommerce/bigcommerce/callback',
}

afterEach(() => {
  vi.restoreAllMocks()
})

/** Stand-in for an axios instance: records nothing, reaches no network. */
function offlineCreate() {
  const fail = () => Promise.reject(new Error('offline'))
  return vi
    .spyOn(axios, 'create')
    .mockReturnValue({ get: fail, post: fail, put: fail, delete: fail } as never)
}

describe('BigCommerceAdapter store hash from the token response', () => {
  // No deployment-level storeHash: that is what a Connect Link deployment has.
  const adapter = new BigCommerceAdapter(CFG)

  it('needs no pre-redirect input: authorize is global', () => {
    expect((adapter as { oauthFields?: unknown }).oauthFields).toBeUndefined()
    const u = new URL(adapter.getAuthUrl('st'))
    expect(u.host).toBe('login.bigcommerce.com')
    expect(u.searchParams.get('state')).toBe('st')
  })

  it('stores the hash from `context` in extra, not as a dropped top-level field', async () => {
    const post = vi.spyOn(axios, 'post').mockResolvedValue({
      data: { access_token: 'tok', scope: 'store_v2_orders', context: 'stores/abc123' },
    })
    const creds = await adapter.exchangeCode('code', CFG.redirectUri)
    expect(post.mock.calls[0]![0]).toBe('https://login.bigcommerce.com/oauth2/token')
    expect(creds).toEqual({
      accessToken: 'tok',
      scope: 'store_v2_orders',
      extra: { storeHash: 'abc123' },
    })
    expect(creds).not.toHaveProperty('storeHash')
  })

  it('rejects a token response without a usable store context', async () => {
    vi.spyOn(axios, 'post').mockResolvedValue({ data: { access_token: 'tok' } })
    await expect(adapter.exchangeCode('code', CFG.redirectUri)).rejects.toThrow(
      'BigCommerce token response did not identify the store (missing or malformed `context`).',
    )
    vi.spyOn(axios, 'post').mockResolvedValue({
      data: { access_token: 'tok', context: 'stores/../../admin' },
    })
    await expect(adapter.exchangeCode('code', CFG.redirectUri)).rejects.toThrow(
      'BigCommerce token response did not identify the store (missing or malformed `context`).',
    )
  })

  it('calls the API on the store stored with the credentials', async () => {
    const create = offlineCreate()
    await adapter
      .listProducts({ accessToken: 'tok', extra: { storeHash: 'abc123' } }, {})
      .catch(() => undefined) // the request itself is not under test
    const baseURLs = create.mock.calls.map((c) => (c[0] as { baseURL?: string } | undefined)?.baseURL)
    expect(baseURLs).toContain('https://api.bigcommerce.com/stores/abc123/v3')
    expect(baseURLs).toContain('https://api.bigcommerce.com/stores/abc123/v2')
  })

  it('fails with a readable message, before any request, when no store is known', async () => {
    const create = offlineCreate()
    await expect(adapter.listProducts({ accessToken: 'tok' }, {})).rejects.toThrow(
      'BigCommerce store hash is missing from the connection — reconnect the store.',
    )
    expect(create).not.toHaveBeenCalled()
  })

  it('refuses a malformed stored hash rather than splicing it into the URL', async () => {
    const create = offlineCreate()
    await expect(
      adapter.listProducts({ accessToken: 'tok', extra: { storeHash: 'abc/../x' } }, {}),
    ).rejects.toThrow('BigCommerce store hash is malformed: expected letters and digits only.')
    expect(create).not.toHaveBeenCalled()
  })

  it('still honours a deployment-wide storeHash when one is configured', async () => {
    const fixed = new BigCommerceAdapter({ ...CFG, storeHash: 'fixed1' })
    const create = offlineCreate()
    await fixed.listProducts({ accessToken: 'tok' }, {}).catch(() => undefined)
    const baseURLs = create.mock.calls.map((c) => (c[0] as { baseURL?: string } | undefined)?.baseURL)
    expect(baseURLs).toContain('https://api.bigcommerce.com/stores/fixed1/v3')
  })
})
