/**
 * Streak list paging.
 *
 * Boxes (deals) page by a 0-indexed page number (docs, list-all-boxes-in-pipeline:
 * "The page number you'd like to view. If there are more results to show,
 * `hasNextPage` will be `true`. Pages are 0 indexed."). The adapter once sent
 * the caller's 1-based page unchanged, so caller page 1 fetched Streak's second
 * page and the first `limit` boxes were unreachable.
 *
 * Pipelines (`GET /pipelines`) take no paging parameters (`sortBy` is the only
 * documented query parameter), so they are fetched whole and sliced locally.
 *
 * The fake upstream honours ONLY the documented parameters: `page` and `limit`
 * on boxes, nothing on pipelines.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type Credentials,
} from '@opensteward/shared'
import { StreakAdapter } from '../../../../../../src/verticals/crm/adapters/streak/index'

const creds: Credentials = { accessToken: 'a2V5Og==' } as Credentials

interface Seen {
  path: string
  query: URLSearchParams
}

let seen: Seen[] = []

const box = (i: number) => ({ key: `b${i}`, name: `Box ${i}`, pipelineKey: 'P1' })
const pipeline = (i: number) => ({ key: `p${i}`, name: `Pipeline ${i}`, stages: {} })

/** A 0-indexed page-number upstream answering `{ results, hasNextPage }`. */
function boxPages(n: number, envelope = true) {
  const rows = Array.from({ length: n }, (_, i) => box(i + 1))
  return (query: URLSearchParams): unknown => {
    const size = query.has('limit') ? Number(query.get('limit')) : n
    const page = query.has('page') ? Number(query.get('page')) : 0
    const start = page * size
    const results = rows.slice(start, start + size)
    return envelope ? { results, hasNextPage: start + size < rows.length } : results
  }
}

function install(routes: Record<string, (q: URLSearchParams) => unknown>): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string) => {
      const url = new URL(input)
      const path = url.pathname.replace(/^\/api\/v1/, '')
      seen.push({ path, query: url.searchParams })
      const route = routes[path]
      if (!route) return new Response('not found', { status: 404 })
      return new Response(JSON.stringify(route(url.searchParams)), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }),
  )
}

beforeEach(() => {
  seen = []
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe.each<[string, Record<string, unknown>]>([
  ['with pipeline_id', { pipeline_id: 'P1' }],
  ['without pipeline_id (first pipeline)', {}],
])('streak listDeals pages by 0-indexed page number %s', (_label, filters) => {
  const L = 3
  const N = 2 * L + 1
  const routes = () => ({
    '/pipelines': () => [pipeline(1)].map((p) => ({ ...p, key: 'P1' })),
    '/pipelines/P1/boxes': boxPages(N),
  })

  it('serves every box once, in order, with exact hasMore', async () => {
    install(routes())
    const adapter = new StreakAdapter()
    const ids: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ ...filters, page, limit: L })
      const rows = await adapter.listDeals(creds, params)
      ids.push(...rows.map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
      expect(readUpstreamPage(params)?.pageSize).toBe(L)
    }
    expect(ids).toEqual(Array.from({ length: N }, (_, i) => `b${i + 1}`))
    expect(more).toEqual([true, true, false])
  })

  it('sends page=0 on caller page 1 and page=1 on caller page 2', async () => {
    install(routes())
    const adapter = new StreakAdapter()
    await adapter.listDeals(creds, withPageSink({ ...filters, page: 1, limit: L }))
    await adapter.listDeals(creds, withPageSink({ ...filters, page: 2, limit: L }))
    const boxes = seen.filter((s) => s.path.endsWith('/boxes'))
    expect(boxes[0]!.query.get('page')).toBe('0')
    expect(boxes[0]!.query.get('limit')).toBe(String(L))
    expect(boxes[1]!.query.get('page')).toBe('1')
    expect(boxes[1]!.query.get('limit')).toBe(String(L))
  })

  it('a limit past the collection size serves every box in one page (no documented maximum)', async () => {
    install(routes())
    const params = withPageSink({ ...filters, page: 1, limit: 500 })
    const rows = await new StreakAdapter().listDeals(creds, params)
    expect(rows.map((r) => r.id)).toEqual(Array.from({ length: N }, (_, i) => `b${i + 1}`))
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('through the API path, meta.hasMore follows hasNextPage', async () => {
    install(routes())
    const adapter = new StreakAdapter()
    const params = parseListQuery({ ...filters, limit: String(L), page: '1' })
    const env = listPage(await adapter.listDeals(creds, params), params, 'streak')
    expect(env.meta.hasMore).toBe(true)
    expect(env.data.map((r) => r.id)).toEqual(['b1', 'b2', 'b3'])

    const last = parseListQuery({ ...filters, limit: String(L), page: '3' })
    const envLast = listPage(await adapter.listDeals(creds, last), last, 'streak')
    expect(envLast.meta.hasMore).toBe(false)
    expect(envLast.data.map((r) => r.id)).toEqual([`b${N}`])
  })
})

describe('streak listDeals pipeline discovery', () => {
  it('sends no undocumented limit on GET /pipelines', async () => {
    install({ '/pipelines': () => [{ key: 'P1', name: 'P' }], '/pipelines/P1/boxes': boxPages(1) })
    await new StreakAdapter().listDeals(creds, withPageSink({ page: 1, limit: 3 }))
    const discovery = seen.find((s) => s.path === '/pipelines')!
    expect([...discovery.query.keys()]).toEqual([])
  })

  it('a bare-array answer still serves page 1 from page 0', async () => {
    install({ '/pipelines/P1/boxes': boxPages(7, false) })
    const params = withPageSink({ pipeline_id: 'P1', page: 1, limit: 3 })
    const rows = await new StreakAdapter().listDeals(creds, params)
    expect(rows.map((r) => r.id)).toEqual(['b1', 'b2', 'b3'])
  })

  it('a bare-array answer reports only pageSize, leaving hasMore to the full-page rule', async () => {
    install({ '/pipelines/P1/boxes': boxPages(7, false) })
    const params = withPageSink({ pipeline_id: 'P1', page: 1, limit: 3 })
    await new StreakAdapter().listDeals(creds, params)
    expect(readUpstreamPage(params)?.hasMore).toBeUndefined()
    expect(readUpstreamPage(params)?.pageSize).toBe(3)
  })

  it('through the API path, a bare-array walk leaves a full page open and closes a short one', async () => {
    install({
      '/pipelines': () => [{ key: 'P1', name: 'P' }],
      '/pipelines/P1/boxes': boxPages(7, false),
    })
    const adapter = new StreakAdapter()
    const first = parseListQuery({ pipeline_id: 'P1', limit: '3', page: '1' })
    const envFirst = listPage(await adapter.listDeals(creds, first), first, 'streak')
    expect(envFirst.data.map((r) => r.id)).toEqual(['b1', 'b2', 'b3'])
    // A full page with no reported signal is "unknown" (deriveHasMore → null),
    // never false: a walk must not stop here.
    expect(envFirst.meta.hasMore).toBeNull()

    const last = parseListQuery({ pipeline_id: 'P1', limit: '3', page: '3' })
    const envLast = listPage(await adapter.listDeals(creds, last), last, 'streak')
    expect(envLast.data.map((r) => r.id)).toEqual(['b7'])
    expect(envLast.meta.hasMore).toBe(false)
  })
})

describe('streak listPipelines pages locally', () => {
  const L = 3
  const N = 2 * L + 1
  const all = Array.from({ length: N }, (_, i) => pipeline(i + 1))

  it('serves every pipeline once, in order, with exact hasMore', async () => {
    install({ '/pipelines': () => all })
    const adapter = new StreakAdapter()
    const ids: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await adapter.listPipelines(creds, params)
      ids.push(...rows.map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(ids).toEqual(Array.from({ length: N }, (_, i) => `p${i + 1}`))
    expect(more).toEqual([true, true, false])
    // The endpoint documents no paging parameters.
    for (const s of seen) expect([...s.query.keys()]).toEqual([])
  })

  it('a limit above the collection serves every pipeline', async () => {
    install({ '/pipelines': () => all })
    const params = withPageSink({ page: 1, limit: 500 })
    const rows = await new StreakAdapter().listPipelines(creds, params)
    expect(rows).toHaveLength(N)
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('through the API path, meta.hasMore is exact', async () => {
    install({ '/pipelines': () => all })
    const params = parseListQuery({ limit: String(L), page: '2' })
    const env = listPage(await new StreakAdapter().listPipelines(creds, params), params, 'streak')
    expect(env.data.map((r) => r.id)).toEqual(['p4', 'p5', 'p6'])
    expect(env.meta.hasMore).toBe(true)
    expect(env.meta.totalCount).toBe(N)
  })
})
