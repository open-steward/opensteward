import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { listPage, parseListQuery, readUpstreamPage, withPageSink } from '@opensteward/shared'
import type { QueryParams } from '../../../../../../src/verticals/crm/adapter/interface'
import { ClarifyAdapter } from '../../../../../../src/verticals/crm/adapters/clarify/index'

/**
 * Clarify's List resources endpoint pages by offset
 * (https://developer.clarify.ai/docs/api-basics/pagination):
 *
 *   "Control the page with the `page[limit]` and `page[offset]` parameters:
 *    [...] `next` is `null` on the last page, and `prev` is `null` on the
 *    first page."
 *
 * The first-party OpenAPI (https://api.clarify.ai/swagger-json) caps
 * `page[limit]` at 500: "The maximum number of records to return per page
 * (up to 500)."
 *
 * The adapter used to send only `page[limit]` and never derive `page[offset]`
 * from `page`, so page 2 repeated page 1.
 */

const creds = { accessToken: 'key', extra: { workspaceSlug: 'ws' } }
const MAX = 500
let requests: URL[] = []

type Method = 'listContacts' | 'listCompanies' | 'listDeals' | 'listActivities'

const CASES: Array<{ method: Method; object: string }> = [
  { method: 'listContacts', object: 'person' },
  { method: 'listCompanies', object: 'company' },
  { method: 'listDeals', object: 'deal' },
  { method: 'listActivities', object: 'task' },
]

/**
 * Honours only `page[limit]` (default and max 500) and `page[offset]`; answers
 * `links.next` (null on the last page) and `meta.total_records`.
 */
function serve(
  object: string,
  n: number,
  opts: { noLinks?: boolean; noMeta?: boolean; linksWithoutNext?: boolean } = {},
) {
  const rows = Array.from({ length: n }, (_, i) => ({
    id: String(i + 1),
    type: object,
    attributes: { name: `r${i + 1}`, title: `r${i + 1}` },
  }))
  const path = `/v1/workspaces/ws/objects/${object}/resources`
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string) => {
      const url = new URL(input)
      requests.push(url)
      if (url.pathname !== path) return new Response('not found', { status: 404 })
      const rawLimit = url.searchParams.get('page[limit]')
      const limit = rawLimit === null ? MAX : Math.min(Number(rawLimit), MAX)
      const offset = Number(url.searchParams.get('page[offset]') ?? 0)
      const data = rows.slice(offset, offset + limit)
      const next =
        offset + limit < rows.length
          ? `https://api.clarify.ai${path}?page[offset]=${offset + limit}&page[limit]=${limit}`
          : null
      const body: Record<string, unknown> = { data }
      if (opts.linksWithoutNext) body.links = { prev: offset > 0 ? 'prev' : null }
      else if (!opts.noLinks) body.links = { next, prev: offset > 0 ? 'prev' : null }
      if (!opts.noMeta) {
        body.meta = { total_records: rows.length, total_pages: Math.ceil(rows.length / limit) }
      }
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }),
  )
  return path
}

function call(method: Method, params: QueryParams) {
  const adapter = new ClarifyAdapter()
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

describe.each(CASES)('clarify $method paging', ({ method, object }) => {
  it('serves 2L+1 rows across pages 1..3, each once, in order, with exact hasMore', async () => {
    const L = 3
    serve(object, 2 * L + 1)
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

  it('sends page[offset] = (page - 1) * limit on page 2', async () => {
    const path = serve(object, 7)
    await call(method, withPageSink({ page: 2, limit: 3 }))
    const req = requests.find((u) => u.pathname === path)!
    expect(req.searchParams.get('page[offset]')).toBe('3')
    expect(req.searchParams.get('page[limit]')).toBe('3')
  })

  it('reports hasMore false on a full last page when rows are an exact multiple of limit', async () => {
    serve(object, 6)
    const params = withPageSink({ page: 2, limit: 3 })
    const rows = await call(method, params)
    expect(rows.map((r) => r.id)).toEqual(['4', '5', '6'])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    expect(readUpstreamPage(params)?.totalCount).toBe(6)
  })

  it('falls back to meta.total_records when the response has no links', async () => {
    serve(object, 7, { noLinks: true })
    const params = withPageSink({ page: 2, limit: 3 })
    await call(method, params)
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
    const last = withPageSink({ page: 3, limit: 3 })
    await call(method, last)
    expect(readUpstreamPage(last)?.hasMore).toBe(false)
  })

  it('reads hasMore from links.next when the response has no meta', async () => {
    serve(object, 7, { noMeta: true })
    const params = withPageSink({ page: 2, limit: 3 })
    await call(method, params)
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
    const last = withPageSink({ page: 3, limit: 3 })
    await call(method, last)
    expect(readUpstreamPage(last)?.hasMore).toBe(false)
  })

  it('falls back to meta.total_records when links has no next key', async () => {
    serve(object, 7, { linksWithoutNext: true })
    const params = withPageSink({ page: 1, limit: 3 })
    await call(method, params)
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
    const last = withPageSink({ page: 3, limit: 3 })
    await call(method, last)
    expect(readUpstreamPage(last)?.hasMore).toBe(false)
  })

  it('sends the default page size of 25 when no limit is given', async () => {
    const path = serve(object, 7)
    await call(method, withPageSink({ page: 1 }))
    const req = requests.find((u) => u.pathname === path)!
    expect(req.searchParams.get('page[limit]')).toBe('25')
  })

  it('floors a fractional limit and reports no pageSize when not clamped', async () => {
    const path = serve(object, 7)
    const params = withPageSink({ page: 2, limit: 2.5 })
    await call(method, params)
    const req = requests.find((u) => u.pathname === path)!
    expect(req.searchParams.get('page[limit]')).toBe('2')
    expect(req.searchParams.get('page[offset]')).toBe('2')
    expect(readUpstreamPage(params)?.pageSize).toBeUndefined()
  })

  it('reports no hasMore when the upstream sends neither links nor meta', async () => {
    serve(object, 7, { noLinks: true, noMeta: true })
    const params = withPageSink({ page: 1, limit: 3 })
    expect(await call(method, params)).toHaveLength(3)
    expect(readUpstreamPage(params)?.hasMore).toBeUndefined()
  })

  it('clamps a limit above 500 and still serves every row', async () => {
    const N = 2 * MAX + 5
    const path = serve(object, N)
    const seen: string[] = []
    for (let page = 1; page <= 10; page++) {
      const params = withPageSink({ page, limit: 1000 })
      const rows = await call(method, params)
      seen.push(...rows.map((r) => r.id))
      const sent = requests.filter((u) => u.pathname === path).at(-1)!
      expect(Number(sent.searchParams.get('page[limit]'))).toBeLessThanOrEqual(MAX)
      expect(readUpstreamPage(params)?.pageSize).toBe(MAX)
      if (readUpstreamPage(params)?.hasMore === false) break
    }
    expect(seen).toEqual(Array.from({ length: N }, (_, i) => String(i + 1)))
  })

  it('gives the right meta.hasMore through parseListQuery then listPage', async () => {
    serve(object, 7)
    const adapter = new ClarifyAdapter()
    const params = parseListQuery({ page: '2', limit: '3' }, adapter)
    const out = listPage(await call(method, params), params, 'clarify')
    expect(out.data.map((r) => r.id)).toEqual(['4', '5', '6'])
    expect(out.meta.hasMore).toBe(true)
    expect(out.meta.totalCount).toBe(7)

    const last = parseListQuery({ page: '3', limit: '3' }, adapter)
    const tail = listPage(await call(method, last), last, 'clarify')
    expect(tail.data.map((r) => r.id)).toEqual(['7'])
    expect(tail.meta.hasMore).toBe(false)
  })
})

describe('clarify capabilities', () => {
  it('declares the documented page maximum', () => {
    expect(new ClarifyAdapter().capabilities?.maxPageSize).toBe(MAX)
  })
})
