import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  _resetCursorPager,
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
} from '@opensteward/shared'
import type { QueryParams } from '../../../../../../src/verticals/crm/adapter/interface'
import { VendastaAdapter } from '../../../../../../src/verticals/crm/adapters/vendasta/index'

/**
 * Vendasta CRM (first-party spec:
 * https://raw.githubusercontent.com/vendasta/api-gateway-docs/master/openapi/openapi_external_docs/crm.openapi.json)
 *
 * contact/company/opportunity list — v1ListCrmObjectsRequest.pagingOptions:
 * cursor — "Optional. An opaque token from a previous response's next_cursor
 * to retrieve the next page of results. Omit or leave empty for the first
 * page." pageSize — "Optional. The maximum number of items to return per
 * page." (no maximum documented). The response carries
 * pagingMetadata { hasMore, nextCursor, totalResults (0 when unsupported) }.
 *
 * pipeline/list — v1ListPipelinesRequest has no paging fields and
 * v1ListPipelinesResponse returns only `pipelines`: the whole collection.
 */

const creds = { accessToken: 'tok', refreshToken: 'ref', extra: { namespace: 'AG-1' } }
let bodies: Array<Record<string, unknown>> = []
let urls: string[] = []

type Method = 'listContacts' | 'listCompanies' | 'listDeals'
const PATHS: Record<Method, string> = {
  listContacts: '/v1/crm/contact/list',
  listCompanies: '/v1/crm/company/list',
  listDeals: '/v1/crm/opportunity/list',
}

function json(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

/**
 * Honours only the documented `pagingOptions.cursor` and
 * `pagingOptions.pageSize`. Cursors are opaque: the fake mints them so an
 * adapter that computes one instead of carrying `nextCursor` forward fails.
 */
function serve(n: number, pipelines = 0, opts: { cursorOnLastPage?: boolean } = {}) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init: { body: string }) => {
      const body = JSON.parse(init.body) as Record<string, unknown>
      bodies.push(body)
      urls.push(String(input))
      if (String(input).endsWith('/v1/crm/pipeline/list')) {
        // v1ListPipelinesRequest requires listOptions {namespace}; a bare
        // top-level namespace is a malformed request.
        const lo = body['listOptions'] as { namespace?: string } | undefined
        if (!lo?.namespace || 'namespace' in body) {
          return new Response(JSON.stringify({ message: 'listOptions is required' }), {
            status: 400,
            headers: { 'content-type': 'application/json' },
          })
        }
        return json({
          pipelines: Array.from({ length: pipelines }, (_, i) => ({
            pipelineId: `P-${i + 1}`,
            name: `Pipeline ${i + 1}`,
            stages: [],
          })),
        })
      }
      const po = (body['pagingOptions'] ?? {}) as { cursor?: string; pageSize?: string }
      const start = po.cursor ? Number(Buffer.from(po.cursor, 'base64').toString()) : 0
      const size = Number(po.pageSize ?? 25)
      const all = Array.from({ length: n }, (_, i) => ({ crmObjectId: `ID-${i + 1}`, fields: [] }))
      const crmObjects = all.slice(start, start + size)
      const end = start + crmObjects.length
      const hasMore = end < n
      return json({
        crmObjects,
        pagingMetadata: {
          hasMore,
          // hasMore is the documented stop signal; some upstreams still send
          // a non-empty nextCursor on the last page.
          ...(hasMore || opts.cursorOnLastPage
            ? { nextCursor: Buffer.from(String(end)).toString('base64') }
            : {}),
          totalResults: '0',
        },
      })
    }),
  )
}

function call(method: Method | 'listPipelines', params: QueryParams, c: typeof creds = creds) {
  const adapter = new VendastaAdapter({ baseUrl: 'https://example.test' })
  return (
    adapter[method] as (c: typeof creds, p: QueryParams) => Promise<Array<{ id: string }>>
  ).call(adapter, c, params)
}

const ids = (n: number) => Array.from({ length: n }, (_, i) => `ID-${i + 1}`)

beforeEach(() => {
  bodies = []
  urls = []
  _resetCursorPager()
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe.each<Method>(['listContacts', 'listCompanies', 'listDeals'])(
  'vendasta %s paging',
  (method) => {
    it('serves 2L+1 rows across pages 1..3, each once, in order, with exact hasMore', async () => {
      const L = 3
      serve(2 * L + 1)
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

    it('sends pagingOptions.cursor from page 1 nextCursor on page 2', async () => {
      serve(7)
      await call(method, withPageSink({ page: 1, limit: 3 }))
      await call(method, withPageSink({ page: 2, limit: 3 }))
      const last = bodies.at(-1)!
      expect(last['namespace']).toBe('AG-1')
      expect(last['pagingOptions']).toEqual({
        pageSize: '3',
        cursor: Buffer.from('3').toString('base64'),
      })
    })

    it('reaches page 2 on a cold cache by walking from page 1', async () => {
      serve(7)
      const rows = await call(method, withPageSink({ page: 2, limit: 3 }))
      expect(rows.map((r) => r.id)).toEqual(['ID-4', 'ID-5', 'ID-6'])
      expect(urls.every((u) => u.endsWith(PATHS[method]))).toBe(true)
      expect(bodies.map((b) => (b['pagingOptions'] as { cursor?: string }).cursor)).toEqual([
        undefined,
        Buffer.from('3').toString('base64'),
      ])
    })

    it('serves every row at a large limit (no documented maximum to clamp to)', async () => {
      const N = 1205
      serve(N)
      const seen: string[] = []
      for (let page = 1; page <= 5; page++) {
        const params = withPageSink({ page, limit: 500 })
        const rows = await call(method, params)
        seen.push(...rows.map((r) => r.id))
        if (readUpstreamPage(params)?.hasMore === false) break
      }
      expect(seen).toEqual(ids(N))
    })

    it('stops on hasMore:false even when the last page carries a nextCursor', async () => {
      serve(7, 0, { cursorOnLastPage: true })
      for (const page of [1, 2]) await call(method, withPageSink({ page, limit: 3 }))
      const params = withPageSink({ page: 3, limit: 3 })
      const rows = await call(method, params)
      expect(rows.map((r) => r.id)).toEqual(['ID-7'])
      expect(readUpstreamPage(params)?.hasMore).toBe(false)
    })

    it('does not share cursors between connections (warm cache)', async () => {
      serve(7)
      const other = { accessToken: 'tok-2', refreshToken: 'ref-2', extra: { namespace: 'AG-1' } }
      await call(method, withPageSink({ page: 1, limit: 3 }))
      bodies = []
      const rows = await call(method, withPageSink({ page: 2, limit: 3 }), other)
      expect(rows.map((r) => r.id)).toEqual(['ID-4', 'ID-5', 'ID-6'])
      // The second connection walks from its own page 1.
      expect(bodies.map((b) => (b['pagingOptions'] as { cursor?: string }).cursor)).toEqual([
        undefined,
        Buffer.from('3').toString('base64'),
      ])
    })

    it('does not share cursors between page sizes (warm cache)', async () => {
      serve(20)
      await call(method, withPageSink({ page: 1, limit: 3 }))
      bodies = []
      const rows = await call(method, withPageSink({ page: 2, limit: 5 }))
      expect(rows.map((r) => r.id)).toEqual(['ID-6', 'ID-7', 'ID-8', 'ID-9', 'ID-10'])
      expect(bodies.map((b) => (b['pagingOptions'] as { cursor?: string }).cursor)).toEqual([
        undefined,
        Buffer.from('5').toString('base64'),
      ])
    })

    it('does not share cursors between collections (warm cache)', async () => {
      serve(7)
      const other: Method = method === 'listContacts' ? 'listCompanies' : 'listContacts'
      await call(other, withPageSink({ page: 1, limit: 3 }))
      bodies = []
      urls = []
      await call(method, withPageSink({ page: 2, limit: 3 }))
      expect(urls).toEqual([
        `https://example.test${PATHS[method]}`,
        `https://example.test${PATHS[method]}`,
      ])
      expect((bodies[0]!['pagingOptions'] as { cursor?: string }).cursor).toBeUndefined()
    })

    it('gives the right meta.hasMore through parseListQuery then listPage', async () => {
      serve(7)
      const p2 = parseListQuery({ page: '2', limit: '3' })
      const out = listPage(await call(method, p2), p2, 'vendasta')
      expect(out.data.map((r) => r.id)).toEqual(['ID-4', 'ID-5', 'ID-6'])
      expect(out.meta.hasMore).toBe(true)

      const p3 = parseListQuery({ page: '3', limit: '3' })
      const tail = listPage(await call(method, p3), p3, 'vendasta')
      expect(tail.data.map((r) => r.id)).toEqual(['ID-7'])
      expect(tail.meta.hasMore).toBe(false)
    })
  },
)

describe('vendasta listPipelines paging (whole collection, sliced locally)', () => {
  it('sends the documented listOptions-wrapped body', async () => {
    serve(0, 2)
    await call('listPipelines', withPageSink({ page: 1, limit: 3 }))
    expect(bodies).toEqual([{ listOptions: { namespace: 'AG-1' } }])
  })

  it('serves 2L+1 pipelines across pages 1..3, each once, in order, with exact hasMore', async () => {
    const L = 3
    serve(0, 2 * L + 1)
    const seen: string[] = []
    const hasMore: (boolean | undefined)[] = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await call('listPipelines', params)
      seen.push(...rows.map((r) => r.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(Array.from({ length: 7 }, (_, i) => `P-${i + 1}`))
    expect(hasMore).toEqual([true, true, false])
  })

  it('serves every pipeline at a large limit', async () => {
    serve(0, 12)
    const params = withPageSink({ page: 1, limit: 500 })
    const rows = await call('listPipelines', params)
    expect(rows).toHaveLength(12)
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('gives the right meta.hasMore through parseListQuery then listPage', async () => {
    serve(0, 7)
    const p2 = parseListQuery({ page: '2', limit: '3' })
    const out = listPage(await call('listPipelines', p2), p2, 'vendasta')
    expect(out.data.map((r) => r.id)).toEqual(['P-4', 'P-5', 'P-6'])
    expect(out.meta.hasMore).toBe(true)

    const p3 = parseListQuery({ page: '3', limit: '3' })
    const tail = listPage(await call('listPipelines', p3), p3, 'vendasta')
    expect(tail.data.map((r) => r.id)).toEqual(['P-7'])
    expect(tail.meta.hasMore).toBe(false)
  })
})

describe('vendasta capabilities', () => {
  it('declares no maxPageSize (the docs give none, and activities/notes do not page)', () => {
    const a = new VendastaAdapter() as { capabilities?: { maxPageSize?: number } }
    expect(a.capabilities?.maxPageSize).toBeUndefined()
  })
})
