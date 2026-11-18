/**
 * Recurly list paging: 1-based `page` + caller's `limit` → Recurly's cursor.
 *
 * Every list endpoint (GET /accounts, /subscriptions, /invoices, /transactions,
 * /plans) takes `limit` ("Limit number of records 1-200.") and no page or
 * offset. The envelope is `{ object: 'list', has_more, next, data }`, where
 * `has_more` "Indicates there are more results on subsequent pages." and
 * `next` is the "Path to subsequent page of results." — "To page through every
 * record, your code should continually call the URL" it names.
 * (https://docs.recurly.com/recurly-subscriptions/v2021-02-25/reference/list_accounts.md)
 *
 * So page N is reached by following `next` verbatim with pageByCursor: one
 * upstream page is one caller page.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import axios from 'axios'
import {
  _resetCursorPager,
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type Credentials,
  type PageMaxBearing,
  type QueryParams,
} from '@opensteward/shared'
import { RecurlyAdapter } from '../../../../../../src/verticals/payments/adapters/recurly/index'

const MAX = 200
const ORIGIN = 'https://v3.recurly.com'

const CREDS: Credentials = { accessToken: Buffer.from('key_a:').toString('base64') }
const credsFor = (apiKey: string): Credentials => ({
  accessToken: Buffer.from(`${apiKey}:`).toString('base64'),
})

/** Query params each list endpoint documents (plus `cursor`, which only its own `next` carries). */
const DOCUMENTED: Record<string, Set<string>> = {
  '/accounts': new Set([
    'ids',
    'limit',
    'order',
    'sort',
    'begin_time',
    'end_time',
    'email',
    'subscriber',
    'past_due',
    'cursor',
  ]),
  '/subscriptions': new Set([
    'ids',
    'limit',
    'order',
    'sort',
    'begin_time',
    'end_time',
    'state',
    'cursor',
  ]),
  '/invoices': new Set([
    'ids',
    'state',
    'limit',
    'order',
    'sort',
    'begin_time',
    'end_time',
    'type',
    'cursor',
  ]),
  '/transactions': new Set([
    'ids',
    'limit',
    'order',
    'sort',
    'begin_time',
    'end_time',
    'type',
    'success',
    'cursor',
  ]),
  '/plans': new Set(['ids', 'limit', 'order', 'sort', 'begin_time', 'end_time', 'state', 'cursor']),
}

interface Sent {
  /** The path exactly as the adapter passed it to axios. */
  raw: string
  path: string
  params: Record<string, string>
  apiKey: string
  /** The params object passed alongside the path, if any. */
  configParams: Record<string, unknown> | undefined
}

function makeIds(prefix: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => `${prefix}_${String(i + 1).padStart(4, '0')}`)
}

function httpError(status: number, msg: string): Error {
  return Object.assign(new Error(`${status} ${msg}`), { response: { status } })
}

/**
 * Opaque to the adapter. Bound to the walk that minted it (api key, collection,
 * limit, type filter): replayed under any other walk it is a 400, so a pager
 * key that is too coarse fails loudly instead of serving rows.
 */
interface CursorState {
  k: string
  p: string
  l: number
  t: string | null
  o: number
}
const encodeCursor = (s: CursorState) => Buffer.from(JSON.stringify(s)).toString('base64url')
function decodeCursor(raw: string, walk: Omit<CursorState, 'o'>): number {
  let s: CursorState
  try {
    s = JSON.parse(Buffer.from(raw, 'base64url').toString()) as CursorState
  } catch {
    throw httpError(400, `cursor ${raw}`)
  }
  if (s.k !== walk.k || s.p !== walk.p || s.l !== walk.l || s.t !== walk.t)
    throw httpError(400, `cursor ${raw} was minted for another query`)
  return s.o
}

/**
 * A fake Recurly holding `n` rows in each list collection (prefix per api
 * key), reading ONLY the documented params. /transactions alternates
 * `purchase` and `refund`, and honours `type`. `next` is a path by default;
 * `absoluteNext` makes it a full URL, as the Pagination guide's sample shows.
 */
function fakeRecurly(
  n: number,
  opts: {
    prefixByKey?: Record<string, string>
    absoluteNext?: boolean
    nextOrigin?: string
    /** Rewrites every `next` the fake returns. */
    rewriteNext?: (next: string) => string
    /** Also return a (stale) `next` on the last page, with has_more false. */
    staleNextAtEnd?: boolean
  } = {},
) {
  const sent: Sent[] = []
  const makeGet = (apiKey: string) =>
    vi.fn(async (raw: string, config?: { params?: Record<string, unknown> }) => {
      const url = new URL(raw, ORIGIN)
      if (url.origin !== ORIGIN) throw httpError(599, `request left Recurly: ${url.origin}`)
      const q: Record<string, string> = Object.fromEntries(url.searchParams)
      for (const [k, v] of Object.entries(config?.params ?? {}))
        if (v !== undefined) q[k] = String(v)
      const path = url.pathname
      sent.push({ raw, path, params: q, apiKey, configParams: config?.params })
      const documented = DOCUMENTED[path]
      if (!documented) throw httpError(404, path)
      for (const k of Object.keys(q)) if (!documented.has(k)) throw httpError(400, `unknown ${k}`)

      const prefix = (opts.prefixByKey?.[apiKey] ?? '') + path.slice(1)
      const type = q.type ?? null
      const rows = makeIds(prefix, n)
        .map((id, i) => ({ id, type: i % 2 === 1 ? 'refund' : 'purchase' }))
        .filter((r) => path !== '/transactions' || type === null || r.type === type)
      const limit = q.limit === undefined ? 20 : Number(q.limit)
      if (!Number.isInteger(limit) || limit < 1 || limit > MAX)
        throw httpError(400, `limit ${String(q.limit)}`)
      const walk = { k: apiKey, p: path, l: limit, t: type }
      const offset = q.cursor === undefined ? 0 : decodeCursor(q.cursor, walk)
      const end = offset + limit
      const hasMore = end < rows.length
      let next: string | null = null
      if (hasMore || opts.staleNextAtEnd) {
        const nq = new URLSearchParams({
          cursor: encodeCursor({ ...walk, o: end }),
          limit: String(limit),
        })
        if (type !== null) nq.set('type', type)
        next = `${path}?${nq.toString()}`
        if (opts.nextOrigin) next = `${opts.nextOrigin}${next}`
        else if (opts.absoluteNext) next = `${ORIGIN}${next}`
        if (opts.rewriteNext) next = opts.rewriteNext(next)
      }
      return {
        data: {
          object: 'list',
          has_more: hasMore,
          next,
          data: rows.slice(offset, end).map((r) => ({
            ...r,
            code: r.id,
            currency: 'USD',
            amount: 1,
            created_at: '2026-01-01T00:00:00Z',
          })),
        },
      }
    })
  vi.spyOn(axios, 'create').mockImplementation(((config?: {
    headers?: Record<string, unknown>
  }) => {
    const auth = String(config?.headers?.['Authorization'] ?? '')
    const apiKey = Buffer.from(auth.replace(/^Basic /, ''), 'base64')
      .toString()
      .replace(/:$/, '')
    return { get: makeGet(apiKey), post: vi.fn(), put: vi.fn(), delete: vi.fn() }
  }) as never)
  return { sent }
}

type Method =
  | 'listCustomers'
  | 'listSubscriptions'
  | 'listInvoices'
  | 'listCharges'
  | 'listRefunds'
  | 'listPlans'

const CASES: Array<{ method: Method; path: string; type?: string }> = [
  { method: 'listCustomers', path: '/accounts' },
  { method: 'listSubscriptions', path: '/subscriptions' },
  { method: 'listInvoices', path: '/invoices' },
  { method: 'listCharges', path: '/transactions' },
  { method: 'listRefunds', path: '/transactions', type: 'refund' },
  { method: 'listPlans', path: '/plans' },
]

/** The ids the fake serves for a case, in order. */
function expectedIds(c: (typeof CASES)[number], n: number, keyPrefix = ''): string[] {
  const all = makeIds(keyPrefix + c.path.slice(1), n)
  return c.type === 'refund' ? all.filter((_, i) => i % 2 === 1) : all
}

async function callPage(
  adapter: RecurlyAdapter,
  method: Method,
  page: number,
  limit: number,
  creds: Credentials = CREDS,
) {
  const params = withPageSink({ page, limit } as QueryParams)
  const items = (await adapter[method](creds, params)) as Array<{ id: string }>
  return { ids: items.map((i) => i.id), hasMore: readUpstreamPage(params)?.hasMore, params }
}

beforeEach(() => {
  _resetCursorPager()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe.each(CASES)('Recurly $method paging (GET $path, cursor)', (c) => {
  // listRefunds sees every other transaction, so it needs twice the rows.
  const rowsFor = (wanted: number) => (c.type === 'refund' ? 2 * wanted : wanted)

  it('serves 2L+1 rows over three pages, each id once, in order, with exact hasMore', async () => {
    const L = 3
    const n = rowsFor(2 * L + 1)
    fakeRecurly(n)
    const adapter = new RecurlyAdapter()
    const p1 = await callPage(adapter, c.method, 1, L)
    const p2 = await callPage(adapter, c.method, 2, L)
    const p3 = await callPage(adapter, c.method, 3, L)
    expect([...p1.ids, ...p2.ids, ...p3.ids]).toEqual(expectedIds(c, n))
    expect([p1.ids.length, p2.ids.length, p3.ids.length]).toEqual([L, L, 1])
    expect([p1.hasMore, p2.hasMore, p3.hasMore]).toEqual([true, true, false])
    const p4 = await callPage(adapter, c.method, 4, L)
    expect(p4.ids).toEqual([])
    expect(p4.hasMore).toBe(false)
  })

  it('page 2 follows page 1 `next` verbatim, carrying its cursor', async () => {
    const L = 4
    const { sent } = fakeRecurly(rowsFor(10))
    const adapter = new RecurlyAdapter()
    await callPage(adapter, c.method, 1, L)
    expect(sent).toHaveLength(1)
    expect(sent[0]!.path).toBe(c.path)
    expect(sent[0]!.params).toEqual({ limit: String(L), ...(c.type ? { type: c.type } : {}) })
    sent.length = 0
    const p2 = await callPage(adapter, c.method, 2, L)
    expect(sent).toHaveLength(1)
    const walk = { k: 'key_a', p: c.path, l: L, t: c.type ?? null }
    expect(sent[0]!.params).toEqual({
      cursor: encodeCursor({ ...walk, o: L }),
      limit: String(L),
      ...(c.type ? { type: c.type } : {}),
    })
    expect(sent[0]!.raw.startsWith(`${c.path}?cursor=`)).toBe(true)
    // Sent as the link alone: no params object that could repeat `limit`.
    expect(sent[0]!.configParams).toBeUndefined()
    expect(p2.ids).toEqual(expectedIds(c, rowsFor(10)).slice(L, 2 * L))
  })

  it('clamps a limit above 200 and still serves every row', async () => {
    const n = rowsFor(2 * MAX + 1)
    const { sent } = fakeRecurly(n)
    const adapter = new RecurlyAdapter()
    const pages = []
    for (let k = 1; k <= 4; k++) pages.push(await callPage(adapter, c.method, k, 1000))
    expect(sent.every((s) => Number(s.params.limit) === MAX)).toBe(true)
    expect(pages.flatMap((p) => p.ids)).toEqual(expectedIds(c, n))
    expect(pages.map((p) => p.hasMore)).toEqual([true, true, false, false])
    expect(readUpstreamPage(pages[0]!.params)?.pageSize).toBe(MAX)
  })

  it('gives the right meta.hasMore through parseListQuery then listPage', async () => {
    fakeRecurly(rowsFor(5))
    const adapter = new RecurlyAdapter()
    const run = async (page: number) => {
      const params: QueryParams = parseListQuery(
        { limit: '2', page: String(page) },
        adapter as PageMaxBearing,
      )
      const items: unknown[] = await adapter[c.method](CREDS, params)
      return listPage(items, params, 'recurly')
    }
    const r1 = await run(1)
    expect(r1.data).toHaveLength(2)
    expect(r1.meta.hasMore).toBe(true)
    const r2 = await run(2)
    expect(r2.meta.hasMore).toBe(true)
    const r3 = await run(3)
    expect(r3.data).toHaveLength(1)
    expect(r3.meta.hasMore).toBe(false)
  })
})

describe('Recurly cursor walks', () => {
  it('a cold page 3 walks the `next` chain from page 1', async () => {
    const L = 2
    const { sent } = fakeRecurly(7)
    const p3 = await callPage(new RecurlyAdapter(), 'listCustomers', 3, L)
    expect(p3.ids).toEqual(makeIds('accounts', 7).slice(4, 6))
    expect(p3.hasMore).toBe(true)
    const walk = { k: 'key_a', p: '/accounts', l: L, t: null }
    expect(sent.map((s) => s.params.cursor)).toEqual([
      undefined,
      encodeCursor({ ...walk, o: 2 }),
      encodeCursor({ ...walk, o: 4 }),
    ])
  })

  it('keeps each connection on its own walk', async () => {
    const { sent } = fakeRecurly(9, { prefixByKey: { key_a: 'A', key_b: 'B' } })
    const adapter = new RecurlyAdapter()
    await callPage(adapter, 'listCustomers', 1, 3, credsFor('key_a'))
    sent.length = 0
    const b2 = await callPage(adapter, 'listCustomers', 2, 3, credsFor('key_b'))
    expect(b2.ids).toEqual(makeIds('Baccounts', 9).slice(3, 6))
    expect(sent.every((s) => s.apiKey === 'key_b')).toBe(true)
    expect(sent.map((s) => s.params.cursor)).toEqual([
      undefined,
      encodeCursor({ k: 'key_b', p: '/accounts', l: 3, t: null, o: 3 }),
    ])
  })

  it('does not reuse a walk across page sizes', async () => {
    const { sent } = fakeRecurly(12)
    const adapter = new RecurlyAdapter()
    await callPage(adapter, 'listPlans', 1, 3)
    await callPage(adapter, 'listPlans', 2, 3)
    sent.length = 0
    const p2 = await callPage(adapter, 'listPlans', 2, 4)
    expect(p2.ids).toEqual(makeIds('plans', 12).slice(4, 8))
    expect(sent.map((s) => s.params.limit)).toEqual(['4', '4'])
  })

  it('never hands a listCharges cursor to listRefunds on the shared /transactions collection', async () => {
    const { sent } = fakeRecurly(12)
    const adapter = new RecurlyAdapter()
    await callPage(adapter, 'listCharges', 1, 2)
    await callPage(adapter, 'listCharges', 2, 2)
    sent.length = 0
    const r2 = await callPage(adapter, 'listRefunds', 2, 2)
    expect(r2.ids).toEqual(['transactions_0006', 'transactions_0008'])
    expect(sent.map((s) => s.params.type)).toEqual(['refund', 'refund'])
    expect(sent[0]!.params.cursor).toBeUndefined()
  })

  it('follows an absolute same-origin `next` URL', async () => {
    fakeRecurly(5, { absoluteNext: true })
    const adapter = new RecurlyAdapter()
    const ids: string[] = []
    for (let k = 1; k <= 3; k++) ids.push(...(await callPage(adapter, 'listInvoices', k, 2)).ids)
    expect(ids).toEqual(makeIds('invoices', 5))
  })

  it('refuses a `next` URL on another origin rather than sending the api key there', async () => {
    const { sent } = fakeRecurly(5, { nextOrigin: 'https://evil.example' })
    const adapter = new RecurlyAdapter()
    await callPage(adapter, 'listInvoices', 1, 2)
    await expect(callPage(adapter, 'listInvoices', 2, 2)).rejects.toThrow(/next/i)
    expect(sent.every((s) => !s.raw.startsWith('https://evil.example'))).toBe(true)
  })

  it('keys each walk by endpoint: a listCustomers cursor never reaches listPlans', async () => {
    const { sent } = fakeRecurly(9)
    const adapter = new RecurlyAdapter()
    await callPage(adapter, 'listCustomers', 1, 3)
    await callPage(adapter, 'listCustomers', 2, 3)
    sent.length = 0
    const p2 = await callPage(adapter, 'listPlans', 2, 3)
    expect(p2.ids).toEqual(makeIds('plans', 9).slice(3, 6))
    expect(sent.map((s) => s.path)).toEqual(['/plans', '/plans'])
    expect(sent[0]!.params.cursor).toBeUndefined()
  })

  it('stops at has_more false even when a `next` link is still present', async () => {
    const { sent } = fakeRecurly(4, { staleNextAtEnd: true })
    const adapter = new RecurlyAdapter()
    const p2 = await callPage(adapter, 'listCustomers', 2, 2)
    expect(p2.hasMore).toBe(false)
    sent.length = 0
    const p3 = await callPage(adapter, 'listCustomers', 3, 2)
    expect(p3.ids).toEqual([])
    expect(p3.hasMore).toBe(false)
    expect(sent).toHaveLength(0)
  })

  it('refuses a same-origin `next` whose path is protocol-relative', async () => {
    const { sent } = fakeRecurly(5, {
      rewriteNext: (next) => `${ORIGIN}//evil.example${next}`,
    })
    const adapter = new RecurlyAdapter()
    await callPage(adapter, 'listInvoices', 1, 2)
    sent.length = 0
    // Refused by the adapter before axios sees it, not by the fake's off-origin check.
    await expect(callPage(adapter, 'listInvoices', 2, 2)).rejects.toThrow(/host-like path/)
    expect(sent).toHaveLength(0)
  })

  it('sends the default size when no limit is given, and floors a fractional one', async () => {
    const { sent } = fakeRecurly(3)
    const adapter = new RecurlyAdapter()
    await adapter.listCustomers(CREDS, withPageSink({} as QueryParams))
    await adapter.listCustomers(CREDS, withPageSink({ page: 1, limit: 2.7 } as QueryParams))
    expect(sent.map((s) => s.params.limit)).toEqual(['100', '2'])
  })

  it('raises a limit below 1 to 1', async () => {
    const { sent } = fakeRecurly(3)
    const p1 = await callPage(new RecurlyAdapter(), 'listCustomers', 1, 0)
    expect(sent.map((s) => s.params.limit)).toEqual(['1'])
    expect(p1.ids).toEqual(['accounts_0001'])
    expect(p1.hasMore).toBe(true)
  })

  it('declares maxPageSize 200, the documented limit maximum', () => {
    const adapter = new RecurlyAdapter()
    expect(adapter.capabilities.maxPageSize).toBe(MAX)
    expect(parseListQuery({ limit: '500' }, adapter as PageMaxBearing).limit).toBe(MAX)
  })
})

describe('Recurly listPaymentMethods paging', () => {
  function fakeBillingInfo() {
    const get = vi.fn(async (raw: string) => {
      if (raw !== '/accounts/acct_1/billing_info') throw httpError(404, raw)
      return { data: { id: 'bi_1', account_id: 'acct_1', created_at: '2026-01-01T00:00:00Z' } }
    })
    vi.spyOn(axios, 'create').mockImplementation((() => ({
      get,
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    })) as never)
    return get
  }

  it('serves the one billing_info record on page 1 only and reports the end', async () => {
    const get = fakeBillingInfo()
    const adapter = new RecurlyAdapter()
    const run = async (page: number, limit: number) => {
      const params = withPageSink({ page, limit, customerId: 'acct_1' } as QueryParams)
      const items = await adapter.listPaymentMethods(CREDS, params)
      return { n: items.length, hasMore: readUpstreamPage(params)?.hasMore }
    }
    expect(await run(1, 1)).toEqual({ n: 1, hasMore: false })
    expect(await run(2, 1)).toEqual({ n: 0, hasMore: false })
    expect(await run(1, 50)).toEqual({ n: 1, hasMore: false })
    expect(get).toHaveBeenCalled()
  })

  it('reports an empty, ended collection without a customerId', async () => {
    const get = fakeBillingInfo()
    const params = withPageSink({ page: 1, limit: 10 } as QueryParams)
    expect(await new RecurlyAdapter().listPaymentMethods(CREDS, params)).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    expect(get).not.toHaveBeenCalled()
  })
})
