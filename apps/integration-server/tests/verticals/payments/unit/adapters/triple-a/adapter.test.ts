/**
 * TripleAAdapter against a fake of Triple-A's documented HTTP surface
 * (Crypto-Payments.yaml and Crypto-Payouts.yaml at
 * https://developers.triple-a.io/api/v1/projects/triplea-technologies/triplea-api-doc/nodes/references/).
 *
 * - POST https://api.triple-a.io/api/v2/oauth/token, form-encoded
 *   client_id / client_secret / grant_type=client_credentials; 200 body
 *   access_token, token_type, expires_in (seconds).
 * - GET /payments and GET /payouts: query params start_date, end_date, sort,
 *   page_size ("Maximum value is `100`", default 10), offset (a PAGE index:
 *   "`offset=1&page_size=10` will retrieve records 11-20"), status. The 200 body
 *   is a bare array.
 * - GET /payment/{payment_reference} and GET /payout/withdraw/{payout_reference}.
 *
 * The fake honours only offset, page_size and sort, and rejects any other key.
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

import { TripleAAdapter } from '../../../../../../src/verticals/payments/adapters/triple-a'
import { ChargeSchema } from '../../../../../../src/verticals/payments/schema/charge'
import { PayoutSchema } from '../../../../../../src/verticals/payments/schema/payout'

const adapter = new TripleAAdapter()
const CREDS: Credentials = {
  accessToken: 'tok',
  extra: { clientId: 'oacid-1', clientSecret: 'Qi42-secret' },
}
const DOCUMENTED = new Set(['offset', 'page_size', 'sort'])

function payment(i: number) {
  return {
    type: 'triplea',
    payment_reference: `SDF-${String(i).padStart(6, '0')}-PMT`,
    crypto_currency: 'testBTC',
    crypto_amount: 0.001067203,
    order_currency: 'USD',
    order_amount: 10,
    status: 'good',
    status_date: '2020-01-26T03:57:22Z',
  }
}

function payout(i: number) {
  return {
    payout_reference: `AGJ-${String(i).padStart(6, '0')}-PYT`,
    type: 'withdraw',
    local_currency: 'SGD',
    local_amount: 10,
    status: 'done',
    status_date: '2020-01-26T03:57:22Z',
  }
}

/** Serve `n` rows at `path`, honouring only offset (page index), page_size and sort. */
function serve(path: string, rows: unknown[]) {
  const calls: Record<string, unknown>[] = []
  getMock.mockImplementation(async (p: string, cfg: { params?: Record<string, unknown> } = {}) => {
    if (p !== path) throw new Error(`unexpected path ${p}`)
    const params = cfg.params ?? {}
    calls.push({ ...params })
    for (const k of Object.keys(params)) {
      if (!DOCUMENTED.has(k)) throw new Error(`undocumented query param ${k}`)
    }
    const size = params['page_size'] === undefined ? 10 : Number(params['page_size'])
    if (!Number.isInteger(size) || size < 1 || size > 100) throw new Error(`bad page_size ${size}`)
    const index = params['offset'] === undefined ? 0 : Number(params['offset'])
    if (!Number.isInteger(index) || index < 0) throw new Error(`bad offset ${index}`)
    return { data: rows.slice(index * size, index * size + size) }
  })
  return calls
}

beforeEach(() => {
  getMock.mockReset()
  postMock.mockReset()
  createMock.mockClear()
})

describe('TripleAAdapter auth', () => {
  it('declares client-credential fields and no authorization-code flow', () => {
    expect(adapter.credentialFields().map((f) => f.name)).toEqual(['clientId', 'clientSecret'])
    expect(() => adapter.getAuthUrl()).toThrow(/client-credentials/)
  })

  it('mints a token with the documented form-encoded client_credentials request', async () => {
    postMock.mockResolvedValue({
      data: { access_token: '1ba8-token', token_type: 'bearer', expires_in: 3600 },
    })
    const before = Date.now()
    const creds = await adapter.exchangeCredentials({
      clientId: ' oacid-1 ',
      clientSecret: 'Qi42-secret\n',
    })
    const after = Date.now()
    expect(postMock).toHaveBeenCalledTimes(1)
    const [url, body, cfg] = postMock.mock.calls[0] as [
      string,
      string,
      { headers: Record<string, string> },
    ]
    expect(url).toBe('https://api.triple-a.io/api/v2/oauth/token')
    expect(Object.fromEntries(new URLSearchParams(body))).toEqual({
      client_id: 'oacid-1',
      client_secret: 'Qi42-secret',
      grant_type: 'client_credentials',
    })
    expect(cfg.headers['Content-Type']).toBe('application/x-www-form-urlencoded')
    expect(creds.accessToken).toBe('1ba8-token')
    expect(creds.extra).toEqual({ clientId: 'oacid-1', clientSecret: 'Qi42-secret' })
    const expiresMs = (creds.expiresAt as Date).getTime()
    expect(expiresMs).toBeGreaterThanOrEqual(before + 3600 * 1000)
    expect(expiresMs).toBeLessThanOrEqual(after + 3600 * 1000)
  })

  it('refreshes by minting a new token from the stored client credentials', async () => {
    postMock.mockResolvedValue({ data: { access_token: 'tok2', token_type: 'bearer' } })
    const creds = await adapter.refreshCredentials(CREDS)
    expect(creds.accessToken).toBe('tok2')
    const [, body] = postMock.mock.calls[0] as [string, string]
    expect(new URLSearchParams(body).get('client_id')).toBe('oacid-1')
  })

  it('refuses to refresh without stored client credentials', async () => {
    await expect(adapter.refreshCredentials({ accessToken: 'x' })).rejects.toThrow(/reconnect/)
    expect(postMock).not.toHaveBeenCalled()
  })

  it('sends the bearer token against the documented base URL', async () => {
    serve('/payments', [])
    await adapter.listCharges(CREDS, { page: 1, limit: 10 })
    const cfg = createMock.mock.calls[0]?.[0] as {
      baseURL: string
      headers: Record<string, string>
    }
    expect(cfg.baseURL).toBe('https://api.triple-a.io/api/v2')
    expect(cfg.headers.Authorization).toBe('Bearer tok')
  })
})

describe.each([
  {
    name: 'listCharges',
    path: '/payments',
    make: payment,
    list: (p: QueryParams) => adapter.listCharges(CREDS, p),
    schema: ChargeSchema,
    idOf: (i: number) => payment(i).payment_reference,
  },
  {
    name: 'listPayouts',
    path: '/payouts',
    make: payout,
    list: (p: QueryParams) => adapter.listPayouts(CREDS, p),
    schema: PayoutSchema,
    idOf: (i: number) => payout(i).payout_reference,
  },
])('TripleAAdapter.$name', ({ path, make, list, schema, idOf }) => {
  it('sends offset as the 0-based page index, page_size as the limit, sort=asc', async () => {
    const calls = serve(path, [])
    await list({ page: 3, limit: 25 })
    expect(calls).toEqual([{ offset: 2, page_size: 25, sort: 'asc' }])
  })

  it('walks N = 2L+1 rows serving every id once, with an exact hasMore', async () => {
    const L = 4
    const all = Array.from({ length: 2 * L + 1 }, (_, i) => make(i + 1))
    serve(path, all)
    const seen: string[] = []
    const hasMore: (boolean | undefined)[] = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: L })
      const rows = await list(params)
      for (const r of rows) {
        schema.parse(r)
        seen.push(r.id)
      }
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(all.map((_, i) => idOf(i + 1)))
    expect(new Set(seen).size).toBe(seen.length)
    expect(hasMore).toEqual([true, true, false])
  })

  it('clamps the page size to the documented maximum of 100 and reports it', async () => {
    const all = Array.from({ length: 250 }, (_, i) => make(i + 1))
    const calls = serve(path, all)
    const params = withPageSink({ page: 2, limit: 150 })
    const rows = await list(params)
    expect(calls).toEqual([{ offset: 1, page_size: 100, sort: 'asc' }])
    expect(rows.map((r) => r.id)).toEqual(all.slice(100, 200).map((_, i) => idOf(101 + i)))
    expect(readUpstreamPage(params)).toEqual({ hasMore: true, pageSize: 100 })
  })

  it('sends the documented default page_size of 10 when no limit is given', async () => {
    const all = Array.from({ length: 25 }, (_, i) => make(i + 1))
    const calls = serve(path, all)
    const params = withPageSink({ page: 1 })
    const rows = await list(params)
    expect(calls).toEqual([{ offset: 0, page_size: 10, sort: 'asc' }])
    expect(rows).toHaveLength(10)
    expect(readUpstreamPage(params)).toEqual({ hasMore: true })
  })

  it('reports hasMore alone (no pageSize) when the limit was not clamped', async () => {
    serve(
      path,
      Array.from({ length: 5 }, (_, i) => make(i + 1)),
    )
    const params = withPageSink({ page: 1, limit: 3 })
    await list(params)
    expect(readUpstreamPage(params)).toEqual({ hasMore: true })
  })

  it('throws when the 200 body is not the documented bare array', async () => {
    getMock.mockResolvedValue({ data: { data: [make(1)] } })
    await expect(list({ page: 1, limit: 10 })).rejects.toThrow(/did not return a JSON array/)
  })

  it('sends no undocumented updated_after / cursor / limit parameter', async () => {
    const calls = serve(path, [])
    await list({ page: 1, limit: 10, updatedAfter: new Date('2024-01-01T00:00:00Z') })
    expect(calls).toEqual([{ offset: 0, page_size: 10, sort: 'asc' }])
  })
})

describe('TripleAAdapter get methods', () => {
  it('getCharge reads GET /payment/{payment_reference}', async () => {
    getMock.mockResolvedValue({ data: payment(7) })
    const charge = ChargeSchema.parse(await adapter.getCharge(CREDS, 'SDF-000007-PMT'))
    expect(getMock.mock.calls[0]?.[0]).toBe('/payment/SDF-000007-PMT')
    expect(charge.id).toBe('SDF-000007-PMT')
  })

  it('getPayout reads GET /payout/withdraw/{payout_reference}', async () => {
    getMock.mockResolvedValue({ data: payout(7) })
    const po = PayoutSchema.parse(await adapter.getPayout(CREDS, 'AGJ-000007-PYT'))
    expect(getMock.mock.calls[0]?.[0]).toBe('/payout/withdraw/AGJ-000007-PYT')
    expect(po.id).toBe('AGJ-000007-PYT')
  })
})
