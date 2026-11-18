/**
 * Tipalti list paging contract.
 *
 * GET /api/v1/payees, /api/v1/payments and /api/v1/invoices each take
 * `filter`, `page-size` and `page-cursor` query parameters and answer
 * `{ totalCount, pageInfo: { hasNextPage, nextPageCursor }, items }`
 * (per-endpoint OpenAPI on https://documentation.tipalti.com/reference/get_api-v1-payees
 * and siblings):
 *
 *   "page-cursor" — "A cursor for pagination across multiple pages of results."
 *   "hasNextPage" — "Indicates whether there is another page or not."
 *   "nextPageCursor" — "Page cursor to use on the next API request call to retrieve next items."
 *
 * https://documentation.tipalti.com/reference/pagination-1: "Default value: 100",
 * "Maximum value: 200", larger sizes are a 400 (GNRL-100001).
 *
 * The fake upstream honours only `page-size` (1..200, default 100),
 * `page-cursor` (an opaque token it minted itself, valid only for the
 * collection it was minted under) and `filter`. Anything else is a 400.
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
import { TipaltiAdapter } from '../../../../../../src/verticals/payments/adapters/tipalti/index'

const MAX = 200

function creds(clientId = 'client-a', token = 'tok-a'): Credentials {
  return {
    accessToken: token,
    extra: { clientId, clientSecret: 'secret', environment: 'sandbox' },
  }
}
const CREDS = creds()

type Method = 'listCustomers' | 'listCharges' | 'listInvoices'

const CASES: { method: Method; path: string }[] = [
  { method: 'listCustomers', path: '/payees' },
  { method: 'listCharges', path: '/payments' },
  { method: 'listInvoices', path: '/invoices' },
]

interface Call {
  path: string
  params: Record<string, unknown>
}

function badRequest(msg: string): Error {
  return Object.assign(new Error(`400 ${msg}`), { response: { status: 400 } })
}

function build(n: number, prefix = 'ID'): string[] {
  return Array.from({ length: n }, (_, i) => `${prefix}${String(i + 1).padStart(4, '0')}`)
}

function makeServer(
  collections: Record<string, string[]>,
  opts: { cursorOnLastPage?: boolean } = {},
) {
  const calls: Call[] = []
  const cursors = new Map<string, { path: string; at: number }>()
  let minted = 0
  const get = vi.fn(async (path: string, config?: { params?: Record<string, unknown> }) => {
    const params = config?.params ?? {}
    calls.push({ path, params })
    for (const k of Object.keys(params)) {
      if (k === 'page-size' || k === 'page-cursor' || k === 'filter') continue
      throw badRequest(`unknown param ${k} on ${path}`)
    }
    const ids = collections[path]
    if (!ids) throw new Error(`unexpected path in test: ${path}`)
    const size = params['page-size'] === undefined ? 100 : Number(params['page-size'])
    if (!Number.isInteger(size) || size < 1 || size > MAX)
      throw badRequest(`GNRL-100001 page-size ${String(params['page-size'])}`)
    let start = 0
    if (params['page-cursor'] !== undefined) {
      const at = cursors.get(String(params['page-cursor']))
      if (!at || at.path !== path) throw badRequest('bad page-cursor')
      start = at.at
    }
    const rows = ids.slice(start, start + size).map((id) => ({ id }))
    const end = start + rows.length
    const hasNextPage = end < ids.length
    let nextPageCursor: string | undefined
    // nextPageCursor is documented as nullable, not as absent on the last
    // page; opts.cursorOnLastPage returns a (valid, empty-page) cursor there.
    if (hasNextPage || opts.cursorOnLastPage) {
      nextPageCursor = `CUR${++minted}`
      cursors.set(nextPageCursor, { path, at: end })
    }
    return {
      data: { totalCount: ids.length, pageInfo: { hasNextPage, nextPageCursor }, items: rows },
    }
  })
  return { get, calls }
}

function fake(path: string, ids: string[], opts: { cursorOnLastPage?: boolean } = {}) {
  const server = makeServer({ [path]: ids }, opts)
  vi.spyOn(axios, 'create').mockReturnValue({ get: server.get } as never)
  return server
}

async function list(
  adapter: TipaltiAdapter,
  method: Method,
  params: QueryParams,
  cr: Credentials = CREDS,
): Promise<string[]> {
  const rows = (await adapter[method](cr, params)) as { id: string }[]
  return rows.map((r) => r.id)
}

afterEach(() => {
  vi.restoreAllMocks()
  _resetCursorPager()
})

describe('Tipalti list paging', () => {
  it('declares the documented maximum of 200', () => {
    expect(new TipaltiAdapter().capabilities?.maxPageSize).toBe(MAX)
  })

  for (const c of CASES) {
    describe(c.method, () => {
      it('serves 2L+1 rows once each, in order, across pages 1..3 with exact hasMore', async () => {
        for (const L of [3, 10]) {
          _resetCursorPager()
          vi.restoreAllMocks()
          const ids = build(2 * L + 1)
          fake(c.path, ids)
          const a = new TipaltiAdapter()
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

      it('the page-2 request carries page-cursor from pageInfo.nextPageCursor', async () => {
        const L = 4
        const ids = build(2 * L + 1)
        const { calls } = fake(c.path, ids)
        const params = withPageSink({ page: 2, limit: L } as QueryParams)
        expect(await list(new TipaltiAdapter(), c.method, params)).toEqual(ids.slice(L, 2 * L))
        expect(calls).toHaveLength(2)
        expect(calls[0]!.params['page-cursor']).toBeUndefined()
        expect(calls[1]!.params['page-cursor']).toBe('CUR1')
        expect(calls.every((x) => x.params['page-size'] === L)).toBe(true)
      })

      it('clamps a limit above 200 and still serves every row', async () => {
        const ids = build(2 * MAX + 1)
        const { calls } = fake(c.path, ids)
        const a = new TipaltiAdapter()
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
        for (const x of calls) expect(x.params['page-size']).toBe(MAX)
      })

      it('API path: parseListQuery then listPage gives the right meta.hasMore', async () => {
        const ids = build(25)
        fake(c.path, ids)
        const a = new TipaltiAdapter()
        const p1 = parseListQuery({ limit: '10', page: '1' }, a as PageMaxBearing)
        const r1 = listPage((await a[c.method](CREDS, p1)) as { id: string }[], p1, 'tipalti')
        expect(r1.data.map((d) => d.id)).toEqual(ids.slice(0, 10))
        expect(r1.meta.hasMore).toBe(true)

        const p3 = parseListQuery({ limit: '10', page: '3' }, a as PageMaxBearing)
        const r3 = listPage((await a[c.method](CREDS, p3)) as { id: string }[], p3, 'tipalti')
        expect(r3.data.map((d) => d.id)).toEqual(ids.slice(20))
        expect(r3.meta.hasMore).toBe(false)
      })

      it('ends on hasNextPage:false even when the last page still carries a cursor', async () => {
        const L = 3
        const ids = build(2 * L + 1)
        fake(c.path, ids, { cursorOnLastPage: true })
        const a = new TipaltiAdapter()
        const seen: string[] = []
        const hasMore: (boolean | undefined)[] = []
        for (const page of [1, 2, 3]) {
          const params = withPageSink({ page, limit: L } as QueryParams)
          seen.push(...(await list(a, c.method, params)))
          hasMore.push(readUpstreamPage(params)?.hasMore)
        }
        expect(seen).toEqual(ids)
        expect(hasMore).toEqual([true, true, false])
      })

      it('a page past the end is empty and reports no more', async () => {
        fake(c.path, build(5))
        const params = withPageSink({ page: 4, limit: 5 } as QueryParams)
        expect(await list(new TipaltiAdapter(), c.method, params)).toEqual([])
        expect(readUpstreamPage(params)?.hasMore).toBe(false)
      })
    })
  }

  it('the pager key includes limit: page 2 at a new limit follows page 1 at that limit', async () => {
    const ids = build(20)
    fake('/payees', ids)
    const a = new TipaltiAdapter()
    await list(a, 'listCustomers', withPageSink({ page: 1, limit: 3 } as QueryParams))
    await list(a, 'listCustomers', withPageSink({ page: 2, limit: 3 } as QueryParams))
    expect(
      await list(a, 'listCustomers', withPageSink({ page: 2, limit: 5 } as QueryParams)),
    ).toEqual(ids.slice(5, 10))
  })

  it('two connections never share a walk', async () => {
    const a = makeServer({ '/payees': build(15, 'A') })
    const b = makeServer({ '/payees': build(15, 'B') })
    let next = a
    vi.spyOn(axios, 'create').mockImplementation((() => ({ get: next.get })) as never)
    const adapter = new TipaltiAdapter()
    await list(
      adapter,
      'listCustomers',
      withPageSink({ page: 1, limit: 5 } as QueryParams),
      creds('client-a', 'tok-a'),
    )
    next = b
    expect(
      await list(
        adapter,
        'listCustomers',
        withPageSink({ page: 2, limit: 5 } as QueryParams),
        creds('client-b', 'tok-b'),
      ),
    ).toEqual(build(15, 'B').slice(5, 10))
    expect(b.calls[0]!.params['page-cursor']).toBeUndefined()
  })

  it('a raw cursor from the caller is sent as page-cursor as-is, outside the pager', async () => {
    const ids = build(12)
    const { calls } = fake('/payments', ids)
    const a = new TipaltiAdapter()
    await list(a, 'listCharges', withPageSink({ limit: 5 } as QueryParams))
    const params = withPageSink({ limit: 5, cursor: 'CUR1' } as QueryParams)
    expect(await list(a, 'listCharges', params)).toEqual(ids.slice(5, 10))
    expect(calls).toHaveLength(2)
    expect(calls[1]!.params).toEqual({ 'page-size': 5, 'page-cursor': 'CUR1' })
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })

  it('a raw cursor on the last page reports no more', async () => {
    const ids = build(12)
    fake('/payments', ids)
    const a = new TipaltiAdapter()
    await list(a, 'listCharges', withPageSink({ limit: 5 } as QueryParams)) // mints CUR1
    await list(a, 'listCharges', withPageSink({ limit: 5, cursor: 'CUR1' } as QueryParams)) // CUR2
    const params = withPageSink({ limit: 5, cursor: 'CUR2' } as QueryParams)
    expect(await list(a, 'listCharges', params)).toEqual(ids.slice(10))
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('walks of different collections on one connection never share a cursor', async () => {
    const payees = build(12, 'P')
    const payments = build(12, 'M')
    const server = makeServer({ '/payees': payees, '/payments': payments })
    vi.spyOn(axios, 'create').mockReturnValue({ get: server.get } as never)
    const a = new TipaltiAdapter()
    await list(a, 'listCustomers', withPageSink({ page: 1, limit: 4 } as QueryParams))
    expect(
      await list(a, 'listCharges', withPageSink({ page: 2, limit: 4 } as QueryParams)),
    ).toEqual(payments.slice(4, 8))
    const paymentCalls = server.calls.filter((x) => x.path === '/payments')
    expect(paymentCalls[0]!.params['page-cursor']).toBeUndefined()
  })
})
