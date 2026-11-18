import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { listPage, parseListQuery, readUpstreamPage, withPageSink } from '@opensteward/shared'
import type { QueryParams } from '../../../../../../src/verticals/crm/adapter/interface'
import { SalesflareAdapter } from '../../../../../../src/verticals/crm/adapters/salesflare/index'

/**
 * Salesflare list endpoints page by `limit` + `offset`
 * (https://api.salesflare.com/openapi.json, the spec https://api.salesflare.com/docs loads):
 *
 *   GET /contacts: {"type":"number","default":20,"minimum":1,"name":"limit","in":"query"},
 *                  {"type":"number","default":0,"name":"offset","in":"query"}
 *   GET /tasks:    "The number of tasks to return. Defaults to 20." / "The number of tasks to skip."
 *
 * No maximum is documented and the response is a bare JSON array, so a page
 * shorter than `limit` is the only end signal. The adapter used to send
 * offset = params.offset ?? params.cursor ?? 0 and never read `page`, so page 2
 * repeated page 1.
 *
 * GET /pipelines documents only search, order_by and q: no paging parameters.
 */

const creds = { accessToken: 'tok' }
const DEFAULT = 20
let requests: URL[] = []

type Method = 'listContacts' | 'listCompanies' | 'listDeals' | 'listActivities' | 'listPipelines'

const OFFSET_CASES: Array<{ method: Method; path: string }> = [
  { method: 'listContacts', path: '/contacts' },
  { method: 'listCompanies', path: '/accounts' },
  { method: 'listDeals', path: '/opportunities' },
  { method: 'listActivities', path: '/tasks' },
]

/** Honours only the documented `limit` (default 20, no maximum) and `offset`. */
function serveOffset(path: string, n: number) {
  const rows = Array.from({ length: n }, (_, i) => ({ id: i + 1, name: `r${i + 1}` }))
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string) => {
      const url = new URL(input)
      requests.push(url)
      if (url.pathname !== path) return new Response('not found', { status: 404 })
      const rawLimit = url.searchParams.get('limit')
      const limit = rawLimit === null ? DEFAULT : Number(rawLimit)
      const offset = Number(url.searchParams.get('offset') ?? 0)
      return new Response(JSON.stringify(rows.slice(offset, offset + limit)), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }),
  )
}

/** GET /pipelines takes no paging parameters: it answers every row regardless. */
function servePipelines(n: number) {
  const rows = Array.from({ length: n }, (_, i) => ({ id: i + 1, name: `p${i + 1}` }))
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string) => {
      const url = new URL(input)
      requests.push(url)
      if (url.pathname !== '/pipelines') return new Response('not found', { status: 404 })
      return new Response(JSON.stringify(rows), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }),
  )
}

function call(method: Method, params: QueryParams) {
  const adapter = new SalesflareAdapter()
  return (
    adapter[method] as (c: typeof creds, p: QueryParams) => Promise<Array<{ id: string }>>
  ).call(adapter, creds, params)
}

const ids = (n: number) => Array.from({ length: n }, (_, i) => String(i + 1))

beforeEach(() => {
  requests = []
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe.each(OFFSET_CASES)('salesflare $method paging', ({ method, path }) => {
  it('serves 2L+1 rows across pages 1..3, each once, in order, with exact hasMore', async () => {
    const L = 3
    serveOffset(path, 2 * L + 1)
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

  it('sends offset = (page - 1) * limit on page 2', async () => {
    serveOffset(path, 7)
    await call(method, withPageSink({ page: 2, limit: 3 }))
    const req = requests.find((u) => u.pathname === path)!
    expect(req.searchParams.get('offset')).toBe('3')
    expect(req.searchParams.get('limit')).toBe('3')
  })

  it('uses one default size for both limit and the offset stride when no limit is given', async () => {
    serveOffset(path, 250)
    const params = withPageSink({ page: 2 })
    const rows = await call(method, params)
    const req = requests.find((u) => u.pathname === path)!
    expect(req.searchParams.get('limit')).toBe('100')
    expect(req.searchParams.get('offset')).toBe('100')
    expect(rows.map((r) => r.id)).toEqual(ids(200).slice(100))
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })

  it('serves every row at a large limit (no documented maximum)', async () => {
    const N = 1205
    serveOffset(path, N)
    const seen: string[] = []
    for (let page = 1; page <= 10; page++) {
      const params = withPageSink({ page, limit: 500 })
      const rows = await call(method, params)
      seen.push(...rows.map((r) => r.id))
      const sent = requests.filter((u) => u.pathname === path).at(-1)!
      expect(sent.searchParams.get('limit')).toBe('500')
      if (readUpstreamPage(params)?.hasMore === false) break
    }
    expect(seen).toEqual(ids(N))
  })

  it('gives the right meta.hasMore through parseListQuery then listPage', async () => {
    serveOffset(path, 7)
    const params = parseListQuery({ page: '2', limit: '3' })
    const out = listPage(await call(method, params), params, 'salesflare')
    expect(out.data.map((r) => r.id)).toEqual(['4', '5', '6'])
    expect(out.meta.hasMore).toBe(true)

    const last = parseListQuery({ page: '3', limit: '3' })
    const tail = listPage(await call(method, last), last, 'salesflare')
    expect(tail.data.map((r) => r.id)).toEqual(['7'])
    expect(tail.meta.hasMore).toBe(false)
  })
})

describe('salesflare listPipelines paging', () => {
  it('pages the whole collection locally across pages 1..3 with exact hasMore', async () => {
    const L = 3
    servePipelines(2 * L + 1)
    const seen: string[] = []
    const hasMore: (boolean | undefined)[] = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await call('listPipelines', params)
      seen.push(...rows.map((r) => r.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
      expect(readUpstreamPage(params)?.pagedLocally).toBe(true)
    }
    expect(seen).toEqual(ids(7))
    expect(hasMore).toEqual([true, true, false])
  })

  it('sends no undocumented paging parameters', async () => {
    servePipelines(3)
    await call('listPipelines', withPageSink({ page: 2, limit: 1 }))
    const req = requests.find((u) => u.pathname === '/pipelines')!
    expect(req.searchParams.has('limit')).toBe(false)
    expect(req.searchParams.has('offset')).toBe(false)
  })

  it('serves every row at a large limit', async () => {
    servePipelines(205)
    const params = withPageSink({ page: 1, limit: 500 })
    const rows = await call('listPipelines', params)
    expect(rows.map((r) => r.id)).toEqual(ids(205))
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('gives the right meta.hasMore through parseListQuery then listPage', async () => {
    servePipelines(7)
    const params = parseListQuery({ page: '2', limit: '3' })
    const out = listPage(await call('listPipelines', params), params, 'salesflare')
    expect(out.data.map((r) => r.id)).toEqual(['4', '5', '6'])
    expect(out.meta.hasMore).toBe(true)
    expect(out.meta.totalCount).toBe(7)
  })
})
