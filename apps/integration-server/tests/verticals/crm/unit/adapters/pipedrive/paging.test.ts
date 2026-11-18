import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { listPage, parseListQuery, readUpstreamPage, withPageSink } from '@opensteward/shared'
import type { QueryParams } from '../../../../../../src/verticals/crm/adapter/interface'
import { PipedriveAdapter } from '../../../../../../src/verticals/crm/adapters/pipedrive/index'

/**
 * Pipedrive v1 /notes pages by offset
 * (https://pipedrive.readme.io/docs/core-api-concepts-pagination):
 *
 *   "With the rest of our GET endpoints, we offer offset-based pagination. The
 *    parameters that control this type of pagination are start and limit,
 *    indicating the desired offset and the number of items to be returned per
 *    page."
 *   "The additional_data.pagination object will contain the given start and
 *    limit values, as well as the more_items_in_collection flag, indicating
 *    whether more items can be fetched after the current batch."
 *   "The maximum limit value is 500."
 *
 * The adapter read `start` from params.start/params.cursor and never from
 * `page`, so every caller page sent no start and page 2 repeated page 1.
 *
 * Only listNotes is covered here: notes have no v2 endpoint. The other lists
 * moved to API v2 cursor paging and are covered in v2-lists.test.ts.
 */

const creds = { accessToken: 'tok' }
const MAX = 500
const DEFAULT = 100
let requests: URL[] = []

/** Honours only `start` (default 0) and `limit` (default 100, max 500). */
function serveNotes(n: number) {
  const rows = Array.from({ length: n }, (_, i) => ({ id: i + 1, content: `n${i + 1}` }))
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string) => {
      const url = new URL(input)
      requests.push(url)
      if (url.pathname !== '/v1/notes') return new Response('not found', { status: 404 })
      const rawLimit = url.searchParams.get('limit')
      const limit = rawLimit === null ? DEFAULT : Math.min(Number(rawLimit), MAX)
      const start = Number(url.searchParams.get('start') ?? 0)
      const page = rows.slice(start, start + limit)
      const more = start + page.length < rows.length
      const body = {
        success: true,
        data: page.length ? page : null,
        additional_data: {
          pagination: {
            start,
            limit,
            more_items_in_collection: more,
            ...(more ? { next_start: start + page.length } : {}),
          },
        },
      }
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }),
  )
}

function listNotes(params: QueryParams) {
  return new PipedriveAdapter().listNotes(creds, params)
}

beforeEach(() => {
  requests = []
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('pipedrive listNotes paging', () => {
  it('serves 2L+1 rows across pages 1..3, each once, in order, with exact hasMore', async () => {
    const L = 3
    serveNotes(2 * L + 1)
    const seen: string[] = []
    const hasMore: (boolean | undefined)[] = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await listNotes(params)
      seen.push(...rows.map((r) => r.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(['1', '2', '3', '4', '5', '6', '7'])
    expect(hasMore).toEqual([true, true, false])
  })

  it('sends start = (page - 1) * limit on page 2', async () => {
    serveNotes(7)
    await listNotes(withPageSink({ page: 2, limit: 3 }))
    const req = requests.at(-1)!
    expect(req.searchParams.get('start')).toBe('3')
    expect(req.searchParams.get('limit')).toBe('3')
  })

  it('reports hasMore false on a full last page when rows are an exact multiple of limit', async () => {
    serveNotes(6)
    const params = withPageSink({ page: 2, limit: 3 })
    const rows = await listNotes(params)
    expect(rows.map((r) => r.id)).toEqual(['4', '5', '6'])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('clamps a limit above 500 and still serves every row', async () => {
    const N = 2 * MAX + 5
    serveNotes(N)
    const seen: string[] = []
    for (let page = 1; page <= 10; page++) {
      const params = withPageSink({ page, limit: 800 })
      const rows = await listNotes(params)
      seen.push(...rows.map((r) => r.id))
      expect(Number(requests.at(-1)!.searchParams.get('limit'))).toBe(MAX)
      expect(readUpstreamPage(params)?.pageSize).toBe(MAX)
      if (readUpstreamPage(params)?.hasMore === false) break
    }
    expect(seen).toEqual(Array.from({ length: N }, (_, i) => String(i + 1)))
  })

  it('gives the right meta.hasMore through parseListQuery then listPage', async () => {
    serveNotes(7)
    const params = parseListQuery({ page: '2', limit: '3' })
    const out = listPage(await listNotes(params), params, 'pipedrive')
    expect(out.data.map((r) => r.id)).toEqual(['4', '5', '6'])
    expect(out.meta.hasMore).toBe(true)

    const last = parseListQuery({ page: '3', limit: '3' })
    const tail = listPage(await listNotes(last), last, 'pipedrive')
    expect(tail.data.map((r) => r.id)).toEqual(['7'])
    expect(tail.meta.hasMore).toBe(false)
  })
})

describe('pipedrive listNotes defaults and missing pagination', () => {
  it('sends the documented default limit of 100 when the caller gives none', async () => {
    serveNotes(250)
    const params = withPageSink({ page: 2 })
    const rows = await listNotes(params)
    const req = requests.at(-1)!
    expect(req.searchParams.get('start')).toBe('100')
    expect(req.searchParams.get('limit')).toBe('100')
    expect(rows.map((r) => r.id)[0]).toBe('101')
    expect(readUpstreamPage(params)?.pageSize).toBe(100)
  })

  it('does not report the end of the list when the response has no pagination object', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ success: true, data: [{ id: 1, content: 'a' }] }), {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }),
      ),
    )
    const params = withPageSink({ page: 1, limit: 1 })
    await listNotes(params)
    expect(readUpstreamPage(params)?.hasMore).toBeUndefined()
  })
})
