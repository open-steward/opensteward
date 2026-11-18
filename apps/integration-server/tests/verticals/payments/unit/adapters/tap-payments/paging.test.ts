/**
 * Tap Payments list paging: the caller's 1-based `page` + `limit` reach Tap.
 *
 * Every list is `POST /v2/<resource>/list` with a JSON body. What each body
 * documents (developers.tap.company/reference/<page>.md):
 *
 * - charges (list-all-charges): "A cursor for use in pagination. The
 *   starting_after parameter takes a charge ID that determines your position
 *   in the list." / "The maximum number of charges to return in a single
 *   call. Default: 25; Maximum: 50." The envelope carries `has_more`.
 * - refunds (list-all-refunds): "A cursor for use in pagination.
 *   starting_after is an Refund ID that defines your place in the list." /
 *   "The limit to the number of refunds to return in a single call. default:
 *   25 maximum: 50". The envelope carries `has_more`.
 * - customers (customer-list): body `limit` (default "50"), `page` (default
 *   "1") and `starting_after`. No response schema.
 * - invoices (list-all-invoices): body `page` (int32, default "0") and
 *   `limit` ("Default: 25; Maximum: 50."). No response schema, and no
 *   `starting_after`. The 0 default is read as a 0-based page.
 *
 * Before the fix every method took its position only from `params.cursor`,
 * which neither the router nor the sync worker sets, so page 2 was page 1.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
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
import { TapPaymentsAdapter } from '../../../../../../src/verticals/payments/adapters/tap-payments/index'

const MAX = 50
const CREDS: Credentials = { accessToken: 'sk_test_tap_paging' }

type Method = 'listCharges' | 'listRefunds' | 'listCustomers' | 'listInvoices'
type Mode = 'cursor' | 'page1' | 'page0'

interface Case {
  method: Method
  path: string
  key: string
  prefix: string
  mode: Mode
}

const CASES: Case[] = [
  { method: 'listCharges', path: '/charges/list', key: 'charges', prefix: 'chg', mode: 'cursor' },
  { method: 'listRefunds', path: '/refunds/list', key: 'refunds', prefix: 're', mode: 'cursor' },
  {
    method: 'listCustomers',
    path: '/customers/list',
    key: 'customers',
    prefix: 'cus',
    mode: 'page1',
  },
  {
    method: 'listInvoices',
    path: '/invoices/list',
    key: 'invoices',
    prefix: 'inv',
    mode: 'page0',
  },
]

function makeIds(prefix: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => `${prefix}_${String(i + 1).padStart(5, '0')}`)
}

function badRequest(msg: string): Error {
  return Object.assign(new Error(`400 ${msg}`), { response: { status: 400 } })
}

/**
 * A fake Tap holding `n` rows in the one collection under test, reading ONLY
 * the body parameters that collection's reference documents:
 * cursor lists read `limit` + `starting_after` and answer `has_more`;
 * customers read `limit` + `page` (1-based); invoices `limit` + `page`
 * (0-based). The last two answer `has_more` only when `withHasMore` is set,
 * since their references document no response shape.
 */
function fakeTap(c: Case, n: number, opts: { withHasMore?: boolean } = {}) {
  const sent: Array<{ path: string; body: Record<string, unknown> }> = []
  const all = makeIds(c.prefix, n)
  const post = vi.fn(async (path: string, body?: Record<string, unknown>) => {
    const b = { ...(body ?? {}) }
    sent.push({ path, body: b })
    if (path !== c.path)
      throw Object.assign(new Error(`404 ${path}`), { response: { status: 404 } })
    const defLimit = c.mode === 'page1' ? 50 : 25
    const limit = b.limit === undefined ? defLimit : Number(b.limit)
    if (!Number.isInteger(limit) || limit < 1) throw badRequest(`limit ${String(b.limit)}`)
    if (c.mode !== 'page1' && limit > MAX) throw badRequest(`limit ${limit} above ${MAX}`)
    let start = 0
    if (c.mode === 'cursor') {
      if (b.starting_after !== undefined) {
        const at = all.indexOf(String(b.starting_after))
        if (at < 0) throw badRequest(`starting_after ${String(b.starting_after)}`)
        start = at + 1
      }
    } else {
      const base = c.mode === 'page1' ? 1 : 0
      const page = b.page === undefined ? base : Number(b.page)
      if (!Number.isInteger(page) || page < base) throw badRequest(`page ${String(b.page)}`)
      start = (page - base) * limit
    }
    const rows = all.slice(start, start + limit).map((id) => ({ id }))
    const more = start + rows.length < all.length
    const envelope: Record<string, unknown> = { object: 'list', count: rows.length, [c.key]: rows }
    if (c.mode === 'cursor' || opts.withHasMore) envelope.has_more = more
    return { data: envelope }
  })
  const get = vi.fn(async () => {
    throw new Error('unexpected GET')
  })
  vi.spyOn(axios, 'create').mockImplementation((() => ({ get, post })) as never)
  return { sent, all }
}

async function callPage(adapter: TapPaymentsAdapter, method: Method, page: number, limit: number) {
  const params = withPageSink({ page, limit })
  const items = (await adapter[method](CREDS, params)) as Array<{ id: string }>
  return { ids: items.map((i) => i.id), hasMore: readUpstreamPage(params)?.hasMore, params }
}

beforeEach(() => {
  _resetCursorPager()
})

afterEach(() => {
  vi.restoreAllMocks()
  _resetCursorPager()
})

describe.each(CASES)('Tap Payments $method paging', (c) => {
  it('serves 2L+1 rows over three pages, each id once, in order, with exact hasMore', async () => {
    const L = 3
    const { all } = fakeTap(c, 2 * L + 1)
    const adapter = new TapPaymentsAdapter()
    const p1 = await callPage(adapter, c.method, 1, L)
    const p2 = await callPage(adapter, c.method, 2, L)
    const p3 = await callPage(adapter, c.method, 3, L)
    expect([...p1.ids, ...p2.ids, ...p3.ids]).toEqual(all)
    expect(p3.hasMore).toBe(false)
    if (c.mode === 'cursor') expect([p1.hasMore, p2.hasMore]).toEqual([true, true])
    // Page-number lists without has_more claim nothing on a full page.
    else expect([p1.hasMore, p2.hasMore]).toEqual([undefined, undefined])
  })

  if (c.mode !== 'cursor') {
    it('uses has_more when the envelope carries it, even on an exactly full last page', async () => {
      const L = 3
      const { all } = fakeTap(c, 2 * L, { withHasMore: true })
      const adapter = new TapPaymentsAdapter()
      const p1 = await callPage(adapter, c.method, 1, L)
      const p2 = await callPage(adapter, c.method, 2, L)
      expect([...p1.ids, ...p2.ids]).toEqual(all)
      expect([p1.hasMore, p2.hasMore]).toEqual([true, false])
    })
  }

  it('page 2 carries the documented position key', async () => {
    const L = 4
    const { sent, all } = fakeTap(c, 10)
    const adapter = new TapPaymentsAdapter()
    await callPage(adapter, c.method, 1, L)
    sent.length = 0
    const p2 = await callPage(adapter, c.method, 2, L)
    const expected =
      c.mode === 'cursor'
        ? { limit: L, starting_after: all[L - 1] }
        : { limit: L, page: c.mode === 'page1' ? 2 : 1 }
    expect(sent).toEqual([{ path: c.path, body: expected }])
    expect(p2.ids).toEqual(all.slice(L, 2 * L))
  })

  it('clamps a limit above 50 and still serves every row', async () => {
    const n = 2 * MAX + 1
    const { sent, all } = fakeTap(c, n)
    const adapter = new TapPaymentsAdapter()
    const pages = []
    for (let k = 1; k <= 3; k++) pages.push(await callPage(adapter, c.method, k, 5000))
    expect(sent.every((s) => Number(s.body.limit) <= MAX)).toBe(true)
    expect(readUpstreamPage(pages[0]!.params)?.pageSize).toBe(MAX)
    expect(pages.flatMap((p) => p.ids)).toEqual(all)
    expect(pages[2]!.hasMore).toBe(false)
  })

  it('gives the right meta.hasMore through parseListQuery then listPage', async () => {
    // has_more on every envelope: documented for charges and refunds, and the
    // page-number lists report it when present (without it a full page is an
    // honest null, covered above).
    fakeTap(c, 5, { withHasMore: true })
    const adapter = new TapPaymentsAdapter()
    const run = async (page: number) => {
      const params: QueryParams = parseListQuery(
        { limit: '2', page: String(page) },
        adapter as unknown as PageMaxBearing,
      )
      const items: unknown[] = await adapter[c.method](CREDS, params)
      return listPage(items, params, 'tap-payments')
    }
    const r1 = await run(1)
    expect(r1.data).toHaveLength(2)
    expect(r1.meta.hasMore).toBe(true)
    const r2 = await run(2)
    expect(r2.data).toHaveLength(2)
    expect(r2.meta.hasMore).toBe(true)
    const r3 = await run(3)
    expect(r3.data).toHaveLength(1)
    expect(r3.meta.hasMore).toBe(false)
  })
})

/**
 * A fake Tap serving one cursor collection per secret key, so two
 * connections hold disjoint ids. The client sends the key as a Bearer token.
 */
function fakeTapPerAccount(c: Case, accounts: Record<string, string[]>) {
  const sent: Array<{ token: string; body: Record<string, unknown> }> = []
  vi.spyOn(axios, 'create').mockImplementation(((cfg: { headers?: Record<string, string> }) => {
    const token = String(cfg?.headers?.Authorization ?? '').replace(/^Bearer /, '')
    const all = accounts[token] ?? []
    const post = vi.fn(async (path: string, body?: Record<string, unknown>) => {
      const b = { ...(body ?? {}) }
      sent.push({ token, body: b })
      if (path !== c.path)
        throw Object.assign(new Error(`404 ${path}`), { response: { status: 404 } })
      const limit = Number(b.limit ?? 25)
      let start = 0
      if (b.starting_after !== undefined) {
        const at = all.indexOf(String(b.starting_after))
        if (at < 0) throw badRequest(`starting_after ${String(b.starting_after)}`)
        start = at + 1
      }
      const rows = all.slice(start, start + limit).map((id) => ({ id }))
      return {
        data: { object: 'list', [c.key]: rows, has_more: start + rows.length < all.length },
      }
    })
    return { get: vi.fn(), post }
  }) as never)
  return { sent }
}

describe.each(CASES.filter((c) => c.mode === 'cursor'))('Tap Payments $method pager key', (c) => {
  it('never hands one connection another connection’s cursor', async () => {
    const A: Credentials = { accessToken: 'sk_test_account_a' }
    const B: Credentials = { accessToken: 'sk_test_account_b' }
    const aIds = makeIds(`${c.prefix}_a`, 9)
    const bIds = makeIds(`${c.prefix}_b`, 9)
    const { sent } = fakeTapPerAccount(c, {
      sk_test_account_a: aIds,
      sk_test_account_b: bIds,
    })
    const adapter = new TapPaymentsAdapter()
    for (const page of [1, 2]) {
      await adapter[c.method](A, withPageSink({ page, limit: 3 }))
    }
    sent.length = 0
    const params = withPageSink({ page: 2, limit: 3 })
    const items = (await adapter[c.method](B, params)) as Array<{ id: string }>
    expect(items.map((i) => i.id)).toEqual(bIds.slice(3, 6))
    expect(sent.every((s) => s.token === 'sk_test_account_b')).toBe(true)
    // B has never walked, so its page 2 starts from B's page 1.
    expect(sent[0]!.body).toEqual({ limit: 3 })
  })

  it('does not reuse a cursor remembered at another limit', async () => {
    const { all } = fakeTap(c, 12)
    const adapter = new TapPaymentsAdapter()
    for (const page of [1, 2]) await callPage(adapter, c.method, page, 3)
    const p2 = await callPage(adapter, c.method, 2, 5)
    expect(p2.ids).toEqual(all.slice(5, 10))
    expect(p2.hasMore).toBe(true)
  })

  it('an explicit cursor fetches exactly the Tap page after it and reports has_more', async () => {
    const { sent, all } = fakeTap(c, 10)
    const adapter = new TapPaymentsAdapter()
    const params = withPageSink({ limit: 3, cursor: all[2] } as QueryParams)
    const items = (await adapter[c.method](CREDS, params)) as Array<{ id: string }>
    expect(sent).toEqual([{ path: c.path, body: { limit: 3, starting_after: all[2] } }])
    expect(items.map((i) => i.id)).toEqual(all.slice(3, 6))
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })
})

describe.each(CASES.filter((c) => c.mode !== 'cursor'))('Tap Payments $method cursor', (c) => {
  it('an explicit cursor is sent as starting_after instead of page (legacy path)', async () => {
    const { sent } = fakeTap(c, 10)
    const adapter = new TapPaymentsAdapter()
    await adapter[c.method](
      CREDS,
      withPageSink({ page: 2, limit: 3, cursor: 'x_1' } as QueryParams),
    )
    expect(sent).toEqual([{ path: c.path, body: { limit: 3, starting_after: 'x_1' } }])
  })
})
