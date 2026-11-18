/**
 * Stripe invoice line items, paged the way the router asks for them and the
 * sync worker asks for a list.
 *
 * `GET /v1/invoices/{invoice}/lines` is an id-keyset list
 * (https://docs.stripe.com/api/invoices/invoice_lines): "A limit on the number
 * of objects to be returned. Limit can range between 1 and 100, and the
 * default is 10. ... `starting_after` is an object ID that defines your place
 * in the list. For instance, if you make a list request and receive 100
 * objects, ending with `obj_foo`, your subsequent call can include
 * `starting_after=obj_foo` in order to fetch the next page of the list." The
 * end is `has_more` (https://docs.stripe.com/api/pagination): "If `false`,
 * this set comprises the end of the list."
 *
 * The method used to send `{ limit }` alone: on the API route
 * (`GET /invoices/:id/line_items`) page 2 was page 1 again, and a limit above
 * 100 went upstream unclamped. The sync worker does not list line items (they
 * are not in payments' LISTABLE_RESOURCES), but most walks below drive the
 * method the way it drives a list, `withPageSink({ page, limit })`, which is
 * also how the paging-contract gate probes it. The fake serves forward pages
 * only: it honours `limit` and `starting_after`, refuses a limit outside
 * 1..100, and refuses `ending_before`, which pages backwards.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  _cursorPagerSize,
  _resetCursorPager,
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
} from '@opensteward/shared'
import type { QueryParams } from '@opensteward/shared'
import { StripeAdapter } from '../../../../../../src/verticals/payments/adapters/stripe'
import type { PaymentsAdapter } from '../../../../../../src/verticals/payments/adapter/interface'

const { listMock, pagerKeys } = vi.hoisted(() => ({
  listMock: vi.fn(),
  pagerKeys: [] as string[],
}))

// The real pager, with the key of every walk recorded.
vi.mock('@opensteward/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@opensteward/shared')>()
  return {
    ...actual,
    pageByCursor: ((key, page, fetch) => {
      pagerKeys.push(key)
      return actual.pageByCursor(key, page, fetch)
    }) as typeof actual.pageByCursor,
  }
})

vi.mock('../../../../../../src/verticals/payments/adapters/stripe/client', () => ({
  StripeClient: class {
    list = listMock
    get = vi.fn()
    post = vi.fn()
    delete = vi.fn()
  },
}))

const adapter = new StripeAdapter({
  clientId: 'ca_test_client',
  clientSecret: 'sk_test_platform_secret',
  redirectUri: 'http://localhost:3010/auth/payments/stripe/callback',
})
/** The adapter as the router holds it, for `parseListQuery`'s declared-max read. */
const routed: PaymentsAdapter = adapter

const CREDS = { accessToken: 'sk_test_paging' }
const INVOICE = 'in_1'
/** "Limit can range between 1 and 100, and the default is 10." */
const STRIPE_MAX = 100
const STRIPE_DEFAULT = 10
const DOCUMENTED = new Set(['limit', 'starting_after', 'ending_before'])

function lineIds(invoice: string, n: number): string[] {
  return Array.from({ length: n }, (_, i) => `il_${invoice}_${i + 1}`)
}

/**
 * Serve `counts[invoice]` line items per invoice, in Stripe order, honouring
 * only `limit` and `starting_after`. `ending_before` is documented too, but it
 * pages backwards: a forward walk that sends it is refused here rather than
 * served a window this fake does not model. Every request is recorded with its
 * path and params.
 */
function serveLines(counts: Record<string, number>) {
  const calls: { path: string; params: Record<string, unknown> }[] = []
  listMock.mockImplementation(async (path: string, params: Record<string, unknown> = {}) => {
    calls.push({ path, params: { ...params } })
    const m = /^\/invoices\/([^/]+)\/lines$/.exec(path)
    if (!m || counts[m[1]!] === undefined) throw new Error(`unexpected path ${path}`)
    if (params['ending_before'] !== undefined) {
      throw new Error('ending_before pages backwards; a forward walk must not send it')
    }
    const ids = lineIds(m[1]!, counts[m[1]!]!)
    const limit = params['limit'] === undefined ? STRIPE_DEFAULT : Number(params['limit'])
    if (!Number.isInteger(limit) || limit < 1 || limit > STRIPE_MAX) {
      throw new Error(
        `invalid_request_error: limit must be between 1 and 100 (got ${String(params['limit'])})`,
      )
    }
    const after = params['starting_after'] as string | undefined
    const start = after === undefined ? 0 : ids.indexOf(after) + 1
    if (after !== undefined && start === 0) throw new Error(`No such line item: ${after}`)
    const data = ids.slice(start, start + limit).map((id) => ({
      id,
      object: 'line_item',
      amount: 500,
      currency: 'usd',
      invoice: m[1],
    }))
    return { object: 'list', data, has_more: start + limit < ids.length, url: path }
  })
  return calls
}

/** Drive pages 1..n the way the sync worker drives a list: `withPageSink({ page, limit })`. */
async function walk(limit: number, pages: number, invoice = INVOICE) {
  const ids: string[] = []
  const hasMore: (boolean | undefined)[] = []
  const reports: ReturnType<typeof readUpstreamPage>[] = []
  for (let page = 1; page <= pages; page++) {
    const params = withPageSink({ page, limit })
    const rows = await adapter.listInvoiceLineItems(CREDS, invoice, params)
    ids.push(...rows.map((r) => r.id))
    const report = readUpstreamPage(params)
    reports.push(report)
    hasMore.push(report?.hasMore)
  }
  return { ids, hasMore, reports }
}

beforeEach(() => {
  listMock.mockReset()
  _resetCursorPager()
})

describe('StripeAdapter.listInvoiceLineItems paging', () => {
  it('serves 2L+1 lines across three worker pages, each exactly once and in order', async () => {
    const L = 10
    const calls = serveLines({ [INVOICE]: 2 * L + 1 })
    const { ids, hasMore } = await walk(L, 3)
    expect(ids).toEqual(lineIds(INVOICE, 2 * L + 1))
    expect(hasMore).toEqual([true, true, false])
    expect(calls.map((c) => c.path)).toEqual(Array(3).fill(`/invoices/${INVOICE}/lines`))
  })

  it("page 2 carries starting_after = the last line id of page 1, at the caller's limit", async () => {
    const L = 10
    const calls = serveLines({ [INVOICE]: 2 * L + 1 })
    await walk(L, 2)
    expect(calls[0]!.params).toEqual({ limit: L })
    expect(calls[1]!.params).toEqual({ limit: L, starting_after: `il_${INVOICE}_${L}` })
  })

  it('reports the end exactly at N = 2L: page 2 is the last, page 3 is empty', async () => {
    const L = 10
    const calls = serveLines({ [INVOICE]: 2 * L })
    const { ids, hasMore } = await walk(L, 3)
    expect(ids).toEqual(lineIds(INVOICE, 2 * L))
    expect(hasMore).toEqual([true, false, false])
    // Page 3 is past a known end, so it asks nothing more.
    expect(calls).toHaveLength(2)
  })

  it('clamps a limit above the documented 100 and still serves every line', async () => {
    const calls = serveLines({ [INVOICE]: 2 * STRIPE_MAX + 1 })
    const { ids, hasMore, reports } = await walk(500, 3)
    expect(ids).toEqual(lineIds(INVOICE, 2 * STRIPE_MAX + 1))
    expect(hasMore).toEqual([true, true, false])
    for (const c of calls) expect(c.params['limit']).toBe(STRIPE_MAX)
    // The page is judged at the size actually asked for, not at 500.
    for (const r of reports) expect(r?.pageSize).toBe(STRIPE_MAX)
  })

  it('reports exactly the size it sent and what has_more said, and no local paging', async () => {
    serveLines({ [INVOICE]: 15 })
    const { reports } = await walk(10, 2)
    // Every row came from one Stripe page of the caller's size, so the report
    // claims nothing else: `pagedLocally` would tell the gate the requests
    // need not move with `page`.
    expect(reports).toEqual([
      { pageSize: 10, hasMore: true },
      { pageSize: 10, hasMore: false },
    ])
  })

  it("pages at 100 when no limit is given, the router's default, not Stripe's 10", async () => {
    const calls = serveLines({ [INVOICE]: 150 })
    const ids: string[] = []
    const reports: ReturnType<typeof readUpstreamPage>[] = []
    for (const page of [1, 2]) {
      const params = withPageSink({ page })
      const rows = await adapter.listInvoiceLineItems(CREDS, INVOICE, params)
      ids.push(...rows.map((r) => r.id))
      reports.push(readUpstreamPage(params))
    }
    expect(ids).toEqual(lineIds(INVOICE, 150))
    expect(calls.map((c) => c.params)).toEqual([
      { limit: 100 },
      { limit: 100, starting_after: `il_${INVOICE}_100` },
    ])
    expect(reports).toEqual([
      { pageSize: 100, hasMore: true },
      { pageSize: 100, hasMore: false },
    ])
  })

  it('reads a page and limit a direct caller passes as strings, not as page 1', async () => {
    const calls = serveLines({ [INVOICE]: 25 })
    const ids: string[] = []
    for (const page of ['1', '2', '3']) {
      const params = withPageSink({ page, limit: '10' } as unknown as QueryParams)
      const rows = await adapter.listInvoiceLineItems(CREDS, INVOICE, params)
      ids.push(...rows.map((r) => r.id))
    }
    expect(ids).toEqual(lineIds(INVOICE, 25))
    expect(calls[1]!.params).toEqual({ limit: 10, starting_after: `il_${INVOICE}_10` })
  })

  it('sends a limit below 1 as 1, as parseListQuery clamps it, never upstream as is', async () => {
    const calls = serveLines({ [INVOICE]: 3 })
    const params = withPageSink({ page: 1, limit: -5 })
    const rows = await adapter.listInvoiceLineItems(CREDS, INVOICE, params)
    expect(rows.map((r) => r.id)).toEqual([`il_${INVOICE}_1`])
    expect(calls.map((c) => c.params)).toEqual([{ limit: 1 }])
    expect(readUpstreamPage(params)).toEqual({ pageSize: 1, hasMore: true })
  })

  it('pages at the limit parseListQuery delivers', async () => {
    const L = 7
    serveLines({ [INVOICE]: 2 * L + 1 })
    const ids: string[] = []
    const hasMore: (boolean | undefined)[] = []
    for (let page = 1; page <= 3; page++) {
      const params = parseListQuery({ page: String(page), limit: String(L) }, routed)
      const rows = await adapter.listInvoiceLineItems(CREDS, INVOICE, params)
      ids.push(...rows.map((r) => r.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(ids).toEqual(lineIds(INVOICE, 2 * L + 1))
    expect(hasMore).toEqual([true, true, false])
  })

  it('sends only documented parameters, even with updated_after on the query', async () => {
    const calls = serveLines({ [INVOICE]: 25 })
    for (const page of ['1', '2']) {
      const params = parseListQuery(
        { page, limit: '10', updated_after: '2026-01-01T00:00:00Z' },
        routed,
      )
      await adapter.listInvoiceLineItems(CREDS, INVOICE, params)
    }
    expect(calls).toHaveLength(2)
    for (const c of calls) {
      for (const k of Object.keys(c.params)) expect(DOCUMENTED.has(k), k).toBe(true)
    }
  })

  it("keeps each invoice's walk apart: page 2 of one never starts at another's cursor", async () => {
    const calls = serveLines({ in_a: 15, in_b: 15 })
    await adapter.listInvoiceLineItems(CREDS, 'in_a', withPageSink({ page: 1, limit: 10 }))
    const rows = await adapter.listInvoiceLineItems(
      CREDS,
      'in_b',
      withPageSink({ page: 2, limit: 10 }),
    )
    expect(rows.map((r) => r.id)).toEqual(lineIds('in_b', 15).slice(10))
    for (const c of calls.filter((x) => x.path === '/invoices/in_b/lines')) {
      const after = c.params['starting_after'] as string | undefined
      if (after !== undefined) expect(after.startsWith('il_in_b_')).toBe(true)
    }
    expect(rows.every((r) => r.invoiceId === 'in_b')).toBe(true)
  })

  it('a walk at another limit never starts at a cursor minted at the first', async () => {
    const calls = serveLines({ [INVOICE]: 30 })
    await walk(10, 2)
    const rows = await adapter.listInvoiceLineItems(
      CREDS,
      INVOICE,
      withPageSink({ page: 2, limit: 7 }),
    )
    // Page 2 of 7 is lines 8..14, not whatever follows line 10.
    expect(rows.map((r) => r.id)).toEqual(lineIds(INVOICE, 30).slice(7, 14))
    expect(calls.at(-1)!.params).toEqual({ limit: 7, starting_after: `il_${INVOICE}_7` })
  })

  it('keys each connection apart, by a fingerprint and never the raw key', async () => {
    serveLines({ [INVOICE]: 15 })
    const other = { accessToken: 'sk_test_other_key' }
    pagerKeys.length = 0
    await adapter.listInvoiceLineItems(CREDS, INVOICE, withPageSink({ page: 1, limit: 10 }))
    await adapter.listInvoiceLineItems(other, INVOICE, withPageSink({ page: 1, limit: 10 }))
    expect(_cursorPagerSize()).toBe(2)
    expect(new Set(pagerKeys).size).toBe(2)
    for (const k of pagerKeys) {
      expect(k).not.toContain(CREDS.accessToken)
      expect(k).not.toContain(other.accessToken)
    }
  })

  it('API path: parseListQuery + listPage report meta.hasMore from has_more', async () => {
    const L = 10
    serveLines({ [INVOICE]: 2 * L })
    const metas = []
    for (let page = 1; page <= 2; page++) {
      const params: QueryParams = parseListQuery({ page: String(page), limit: String(L) }, routed)
      const rows = await adapter.listInvoiceLineItems(CREDS, INVOICE, params)
      metas.push(listPage(rows, params, adapter.platform).meta)
    }
    // Page 1 is full and Stripe says more; page 2 is full too, but Stripe
    // says it is the end, so a full page is not guessed to have more.
    expect(metas.map((m) => m.hasMore)).toEqual([true, false])
    expect(metas.map((m) => m.page)).toEqual([1, 2])
  })

  it('API path: a limit of 500 is served and judged as a page of 100', async () => {
    serveLines({ [INVOICE]: 2 * STRIPE_MAX + 1 })
    const params = parseListQuery({ limit: '500' }, routed)
    const rows = await adapter.listInvoiceLineItems(CREDS, INVOICE, params)
    const { meta, data } = listPage(rows, params, adapter.platform)
    expect(data).toHaveLength(STRIPE_MAX)
    expect(meta.limit).toBe(STRIPE_MAX)
    expect(meta.hasMore).toBe(true)
  })
})
