import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  _resetCursorPager,
  listPage,
  MAX_PAGE_LIMIT,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
} from '@opensteward/shared'
import type { QueryParams } from '../../../../../../src/verticals/crm/adapter/interface'
import { LoxoAdapter } from '../../../../../../src/verticals/crm/adapters/loxo/index'

/**
 * Loxo list endpoints (first-party spec, https://loxo.readme.io/reference/):
 *
 * - people:index, companies:index document `scroll_id` ("A cursor used to
 *   retrieve the next page of results. Returned in each response.") and
 *   `per_page` ("Number of results to return in each page"). No `page`.
 * - deals:index documents `scroll_id` (and query, owner_emails) but NOT
 *   `per_page`: the upstream page size is not ours to choose.
 * - person_events:index documents `page` ("Page number to return. Starting at
 *   1") and `per_page`.
 * - deal_workflows:index documents no query parameters at all.
 *
 * The end of a scroll chain is undocumented, so this fake keeps returning a
 * scroll_id even on the last page: the adapter must end on a short (or, for
 * deals, empty) page rather than on the cursor's absence.
 *
 * The adapter used to drop the scroll_id it got back and never sent `page`,
 * so page 2 repeated page 1.
 */

const creds = { accessToken: 'key', extra: { agencySlug: 'acme' } }
const BASE = '/api/acme'
const UPSTREAM_DEFAULT = 25
const DEALS_BATCH = 4

let requests: URL[] = []

type Method =
  'listContacts' | 'listCompanies' | 'listDeals' | 'listPipelines' | 'listActivities' | 'listNotes'

type Kind = 'scroll' | 'fixed-scroll' | 'page' | 'whole'

const CASES: Array<{ method: Method; path: string; kind: Kind }> = [
  { method: 'listContacts', path: `${BASE}/people`, kind: 'scroll' },
  { method: 'listCompanies', path: `${BASE}/companies`, kind: 'scroll' },
  { method: 'listDeals', path: `${BASE}/deals`, kind: 'fixed-scroll' },
  { method: 'listPipelines', path: `${BASE}/deal_workflows`, kind: 'whole' },
  { method: 'listActivities', path: `${BASE}/person_events`, kind: 'page' },
  { method: 'listNotes', path: `${BASE}/person_events`, kind: 'page' },
]

function row(i: number) {
  return { id: i + 1, name: `r${i + 1}`, title: `r${i + 1}`, notes: `n${i + 1}` }
}

const encode = (offset: number) => Buffer.from(`o:${offset}`).toString('base64')
const decode = (s: string) => Number(Buffer.from(s, 'base64').toString().slice(2))

/** A fake Loxo that honours only the parameters each endpoint documents. */
function serve(path: string, kind: Kind, n: number) {
  const rows = Array.from({ length: n }, (_, i) => row(i))
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string) => {
      const url = new URL(input)
      requests.push(url)
      if (url.pathname !== path) return new Response('not found', { status: 404 })
      const q = url.searchParams
      let body: Record<string, unknown>
      if (kind === 'whole') {
        body = { results: rows }
      } else if (kind === 'page') {
        const size = Number(q.get('per_page') ?? UPSTREAM_DEFAULT)
        const page = Number(q.get('page') ?? 1)
        const start = (page - 1) * size
        body = { results: rows.slice(start, start + size), scroll_id: encode(start + size) }
      } else {
        const size = kind === 'scroll' ? Number(q.get('per_page') ?? UPSTREAM_DEFAULT) : DEALS_BATCH
        const scroll = q.get('scroll_id')
        const start = scroll ? decode(scroll) : 0
        body = { results: rows.slice(start, start + size), scroll_id: encode(start + size) }
      }
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }),
  )
}

function call(method: Method, params: QueryParams) {
  const adapter = new LoxoAdapter()
  return (
    adapter[method] as (c: typeof creds, p: QueryParams) => Promise<Array<{ id: string }>>
  ).call(adapter, creds, params)
}

const ids = (n: number) => Array.from({ length: n }, (_, i) => String(i + 1))

beforeEach(() => {
  requests = []
  _resetCursorPager()
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe.each(CASES)('loxo $method paging', ({ method, path, kind }) => {
  it('serves 2L+1 rows across pages 1..3, each once, in order, with exact hasMore', async () => {
    const L = 3
    serve(path, kind, 2 * L + 1)
    const seen: string[] = []
    const hasMore: (boolean | undefined)[] = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await call(method, params)
      seen.push(...rows.map((r) => r.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(ids(7))
    expect(hasMore).toEqual([true, true, false])
  })

  it('carries the documented paging key on the page-2 request', async () => {
    serve(path, kind, 7)
    await call(method, withPageSink({ page: 1, limit: 3 }))
    await call(method, withPageSink({ page: 2, limit: 3 }))
    const req = requests.at(-1)!
    if (kind === 'scroll') {
      expect(decode(req.searchParams.get('scroll_id')!)).toBe(3)
      expect(req.searchParams.get('per_page')).toBe('3')
      expect(req.searchParams.has('page')).toBe(false)
    } else if (kind === 'fixed-scroll') {
      // Page 2 (ids 4..6) begins in upstream batch 0 (ids 1..4), then needs
      // batch 1, which starts at offset 4 and is reached only by its scroll_id.
      expect(decode(req.searchParams.get('scroll_id')!)).toBe(4)
      expect(req.searchParams.has('per_page')).toBe(false)
    } else if (kind === 'page') {
      expect(req.searchParams.get('page')).toBe('2')
      expect(req.searchParams.get('per_page')).toBe('3')
    } else {
      expect([...req.searchParams.keys()]).toEqual([])
    }
  })

  it('serves every row at a limit above the router maximum, clamped by parseListQuery', async () => {
    const N = MAX_PAGE_LIMIT + 5
    serve(path, kind, N)
    const seen: string[] = []
    for (let page = 1; page <= 5; page++) {
      const params = withPageSink(parseListQuery({ page: String(page), limit: '100000' }))
      expect(params.limit).toBe(MAX_PAGE_LIMIT)
      seen.push(...(await call(method, params)).map((r) => r.id))
      if (kind === 'scroll' || kind === 'page') {
        expect(requests.at(-1)!.searchParams.get('per_page')).toBe(String(MAX_PAGE_LIMIT))
      }
      if (readUpstreamPage(params)?.hasMore === false) break
    }
    expect(seen).toEqual(ids(N))
  })

  it('gives the right meta.hasMore through parseListQuery then listPage', async () => {
    serve(path, kind, 7)
    const first = parseListQuery({ page: '1', limit: '3' })
    listPage(await call(method, first), first, 'loxo')
    const params = parseListQuery({ page: '2', limit: '3' })
    const out = listPage(await call(method, params), params, 'loxo')
    expect(out.data.map((r) => r.id)).toEqual(['4', '5', '6'])
    expect(out.meta.hasMore).toBe(true)

    const last = parseListQuery({ page: '3', limit: '3' })
    const tail = listPage(await call(method, last), last, 'loxo')
    expect(tail.data.map((r) => r.id)).toEqual(['7'])
    expect(tail.meta.hasMore).toBe(false)
  })
})
