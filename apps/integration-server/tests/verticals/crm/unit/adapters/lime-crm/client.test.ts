/**
 * Lime CRM auth, host and refusals.
 *
 * Auth: "The key must be sent as the value of a header named `x-api-key` in
 * every request. Example: curl -H "x-api-key: ABC123"
 * https://example.com/my_app/api/v1"
 * (http://static.lime-crm.com/crm-api-docs/spec/limeobject).
 *
 * Host: every application has its own base, "https://<yourdomain>/<application>/api/v1/docs/"
 * (https://docs.lime-crm.com/integration/rest-apis/start), so the adapter takes
 * it from the connection and never guesses one.
 *
 * Pipelines: the documented APIs have no dealstatus collection. dealstatus is an
 * option property on deal, and the Limetype API's documented schema carries no
 * option values, so listPipelines refuses before sending anything.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { _resetCursorPager, withPageSink, type Credentials } from '@opensteward/shared'
import { LimeCrmAdapter } from '../../../../../../src/verticals/crm/adapters/lime-crm/index'

const BASE = 'https://tenant.example.test/acme/api/v1'
const creds: Credentials = { accessToken: 'api-key', extra: { instanceUrl: BASE } } as Credentials

interface Call {
  url: string
  headers: Record<string, string>
}
let calls: Call[] = []

function install(body: unknown): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init?: { headers?: Record<string, string> }) => {
      calls.push({ url: input, headers: init?.headers ?? {} })
      return new Response(JSON.stringify(body), { status: 200 })
    }),
  )
}

beforeEach(() => {
  calls = []
  _resetCursorPager()
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('lime-crm auth header', () => {
  it('sends the API key in the documented x-api-key header, and no other key header', async () => {
    install({ _embedded: { limeobjects: [] } })
    await new LimeCrmAdapter().listContacts(creds, withPageSink({ page: 1, limit: 5 }))
    expect(calls).toHaveLength(1)
    const names = Object.keys(calls[0]!.headers).map((h) => h.toLowerCase())
    expect(calls[0]!.headers['x-api-key']).toBe('api-key')
    expect(names).not.toContain('x-lime-apikey')
  })

  it.each([
    ['getContact', '/limeobject/person/7/'],
    ['getCompany', '/limeobject/company/7/'],
    ['getDeal', '/limeobject/deal/7/'],
  ] as const)('%s reads the documented path on the tenant base with x-api-key', async (m, path) => {
    install({ _id: 7, name: 'x' })
    await new LimeCrmAdapter()[m](creds, '7')
    expect(calls[0]!.url).toBe(`${BASE}${path}`)
    expect(calls[0]!.headers['x-api-key']).toBe('api-key')
  })
})

describe('lime-crm tenant base URL', () => {
  const noHost = { accessToken: 'api-key' } as Credentials

  it('refuses a list without an instance URL and sends nothing', async () => {
    install({})
    await expect(
      new LimeCrmAdapter().listDeals(noHost, withPageSink({ page: 1, limit: 5 })),
    ).rejects.toThrow(/instance URL/)
    expect(calls).toHaveLength(0)
  })

  it('refuses a get without an instance URL and sends nothing', async () => {
    install({})
    await expect(new LimeCrmAdapter().getCompany(noHost, '1')).rejects.toThrow(/instance URL/)
    expect(calls).toHaveLength(0)
  })

  it('trims trailing slashes off a stored instance URL', async () => {
    install({ _id: 1, name: 'x' })
    const slashed = { accessToken: 'api-key', extra: { instanceUrl: ` ${BASE}// ` } } as Credentials
    await new LimeCrmAdapter().getCompany(slashed, '1')
    expect(calls[0]!.url).toBe(`${BASE}/limeobject/company/1/`)
  })

  it('refuses an http:// instance URL, stored or entered, and sends nothing', async () => {
    install({ _id: 1, name: 'x' })
    const http = 'http://tenant.example.test/acme/api/v1'
    const plain = { accessToken: 'api-key', extra: { instanceUrl: http } } as Credentials
    await expect(new LimeCrmAdapter().getCompany(plain, '1')).rejects.toMatchObject({
      code: 'INVALID_INSTANCE_URL',
    })
    await expect(
      new LimeCrmAdapter().exchangeCredentials({ apiKey: 'k', instanceUrl: http }),
    ).rejects.toThrow(/https/)
    await expect(
      new LimeCrmAdapter().exchangeCredentials({ apiKey: 'k', instanceUrl: 'tenant.example.test' }),
    ).rejects.toThrow(/https/)
    expect(calls).toHaveLength(0)
  })

  it('the connect form collects the API key and the instance URL', async () => {
    const adapter = new LimeCrmAdapter()
    expect(adapter.credentialFields().map((f) => [f.name, f.required])).toEqual([
      ['apiKey', true],
      ['instanceUrl', true],
    ])
    await expect(
      adapter.exchangeCredentials({ apiKey: ' k ', instanceUrl: ` ${BASE}/ ` }),
    ).resolves.toEqual({ accessToken: 'k', extra: { instanceUrl: BASE } })
    await expect(adapter.exchangeCredentials({ apiKey: 'k', instanceUrl: '' })).rejects.toThrow(
      /instance URL/,
    )
    await expect(adapter.exchangeCredentials({ apiKey: '', instanceUrl: BASE })).rejects.toThrow(
      /API key/,
    )
  })
})

describe('lime-crm listPipelines', () => {
  it('refuses with 501 NOT_SUPPORTED and sends no request', async () => {
    install({})
    await expect(
      new LimeCrmAdapter().listPipelines(creds, withPageSink({ page: 1, limit: 5 })),
    ).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect(calls).toHaveLength(0)
  })
})
