/**
 * SAP EWM runs inside the customer's own S/4HANA system: token endpoint
 * (`/sap/bc/sec/oauth2/token`) and OData services (`/sap/opu/odata/sap/...`)
 * both live on a customer-supplied host, and the grant is client_credentials.
 * No browser redirect exists, so the host is collected through
 * `credentialFields()` / `exchangeCredentials()`.
 *
 * NOTE: metadata still labels sap-ewm `auth_type: 'oauth2'`, which makes the
 * Connect page skip `credentialFields()`. The form renders once the platform is
 * relabelled `oauth2_cc`; these tests pin that the form and exchange are
 * correct and complete for when it does.
 *
 * The base URL is free-form and receives the client secret and bearer token,
 * so it must be https, normalised, and resolve to a public address before any
 * request is made.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import axios from 'axios'
import { setDnsResolver } from '@opensteward/shared'
import { SapEwmAdapter } from '../../../../../../src/verticals/inventory/adapters/sap-ewm'
import { SapEwmClient } from '../../../../../../src/verticals/inventory/adapters/sap-ewm/client'

const PUBLIC = async () => [{ address: '8.8.8.8' }]
const PRIVATE = async () => [{ address: '10.0.0.5' }]

beforeEach(() => setDnsResolver(PUBLIC))
afterEach(() => {
  setDnsResolver(undefined)
  vi.restoreAllMocks()
})

function mockPost() {
  return vi
    .spyOn(axios, 'post')
    .mockResolvedValue({ data: { access_token: 'tok', token_type: 'Bearer', expires_in: 3600 } })
}

const BASE_FIELDS = { clientId: 'cid', clientSecret: 'sec' }

describe('SAP EWM per-customer S/4HANA host', () => {
  const adapter = new SapEwmAdapter()

  it('declares the host and SAP client on the credential form (renders once relabelled oauth2_cc)', () => {
    expect(adapter.credentialFields()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'baseUrl', type: 'url', required: true }),
        expect.objectContaining({ name: 'clientId', required: true }),
        expect.objectContaining({ name: 'clientSecret', type: 'password', required: true }),
        expect.objectContaining({ name: 'sapClient', required: false }),
        expect.objectContaining({ name: 'scope', required: false }),
      ]),
    )
  })

  it('exchanges on the normalised customer host and stores that host', async () => {
    const post = mockPost()
    const creds = await adapter.exchangeCredentials({
      ...BASE_FIELDS,
      baseUrl: ' https://S4.Acme.example:44300/sap/opu/odata/sap/API_PRODUCT_SRV/?x=1 ',
      sapClient: ' 100 ',
      scope: 'API_PRODUCT_SRV_0001',
    })
    expect(post).toHaveBeenCalledTimes(1)
    const url = new URL(String(post.mock.calls[0]![0]))
    expect(`${url.origin}${url.pathname}`).toBe('https://s4.acme.example:44300/sap/bc/sec/oauth2/token')
    expect(url.searchParams.get('sap-client')).toBe('100')
    expect(creds.accessToken).toBe('tok')
    expect(creds.extra).toEqual({
      baseUrl: 'https://s4.acme.example:44300',
      clientId: 'cid',
      clientSecret: 'sec',
      scope: 'API_PRODUCT_SRV_0001',
      sapClient: '100',
    })
  })

  it('keeps a reverse-proxy path prefix in front of /sap/', async () => {
    const post = mockPost()
    const creds = await adapter.exchangeCredentials({
      ...BASE_FIELDS,
      baseUrl: 'https://gw.acme.example/s4prod/sap/opu/odata/sap/',
    })
    expect(post.mock.calls[0]![0]).toBe('https://gw.acme.example/s4prod/sap/bc/sec/oauth2/token')
    expect(creds.extra?.['baseUrl']).toBe('https://gw.acme.example/s4prod')
  })

  it('rejects a non-https host without making a request', async () => {
    const post = mockPost()
    await expect(
      adapter.exchangeCredentials({ ...BASE_FIELDS, baseUrl: 'http://s4.acme.example' }),
    ).rejects.toThrow(/SAP S\/4HANA base URL must use https:\/\//)
    expect(post).not.toHaveBeenCalled()
  })

  it('rejects a URL carrying a username or password without making a request', async () => {
    const post = mockPost()
    await expect(
      adapter.exchangeCredentials({ ...BASE_FIELDS, baseUrl: 'https://u:p@s4.acme.example' }),
    ).rejects.toThrow(/SAP S\/4HANA base URL must not contain a username or password/)
    expect(post).not.toHaveBeenCalled()
  })

  it('rejects a host that resolves to a private address without making a request', async () => {
    setDnsResolver(PRIVATE)
    const post = mockPost()
    await expect(
      adapter.exchangeCredentials({ ...BASE_FIELDS, baseUrl: 'https://s4.internal.example' }),
    ).rejects.toThrow(/SSRF block: s4\.internal\.example resolved to 10\.0\.0\.5/)
    expect(post).not.toHaveBeenCalled()
  })

  it('rejects a malformed SAP client without making a request', async () => {
    const post = mockPost()
    await expect(
      adapter.exchangeCredentials({ ...BASE_FIELDS, baseUrl: 'https://s4.acme.example', sapClient: '1&x=y' }),
    ).rejects.toThrow(/SAP client must be a three-digit number/)
    expect(post).not.toHaveBeenCalled()
  })

  it('names what is missing and makes no request', async () => {
    const post = mockPost()
    await expect(
      adapter.exchangeCredentials({ ...BASE_FIELDS, baseUrl: '  ' }),
    ).rejects.toThrow(/SAP S\/4HANA base URL is required/)
    await expect(
      adapter.exchangeCredentials({ baseUrl: 'https://s4.acme.example', clientId: ' ', clientSecret: 's' }),
    ).rejects.toThrow(/SAP OAuth2 client ID is required/)
    await expect(
      adapter.exchangeCredentials({ baseUrl: 'https://s4.acme.example', clientId: 'c', clientSecret: '' }),
    ).rejects.toThrow(/SAP OAuth2 client secret is required/)
    expect(post).not.toHaveBeenCalled()
  })

  it('builds the client base URL from credentials.extra and sends sap-client', () => {
    const create = vi.spyOn(axios, 'create')
    new SapEwmClient({ accessToken: 't', extra: { baseUrl: 'https://s4.acme.example:44300', sapClient: '100' } })
    const cfg = create.mock.calls[0]![0]!
    expect(cfg.baseURL).toBe('https://s4.acme.example:44300')
    expect(cfg.params).toEqual({ $format: 'json', 'sap-client': '100' })
  })

  it('refuses to build a client without a stored host', () => {
    const create = vi.spyOn(axios, 'create')
    expect(() => new SapEwmClient({ accessToken: 't', extra: {} })).toThrow(
      /SAP S\/4HANA base URL is required/,
    )
    expect(create).not.toHaveBeenCalled()
  })

  it('checks the stored host resolves publicly before sending the bearer token', async () => {
    const get = vi.fn().mockResolvedValue({ data: { d: { results: [] } } })
    vi.spyOn(axios, 'create').mockReturnValue({ get } as never)
    const client = new SapEwmClient({ accessToken: 't', extra: { baseUrl: 'https://s4.internal.example' } })
    setDnsResolver(PRIVATE)
    await expect(client.getCollection('/sap/opu/odata/sap/API_PRODUCT_SRV', 'A_Product')).rejects.toThrow(
      /SSRF block: s4\.internal\.example resolved to 10\.0\.0\.5/,
    )
    expect(get).not.toHaveBeenCalled()
  })
})
