/**
 * ikas Private App credentials — pinned against
 * https://ikas.dev/docs/api/getting-started/authentication: a client_credentials
 * POST, form-encoded with client_id/client_secret in the body, to
 * https://<store_name>.myikas.com/api/admin/oauth/token.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { normaliseStoreName } from '../../../../../../src/verticals/ecommerce/adapters/ikas/constants'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const ADAPTER = '../../../../../../src/verticals/ecommerce/adapters/ikas'

/**
 * The shared credential form captures globalThis.fetch when the adapter module
 * loads, so the stub must be in place before a fresh import.
 */
async function loadWithFetch(fetchMock: unknown) {
  vi.stubGlobal('fetch', fetchMock)
  vi.resetModules()
  return (await import(
    ADAPTER
  )) as typeof import('../../../../../../src/verticals/ecommerce/adapters/ikas')
}

describe('IkasAdapter credential form', () => {
  it('asks for client id, client secret and store name', async () => {
    const { IkasAdapter } = await loadWithFetch(vi.fn())
    const names = new IkasAdapter().credentialFields().map((f) => f.name)
    expect(names).toEqual(['clientId', 'clientSecret', 'storeName'])
  })

  it("exchanges on the store's own host and keeps what refresh needs", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(
          JSON.stringify({ access_token: 'at-1', token_type: 'Bearer', expires_in: 14400 }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        ),
    )
    const { IkasAdapter } = await loadWithFetch(fetchMock)

    const creds = await new IkasAdapter().exchangeCredentials({
      clientId: 'cid',
      clientSecret: 'sec',
      storeName: 'https://MyStore.myikas.com/admin',
    })

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe('https://mystore.myikas.com/api/admin/oauth/token')
    expect(init.method).toBe('POST')
    const body = new URLSearchParams(String(init.body))
    expect(body.get('grant_type')).toBe('client_credentials')
    expect(body.get('client_id')).toBe('cid')
    expect(body.get('client_secret')).toBe('sec')
    expect(creds.accessToken).toBe('at-1')
    expect(creds.extra).toEqual({ clientId: 'cid', clientSecret: 'sec', storeName: 'mystore' })
  })

  it('rejects a store name that is not a single subdomain label', async () => {
    const fetchMock = vi.fn()
    const { IkasAdapter } = await loadWithFetch(fetchMock)
    await expect(
      new IkasAdapter().exchangeCredentials({
        clientId: 'cid',
        clientSecret: 'sec',
        storeName: 'evil.example.com#',
      }),
    ).rejects.toThrow(/store name/)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('normalises the forms a merchant is likely to paste', () => {
    expect(normaliseStoreName('mystore')).toBe('mystore')
    expect(normaliseStoreName('mystore.myikas.com')).toBe('mystore')
    expect(normaliseStoreName(' https://mystore.myikas.com/admin ')).toBe('mystore')
    expect(() => normaliseStoreName('attacker.com')).toThrow()
  })
})

describe('IkasAdapter.refreshCredentials', () => {
  it('re-runs the grant against the stored store name and keeps extra', async () => {
    const post = vi.spyOn(axios, 'post').mockResolvedValue({
      data: { access_token: 'at-2', token_type: 'Bearer', expires_in: 14400 },
    } as never)
    const extra = { clientId: 'cid', clientSecret: 'sec', storeName: 'mystore' }
    const { IkasAdapter } = (await import(
      ADAPTER
    )) as typeof import('../../../../../../src/verticals/ecommerce/adapters/ikas')

    const creds = await new IkasAdapter().refreshCredentials({ accessToken: 'at-1', extra })

    const [url, body] = post.mock.calls[0] as [string, string]
    expect(url).toBe('https://mystore.myikas.com/api/admin/oauth/token')
    const params = new URLSearchParams(body)
    expect(params.get('grant_type')).toBe('client_credentials')
    expect(params.get('client_id')).toBe('cid')
    expect(params.get('client_secret')).toBe('sec')
    expect(creds.accessToken).toBe('at-2')
    expect(creds.extra).toEqual(extra)
  })
})
