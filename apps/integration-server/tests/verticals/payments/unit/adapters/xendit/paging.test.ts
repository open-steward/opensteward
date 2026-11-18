/**
 * Xendit list paging contract.
 *
 * Every Xendit list endpoint the adapter pages is keyset-paged on a row id:
 *
 * - GET /payment_requests — https://archive.developers.xendit.co/api-reference/payments-api/#list-payment-requests
 *   "Use after_id and before_id to navigate to other resources." / has_more:
 *   "Indicates whether there are more items to be queried with after_id of the
 *   last item from the current result." No maximum documented.
 * - GET /refunds — xendit-node refund/apis/Refund.ts, getAllRefundsRaw:
 *   "queryParameters['after_id'] = requestParameters.afterId;" and a has_more
 *   envelope (RefundList.ts). No maximum documented.
 * - GET /transactions — https://docs.xendit.co/apidocs/list-transactions:
 *   has_more "Indicates whether there are more items to be queried with
 *   after_id of the last item from the current result." Limit "can range
 *   between 1 and 50" (archived reference).
 * - GET /v2/payment_methods — https://archive.developers.xendit.co/api-reference/payments-api/#list-payment-methods:
 *   limit "Maximum number of resources to be returned in the response. Use
 *   after_id and before_id to navigate to other resources. Default: 10" /
 *   has_more "Indicates whether there are more items to be queried with
 *   after_id of the last item from the current result." No maximum documented.
 * - GET /v2/invoices — https://archive.developers.xendit.co/api-reference/#list-all-invoices:
 *   "Limit can range between 1 and 100." / "last_invoice_id is an invoice ID
 *   that defines your starting point for the list." The response is a bare
 *   array, so a full page is the only sign of more.
 *
 * The fake upstream honours ONLY `limit` and the endpoint's documented cursor,
 * and answers anything else with a 400.
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
import { XenditAdapter } from '../../../../../../src/verticals/payments/adapters/xendit/index'

const CREDS: Credentials = { accessToken: 'xnd_development_a' }

type Method =
  'listCharges' | 'listRefunds' | 'listBalanceTransactions' | 'listInvoices' | 'listPaymentMethods'

interface Case {
  method: Method
  path: string
  /** The documented cursor param. */
  cursor: 'after_id' | 'last_invoice_id'
  /** Documented maximum `limit`, or null when none is documented. */
  max: number | null
  /** Envelope `{ data, has_more }`, or a bare array. */
  envelope: boolean
}

const CASES: Case[] = [
  {
    method: 'listCharges',
    path: '/payment_requests',
    cursor: 'after_id',
    max: null,
    envelope: true,
  },
  { method: 'listRefunds', path: '/refunds', cursor: 'after_id', max: null, envelope: true },
  {
    method: 'listPaymentMethods',
    path: '/v2/payment_methods',
    cursor: 'after_id',
    max: null,
    envelope: true,
  },
  {
    method: 'listBalanceTransactions',
    path: '/transactions',
    cursor: 'after_id',
    max: 50,
    envelope: true,
  },
  {
    method: 'listInvoices',
    path: '/v2/invoices',
    cursor: 'last_invoice_id',
    max: 100,
    envelope: false,
  },
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
  const get = vi.fn(async (path: string, config?: { params?: Record<string, unknown> }) => {
    const params = config?.params ?? {}
    calls.push({ path, params })
    if (path !== c.path) throw new Error(`unexpected path in test: ${path}`)
    for (const k of Object.keys(params)) {
      if (k !== 'limit' && k !== c.cursor) throw badRequest(`unknown param ${k}`)
    }
    const limit = params['limit'] === undefined ? 10 : Number(params['limit'])
    if (!Number.isInteger(limit) || limit < 1 || (c.max !== null && limit > c.max))
      throw badRequest(`limit ${String(params['limit'])}`)
    let start = 0
    if (params[c.cursor] !== undefined) {
      const at = ids.indexOf(String(params[c.cursor]))
      if (at < 0) throw badRequest(`bad ${c.cursor}`)
      start = at + 1
    }
    const page = ids.slice(start, start + limit)
    const rows = page.map((id) => ({ id }))
    if (!c.envelope) return { data: rows }
    return { data: { data: rows, has_more: start + page.length < ids.length } }
  })
  return { get, calls }
}

function fake(c: Case, ids: string[]) {
  const server = makeServer(c, ids)
  vi.spyOn(axios, 'create').mockReturnValue({ get: server.get } as never)
  return server
}

async function list(
  adapter: XenditAdapter,
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

describe('Xendit list paging', () => {
  it('declares no adapter-wide maxPageSize (the documented maxima differ per endpoint)', () => {
    expect((new XenditAdapter() as PageMaxBearing).capabilities?.maxPageSize).toBeUndefined()
  })

  for (const c of CASES) {
    describe(c.method, () => {
      it('serves 2L+1 rows once each, in order, across pages 1..3 with exact hasMore', async () => {
        for (const L of [3, 10]) {
          _resetCursorPager()
          vi.restoreAllMocks()
          const ids = build(2 * L + 1)
          fake(c, ids)
          const a = new XenditAdapter()
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

      it(`the page-2 request carries the documented \`${c.cursor}\` = last id of page 1`, async () => {
        const L = 4
        const ids = build(2 * L + 1)
        const { calls } = fake(c, ids)
        const params = withPageSink({ page: 2, limit: L } as QueryParams)
        expect(await list(new XenditAdapter(), c.method, params)).toEqual(ids.slice(L, 2 * L))
        expect(calls).toHaveLength(2)
        expect(calls[0]!.params[c.cursor]).toBeUndefined()
        expect(calls[1]!.params[c.cursor]).toBe(ids[L - 1])
        expect(calls.every((x) => x.params['limit'] === L)).toBe(true)
        expect(calls.every((x) => !('page' in x.params))).toBe(true)
      })

      if (c.max !== null) {
        const max = c.max
        it(`clamps a limit above ${max} and still serves every row`, async () => {
          const ids = build(2 * max + 1)
          const { calls } = fake(c, ids)
          const a = new XenditAdapter()
          const seen: string[] = []
          for (let page = 1; ; page++) {
            expect(page).toBeLessThan(10)
            const params = withPageSink({ page, limit: 1000 } as QueryParams)
            seen.push(...(await list(a, c.method, params)))
            const meta = readUpstreamPage(params)
            expect(meta?.pageSize).toBe(max)
            if (!meta?.hasMore) break
          }
          expect(seen).toEqual(ids)
          for (const x of calls) expect(x.params['limit']).toBeLessThanOrEqual(max)
        })
      } else {
        it('sends a large caller limit unchanged (no maximum is documented)', async () => {
          const ids = build(301)
          const { calls } = fake(c, ids)
          const params = withPageSink({ page: 1, limit: 300 } as QueryParams)
          expect(await list(new XenditAdapter(), c.method, params)).toEqual(ids.slice(0, 300))
          expect(calls[0]!.params['limit']).toBe(300)
          expect(readUpstreamPage(params)?.hasMore).toBe(true)
        })
      }

      it('API path: parseListQuery then listPage gives the right meta.hasMore', async () => {
        const ids = build(25)
        fake(c, ids)
        const a = new XenditAdapter()
        const p1 = parseListQuery({ limit: '10', page: '1' }, a as PageMaxBearing)
        const r1 = listPage((await a[c.method](CREDS, p1)) as { id: string }[], p1, 'xendit')
        expect(r1.data.map((d) => d.id)).toEqual(ids.slice(0, 10))
        expect(r1.meta.hasMore).toBe(true)

        const p3 = parseListQuery({ limit: '10', page: '3' }, a as PageMaxBearing)
        const r3 = listPage((await a[c.method](CREDS, p3)) as { id: string }[], p3, 'xendit')
        expect(r3.data.map((d) => d.id)).toEqual(ids.slice(20))
        expect(r3.meta.hasMore).toBe(false)
      })

      it('a page past the end is empty and reports no more', async () => {
        fake(c, build(5))
        const params = withPageSink({ page: 4, limit: 5 } as QueryParams)
        expect(await list(new XenditAdapter(), c.method, params)).toEqual([])
        expect(readUpstreamPage(params)?.hasMore).toBe(false)
      })
    })
  }

  it('the pager key includes limit: page 2 at a new limit follows page 1 at that limit', async () => {
    const c = CASES[0]!
    const ids = build(20)
    fake(c, ids)
    const a = new XenditAdapter()
    await list(a, c.method, withPageSink({ page: 1, limit: 3 } as QueryParams))
    await list(a, c.method, withPageSink({ page: 2, limit: 3 } as QueryParams))
    expect(await list(a, c.method, withPageSink({ page: 2, limit: 5 } as QueryParams))).toEqual(
      ids.slice(5, 10),
    )
  })

  it('has_more true on an empty page ends the walk instead of looping', async () => {
    const get = vi.fn(async () => ({ data: { data: [], has_more: true } }))
    vi.spyOn(axios, 'create').mockReturnValue({ get } as never)
    const params = withPageSink({ page: 1, limit: 2 } as QueryParams)
    expect(await list(new XenditAdapter(), 'listRefunds', params)).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    expect(get).toHaveBeenCalledTimes(1)
  })

  for (const c of CASES.filter((x) => x.envelope)) {
    describe(`${c.method}: has_more is the end signal, not page fullness`, () => {
      it('a short page with has_more true goes on to the next page by after_id', async () => {
        const calls: Call[] = []
        const get = vi.fn(async (_path: string, config?: { params?: Record<string, unknown> }) => {
          const params = config?.params ?? {}
          calls.push({ path: _path, params })
          if (params['after_id'] === undefined)
            return { data: { data: [{ id: 'a1' }, { id: 'a2' }], has_more: true } }
          if (params['after_id'] === 'a2')
            return { data: { data: [{ id: 'a3' }, { id: 'a4' }], has_more: false } }
          throw badRequest('bad after_id')
        })
        vi.spyOn(axios, 'create').mockReturnValue({ get } as never)
        const a = new XenditAdapter()
        const p1 = withPageSink({ page: 1, limit: 5 } as QueryParams)
        expect(await list(a, c.method, p1)).toEqual(['a1', 'a2'])
        expect(readUpstreamPage(p1)?.hasMore).toBe(true)
        const p2 = withPageSink({ page: 2, limit: 5 } as QueryParams)
        expect(await list(a, c.method, p2)).toEqual(['a3', 'a4'])
        expect(readUpstreamPage(p2)?.hasMore).toBe(false)
        expect(calls.at(-1)!.params['after_id']).toBe('a2')
      })

      it('a full page with has_more false reports the end and makes no further request', async () => {
        const get = vi.fn(async () => ({
          data: { data: [{ id: 'b1' }, { id: 'b2' }, { id: 'b3' }], has_more: false },
        }))
        vi.spyOn(axios, 'create').mockReturnValue({ get } as never)
        const params = withPageSink({ page: 1, limit: 3 } as QueryParams)
        expect(await list(new XenditAdapter(), c.method, params)).toEqual(['b1', 'b2', 'b3'])
        expect(readUpstreamPage(params)?.hasMore).toBe(false)
        expect(get).toHaveBeenCalledTimes(1)
      })
    })
  }

  it('sends the default page size of 50 when the caller gives no limit', async () => {
    const c = CASES.find((x) => x.method === 'listBalanceTransactions')!
    const { calls } = fake(c, build(60))
    const params = withPageSink({ page: 1 } as QueryParams)
    expect(await list(new XenditAdapter(), c.method, params)).toEqual(build(60).slice(0, 50))
    expect(calls[0]!.params['limit']).toBe(50)
  })

  it('two connections never share a walk', async () => {
    const c = CASES.find((x) => x.method === 'listBalanceTransactions')!
    const a = makeServer(c, build(15, 'A'))
    const b = makeServer(c, build(15, 'B'))
    let next = a
    vi.spyOn(axios, 'create').mockImplementation((() => ({ get: next.get })) as never)
    const adapter = new XenditAdapter()
    const credsB: Credentials = { accessToken: 'xnd_development_b' }
    await list(adapter, c.method, withPageSink({ page: 1, limit: 5 } as QueryParams))
    next = b
    expect(
      await list(adapter, c.method, withPageSink({ page: 2, limit: 5 } as QueryParams), credsB),
    ).toEqual(build(15, 'B').slice(5, 10))
    expect(b.calls[0]!.params['after_id']).toBeUndefined()
  })
})
