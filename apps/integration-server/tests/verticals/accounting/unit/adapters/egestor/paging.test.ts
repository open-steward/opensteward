/**
 * eGestor listTaxRates paging: GET /configTrib serves fixed 50-row pages, so
 * the adapter cuts the caller's pages out of them with pageByRows.
 *
 * The vendor's API blueprint (the source of https://egestor.docs.apiary.io):
 *   https://raw.githubusercontent.com/eGestor/documentacao-api/master/apiary.apib
 *     "Ações de `listar` exibem `50` registros por página. Não é possível
 *      alterar este número."
 *     "| `page` | Informa qual página deve ser retornada. |"
 *     "### Listar (List) [GET /configTrib{?fields}]"
 *   The documented 200 body is the paginated envelope: total, per_page 50,
 *   current_page, last_page, next_page_url, prev_page_url, from, to, data.
 *
 * So `page` is the only position there is, and there is no size to send: page
 * n is rows [50(n-1), 50n). The method used to send no query at all, so every
 * caller page was the first 50 tax groups. Forwarding `page` alone would be
 * wrong too below a limit of 50: caller page 2 at limit 20 is rows 21-40, not
 * upstream page 2's rows 51-100.
 *
 * The end comes from `last_page`. Every documented example sets
 * `next_page_url: null` even where `last_page` is 4, so the fake does the same
 * and the adapter must not read it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import {
  _resetRowPager,
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type QueryParams,
} from '@opensteward/shared'
import { EgestorAdapter } from '../../../../../../src/verticals/accounting/adapters/egestor/index'
import type {
  AccountingAdapter,
  Credentials,
} from '../../../../../../src/verticals/accounting/adapter/interface'

/**
 * The keys the adapter hands pageByRows, in call order. The wrapper only
 * records them: every call still runs the real pager.
 */
const pagerKeys = vi.hoisted(() => [] as string[])
vi.mock('@opensteward/shared', async (importOriginal) => {
  const shared = await importOriginal<typeof import('@opensteward/shared')>()
  const pageByRows: typeof shared.pageByRows = (key, ...rest) => {
    pagerKeys.push(key)
    return shared.pageByRows(key, ...rest)
  }
  return { ...shared, pageByRows }
})

/** eGestor's fixed page size for every `listar` action. */
const PER_PAGE = 50

const CREDS: Credentials = { accessToken: 'access-a', refreshToken: 'personal-a' }
const OTHER: Credentials = { accessToken: 'access-b', refreshToken: 'personal-b' }

/** The adapter as the router holds it, so parseListQuery reads its capabilities. */
const ADAPTER: AccountingAdapter = new EgestorAdapter()

/** Tax group codes: connection A's are 1..n, connection B's 1001..1000+n. */
function codes(from: number, count: number): string[] {
  return Array.from({ length: count }, (_, i) => String(from + i))
}

/**
 * A fake eGestor that serves GET configTrib the way the blueprint documents
 * it, per access token. It reads ONLY `page` (a missing or unusable page is
 * page 1) and ignores anything else, so a size parameter would change
 * nothing. Every page is 50 rows; a page past `last_page` is empty.
 *
 * `total` is 1 whatever the collection's size, as in every documented
 * envelope (the configTrib example has `total: 1` beside `last_page: 4` and
 * `to: 50`). An adapter that ended its walk or sized the collection on
 * `total` would stop after one page here.
 */
function fakeEgestor(sizes: Record<string, number>) {
  const get = vi.fn()
  vi.spyOn(axios, 'create').mockImplementation(((config?: { headers?: Record<string, string> }) => {
    const token = String(config?.headers?.['Authorization'] ?? '').replace(/^Bearer /, '')
    const base = token === 'access-b' ? 1000 : 0
    const n = sizes[token] ?? 0
    const conn = async (path: string, cfg?: { params?: Record<string, unknown> }) => {
      get(path, cfg)
      if (path !== 'configTrib') throw new Error(`404: ${path}`)
      const asked = parseInt(String(cfg?.params?.['page'] ?? '1'), 10)
      const page = Number.isFinite(asked) && asked >= 1 ? asked : 1
      const start = (page - 1) * PER_PAGE
      const data = Array.from({ length: Math.max(0, Math.min(PER_PAGE, n - start)) }, (_, i) => ({
        codigo: base + start + i + 1,
        descricao: `Grupo ${base + start + i + 1}`,
        tipo: 'produto',
        padrao: false,
        icmsAliquota: '0',
      }))
      return {
        data: {
          total: 1,
          per_page: PER_PAGE,
          current_page: page,
          last_page: Math.max(1, Math.ceil(n / PER_PAGE)),
          next_page_url: null,
          prev_page_url: null,
          from: data.length ? start + 1 : null,
          to: data.length ? start + data.length : null,
          data,
        },
      }
    }
    return { get: conn, post: vi.fn(), put: vi.fn(), delete: vi.fn() }
  }) as never)
  return { get }
}

/** The query of every upstream request, in order. */
function queries(get: ReturnType<typeof vi.fn>): unknown[] {
  return get.mock.calls.map((c) => (c[1] as { params?: unknown } | undefined)?.params)
}

async function list(params: QueryParams, creds: Credentials = CREDS): Promise<string[]> {
  return (await new EgestorAdapter().listTaxRates(creds, params)).map((t) => String(t.id))
}

/** Drive listTaxRates as the sync worker does: one sink per page. */
async function drive(pages: number, limit: number, creds: Credentials = CREDS) {
  const rows: string[] = []
  const hasMore: Array<boolean | undefined> = []
  const local: Array<boolean | undefined> = []
  for (let page = 1; page <= pages; page++) {
    const params = withPageSink({ page, limit })
    rows.push(...(await list(params, creds)))
    hasMore.push(readUpstreamPage(params)?.hasMore)
    local.push(readUpstreamPage(params)?.pagedLocally)
  }
  return { rows, hasMore, local }
}

/** One `{ page }` query per upstream page 1..n, and nothing else. */
function upstreamPages(n: number): unknown[] {
  return Array.from({ length: n }, (_, i) => ({ page: i + 1 }))
}

beforeEach(() => {
  _resetRowPager()
  pagerKeys.length = 0
})
afterEach(() => vi.restoreAllMocks())

describe('egestor listTaxRates cuts caller pages out of 50-row upstream pages', () => {
  it.each([20, 30, 50, 70])(
    'N = 2L + 1 at L = %i: three worker pages serve every tax group once, in order',
    async (L) => {
      const N = 2 * L + 1
      const { get } = fakeEgestor({ 'access-a': N })
      const { rows, hasMore, local } = await drive(3, L)
      expect(rows).toEqual(codes(1, N))
      expect(hasMore).toEqual([true, true, false])
      expect(local).toEqual([true, true, true])
      // One request per upstream page, each carrying only `page`: no size is
      // documented, and a walk never asks for the same page twice.
      expect(queries(get)).toEqual(upstreamPages(Math.ceil(N / PER_PAGE)))
    },
  )

  it('the upstream page-2 request carries page=2', async () => {
    const { get } = fakeEgestor({ 'access-a': 101 })
    await drive(3, 50)
    expect(get.mock.calls[1]).toEqual(['configTrib', { params: { page: 2 } }])
  })

  it.each([30, 50])('N = 2L at L = %i: page 2 is the last page and page 3 is empty', async (L) => {
    const { get } = fakeEgestor({ 'access-a': 2 * L })
    const { rows, hasMore } = await drive(3, L)
    expect(rows).toEqual(codes(1, 2 * L))
    expect(hasMore).toEqual([true, false, false])
    // last_page ends the walk: no request past it, even after a full page.
    expect(queries(get)).toEqual(upstreamPages(Math.ceil((2 * L) / PER_PAGE)))
  })

  it('caller page 2 at limit 20 is tax groups 21-40, not upstream page 2', async () => {
    const { get } = fakeEgestor({ 'access-a': 120 })
    const params = withPageSink({ page: 2, limit: 20 })
    expect(await list(params)).toEqual(codes(21, 20))
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
    expect(queries(get)).toEqual([{ page: 1 }])
  })

  it('a cold jump straddling an upstream boundary serves the right rows', async () => {
    fakeEgestor({ 'access-a': 200 })
    const params = withPageSink({ page: 3, limit: 30 })
    expect(await list(params)).toEqual(codes(61, 30))
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })

  it('ends on last_page, never on next_page_url (null in every documented example)', async () => {
    fakeEgestor({ 'access-a': 140 })
    const { rows, hasMore } = await drive(3, 50)
    expect(rows).toEqual(codes(1, 140))
    expect(hasMore).toEqual([true, true, false])
  })

  it('an empty collection is one request and no more pages', async () => {
    const { get } = fakeEgestor({ 'access-a': 0 })
    const params = withPageSink({ page: 1, limit: 50 })
    expect(await list(params)).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    expect(queries(get)).toEqual([{ page: 1 }])
  })

  it('declares no maximum page size: the fixed 50 is not a limit the caller can ask for', () => {
    expect(ADAPTER.capabilities?.maxPageSize).toBeUndefined()
  })

  it('a limit above the fixed upstream 50 still serves every row, spanning upstream pages', async () => {
    const L = 120
    const N = 2 * L + 1
    const { get } = fakeEgestor({ 'access-a': N })
    const { rows, hasMore } = await drive(3, L)
    expect(rows).toEqual(codes(1, N))
    expect(hasMore).toEqual([true, true, false])
    expect(queries(get)).toEqual(upstreamPages(Math.ceil(N / PER_PAGE)))
  })

  it('a limit above the router maximum is clamped to 500 by parseListQuery and still serves every row', async () => {
    const N = 2 * 500 + 1
    fakeEgestor({ 'access-a': N })
    const rows: string[] = []
    const hasMore: Array<boolean | undefined> = []
    for (const page of ['1', '2', '3']) {
      const params = parseListQuery({ page, limit: '9999' }, ADAPTER)
      expect(params.limit).toBe(500)
      rows.push(...(await list(params)))
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(rows).toEqual(codes(1, N))
    expect(hasMore).toEqual([true, true, false])
  })

  it('the limit as parseListQuery delivers it: page 2 of limit 30 is tax groups 31-60', async () => {
    fakeEgestor({ 'access-a': 100 })
    const params = parseListQuery({ page: '2', limit: '30' }, ADAPTER)
    expect(await list(params)).toEqual(codes(31, 30))
    expect(readUpstreamPage(params)).toMatchObject({ hasMore: true, pagedLocally: true })
  })

  it('no limit is the router default of 100, across two upstream pages', async () => {
    fakeEgestor({ 'access-a': 130 })
    const params = parseListQuery({}, ADAPTER)
    expect(await list(params)).toEqual(codes(1, 100))
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })

  it('API path: parseListQuery + listPage report meta.hasMore on every page', async () => {
    fakeEgestor({ 'access-a': 101 })
    const metas: Array<{ hasMore: boolean | null; ids: string[] }> = []
    for (const page of ['1', '2', '3']) {
      const params = parseListQuery({ page, limit: '50' }, ADAPTER)
      const items = await ADAPTER.listTaxRates!(CREDS, params)
      const env = listPage(items, params, 'egestor')
      metas.push({ hasMore: env.meta.hasMore, ids: env.data.map((t) => String(t.id)) })
      // `total` contradicts `last_page` in the documented example, so it is
      // not reported as the collection's size.
      expect(env.meta.totalCount).toBeNull()
    }
    expect(metas.map((m) => m.hasMore)).toEqual([true, true, false])
    expect(metas.flatMap((m) => m.ids)).toEqual(codes(1, 101))
  })

  it('two connections never share rows: each page is fetched under its own token', async () => {
    const { get } = fakeEgestor({ 'access-a': 61, 'access-b': 61 })
    // A's page 1 leaves A's upstream page 1 in the pager's slot.
    expect(await list(withPageSink({ page: 1, limit: 30 }), CREDS)).toEqual(codes(1, 30))
    // B's page 2 must come from B's own data, not A's held rows: B walks its
    // own upstream pages 1 and 2.
    expect(await list(withPageSink({ page: 2, limit: 30 }), OTHER)).toEqual(codes(1031, 30))
    expect(queries(get)).toEqual([{ page: 1 }, { page: 1 }, { page: 2 }])
  })

  it('an access-token refresh keeps the walk: the key is the personal token, which does not rotate', async () => {
    // The access token expires every 900 s and is re-exchanged from the
    // personal token (auth.ts), so the same connection comes back with a new
    // accessToken and the same refreshToken.
    const { get } = fakeEgestor({ 'access-a': 100, 'access-a2': 100 })
    expect(await list(withPageSink({ page: 1, limit: 30 }), CREDS)).toEqual(codes(1, 30))
    const refreshed: Credentials = { accessToken: 'access-a2', refreshToken: 'personal-a' }
    expect(await list(withPageSink({ page: 2, limit: 30 }), refreshed)).toEqual(codes(31, 30))
    // Rows 31-50 come from the upstream page 1 already held; only page 2 is new.
    expect(queries(get)).toEqual([{ page: 1 }, { page: 2 }])
  })

  it('walks at different limits share positions: the key leaves the caller limit out', async () => {
    const { get } = fakeEgestor({ 'access-a': 200 })
    expect(await list(withPageSink({ page: 1, limit: 50 }))).toEqual(codes(1, 50))
    // Page 3 at limit 25 is rows 51-75: all of it is upstream page 2, whose
    // start the limit-50 walk already found.
    expect(await list(withPageSink({ page: 3, limit: 25 }))).toEqual(codes(51, 25))
    expect(queries(get)).toEqual([{ page: 1 }, { page: 2 }])
  })

  it('the pager key holds no raw token, only a fingerprint', async () => {
    fakeEgestor({ 'access-a': 10 })
    await list(withPageSink({ page: 1, limit: 50 }))
    expect(pagerKeys).toHaveLength(1)
    expect(pagerKeys[0]).not.toContain(CREDS.refreshToken)
    expect(pagerKeys[0]).not.toContain(CREDS.accessToken)
  })
})
