/**
 * NOWPayments list paging and request shape.
 *
 * Source: the official Postman collection,
 * https://documenter.gw.postman.com/api/collections/7907941/2s93JusNJt
 *
 * Offset lists, answering {"result":[...],"count":N}:
 *   GET /v1/subscriptions/plans  "https://api.nowpayments.io/v1/subscriptions/plans?limit=10&offset=3"   x-api-key
 *   GET /v1/subscriptions        "limit - the amount of shown items" / "offset - setting the offset"      x-api-key
 *   GET /v1/sub-partner          "https://api.nowpayments.io/v1/sub-partner?id=111&offset=1&limit=10&order=DESC"
 *                                Authorization: Bearer {{token}} only
 * No maximum limit is documented, and `count` is not documented as a total
 * (the plans example answers offset=3 with count 2). By default the fake
 * reports `count` as the size of the page it returns; one test sets it to the
 * total and to 0, so an adapter that derives the end from `count` fails.
 * `offset` is read as a row offset; the docs do not say rows or pages.
 *
 * Page list (listPayouts refuses before any request; see its block):
 *   GET /v1/payment/  "limit - number of records in one page. (possible values: from 1 to 500)",
 *                     "page - the page number you want to get (possible values: from 0 to page count - 1)",
 *                     {"data":[...],"limit":10,"page":0,"pagesCount":582,"total":5815};
 *                     Authorization: Bearer {{token}} AND x-api-key
 *
 * The JWT comes from POST /v1/auth {"email","password"} → {"token"}.
 *
 * Every fake honours only the documented parameters and headers and rejects
 * anything else.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { withPageSink, readUpstreamPage, parseListQuery, listPage } from '@opensteward/shared'
import type { Credentials, PageMaxBearing, QueryParams } from '@opensteward/shared'
import { NowpaymentsAdapter } from '../../../../../../src/verticals/payments/adapters/nowpayments/index'

const API_KEY = 'np_key'
const TOKEN = 'jwt-token-1'
const CREDS: Credentials = {
  accessToken: API_KEY,
  extra: { email: 'owner@example.com', password: 'pw' },
}
const KEY_ONLY: Credentials = { accessToken: API_KEY }

type OffsetMethod = 'listPlans' | 'listSubscriptions' | 'listCustomers'
type AuthKind = 'apiKey' | 'jwt' | 'both'

interface OffsetCase {
  method: OffsetMethod
  path: string
  auth: AuthKind
  row: (id: string) => Record<string, unknown>
}

const OFFSET_CASES: OffsetCase[] = [
  {
    method: 'listPlans',
    path: '/subscriptions/plans',
    auth: 'apiKey',
    row: (id) => ({ id, title: 'p', interval_day: '30', amount: 2, currency: 'USD' }),
  },
  {
    method: 'listSubscriptions',
    path: '/subscriptions',
    auth: 'apiKey',
    row: (id) => ({
      id,
      subscription_plan_id: '1',
      status: 'PAID',
      subscriber: { email: 'a@b.co' },
    }),
  },
  {
    method: 'listCustomers',
    path: '/sub-partner',
    auth: 'jwt',
    row: (id) => ({ id, name: 'c', created_at: '2022-10-06T16:42:47.352Z' }),
  },
]

interface Call {
  path: string
  params: Record<string, unknown>
  headers: Record<string, string>
}

function badRequest(msg: string): Error {
  return Object.assign(new Error(`400 ${msg}`), { response: { status: 400 } })
}
function unauthorized(msg: string): Error {
  return Object.assign(new Error(`401 ${msg}`), { response: { status: 401 } })
}

function build(n: number): string[] {
  return Array.from({ length: n }, (_, i) => String(100000 + i + 1))
}

function checkAuth(auth: AuthKind, headers: Record<string, string>): void {
  const key = headers['x-api-key']
  const bearer = headers['Authorization']
  if (auth !== 'jwt' && key !== API_KEY) throw unauthorized('x-api-key missing')
  if (auth === 'jwt' && key !== undefined) throw badRequest('x-api-key is not documented here')
  if (auth !== 'apiKey' && bearer !== `Bearer ${TOKEN}`) throw unauthorized('JWT missing')
  if (auth === 'apiKey' && bearer !== undefined)
    throw badRequest('Authorization is not documented here')
}

/** POST /v1/auth: {"email","password"} → {"token"}. */
function authPost(posts: unknown[]) {
  return vi.fn(async (path: string, body: unknown) => {
    posts.push({ path, body })
    if (path !== '/auth') throw new Error(`unexpected POST ${path}`)
    const b = body as { email?: string; password?: string }
    if (b.email !== 'owner@example.com' || b.password !== 'pw') throw unauthorized('bad login')
    return { data: { token: TOKEN } }
  })
}

type CountFn = (page: string[], ids: string[]) => number

function fakeOffset(c: OffsetCase, ids: string[], count: CountFn = (page) => page.length) {
  const calls: Call[] = []
  const posts: unknown[] = []
  const get = vi.fn(
    async (
      path: string,
      config?: { params?: Record<string, unknown>; headers?: Record<string, string> },
    ) => {
      const params = config?.params ?? {}
      const headers = config?.headers ?? {}
      calls.push({ path, params, headers })
      if (path !== c.path) throw new Error(`unexpected path in test: ${path}`)
      checkAuth(c.auth, headers)
      for (const [k, v] of Object.entries(params)) {
        if (v === undefined) continue
        if (k !== 'limit' && k !== 'offset') throw badRequest(`unknown param ${k}`)
      }
      const limit = params['limit'] === undefined ? 10 : Number(params['limit'])
      const offset = params['offset'] === undefined ? 0 : Number(params['offset'])
      if (!Number.isInteger(limit) || limit < 1)
        throw badRequest(`limit ${String(params['limit'])}`)
      if (!Number.isInteger(offset) || offset < 0)
        throw badRequest(`offset ${String(params['offset'])}`)
      const page = ids.slice(offset, offset + limit)
      return { data: { result: page.map(c.row), count: count(page, ids) } }
    },
  )
  const post = authPost(posts)
  vi.spyOn(axios, 'create').mockReturnValue({ get, post } as never)
  return { get, post, calls, posts }
}

async function list(
  a: NowpaymentsAdapter,
  method: string,
  params: QueryParams,
  creds: Credentials = CREDS,
): Promise<string[]> {
  const fn = (
    a as unknown as Record<string, (c: Credentials, p: QueryParams) => Promise<{ id: string }[]>>
  )[method]!
  const rows = await fn.call(a, creds, params)
  return rows.map((r) => r.id)
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('NOWPayments list paging', () => {
  it('declares no adapter-wide maximum page size (only GET /v1/payment/ documents one)', () => {
    expect((new NowpaymentsAdapter() as PageMaxBearing).capabilities?.maxPageSize).toBeUndefined()
  })

  for (const c of OFFSET_CASES) {
    describe(c.method, () => {
      it('serves 2L+1 rows once each, in order, across pages 1..3 with exact hasMore', async () => {
        for (const L of [3, 10]) {
          vi.restoreAllMocks()
          const ids = build(2 * L + 1)
          fakeOffset(c, ids)
          const a = new NowpaymentsAdapter()
          const seen: string[] = []
          const hasMore: (boolean | undefined)[] = []
          for (const page of [1, 2, 3]) {
            const params = withPageSink({ page, limit: L } as QueryParams)
            seen.push(...(await list(a, c.method, params)))
            hasMore.push(readUpstreamPage(params)?.hasMore)
          }
          expect(seen).toEqual(ids)
          expect(hasMore).toEqual([true, true, false])
        }
      })

      it('the end is a short page, whatever `count` says', async () => {
        const modes: CountFn[] = [(_page, all) => all.length, () => 0]
        for (const count of modes) {
          vi.restoreAllMocks()
          const L = 4
          const ids = build(2 * L + 1)
          fakeOffset(c, ids, count)
          const a = new NowpaymentsAdapter()
          const seen: string[] = []
          const hasMore: (boolean | undefined)[] = []
          for (const page of [1, 2, 3]) {
            const params = withPageSink({ page, limit: L } as QueryParams)
            seen.push(...(await list(a, c.method, params)))
            hasMore.push(readUpstreamPage(params)?.hasMore)
          }
          expect(seen).toEqual(ids)
          expect(hasMore).toEqual([true, true, false])
        }
      })

      it('with no caller limit, sends the default page size of 50 and strides by it', async () => {
        const ids = build(120)
        const { calls } = fakeOffset(c, ids)
        const params = withPageSink({ page: 2 } as QueryParams)
        expect(await list(new NowpaymentsAdapter(), c.method, params)).toEqual(ids.slice(50, 100))
        expect(calls[0]!.params).toEqual({ limit: 50, offset: 50 })
        expect(readUpstreamPage(params)?.hasMore).toBe(true)
      })

      it('the page-2 request carries the row `offset`, the caller limit and the documented auth', async () => {
        const L = 4
        const ids = build(2 * L + 1)
        const { calls } = fakeOffset(c, ids)
        const params = withPageSink({ page: 2, limit: L } as QueryParams)
        expect(await list(new NowpaymentsAdapter(), c.method, params)).toEqual(ids.slice(L, 2 * L))
        expect(calls).toHaveLength(1)
        expect(calls[0]!.params).toEqual({ limit: L, offset: L })
        if (c.auth === 'jwt') {
          expect(calls[0]!.headers).toEqual({ Authorization: `Bearer ${TOKEN}` })
        } else {
          expect(calls[0]!.headers).toEqual({ 'x-api-key': API_KEY })
        }
      })

      it('page 1 (or no page) sends offset 0', async () => {
        const { calls } = fakeOffset(c, build(5))
        await list(new NowpaymentsAdapter(), c.method, withPageSink({ limit: 2 } as QueryParams))
        expect(calls[0]!.params).toEqual({ limit: 2, offset: 0 })
      })

      it('a limit above the router maximum is clamped and still serves every row', async () => {
        const ids = build(1001)
        const { calls } = fakeOffset(c, ids)
        const a = new NowpaymentsAdapter()
        const seen: string[] = []
        for (let page = 1; ; page++) {
          expect(page).toBeLessThan(10)
          const params = parseListQuery({ limit: '5000', page: String(page) }, a as PageMaxBearing)
          expect(params.limit).toBe(500)
          seen.push(...(await list(a, c.method, params)))
          if (!readUpstreamPage(params)?.hasMore) break
        }
        expect(seen).toEqual(ids)
        for (const x of calls) expect(x.params['limit']).toBe(500)
      })

      it('API path: parseListQuery then listPage gives the right meta.hasMore', async () => {
        const ids = build(25)
        fakeOffset(c, ids)
        const a = new NowpaymentsAdapter()
        const p1 = parseListQuery({ limit: '10', page: '1' }, a as PageMaxBearing)
        const r1 = listPage(
          await (a[c.method] as (cr: Credentials, p: QueryParams) => Promise<{ id: string }[]>)(
            CREDS,
            p1,
          ),
          p1,
          'nowpayments',
        )
        expect(r1.data.map((d) => d.id)).toEqual(ids.slice(0, 10))
        expect(r1.meta.hasMore).toBe(true)

        const p3 = parseListQuery({ limit: '10', page: '3' }, a as PageMaxBearing)
        const r3 = listPage(
          await (a[c.method] as (cr: Credentials, p: QueryParams) => Promise<{ id: string }[]>)(
            CREDS,
            p3,
          ),
          p3,
          'nowpayments',
        )
        expect(r3.data.map((d) => d.id)).toEqual(ids.slice(20))
        expect(r3.meta.hasMore).toBe(false)
      })

      it('a page past the end is empty and reports no more', async () => {
        fakeOffset(c, build(5))
        const params = withPageSink({ page: 4, limit: 5 } as QueryParams)
        expect(await list(new NowpaymentsAdapter(), c.method, params)).toEqual([])
        expect(readUpstreamPage(params)?.hasMore).toBe(false)
      })
    })
  }

  it('listCustomers logs in with POST /v1/auth {email, password} before the list', async () => {
    const { posts, calls } = fakeOffset(OFFSET_CASES[2]!, build(3))
    await list(
      new NowpaymentsAdapter(),
      'listCustomers',
      withPageSink({ page: 1, limit: 5 } as QueryParams),
    )
    expect(posts).toEqual([{ path: '/auth', body: { email: 'owner@example.com', password: 'pw' } }])
    expect(calls).toHaveLength(1)
  })
})

// ── GET /v1/payment/ (0-based page, max 500, pagesCount) ────────────────────

function payment(id: string): Record<string, unknown> {
  return {
    payment_id: Number(id),
    invoice_id: null,
    payment_status: 'finished',
    price_amount: 1,
    price_currency: 'usd',
    created_at: '2023-07-19T15:22:15.807Z',
  }
}

function fakePayments(ids: string[]) {
  const calls: Call[] = []
  const posts: unknown[] = []
  const get = vi.fn(
    async (
      path: string,
      config?: { params?: Record<string, unknown>; headers?: Record<string, string> },
    ) => {
      const params = config?.params ?? {}
      const headers = config?.headers ?? {}
      calls.push({ path, params, headers })
      if (path !== '/payment/') throw new Error(`unexpected path in test: ${path}`)
      checkAuth('both', headers)
      for (const [k, v] of Object.entries(params)) {
        if (v === undefined) continue
        if (k !== 'limit' && k !== 'page') throw badRequest(`unknown param ${k}`)
      }
      const limit = params['limit'] === undefined ? 10 : Number(params['limit'])
      const page = params['page'] === undefined ? 0 : Number(params['page'])
      if (!Number.isInteger(limit) || limit < 1 || limit > 500)
        throw badRequest(`limit ${String(limit)}`)
      const pagesCount = Math.ceil(ids.length / limit)
      if (!Number.isInteger(page) || page < 0) throw badRequest(`page ${String(page)}`)
      const slice = ids.slice(page * limit, (page + 1) * limit)
      return { data: { data: slice.map(payment), limit, page, pagesCount, total: ids.length } }
    },
  )
  const post = authPost(posts)
  vi.spyOn(axios, 'create').mockReturnValue({ get, post } as never)
  return { calls, posts }
}

describe('listCharges (GET /v1/payment/)', () => {
  it('serves 2L+1 rows once each across pages 1..3 with hasMore from pagesCount', async () => {
    for (const L of [3, 10]) {
      vi.restoreAllMocks()
      const ids = build(2 * L + 1)
      const { calls } = fakePayments(ids)
      const a = new NowpaymentsAdapter()
      const seen: string[] = []
      const hasMore: (boolean | undefined)[] = []
      for (const page of [1, 2, 3]) {
        const params = withPageSink({ page, limit: L } as QueryParams)
        seen.push(...(await list(a, 'listCharges', params)))
        hasMore.push(readUpstreamPage(params)?.hasMore)
      }
      expect(seen).toEqual(ids)
      expect(hasMore).toEqual([true, true, false])
      expect(calls.map((x) => x.params['page'])).toEqual([0, 1, 2])
    }
  })

  it('sends the 0-based page, the caller limit, the JWT and x-api-key, and reports the total', async () => {
    const ids = build(9)
    const { calls, posts } = fakePayments(ids)
    const params = withPageSink({ page: 2, limit: 4 } as QueryParams)
    expect(await list(new NowpaymentsAdapter(), 'listCharges', params)).toEqual(ids.slice(4, 8))
    expect(posts).toHaveLength(1)
    expect(calls[0]).toEqual({
      path: '/payment/',
      params: { limit: 4, page: 1 },
      headers: { 'x-api-key': API_KEY, Authorization: `Bearer ${TOKEN}` },
    })
    expect(readUpstreamPage(params)).toMatchObject({ hasMore: true, totalCount: 9, totalPages: 3 })
  })

  it('a full last page ends the walk: hasMore comes from pagesCount, not the page size', async () => {
    const L = 4
    const ids = build(2 * L)
    fakePayments(ids)
    const a = new NowpaymentsAdapter()
    const params = withPageSink({ page: 2, limit: L } as QueryParams)
    expect(await list(a, 'listCharges', params)).toEqual(ids.slice(L))
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('clamps a direct call past the documented 500 and reports the size sent', async () => {
    const ids = build(1200)
    const { calls } = fakePayments(ids)
    const params = withPageSink({ page: 1, limit: 1000 } as QueryParams)
    expect(await list(new NowpaymentsAdapter(), 'listCharges', params)).toHaveLength(500)
    expect(calls[0]!.params).toEqual({ limit: 500, page: 0 })
    expect(readUpstreamPage(params)).toMatchObject({ hasMore: true, pageSize: 500 })
  })

  it('refuses with 501 NOT_SUPPORTED and sends nothing when the connection has no dashboard login', async () => {
    const get = vi.fn()
    const post = vi.fn()
    vi.spyOn(axios, 'create').mockReturnValue({ get, post } as never)
    await expect(
      new NowpaymentsAdapter().listCharges(
        KEY_ONLY,
        withPageSink({ page: 1, limit: 5 } as QueryParams),
      ),
    ).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect(get).not.toHaveBeenCalled()
    expect(post).not.toHaveBeenCalled()
  })
})

describe('listCustomers without a dashboard login', () => {
  it('refuses with 501 NOT_SUPPORTED and sends nothing', async () => {
    const get = vi.fn()
    const post = vi.fn()
    vi.spyOn(axios, 'create').mockReturnValue({ get, post } as never)
    await expect(
      new NowpaymentsAdapter().listCustomers(
        KEY_ONLY,
        withPageSink({ page: 1, limit: 5 } as QueryParams),
      ),
    ).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect(get).not.toHaveBeenCalled()
    expect(post).not.toHaveBeenCalled()
  })
})

// ── listPayouts (refused: crypto amounts do not fit the fiat Money schema) ──
//
// "Mass payouts / List of payouts" answers {"payouts":[{ ... "currency": "trx",
// "amount": "94.088939", ... }]} (official collection,
// https://documenter.gw.postman.com/api/collections/7907941/2s93JusNJt), and
// the collection's "Webhooks Examples" / "Withdrawals:" snippet shows a payout
// with "currency":"usdttrc20","amount":"50". A ticker is not an
// ISO 4217 code and a 6-decimal amount is not a 2-decimal minor unit.

describe('listPayouts', () => {
  it('refuses with 501 NOT_SUPPORTED and sends no request', async () => {
    // Answers any GET with a documented payout page, so a request would be recorded.
    const get = vi.fn(async () => ({
      data: {
        payouts: [{ id: '5000248325', status: 'FINISHED', currency: 'trx', amount: '94.088939' }],
      },
    }))
    const post = vi.fn()
    const create = vi.spyOn(axios, 'create').mockReturnValue({ get, post } as never)
    await expect(
      new NowpaymentsAdapter().listPayouts(
        CREDS,
        withPageSink({ page: 1, limit: 5 } as QueryParams),
      ),
    ).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
      message: expect.stringMatching(/^NOWPayments cannot list payouts: .*crypto/),
    })
    expect(get).not.toHaveBeenCalled()
    expect(post).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
  })
})

// ── listRefunds (no refund endpoint) ────────────────────────────────────────

describe('listRefunds', () => {
  it('refuses with 501 NOT_SUPPORTED and sends no request', async () => {
    const get = vi.fn()
    const post = vi.fn()
    const create = vi.spyOn(axios, 'create').mockReturnValue({ get, post } as never)
    await expect(
      new NowpaymentsAdapter().listRefunds(
        CREDS,
        withPageSink({ page: 1, limit: 5 } as QueryParams),
      ),
    ).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect(get).not.toHaveBeenCalled()
    expect(post).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
  })
})
