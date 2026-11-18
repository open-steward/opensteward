/**
 * Instamojo (MDP v2) list/get contract.
 *
 * Host and auth, from https://docs.instamojo.com/v2-mdp/reference/setup1.md:
 *   "The base API endpoint for the production environment is <https://api.instamojo.com/>"
 * and from the List Payments / List Payouts OpenAPI:
 *   "securitySchemes": { "sec0": { "type": "apiKey", "name": "Authorization", "in": "header",
 *   "x-default": "Bearer {{access_token}}" } }
 *
 * List Payments (https://docs.instamojo.com/v2-mdp/reference/payments.md) is
 * GET /v2/payments/ with query params id, buyer, seller, payout, product,
 * min_created_at, max_created_at, min_updated_at, max_updated_at, order_id,
 * and responds `{ count, next, previous, payments }`, the example's next being
 * "https://test.instamojo.com/v2/payments/?page=2". List Payouts
 * (https://docs.instamojo.com/v2-mdp/reference/payouts.md) is GET /v2/payouts/
 * with id, start_time, end_time and responds `{ count, next, previous, payouts }`.
 *
 * Neither documents a page-size parameter, so one upstream page is not one
 * caller page: the adapter follows `next` and cuts the caller's rows with
 * pageByRows. The fake honours ONLY the documented params: `page` (the one the
 * documented next link carries), `id`, and for payments `min_updated_at`.
 * Anything else is ignored, as an unknown parameter would be.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { withPageSink, readUpstreamPage, _resetRowPager } from '@opensteward/shared'
import type { QueryParams } from '@opensteward/shared'
import { InstamojoAdapter } from '../../../../../../src/verticals/payments/adapters/instamojo/index'

const CREDS = { accessToken: 'at_test', refreshToken: 'rt_test' }
const CONFIG = { clientId: 'cid', clientSecret: 'secret', redirectUri: 'https://app.example/cb' }

interface Request {
  path: string
  params: Record<string, unknown>
}

interface Case {
  method: 'listCharges' | 'listPayouts'
  path: string
  envelope: 'payments' | 'payouts'
  row: (id: string, i: number) => Record<string, unknown>
}

const paymentRow = (id: string, i: number): Record<string, unknown> => ({
  id,
  title: 'test payment',
  status: true,
  currency: 'INR',
  amount: '9494.00',
  failure: null,
  created_at: '2019-05-20T09:30:23.808234Z',
  updated_at: new Date(Date.UTC(2019, 4, 1) + i * 60_000).toISOString(),
})

const payoutRow = (id: string): Record<string, unknown> => ({
  id,
  status: true,
  paid_out_at: '2019-04-22T12:23:19.239722Z',
  currency: 'INR',
  paid_amount: '1570.75',
})

const CASES: Case[] = [
  { method: 'listCharges', path: '/v2/payments/', envelope: 'payments', row: paymentRow },
  { method: 'listPayouts', path: '/v2/payouts/', envelope: 'payouts', row: payoutRow },
]

let createConfig: Record<string, unknown> | undefined

/** A fake MDP collection of `n` rows at `c.path`, `perPage` a page, paged by `page` only. */
function fake(
  c: Case,
  n: number,
  perPage = 7,
): { requests: Request[]; ids: string[]; rows: Array<Record<string, unknown>> } {
  const ids = Array.from({ length: n }, (_, i) => `MOJO${String(i).padStart(5, '0')}`)
  const rows = ids.map((id, i) => c.row(id, i))
  const requests: Request[] = []
  const get = vi.fn(async (path: string, config?: { params?: Record<string, unknown> }) => {
    const params = { ...(config?.params ?? {}) }
    requests.push({ path, params })
    if (path !== c.path) throw new Error(`unexpected path ${path}`)
    let matching = rows
    if (typeof params['id'] === 'string') matching = matching.filter((r) => r.id === params['id'])
    if (c.envelope === 'payments' && typeof params['min_updated_at'] === 'string') {
      const min = params['min_updated_at']
      matching = matching.filter((r) => String(r.updated_at) >= min)
    }
    const page = params['page'] === undefined ? 1 : Number(params['page'])
    if (!Number.isInteger(page) || page < 1) {
      throw Object.assign(new Error('Invalid page.'), { response: { status: 404 } })
    }
    const pages = Math.max(1, Math.ceil(matching.length / perPage))
    const slice = matching.slice((page - 1) * perPage, page * perPage)
    // Keep the filters on the next link, as a DRF next link does.
    const q = new URLSearchParams()
    for (const [k, v] of Object.entries(params)) if (k !== 'page') q.set(k, String(v))
    q.set('page', String(page + 1))
    return {
      data: {
        count: matching.length,
        next: page < pages ? `https://test.instamojo.com${c.path}?${q.toString()}` : null,
        previous: page > 1 ? `https://test.instamojo.com${c.path}?page=${page - 1}` : null,
        [c.envelope]: slice,
      },
    }
  })
  vi.spyOn(axios, 'create').mockImplementation(((cfg: Record<string, unknown>) => {
    createConfig = cfg
    return { get, post: vi.fn(), defaults: {} }
  }) as never)
  return { requests, ids, rows }
}

async function drive(
  method: Case['method'],
  L: number,
  pages: number,
  extra: Partial<QueryParams> = {},
): Promise<{ ids: string[]; hasMore: Array<boolean | undefined>; sizes: number[] }> {
  const adapter = new InstamojoAdapter(CONFIG)
  const ids: string[] = []
  const hasMore: Array<boolean | undefined> = []
  const sizes: number[] = []
  for (let page = 1; page <= pages; page++) {
    const params = withPageSink({ page, limit: L, ...extra } as QueryParams)
    const out = await adapter[method](CREDS, params)
    sizes.push(out.length)
    ids.push(...out.map((r) => r.id))
    hasMore.push(readUpstreamPage(params)?.hasMore)
  }
  return { ids, hasMore, sizes }
}

afterEach(() => {
  vi.restoreAllMocks()
  _resetRowPager()
  createConfig = undefined
})

describe('Instamojo client', () => {
  it('calls the documented MDP host with a Bearer token', async () => {
    fake(CASES[0]!, 1)
    await new InstamojoAdapter(CONFIG).listCharges(CREDS, withPageSink({ page: 1, limit: 5 }))
    expect(createConfig?.['baseURL']).toBe('https://api.instamojo.com')
    expect((createConfig?.['headers'] as Record<string, string>)['Authorization']).toBe(
      'Bearer at_test',
    )
  })
})

describe.each(CASES)('Instamojo $method paging', (c) => {
  it('serves 2L+1 rows once each across uneven upstream pages, with exact hasMore', async () => {
    const L = 4
    const { ids } = fake(c, 2 * L + 1, 3)
    const got = await drive(c.method, L, 3)
    expect(got.ids).toEqual(ids)
    expect(got.sizes).toEqual([L, L, 1])
    expect(got.hasMore).toEqual([true, true, false])
  })

  it('serves 2L+1 rows once each when the upstream page is larger than L', async () => {
    const L = 10
    const { ids } = fake(c, 2 * L + 1, 7)
    const got = await drive(c.method, L, 3)
    expect(got.ids).toEqual(ids)
    expect(got.sizes).toEqual([L, L, 1])
    expect(got.hasMore).toEqual([true, true, false])
  })

  it('reaches later pages by following next, and sends no size parameter', async () => {
    const L = 7
    const { requests } = fake(c, 2 * L + 1, 7)
    await drive(c.method, L, 3)
    expect(requests.every((r) => r.path === c.path)).toBe(true)
    expect(requests.map((r) => r.params['page'])).toEqual([undefined, '2', '3'])
    for (const r of requests) {
      expect(r.params).not.toHaveProperty('limit')
      expect(r.params).not.toHaveProperty('cursor')
      expect(r.params).not.toHaveProperty('updated_after')
    }
  })

  it('never sends the token to the host named in a next link', async () => {
    const { requests } = fake(c, 20, 7)
    await drive(c.method, 20, 1)
    // The documented next link names test.instamojo.com; only its query is used.
    expect(requests.map((r) => r.path)).toEqual([c.path, c.path, c.path])
  })

  it('serves an empty collection with hasMore false', async () => {
    fake(c, 0)
    const got = await drive(c.method, 10, 1)
    expect(got.ids).toEqual([])
    expect(got.hasMore).toEqual([false])
  })

  it('serves a page asked for cold', async () => {
    const L = 5
    const { ids } = fake(c, 2 * L + 1, 3)
    const params = withPageSink({ page: 2, limit: L } as QueryParams)
    const out = await new InstamojoAdapter(CONFIG)[c.method](CREDS, params)
    expect(out.map((r) => r.id)).toEqual(ids.slice(L, 2 * L))
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })
})

describe('Instamojo listCharges updatedAfter', () => {
  it('sends the documented min_updated_at filter and serves only matching rows', async () => {
    const c = CASES[0]!
    const { requests, rows } = fake(c, 30, 7)
    const since = new Date(String(rows[10]!.updated_at))
    const got = await drive(c.method, 25, 1, { updatedAfter: since })
    expect(got.ids).toEqual(
      rows
        .slice(10)
        .map((r) => r.id)
        .slice(0, 20),
    )
    expect(got.hasMore).toEqual([false])
    expect(requests[0]!.params).toEqual({ min_updated_at: since.toISOString() })
  })
  it('keeps a filtered walk apart from an unfiltered walk on the same connection', async () => {
    const c = CASES[0]!
    const { rows } = fake(c, 30, 7)
    const adapter = new InstamojoAdapter(CONFIG)
    // Warm the unfiltered walk first, then ask for page 2 of the filtered one.
    await adapter.listCharges(CREDS, withPageSink({ page: 1, limit: 5 } as QueryParams))
    const since = new Date(String(rows[10]!.updated_at))
    const out = await adapter.listCharges(
      CREDS,
      withPageSink({ page: 2, limit: 5, updatedAfter: since } as QueryParams),
    )
    expect(out.map((r) => r.id)).toEqual(rows.slice(15, 20).map((r) => r.id))
  })
})

describe('Instamojo listPayouts updatedAfter', () => {
  it('sends no min_updated_at: List Payouts documents only id, start_time and end_time', async () => {
    const c = CASES[1]!
    const { requests, ids } = fake(c, 5, 7)
    const got = await drive(c.method, 10, 1, { updatedAfter: new Date('2019-01-01T00:00:00Z') })
    expect(got.ids).toEqual(ids)
    expect(requests[0]!.params).toEqual({})
  })
})

describe('Instamojo getCharge / getPayout', () => {
  it('getCharge reads one payment through the documented id filter', async () => {
    const { requests, ids } = fake(CASES[0]!, 5)
    const out = await new InstamojoAdapter(CONFIG).getCharge(CREDS, ids[3]!)
    expect(out.id).toBe(ids[3])
    expect(requests).toEqual([{ path: '/v2/payments/', params: { id: ids[3] } }])
  })

  it('getPayout reads one payout through the documented id filter', async () => {
    const { requests, ids } = fake(CASES[1]!, 5)
    const out = await new InstamojoAdapter(CONFIG).getPayout(CREDS, ids[2]!)
    expect(out.id).toBe(ids[2])
    expect(requests).toEqual([{ path: '/v2/payouts/', params: { id: ids[2] } }])
  })

  it('a missing id is a 404, not a fabricated record', async () => {
    fake(CASES[0]!, 2)
    await expect(new InstamojoAdapter(CONFIG).getCharge(CREDS, 'MOJOnope')).rejects.toMatchObject({
      statusCode: 404,
    })
  })

  it('getById returns the row whose id matches, even if upstream returns others', async () => {
    const other = paymentRow('MOJOother', 0)
    const target = paymentRow('MOJOwanted', 1)
    const get = vi.fn(async () => ({
      data: { count: 2, next: null, previous: null, payments: [other, target] },
    }))
    vi.spyOn(axios, 'create').mockImplementation((() => ({
      get,
      post: vi.fn(),
      defaults: {},
    })) as never)
    const out = await new InstamojoAdapter(CONFIG).getCharge(CREDS, 'MOJOwanted')
    expect(out.id).toBe('MOJOwanted')
  })

  it('getById is a 404 when upstream returns only rows with other ids', async () => {
    const get = vi.fn(async () => ({
      data: { count: 1, next: null, previous: null, payouts: [payoutRow('MOJOother')] },
    }))
    vi.spyOn(axios, 'create').mockImplementation((() => ({
      get,
      post: vi.fn(),
      defaults: {},
    })) as never)
    await expect(new InstamojoAdapter(CONFIG).getPayout(CREDS, 'MOJOwanted')).rejects.toMatchObject(
      {
        statusCode: 404,
      },
    )
  })
})

describe('Instamojo refuses what MDP does not document', () => {
  const refusals: Array<[string, (a: InstamojoAdapter) => Promise<unknown>]> = [
    ['listCustomers', (a) => a.listCustomers(CREDS, { page: 1, limit: 10 })],
    ['getCustomer', (a) => a.getCustomer(CREDS, 'x')],
    ['listRefunds', (a) => a.listRefunds(CREDS, { page: 1, limit: 10 })],
    ['getRefund', (a) => a.getRefund(CREDS, 'C5c0751269')],
  ]
  it.each(refusals)('%s throws 501 NOT_SUPPORTED and sends no request', async (_name, call) => {
    const { requests } = fake(CASES[0]!, 3)
    const err = await call(new InstamojoAdapter(CONFIG)).catch((e: unknown) => e)
    expect(err).toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect(requests).toEqual([])
  })
})
