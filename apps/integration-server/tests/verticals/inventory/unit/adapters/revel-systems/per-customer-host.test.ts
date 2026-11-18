/**
 * Revel Systems issues a machine-to-machine token from the fixed
 * authentication.revelup.com endpoint (client-credentials grant), then every
 * call goes to the merchant's own `{subdomain}.revelup.com` host with the
 * subdomain repeated as the `Client-Id` header. The subdomain is collected by
 * `credentialFields()`, which the Connect page renders once the platform is
 * relabelled from `oauth2` to `oauth2_cc` — Revel has no browser redirect.
 *
 * The subdomain receives the bearer token, so anything outside revelup.com is
 * refused, including look-alikes such as `x.revelup.com.evil.example`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import { RevelSystemsAdapter } from '../../../../../../src/verticals/inventory/adapters/revel-systems/index'
import { normaliseRevelSubdomain } from '../../../../../../src/verticals/inventory/adapters/revel-systems/auth'

function tokenResponse(): Response {
  return new Response(JSON.stringify({ access_token: 'tok', token_type: 'Bearer', expires_in: 86400 }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

function fakeHttp() {
  return { get: vi.fn().mockResolvedValue({ data: { meta: { total_count: 0 }, objects: [] } }) }
}

const FIELDS = {
  clientId: 'cid',
  clientSecret: 'sec',
  subdomain: 'https://MyStore.revelup.com/resources/',
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('normaliseRevelSubdomain', () => {
  it.each([
    ['mystore', 'mystore'],
    ['MyStore.revelup.com', 'mystore'],
    ['https://mystore.revelup.com/resources/', 'mystore'],
    ['  my-store ', 'my-store'],
  ])('%s → %s', (input, want) => {
    expect(normaliseRevelSubdomain(input)).toBe(want)
  })

  it('rejects blanks with a message naming the field', () => {
    for (const v of ['', '   ', undefined]) {
      expect(() => normaliseRevelSubdomain(v)).toThrow(/Revel subdomain is required/)
    }
  })

  it.each(['evil.example.com', 'mystore.revelup.com.evil.example', 'a.b.revelup.com', 'my store'])(
    'rejects %s — the token must not leave revelup.com',
    (input) => {
      expect(() => normaliseRevelSubdomain(input)).toThrow(/Revel subdomain must be a \*\.revelup\.com host/)
    },
  )
})

describe('RevelSystemsAdapter with a per-merchant subdomain', () => {
  const adapter = new RevelSystemsAdapter({ clientId: '', clientSecret: '' })

  it('declares the subdomain on the credential form (renders once relabelled oauth2_cc)', () => {
    expect(adapter.credentialFields()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'clientId', required: true }),
        expect.objectContaining({ name: 'clientSecret', required: true, type: 'password' }),
        expect.objectContaining({ name: 'subdomain', required: true }),
      ]),
    )
  })

  it('exchanges at the Revel token endpoint and stores the normalised subdomain', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => tokenResponse())
    const creds = await adapter.exchangeCredentials(FIELDS)
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    const [url, init] = fetchSpy.mock.calls[0]!
    expect(String(url)).toBe('https://authentication.revelup.com/oauth/token')
    const body = new URLSearchParams(String(init?.body))
    expect(body.get('grant_type')).toBe('client_credentials')
    expect(body.get('audience')).toBe('https://api.revelsystems.com')
    expect(creds.accessToken).toBe('tok')
    expect(creds.extra).toEqual({ clientId: 'cid', clientSecret: 'sec', subdomain: 'mystore' })
  })

  it.each([
    [{ ...FIELDS, subdomain: '' }, /Revel subdomain is required/],
    [{ ...FIELDS, subdomain: 'mystore.revelup.com.evil.example' }, /Revel subdomain must be a \*\.revelup\.com host/],
    [{ ...FIELDS, clientSecret: '' }, /Client ID and client secret are required/],
  ])('rejects %o before any request', async (fields, message) => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => tokenResponse())
    await expect(adapter.exchangeCredentials(fields)).rejects.toThrow(message)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('refuses to refresh for a stored subdomain outside revelup.com', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => tokenResponse())
    await expect(
      adapter.refreshCredentials({
        accessToken: 'old',
        extra: { clientId: 'cid', clientSecret: 'sec', subdomain: 'evil.example.com' },
      }),
    ).rejects.toThrow(/Revel subdomain must be a \*\.revelup\.com host/)
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('calls the API on the subdomain stored with the credentials', async () => {
    const http = fakeHttp()
    const create = vi
      .spyOn(axios, 'create')
      .mockReturnValue(http as unknown as ReturnType<typeof axios.create>)
    await adapter.listProducts({ accessToken: 'tok', extra: { subdomain: 'mystore' } }, {})
    const cfg = create.mock.calls[0]![0] as { baseURL?: string; headers?: Record<string, string> }
    expect(cfg.baseURL).toBe('https://mystore.revelup.com/resources')
    expect(cfg.headers?.['Client-Id']).toBe('mystore')
    expect(http.get).toHaveBeenCalledTimes(1)
  })

  it('sends no API request for a stored subdomain outside revelup.com', async () => {
    const http = fakeHttp()
    const create = vi
      .spyOn(axios, 'create')
      .mockReturnValue(http as unknown as ReturnType<typeof axios.create>)
    await expect(
      adapter.listProducts({ accessToken: 'tok', extra: { subdomain: 'evil.example.com' } }, {}),
    ).rejects.toThrow(/Revel subdomain must be a \*\.revelup\.com host/)
    expect(create).not.toHaveBeenCalled()
    expect(http.get).not.toHaveBeenCalled()
  })
})
