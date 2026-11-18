/**
 * Paging contract for Fortnox's list methods, driven through the real adapter.
 *
 * listCreditMemos used to walk GET /3/invoices on page 1 (at the CALLER's page
 * size, capped at 50 pages), keep the rows whose `Credit` flag was set, return
 * all of them at once, and answer every later page with []. Two losses:
 *
 *   - At limit=10 the walk saw 500 invoices, so older credit notes were missed.
 *   - The router truncates an over-long page 1 to the caller's limit, so on the
 *     API path everything past the first `limit` credit notes was dropped.
 *
 * Fortnox filters server-side instead. GET /3/invoices documents a `credit`
 * query parameter ("Credit of invoices to list", https://apps.fortnox.se/apidocs,
 * typed as a free string), and the invoice's `Credit` property is documented as
 * "boolean, read-only, searchable" with the description "If the invoice is a
 * credit invoice." So credit notes page exactly like invoices: `limit` 1..500
 * (default 100) and a 1-based `page`.
 *
 * UNVERIFIED: no Fortnox doc spells out the VALUE. `credit=true` is the
 * conventional reading of a boolean field that single-invoice responses send
 * as the string "true"/"false". The fake below encodes that same reading, so
 * these tests cannot prove it; tests/integration/fortnox/credit-memos.test.ts
 * checks it against a live company, and the adapter refuses a page Fortnox
 * itself marks as holding a debit invoice.
 *
 * Whether list rows carry `Credit` is unsettled too: the 2022 first-party "List
 * all invoices" example and a recorded 2023 list response have none, while the
 * current spec's list-item schema declares it. The fake runs both ways.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { parseListQuery, readUpstreamPage, withPageSink } from '@opensteward/shared'
import { FortnoxAdapter } from '../../../../../../src/verticals/accounting/adapters/fortnox'
import { FortnoxClient } from '../../../../../../src/verticals/accounting/adapters/fortnox/client'
import type {
  Credentials,
  QueryParams,
} from '../../../../../../src/verticals/accounting/adapter/interface'

const adapter = new FortnoxAdapter({
  clientId: 'i',
  clientSecret: 's',
  redirectUri: 'http://localhost:3010/cb',
  scopes: ['invoice'],
})
const creds = { accessToken: 'tok' } as Credentials

afterEach(() => vi.restoreAllMocks())

/** Fortnox's documented bounds on `limit`. */
const DOC_DEFAULT_LIMIT = 100
const DOC_MAX_LIMIT = 500

/**
 * The query keys the fake understands: the global `limit` and `page`, the
 * global `lastmodified`, and `credit`, the one resource-specific search this
 * method may use ("only one resource specific filter can be used at a time").
 */
const KNOWN_KEYS = new Set(['limit', 'page', 'lastmodified', 'credit'])

interface StoredInvoice {
  DocumentNumber: string
  Credit: boolean
}

/**
 * Credit invoices `c-0 … c-(n-1)`, each followed by a debit invoice, so a
 * request that forgets the `credit` filter gets the wrong rows rather than
 * merely fewer of them.
 */
function invoiceStore(creditCount: number): StoredInvoice[] {
  return Array.from({ length: creditCount }, (_, i) => [
    { DocumentNumber: `c-${i}`, Credit: true },
    { DocumentNumber: `d-${i}`, Credit: false },
  ]).flat()
}

/**
 * A list row as GET /3/invoices sends it. `withCredit` picks between the two
 * readings above: no `Credit` (recorded list responses) or `Credit` as the
 * string the single-invoice GET uses (the current list-item schema).
 */
function listRow(inv: StoredInvoice, withCredit: boolean) {
  return {
    DocumentNumber: inv.DocumentNumber,
    CustomerNumber: '1',
    CustomerName: 'Acme AB',
    InvoiceDate: '2024-03-01',
    DueDate: '2024-03-31',
    Total: -100,
    Balance: 0,
    Booked: true,
    Cancelled: false,
    Currency: 'SEK',
    ...(withCredit && { Credit: String(inv.Credit) }),
  }
}

/**
 * GET /3/invoices honouring ONLY the documented parameters: `limit` (1..500,
 * default 100), `page` (1-based, default 1), `lastmodified`, and the `credit`
 * search, read as `true`. Any other key or value is refused, loudly.
 */
function fakeFortnox(store: StoredInvoice[], { withCredit }: { withCredit: boolean }) {
  return vi
    .spyOn(FortnoxClient.prototype, 'get')
    .mockImplementation(async (path: string, query?: Record<string, unknown>) => {
      if (path !== 'invoices') throw new Error(`unexpected path ${path}`)
      const q = query ?? {}
      const unknown = Object.keys(q).filter((k) => !KNOWN_KEYS.has(k))
      if (unknown.length > 0) throw new Error(`fake Fortnox refuses ${unknown.join(', ')}`)
      if (q['credit'] !== undefined && q['credit'] !== 'true') {
        throw new Error(`fake Fortnox refuses credit=${String(q['credit'])}`)
      }
      const limit = q['limit'] === undefined ? DOC_DEFAULT_LIMIT : Number(q['limit'])
      const page = q['page'] === undefined ? 1 : Number(q['page'])
      if (!Number.isInteger(limit) || limit < 1 || limit > DOC_MAX_LIMIT) {
        throw new Error(`fake Fortnox refuses limit=${String(q['limit'])}`)
      }
      if (!Number.isInteger(page) || page < 1) {
        throw new Error(`fake Fortnox refuses page=${String(q['page'])}`)
      }
      const matching = q['credit'] === 'true' ? store.filter((inv) => inv.Credit) : store
      return {
        Invoices: matching
          .slice((page - 1) * limit, page * limit)
          .map((inv) => listRow(inv, withCredit)),
        MetaInformation: {
          '@TotalResources': matching.length,
          '@CurrentPage': page,
          '@TotalPages': Math.ceil(matching.length / limit),
        },
      }
    })
}

const creditIds = (from: number, to: number) =>
  Array.from({ length: to - from }, (_, i) => `c-${from + i}`)

type ListFn = (c: Credentials, p: QueryParams) => Promise<Array<{ id?: string }>>

// Every list method this fix touches. The other Fortnox list methods already
// paged by the caller's limit and position; their request shape is pinned in
// the last block of this file.
const METHODS: Array<[string, ListFn]> = [
  ['listCreditMemos', (c, p) => adapter.listCreditMemos(c, p)],
]

const LIST_ROWS: Array<[string, boolean]> = [
  ['list rows without Credit', false],
  ['list rows with Credit', true],
]

describe.each(METHODS)('Fortnox %s pages by the caller', (_name, list) => {
  describe.each(LIST_ROWS)('%s', (_rows, withCredit) => {
    const fake = (creditCount: number) => fakeFortnox(invoiceStore(creditCount), { withCredit })

    it('asks Fortnox for credit invoices only, at the caller’s page and limit', async () => {
      const spy = fake(30)
      await list(creds, parseListQuery({ page: '2', limit: '10' }))
      expect(spy).toHaveBeenCalledTimes(1)
      expect(spy).toHaveBeenCalledWith(
        'invoices',
        expect.objectContaining({ credit: 'true', page: 2, limit: 10 }),
      )
    })

    it('page 1 gives the first credit invoices', async () => {
      fake(30)
      const rows = await list(creds, parseListQuery({ page: '1', limit: '10' }))
      expect(rows.map((r) => r.id)).toEqual(creditIds(0, 10))
    })

    it('page 2 gives the next ones', async () => {
      fake(30)
      const rows = await list(creds, parseListQuery({ page: '2', limit: '10' }))
      expect(rows.map((r) => r.id)).toEqual(creditIds(10, 20))
    })

    it('a missing page gives the first', async () => {
      fake(30)
      const rows = await list(creds, parseListQuery({ limit: '10' }))
      expect(rows.map((r) => r.id)).toEqual(creditIds(0, 10))
    })

    // parseListQuery reads 0, -3 and 'abc' as the first page before the
    // adapter sees them, so this guard is for direct callers: built directly.
    it.each([0, -3, Number.NaN])('a direct page %s gives the first', async (page) => {
      fake(30)
      const params = parseListQuery({ limit: '10' })
      params.page = page
      const rows = await list(creds, params)
      expect(rows.map((r) => r.id)).toEqual(creditIds(0, 10))
    })

    it('a direct call with no limit keeps Fortnox’s default page size', async () => {
      const spy = fake(150)
      const rows = await list(creds, {})
      expect(spy).toHaveBeenCalledWith('invoices', expect.objectContaining({ limit: 100, page: 1 }))
      expect(rows.map((r) => r.id)).toEqual(creditIds(0, 100))
    })

    it('clamps a limit above the documented 500, and page 2 strides by the clamp', async () => {
      const spy = fake(1001)
      const rows = await list(creds, withPageSink({ page: 2, limit: 1000 }))
      expect(spy).toHaveBeenCalledWith(
        'invoices',
        expect.objectContaining({ limit: DOC_MAX_LIMIT, page: 2 }),
      )
      expect(rows.map((r) => r.id)).toEqual(creditIds(500, 1000))
    })

    it('never returns more rows than the caller asked for, so the router drops none', async () => {
      fake(30)
      const rows = await list(creds, parseListQuery({ page: '1', limit: '7' }))
      expect(rows).toHaveLength(7)
    })

    it('reports Fortnox’s own count of credit invoices', async () => {
      fake(30)
      const params = parseListQuery({ page: '1', limit: '10' })
      await list(creds, params)
      expect(readUpstreamPage(params)).toMatchObject({
        totalCount: 30,
        totalPages: 3,
        currentPage: 1,
      })
    })

    // Driven the way the sync worker drives it: withPageSink({ page: k, limit: L })
    // for k = 1.., ending on a reported hasMore when there is one, else on a
    // short page.
    it('walks every credit invoice exactly once, in order', async () => {
      const L = 10
      const N = 2 * L + 1
      fake(N)

      const seen: string[] = []
      for (let k = 1; k <= 10; k++) {
        const params = withPageSink({ page: k, limit: L })
        const rows = await list(creds, params)
        seen.push(...rows.map((r) => r.id ?? '<no id>'))
        const hasMore = readUpstreamPage(params)?.hasMore
        if (typeof hasMore === 'boolean' ? !hasMore : rows.length < L) break
      }

      expect(seen).toEqual(creditIds(0, N))
    })
  })

  // If Fortnox ever ignored or misread `credit=true`, it would answer with every
  // invoice. Where its rows say which are debit invoices, the adapter must fail
  // rather than pass them off as credit memos (and report the total of ALL
  // invoices as the credit-memo count).
  it('refuses a page Fortnox itself marks as holding a debit invoice', async () => {
    const store = invoiceStore(5)
    vi.spyOn(FortnoxClient.prototype, 'get').mockResolvedValue({
      Invoices: store.map((inv) => listRow(inv, true)),
      MetaInformation: { '@TotalResources': 10, '@CurrentPage': 1, '@TotalPages': 1 },
    } as never)
    const params = parseListQuery({ page: '1', limit: '10' })
    await expect(list(creds, params)).rejects.toThrow(/d-0 is not a credit invoice/)
    expect(readUpstreamPage(params)).toBeUndefined()
  })

  it('reads a boolean false as a debit invoice too', async () => {
    vi.spyOn(FortnoxClient.prototype, 'get').mockResolvedValue({
      Invoices: [{ ...listRow({ DocumentNumber: 'd-9', Credit: false }, false), Credit: false }],
    } as never)
    await expect(list(creds, parseListQuery({ limit: '10' }))).rejects.toThrow(
      /d-9 is not a credit invoice/,
    )
  })
})

describe('Fortnox capabilities', () => {
  // The sync worker sizes its pages by this and ends a collection on a short
  // page. A sync configured above 500 would otherwise read Fortnox's clamped
  // 500 as the last page.
  it('declares the documented 500-row maximum page size', () => {
    expect(adapter.capabilities?.maxPageSize).toBe(DOC_MAX_LIMIT)
  })
})

// Every Fortnox list method goes through the same `limit`/`page` helper. Pin
// what each one sends, so a page Fortnox does not number (0, negative, NaN) is
// never sent upstream and the documented 500 clamp holds for all of them.
const ALL_METHODS: Array<[string, ListFn, string[]]> = [
  ['listInvoices', (c, p) => adapter.listInvoices(c, p), ['invoices']],
  ['listBills', (c, p) => adapter.listBills(c, p), ['supplierinvoices']],
  ['listContacts', (c, p) => adapter.listContacts(c, p), ['customers', 'suppliers']],
  ['listAccounts', (c, p) => adapter.listAccounts(c, p), ['accounts']],
  ['listJournals', (c, p) => adapter.listJournals(c, p), ['vouchers']],
  ['listTransactions', (c, p) => adapter.listTransactions(c, p), ['invoicepayments']],
  ['listOrders', (c, p) => adapter.listOrders(c, p), ['orders']],
  ['listSalesOrders', (c, p) => adapter.listSalesOrders(c, p), ['orders']],
  ['listCreditMemos', (c, p) => adapter.listCreditMemos(c, p), ['invoices']],
]

describe.each(ALL_METHODS)('Fortnox %s request shape', (_name, list, paths) => {
  /** Every request the method sent, as [path, page, limit]. */
  async function sent(params: QueryParams) {
    const spy = vi.spyOn(FortnoxClient.prototype, 'get').mockResolvedValue({} as never)
    await list(creds, params)
    return spy.mock.calls.map(([path, query]) => {
      const q = (query ?? {}) as Record<string, unknown>
      return [path, q['page'], q['limit']]
    })
  }

  it('sends the caller’s page and limit', async () => {
    expect(await sent(parseListQuery({ page: '2', limit: '10' }))).toEqual(
      paths.map((p) => [p, 2, 10]),
    )
  })

  it('sends page 1 when no page was given', async () => {
    expect(await sent(parseListQuery({ limit: '10' }))).toEqual(paths.map((p) => [p, 1, 10]))
  })

  it.each([0, -3, Number.NaN])('sends page 1 for a direct page %s', async (page) => {
    const params = parseListQuery({ limit: '10' })
    params.page = page
    expect(await sent(params)).toEqual(paths.map((p) => [p, 1, 10]))
  })

  it('clamps a limit above the documented 500 and keeps the page', async () => {
    expect(await sent(withPageSink({ page: 2, limit: 1000 }))).toEqual(
      paths.map((p) => [p, 2, DOC_MAX_LIMIT]),
    )
  })

  it('sends Fortnox’s default of 100 on a direct call with no limit', async () => {
    expect(await sent({})).toEqual(paths.map((p) => [p, 1, DOC_DEFAULT_LIMIT]))
  })
})
