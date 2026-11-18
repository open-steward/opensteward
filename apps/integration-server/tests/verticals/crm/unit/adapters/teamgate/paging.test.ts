import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { listPage, parseListQuery, readUpstreamPage, withPageSink } from '@opensteward/shared'
import type { QueryParams } from '../../../../../../src/verticals/crm/adapter/interface'
import { TeamgateAdapter } from '../../../../../../src/verticals/crm/adapters/teamgate/index'
import { DEFAULT_PAGE_SIZE as ADAPTER_DEFAULT } from '../../../../../../src/verticals/crm/adapters/teamgate/constants'

/**
 * Teamgate v4 collections page by `limit` + `offset`
 * (https://developers.teamgate.com/api/collections/4195728/RW87rW37):
 *
 *   "To paginate, use the keywords limit and offset."
 *   "The count property in the response states the actual number of entities
 *    that answer the filter (including the ones that are brought by the
 *    specific page)."
 *
 * The envelope is {success, count, nextPage, data}; nextPage is a URL carrying
 * offset=N, and null (or false on some collections) on the last page. There is
 * no `page` parameter anywhere in the collection, and no documented maximum.
 *
 * listPipelines used to drop its params entirely, so every caller page sent
 * limit=25&page=1 and page 2 repeated page 1.
 */

const creds = { accessToken: 'tok', refreshToken: 'app' }
const UPSTREAM_DEFAULT = 15
let requests: URL[] = []

/** Honours only `limit` and `offset`; answers count and nextPage. */
function serve(n: number, opts: { lastNextPage?: null | false; noCount?: boolean } = {}) {
  const rows = Array.from({ length: n }, (_, i) => ({ id: i + 1, name: `p${i + 1}` }))
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string) => {
      const url = new URL(input)
      requests.push(url)
      if (url.pathname !== '/v4/pipelines') return new Response('not found', { status: 404 })
      const rawLimit = url.searchParams.get('limit')
      const limit = rawLimit === null ? UPSTREAM_DEFAULT : Number(rawLimit)
      const offset = Number(url.searchParams.get('offset') ?? 0)
      const data = rows.slice(offset, offset + limit)
      const next = offset + limit
      const body: Record<string, unknown> = {
        success: true,
        nextPage:
          next < rows.length
            ? `https://api.teamgate.com/v4/pipelines?limit=${limit}&offset=${next}`
            : 'lastNextPage' in opts
              ? opts.lastNextPage
              : null,
        data,
      }
      if (!opts.noCount) body.count = rows.length
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }),
  )
}

function call(params: QueryParams) {
  return new TeamgateAdapter().listPipelines(creds, params)
}

beforeEach(() => {
  requests = []
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('teamgate listPipelines paging', () => {
  it('serves 2L+1 rows across pages 1..3, each once, in order, with exact hasMore', async () => {
    const L = 3
    serve(2 * L + 1)
    const seen: string[] = []
    const hasMore: (boolean | undefined)[] = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await call(params)
      seen.push(...rows.map((r) => r.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(['1', '2', '3', '4', '5', '6', '7'])
    expect(hasMore).toEqual([true, true, false])
  })

  it('sends offset = (page - 1) * limit on page 2, and no page parameter', async () => {
    serve(7)
    await call(withPageSink({ page: 2, limit: 3 }))
    const req = requests.at(-1)!
    expect(req.searchParams.get('offset')).toBe('3')
    expect(req.searchParams.get('limit')).toBe('3')
    expect(req.searchParams.has('page')).toBe(false)
  })

  it('sends the adapter default page size when no limit is given', async () => {
    serve(7)
    await call(withPageSink({ page: 1 } as QueryParams))
    const req = requests.at(-1)!
    expect(req.searchParams.get('limit')).toBe(String(ADAPTER_DEFAULT))
    expect(req.searchParams.get('offset')).toBe('0')
  })

  it('reports hasMore false on a full last page when rows are an exact multiple of limit', async () => {
    serve(6)
    const params = withPageSink({ page: 2, limit: 3 })
    const rows = await call(params)
    expect(rows.map((r) => r.id)).toEqual(['4', '5', '6'])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
    expect(readUpstreamPage(params)?.totalCount).toBe(6)
  })

  it('reads nextPage: false as the end when count is absent', async () => {
    serve(4, { lastNextPage: false, noCount: true })
    const first = withPageSink({ page: 1, limit: 3 })
    await call(first)
    expect(readUpstreamPage(first)?.hasMore).toBe(true)
    const last = withPageSink({ page: 2, limit: 3 })
    await call(last)
    expect(readUpstreamPage(last)?.hasMore).toBe(false)
  })

  it('serves every row at a large limit (no documented maximum, so none is declared)', async () => {
    const N = 1205
    serve(N)
    const seen: string[] = []
    for (let page = 1; page <= 10; page++) {
      const params = withPageSink({ page, limit: 500 })
      seen.push(...(await call(params)).map((r) => r.id))
      expect(requests.at(-1)!.searchParams.get('limit')).toBe('500')
      if (readUpstreamPage(params)?.hasMore === false) break
    }
    expect(seen).toEqual(Array.from({ length: N }, (_, i) => String(i + 1)))
  })

  it('gives the right meta.hasMore through parseListQuery then listPage', async () => {
    serve(7)
    const params = parseListQuery({ page: '2', limit: '3' })
    const out = listPage(await call(params), params, 'teamgate')
    expect(out.data.map((r) => r.id)).toEqual(['4', '5', '6'])
    expect(out.meta.hasMore).toBe(true)

    const last = parseListQuery({ page: '3', limit: '3' })
    const tail = listPage(await call(last), last, 'teamgate')
    expect(tail.data.map((r) => r.id)).toEqual(['7'])
    expect(tail.meta.hasMore).toBe(false)
  })

  describe('next-page signal edge cases', () => {
    /** Answers every request with exactly `body`. */
    function reply(body: unknown) {
      vi.stubGlobal(
        'fetch',
        vi.fn(async (input: string) => {
          requests.push(new URL(input))
          return new Response(JSON.stringify(body), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          })
        }),
      )
    }
    const rows = [
      { id: 1, name: 'p1' },
      { id: 2, name: 'p2' },
      { id: 3, name: 'p3' },
    ]

    it('leaves hasMore unknown when neither count nor nextPage is present', async () => {
      reply({ success: true, data: rows })
      const params = withPageSink({ page: 1, limit: 3 })
      await call(params)
      expect(readUpstreamPage(params)?.hasMore).toBeUndefined()
    })

    it('reads nextPage: null as the end when count is absent', async () => {
      reply({ success: true, nextPage: null, data: rows })
      const params = withPageSink({ page: 1, limit: 3 })
      await call(params)
      expect(readUpstreamPage(params)?.hasMore).toBe(false)
    })

    it('trusts count over a contradicting nextPage', async () => {
      // count says 10 rows exist; nextPage (wrongly) says this is the end.
      reply({ success: true, count: 10, nextPage: null, data: rows })
      const more = withPageSink({ page: 1, limit: 3 })
      await call(more)
      expect(readUpstreamPage(more)?.hasMore).toBe(true)
      expect(readUpstreamPage(more)?.totalCount).toBe(10)

      // count says these are the last rows; nextPage (wrongly) points on.
      reply({
        success: true,
        count: 3,
        nextPage: 'https://api.teamgate.com/v4/pipelines?offset=3',
        data: rows,
      })
      const end = withPageSink({ page: 1, limit: 3 })
      await call(end)
      expect(readUpstreamPage(end)?.hasMore).toBe(false)
    })

    it('uses count when nextPage is missing', async () => {
      reply({ success: true, count: 7, data: rows })
      const params = withPageSink({ page: 2, limit: 3 })
      await call(params)
      expect(readUpstreamPage(params)?.hasMore).toBe(true)
    })

    it('serves the rows of a bare-array response', async () => {
      reply(rows)
      const params = withPageSink({ page: 1, limit: 3 })
      const out = await call(params)
      expect(out.map((r) => r.id)).toEqual(['1', '2', '3'])
      expect(readUpstreamPage(params)?.hasMore).toBeUndefined()
    })
  })
})
