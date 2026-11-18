/**
 * Mural Pay list/get methods.
 *
 * Documented endpoints (embedded OpenAPI of the reference pages):
 * - POST /api/payins/search (https://developers.muralpay.com/reference/searchpayins.md)
 *   query: limit (number), nextId (uuid), payinBatchId (uuid); no request body.
 * - POST /api/payouts/search (https://developers.muralpay.com/reference/searchpayoutrequests.md)
 *   query: limit (number), nextId (uuid); requestBody required,
 *   MuralSearchPayoutRequestsInput ("An empty filter will result in all payouts being returned.").
 * - Both answer PaginatedResponse { total (required), nextId (uuid) } + results[].
 * - GET /api/payins/payin/{id}, GET /api/payouts/payout/{id} ("Payout request ID").
 * - Server: https://api.muralpay.com.
 *
 * The fake honours only those parameters and paths.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { withPageSink, readUpstreamPage, _resetCursorPager } from '@opensteward/shared'
import type { QueryParams } from '@opensteward/shared'
import { MuralPayAdapter } from '../../../../../../src/verticals/payments/adapters/mural-pay/index'
import { ChargeSchema } from '../../../../../../src/verticals/payments/schema/charge'
import { PayoutSchema } from '../../../../../../src/verticals/payments/schema/payout'

const CREDS = { accessToken: 'mural-api-key' }

interface Req {
  method: 'get' | 'post'
  path: string
  body: unknown
  params: Record<string, unknown> | undefined
}

function uuid(prefix: string, i: number): string {
  return `${prefix}${String(i).padStart(4, '0')}-0000-4000-8000-000000000000`
}

function payin(id: string, fiat = true): Record<string, unknown> {
  return {
    id,
    destinationAccountId: '5d75e362-0812-4ea8-b203-c7c3a09f8473',
    payinRail: fiat ? 'ACH' : 'BLOCKCHAIN',
    payinStatus: { type: 'created' },
    sourceAmount: fiat
      ? { currencySymbol: 'USD', exponent: 2, type: 'fiat', value: '10000' }
      : {
          type: 'blockchain',
          tokenSymbol: 'USDC',
          exponent: 6,
          value: '2500000',
          blockchain: 'TRON',
        },
    settlementStrategy: {},
    settlementDetails: {},
    fees: {},
    createdAt: '2025-04-05T04:24:03.862Z',
    updatedAt: '2025-04-05T04:24:03.862Z',
  }
}

function fiatPayout(id: string): Record<string, unknown> {
  return {
    id,
    createdAt: '2025-04-05T04:24:03.869Z',
    updatedAt: '2025-04-05T04:26:24.198Z',
    amount: { tokenSymbol: 'USDC', tokenAmount: 100 },
    details: {
      type: 'fiat',
      fiatAndRailCode: 'cop',
      fiatAmount: { fiatAmount: 305421.23, fiatCurrencyCode: 'COP' },
      transactionFee: { tokenSymbol: 'USDC', tokenAmount: 0.35 },
      exchangeFeePercentage: 1.4,
      exchangeRate: 3108.613065,
      feeTotal: { tokenSymbol: 'USDC', tokenAmount: 1.75 },
      fiatPayoutStatus: { type: 'pending', initiatedAt: '2025-04-05T04:27:01.901Z' },
    },
    recipientInfo: { type: 'counterparty' },
  }
}

function blockchainPayout(id: string): Record<string, unknown> {
  return {
    id,
    createdAt: '2025-04-05T04:24:03.869Z',
    updatedAt: '2025-04-05T04:26:24.198Z',
    amount: { tokenSymbol: 'USDC', tokenAmount: 100 },
    details: {
      type: 'blockchain',
      walletAddress: '0xabc',
      blockchain: 'POLYGON',
      token: 'USDC',
      status: 'EXECUTED',
      destinationAmount: { tokenSymbol: 'USDC', tokenAmount: 100 },
    },
    recipientInfo: { type: 'inline' },
  }
}

function payoutRequest(
  id: string,
  payouts: Array<Record<string, unknown>>,
): Record<string, unknown> {
  return {
    id,
    createdAt: '2025-04-05T04:24:03.862Z',
    updatedAt: '2025-04-05T04:24:03.862Z',
    sourceAccountId: '5d75e362-0812-4ea8-b203-c7c3a09f8473',
    status: 'EXECUTED',
    statusV2: { type: 'executed' },
    payouts,
  }
}

/**
 * A fake Mural server. `collections` holds each search endpoint's results in
 * order; `nextId` is the id of the first result of the next page.
 */
function fakeMural(collections: {
  payins?: Array<Record<string, unknown>>
  payoutRequests?: Array<Record<string, unknown>>
}): { reqs: Req[] } {
  const reqs: Req[] = []
  function search(
    rows: Array<Record<string, unknown>>,
    params: Record<string, unknown> | undefined,
  ): Record<string, unknown> {
    for (const k of Object.keys(params ?? {})) {
      if (k !== 'limit' && k !== 'nextId') throw new Error(`undocumented query parameter ${k}`)
    }
    const limit = Number(params?.limit ?? 10)
    let from = 0
    if (params?.nextId !== undefined) {
      from = rows.findIndex((r) => r.id === params.nextId)
      if (from < 0) throw Object.assign(new Error('bad nextId'), { response: { status: 400 } })
    }
    const page = rows.slice(from, from + limit)
    const next = rows[from + limit]
    return { total: rows.length, ...(next ? { nextId: next.id } : {}), results: page }
  }
  const post = vi.fn(
    async (p: string, body?: unknown, config?: { params?: Record<string, unknown> }) => {
      const params = config?.params
      reqs.push({ method: 'post', path: p, body, params: params ? { ...params } : undefined })
      if (p === '/api/payins/search') {
        if (body !== undefined) throw new Error('Search Payins documents no request body')
        return { data: search(collections.payins ?? [], params) }
      }
      if (p === '/api/payouts/search') {
        if (body === undefined || body === null || typeof body !== 'object') {
          throw Object.assign(new Error('requestBody is required'), { response: { status: 400 } })
        }
        return { data: search(collections.payoutRequests ?? [], params) }
      }
      throw Object.assign(new Error(`Cannot POST ${p}`), { response: { status: 404 } })
    },
  )
  const get = vi.fn(async (p: string, config?: { params?: Record<string, unknown> }) => {
    reqs.push({ method: 'get', path: p, body: undefined, params: config?.params })
    const payinMatch = /^\/api\/payins\/payin\/([^/]+)$/.exec(p)
    if (payinMatch) {
      const row = (collections.payins ?? []).find((r) => r.id === payinMatch[1])
      if (row) return { data: row }
    }
    const payoutMatch = /^\/api\/payouts\/payout\/([^/]+)$/.exec(p)
    if (payoutMatch) {
      const row = (collections.payoutRequests ?? []).find((r) => r.id === payoutMatch[1])
      if (row) return { data: row }
    }
    throw Object.assign(new Error(`Cannot GET ${p}`), { response: { status: 404 } })
  })
  vi.spyOn(axios, 'create').mockReturnValue({ get, post, defaults: {} } as never)
  return { reqs }
}

async function walk<T extends { id: string }>(
  call: (params: QueryParams) => Promise<T[]>,
  limit: number,
  pages: number,
): Promise<{ ids: string[]; hasMore: Array<boolean | undefined>; sizes: number[] }> {
  const ids: string[] = []
  const hasMore: Array<boolean | undefined> = []
  const sizes: number[] = []
  for (let page = 1; page <= pages; page++) {
    const params = withPageSink({ page, limit } as QueryParams)
    const rows = await call(params)
    ids.push(...rows.map((r) => r.id))
    sizes.push(rows.length)
    hasMore.push(readUpstreamPage(params)?.hasMore)
  }
  return { ids, hasMore, sizes }
}

afterEach(() => {
  vi.restoreAllMocks()
  _resetCursorPager()
})

describe('mural-pay listCharges (Search Payins)', () => {
  it('POSTs /api/payins/search with only limit, then limit + nextId, and no body', async () => {
    const all = Array.from({ length: 5 }, (_, i) => payin(uuid('a', i)))
    const { reqs } = fakeMural({ payins: all })
    const adapter = new MuralPayAdapter()
    await adapter.listCharges(CREDS, withPageSink({ page: 1, limit: 2 } as QueryParams))
    await adapter.listCharges(CREDS, withPageSink({ page: 2, limit: 2 } as QueryParams))
    expect(reqs[0]).toEqual({
      method: 'post',
      path: '/api/payins/search',
      body: undefined,
      params: { limit: 2 },
    })
    expect(reqs.some((r) => r.params?.nextId === all[2]!.id)).toBe(true)
  })

  it('walks N = 2L+1 payins: every id once, hasMore exact', async () => {
    const L = 3
    const all = Array.from({ length: 2 * L + 1 }, (_, i) => payin(uuid('a', i)))
    fakeMural({ payins: all })
    const adapter = new MuralPayAdapter()
    const got = await walk((p) => adapter.listCharges(CREDS, p), L, 4)
    expect(got.ids).toEqual(all.map((r) => r.id))
    expect(new Set(got.ids).size).toBe(all.length)
    expect(got.sizes).toEqual([3, 3, 1, 0])
    expect(got.hasMore.slice(0, 3)).toEqual([true, true, false])
  })

  it('leaves out token-denominated payins and still serves full pages', async () => {
    const L = 2
    const all = [
      payin(uuid('a', 0)),
      payin(uuid('a', 1), false),
      payin(uuid('a', 2)),
      payin(uuid('a', 3)),
      payin(uuid('a', 4), false),
      payin(uuid('a', 5)),
      payin(uuid('a', 6)),
    ]
    fakeMural({ payins: all })
    const adapter = new MuralPayAdapter()
    const got = await walk((p) => adapter.listCharges(CREDS, p), L, 3)
    const fiat = all.filter((r) => (r.sourceAmount as { type: string }).type === 'fiat')
    expect(got.ids).toEqual(fiat.map((r) => r.id))
    expect(got.sizes).toEqual([2, 2, 1])
    expect(got.hasMore).toEqual([true, true, false])
  })

  it('returns rows that parse with ChargeSchema', async () => {
    fakeMural({ payins: [payin(uuid('a', 0))] })
    const rows = await new MuralPayAdapter().listCharges(CREDS, {
      page: 1,
      limit: 10,
    } as QueryParams)
    expect(rows).toHaveLength(1)
    expect(() => ChargeSchema.parse(rows[0])).not.toThrow()
  })

  it('getCharge reads GET /api/payins/payin/{id}', async () => {
    const id = uuid('a', 0)
    const { reqs } = fakeMural({ payins: [payin(id)] })
    const charge = await new MuralPayAdapter().getCharge(CREDS, id)
    expect(reqs).toEqual([
      { method: 'get', path: `/api/payins/payin/${id}`, body: undefined, params: undefined },
    ])
    expect(ChargeSchema.parse(charge).id).toBe(id)
  })
})

describe('mural-pay listPayouts (Search Payout Requests, flattened)', () => {
  /** Uneven upstream pages: requests hold 1, 3, 0, 2, 1 fiat payouts, plus one blockchain payout. */
  function requests(): Array<Record<string, unknown>> {
    const counts = [1, 3, 0, 2, 1]
    let n = 0
    return counts.map((c, i) => {
      const payouts = Array.from({ length: c }, () => fiatPayout(uuid('p', n++)))
      if (i === 1) payouts.splice(1, 0, blockchainPayout(uuid('b', i)))
      return payoutRequest(uuid('r', i), payouts)
    })
  }

  function expectedIds(reqs: Array<Record<string, unknown>>): string[] {
    return reqs.flatMap((r) =>
      (r.payouts as Array<Record<string, unknown>>)
        .filter((p) => (p.details as { type: string }).type === 'fiat')
        .map((p) => `${String(r.id)}:${String(p.id)}`),
    )
  }

  it('POSTs /api/payouts/search with an empty JSON body and limit/nextId in the query', async () => {
    const all = requests()
    const { reqs } = fakeMural({ payoutRequests: all })
    const adapter = new MuralPayAdapter()
    await adapter.listPayouts(CREDS, withPageSink({ page: 1, limit: 1 } as QueryParams))
    expect(reqs[0]).toEqual({
      method: 'post',
      path: '/api/payouts/search',
      body: {},
      params: { limit: 1 },
    })
    const withCursor = reqs.find((r) => r.params?.nextId !== undefined)
    expect(withCursor?.params).toEqual({ limit: 1, nextId: all[1]!.id })
  })

  it('walks N = 2L+1 payouts across uneven upstream pages: every id once, hasMore exact', async () => {
    const L = 3
    const all = requests()
    const want = expectedIds(all)
    expect(want).toHaveLength(2 * L + 1)
    fakeMural({ payoutRequests: all })
    const adapter = new MuralPayAdapter()
    const got = await walk((p) => adapter.listPayouts(CREDS, p), L, 4)
    expect(got.ids).toEqual(want)
    expect(new Set(got.ids).size).toBe(want.length)
    expect(got.sizes).toEqual([3, 3, 1, 0])
    expect(got.hasMore.slice(0, 3)).toEqual([true, true, false])
  })

  it('returns rows that parse with PayoutSchema', async () => {
    fakeMural({ payoutRequests: requests() })
    const rows = await new MuralPayAdapter().listPayouts(CREDS, {
      page: 1,
      limit: 50,
    } as QueryParams)
    expect(rows).toHaveLength(7)
    for (const r of rows) expect(() => PayoutSchema.parse(r)).not.toThrow()
  })

  it('getPayout reads back a listed id through GET /api/payouts/payout/{payoutRequestId}', async () => {
    const all = requests()
    const { reqs } = fakeMural({ payoutRequests: all })
    const adapter = new MuralPayAdapter()
    const [, second] = await adapter.listPayouts(CREDS, { page: 1, limit: 50 } as QueryParams)
    reqs.length = 0
    const got = await adapter.getPayout(CREDS, second!.id)
    expect(reqs).toEqual([
      {
        method: 'get',
        path: `/api/payouts/payout/${String(all[1]!.id)}`,
        body: undefined,
        params: undefined,
      },
    ])
    expect(got).toEqual(second)
  })

  it('getPayout rejects an id that is not <payoutRequestId>:<payoutId> without a request', async () => {
    const { reqs } = fakeMural({ payoutRequests: requests() })
    await expect(new MuralPayAdapter().getPayout(CREDS, uuid('r', 0))).rejects.toMatchObject({
      statusCode: 400,
    })
    expect(reqs).toHaveLength(0)
  })

  it('getPayout 404s a payout id the request does not hold', async () => {
    fakeMural({ payoutRequests: requests() })
    await expect(
      new MuralPayAdapter().getPayout(CREDS, `${uuid('r', 0)}:${uuid('p', 99)}`),
    ).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('mural-pay paging edge cases', () => {
  /** A server whose search pages are empty yet still carry a nextId. */
  function emptyPagesWithNextId(): { calls: () => number } {
    let n = 0
    const post = vi.fn(async () => {
      n++
      if (n > 3) throw new Error('kept paging past an empty results page')
      return { data: { total: 0, nextId: uuid('z', n), results: [] } }
    })
    vi.spyOn(axios, 'create').mockReturnValue({ get: vi.fn(), post, defaults: {} } as never)
    return { calls: () => n }
  }

  it.each([
    ['listCharges', (a: MuralPayAdapter, p: QueryParams) => a.listCharges(CREDS, p)],
    ['listPayouts', (a: MuralPayAdapter, p: QueryParams) => a.listPayouts(CREDS, p)],
  ] as const)('%s ends on an empty results page even when nextId is set', async (_n, call) => {
    const { calls } = emptyPagesWithNextId()
    const params = withPageSink({ page: 1, limit: 2 } as QueryParams)
    await expect(call(new MuralPayAdapter(), params)).resolves.toEqual([])
    expect(calls()).toBe(1)
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('keeps payins and payouts cursors apart when the two walks interleave', async () => {
    const L = 2
    const payins = Array.from({ length: 2 * L + 1 }, (_, i) => payin(uuid('a', i)))
    const requests = Array.from({ length: 2 * L + 1 }, (_, i) =>
      payoutRequest(uuid('r', i), [fiatPayout(uuid('p', i))]),
    )
    fakeMural({ payins, payoutRequests: requests })
    const adapter = new MuralPayAdapter()
    const chargeIds: string[] = []
    const payoutIds: string[] = []
    for (let page = 1; page <= 3; page++) {
      const c = await adapter.listCharges(CREDS, withPageSink({ page, limit: L } as QueryParams))
      const p = await adapter.listPayouts(CREDS, withPageSink({ page, limit: L } as QueryParams))
      chargeIds.push(...c.map((r) => r.id))
      payoutIds.push(...p.map((r) => r.id))
    }
    expect(chargeIds).toEqual(payins.map((r) => r.id))
    expect(payoutIds).toEqual(requests.map((r, i) => `${String(r.id)}:${uuid('p', i)}`))
  })

  it('getCharge on a token-denominated payin is a typed 501, not a 500', async () => {
    const id = uuid('a', 0)
    fakeMural({ payins: [payin(id, false)] })
    await expect(new MuralPayAdapter().getCharge(CREDS, id)).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
  })
})

describe('mural-pay exchangeCredentials', () => {
  it('takes the apiKey field as the Bearer token', async () => {
    await expect(new MuralPayAdapter().exchangeCredentials({ apiKey: ' k1 ' })).resolves.toEqual({
      accessToken: 'k1',
    })
  })

  it.each([[{}], [{ apiKey: '  ' }], [{ secretKey: 'k1' }]])(
    'rejects %j with a 400 instead of storing an empty token',
    async (fields) => {
      await expect(
        new MuralPayAdapter().exchangeCredentials(fields as Record<string, string>),
      ).rejects.toMatchObject({ statusCode: 400 })
    },
  )
})

describe('mural-pay refused methods', () => {
  it.each([
    [
      'listCustomers',
      (a: MuralPayAdapter) => a.listCustomers(CREDS, { page: 1, limit: 10 } as QueryParams),
    ],
    ['getCustomer', (a: MuralPayAdapter) => a.getCustomer(CREDS, 'x')],
    [
      'listRefunds',
      (a: MuralPayAdapter) => a.listRefunds(CREDS, { page: 1, limit: 10 } as QueryParams),
    ],
    [
      'listBalanceTransactions',
      (a: MuralPayAdapter) =>
        a.listBalanceTransactions(CREDS, { page: 1, limit: 10 } as QueryParams),
    ],
  ])('%s throws 501 NOT_SUPPORTED and sends no request', async (_name, call) => {
    const { reqs } = fakeMural({})
    await expect(call(new MuralPayAdapter())).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(reqs).toHaveLength(0)
  })
})

describe('mural-pay client', () => {
  it('targets the documented production server with Bearer auth', () => {
    const create = vi.spyOn(axios, 'create')
    fakeMural({})
    new MuralPayAdapter().listCharges(CREDS, { page: 1, limit: 1 } as QueryParams).catch(() => {})
    const config = create.mock.calls[0]![0] as { baseURL: string; headers: Record<string, string> }
    expect(config.baseURL).toBe('https://api.muralpay.com')
    expect(config.headers.Authorization).toBe('Bearer mural-api-key')
  })
})
