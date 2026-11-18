/**
 * DwollaAdapter against a fake of Dwolla's documented HTTP surface.
 *
 * - Auth (https://developers.dwolla.com/docs/api-reference/api-fundamentals/making-requests-and-authentication):
 *   "send a `POST` to `/token` with an HTTP Basic `Authorization` header
 *   containing your Base64-encoded client credentials. The request body must
 *   be form-encoded and include `grant_type=client_credentials`"; every
 *   request must carry `Accept: application/vnd.dwolla.v1.hal+json`.
 * - GET /customers (https://developers.dwolla.com/docs/api-reference/customers/list-and-search-customers):
 *   query params limit ("How many results to return"), offset ("How many
 *   results to skip"), search, status; "Default limit is 25 customers per
 *   page, maximum 200."; response `_links`, `_embedded.customers`, `total`.
 *
 * The fake honours only `limit` and `offset`, and rejects any other query key.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readUpstreamPage, withPageSink } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'

const { getMock, postMock, createMock } = vi.hoisted(() => {
  const getMock = vi.fn()
  const postMock = vi.fn()
  const createMock = vi.fn((_cfg?: unknown) => ({ get: getMock }))
  return { getMock, postMock, createMock }
})

vi.mock('axios', () => ({
  default: { create: createMock, post: postMock },
}))

import { DwollaAdapter } from '../../../../../../src/verticals/payments/adapters/dwolla'

const adapter = new DwollaAdapter()
const CREDS: Credentials = {
  accessToken: 'app-token',
  extra: { clientId: 'cid', clientSecret: 'csecret' },
}
const DOCUMENTED = new Set(['limit', 'offset'])

function customer(i: number) {
  return {
    _links: {},
    id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    firstName: 'Jane',
    lastName: `Doe${i}`,
    email: `jane${i}@mail.com`,
    created: '2022-10-07T16:46:13.023Z',
    type: 'unverified',
    status: 'unverified',
  }
}

/** Serve `n` customers at GET /customers, honouring only limit and offset. */
function serve(n: number, opts: { max?: number } = {}) {
  const max = opts.max ?? 200
  const all = Array.from({ length: n }, (_, i) => customer(i + 1))
  const calls: Record<string, unknown>[] = []
  getMock.mockImplementation(
    async (path: string, cfg: { params?: Record<string, unknown> } = {}) => {
      if (path !== '/customers') throw new Error(`unexpected path ${path}`)
      const params = cfg.params ?? {}
      calls.push({ ...params })
      for (const k of Object.keys(params)) {
        if (!DOCUMENTED.has(k)) throw new Error(`undocumented query param ${k}`)
      }
      const limit = params['limit'] === undefined ? 25 : Number(params['limit'])
      if (!Number.isInteger(limit) || limit < 1 || limit > max)
        throw new Error(`bad limit ${limit}`)
      const offset = params['offset'] === undefined ? 0 : Number(params['offset'])
      return {
        data: {
          _links: {},
          _embedded: { customers: all.slice(offset, offset + limit) },
          total: all.length,
        },
      }
    },
  )
  return { calls, all }
}

beforeEach(() => {
  getMock.mockReset()
  postMock.mockReset()
  createMock.mockClear()
})

describe('DwollaAdapter auth', () => {
  it('mints an application token with client_credentials and HTTP Basic auth', async () => {
    postMock.mockResolvedValue({
      data: { access_token: 'tok', token_type: 'Bearer', expires_in: 3599 },
    })
    const before = Date.now()
    const creds = await adapter.exchangeCredentials({ clientId: 'cid', clientSecret: 'csecret' })
    const after = Date.now()
    expect(postMock).toHaveBeenCalledTimes(1)
    const [url, body, cfg] = postMock.mock.calls[0] as [
      string,
      string,
      { headers: Record<string, string> },
    ]
    expect(url).toBe('https://api.dwolla.com/token')
    expect(body).toBe('grant_type=client_credentials')
    expect(cfg.headers.Authorization).toBe(`Basic ${Buffer.from('cid:csecret').toString('base64')}`)
    expect(cfg.headers['Content-Type']).toBe('application/x-www-form-urlencoded')
    expect(creds.accessToken).toBe('tok')
    expect(creds.refreshToken).toBeUndefined()
    expect(creds.extra).toEqual({ clientId: 'cid', clientSecret: 'csecret' })
    expect(creds.expiresAt).toBeInstanceOf(Date)
    // expires_in is in seconds: the token must live ~3599 s, not ~3.6 s.
    const expiresMs = (creds.expiresAt as Date).getTime()
    expect(expiresMs).toBeGreaterThanOrEqual(before + 3599 * 1000)
    expect(expiresMs).toBeLessThanOrEqual(after + 3599 * 1000)
  })

  it('trims whitespace pasted around the client id and secret', async () => {
    postMock.mockResolvedValue({
      data: { access_token: 'tok', token_type: 'Bearer', expires_in: 3600 },
    })
    const creds = await adapter.exchangeCredentials({
      clientId: '  cid\n',
      clientSecret: '\tcsecret ',
    })
    const [, , cfg] = postMock.mock.calls[0] as [
      string,
      string,
      { headers: Record<string, string> },
    ]
    expect(cfg.headers.Authorization).toBe(`Basic ${Buffer.from('cid:csecret').toString('base64')}`)
    expect(creds.extra).toEqual({ clientId: 'cid', clientSecret: 'csecret' })
  })

  it('refreshes by minting a new token from the stored client credentials', async () => {
    postMock.mockResolvedValue({
      data: { access_token: 'tok2', token_type: 'Bearer', expires_in: 3600 },
    })
    const creds = await adapter.refreshCredentials(CREDS)
    expect(creds.accessToken).toBe('tok2')
    const [, body] = postMock.mock.calls[0] as [string, string]
    expect(body).toBe('grant_type=client_credentials')
  })

  it('refuses a refresh with no stored client credentials instead of returning a dead token', async () => {
    await expect(adapter.refreshCredentials({ accessToken: 'x' })).rejects.toThrow(/reconnect/)
    expect(postMock).not.toHaveBeenCalled()
  })

  it('has no redirect OAuth flow', async () => {
    expect(() => adapter.getAuthUrl()).toThrow(/client-credentials/)
    await expect(adapter.exchangeCode()).rejects.toThrow(/client-credentials/)
    expect(adapter.credentialFields().map((f) => f.name)).toEqual(['clientId', 'clientSecret'])
  })
})

describe('DwollaAdapter client', () => {
  it('sends the HAL Accept header and a Bearer token to the production host', async () => {
    serve(1)
    await adapter.listCustomers(CREDS, { page: 1, limit: 10 })
    const cfg = createMock.mock.calls[0]?.[0] as unknown as {
      baseURL: string
      headers: Record<string, string>
    }
    expect(cfg.baseURL).toBe('https://api.dwolla.com')
    expect(cfg.headers.Accept).toBe('application/vnd.dwolla.v1.hal+json')
    expect(cfg.headers.Authorization).toBe('Bearer app-token')
  })
})

describe('DwollaAdapter.listCustomers', () => {
  it('sends only limit and offset for the caller page', async () => {
    const { calls } = serve(100)
    await adapter.listCustomers(CREDS, { page: 3, limit: 20 })
    expect(calls).toEqual([{ limit: 20, offset: 40 }])
  })

  it('serves 2L+1 rows across three pages, each once, with exact hasMore and total', async () => {
    const L = 10
    const { all } = serve(2 * L + 1)
    const seen: string[] = []
    const reports = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: L } as QueryParams)
      const rows = await adapter.listCustomers(CREDS, params)
      seen.push(...rows.map((r) => r.id))
      reports.push(readUpstreamPage(params))
    }
    expect(seen).toEqual(all.map((c) => c.id))
    expect(new Set(seen).size).toBe(2 * L + 1)
    expect(reports.map((r) => r?.hasMore)).toEqual([true, true, false])
    expect(reports.every((r) => r?.totalCount === 2 * L + 1)).toBe(true)
    expect(reports.every((r) => r?.pageSize === undefined)).toBe(true)
  })

  it('reports hasMore false when the collection is an exact multiple of the page size', async () => {
    serve(20)
    const params = withPageSink({ page: 2, limit: 10 } as QueryParams)
    const rows = await adapter.listCustomers(CREDS, params)
    expect(rows).toHaveLength(10)
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('clamps to the documented maximum of 200 and reports the size it sent', async () => {
    const { calls } = serve(450)
    const params = withPageSink({ page: 2, limit: 500 } as QueryParams)
    const rows = await adapter.listCustomers(CREDS, params)
    expect(calls).toEqual([{ limit: 200, offset: 200 }])
    expect(rows).toHaveLength(200)
    expect(readUpstreamPage(params)).toMatchObject({
      pageSize: 200,
      hasMore: true,
      totalCount: 450,
    })
  })

  it('declares the documented page maximum', () => {
    expect(adapter.capabilities.maxPageSize).toBe(200)
  })
})

describe('DwollaAdapter.getCustomer', () => {
  it('reads GET /customers/{id}', async () => {
    const c = customer(7)
    getMock.mockResolvedValue({ data: c })
    const res = await adapter.getCustomer(CREDS, c.id)
    expect(getMock).toHaveBeenCalledWith(`/customers/${c.id}`, { params: undefined })
    expect(res.id).toBe(c.id)
    expect(res.email).toBe('jane7@mail.com')
  })

  it('percent-encodes the id so it cannot change the path', async () => {
    getMock.mockResolvedValue({ data: customer(8) })
    await adapter.getCustomer(CREDS, 'a/b?c')
    expect(getMock).toHaveBeenCalledWith('/customers/a%2Fb%3Fc', { params: undefined })
  })
})

describe.each([
  ['listCharges', /cannot list charges/],
  ['getCharge', /cannot read charges/],
  ['listRefunds', /cannot list refunds/],
  ['getRefund', /cannot read refunds/],
  ['listPayouts', /cannot list payouts/],
  ['getPayout', /cannot read payouts/],
] as const)('DwollaAdapter.%s', (method, message) => {
  it('refuses with 501 NOT_SUPPORTED and sends no request', async () => {
    const fn = adapter[method].bind(adapter) as (c: Credentials, a: unknown) => Promise<unknown>
    const arg = method.startsWith('list') ? { page: 1, limit: 10 } : 'some-id'
    await expect(fn(CREDS, arg)).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
      message: expect.stringMatching(message),
    })
    expect(createMock).not.toHaveBeenCalled()
    expect(getMock).not.toHaveBeenCalled()
    expect(postMock).not.toHaveBeenCalled()
  })
})
