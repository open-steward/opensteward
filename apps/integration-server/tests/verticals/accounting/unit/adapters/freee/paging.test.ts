/**
 * Paging contract for freee's two unpaginated lists, listTaxRates and
 * listAccounts, driven through the real adapter.
 *
 * Source: freee's own OpenAPI document,
 * https://raw.githubusercontent.com/freee/freee-api-schema/master/v2020_06_15/open-api-3/api-schema.json,
 * the file developer.freee.co.jp/reference/accounting/reference loads.
 *
 * GET /api/1/taxes/companies/{company_id} (get_taxes_companies) declares
 * exactly three parameters: `company_id` in the path, and two query filters,
 * `display_category` and `available`. Both filters read "未指定の場合は全ての
 * 税区分が返ります" — unspecified, every tax category is returned. The items
 * carry `code`, `name`, `name_ja`, `display_category` and `available` (all
 * required) and no `id`, so `code` — the tax_code every write endpoint takes —
 * is the row's id.
 *
 * GET /api/1/account_items (get_account_items) declares `company_id`
 * (required) and the filters `base_date`, `start_update_date`,
 * `end_update_date` and `keyword`.
 *
 * Neither takes a `limit` or an `offset`, and neither answers with paging
 * metadata: `{ taxes: [...] }` and `{ account_items: [...] }` each hold the
 * whole collection.
 *
 * Before this fix, on the API path, the router truncated that whole list to
 * `limit` and read the over-return as `hasMore: true`, so every page repeated
 * page 1 and no row past it was reachable (listAccounts sent `limit` and
 * `offset` too, which account_items ignores). On the sync path a collection
 * under the worker's 500-row page read as short and ended there; one of 500
 * rows or more came back whole again on page 2. listTaxRates also stored a
 * single row, because every item's id came out as 'undefined'. Both methods
 * now slice the one response locally and report the total, so each row is
 * served once and `hasMore` is exact.
 *
 * The fakes honour only the documented parameters and ignore anything else,
 * `limit` and `offset` included, as an endpoint that does not page would.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { listPage, parseListQuery, readUpstreamPage, withPageSink } from '@opensteward/shared'
import { FreeeAdapter } from '../../../../../../src/verticals/accounting/adapters/freee'
import { FreeeClient } from '../../../../../../src/verticals/accounting/adapters/freee/client'
import type {
  AccountingAdapter,
  Credentials,
  QueryParams,
} from '../../../../../../src/verticals/accounting/adapter/interface'

const COMPANY_ID = 4242
const adapter = new FreeeAdapter({
  clientId: 'i',
  clientSecret: 's',
  redirectUri: 'http://localhost:3010/cb',
  scopes: ['read'],
  companyId: COMPANY_ID,
})
/** The adapter as the router holds it, for parseListQuery. */
const routed: AccountingAdapter = adapter
const creds = { accessToken: 'tok' } as Credentials

afterEach(() => vi.restoreAllMocks())

interface Call {
  path: string
  params: Record<string, unknown> | undefined
}

type Lister = (params: QueryParams) => Promise<Array<{ id?: string }>>

async function drive(list: Lister, limit: number, pages: number) {
  const ids: string[] = []
  const hasMore: Array<boolean | undefined> = []
  const totals: Array<number | undefined> = []
  for (let page = 1; page <= pages; page++) {
    const params: QueryParams = withPageSink({ page, limit })
    const rows = await list(params)
    ids.push(...rows.map((r) => r.id as string))
    hasMore.push(readUpstreamPage(params)?.hasMore)
    totals.push(readUpstreamPage(params)?.totalCount)
  }
  return { ids, hasMore, totals }
}

/** The router's sequence for one page: parseListQuery, the adapter, listPage. */
async function apiPages(list: Lister, limit: number, pages: number) {
  const ids: string[] = []
  const metas = []
  for (let page = 1; page <= pages; page++) {
    const params = parseListQuery({ page: String(page), limit: String(limit) }, routed)
    const env = listPage(await list(params), params, adapter.platform)
    ids.push(...env.data.map((r) => r.id as string))
    metas.push(env.meta)
  }
  return { ids, metas }
}

// --- Tax rates -------------------------------------------------------------

/** The only query keys get_taxes_companies documents. */
const DOCUMENTED_TAX_QUERY_KEYS = new Set(['display_category', 'available'])

interface DocTax {
  code: number
  name: string
  name_ja: string
  display_category: string | null
  available: boolean
}

function taxes(n: number): DocTax[] {
  return Array.from({ length: n }, (_, i) => ({
    code: 100 + i,
    name: `tax_${i}`,
    name_ja: `税区分${i}`,
    display_category: i % 2 === 0 ? 'tax_10' : null,
    available: i % 3 !== 0,
  }))
}

/** A fake GET /api/1/taxes/companies/{company_id} that returns the whole list. */
function fakeUpstream(rows: DocTax[]): Call[] {
  const calls: Call[] = []
  vi.spyOn(FreeeClient.prototype, 'get').mockImplementation(
    async (path: string, params?: Record<string, unknown>) => {
      calls.push({ path, params })
      if (path !== `taxes/companies/${COMPANY_ID}`) {
        throw new Error(`fake freee: unexpected path ${path}`)
      }
      let out = rows
      const category = params?.['display_category']
      if (category !== undefined) out = out.filter((r) => r.display_category === category)
      const available = params?.['available']
      if (available !== undefined) out = out.filter((r) => r.available === available)
      return { taxes: out } as never
    },
  )
  return calls
}

const listTaxRates: Lister = (params) => adapter.listTaxRates!(creds, params)
const allIds = (rows: DocTax[]) => rows.map((r) => String(r.code))

describe('freee listTaxRates pages a whole-collection response locally', () => {
  const L = 4

  it('serves N = 2L + 1 rows once each across pages 1..3, like the sync worker', async () => {
    const rows = taxes(2 * L + 1)
    fakeUpstream(rows)
    const { ids, hasMore, totals } = await drive(listTaxRates, L, 3)
    expect(ids).toEqual(allIds(rows))
    expect(hasMore).toEqual([true, true, false])
    expect(totals).toEqual([2 * L + 1, 2 * L + 1, 2 * L + 1])
  })

  it('page 2 fetches the same documented request: the path company id and no paging keys', async () => {
    const calls = fakeUpstream(taxes(2 * L + 1))
    const params = withPageSink({ page: 2, limit: L })
    const rows = await adapter.listTaxRates!(creds, params)
    expect(rows.map((r) => r.id)).toEqual(['104', '105', '106', '107'])
    expect(calls).toHaveLength(1)
    expect(calls[0]!.path).toBe(`taxes/companies/${COMPANY_ID}`)
    for (const key of Object.keys(calls[0]!.params ?? {})) {
      expect(DOCUMENTED_TAX_QUERY_KEYS.has(key), `undocumented query key ${key}`).toBe(true)
    }
  })

  it('ends exactly at N = 2L: page 2 is full and reports no more', async () => {
    const rows = taxes(2 * L)
    fakeUpstream(rows)
    const { ids, hasMore } = await drive(listTaxRates, L, 2)
    expect(ids).toEqual(allIds(rows))
    expect(hasMore).toEqual([true, false])
  })

  it('serves every row at the worker size of 500, past what one page holds', async () => {
    const rows = taxes(1001)
    fakeUpstream(rows)
    const { ids, hasMore } = await drive(listTaxRates, 500, 3)
    expect(ids).toEqual(allIds(rows))
    expect(hasMore).toEqual([true, true, false])
  })

  it('serves every row when the limit exceeds the collection', async () => {
    const rows = taxes(2 * L + 1)
    fakeUpstream(rows)
    const params = withPageSink({ page: 1, limit: 500 })
    const got = await adapter.listTaxRates!(creds, params)
    expect(got.map((r) => r.id)).toEqual(allIds(rows))
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('pages at the limit parseListQuery delivers, including a clamped one', async () => {
    const rows = taxes(2 * L + 1)
    fakeUpstream(rows)
    const p2 = parseListQuery({ page: '2', limit: String(L) }, routed)
    expect((await adapter.listTaxRates!(creds, p2)).map((r) => r.id)).toEqual(
      allIds(rows).slice(L, 2 * L),
    )

    const big = taxes(600)
    fakeUpstream(big)
    const clamped = parseListQuery({ limit: '9999' }, routed)
    expect(clamped.limit).toBe(500)
    const first = await adapter.listTaxRates!(creds, clamped)
    expect(first.map((r) => r.id)).toEqual(allIds(big).slice(0, 500))
    expect(readUpstreamPage(clamped)?.hasMore).toBe(true)

    const second = parseListQuery({ page: '2', limit: '9999' }, routed)
    const rest = await adapter.listTaxRates!(creds, second)
    expect(rest.map((r) => r.id)).toEqual(allIds(big).slice(500))
    expect(readUpstreamPage(second)?.hasMore).toBe(false)
  })

  it('API path: parseListQuery + listPage report meta.hasMore exactly', async () => {
    const rows = taxes(2 * L + 1)
    fakeUpstream(rows)
    const { ids, metas } = await apiPages(listTaxRates, L, 3)
    expect(ids).toEqual(allIds(rows))
    expect(metas.map((m) => m.hasMore)).toEqual([true, true, false])
    expect(metas.map((m) => m.totalCount)).toEqual([2 * L + 1, 2 * L + 1, 2 * L + 1])
  })

  it('API path: a full last page at N = 2L reports hasMore false, not unknown', async () => {
    fakeUpstream(taxes(2 * L))
    const params = parseListQuery({ page: '2', limit: String(L) }, routed)
    const env = listPage(await adapter.listTaxRates!(creds, params), params, adapter.platform)
    expect(env.data).toHaveLength(L)
    expect(env.meta.hasMore).toBe(false)
  })
})

// --- Accounts --------------------------------------------------------------

/** One account_items item, with every field the spec marks required. */
function accountItems(n: number): Array<Record<string, unknown>> {
  return Array.from({ length: n }, (_, i) => ({
    id: 5000 + i,
    name: `勘定科目${i}`,
    tax_code: 21,
    shortcut: null,
    shortcut_num: null,
    default_tax_code: 21,
    account_category: '売上高',
    account_category_id: 7,
    categories: ['損益計算書', '売上高'],
    available: i % 4 !== 0,
    walletable_id: null,
    group_name: null,
    group_id: null,
    corresponding_income_name: null,
    corresponding_income_id: null,
    corresponding_expense_name: null,
    corresponding_expense_id: null,
    update_date: '2026-09-01',
  }))
}

/**
 * A fake GET /api/1/account_items. It requires the documented company_id,
 * filters on `keyword` as a partial match on the name, and returns every row
 * otherwise, whatever `limit` or `offset` it is sent.
 */
function fakeAccountItems(rows: Array<Record<string, unknown>>): Call[] {
  const calls: Call[] = []
  vi.spyOn(FreeeClient.prototype, 'get').mockImplementation(
    async (path: string, params?: Record<string, unknown>) => {
      calls.push({ path, params })
      if (path !== 'account_items') throw new Error(`fake freee: unexpected path ${path}`)
      if (params?.['company_id'] !== COMPANY_ID) {
        throw new Error(`fake freee: company_id is required, got ${String(params?.['company_id'])}`)
      }
      const keyword = params['keyword']
      const out =
        typeof keyword === 'string' && keyword !== ''
          ? rows.filter((r) => String(r['name']).includes(keyword))
          : rows
      return { account_items: out } as never
    },
  )
  return calls
}

const listAccounts: Lister = (params) => adapter.listAccounts!(creds, params)
const accountIds = (rows: Array<Record<string, unknown>>) => rows.map((r) => String(r['id']))

describe('freee listAccounts pages a whole-collection response locally', () => {
  const L = 4

  it('serves N = 2L + 1 rows once each across pages 1..3, like the sync worker', async () => {
    const rows = accountItems(2 * L + 1)
    fakeAccountItems(rows)
    const { ids, hasMore, totals } = await drive(listAccounts, L, 3)
    expect(ids).toEqual(accountIds(rows))
    expect(hasMore).toEqual([true, true, false])
    expect(totals).toEqual([2 * L + 1, 2 * L + 1, 2 * L + 1])
  })

  it('page 2 sends only the documented company_id: no limit, no offset', async () => {
    const calls = fakeAccountItems(accountItems(2 * L + 1))
    const params = withPageSink({ page: 2, limit: L })
    const rows = await adapter.listAccounts!(creds, params)
    expect(rows.map((r) => r.id)).toEqual(['5004', '5005', '5006', '5007'])
    expect(calls).toEqual([{ path: 'account_items', params: { company_id: COMPANY_ID } }])
  })

  it('ends exactly at N = 2L: page 2 is full and reports no more', async () => {
    const rows = accountItems(2 * L)
    fakeAccountItems(rows)
    const { ids, hasMore } = await drive(listAccounts, L, 2)
    expect(ids).toEqual(accountIds(rows))
    expect(hasMore).toEqual([true, false])
  })

  it('serves every row at the worker size of 500, past what one page holds', async () => {
    const rows = accountItems(1001)
    fakeAccountItems(rows)
    const { ids, hasMore } = await drive(listAccounts, 500, 3)
    expect(ids).toEqual(accountIds(rows))
    expect(hasMore).toEqual([true, true, false])
  })

  it('API path: parseListQuery + listPage report meta.hasMore exactly', async () => {
    const rows = accountItems(2 * L + 1)
    fakeAccountItems(rows)
    const { ids, metas } = await apiPages(listAccounts, L, 3)
    expect(ids).toEqual(accountIds(rows))
    expect(metas.map((m) => m.hasMore)).toEqual([true, true, false])
    expect(metas.map((m) => m.totalCount)).toEqual([2 * L + 1, 2 * L + 1, 2 * L + 1])
  })
})
