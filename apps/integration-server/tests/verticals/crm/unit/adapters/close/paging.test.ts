import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { listPage, parseListQuery, readUpstreamPage, withPageSink } from '@opensteward/shared'
import type { QueryParams } from '../../../../../../src/verticals/crm/adapter/interface'
import { CloseAdapter } from '../../../../../../src/verticals/crm/adapters/close/index'

/**
 * Close v1 collections page by `_limit` + `_skip`
 * (https://developer.close.com/api/resources/contacts/list.md, and the same
 * wording on lead, opportunity, activity and note):
 *
 *   "`_skip` (integer, optional, default: 0) — Number of results to skip
 *    before returning, for pagination."
 *
 * and answer `has_more`. Opportunities also carry `total_results`.
 * The adapter used to derive `_skip` only from params.cursor/params.skip, never
 * from `page`, so page 2 repeated page 1.
 *
 * /pipeline/ documents no query parameters at all, so it is fetched whole and
 * paged locally.
 */

const creds = { accessToken: 'key' }
const BASE = '/api/v1'
let requests: URL[] = []

type Method = 'listContacts' | 'listCompanies' | 'listDeals' | 'listActivities' | 'listNotes'

const CASES: Array<{ method: Method; path: string; total?: boolean }> = [
  { method: 'listContacts', path: `${BASE}/contact/` },
  { method: 'listCompanies', path: `${BASE}/lead/` },
  { method: 'listDeals', path: `${BASE}/opportunity/`, total: true },
  { method: 'listActivities', path: `${BASE}/activity/` },
  { method: 'listNotes', path: `${BASE}/activity/note/` },
]

const UPSTREAM_DEFAULT = 100

function row(i: number) {
  return {
    id: String(i + 1),
    name: `r${i + 1}`,
    display_name: `r${i + 1}`,
    note: `n${i + 1}`,
    _type: 'Note',
    date_created: '2026-01-01T00:00:00Z',
    date_updated: '2026-01-01T00:00:00Z',
    statuses: [],
  }
}

/**
 * Honours only `_limit` (default 100) and `_skip` on paged collections; the
 * pipeline endpoint honours nothing and returns every row.
 */
function serve(
  path: string,
  n: number,
  opts: { total?: boolean; pipelineHasMore?: boolean; omitHasMore?: boolean } = {},
) {
  const rows = Array.from({ length: n }, (_, i) => row(i))
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string) => {
      const url = new URL(input)
      requests.push(url)
      if (url.pathname !== path) return new Response('not found', { status: 404 })
      let body: Record<string, unknown>
      if (path === `${BASE}/pipeline/`) {
        body = { data: rows, has_more: opts.pipelineHasMore ?? false }
      } else {
        const rawLimit = url.searchParams.get('_limit')
        const limit = rawLimit === null ? UPSTREAM_DEFAULT : Number(rawLimit)
        const skip = Number(url.searchParams.get('_skip') ?? 0)
        const page = rows.slice(skip, skip + limit)
        body = { data: page }
        if (!opts.omitHasMore) body.has_more = skip + page.length < rows.length
        if (opts.total) body.total_results = rows.length
      }
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }),
  )
}

function call(method: Method | 'listPipelines', params: QueryParams) {
  const adapter = new CloseAdapter()
  return (
    adapter[method] as (c: typeof creds, p: QueryParams) => Promise<Array<{ id: string }>>
  ).call(adapter, creds, params)
}

beforeEach(() => {
  requests = []
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe.each(CASES)('close $method paging', ({ method, path, total }) => {
  it('serves 2L+1 rows across pages 1..3, each once, in order, with exact hasMore', async () => {
    const L = 3
    serve(path, 2 * L + 1, { total })
    const seen: string[] = []
    const hasMore: (boolean | undefined)[] = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await call(method, params)
      seen.push(...rows.map((r) => r.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(['1', '2', '3', '4', '5', '6', '7'])
    expect(hasMore).toEqual([true, true, false])
  })

  it('sends _skip = (page - 1) * limit and _limit on page 2', async () => {
    serve(path, 7, { total })
    await call(method, withPageSink({ page: 2, limit: 3 }))
    const req = requests.at(-1)!
    expect(req.searchParams.get('_skip')).toBe('3')
    expect(req.searchParams.get('_limit')).toBe('3')
  })

  it('sends a large limit as asked (no documented maximum) and still serves every row', async () => {
    const N = 2 * UPSTREAM_DEFAULT + 5
    serve(path, N, { total })
    const seen: string[] = []
    for (let page = 1; page <= 10; page++) {
      const params = withPageSink({ page, limit: 150 })
      seen.push(...(await call(method, params)).map((r) => r.id))
      expect(requests.at(-1)!.searchParams.get('_limit')).toBe('150')
      if (readUpstreamPage(params)?.hasMore === false) break
    }
    expect(seen).toEqual(Array.from({ length: N }, (_, i) => String(i + 1)))
  })

  it('gives the right meta.hasMore through parseListQuery then listPage', async () => {
    serve(path, 7, { total })
    const params = parseListQuery({ page: '2', limit: '3' })
    const out = listPage(await call(method, params), params, 'close')
    expect(out.data.map((r) => r.id)).toEqual(['4', '5', '6'])
    expect(out.meta.hasMore).toBe(true)
    expect(out.meta.totalCount).toBe(total ? 7 : null)

    const last = parseListQuery({ page: '3', limit: '3' })
    const tail = listPage(await call(method, last), last, 'close')
    expect(tail.data.map((r) => r.id)).toEqual(['7'])
    expect(tail.meta.hasMore).toBe(false)
  })

  it('reports no end when the upstream leaves out has_more, so a full page is not a false end', async () => {
    serve(path, 7, { omitHasMore: true })
    const sink = withPageSink({ page: 1, limit: 3 })
    await call(method, sink)
    expect(readUpstreamPage(sink)?.hasMore).toBeUndefined()

    const params = parseListQuery({ page: '1', limit: '3' })
    const out = listPage(await call(method, params), params, 'close')
    expect(out.data.map((r) => r.id)).toEqual(['1', '2', '3'])
    expect(out.meta.hasMore).toBeNull()
  })
})

describe('close listPipelines paging', () => {
  const path = `${BASE}/pipeline/`

  it('serves 2L+1 pipelines across pages 1..3, each once, in order, with exact hasMore', async () => {
    const L = 3
    serve(path, 2 * L + 1)
    const seen: string[] = []
    const hasMore: (boolean | undefined)[] = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      seen.push(...(await call('listPipelines', params)).map((r) => r.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(['1', '2', '3', '4', '5', '6', '7'])
    expect(hasMore).toEqual([true, true, false])
  })

  it('sends no undocumented paging parameters', async () => {
    serve(path, 7)
    await call('listPipelines', withPageSink({ page: 2, limit: 3 }))
    expect([...requests.at(-1)!.searchParams.keys()]).toEqual([])
  })

  it('gives the right meta.hasMore through parseListQuery then listPage', async () => {
    serve(path, 7)
    const params = parseListQuery({ page: '2', limit: '3' })
    const out = listPage(await call('listPipelines', params), params, 'close')
    expect(out.data.map((r) => r.id)).toEqual(['4', '5', '6'])
    expect(out.meta.hasMore).toBe(true)
    expect(out.meta.totalCount).toBe(7)
  })

  it('refuses to serve a short list when the upstream says has_more', async () => {
    serve(path, 3, { pipelineHasMore: true })
    await expect(call('listPipelines', withPageSink({ page: 1, limit: 10 }))).rejects.toMatchObject(
      { message: expect.stringMatching(/has_more/), statusCode: 502, code: 'UPSTREAM_ERROR' },
    )
  })
})
