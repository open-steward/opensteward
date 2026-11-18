/**
 * Moyasar paging contract: listCharges, listInvoices, listPayouts.
 *
 * Moyasar pages every list by page number (https://docs.moyasar.com/api/pagination):
 *
 *   "If you do not specify the page, you will receive the first page of this
 *    stream, containing the newest objects. The stream of objects will return
 *    40 objects for the requested resource by default and an object containing
 *    meta-information about the list."
 *
 * The list-payments, list-invoices and list-payouts pages document a single query parameter,
 * `page` ("Page to list", default 1), and `meta.next_page` is "The next page
 * number if any, otherwise null". No page-size parameter exists, so upstream
 * pages hold a fixed 40 rows and the adapter cuts the caller's rows out of
 * them with pageByRows.
 *
 * The fake below honours ONLY `page`: any other query parameter is refused,
 * and it serves the fixed 40-row page the caller cannot change.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import {
  withPageSink,
  readUpstreamPage,
  parseListQuery,
  listPage,
  _resetRowPager,
} from '@opensteward/shared'
import type { PageMaxBearing, QueryParams } from '@opensteward/shared'
import { MoyasarAdapter } from '../../../../../../src/verticals/payments/adapters/moyasar/index'

const CREDS = { accessToken: Buffer.from('sk_test_abc:').toString('base64') }
/** Moyasar's fixed page size: "40 objects ... by default", with no parameter to change it. */
const SERVER_PAGE = 40

type ListFn = 'listCharges' | 'listInvoices' | 'listPayouts'

const ENDPOINTS: Record<ListFn, { path: string; key: string }> = {
  // https://docs.moyasar.com/api/payments/03-list-payments: GET /payments -> { payments, meta }
  listCharges: { path: '/payments', key: 'payments' },
  listInvoices: { path: '/invoices', key: 'invoices' },
  listPayouts: { path: '/payouts', key: 'payouts' },
}

const METHODS = Object.keys(ENDPOINTS) as ListFn[]

interface Req {
  path: string
  params: Record<string, unknown> | undefined
}

/** A fake GET of Moyasar list endpoints, each holding its own ids. */
/** Overrides `meta.next_page` for a page; the default is the honest one. */
type NextPage = (page: number, pages: number) => number | null

function fakeLists(
  collections: Record<string, string[]>,
  nextPage: NextPage = (page, pages) => (page < pages ? page + 1 : null),
): { reqs: Req[] } {
  const reqs: Req[] = []
  const get = vi.fn(async (p: string, config?: { params?: Record<string, unknown> }) => {
    const params = config?.params
    reqs.push({ path: p, params: params ? { ...params } : undefined })
    const ids = collections[p]
    if (!ids) throw new Error(`unexpected path ${p}`)
    for (const k of Object.keys(params ?? {})) {
      if (k !== 'page') throw new Error(`undocumented query parameter ${k}`)
    }
    const raw = params?.page
    const page = raw === undefined ? 1 : Number(raw)
    if (!Number.isInteger(page) || page < 1) throw new Error(`bad page ${String(raw)}`)
    const pages = Math.max(1, Math.ceil(ids.length / SERVER_PAGE))
    const from = (page - 1) * SERVER_PAGE
    const key = Object.values(ENDPOINTS).find((e) => e.path === p)!.key
    return {
      data: {
        [key]: ids.slice(from, from + SERVER_PAGE).map((id) => row(p, id)),
        meta: {
          current_page: page,
          next_page: nextPage(page, pages),
          prev_page: page > 1 ? page - 1 : null,
          total_pages: pages,
          total_count: ids.length,
        },
      },
    }
  })
  vi.spyOn(axios, 'create').mockReturnValue({ get, post: vi.fn(), defaults: {} } as never)
  return { reqs }
}

/** A documented-shape row: payments carry the required amount and currency. */
function row(path: string, id: string): Record<string, unknown> {
  return path === '/payments' ? { id, status: 'paid', amount: 100, currency: 'SAR' } : { id }
}

function fakeList(path: string, ids: string[], nextPage?: NextPage): { reqs: Req[] } {
  return fakeLists({ [path]: ids }, nextPage)
}

function ids(n: number): string[] {
  return Array.from({ length: n }, (_, i) => `row-${String(i).padStart(4, '0')}`)
}

async function drive(
  method: ListFn,
  L: number,
  pages: number,
): Promise<{ ids: string[]; hasMore: Array<boolean | undefined>; sizes: number[] }> {
  const adapter = new MoyasarAdapter()
  const out: string[] = []
  const hasMore: Array<boolean | undefined> = []
  const sizes: number[] = []
  for (let page = 1; page <= pages; page++) {
    const params = withPageSink({ page, limit: L } as QueryParams)
    const rows = await adapter[method](CREDS, params)
    sizes.push(rows.length)
    out.push(...rows.map((r) => r.id))
    hasMore.push(readUpstreamPage(params)?.hasMore)
  }
  return { ids: out, hasMore, sizes }
}

afterEach(() => {
  vi.restoreAllMocks()
  _resetRowPager()
})

describe.each(METHODS)('Moyasar %s paging', (method) => {
  const { path } = ENDPOINTS[method]

  it('serves 2L+1 rows once each, in order, across pages 1..3 with exact hasMore', async () => {
    const L = 7
    const all = ids(2 * L + 1)
    fakeList(path, all)
    const { ids: got, hasMore, sizes } = await drive(method, L, 3)
    expect(got).toEqual(all)
    expect(sizes).toEqual([L, L, 1])
    expect(hasMore).toEqual([true, true, false])
  })

  it('serves 2L+1 rows once each when L spans several upstream pages', async () => {
    const L = 50
    const all = ids(2 * L + 1)
    fakeList(path, all)
    const { ids: got, hasMore, sizes } = await drive(method, L, 3)
    expect(got).toEqual(all)
    expect(sizes).toEqual([L, L, 1])
    expect(hasMore).toEqual([true, true, false])
  })

  it('sends the documented `page` key on the request behind caller page 2', async () => {
    const L = SERVER_PAGE
    const all = ids(2 * L + 1)
    const { reqs } = fakeList(path, all)
    const adapter = new MoyasarAdapter()
    await adapter[method](CREDS, withPageSink({ page: 1, limit: L } as QueryParams))
    const before = reqs.length
    const rows = await adapter[method](CREDS, withPageSink({ page: 2, limit: L } as QueryParams))
    expect(rows.map((r) => r.id)).toEqual(all.slice(L, 2 * L))
    expect(reqs.map((r) => r.params?.page)).toContain(2)
    expect(reqs.slice(before).every((r) => (r.params?.page as number) >= 2)).toBe(true)
  })

  it('serves a page asked for cold, with no earlier page in memory', async () => {
    const L = 30
    const all = ids(2 * L + 1)
    const { reqs } = fakeList(path, all)
    const params = withPageSink({ page: 2, limit: L } as QueryParams)
    const rows = await new MoyasarAdapter()[method](CREDS, params)
    expect(rows.map((r) => r.id)).toEqual(all.slice(L, 2 * L))
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
    expect(reqs.map((r) => r.params?.page)).toContain(2)
  })

  it('reports an exact end when the collection is a multiple of the upstream page', async () => {
    const L = SERVER_PAGE
    const all = ids(2 * L)
    fakeList(path, all)
    const { ids: got, hasMore } = await drive(method, L, 2)
    expect(got).toEqual(all)
    expect(hasMore).toEqual([true, false])
  })

  it('clamps a limit above the router maximum and still serves every row', async () => {
    const all = ids(1201)
    fakeList(path, all)
    const adapter = new MoyasarAdapter()
    const got: string[] = []
    const more: Array<boolean | undefined> = []
    for (let page = 1; page <= 3; page++) {
      const p = parseListQuery(
        { limit: '5000', page: String(page) },
        adapter as unknown as PageMaxBearing,
      )
      expect(p.limit).toBe(500)
      const rows = await adapter[method](CREDS, p)
      expect(rows.length).toBeLessThanOrEqual(500)
      got.push(...rows.map((r) => r.id))
      more.push(readUpstreamPage(p)?.hasMore)
    }
    expect(got).toEqual(all)
    expect(more).toEqual([true, true, false])
  })

  it('gives meta.hasMore through parseListQuery and listPage', async () => {
    const all = ids(7)
    fakeList(path, all)
    const adapter = new MoyasarAdapter()
    const p1 = parseListQuery({ limit: '3', page: '1' }, adapter as unknown as PageMaxBearing)
    const e1 = listPage<{ id: string }>(await adapter[method](CREDS, p1), p1, 'moyasar')
    expect(e1.data.map((r) => r.id)).toEqual(all.slice(0, 3))
    expect(e1.meta.hasMore).toBe(true)

    const p3 = parseListQuery({ limit: '3', page: '3' }, adapter as unknown as PageMaxBearing)
    const e3 = listPage<{ id: string }>(await adapter[method](CREDS, p3), p3, 'moyasar')
    expect(e3.data.map((r) => r.id)).toEqual(all.slice(6))
    expect(e3.meta.hasMore).toBe(false)
  })

  it('ends on meta.next_page: a full 40-row collection costs exactly one request', async () => {
    const all = ids(SERVER_PAGE)
    const { reqs } = fakeList(path, all)
    const params = withPageSink({ page: 1, limit: SERVER_PAGE } as QueryParams)
    const rows = await new MoyasarAdapter()[method](CREDS, params)
    expect(rows.map((r) => r.id)).toEqual(all)
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    expect(reqs).toHaveLength(1)
  })

  it('treats meta.next_page as the end signal even when the page is full', async () => {
    // Upstream says page 1 is the last one although it is full and more rows
    // exist; the documented signal wins over any row-count guess.
    const all = ids(3 * SERVER_PAGE)
    const { reqs } = fakeList(path, all, () => null)
    const params = withPageSink({ page: 1, limit: 2 * SERVER_PAGE } as QueryParams)
    const rows = await new MoyasarAdapter()[method](CREDS, params)
    expect(rows.map((r) => r.id)).toEqual(all.slice(0, SERVER_PAGE))
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    expect(reqs).toHaveLength(1)
  })

  it('stops, rather than loops, when meta.next_page points backwards', async () => {
    const all = ids(3 * SERVER_PAGE)
    const { reqs } = fakeList(path, all, (page, pages) =>
      page === 2 ? 1 : page < pages ? page + 1 : null,
    )
    const params = withPageSink({ page: 1, limit: 3 * SERVER_PAGE } as QueryParams)
    const rows = await new MoyasarAdapter()[method](CREDS, params)
    expect(rows.map((r) => r.id)).toEqual(all.slice(0, 2 * SERVER_PAGE))
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    expect(reqs.map((r) => r.params?.page)).toEqual([1, 2])
  })

  it('fetches each 40-row upstream page once across a sequential walk', async () => {
    const L = 7
    const all = ids(2 * L + 1)
    const { reqs } = fakeList(path, all)
    const { ids: got } = await drive(method, L, 3)
    expect(got).toEqual(all)
    expect(reqs).toHaveLength(1)
  })

  it('never serves one connection the rows another connection fetched', async () => {
    const L = 7
    const a = ids(2 * L + 1)
    const b = a.map((id) => `b-${id}`)
    const adapter = new MoyasarAdapter()
    fakeList(path, a)
    await adapter[method](
      { accessToken: 'c2tfY29ubl9hOg==' },
      withPageSink({ page: 1, limit: L } as QueryParams),
    )
    vi.restoreAllMocks()
    fakeList(path, b)
    const rows = await adapter[method](
      { accessToken: 'c2tfY29ubl9iOg==' },
      withPageSink({ page: 2, limit: L } as QueryParams),
    )
    expect(rows.map((r) => r.id)).toEqual(b.slice(L, 2 * L))
  })
})

describe('Moyasar pager keys and defaults', () => {
  it('never serves one collection the rows another collection fetched on the same connection', async () => {
    const L = 7
    const invoices = ids(2 * L + 1).map((id) => `inv-${id}`)
    const payouts = ids(2 * L + 1).map((id) => `pay-${id}`)
    fakeLists({ '/invoices': invoices, '/payouts': payouts })
    const adapter = new MoyasarAdapter()
    await adapter.listInvoices(CREDS, withPageSink({ page: 1, limit: L } as QueryParams))
    const params = withPageSink({ page: 2, limit: L } as QueryParams)
    const rows = await adapter.listPayouts(CREDS, params)
    expect(rows.map((r) => r.id)).toEqual(payouts.slice(L, 2 * L))
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })

  it('serves 50 rows (the adapter default) when the caller sends no limit', async () => {
    const all = ids(120)
    fakeList('/invoices', all)
    const params = withPageSink({ page: 1 } as QueryParams)
    const rows = await new MoyasarAdapter().listInvoices(CREDS, params)
    expect(rows.map((r) => r.id)).toEqual(all.slice(0, 50))
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })
})
