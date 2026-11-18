/**
 * Conekta list paging contract.
 *
 * Every list endpoint (GET /customers, /orders, /payout_orders, /plans,
 * /transactions) is an opaque cursor walk documented identically, e.g.
 * https://developers.conekta.com/reference/getcustomers.md:
 *
 *   limit: "The numbers of items to return, the maximum value is 250"
 *   next:  "next page"
 *   has_more: "Indicates if there are more pages to be requested"
 *   next_page_url example: "https://api.conekta.io/resources?limit=10&next=chrg_1"
 *
 * The pagination guide's example carries a `next` value that is NOT the last
 * row's id, so the fake upstream mints opaque cursors: only a `next` taken
 * from `next_page_url` works. The fake honours only `limit` (1..250, default
 * 20) and `next`, and rejects anything else it cannot serve.
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
import { ConektaAdapter } from '../../../../../../src/verticals/payments/adapters/conekta/index'

const CREDS: Credentials = { accessToken: 'key_test_a' }
const MAX = 250
const BASE = 'https://api.conekta.io'

type Method =
  'listCustomers' | 'listCharges' | 'listPayouts' | 'listPlans' | 'listBalanceTransactions'

interface Case {
  method: Method
  path: string
}

const CASES: Case[] = [
  { method: 'listCustomers', path: '/customers' },
  { method: 'listCharges', path: '/orders' },
  { method: 'listPayouts', path: '/payout_orders' },
  { method: 'listPlans', path: '/plans' },
  { method: 'listBalanceTransactions', path: '/transactions' },
]

interface Call {
  path: string
  params: Record<string, unknown>
}

function badRequest(msg: string): Error {
  return Object.assign(new Error(`400 ${msg}`), { response: { status: 400 } })
}

function build(n: number, prefix = 'r'): string[] {
  return Array.from({ length: n }, (_, i) => `${prefix}_${String(i + 1).padStart(4, '0')}`)
}

function makeServer(c: Case, ids: string[]) {
  const calls: Call[] = []
  const cursors = new Map<string, number>()
  let minted = 0
  const get = vi.fn(async (path: string, config?: { params?: Record<string, unknown> }) => {
    const params = config?.params ?? {}
    calls.push({ path, params })
    if (path !== c.path) throw new Error(`unexpected path in test: ${path}`)
    for (const k of Object.keys(params)) {
      if (k !== 'limit' && k !== 'next') throw badRequest(`unknown param ${k}`)
    }
    const limit = params['limit'] === undefined ? 20 : Number(params['limit'])
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX)
      throw badRequest(`limit ${String(params['limit'])}`)
    let start = 0
    if (params['next'] !== undefined) {
      const at = cursors.get(String(params['next']))
      if (at === undefined) throw badRequest('bad next cursor')
      start = at
    }
    const page = ids.slice(start, start + limit)
    const end = start + page.length
    const hasMore = end < ids.length
    let nextUrl: string | null = null
    if (hasMore) {
      const token = `cur_${++minted}`
      cursors.set(token, end)
      nextUrl = `${BASE}${c.path}?limit=${limit}&next=${token}`
    }
    return {
      data: {
        object: 'list',
        has_more: hasMore,
        next_page_url: nextUrl,
        previous_page_url: null,
        data: page.map((id) => ({ id })),
      },
    }
  })
  return { get, calls }
}

function fake(c: Case, ids: string[]) {
  const server = makeServer(c, ids)
  vi.spyOn(axios, 'create').mockReturnValue({ get: server.get } as never)
  return server
}

async function list(
  adapter: ConektaAdapter,
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

describe('Conekta list paging', () => {
  it('declares the documented maximum of 250', () => {
    expect(new ConektaAdapter().capabilities?.maxPageSize).toBe(MAX)
  })

  for (const c of CASES) {
    describe(c.method, () => {
      it('serves 2L+1 rows once each, in order, across pages 1..3 with exact hasMore', async () => {
        for (const L of [3, 10]) {
          _resetCursorPager()
          vi.restoreAllMocks()
          const ids = build(2 * L + 1)
          fake(c, ids)
          const a = new ConektaAdapter()
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

      it('the page-2 request carries the documented `next` cursor from next_page_url', async () => {
        const L = 4
        const ids = build(2 * L + 1)
        const { calls } = fake(c, ids)
        const params = withPageSink({ page: 2, limit: L } as QueryParams)
        expect(await list(new ConektaAdapter(), c.method, params)).toEqual(ids.slice(L, 2 * L))
        expect(calls).toHaveLength(2)
        expect(calls[0]!.params['next']).toBeUndefined()
        expect(calls[1]!.params['next']).toBe('cur_1')
        expect(calls.every((x) => x.params['limit'] === L)).toBe(true)
        expect(calls.every((x) => !('page' in x.params))).toBe(true)
      })

      it('clamps a limit above 250 and still serves every row', async () => {
        const ids = build(2 * MAX + 1)
        const { calls } = fake(c, ids)
        const a = new ConektaAdapter()
        const seen: string[] = []
        for (let page = 1; ; page++) {
          expect(page).toBeLessThan(10)
          const params = withPageSink({ page, limit: 1000 } as QueryParams)
          seen.push(...(await list(a, c.method, params)))
          const meta = readUpstreamPage(params)
          expect(meta?.pageSize).toBe(MAX)
          if (!meta?.hasMore) break
        }
        expect(seen).toEqual(ids)
        for (const x of calls) expect(x.params['limit']).toBeLessThanOrEqual(MAX)
      })

      it('API path: parseListQuery then listPage gives the right meta.hasMore', async () => {
        const ids = build(25)
        fake(c, ids)
        const a = new ConektaAdapter()
        const p1 = parseListQuery({ limit: '10', page: '1' }, a as PageMaxBearing)
        const r1 = listPage((await a[c.method](CREDS, p1)) as { id: string }[], p1, 'conekta')
        expect(r1.data.map((d) => d.id)).toEqual(ids.slice(0, 10))
        expect(r1.meta.hasMore).toBe(true)

        const p3 = parseListQuery({ limit: '10', page: '3' }, a as PageMaxBearing)
        const r3 = listPage((await a[c.method](CREDS, p3)) as { id: string }[], p3, 'conekta')
        expect(r3.data.map((d) => d.id)).toEqual(ids.slice(20))
        expect(r3.meta.hasMore).toBe(false)
      })

      it('a page past the end is empty and reports no more', async () => {
        fake(c, build(5))
        const params = withPageSink({ page: 4, limit: 5 } as QueryParams)
        expect(await list(new ConektaAdapter(), c.method, params)).toEqual([])
        expect(readUpstreamPage(params)?.hasMore).toBe(false)
      })
    })
  }

  it('the pager key includes limit: page 2 at a new limit follows page 1 at that limit', async () => {
    const c = CASES[0]!
    const ids = build(20)
    fake(c, ids)
    const a = new ConektaAdapter()
    await list(a, c.method, withPageSink({ page: 1, limit: 3 } as QueryParams))
    await list(a, c.method, withPageSink({ page: 2, limit: 3 } as QueryParams))
    expect(await list(a, c.method, withPageSink({ page: 2, limit: 5 } as QueryParams))).toEqual(
      ids.slice(5, 10),
    )
  })

  it('has_more true with no cursor in next_page_url ends the walk instead of looping', async () => {
    const c = CASES[1]!
    const get = vi.fn(async () => ({
      data: { has_more: true, next_page_url: `${BASE}/orders?limit=2`, data: [{ id: 'a' }] },
    }))
    vi.spyOn(axios, 'create').mockReturnValue({ get } as never)
    const params = withPageSink({ page: 1, limit: 2 } as QueryParams)
    expect(await list(new ConektaAdapter(), c.method, params)).toEqual(['a'])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    expect(get).toHaveBeenCalledTimes(1)
  })

  it('a raw `next` cursor from the caller is sent as-is, outside the pager', async () => {
    const c = CASES[0]!
    const ids = build(12)
    const { calls } = fake(c, ids)
    const a = new ConektaAdapter()
    const first = withPageSink({ limit: 5 } as QueryParams)
    await list(a, c.method, first)
    const params = withPageSink({ limit: 5, next: 'cur_1' } as QueryParams)
    expect(await list(a, c.method, params)).toEqual(ids.slice(5, 10))
    expect(calls).toHaveLength(2)
    expect(calls[1]!.params).toEqual({ limit: 5, next: 'cur_1' })
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })

  it('two connections never share a walk', async () => {
    const c = CASES[3]!
    const a = makeServer(c, build(15, 'A'))
    const b = makeServer(c, build(15, 'B'))
    let next = a
    vi.spyOn(axios, 'create').mockImplementation((() => ({ get: next.get })) as never)
    const adapter = new ConektaAdapter()
    await list(adapter, c.method, withPageSink({ page: 1, limit: 5 } as QueryParams), {
      accessToken: 'key_a',
    })
    next = b
    expect(
      await list(adapter, c.method, withPageSink({ page: 2, limit: 5 } as QueryParams), {
        accessToken: 'key_b',
      }),
    ).toEqual(build(15, 'B').slice(5, 10))
  })

  it('the pager key includes the collection: /orders page 2 never reuses a /customers cursor', async () => {
    const customers = makeServer(CASES[0]!, build(12, 'C'))
    const orders = makeServer(CASES[1]!, build(12, 'O'))
    const get = vi.fn(async (path: string, config?: { params?: Record<string, unknown> }) =>
      path === '/customers' ? customers.get(path, config) : orders.get(path, config),
    )
    vi.spyOn(axios, 'create').mockReturnValue({ get } as never)
    const a = new ConektaAdapter()
    await list(a, 'listCustomers', withPageSink({ page: 1, limit: 4 } as QueryParams))
    await list(a, 'listCustomers', withPageSink({ page: 2, limit: 4 } as QueryParams))
    expect(
      await list(a, 'listCharges', withPageSink({ page: 2, limit: 4 } as QueryParams)),
    ).toEqual(build(12, 'O').slice(4, 8))
    expect(orders.calls).toHaveLength(2)
    expect(orders.calls[0]!.params['next']).toBeUndefined()
  })

  it('a next_page_url repeating the cursor just sent ends the walk', async () => {
    const get = vi.fn(async (_path: string, config?: { params?: Record<string, unknown> }) => {
      const sent = config?.params?.['next']
      return {
        data: {
          has_more: true,
          next_page_url: `${BASE}/orders?limit=2&next=${sent === undefined ? 'c1' : String(sent)}`,
          data: [{ id: sent === undefined ? 'a' : 'b' }],
        },
      }
    })
    vi.spyOn(axios, 'create').mockReturnValue({ get } as never)
    const a = new ConektaAdapter()
    const p1 = withPageSink({ page: 1, limit: 2 } as QueryParams)
    expect(await list(a, 'listCharges', p1)).toEqual(['a'])
    expect(readUpstreamPage(p1)?.hasMore).toBe(true)
    const p2 = withPageSink({ page: 2, limit: 2 } as QueryParams)
    expect(await list(a, 'listCharges', p2)).toEqual(['b'])
    expect(readUpstreamPage(p2)?.hasMore).toBe(false)
  })

  for (const hasMoreField of [false, undefined]) {
    it(`has_more ${String(hasMoreField)} ends the walk even with a cursor in next_page_url`, async () => {
      const get = vi.fn(async () => ({
        data: {
          ...(hasMoreField === undefined ? {} : { has_more: hasMoreField }),
          next_page_url: `${BASE}/plans?limit=2&next=c9`,
          data: [{ id: 'a' }],
        },
      }))
      vi.spyOn(axios, 'create').mockReturnValue({ get } as never)
      const params = withPageSink({ page: 1, limit: 2 } as QueryParams)
      expect(await list(new ConektaAdapter(), 'listPlans', params)).toEqual(['a'])
      expect(readUpstreamPage(params)?.hasMore).toBe(false)
      expect(get).toHaveBeenCalledTimes(1)
    })
  }

  it('a raw `next` on the last upstream page reports no more', async () => {
    const c = CASES[0]!
    const ids = build(8)
    const { calls } = fake(c, ids)
    const a = new ConektaAdapter()
    await list(a, c.method, withPageSink({ limit: 5 } as QueryParams))
    const params = withPageSink({ limit: 5, next: 'cur_1' } as QueryParams)
    expect(await list(a, c.method, params)).toEqual(ids.slice(5))
    expect(calls[1]!.params).toEqual({ limit: 5, next: 'cur_1' })
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('a raw `previous` cursor from the caller is sent as-is, outside the pager', async () => {
    const get = vi.fn(async () => ({
      data: { has_more: false, next_page_url: null, data: [{ id: 'p' }] },
    }))
    vi.spyOn(axios, 'create').mockReturnValue({ get } as never)
    const params = withPageSink({ limit: 5, previous: 'prev_7' } as QueryParams)
    expect(await list(new ConektaAdapter(), 'listCustomers', params)).toEqual(['p'])
    expect(get).toHaveBeenCalledTimes(1)
    expect(get.mock.calls[0]).toEqual(['/customers', { params: { limit: 5, previous: 'prev_7' } }])
  })

  it('a fractional limit is floored to a whole number before it is sent', async () => {
    const c = CASES[4]!
    const ids = build(10)
    const { calls } = fake(c, ids)
    const params = withPageSink({ page: 1, limit: 3.7 } as QueryParams)
    expect(await list(new ConektaAdapter(), c.method, params)).toEqual(ids.slice(0, 3))
    expect(calls[0]!.params['limit']).toBe(3)
  })
})
