import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { listPage, parseListQuery, readUpstreamPage, withPageSink } from '@opensteward/shared'
import type { QueryParams } from '../../../../../../src/verticals/crm/adapter/interface'
import { JobadderAdapter } from '../../../../../../src/verticals/crm/adapters/jobadder/index'

/**
 * JobAdder v2 list operations page by `Offset` + `Limit`
 * (https://api.jobadder.com/v2/openapi.json):
 *
 *   "name": "Offset", ... "description": "The index of the first entry to
 *    return from the resource collection", ... "name": "Limit", ...
 *   "description": "The maximum number of entries to return.<br /> ...
 *   "maximum": 1000, ... "totalCount": { ... "PageLinks": { ... "next": {
 *
 * The adapter used to read the offset from params.offset/params.cursor only,
 * never from `page`, so page 2 re-sent page 1.
 */

const creds = { accessToken: 'tok' }
const MAX = 1000
const DEFAULT = 100
let requests: URL[] = []

type Method = 'listContacts' | 'listCompanies' | 'listDeals' | 'listActivities' | 'listNotes'

const CASES: Array<{ method: Method; path: string; extra?: QueryParams }> = [
  { method: 'listContacts', path: '/v2/candidates' },
  { method: 'listCompanies', path: '/v2/companies' },
  { method: 'listDeals', path: '/v2/jobs' },
  { method: 'listActivities', path: '/v2/usertasks' },
  { method: 'listNotes', path: '/v2/candidates/c1/notes', extra: { candidateId: 'c1' } },
  { method: 'listNotes', path: '/v2/jobs/j1/notes', extra: { jobId: 'j1' } },
]

/** Honours only `Offset` (default 0) and `Limit` (default 100, max 1000). */
function serve(
  path: string,
  n: number,
  opts: { noLinks?: boolean; noTotal?: boolean; cap?: number } = {},
) {
  const rows = Array.from({ length: n }, (_, i) => ({
    candidateId: i + 1,
    companyId: i + 1,
    jobId: i + 1,
    taskId: i + 1,
    noteId: i + 1,
    name: `r${i + 1}`,
    firstName: `r${i + 1}`,
    title: `r${i + 1}`,
    jobTitle: `r${i + 1}`,
    text: `r${i + 1}`,
  }))
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string) => {
      const url = new URL(input)
      requests.push(url)
      if (url.pathname !== path) return new Response('not found', { status: 404 })
      const rawLimit = url.searchParams.get('Limit')
      const limit = Math.min(
        rawLimit === null ? DEFAULT : Math.min(Number(rawLimit), MAX),
        opts.cap ?? MAX,
      )
      const offset = Number(url.searchParams.get('Offset') ?? 0)
      const items = rows.slice(offset, offset + limit)
      const body: Record<string, unknown> = { items }
      if (!opts.noTotal) body.totalCount = rows.length
      if (!opts.noLinks) {
        body.links = {
          next:
            offset + limit < rows.length
              ? `https://api.jobadder.com${path}?Offset=${offset + limit}&Limit=${limit}`
              : null,
        }
      }
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }),
  )
}

function idOf(r: { id: string }): string {
  // Notes carry a compound id "candidate:{parent}:{noteId}".
  return r.id.split(':').at(-1)!
}

function call(method: Method, params: QueryParams) {
  const adapter = new JobadderAdapter()
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

describe.each(CASES)('jobadder $method $path paging', ({ method, path, extra }) => {
  it('serves 2L+1 rows across pages 1..3, each once, in order, with exact hasMore', async () => {
    const L = 3
    serve(path, 2 * L + 1)
    const seen: string[] = []
    const hasMore: (boolean | undefined)[] = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ ...extra, page, limit: L })
      const rows = await call(method, params)
      seen.push(...rows.map(idOf))
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(['1', '2', '3', '4', '5', '6', '7'])
    expect(hasMore).toEqual([true, true, false])
  })

  it('reports hasMore false on a full last page from totalCount alone', async () => {
    serve(path, 6, { noLinks: true })
    const params = withPageSink({ ...extra, page: 2, limit: 3 })
    const rows = await call(method, params)
    expect(rows.map(idOf)).toEqual(['4', '5', '6'])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    expect(readUpstreamPage(params)?.totalCount).toBe(6)
  })

  it('sends the documented Offset = (page - 1) * Limit on page 2', async () => {
    serve(path, 7)
    await call(method, withPageSink({ ...extra, page: 2, limit: 3 }))
    const req = requests.find((u) => u.pathname === path)!
    expect(req.searchParams.get('Offset')).toBe('3')
    expect(req.searchParams.get('Limit')).toBe('3')
    expect(req.searchParams.has('limit')).toBe(false)
    expect(req.searchParams.has('offset')).toBe(false)
  })

  it('clamps a limit above 1000 and still serves every row', async () => {
    const N = 2 * MAX + 5
    serve(path, N)
    const seen: string[] = []
    for (let page = 1; page <= 10; page++) {
      const params = withPageSink({ ...extra, page, limit: 5000 })
      const rows = await call(method, params)
      seen.push(...rows.map(idOf))
      const sent = requests.filter((u) => u.pathname === path).at(-1)!
      expect(Number(sent.searchParams.get('Limit'))).toBe(MAX)
      expect(readUpstreamPage(params)?.pageSize).toBe(MAX)
      if (readUpstreamPage(params)?.hasMore === false) break
    }
    expect(seen).toEqual(Array.from({ length: N }, (_, i) => String(i + 1)))
  })

  it('keeps hasMore true when the upstream returns a short page mid-collection', async () => {
    // Upstream serves only 2 rows although Limit=3 was sent; row 6 is still unread.
    serve(path, 6, { cap: 2 })
    const params = withPageSink({ ...extra, page: 2, limit: 3 })
    const rows = await call(method, params)
    expect(rows.map(idOf)).toEqual(['4', '5'])
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })

  it('falls back to links.next when totalCount is absent', async () => {
    serve(path, 7, { noTotal: true })
    const mid = withPageSink({ ...extra, page: 2, limit: 3 })
    await call(method, mid)
    expect(readUpstreamPage(mid)?.hasMore).toBe(true)
    const last = withPageSink({ ...extra, page: 3, limit: 3 })
    await call(method, last)
    expect(readUpstreamPage(last)?.hasMore).toBe(false)
  })

  it('lets an explicit offset win over page', async () => {
    serve(path, 7)
    const rows = await call(method, withPageSink({ ...extra, page: 1, limit: 3, offset: 5 }))
    expect(rows.map(idOf)).toEqual(['6', '7'])
    const req = requests.find((u) => u.pathname === path)!
    expect(req.searchParams.get('Offset')).toBe('5')
  })

  it('sends Limit=25 when no usable limit is given, and floors a fractional one', async () => {
    serve(path, 7)
    for (const limit of [undefined, 0, -1]) {
      const p: QueryParams = { ...extra, page: 1 }
      if (limit !== undefined) p.limit = limit
      await call(method, withPageSink(p))
      expect(requests.at(-1)!.searchParams.get('Limit')).toBe('25')
    }
    await call(method, withPageSink({ ...extra, page: 2, limit: 3.7 }))
    expect(requests.at(-1)!.searchParams.get('Limit')).toBe('3')
    expect(requests.at(-1)!.searchParams.get('Offset')).toBe('3')
  })

  it('gives the right meta.hasMore through parseListQuery then listPage', async () => {
    serve(path, 7)
    const adapter = new JobadderAdapter()
    const params = parseListQuery({ page: '2', limit: '3' }, adapter)
    Object.assign(params, extra)
    const rows = await call(method, params)
    const out = listPage(rows, params, 'jobadder')
    expect(out.data.map(idOf)).toEqual(['4', '5', '6'])
    expect(out.meta.hasMore).toBe(true)

    const last = parseListQuery({ page: '3', limit: '3' }, adapter)
    Object.assign(last, extra)
    const tail = listPage(await call(method, last), last, 'jobadder')
    expect(tail.data.map(idOf)).toEqual(['7'])
    expect(tail.meta.hasMore).toBe(false)
  })
})

describe('jobadder capabilities', () => {
  it('declares the documented Limit maximum', () => {
    expect(new JobadderAdapter().capabilities?.maxPageSize).toBe(MAX)
  })

  it('listNotes without a parent reports its (empty) end', async () => {
    serve('/v2/none', 0)
    const params = withPageSink({ page: 1, limit: 3 })
    expect(await call('listNotes', params)).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    expect(requests).toHaveLength(0)
  })
})
