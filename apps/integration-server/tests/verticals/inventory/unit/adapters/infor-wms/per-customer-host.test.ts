/**
 * Infor WMS is reached through the customer's ION API Gateway. Everything
 * comes from the customer's `.ionapi` file: the token endpoint (`pu` + `ot`),
 * the gateway URL (`iu`) and tenant (`ti`), plus client and service-account
 * keys for a resource-owner password grant. These are collected by
 * `credentialFields()`, which the Connect page renders once the platform is
 * relabelled from `oauth2` to `basic` (service-account password grant, no
 * redirect).
 *
 * Both URLs are free-form (Infor cloud or a self-hosted gateway) and receive
 * secrets or tokens, so each must be https and resolve to a public address
 * before any request is made.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import { setDnsResolver } from '@opensteward/shared'
import { InforWmsAdapter } from '../../../../../../src/verticals/inventory/adapters/infor-wms/index'

const PUBLIC_DNS = async () => [{ address: '93.184.216.34' }]
const PRIVATE_DNS = async () => [{ address: '10.0.0.5' }]

function tokenResponse(): Response {
  return new Response(JSON.stringify({ access_token: 'tok', expires_in: 7200 }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

function fakeHttp() {
  return {
    get: vi.fn().mockResolvedValue({ data: { items: [] } }),
    post: vi.fn().mockResolvedValue({ data: {} }),
  }
}

const FIELDS = {
  ionApiUrl: 'https://MINGLE-ionapi.inforcloudsuite.com/',
  tenantId: ' ACME_PRD ',
  tokenUrl: 'https://mingle-sso.inforcloudsuite.com:443/ACME_PRD/as/token.oauth2',
  clientId: 'cid',
  clientSecret: 'sec',
  serviceAccountKey: 'saak',
  serviceAccountSecret: 'sask',
}
const TOKEN_URL = 'https://mingle-sso.inforcloudsuite.com/ACME_PRD/as/token.oauth2'
const EXTRA = {
  ionApiUrl: 'https://mingle-ionapi.inforcloudsuite.com',
  tenantId: 'ACME_PRD',
  tokenUrl: TOKEN_URL,
  clientId: 'cid',
  clientSecret: 'sec',
  serviceAccountKey: 'saak',
  serviceAccountSecret: 'sask',
}
const STORED = { accessToken: 'tok', extra: EXTRA }

beforeEach(() => {
  vi.stubEnv('OST_ALLOW_PRIVATE_HOSTS', '')
  setDnsResolver(PUBLIC_DNS)
})

afterEach(() => {
  setDnsResolver(undefined)
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('InforWmsAdapter with a per-customer ION API gateway', () => {
  const adapter = new InforWmsAdapter()

  it('declares gateway, tenant and token URL on the credential form (renders once relabelled basic)', () => {
    expect(adapter.credentialFields()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'ionApiUrl', required: true, type: 'url' }),
        expect.objectContaining({ name: 'tenantId', required: true }),
        expect.objectContaining({ name: 'tokenUrl', required: true, type: 'url' }),
        expect.objectContaining({ name: 'serviceAccountSecret', required: true, type: 'password' }),
      ]),
    )
  })

  it('requests the token from the customer token URL and stores normalised values', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => tokenResponse())
    const creds = await adapter.exchangeCredentials(FIELDS)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, init] = fetchSpy.mock.calls[0]!
    expect(String(url)).toBe(TOKEN_URL)
    expect(new URLSearchParams(String(init?.body)).get('grant_type')).toBe('password')
    expect(creds.accessToken).toBe('tok')
    expect(creds.extra).toEqual(EXTRA)
  })

  it.each([
    [{ ...FIELDS, ionApiUrl: '' }, /Infor ION API URL is required/],
    [{ ...FIELDS, ionApiUrl: 'http://mingle-ionapi.inforcloudsuite.com' }, /Infor ION API URL must use https/],
    [{ ...FIELDS, tokenUrl: ' ' }, /Infor OAuth token URL is required/],
    [{ ...FIELDS, tokenUrl: 'http://mingle-sso.inforcloudsuite.com/ACME_PRD/as/token.oauth2' }, /Infor OAuth token URL must use https/],
    [{ ...FIELDS, tenantId: '' }, /Infor tenant ID is required/],
    [{ ...FIELDS, tenantId: 'ACME_PRD/../OTHER' }, /Infor tenant ID must be a single path segment/],
    [{ ...FIELDS, serviceAccountSecret: '' }, /Infor client ID, client secret, service account key and secret are required/],
  ])('rejects %o before any request', async (fields, message) => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => tokenResponse())
    await expect(adapter.exchangeCredentials(fields)).rejects.toThrow(message)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('refuses a token URL that resolves to a private address', async () => {
    setDnsResolver(async (host: string) => [{ address: host.startsWith('mingle-sso') ? '10.0.0.5' : '93.184.216.34' }])
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => tokenResponse())
    await expect(adapter.exchangeCredentials(FIELDS)).rejects.toThrow(/SSRF block: mingle-sso\.inforcloudsuite\.com/)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('refuses an ION API URL that resolves to a private address', async () => {
    setDnsResolver(async (host: string) => [{ address: host.startsWith('mingle-ionapi') ? '10.0.0.5' : '93.184.216.34' }])
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => tokenResponse())
    await expect(adapter.exchangeCredentials(FIELDS)).rejects.toThrow(/SSRF block: mingle-ionapi\.inforcloudsuite\.com/)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('does not refresh against a stored token URL that resolves privately', async () => {
    setDnsResolver(PRIVATE_DNS)
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => tokenResponse())
    await expect(adapter.refreshCredentials(STORED)).rejects.toThrow(/SSRF block: mingle-sso\.inforcloudsuite\.com/)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('calls the WMS API on the gateway and tenant stored with the credentials', async () => {
    const http = fakeHttp()
    const create = vi
      .spyOn(axios, 'create')
      .mockReturnValue(http as unknown as ReturnType<typeof axios.create>)
    await adapter.listProducts(STORED, {})
    expect((create.mock.calls[0]![0] as { baseURL?: string }).baseURL).toBe(
      'https://mingle-ionapi.inforcloudsuite.com/ACME_PRD/WMS',
    )
    expect(http.get).toHaveBeenCalledTimes(1)
  })

  it('sends no API request to a stored gateway that resolves privately', async () => {
    setDnsResolver(PRIVATE_DNS)
    const http = fakeHttp()
    vi.spyOn(axios, 'create').mockReturnValue(http as unknown as ReturnType<typeof axios.create>)
    await expect(adapter.listProducts(STORED, {})).rejects.toThrow(/SSRF block: mingle-ionapi\.inforcloudsuite\.com/)
    expect(http.get).not.toHaveBeenCalled()
  })

  it('sends no API request to a stored plain-http gateway', async () => {
    const http = fakeHttp()
    vi.spyOn(axios, 'create').mockReturnValue(http as unknown as ReturnType<typeof axios.create>)
    await expect(
      adapter.listProducts({ ...STORED, extra: { ...EXTRA, ionApiUrl: 'http://mingle-ionapi.inforcloudsuite.com' } }, {}),
    ).rejects.toThrow(/Infor ION API URL must use https/)
    expect(http.get).not.toHaveBeenCalled()
  })
})
