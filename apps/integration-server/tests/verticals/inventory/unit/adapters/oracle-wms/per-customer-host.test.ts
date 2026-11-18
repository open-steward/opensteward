/**
 * Oracle Warehouse Management Cloud: every customer has a WMS base URL
 * `https://{cluster}.wms.ocs.oraclecloud.com/{env-name}` and a WMS IDCS
 * identity domain whose token endpoint is
 * `https://idcs-{tenant}.identity.oraclecloud.com/oauth2/v1/token`
 * (WMS REST API Guide, "OAuth Client Credentials Grant Support" and
 * "Authenticate WMS APIs using Identity Cloud Service"; scope
 * `urn:resource:fusion:scm:logistics:wms:lgfapi/`).
 *
 * The adapter previously POSTed to a WMS-hosted `/api/oauth2/token/` path that
 * the guide does not document. Both values are collected by
 * `credentialFields()`, which renders once the platform is relabelled from
 * `oauth2` to `oauth2_cc` (service-user client-credentials, no redirect).
 * Both hosts receive secrets or tokens, so they are held to their Oracle
 * domain suffixes.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import { OracleWmsAdapter } from '../../../../../../src/verticals/inventory/adapters/oracle-wms/index'
import {
  normaliseIdcsTokenUrl,
  normaliseWmsUrl,
} from '../../../../../../src/verticals/inventory/adapters/oracle-wms/auth'

const TOKEN_URL = 'https://idcs-abc123.identity.oraclecloud.com/oauth2/v1/token'
const SCOPE = 'urn:resource:fusion:scm:logistics:wms:lgfapi/'

function tokenResponse(): Response {
  return new Response(JSON.stringify({ access_token: 'tok', token_type: 'Bearer', expires_in: 3600 }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

function fakeHttp() {
  return { get: vi.fn().mockResolvedValue({ data: { count: 0, results: [] } }) }
}

const FIELDS = {
  wmsUrl: 'https://TA3.wms.ocs.oraclecloud.com/acme_prod/',
  tokenUrl: 'https://IDCS-abc123.identity.oraclecloud.com:443/oauth2/v1/token',
  clientId: 'cid',
  clientSecret: 'sec',
}

const STORED = {
  accessToken: 'tok',
  extra: {
    wmsDomain: 'ta3.wms.ocs.oraclecloud.com',
    envName: 'acme_prod',
    tokenUrl: TOKEN_URL,
    clientId: 'cid',
    clientSecret: 'sec',
    scope: SCOPE,
  },
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('normaliseWmsUrl', () => {
  it.each([
    ['https://ta3.wms.ocs.oraclecloud.com/acme_prod'],
    ['https://TA3.wms.ocs.oraclecloud.com:443/acme_prod/'],
    ['ta3.wms.ocs.oraclecloud.com/acme_prod/wms/lgfapi/v10/entity/item/'],
  ])('%s → ta3.wms.ocs.oraclecloud.com + acme_prod', (input) => {
    expect(normaliseWmsUrl(input)).toEqual({ wmsDomain: 'ta3.wms.ocs.oraclecloud.com', envName: 'acme_prod' })
  })

  it('rejects blanks with a message naming the field', () => {
    for (const v of ['', '   ', undefined]) {
      expect(() => normaliseWmsUrl(v)).toThrow(/Oracle WMS URL is required/)
    }
  })

  it.each(['https://evil.example/acme_prod', 'https://ta3.wms.ocs.oraclecloud.com.evil.example/acme_prod'])(
    'rejects %s — the bearer token must not leave Oracle WMS',
    (input) => {
      expect(() => normaliseWmsUrl(input)).toThrow(/Oracle WMS URL must be a \*\.wms\.ocs\.oraclecloud\.com host/)
    },
  )

  it('rejects plain http and a URL without the environment name', () => {
    expect(() => normaliseWmsUrl('http://ta3.wms.ocs.oraclecloud.com/acme_prod')).toThrow(
      /Oracle WMS URL must use https/,
    )
    expect(() => normaliseWmsUrl('https://ta3.wms.ocs.oraclecloud.com/')).toThrow(
      /Oracle WMS URL must include the environment name/,
    )
  })
})

describe('normaliseIdcsTokenUrl', () => {
  it.each([
    ['idcs-abc123.identity.oraclecloud.com'],
    ['https://IDCS-abc123.identity.oraclecloud.com:443/oauth2/v1/token'],
    ['https://idcs-abc123.identity.oraclecloud.com/ui/v1/signin'],
  ])('%s → the identity domain token endpoint', (input) => {
    expect(normaliseIdcsTokenUrl(input)).toBe(TOKEN_URL)
  })

  it('rejects blanks, http, and hosts outside identity.oraclecloud.com', () => {
    expect(() => normaliseIdcsTokenUrl('')).toThrow(/Oracle IDCS token URL is required/)
    expect(() => normaliseIdcsTokenUrl('http://idcs-abc123.identity.oraclecloud.com')).toThrow(
      /Oracle IDCS token URL must use https/,
    )
    expect(() => normaliseIdcsTokenUrl('https://idcs-abc123.identity.oraclecloud.com.evil.example/')).toThrow(
      /Oracle IDCS token URL must be a \*\.identity\.oraclecloud\.com host/,
    )
  })
})

describe('OracleWmsAdapter with per-customer WMS and IDCS hosts', () => {
  const adapter = new OracleWmsAdapter({ clientId: '', clientSecret: '', _redirectUri: '' })

  it('declares both hosts on the credential form (renders once relabelled oauth2_cc)', () => {
    expect(adapter.credentialFields()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'wmsUrl', required: true }),
        expect.objectContaining({ name: 'tokenUrl', required: true }),
        expect.objectContaining({ name: 'clientId', required: true }),
        expect.objectContaining({ name: 'clientSecret', required: true, type: 'password' }),
      ]),
    )
  })

  it('runs the client-credentials grant at the customer IDCS domain and stores normalised hosts', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => tokenResponse())
    const creds = await adapter.exchangeCredentials(FIELDS)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, init] = fetchSpy.mock.calls[0]!
    expect(String(url)).toBe(TOKEN_URL)
    const headers = init?.headers as Record<string, string>
    expect(headers['Authorization']).toBe(`Basic ${Buffer.from('cid:sec').toString('base64')}`)
    const body = new URLSearchParams(String(init?.body))
    expect(body.get('grant_type')).toBe('client_credentials')
    expect(body.get('scope')).toBe(SCOPE)
    expect(creds.accessToken).toBe('tok')
    expect(creds.extra).toEqual(STORED.extra)
  })

  it.each([
    [{ ...FIELDS, wmsUrl: '' }, /Oracle WMS URL is required/],
    [{ ...FIELDS, wmsUrl: 'https://evil.example/acme_prod' }, /Oracle WMS URL must be a \*\.wms\.ocs\.oraclecloud\.com host/],
    [{ ...FIELDS, tokenUrl: 'https://evil.example/oauth2/v1/token' }, /Oracle IDCS token URL must be a \*\.identity\.oraclecloud\.com host/],
    [{ ...FIELDS, clientSecret: '' }, /Client ID and client secret are required/],
  ])('rejects %o before any request', async (fields, message) => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => tokenResponse())
    await expect(adapter.exchangeCredentials(fields)).rejects.toThrow(message)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('re-runs the grant on refresh — client credentials issue no refresh token', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => tokenResponse())
    const out = await adapter.refreshCredentials({ ...STORED, accessToken: 'old' })
    expect(String(fetchSpy.mock.calls[0]![0])).toBe(TOKEN_URL)
    expect(out.accessToken).toBe('tok')
    expect(out.extra).toEqual(STORED.extra)
  })

  it('refuses to refresh against a stored token URL outside identity.oraclecloud.com', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => tokenResponse())
    await expect(
      adapter.refreshCredentials({ ...STORED, extra: { ...STORED.extra, tokenUrl: 'https://evil.example/t' } }),
    ).rejects.toThrow(/Oracle IDCS token URL must be a \*\.identity\.oraclecloud\.com host/)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('calls lgfapi on the WMS host and environment stored with the credentials', async () => {
    const http = fakeHttp()
    const create = vi
      .spyOn(axios, 'create')
      .mockReturnValue(http as unknown as ReturnType<typeof axios.create>)
    await adapter.listProducts(STORED, {})
    expect((create.mock.calls[0]![0] as { baseURL?: string }).baseURL).toBe(
      'https://ta3.wms.ocs.oraclecloud.com/acme_prod/wms/lgfapi/v10/entity',
    )
    expect(http.get).toHaveBeenCalledTimes(1)
  })

  it('sends no API request for a stored WMS host outside Oracle', async () => {
    const http = fakeHttp()
    const create = vi
      .spyOn(axios, 'create')
      .mockReturnValue(http as unknown as ReturnType<typeof axios.create>)
    await expect(
      adapter.listProducts({ ...STORED, extra: { ...STORED.extra, wmsDomain: 'evil.example' } }, {}),
    ).rejects.toThrow(/Oracle WMS URL must be a \*\.wms\.ocs\.oraclecloud\.com host/)
    expect(create).not.toHaveBeenCalled()
    expect(http.get).not.toHaveBeenCalled()
  })
})
