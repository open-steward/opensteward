/**
 * Spreedly list paging contract.
 *
 * Both list endpoints (GET /v1/payment_methods.json, GET /v1/transactions.json)
 * are keyset-paged by record token. From the embedded OpenAPI on
 * https://developer.spreedly.com/reference/list-payment-method and
 * https://developer.spreedly.com/reference/list-transactions:
 *
 *   since_token: "The token of the item to start from (e.g., the last token
 *   received in the previous list if iterating through records)"
 *   count: "By default returns 20, maximum allowed is 100."
 *
 * https://developer.spreedly.com/reference/order-and-pagination: "To paginate
 * to the next page, simply pass in the token of the last record in the current
 * result set" — the next page starts AFTER that record. There is no has_more
 * or total in the body, so a page shorter than `count` is the last one.
 *
 * The fake upstream honours only `count` (1..100, default 20), `since_token`
 * (exclusive, must be a token in the collection) and `order` (asc|desc).
 * Anything else is a 400.
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
import { SpreedlyAdapter } from '../../../../../../src/verticals/payments/adapters/spreedly/index'

const MAX = 100

function creds(envKey = 'ENVKEY-A', secret = 'secret-a'): Credentials {
  return { accessToken: envKey, extra: { accessSecret: secret } }
}
const CREDS = creds()

type Method = 'listPaymentMethods' | 'listCharges'

interface Case {
  method: Method
  path: string
  key: string
}

const CASES: Case[] = [
  { method: 'listPaymentMethods', path: '/payment_methods.json', key: 'payment_methods' },
  { method: 'listCharges', path: '/transactions.json', key: 'transactions' },
]

interface Call {
  path: string
  params: Record<string, unknown>
}

function badRequest(msg: string): Error {
  return Object.assign(new Error(`400 ${msg}`), { response: { status: 400 } })
}

function build(n: number, prefix = 'TOK'): string[] {
  return Array.from({ length: n }, (_, i) => `${prefix}${String(i + 1).padStart(4, '0')}`)
}

function makeServer(collections: Record<string, { key: string; ids: string[] }>) {
  const calls: Call[] = []
  const get = vi.fn(async (path: string, config?: { params?: Record<string, unknown> }) => {
    const params = config?.params ?? {}
    calls.push({ path, params })
    for (const k of Object.keys(params)) {
      if (k === 'count' || k === 'since_token' || k === 'order') continue
      throw badRequest(`unknown param ${k} on ${path}`)
    }
    const c = collections[path]
    if (!c) throw new Error(`unexpected path in test: ${path}`)
    const count = params['count'] === undefined ? 20 : Number(params['count'])
    if (!Number.isInteger(count) || count < 1 || count > MAX)
      throw badRequest(`count ${String(params['count'])}`)
    const order = params['order'] ?? 'asc'
    if (order !== 'asc' && order !== 'desc') throw badRequest(`order ${String(order)}`)
    const all = order === 'desc' ? [...c.ids].reverse() : c.ids
    let start = 0
    if (params['since_token'] !== undefined) {
      const at = all.indexOf(String(params['since_token']))
      if (at < 0) throw badRequest('bad since_token')
      start = at + 1
    }
    const rows = all.slice(start, start + count).map((token) => ({ token }))
    return { data: { [c.key]: rows } }
  })
  return { get, calls }
}

function fake(c: Case, ids: string[]) {
  const server = makeServer({ [c.path]: { key: c.key, ids } })
  vi.spyOn(axios, 'create').mockReturnValue({ get: server.get } as never)
  return server
}

async function list(
  adapter: SpreedlyAdapter,
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

describe('Spreedly list paging', () => {
  it('declares the documented maximum of 100', () => {
    expect(new SpreedlyAdapter().capabilities?.maxPageSize).toBe(MAX)
  })

  for (const c of CASES) {
    describe(c.method, () => {
      it('serves 2L+1 rows once each, in order, across pages 1..3 with exact hasMore', async () => {
        for (const L of [3, 10]) {
          _resetCursorPager()
          vi.restoreAllMocks()
          const ids = build(2 * L + 1)
          fake(c, ids)
          const a = new SpreedlyAdapter()
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

      it('the page-2 request carries since_token = the last token of page 1', async () => {
        const L = 4
        const ids = build(2 * L + 1)
        const { calls } = fake(c, ids)
        const params = withPageSink({ page: 2, limit: L } as QueryParams)
        expect(await list(new SpreedlyAdapter(), c.method, params)).toEqual(ids.slice(L, 2 * L))
        expect(calls).toHaveLength(2)
        expect(calls[0]!.params['since_token']).toBeUndefined()
        expect(calls[1]!.params['since_token']).toBe(ids[L - 1])
        expect(calls.every((x) => x.params['count'] === L)).toBe(true)
        expect(calls.every((x) => !('page' in x.params))).toBe(true)
      })

      it('clamps a limit above 100 and still serves every row', async () => {
        const ids = build(2 * MAX + 1)
        const { calls } = fake(c, ids)
        const a = new SpreedlyAdapter()
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
        for (const x of calls) expect(x.params['count']).toBe(MAX)
      })

      it('API path: parseListQuery then listPage gives the right meta.hasMore', async () => {
        const ids = build(25)
        fake(c, ids)
        const a = new SpreedlyAdapter()
        const p1 = parseListQuery({ limit: '10', page: '1' }, a as PageMaxBearing)
        const r1 = listPage((await a[c.method](CREDS, p1)) as { id: string }[], p1, 'spreedly')
        expect(r1.data.map((d) => d.id)).toEqual(ids.slice(0, 10))
        expect(r1.meta.hasMore).toBe(true)

        const p3 = parseListQuery({ limit: '10', page: '3' }, a as PageMaxBearing)
        const r3 = listPage((await a[c.method](CREDS, p3)) as { id: string }[], p3, 'spreedly')
        expect(r3.data.map((d) => d.id)).toEqual(ids.slice(20))
        expect(r3.meta.hasMore).toBe(false)
      })

      it('an exact multiple of the page size ends with an empty page and no more', async () => {
        const ids = build(10)
        fake(c, ids)
        const a = new SpreedlyAdapter()
        const p2 = withPageSink({ page: 2, limit: 5 } as QueryParams)
        expect(await list(a, c.method, p2)).toEqual(ids.slice(5))
        expect(readUpstreamPage(p2)?.hasMore).toBe(true)
        const p3 = withPageSink({ page: 3, limit: 5 } as QueryParams)
        expect(await list(a, c.method, p3)).toEqual([])
        expect(readUpstreamPage(p3)?.hasMore).toBe(false)
      })

      it('order=desc is sent on every page and keeps its own walk', async () => {
        const ids = build(12)
        const { calls } = fake(c, ids)
        const a = new SpreedlyAdapter()
        await list(a, c.method, withPageSink({ page: 1, limit: 5 } as QueryParams))
        const p2 = withPageSink({ page: 2, limit: 5, order: 'desc' } as QueryParams)
        expect(await list(a, c.method, p2)).toEqual([...ids].reverse().slice(5, 10))
        const desc = calls.filter((x) => x.params['order'] === 'desc')
        expect(desc).toHaveLength(2)
        expect(desc[0]!.params['since_token']).toBeUndefined()
      })
    })
  }

  it('two connections never share a walk', async () => {
    const c = CASES[0]!
    const a = makeServer({ [c.path]: { key: c.key, ids: build(15, 'A') } })
    const b = makeServer({ [c.path]: { key: c.key, ids: build(15, 'B') } })
    let next = a
    vi.spyOn(axios, 'create').mockImplementation((() => ({ get: next.get })) as never)
    const adapter = new SpreedlyAdapter()
    await list(adapter, c.method, withPageSink({ page: 1, limit: 5 } as QueryParams), creds('E1'))
    next = b
    expect(
      await list(
        adapter,
        c.method,
        withPageSink({ page: 2, limit: 5 } as QueryParams),
        creds('E2'),
      ),
    ).toEqual(build(15, 'B').slice(5, 10))
    expect(b.calls[0]!.params['since_token']).toBeUndefined()
  })

  it('the walk is keyed by page size: page 2 at limit 3 after a walk at limit 5', async () => {
    const c = CASES[0]!
    const ids = build(20)
    fake(c, ids)
    const a = new SpreedlyAdapter()
    await list(a, c.method, withPageSink({ page: 2, limit: 5 } as QueryParams))
    expect(await list(a, c.method, withPageSink({ page: 2, limit: 3 } as QueryParams))).toEqual(
      ids.slice(3, 6),
    )
  })

  it('the walk is keyed by collection: a payment-method cursor never reaches /transactions', async () => {
    const pm = CASES[0]!
    const tx = CASES[1]!
    const pmIds = build(12, 'PM')
    const txIds = build(12, 'TX')
    const server = makeServer({
      [pm.path]: { key: pm.key, ids: pmIds },
      [tx.path]: { key: tx.key, ids: txIds },
    })
    vi.spyOn(axios, 'create').mockReturnValue({ get: server.get } as never)
    const a = new SpreedlyAdapter()
    await list(a, pm.method, withPageSink({ page: 2, limit: 5 } as QueryParams))
    expect(await list(a, tx.method, withPageSink({ page: 2, limit: 5 } as QueryParams))).toEqual(
      txIds.slice(5, 10),
    )
  })

  it('two secrets on one environment are separate connections', async () => {
    const c = CASES[0]!
    const a = makeServer({ [c.path]: { key: c.key, ids: build(15, 'A') } })
    const b = makeServer({ [c.path]: { key: c.key, ids: build(15, 'B') } })
    let next = a
    vi.spyOn(axios, 'create').mockImplementation((() => ({ get: next.get })) as never)
    const adapter = new SpreedlyAdapter()
    const p1 = withPageSink({ page: 1, limit: 5 } as QueryParams)
    await list(adapter, c.method, p1, creds('E1', 's1'))
    next = b
    const p2 = withPageSink({ page: 2, limit: 5 } as QueryParams)
    expect(await list(adapter, c.method, p2, creds('E1', 's2'))).toEqual(
      build(15, 'B').slice(5, 10),
    )
    expect(b.calls[0]!.params['since_token']).toBeUndefined()
  })

  it('an upstream that repeats the since_token as its last row ends the walk', async () => {
    const c = CASES[0]!
    const ids = build(5)
    // A misbehaving upstream: ignores since_token and always returns the same full page.
    const get = vi.fn(async () => ({ data: { [c.key]: ids.map((token) => ({ token })) } }))
    vi.spyOn(axios, 'create').mockReturnValue({ get } as never)
    const a = new SpreedlyAdapter()
    const p1 = withPageSink({ page: 1, limit: 5 } as QueryParams)
    await list(a, c.method, p1)
    expect(readUpstreamPage(p1)?.hasMore).toBe(true)
    const p2 = withPageSink({ page: 2, limit: 5 } as QueryParams)
    await list(a, c.method, p2)
    expect(readUpstreamPage(p2)?.hasMore).toBe(false)
  })

  it('a raw cursor from a direct caller is sent as since_token, outside the pager', async () => {
    const c = CASES[0]!
    const ids = build(12)
    const { calls } = fake(c, ids)
    const params = withPageSink({ limit: 5, cursor: ids[4] } as QueryParams)
    expect(await list(new SpreedlyAdapter(), c.method, params)).toEqual(ids.slice(5, 10))
    expect(calls).toHaveLength(1)
    expect(calls[0]!.params).toEqual({ count: 5, since_token: ids[4] })
  })

  it('a direct call with an invalid limit falls back to the documented default of 20', async () => {
    const c = CASES[1]!
    const ids = build(30)
    for (const limit of [0, Number.NaN, 2.5]) {
      vi.restoreAllMocks()
      _resetCursorPager()
      const { calls } = fake(c, ids)
      const params = withPageSink({ page: 1, limit } as QueryParams)
      expect(await list(new SpreedlyAdapter(), c.method, params)).toEqual(ids.slice(0, 20))
      expect(calls[0]!.params['count']).toBe(20)
    }
  })

  it('a raw since_token from the caller is sent as-is, outside the pager', async () => {
    const c = CASES[1]!
    const ids = build(12)
    const { calls } = fake(c, ids)
    const params = withPageSink({ limit: 5, since_token: ids[4] } as QueryParams)
    expect(await list(new SpreedlyAdapter(), c.method, params)).toEqual(ids.slice(5, 10))
    expect(calls).toHaveLength(1)
    expect(calls[0]!.params).toEqual({ count: 5, since_token: ids[4] })
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })
})
