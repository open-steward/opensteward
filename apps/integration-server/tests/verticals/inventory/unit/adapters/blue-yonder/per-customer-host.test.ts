/**
 * Blue Yonder gives every customer a dedicated tenant host; the token endpoint
 * (`/oauth/token`) and the WMS API (`/wms/v1`) both live on it. The host is
 * collected by `credentialFields()` — the form the Connect page renders for
 * non-redirect auth. Platform metadata still says `oauth2`, so that form only
 * renders once the platform is relabelled `oauth2_cc` (client-credentials
 * grant, no browser redirect); these tests pin the behaviour after that.
 *
 * The host is typed by the customer and then receives the client secret and
 * the bearer token, so it is normalised, must be https, and must resolve to a
 * public address before any request is made.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import { setDnsResolver } from '@opensteward/shared'
import { BlueYonderAdapter } from '../../../../../../src/verticals/inventory/adapters/blue-yonder/index'
import { normaliseTenantHost } from '../../../../../../src/verticals/inventory/adapters/blue-yonder/auth'

const PUBLIC_DNS = async () => [{ address: '93.184.216.34' }]
const PRIVATE_DNS = async () => [{ address: '10.0.0.5' }]

function tokenResponse(): Response {
  return new Response(JSON.stringify({ access_token: 'tok', expires_in: 3600 }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

function fakeHttp() {
  return {
    get: vi.fn().mockResolvedValue({ data: { data: [] } }),
    post: vi.fn().mockResolvedValue({ data: {} }),
  }
}

const FIELDS = {
  clientId: 'cid',
  clientSecret: 'sec',
  tenantHost: 'https://ACME.blueyonder.com/wms/v1',
}
const STORED = { accessToken: 'tok', extra: { clientId: 'cid', clientSecret: 'sec', tenantHost: 'acme.blueyonder.com' } }

beforeEach(() => {
  vi.stubEnv('OST_ALLOW_PRIVATE_HOSTS', '')
  setDnsResolver(PUBLIC_DNS)
})

afterEach(() => {
  setDnsResolver(undefined)
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('normaliseTenantHost', () => {
  it.each([
    ['acme.blueyonder.com', 'acme.blueyonder.com'],
    ['https://ACME.blueyonder.com/', 'acme.blueyonder.com'],
    ['  https://acme.blueyonder.com/wms/v1?page=1 ', 'acme.blueyonder.com'],
  ])('%s → %s', (input, want) => {
    expect(normaliseTenantHost(input)).toBe(want)
  })

  it('rejects blanks with a message naming the field', () => {
    for (const v of ['', '   ', undefined]) {
      expect(() => normaliseTenantHost(v)).toThrow(/Blue Yonder tenant host is required/)
    }
  })

  it('rejects plain http — the host receives the client secret', () => {
    expect(() => normaliseTenantHost('http://acme.blueyonder.com')).toThrow(
      /Blue Yonder tenant host must use https/,
    )
  })

  it('rejects values that are not a hostname', () => {
    expect(() => normaliseTenantHost('localhost')).toThrow(/Blue Yonder tenant host is not a valid hostname/)
    expect(() => normaliseTenantHost('acme blueyonder')).toThrow(
      /Blue Yonder tenant host is not a valid hostname/,
    )
  })

  it('rejects embedded credentials', () => {
    expect(() => normaliseTenantHost('https://user:pw@acme.blueyonder.com')).toThrow(
      /Blue Yonder tenant host must not contain credentials/,
    )
  })
})

describe('BlueYonderAdapter with a per-customer tenant host', () => {
  const adapter = new BlueYonderAdapter()

  it('declares the tenant host on the credential form (renders once relabelled oauth2_cc)', () => {
    expect(adapter.credentialFields()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'clientId', required: true }),
        expect.objectContaining({ name: 'clientSecret', required: true, type: 'password' }),
        expect.objectContaining({ name: 'tenantHost', required: true }),
      ]),
    )
  })

  it('requests the token from the customer host and stores the normalised host', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => tokenResponse())
    const creds = await adapter.exchangeCredentials(FIELDS)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, init] = fetchSpy.mock.calls[0]!
    expect(String(url)).toBe('https://acme.blueyonder.com/oauth/token')
    const body = new URLSearchParams(String(init?.body))
    expect(body.get('grant_type')).toBe('client_credentials')
    expect(body.get('client_secret')).toBe('sec')
    expect(creds.accessToken).toBe('tok')
    expect(creds.extra).toEqual({ clientId: 'cid', clientSecret: 'sec', tenantHost: 'acme.blueyonder.com' })
  })

  it.each([
    [{ ...FIELDS, tenantHost: '' }, /Blue Yonder tenant host is required/],
    [{ ...FIELDS, tenantHost: 'http://acme.blueyonder.com' }, /Blue Yonder tenant host must use https/],
    [{ ...FIELDS, clientSecret: '' }, /Client ID and client secret are required/],
  ])('rejects %o before any request', async (fields, message) => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => tokenResponse())
    await expect(adapter.exchangeCredentials(fields)).rejects.toThrow(message)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('refuses a tenant host that resolves to a private address', async () => {
    setDnsResolver(PRIVATE_DNS)
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => tokenResponse())
    await expect(adapter.exchangeCredentials(FIELDS)).rejects.toThrow(/SSRF block: acme\.blueyonder\.com/)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('re-runs the grant against the stored host on refresh', async () => {
    const post = vi
      .spyOn(axios, 'post')
      .mockResolvedValue({ data: { access_token: 'tok2', expires_in: 60 } })
    const out = await adapter.refreshCredentials(STORED)
    expect(post.mock.calls[0]![0]).toBe('https://acme.blueyonder.com/oauth/token')
    expect(out.accessToken).toBe('tok2')
  })

  it('does not refresh against a stored host that resolves privately', async () => {
    setDnsResolver(PRIVATE_DNS)
    const post = vi.spyOn(axios, 'post').mockResolvedValue({ data: { access_token: 'tok2' } })
    await expect(adapter.refreshCredentials(STORED)).rejects.toThrow(/SSRF block: acme\.blueyonder\.com/)
    expect(post).not.toHaveBeenCalled()
  })

  it('calls the API on the host stored with the credentials', async () => {
    const http = fakeHttp()
    const create = vi
      .spyOn(axios, 'create')
      .mockReturnValue(http as unknown as ReturnType<typeof axios.create>)
    await adapter.listStockLevels(STORED, {})
    expect((create.mock.calls[0]![0] as { baseURL?: string }).baseURL).toBe('https://acme.blueyonder.com/wms/v1')
    expect(http.get).toHaveBeenCalledTimes(1)
  })

  it('sends no API request to a stored host that resolves privately', async () => {
    setDnsResolver(PRIVATE_DNS)
    const http = fakeHttp()
    vi.spyOn(axios, 'create').mockReturnValue(http as unknown as ReturnType<typeof axios.create>)
    await expect(adapter.listStockLevels(STORED, {})).rejects.toThrow(/SSRF block: acme\.blueyonder\.com/)
    expect(http.get).not.toHaveBeenCalled()
  })

  it('fails with a readable message when no host was stored', async () => {
    const http = fakeHttp()
    vi.spyOn(axios, 'create').mockReturnValue(http as unknown as ReturnType<typeof axios.create>)
    await expect(adapter.listStockLevels({ accessToken: 'tok', extra: {} }, {})).rejects.toThrow(
      /Blue Yonder tenant host is required/,
    )
    expect(http.get).not.toHaveBeenCalled()
  })
})
