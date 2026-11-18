/**
 * LedgerSMB listAccounts paging: the upstream returns the whole chart of
 * accounts in one response, so the adapter slices it locally.
 *
 * GET {instanceUrl}/erp/api/v0/accounts/ reads exactly one query parameter and
 * no paging of any kind. The vendor's route handler:
 *   https://raw.githubusercontent.com/ledgersmb/LedgerSMB/master/lib/LedgerSMB/Routes/ERP/API/Accounts.pm
 *     "my $label = $req->parameters->{label} // '';"
 *   It loads every non-heading chart node, drops obsolete ones, keeps the
 *   labels that match, sorts them and returns the whole array as one JSON body.
 * The vendor's OpenAPI description says paging does not exist yet:
 *   https://raw.githubusercontent.com/ledgersmb/LedgerSMB/master/doc/openapi/API.yaml
 *     "filtering, sorting and pagination are to be specified and implemented."
 *
 * No maximum page size is documented, so the adapter declares none, and a
 * limit reaches pageLocally exactly as the router (or a direct caller) sent it.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import {
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type QueryParams,
} from '@opensteward/shared'
import { LedgersmbAdapter } from '../../../../../../src/verticals/accounting/adapters/ledgersmb/index'
import type { AccountingAdapter } from '../../../../../../src/verticals/accounting/adapter/interface'

const CREDS = {
  accessToken: 'session-cookie',
  extra: { instanceUrl: 'https://ledgersmb.example.test', company: 'demo' },
}

/**
 * The adapter held as the router holds it (router/accounts.ts passes an
 * AccountingAdapter), so parseListQuery reads its capabilities as declared.
 */
function routed(): AccountingAdapter {
  return new LedgersmbAdapter()
}

interface ChartNode {
  accno: string
  description: string
  obsolete: boolean
  category: string
}

/** Account numbers sort as strings in the same order as numerically. */
function accno(i: number): string {
  return String(1000 + i)
}

function ids(from: number, count: number): string[] {
  return Array.from({ length: count }, (_, i) => accno(from + i))
}

/**
 * A fake LedgerSMB that serves GET accounts/ the way Accounts.pm does, and
 * reads ONLY `label`: every other query parameter is ignored, as the route
 * ignores it. Obsolete accounts are dropped, the label filter is a
 * case-insensitive substring match with `*` stripped, and the result is sorted
 * by where the label matched, then by label. There is no paging: every
 * request answers with every matching account.
 *
 * `obsoleteEvery` interleaves obsolete accounts into the chart only so the
 * fake mirrors the route, which drops them before it answers. The adapter never
 * receives them, so they guard nothing in the adapter.
 */
function fakeLedgerSMB(total: number, opts: { wrapped?: boolean; obsoleteEvery?: number } = {}) {
  const chart: ChartNode[] = []
  for (let i = 1; i <= total; i++) {
    chart.push({ accno: accno(i), description: `Account ${i}`, obsolete: false, category: 'A' })
    if (opts.obsoleteEvery && i % opts.obsoleteEvery === 0) {
      chart.push({
        accno: `9${accno(i)}`,
        description: `Retired ${i}`,
        obsolete: true,
        category: 'E',
      })
    }
  }
  const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
    if (path !== 'accounts/') throw new Error(`404: ${path}`)
    const label = String(cfg?.params?.['label'] ?? '').replace(/\*/g, '')
    const rows = chart
      .filter((n) => !n.obsolete)
      .map((n) => ({ ...n, label: `${n.accno}--${n.description}` }))
      .filter((n) => !label || n.label.toLowerCase().includes(label.toLowerCase()))
      .sort(
        (a, b) =>
          a.label.indexOf(label) - b.label.indexOf(label) ||
          (a.label < b.label ? -1 : a.label > b.label ? 1 : 0),
      )
    return { data: opts.wrapped ? { items: rows } : rows }
  })
  vi.spyOn(axios, 'create').mockReturnValue({
    get,
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  } as never)
  return { get }
}

async function list(params: QueryParams): Promise<Array<string | undefined>> {
  return (await new LedgersmbAdapter().listAccounts(CREDS, params)).map((a) => a.id)
}

/** Drive listAccounts as the sync worker does: one sink per page. */
async function drive(pages: number, limit: number, extra: QueryParams = {}) {
  const rows: Array<string | undefined> = []
  const hasMore: Array<boolean | undefined> = []
  const totals: Array<number | undefined> = []
  for (let page = 1; page <= pages; page++) {
    const params = withPageSink({ ...extra, page, limit })
    rows.push(...(await list(params)))
    hasMore.push(readUpstreamPage(params)?.hasMore)
    totals.push(readUpstreamPage(params)?.totalCount)
  }
  return { rows, hasMore, totals }
}

afterEach(() => vi.restoreAllMocks())

describe('ledgersmb listAccounts pages locally over the whole chart', () => {
  it('N = 2L + 1: three worker pages serve every account once, in order', async () => {
    const L = 10
    const { get } = fakeLedgerSMB(2 * L + 1, { obsoleteEvery: 4 })
    const { rows, hasMore, totals } = await drive(3, L)
    expect(rows).toEqual(ids(1, 2 * L + 1))
    expect(hasMore).toEqual([true, true, false])
    expect(totals).toEqual([21, 21, 21])
    // Each page is the same whole-collection GET; the page-2 request carries
    // no paging parameter because the route reads none.
    expect(get).toHaveBeenCalledTimes(3)
    expect(get.mock.calls[1]).toEqual(['accounts/', { params: {} }])
  })

  it('N = 2L: page 2 is the last page and page 3 is empty', async () => {
    const L = 10
    fakeLedgerSMB(2 * L)
    const { rows, hasMore } = await drive(3, L)
    expect(rows).toEqual(ids(1, 2 * L))
    expect(hasMore).toEqual([true, false, false])
  })

  it('reads the wrapped { items } body shape the same way', async () => {
    fakeLedgerSMB(7, { wrapped: true })
    const { rows, hasMore } = await drive(3, 3)
    expect(rows).toEqual(ids(1, 7))
    expect(hasMore).toEqual([true, true, false])
  })

  it('declares no maximum page size: none is documented', () => {
    expect((new LedgersmbAdapter().capabilities as { maxPageSize?: number }).maxPageSize).toBe(
      undefined,
    )
  })

  it('a limit above the router maximum is clamped to 500 by parseListQuery and still serves every account', async () => {
    const N = 2 * 500 + 1
    fakeLedgerSMB(N)
    const rows: Array<string | undefined> = []
    const hasMore: Array<boolean | undefined> = []
    for (const page of ['1', '2', '3']) {
      const params = parseListQuery({ page, limit: '9999' }, routed())
      expect(params.limit).toBe(500)
      rows.push(...(await list(params)))
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(rows).toEqual(ids(1, N))
    expect(hasMore).toEqual([true, true, false])
  })

  it('a direct limit of 1000 is honoured as asked, since no maximum is documented', async () => {
    fakeLedgerSMB(2500)
    const { rows, hasMore } = await drive(3, 1000)
    expect(rows).toEqual(ids(1, 2500))
    expect(hasMore).toEqual([true, true, false])
  })

  it('the limit as parseListQuery delivers it: page 2 of limit 10 is accounts 11-20', async () => {
    fakeLedgerSMB(35)
    const params = parseListQuery({ page: '2', limit: '10' }, routed())
    expect(await list(params)).toEqual(ids(11, 10))
    expect(readUpstreamPage(params)).toMatchObject({ hasMore: true, totalCount: 35 })
  })

  it('a missing page is page 1', async () => {
    fakeLedgerSMB(35)
    expect(await list(parseListQuery({ limit: '10' }))).toEqual(ids(1, 10))
  })

  it('a search is forwarded as label on every page, and the matches are paged', async () => {
    const { get } = fakeLedgerSMB(40)
    // "Account 1" and "Account 10"-"Account 19" match. The route orders them by
    // where the label matched (the same place in every one here) and then by
    // label, so 1001 comes first and 1010-1019 follow. Written out literally, so
    // the expectation does not come from the adapter under test.
    const expected = [accno(1), ...ids(10, 10)]
    expect(await list(withPageSink({ search: 'Account 1' }))).toEqual(expected)
    get.mockClear()
    const { rows, hasMore, totals } = await drive(3, 5, { search: 'Account 1' })
    expect(rows).toEqual(expected)
    expect(hasMore).toEqual([true, true, false])
    expect(totals).toEqual([11, 11, 11])
    expect(get.mock.calls[1]).toEqual(['accounts/', { params: { label: 'Account 1' } }])
  })

  it('a direct call with no limit returns every account and reports the end', async () => {
    fakeLedgerSMB(300)
    const params = withPageSink({})
    expect(await list(params)).toEqual(ids(1, 300))
    expect(readUpstreamPage(params)).toMatchObject({ hasMore: false, totalCount: 300 })
  })

  it('getAccount reads the whole chart, past any page size the worker or router uses', async () => {
    // More accounts than the router's maximum limit and the sync worker's page
    // size (both 500), with the lookup past two full pages of 500, so a bounded
    // read at any of those sizes misses it.
    const { get } = fakeLedgerSMB(1201)
    const found = await new LedgersmbAdapter().getAccount(CREDS, accno(1200))
    expect(found.id).toBe(accno(1200))
    // One bare whole-chart GET: no label filter and no paging parameter.
    expect(get.mock.calls).toEqual([['accounts/', { params: {} }]])
  })
})

describe('ledgersmb accounts refuse a body that is not an account list', () => {
  /** Answer every GET with `body`, as a 200 whose data axios hands back as is. */
  function answerWith(body: unknown): void {
    vi.spyOn(axios, 'create').mockReturnValue({
      get: vi.fn(async () => ({ data: body })),
      post: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    } as never)
  }

  it('an empty chart is a complete collection of zero', async () => {
    fakeLedgerSMB(0)
    const params = withPageSink({ page: 1, limit: 10 })
    expect(await list(params)).toEqual([])
    expect(readUpstreamPage(params)).toMatchObject({ hasMore: false, totalCount: 0 })
  })

  it('an object with no items still reads as an empty wrapper, so the paging gate can probe it', async () => {
    // check:paging-contract answers every request with one token-shaped object
    // and no rows. Refusing that body leaves listAccounts unmeasured by the gate.
    answerWith({ access_token: 'stub-access-token', token_type: 'Bearer' })
    const params = withPageSink({ page: 1, limit: 10 })
    expect(await list(params)).toEqual([])
    expect(readUpstreamPage(params)).toMatchObject({ hasMore: false, totalCount: 0 })
  })

  it.each([
    ['an HTML page axios leaves as a string', '<!DOCTYPE html><html><body>login</body></html>'],
    ['an empty body', ''],
    ['a null body', null],
    ['a JSON scalar', 42],
  ])('%s is an error, not an empty chart', async (_label, body) => {
    answerWith(body)
    const params = withPageSink({ page: 1, limit: 10 })
    await expect(list(params)).rejects.toThrow(/not a JSON account list/)
    // Nothing is reported, so no caller can read the collection as complete.
    expect(readUpstreamPage(params)).toBeUndefined()
    await expect(new LedgersmbAdapter().getAccount(CREDS, accno(1))).rejects.toThrow(
      /not a JSON account list/,
    )
  })
})

describe('ledgersmb listAccounts through the API path', () => {
  const adapter = new LedgersmbAdapter()
  const asRouted: AccountingAdapter = adapter

  async function apiPage(query: Record<string, string>) {
    const params = parseListQuery(query, asRouted)
    const items = await adapter.listAccounts(CREDS, params)
    return listPage(items, params, 'ledgersmb')
  }

  it('meta.hasMore is true on a full page with more behind it and false on the last', async () => {
    fakeLedgerSMB(21)
    const p1 = await apiPage({ page: '1', limit: '10' })
    const p2 = await apiPage({ page: '2', limit: '10' })
    const p3 = await apiPage({ page: '3', limit: '10' })
    expect([...p1.data, ...p2.data, ...p3.data].map((a) => a.id)).toEqual(ids(1, 21))
    expect([p1.meta.hasMore, p2.meta.hasMore, p3.meta.hasMore]).toEqual([true, true, false])
    expect(p1.meta.totalCount).toBe(21)
  })

  it('meta.hasMore is false on a full last page (N = 2L), not null', async () => {
    fakeLedgerSMB(20)
    const p2 = await apiPage({ page: '2', limit: '10' })
    expect(p2.data.map((a) => a.id)).toEqual(ids(11, 10))
    expect(p2.meta.hasMore).toBe(false)
  })
})
