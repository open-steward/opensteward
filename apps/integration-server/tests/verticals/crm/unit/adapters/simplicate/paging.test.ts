import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { listPage, parseListQuery, readUpstreamPage, withPageSink } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import { SimplicateAdapter } from '../../../../../../src/verticals/crm/adapters/simplicate/index'

/**
 * Simplicate v2 pages by `limit` and `offset`, at most 100 records per page:
 * "You can't exceed 100 records per page on almost all endpoints. When the
 * results exceed the limit, you can iterate through the records by
 * incrementing the offset parameter."
 * (https://developer.simplicate.com/docs/api/v2/filtering). `metadata=count`
 * returns "the count of the entire collection, ignoring the limit & offset
 * parameters".
 *
 * The adapter read the offset from `params.offset`, which the router never
 * sets, so every caller page sent offset=0 and page 2 repeated page 1.
 */

const creds: Credentials = {
  accessToken: 'key',
  extra: { apiSecret: 'secret', subdomain: 'acme' },
}
const MAX = 100
let requests: URL[] = []

/** Fake upstream honouring only the documented limit, offset and metadata=count. */
function serve(path: string, n: number, prefix: string, opts: { count?: boolean } = {}) {
  const rows = Array.from({ length: n }, (_, i) => ({
    id: `${prefix}:${i + 1}`,
    label: `Row ${i + 1}`,
    position: i,
  }))
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string) => {
      const url = new URL(input)
      requests.push(url)
      if (url.pathname !== `/api/v2${path}`) return new Response('not found', { status: 404 })
      const limit = Math.min(Number(url.searchParams.get('limit') ?? MAX), MAX)
      const offset = Number(url.searchParams.get('offset') ?? 0)
      const wantsCount = (url.searchParams.get('metadata') ?? '').split(',').includes('count')
      const body: Record<string, unknown> = { data: rows.slice(offset, offset + limit) }
      if (wantsCount && opts.count !== false)
        body['metadata'] = { count: rows.length, limit, offset }
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }),
  )
}

beforeEach(() => {
  requests = []
})
afterEach(() => {
  vi.unstubAllGlobals()
})

type ListMethod = 'listContacts' | 'listCompanies' | 'listDeals'
const cases: [ListMethod, string, string][] = [
  ['listContacts', '/crm/person', 'person'],
  ['listCompanies', '/crm/organization', 'organization'],
  ['listDeals', '/sales/sales', 'sales'],
]

function call(method: ListMethod, params: QueryParams): Promise<{ id: string }[]> {
  return new SimplicateAdapter()[method](creds, params) as Promise<{ id: string }[]>
}

describe.each(cases)('simplicate %s paging', (method, path, prefix) => {
  it('serves 2L+1 rows across pages 1..3, each once, in order, with exact hasMore', async () => {
    const L = 3
    serve(path, 2 * L + 1, prefix)
    const seen: string[] = []
    const hasMore: (boolean | undefined)[] = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await call(method, params)
      seen.push(...rows.map((r) => r.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(Array.from({ length: 7 }, (_, i) => `${prefix}:${i + 1}`))
    expect(hasMore).toEqual([true, true, false])
  })

  it('sends the documented offset and limit on page 2', async () => {
    serve(path, 7, prefix)
    await call(method, withPageSink({ page: 2, limit: 3 }))
    expect(requests).toHaveLength(1)
    expect(requests[0]!.searchParams.get('offset')).toBe('3')
    expect(requests[0]!.searchParams.get('limit')).toBe('3')
  })

  it('clamps a limit above 100 and still serves every row', async () => {
    const N = 250
    serve(path, N, prefix)
    const seen: string[] = []
    for (let page = 1; page <= 10; page++) {
      const params = withPageSink({ page, limit: 250 })
      const rows = await call(method, params)
      seen.push(...rows.map((r) => r.id))
      expect(readUpstreamPage(params)?.pageSize).toBe(MAX)
      if (!readUpstreamPage(params)?.hasMore) break
    }
    for (const r of requests) expect(Number(r.searchParams.get('limit'))).toBeLessThanOrEqual(MAX)
    expect(seen).toEqual(Array.from({ length: N }, (_, i) => `${prefix}:${i + 1}`))
  })

  it('gives the right meta.hasMore through parseListQuery then listPage', async () => {
    serve(path, 7, prefix)
    const params = parseListQuery({ page: '2', limit: '3' })
    const out = listPage(await call(method, params), params, 'simplicate')
    expect(out.data.map((r) => r.id)).toEqual([`${prefix}:4`, `${prefix}:5`, `${prefix}:6`])
    expect(out.meta.hasMore).toBe(true)
    expect(out.meta.totalCount).toBe(7)

    const last = parseListQuery({ page: '3', limit: '3' })
    const outLast = listPage(await call(method, last), last, 'simplicate')
    expect(outLast.data.map((r) => r.id)).toEqual([`${prefix}:7`])
    expect(outLast.meta.hasMore).toBe(false)
  })

  it('reports hasMore=false when the collection ends exactly on a full page', async () => {
    serve(path, 6, prefix)
    const hasMore: (boolean | undefined)[] = []
    for (const page of [1, 2]) {
      const params = withPageSink({ page, limit: 3 })
      expect(await call(method, params)).toHaveLength(3)
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(hasMore).toEqual([true, false])
    expect(requests).toHaveLength(2)
  })

  it('without metadata.count, still reports the clamped pageSize and ends on a short page', async () => {
    serve(path, 150, prefix, { count: false })
    const p1 = withPageSink({ page: 1, limit: 250 })
    expect(await call(method, p1)).toHaveLength(MAX)
    expect(readUpstreamPage(p1)?.pageSize).toBe(MAX)
    expect(readUpstreamPage(p1)?.hasMore).toBeUndefined()
    const p2 = withPageSink({ page: 2, limit: 250 })
    const rows = await call(method, p2)
    expect(rows.map((r) => r.id)).toEqual(
      Array.from({ length: 50 }, (_, i) => `${prefix}:${MAX + i + 1}`),
    )
    expect(readUpstreamPage(p2)?.pageSize).toBe(MAX)
    expect(readUpstreamPage(p2)?.hasMore).toBe(false)
  })

  it('never sends a limit below 1', async () => {
    serve(path, 5, prefix)
    await call(method, withPageSink({ page: 1, limit: 0 }))
    expect(requests[0]!.searchParams.get('limit')).toBe('1')
  })
})

describe('simplicate listPipelines paging', () => {
  it('serves the one synthesised pipeline on page 1 and nothing after it', async () => {
    serve('/sales/salesprogress', 5, 'salesprogress')
    const adapter = new SimplicateAdapter()
    const p1 = withPageSink({ page: 1, limit: 1 })
    const first = await adapter.listPipelines(creds, p1)
    expect(first.map((p) => p.id)).toEqual(['default'])
    expect(readUpstreamPage(p1)?.hasMore).toBe(false)
    const p2 = withPageSink({ page: 2, limit: 1 })
    expect(await adapter.listPipelines(creds, p2)).toEqual([])
    expect(readUpstreamPage(p2)?.hasMore).toBe(false)
  })

  it('walks every phase page by the documented offset, past the 100-record ceiling', async () => {
    const N = 2 * MAX + 1
    serve('/sales/salesprogress', N, 'salesprogress')
    const [pipeline] = await new SimplicateAdapter().listPipelines(
      creds,
      withPageSink({ page: 1, limit: 10 }),
    )
    expect(pipeline!.stages?.map((s) => s.id)).toEqual(
      Array.from({ length: N }, (_, i) => `salesprogress:${i + 1}`),
    )
    expect(requests.map((r) => r.searchParams.get('offset'))).toEqual(['0', '100', '200'])
    for (const r of requests) expect(r.searchParams.get('limit')).toBe(String(MAX))
  })

  it('getPipeline shares the walk and sees every phase', async () => {
    const N = MAX + 5
    serve('/sales/salesprogress', N, 'salesprogress')
    const pipeline = await new SimplicateAdapter().getPipeline(creds, 'default')
    expect(pipeline.stages).toHaveLength(N)
  })

  it('gives the right meta.hasMore through parseListQuery then listPage', async () => {
    serve('/sales/salesprogress', 3, 'salesprogress')
    const adapter = new SimplicateAdapter()
    const params = parseListQuery({ page: '1', limit: '25' })
    const out = listPage(await adapter.listPipelines(creds, params), params, 'simplicate')
    expect(out.data.map((p) => p.id)).toEqual(['default'])
    expect(out.meta.hasMore).toBe(false)
  })
})

describe('simplicate sales-progress walk guards', () => {
  it('stops at metadata.count when the phases end exactly on a full page', async () => {
    serve('/sales/salesprogress', 2 * MAX, 'salesprogress')
    const pipeline = await new SimplicateAdapter().getPipeline(creds, 'default')
    expect(pipeline.stages).toHaveLength(2 * MAX)
    expect(requests.map((r) => r.searchParams.get('offset'))).toEqual(['0', '100'])
  })

  it('throws rather than truncate when full pages never end', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string) => {
        const url = new URL(input)
        requests.push(url)
        const offset = Number(url.searchParams.get('offset') ?? 0)
        const data = Array.from({ length: MAX }, (_, i) => ({
          id: `salesprogress:${offset + i + 1}`,
          label: 'x',
          position: offset + i,
        }))
        return new Response(JSON.stringify({ data }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }),
    )
    await expect(new SimplicateAdapter().getPipeline(creds, 'default')).rejects.toThrow(
      /refusing to truncate/,
    )
    expect(requests).toHaveLength(100)
  })
})
