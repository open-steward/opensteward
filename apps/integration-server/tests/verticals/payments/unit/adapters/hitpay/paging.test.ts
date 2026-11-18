/**
 * HitPay list paging contract.
 *
 * HitPay mixes three paging styles across its list endpoints, each from its
 * first-party OpenAPI (https://docs.hitpayapp.com/openapi.json):
 *
 *   GET /v1/customers, /v1/transfers — cursor paginator. The documented 200
 *     body is `meta { path, per_page, next_cursor, prev_cursor }` with no
 *     page counts; `cursor` takes a `next_cursor` (HitPay's convention, e.g.
 *     https://docs.hitpayapp.com/apis/charges/get-charges.md: "The cursor
 *     parameter accepts a next_cursor value obtained from the"). Size is
 *     `per_page`.
 *   GET /v1/subscription-plan — length-aware paginator: `page` ("The page
 *     index"), `per_page`, `meta { current_page, last_page, total }`.
 *   GET /v1/payment-requests — `per_page` ("Page size", maximum: 100) and
 *     `current_page` ("Page number (not `page`)").
 *
 * The fakes honour only those parameters. The cursor fakes mint opaque
 * cursors, so only a `next_cursor` taken from a response works.
 * GET /v1/recurring-billing (listSubscriptions) is out of scope here.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import {
  withPageSink,
  readUpstreamPage,
  parseListQuery,
  listPage,
  _resetCursorPager,
} from '@opensteward/shared'
import type { Credentials, PageMaxBearing, QueryParams } from '@opensteward/shared'
import { HitpayAdapter } from '../../../../../../src/verticals/payments/adapters/hitpay/index'

const CREDS: Credentials = { accessToken: 'hp_key_a', extra: { environment: 'sandbox' } }
const CHARGES_MAX = 100

type Method = 'listCustomers' | 'listPayouts' | 'listPlans' | 'listCharges'
type Style = 'cursor' | 'page' | 'current_page'

interface Case {
  method: Method
  path: string
  style: Style
  /** The parameter that carries the position on page 2. */
  key: string
}

const CASES: Case[] = [
  { method: 'listCustomers', path: '/customers', style: 'cursor', key: 'cursor' },
  { method: 'listPayouts', path: '/transfers', style: 'cursor', key: 'cursor' },
  { method: 'listPlans', path: '/subscription-plan', style: 'page', key: 'page' },
  { method: 'listCharges', path: '/payment-requests', style: 'current_page', key: 'current_page' },
]

interface Call {
  path: string
  params: Record<string, unknown>
}

function badRequest(msg: string): Error {
  return Object.assign(new Error(`422 ${msg}`), { response: { status: 422 } })
}

function build(n: number, prefix = 'r'): string[] {
  return Array.from({ length: n }, (_, i) => `${prefix}_${String(i + 1).padStart(4, '0')}`)
}

/**
 * Each fake accepts some parameters it does nothing with: the customers
 * page lists `page`, which the cursor paginator does not read, and
 * the adapter sends `page` beside `current_page` to payment-requests. `reads`
 * overrides which parameter a page-number fake reads the position from.
 */
function makeServer(c: Case, ids: string[], reads: string = c.key, cap = Infinity) {
  const calls: Call[] = []
  const cursors = new Map<string, number>()
  let minted = 0
  const allowed =
    c.style === 'cursor'
      ? ['per_page', 'cursor', ...(c.path === '/customers' ? ['page'] : [])]
      : c.style === 'page'
        ? ['per_page', 'page']
        : ['per_page', 'current_page', 'page']
  const get = vi.fn(async (path: string, config?: { params?: Record<string, unknown> }) => {
    const params = config?.params ?? {}
    calls.push({ path, params })
    if (path !== c.path) throw new Error(`unexpected path in test: ${path}`)
    for (const k of Object.keys(params)) {
      if (!allowed.includes(k)) throw badRequest(`unknown param ${k}`)
    }
    const defaultSize = c.style === 'page' ? 20 : 10
    const asked = params['per_page'] === undefined ? defaultSize : Number(params['per_page'])
    if (!Number.isInteger(asked) || asked < 1) throw badRequest(`per_page ${String(asked)}`)
    if (c.style === 'current_page' && asked > CHARGES_MAX) throw badRequest(`per_page ${asked}`)
    // A silent server-side cap: serves fewer than asked and says so in meta.per_page.
    const size = Math.min(asked, cap)
    if (c.style === 'cursor') {
      let start = 0
      if (params['cursor'] !== undefined) {
        const at = cursors.get(String(params['cursor']))
        if (at === undefined) throw badRequest('bad cursor')
        start = at
      }
      const rows = ids.slice(start, start + size)
      const end = start + rows.length
      let next: string | null = null
      if (end < ids.length) {
        next = `eyJjdXJzb3Ii${++minted}`
        cursors.set(next, end)
      }
      return {
        data: {
          data: rows.map((id) => ({ id })),
          links: { first: null, last: null, prev: null, next: next ? `x?cursor=${next}` : null },
          meta: {
            path: `https://api.sandbox.hit-pay.com/v1${c.path}`,
            per_page: size,
            next_cursor: next,
            prev_cursor: null,
          },
        },
      }
    }

    const raw = params[reads]
    const page = raw === undefined ? 1 : Number(raw)
    if (!Number.isInteger(page) || page < 1) throw badRequest(`${reads} ${String(raw)}`)
    const start = (page - 1) * size
    const rows = ids.slice(start, start + size)
    const lastPage = Math.max(1, Math.ceil(ids.length / size))
    return {
      data: {
        data: rows.map((id) => ({ id })),
        meta: {
          current_page: page,
          from: rows.length ? start + 1 : null,
          last_page: lastPage,
          per_page: size,
          to: rows.length ? start + rows.length : null,
          total: ids.length,
        },
      },
    }
  })
  return { get, calls }
}

function fake(c: Case, ids: string[], reads?: string, cap?: number) {
  const server = makeServer(c, ids, reads, cap)
  vi.spyOn(axios, 'create').mockReturnValue({ get: server.get } as never)
  return server
}

async function list(
  adapter: HitpayAdapter,
  method: Method,
  params: QueryParams,
  creds: Credentials = CREDS,
): Promise<string[]> {
  const rows = (await adapter[method](creds, params)) as { id: string }[]
  return rows.map((r) => r.id)
}

afterEach(() => {
  vi.restoreAllMocks()
  _resetCursorPager()
})

describe('HitPay list paging', () => {
  it('declares no adapter-wide maximum (listSubscriptions still ignores page)', () => {
    expect((new HitpayAdapter() as PageMaxBearing).capabilities?.maxPageSize).toBeUndefined()
  })

  for (const c of CASES) {
    describe(c.method, () => {
      it('serves 2L+1 rows once each, in order, across pages 1..3 with exact hasMore', async () => {
        for (const L of [3, 10]) {
          _resetCursorPager()
          vi.restoreAllMocks()
          const ids = build(2 * L + 1)
          fake(c, ids)
          const a = new HitpayAdapter()
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

      it(`the page-2 request carries the documented \`${c.key}\` and per_page = limit`, async () => {
        const L = 4
        const ids = build(2 * L + 1)
        const { calls } = fake(c, ids)
        const params = withPageSink({ page: 2, limit: L } as QueryParams)
        expect(await list(new HitpayAdapter(), c.method, params)).toEqual(ids.slice(L, 2 * L))
        const last = calls[calls.length - 1]!
        if (c.style === 'cursor') {
          expect(calls).toHaveLength(2)
          expect(calls[0]!.params['cursor']).toBeUndefined()
          expect(last.params['cursor']).toBe('eyJjdXJzb3Ii1')
        } else {
          expect(calls).toHaveLength(1)
          expect(last.params[c.key]).toBe(2)
        }
        expect(calls.every((x) => x.params['per_page'] === L)).toBe(true)
        expect(calls.every((x) => !('limit' in x.params))).toBe(true)
      })

      it('API path: parseListQuery then listPage gives the right meta.hasMore', async () => {
        const ids = build(25)
        fake(c, ids)
        const a = new HitpayAdapter()
        const p1 = parseListQuery({ limit: '10', page: '1' }, a as PageMaxBearing)
        const r1 = listPage((await a[c.method](CREDS, p1)) as { id: string }[], p1, 'hitpay')
        expect(r1.data.map((d) => d.id)).toEqual(ids.slice(0, 10))
        expect(r1.meta.hasMore).toBe(true)

        const p3 = parseListQuery({ limit: '10', page: '3' }, a as PageMaxBearing)
        const r3 = listPage((await a[c.method](CREDS, p3)) as { id: string }[], p3, 'hitpay')
        expect(r3.data.map((d) => d.id)).toEqual(ids.slice(20))
        expect(r3.meta.hasMore).toBe(false)
      })

      it('2L rows: a full last page reports no more (not guessed from a full page)', async () => {
        const L = 4
        const ids = build(2 * L)
        fake(c, ids)
        const a = new HitpayAdapter()
        const seen: string[] = []
        const hasMore: (boolean | undefined)[] = []
        for (const page of [1, 2]) {
          const params = withPageSink({ page, limit: L } as QueryParams)
          seen.push(...(await list(a, c.method, params)))
          hasMore.push(readUpstreamPage(params)?.hasMore)
        }
        expect(seen).toEqual(ids)
        expect(hasMore).toEqual([true, false])
      })

      it('a server that silently serves fewer than per_page reports that size and loses no row', async () => {
        const cap = 5
        const ids = build(3 * cap + 2)
        fake(c, ids, undefined, cap)
        const a = new HitpayAdapter()
        const seen: string[] = []
        for (let page = 1; ; page++) {
          expect(page).toBeLessThan(10)
          const params = withPageSink({ page, limit: 50 } as QueryParams)
          seen.push(...(await list(a, c.method, params)))
          const meta = readUpstreamPage(params)
          expect(meta?.pageSize).toBe(cap)
          if (!meta?.hasMore) break
        }
        expect(seen).toEqual(ids)
      })

      it('a page past the end is empty and reports no more', async () => {
        fake(c, build(5))
        const params = withPageSink({ page: 4, limit: 5 } as QueryParams)
        expect(await list(new HitpayAdapter(), c.method, params)).toEqual([])
        expect(readUpstreamPage(params)?.hasMore).toBe(false)
      })
    })
  }

  describe('listCharges maximum', () => {
    const c = CASES[3]!

    it('clamps a limit above 100 to per_page 100, reports that size, and still serves every row', async () => {
      const ids = build(2 * CHARGES_MAX + 1)
      const { calls } = fake(c, ids)
      const a = new HitpayAdapter()
      const seen: string[] = []
      for (let page = 1; ; page++) {
        expect(page).toBeLessThan(10)
        const params = withPageSink({ page, limit: 1000 } as QueryParams)
        seen.push(...(await list(a, c.method, params)))
        const meta = readUpstreamPage(params)
        expect(meta?.pageSize).toBe(CHARGES_MAX)
        if (!meta?.hasMore) break
      }
      expect(seen).toEqual(ids)
      for (const x of calls) expect(x.params['per_page']).toBe(CHARGES_MAX)
    })

    it('also pages when the server reads `page` rather than `current_page`', async () => {
      const L = 3
      const ids = build(2 * L + 1)
      fake(c, ids, 'page')
      const a = new HitpayAdapter()
      const seen: string[] = []
      for (const page of [1, 2, 3]) {
        seen.push(...(await list(a, c.method, withPageSink({ page, limit: L } as QueryParams))))
      }
      expect(seen).toEqual(ids)
    })

    it('reports totalCount from meta.total', async () => {
      fake(c, build(7))
      const params = withPageSink({ page: 1, limit: 3 } as QueryParams)
      await list(new HitpayAdapter(), c.method, params)
      expect(readUpstreamPage(params)?.totalCount).toBe(7)
    })
  })

  describe('a length-aware body without meta reports no end', () => {
    // The payment-requests 200 body is undocumented, so a body with no
    // `meta` must leave hasMore unreported (the router then judges from a
    // full page) rather than claim the end and truncate a sync.
    const rows = build(3).map((id) => ({ id }))
    for (const method of ['listCharges', 'listPlans'] as const) {
      for (const [shape, body] of [
        ['{ data } envelope', { data: rows }],
        ['bare array', rows],
      ] as const) {
        it(`${method}: ${shape}`, async () => {
          const get = vi.fn(async () => ({ data: body }))
          vi.spyOn(axios, 'create').mockReturnValue({ get } as never)
          const params = withPageSink({ page: 1, limit: 3 } as QueryParams)
          expect(await list(new HitpayAdapter(), method, params)).toEqual([
            'r_0001',
            'r_0002',
            'r_0003',
          ])
          const reported = readUpstreamPage(params)
          expect(reported?.hasMore).toBeUndefined()
          expect(reported?.totalCount).toBeUndefined()
        })
      }
    }
  })

  it('the same key in sandbox and live never shares a cursor walk', async () => {
    const c = CASES[0]!
    const S = makeServer(c, build(15, 'S'))
    const Lv = makeServer(c, build(15, 'L'))
    let next = S
    vi.spyOn(axios, 'create').mockImplementation((() => ({ get: next.get })) as never)
    const adapter = new HitpayAdapter()
    await list(adapter, c.method, withPageSink({ page: 1, limit: 5 } as QueryParams))
    next = Lv
    const live: Credentials = { accessToken: CREDS.accessToken, extra: { environment: 'live' } }
    expect(
      await list(adapter, c.method, withPageSink({ page: 2, limit: 5 } as QueryParams), live),
    ).toEqual(build(15, 'L').slice(5, 10))
    expect(Lv.calls[0]!.params['cursor']).toBeUndefined()
  })

  it('listPlans reports totalCount from meta.total', async () => {
    fake(CASES[2]!, build(7))
    const params = withPageSink({ page: 1, limit: 3 } as QueryParams)
    await list(new HitpayAdapter(), 'listPlans', params)
    expect(readUpstreamPage(params)?.totalCount).toBe(7)
  })

  it('the cursor pager key includes limit: page 2 at a new limit follows page 1 at that limit', async () => {
    const c = CASES[0]!
    const ids = build(20)
    fake(c, ids)
    const a = new HitpayAdapter()
    await list(a, c.method, withPageSink({ page: 1, limit: 3 } as QueryParams))
    await list(a, c.method, withPageSink({ page: 2, limit: 3 } as QueryParams))
    expect(await list(a, c.method, withPageSink({ page: 2, limit: 5 } as QueryParams))).toEqual(
      ids.slice(5, 10),
    )
  })

  it('two connections never share a cursor walk', async () => {
    const c = CASES[1]!
    const A = makeServer(c, build(15, 'A'))
    const B = makeServer(c, build(15, 'B'))
    let next = A
    vi.spyOn(axios, 'create').mockImplementation((() => ({ get: next.get })) as never)
    const adapter = new HitpayAdapter()
    await list(adapter, c.method, withPageSink({ page: 1, limit: 5 } as QueryParams))
    next = B
    const credsB: Credentials = { accessToken: 'hp_key_b', extra: { environment: 'sandbox' } }
    expect(
      await list(adapter, c.method, withPageSink({ page: 2, limit: 5 } as QueryParams), credsB),
    ).toEqual(build(15, 'B').slice(5, 10))
    expect(B.calls[0]!.params['cursor']).toBeUndefined()
  })
})
