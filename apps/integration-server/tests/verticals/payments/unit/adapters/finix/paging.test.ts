/**
 * Finix list paging contract.
 *
 * Every Finix list endpoint is an opaque cursor walk, documented once for the
 * whole API (pinned Finix-Version 2022-02-01) at
 * https://docs.finix.com/additional-resources/developers/authentication-and-api-basics/pagination.md:
 *
 *   "All API responses are limited to 100 results per page."
 *   "To get results ***after*** `next_cursor`, pass in `after_cursor: {{next_cursor}}`"
 *   "When `next_cursor` is `null`, there are no more results available."
 *
 * The first-party OpenAPI bundle (https://docs.finix.com/_spec/api/index.json)
 * gives every list operation the shared `after_cursor` / `limit` (maximum 100)
 * parameters and a `page { limit, next_cursor }` object in the 200 body.
 *
 * The fake upstream honours only `limit` (1..100), `after_cursor` (an opaque
 * token it minted itself, valid only for the collection and filter it was
 * minted under), the documented `updated_at.gte` filter (every list operation
 * in the spec takes it) and, on /transfers, the documented `type` filter.
 * Anything else is a 400. Row i of every collection has `updated_at` =
 * {@link stamp}(i).
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
import { FinixAdapter } from '../../../../../../src/verticals/payments/adapters/finix/index'

const MAX = 100

function creds(username = 'USsandboxA', password = 'secret-a'): Credentials {
  return {
    accessToken: Buffer.from(`${username}:${password}`).toString('base64'),
    extra: { live: false, username },
  }
}
const CREDS = creds()

type Method =
  | 'listCustomers'
  | 'listPaymentMethods'
  | 'listCharges'
  | 'listRefunds'
  | 'listSubscriptions'
  | 'listPayouts'
  | 'listDisputes'
  | 'listPlans'

interface Case {
  method: Method
  path: string
  key: string
  type?: string
}

const CASES: Case[] = [
  { method: 'listCustomers', path: '/identities', key: 'identities' },
  { method: 'listPaymentMethods', path: '/payment_instruments', key: 'payment_instruments' },
  { method: 'listCharges', path: '/transfers', key: 'transfers', type: 'DEBIT' },
  { method: 'listRefunds', path: '/transfers', key: 'transfers', type: 'REVERSAL' },
  { method: 'listSubscriptions', path: '/subscriptions', key: 'subscriptions' },
  { method: 'listPayouts', path: '/settlements', key: 'settlements' },
  { method: 'listDisputes', path: '/disputes', key: 'disputes' },
  { method: 'listPlans', path: '/subscription_plans', key: 'subscription_plans' },
]

interface Call {
  path: string
  params: Record<string, unknown>
}

/** The `updated_at` of row `i` (0-based) in any fake collection: one day apart. */
function stamp(i: number): Date {
  return new Date(Date.UTC(2026, 0, 1) + i * 86_400_000)
}

function badRequest(msg: string): Error {
  return Object.assign(new Error(`400 ${msg}`), { response: { status: 400 } })
}

function build(n: number, prefix = 'ID'): string[] {
  return Array.from({ length: n }, (_, i) => `${prefix}${String(i + 1).padStart(4, '0')}`)
}

/** A cursor-paged collection keyed by path (and, on /transfers, by `type`). */
type Collections = Record<string, { key: string; ids: string[] }>

function collectionKey(path: string, type?: unknown): string {
  return type === undefined ? path : `${path}?type=${String(type)}`
}

function makeServer(collections: Collections) {
  const calls: Call[] = []
  const cursors = new Map<string, { coll: string; gte: unknown; at: number }>()
  let minted = 0
  const get = vi.fn(async (path: string, config?: { params?: Record<string, unknown> }) => {
    const params = config?.params ?? {}
    calls.push({ path, params })
    for (const k of Object.keys(params)) {
      if (k === 'limit' || k === 'after_cursor' || k === 'updated_at.gte') continue
      if (k === 'type' && path === '/transfers') continue
      throw badRequest(`unknown param ${k} on ${path}`)
    }
    const coll = collectionKey(path, params['type'])
    const c = collections[coll]
    if (!c) throw new Error(`unexpected collection in test: ${coll}`)
    const limit = params['limit'] === undefined ? 10 : Number(params['limit'])
    if (!Number.isInteger(limit) || limit < 1 || limit > MAX)
      throw badRequest(`limit ${String(params['limit'])}`)
    const gte = params['updated_at.gte']
    const all = c.ids
      .map((id, i) => ({ id, updated_at: stamp(i).toISOString() }))
      .filter((r) => gte === undefined || r.updated_at >= String(gte))
    let start = 0
    if (params['after_cursor'] !== undefined) {
      const at = cursors.get(String(params['after_cursor']))
      if (!at || at.coll !== coll || at.gte !== gte) throw badRequest('bad after_cursor')
      start = at.at
    }
    const rows = all.slice(start, start + limit)
    const end = start + rows.length
    let next: string | null = null
    if (end < all.length) {
      next = `TOK${++minted}`
      cursors.set(next, { coll, gte, at: end })
    }
    return {
      data: {
        _embedded: { [c.key]: rows },
        page: { limit, next_cursor: next },
        _links: {},
      },
    }
  })
  return { get, calls }
}

function install(collections: Collections) {
  const server = makeServer(collections)
  vi.spyOn(axios, 'create').mockReturnValue({ get: server.get } as never)
  return server
}

function fake(c: Case, ids: string[]) {
  return install({ [collectionKey(c.path, c.type)]: { key: c.key, ids } })
}

async function list(
  adapter: FinixAdapter,
  method: Method | 'listBalanceTransactions',
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

describe('Finix list paging', () => {
  it('declares the documented maximum of 100', () => {
    expect(new FinixAdapter().capabilities?.maxPageSize).toBe(MAX)
  })

  for (const c of CASES) {
    describe(c.method, () => {
      it('serves 2L+1 rows once each, in order, across pages 1..3 with exact hasMore', async () => {
        for (const L of [3, 10]) {
          _resetCursorPager()
          vi.restoreAllMocks()
          const ids = build(2 * L + 1)
          fake(c, ids)
          const a = new FinixAdapter()
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

      it('the page-2 request carries the documented after_cursor from page.next_cursor', async () => {
        const L = 4
        const ids = build(2 * L + 1)
        const { calls } = fake(c, ids)
        const params = withPageSink({ page: 2, limit: L } as QueryParams)
        expect(await list(new FinixAdapter(), c.method, params)).toEqual(ids.slice(L, 2 * L))
        expect(calls).toHaveLength(2)
        expect(calls[0]!.params['after_cursor']).toBeUndefined()
        expect(calls[1]!.params['after_cursor']).toBe('TOK1')
        expect(calls.every((x) => x.params['limit'] === L)).toBe(true)
        expect(calls.every((x) => x.params['type'] === c.type)).toBe(true)
        expect(calls.every((x) => !('page' in x.params))).toBe(true)
      })

      it('clamps a limit above 100 and still serves every row', async () => {
        const ids = build(2 * MAX + 1)
        const { calls } = fake(c, ids)
        const a = new FinixAdapter()
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
        for (const x of calls) expect(x.params['limit']).toBe(MAX)
      })

      it('API path: parseListQuery then listPage gives the right meta.hasMore', async () => {
        const ids = build(25)
        fake(c, ids)
        const a = new FinixAdapter()
        const p1 = parseListQuery({ limit: '10', page: '1' }, a as PageMaxBearing)
        const r1 = listPage((await a[c.method](CREDS, p1)) as { id: string }[], p1, 'finix')
        expect(r1.data.map((d) => d.id)).toEqual(ids.slice(0, 10))
        expect(r1.meta.hasMore).toBe(true)

        const p3 = parseListQuery({ limit: '10', page: '3' }, a as PageMaxBearing)
        const r3 = listPage((await a[c.method](CREDS, p3)) as { id: string }[], p3, 'finix')
        expect(r3.data.map((d) => d.id)).toEqual(ids.slice(20))
        expect(r3.meta.hasMore).toBe(false)
      })

      it('a page past the end is empty and reports no more', async () => {
        fake(c, build(5))
        const params = withPageSink({ page: 4, limit: 5 } as QueryParams)
        expect(await list(new FinixAdapter(), c.method, params)).toEqual([])
        expect(readUpstreamPage(params)?.hasMore).toBe(false)
      })

      it('updatedAfter sends updated_at.gte on every page and serves only rows at or after it', async () => {
        const ids = build(20)
        const { calls } = fake(c, ids)
        const a = new FinixAdapter()
        const updatedAfter = stamp(8)
        const seen: string[] = []
        const hasMore: (boolean | undefined)[] = []
        for (const page of [1, 2, 3]) {
          const params = withPageSink({ page, limit: 5, updatedAfter } as QueryParams)
          seen.push(...(await list(a, c.method, params)))
          hasMore.push(readUpstreamPage(params)?.hasMore)
        }
        expect(seen).toEqual(ids.slice(8))
        expect(hasMore).toEqual([true, true, false])
        expect(calls.length).toBeGreaterThanOrEqual(3)
        for (const x of calls) expect(x.params['updated_at.gte']).toBe(updatedAfter.toISOString())
      })
    })
  }

  it('charges and refunds share /transfers but never share a walk (type is in the key)', async () => {
    const debits = build(12, 'TRd')
    const reversals = build(12, 'TRr')
    const { calls } = install({
      '/transfers?type=DEBIT': { key: 'transfers', ids: debits },
      '/transfers?type=REVERSAL': { key: 'transfers', ids: reversals },
    })
    const a = new FinixAdapter()
    await list(a, 'listCharges', withPageSink({ page: 1, limit: 4 } as QueryParams))
    await list(a, 'listCharges', withPageSink({ page: 2, limit: 4 } as QueryParams))
    expect(
      await list(a, 'listRefunds', withPageSink({ page: 2, limit: 4 } as QueryParams)),
    ).toEqual(reversals.slice(4, 8))
    const refundCalls = calls.filter((x) => x.params['type'] === 'REVERSAL')
    expect(refundCalls).toHaveLength(2)
    expect(refundCalls[0]!.params['after_cursor']).toBeUndefined()
  })

  it('the pager key includes limit: page 2 at a new limit follows page 1 at that limit', async () => {
    const c = CASES[0]!
    const ids = build(20)
    fake(c, ids)
    const a = new FinixAdapter()
    await list(a, c.method, withPageSink({ page: 1, limit: 3 } as QueryParams))
    await list(a, c.method, withPageSink({ page: 2, limit: 3 } as QueryParams))
    expect(await list(a, c.method, withPageSink({ page: 2, limit: 5 } as QueryParams))).toEqual(
      ids.slice(5, 10),
    )
  })

  it('a filtered and an unfiltered walk at the same limit never share cursors', async () => {
    const c = CASES[0]!
    const ids = build(20)
    const { calls } = fake(c, ids)
    const a = new FinixAdapter()
    const updatedAfter = stamp(8)
    await list(a, c.method, withPageSink({ page: 1, limit: 5 } as QueryParams))
    expect(
      await list(a, c.method, withPageSink({ page: 2, limit: 5, updatedAfter } as QueryParams)),
    ).toEqual(ids.slice(13, 18))
    const filtered = calls.filter((x) => x.params['updated_at.gte'] !== undefined)
    expect(filtered[0]!.params['after_cursor']).toBeUndefined()
    // And back: the unfiltered walk still continues from its own page 1.
    expect(await list(a, c.method, withPageSink({ page: 2, limit: 5 } as QueryParams))).toEqual(
      ids.slice(5, 10),
    )
  })

  it('two connections never share a walk', async () => {
    const c = CASES[6]!
    const a = makeServer({ [c.path]: { key: c.key, ids: build(15, 'A') } })
    const b = makeServer({ [c.path]: { key: c.key, ids: build(15, 'B') } })
    let next = a
    vi.spyOn(axios, 'create').mockImplementation((() => ({ get: next.get })) as never)
    const adapter = new FinixAdapter()
    await list(adapter, c.method, withPageSink({ page: 1, limit: 5 } as QueryParams), creds('USa'))
    next = b
    expect(
      await list(
        adapter,
        c.method,
        withPageSink({ page: 2, limit: 5 } as QueryParams),
        creds('USb', 'secret-b'),
      ),
    ).toEqual(build(15, 'B').slice(5, 10))
    expect(b.calls[0]!.params['after_cursor']).toBeUndefined()
  })

  it('a next_cursor repeating the cursor just sent ends the walk', async () => {
    const get = vi.fn(async (_path: string, config?: { params?: Record<string, unknown> }) => {
      const sent = config?.params?.['after_cursor']
      return {
        data: {
          _embedded: { disputes: [{ id: sent === undefined ? 'a' : 'b' }] },
          page: { limit: 2, next_cursor: sent === undefined ? 'c1' : String(sent) },
        },
      }
    })
    vi.spyOn(axios, 'create').mockReturnValue({ get } as never)
    const a = new FinixAdapter()
    const p1 = withPageSink({ page: 1, limit: 2 } as QueryParams)
    expect(await list(a, 'listDisputes', p1)).toEqual(['a'])
    expect(readUpstreamPage(p1)?.hasMore).toBe(true)
    const p2 = withPageSink({ page: 2, limit: 2 } as QueryParams)
    expect(await list(a, 'listDisputes', p2)).toEqual(['b'])
    expect(readUpstreamPage(p2)?.hasMore).toBe(false)
  })

  it('a raw after_cursor from the caller is sent as-is, outside the pager', async () => {
    const c = CASES[5]!
    const ids = build(12)
    const { calls } = fake(c, ids)
    const a = new FinixAdapter()
    await list(a, c.method, withPageSink({ limit: 5 } as QueryParams))
    const params = withPageSink({ limit: 5, after_cursor: 'TOK1' } as QueryParams)
    expect(await list(a, c.method, params)).toEqual(ids.slice(5, 10))
    expect(calls).toHaveLength(2)
    expect(calls[1]!.params).toEqual({ limit: 5, after_cursor: 'TOK1' })
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })
})

/**
 * Balance entries are nested under balances: GET /balances, then
 * GET /balances/{id}/balance_entries per balance. Both are cursor-paged the
 * same way (spec operationIds listBalances and listBalanceEntries), so one
 * caller page is cut out of a flattened walk over both chains.
 */
describe('Finix listBalanceTransactions paging', () => {
  function balanceServer(balances: { id: string; entries: string[] }[]) {
    const collections: Collections = {
      '/balances': { key: 'balances', ids: balances.map((b) => b.id) },
    }
    for (const b of balances) {
      collections[`/balances/${b.id}/balance_entries`] = {
        key: 'balance_entries',
        ids: b.entries,
      }
    }
    return install(collections)
  }

  /** 102 balances (more than one page of them), a few holding entries, some empty. */
  function layout(total: number) {
    const all = build(total, 'BE')
    const bal = build(102, 'BL').map((id) => ({ id, entries: [] as string[] }))
    // Entries spread over the first balance, one mid-page, and one on the second page of balances.
    const cuts = [0, Math.floor(total / 3), Math.floor((2 * total) / 3), total]
    bal[0]!.entries = all.slice(cuts[0], cuts[1])
    bal[50]!.entries = all.slice(cuts[1], cuts[2])
    bal[101]!.entries = all.slice(cuts[2], cuts[3])
    return { all, bal }
  }

  it('serves 2L+1 entries once each, in order, across pages 1..3 with exact hasMore', async () => {
    for (const L of [3, 10]) {
      _resetCursorPager()
      vi.restoreAllMocks()
      const { all, bal } = layout(2 * L + 1)
      balanceServer(bal)
      const a = new FinixAdapter()
      const seen: string[] = []
      const hasMore: (boolean | undefined)[] = []
      for (const page of [1, 2, 3]) {
        const params = withPageSink({ page, limit: L } as QueryParams)
        seen.push(...(await list(a, 'listBalanceTransactions', params)))
        hasMore.push(readUpstreamPage(params)?.hasMore)
      }
      expect(seen).toEqual(all)
      expect(hasMore).toEqual([true, true, false])
    }
  })

  it('walks the balances chain by after_cursor and each entries chain by after_cursor', async () => {
    const entries = build(2 * MAX + 5, 'BE')
    const bal = [{ id: 'BL0001', entries }]
    for (const id of build(101, 'BX')) bal.push({ id, entries: [] })
    const { calls } = balanceServer(bal)
    const a = new FinixAdapter()
    const seen: string[] = []
    for (let page = 1; ; page++) {
      expect(page).toBeLessThan(10)
      const params = withPageSink({ page, limit: MAX } as QueryParams)
      seen.push(...(await list(a, 'listBalanceTransactions', params)))
      if (!readUpstreamPage(params)?.hasMore) break
    }
    expect(seen).toEqual(entries)
    const balanceCalls = calls.filter((x) => x.path === '/balances')
    expect(balanceCalls.some((x) => typeof x.params['after_cursor'] === 'string')).toBe(true)
    const entryCalls = calls.filter((x) => x.path === '/balances/BL0001/balance_entries')
    expect(entryCalls.some((x) => typeof x.params['after_cursor'] === 'string')).toBe(true)
    for (const x of calls) expect(x.params['limit']).toBeLessThanOrEqual(MAX)
  })

  it('a limit above 100 still serves every entry and never asks upstream for more than 100', async () => {
    const { all, bal } = layout(2 * MAX + 1)
    const { calls } = balanceServer(bal)
    const a = new FinixAdapter()
    const seen: string[] = []
    for (let page = 1; ; page++) {
      expect(page).toBeLessThan(10)
      const params = withPageSink({ page, limit: 1000 } as QueryParams)
      seen.push(...(await list(a, 'listBalanceTransactions', params)))
      const meta = readUpstreamPage(params)
      expect(meta?.pagedLocally).toBe(true)
      if (!meta?.hasMore) break
    }
    expect(seen).toEqual(all)
    for (const x of calls) expect(x.params['limit']).toBeLessThanOrEqual(MAX)
  })

  it('API path: parseListQuery then listPage gives the right meta.hasMore', async () => {
    const { all, bal } = layout(25)
    balanceServer(bal)
    const a = new FinixAdapter()
    const p1 = parseListQuery({ limit: '10', page: '1' }, a as PageMaxBearing)
    const r1 = listPage(
      (await a.listBalanceTransactions(CREDS, p1)) as { id: string }[],
      p1,
      'finix',
    )
    expect(r1.data.map((d) => d.id)).toEqual(all.slice(0, 10))
    expect(r1.meta.hasMore).toBe(true)

    const p3 = parseListQuery({ limit: '10', page: '3' }, a as PageMaxBearing)
    const r3 = listPage(
      (await a.listBalanceTransactions(CREDS, p3)) as { id: string }[],
      p3,
      'finix',
    )
    expect(r3.data.map((d) => d.id)).toEqual(all.slice(20))
    expect(r3.meta.hasMore).toBe(false)
  })

  it('updatedAfter reaches every balance_entries request and keeps its own walk', async () => {
    const e1 = build(10, 'EA')
    const e2 = build(10, 'EB')
    const { calls } = balanceServer([
      { id: 'BL0001', entries: e1 },
      { id: 'BL0002', entries: e2 },
    ])
    const updatedAfter = stamp(4)
    const want = [...e1.slice(4), ...e2.slice(4)]
    const a = new FinixAdapter()
    // An unfiltered walk first, so a key that ignored the filter would resume from it.
    for (const page of [1, 2])
      await list(a, 'listBalanceTransactions', withPageSink({ page, limit: 5 } as QueryParams))
    const p3 = withPageSink({ page: 3, limit: 5, updatedAfter } as QueryParams)
    expect(await list(a, 'listBalanceTransactions', p3)).toEqual(want.slice(10))
    expect(readUpstreamPage(p3)?.hasMore).toBe(false)
    const seen: string[] = []
    for (const page of [1, 2]) {
      const params = withPageSink({ page, limit: 5, updatedAfter } as QueryParams)
      seen.push(...(await list(a, 'listBalanceTransactions', params)))
      expect(readUpstreamPage(params)?.hasMore).toBe(true)
    }
    expect(seen).toEqual(want.slice(0, 10))
    const entryCalls = calls.filter(
      (x) => x.path.endsWith('/balance_entries') && x.params['updated_at.gte'] !== undefined,
    )
    expect(entryCalls.length).toBeGreaterThanOrEqual(2)
    for (const x of entryCalls) expect(x.params['updated_at.gte']).toBe(updatedAfter.toISOString())
  })

  it('a balances next_cursor repeating the cursor just sent ends the walk', async () => {
    const get = vi.fn(async (path: string, config?: { params?: Record<string, unknown> }) => {
      const sent = config?.params?.['after_cursor']
      if (path === '/balances')
        return {
          data: {
            _embedded: { balances: [{ id: sent === undefined ? 'B1' : 'B2' }] },
            page: { limit: 100, next_cursor: 'c1' },
          },
        }
      const id = path.split('/')[2]
      return {
        data: {
          _embedded: { balance_entries: [{ id: `E-${id}` }] },
          page: { limit: 100, next_cursor: null },
        },
      }
    })
    vi.spyOn(axios, 'create').mockReturnValue({ get } as never)
    const params = withPageSink({ page: 1, limit: 10 } as QueryParams)
    expect(await list(new FinixAdapter(), 'listBalanceTransactions', params)).toEqual([
      'E-B1',
      'E-B2',
    ])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    expect(get.mock.calls.filter(([p]) => p === '/balances')).toHaveLength(2)
  })

  it('an entries next_cursor repeating the cursor just sent moves on to the next balance', async () => {
    const get = vi.fn(async (path: string, config?: { params?: Record<string, unknown> }) => {
      const sent = config?.params?.['after_cursor']
      if (path === '/balances')
        return {
          data: {
            _embedded: { balances: [{ id: 'B1' }, { id: 'B2' }] },
            page: { limit: 100, next_cursor: null },
          },
        }
      const id = path.split('/')[2]
      if (id === 'B2')
        return {
          data: {
            _embedded: { balance_entries: [{ id: 'E-B2' }] },
            page: { limit: 100, next_cursor: null },
          },
        }
      return {
        data: {
          _embedded: { balance_entries: [{ id: sent === undefined ? 'E-B1a' : 'E-B1b' }] },
          page: { limit: 100, next_cursor: 'x1' },
        },
      }
    })
    vi.spyOn(axios, 'create').mockReturnValue({ get } as never)
    const params = withPageSink({ page: 1, limit: 10 } as QueryParams)
    expect(await list(new FinixAdapter(), 'listBalanceTransactions', params)).toEqual([
      'E-B1a',
      'E-B1b',
      'E-B2',
    ])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    expect(get).toHaveBeenCalledTimes(4)
  })

  it('no balances: an empty page with no more', async () => {
    balanceServer([])
    const params = withPageSink({ page: 1, limit: 10 } as QueryParams)
    expect(await list(new FinixAdapter(), 'listBalanceTransactions', params)).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })
})
