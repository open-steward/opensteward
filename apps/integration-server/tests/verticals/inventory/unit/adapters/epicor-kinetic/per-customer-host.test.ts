/**
 * Epicor Kinetic: a ServerToServer client gets a token from the fixed Epicor
 * IdP (`login.epicor.com/connect/token`, client-credentials grant), then REST
 * v2 calls go to the customer's own server —
 * `https://{host}/{instance}/api/v2/odata/{company}` — carrying the bearer
 * token and the `x-api-key`. Host, instance and company are collected by
 * `credentialFields()`, which renders once the platform is relabelled from
 * `oauth2` to `oauth2_cc`.
 *
 * The host is free-form (SaaS `*.epicorsaas.com` or a self-hosted server), so
 * it must be https and resolve to a public address before it is sent the
 * token; instance and company are single path segments.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import { setDnsResolver } from '@opensteward/shared'
import { EpicorKineticAdapter } from '../../../../../../src/verticals/inventory/adapters/epicor-kinetic/index'
import { normaliseEpicorHost } from '../../../../../../src/verticals/inventory/adapters/epicor-kinetic/auth'

const PUBLIC_DNS = async () => [{ address: '93.184.216.34' }]
const PRIVATE_DNS = async () => [{ address: '10.0.0.5' }]

function fakeHttp() {
  return { get: vi.fn().mockResolvedValue({ data: { value: [] } }) }
}

const FIELDS = {
  host: 'https://ACME.epicorsaas.com/EpicorERP/api/v2/',
  instance: ' EpicorERP ',
  company: 'EPIC06',
  apiKey: 'key',
  clientId: 'cid',
  clientSecret: 'sec',
}
const EXTRA = {
  host: 'acme.epicorsaas.com',
  instance: 'EpicorERP',
  company: 'EPIC06',
  apiKey: 'key',
  clientId: 'cid',
  clientSecret: 'sec',
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

describe('normaliseEpicorHost', () => {
  it.each([
    ['acme.epicorsaas.com', 'acme.epicorsaas.com'],
    ['https://ACME.epicorsaas.com/EpicorERP/api/v2/', 'acme.epicorsaas.com'],
    ['https://erp.acme.example:8443/Kinetic', 'erp.acme.example:8443'],
  ])('%s → %s', (input, want) => {
    expect(normaliseEpicorHost(input)).toBe(want)
  })

  it('rejects blanks with a message naming the field', () => {
    for (const v of ['', '   ', undefined]) {
      expect(() => normaliseEpicorHost(v)).toThrow(/Epicor server host is required/)
    }
  })

  it('rejects http, credentials and non-hosts', () => {
    expect(() => normaliseEpicorHost('http://acme.epicorsaas.com')).toThrow(/Epicor server host must use https/)
    expect(() => normaliseEpicorHost('https://u:p@acme.epicorsaas.com')).toThrow(
      /Epicor server host must not contain credentials/,
    )
    expect(() => normaliseEpicorHost('epicor server')).toThrow(/Epicor server host is not a valid hostname/)
  })
})

describe('EpicorKineticAdapter with a per-customer server host', () => {
  const adapter = new EpicorKineticAdapter()

  it('declares host, instance and company on the credential form (renders once relabelled oauth2_cc)', () => {
    expect(adapter.credentialFields()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'host', required: true }),
        expect.objectContaining({ name: 'instance', required: true }),
        expect.objectContaining({ name: 'company', required: true }),
        expect.objectContaining({ name: 'apiKey', required: true, type: 'password' }),
      ]),
    )
  })

  it('gets a token from the Epicor IdP and stores the normalised tenant values', async () => {
    const post = vi
      .spyOn(axios, 'post')
      .mockResolvedValue({ data: { access_token: 'tok', expires_in: 3600 } })
    const creds = await adapter.exchangeCredentials(FIELDS)
    expect(post).toHaveBeenCalledTimes(1)
    expect(post.mock.calls[0]![0]).toBe('https://login.epicor.com/connect/token')
    expect(new URLSearchParams(String(post.mock.calls[0]![1])).get('grant_type')).toBe('client_credentials')
    expect(creds.accessToken).toBe('tok')
    expect(creds.extra).toEqual(expect.objectContaining(EXTRA))
  })

  it.each([
    [{ ...FIELDS, host: '' }, /Epicor server host is required/],
    [{ ...FIELDS, host: 'http://acme.epicorsaas.com' }, /Epicor server host must use https/],
    [{ ...FIELDS, instance: '' }, /Epicor instance is required/],
    [{ ...FIELDS, instance: 'EpicorERP/../x' }, /Epicor instance must be a single path segment/],
    [{ ...FIELDS, company: 'EPIC06?$top=1' }, /Epicor company code must be a single path segment/],
    [{ ...FIELDS, apiKey: '' }, /REST v2 API key, client ID and client secret are required/],
  ])('rejects %o before any request', async (fields, message) => {
    const post = vi.spyOn(axios, 'post').mockResolvedValue({ data: { access_token: 'tok' } })
    await expect(adapter.exchangeCredentials(fields)).rejects.toThrow(message)
    expect(post).not.toHaveBeenCalled()
  })

  it('refuses a server host that resolves to a private address', async () => {
    setDnsResolver(PRIVATE_DNS)
    const post = vi.spyOn(axios, 'post').mockResolvedValue({ data: { access_token: 'tok' } })
    await expect(adapter.exchangeCredentials(FIELDS)).rejects.toThrow(/SSRF block: acme\.epicorsaas\.com/)
    expect(post).not.toHaveBeenCalled()
  })

  it('calls REST v2 on the host, instance and company stored with the credentials', async () => {
    const http = fakeHttp()
    const create = vi
      .spyOn(axios, 'create')
      .mockReturnValue(http as unknown as ReturnType<typeof axios.create>)
    await adapter.listProducts(STORED, {})
    const cfg = create.mock.calls[0]![0] as { baseURL?: string; headers?: Record<string, string> }
    expect(cfg.baseURL).toBe('https://acme.epicorsaas.com/EpicorERP/api/v2/odata/EPIC06')
    expect(cfg.headers?.['x-api-key']).toBe('key')
    expect(http.get).toHaveBeenCalledTimes(1)
  })

  it('sends neither token nor API key to a stored host that resolves privately', async () => {
    setDnsResolver(PRIVATE_DNS)
    const http = fakeHttp()
    vi.spyOn(axios, 'create').mockReturnValue(http as unknown as ReturnType<typeof axios.create>)
    await expect(adapter.listProducts(STORED, {})).rejects.toThrow(/SSRF block: acme\.epicorsaas\.com/)
    expect(http.get).not.toHaveBeenCalled()
  })

  it('fails with a readable message when no host was stored', async () => {
    const http = fakeHttp()
    vi.spyOn(axios, 'create').mockReturnValue(http as unknown as ReturnType<typeof axios.create>)
    await expect(
      adapter.listProducts({ accessToken: 'tok', extra: { ...EXTRA, host: '' } }, {}),
    ).rejects.toThrow(/Epicor server host is required/)
    expect(http.get).not.toHaveBeenCalled()
  })
})
