import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { listPage, parseListQuery, readUpstreamPage, withPageSink } from '@opensteward/shared'
import type { QueryParams } from '../../../../../../src/verticals/crm/adapter/interface'
import { OrttoAdapter } from '../../../../../../src/verticals/crm/adapters/ortto/index'

/**
 * Ortto lists people with POST /v1/person/get, paged by `limit` + `offset`
 * (https://help.ortto.com/a-258-retrieve-one-or-more-people-get):
 *
 *   "This value also represents the "page" length of people (for pagination
 *    purposes) ... This element can be used in conjunction with offset to
 *    retrieve subsequent pages of people records."
 *
 * `limit` is "integer between 1 to 500 (default value is 50)", and a value
 * "beyond the permitted maximum ... is assumed to be 50". The response carries
 * `has_more`, `next_offset` and `meta.total_matches`.
 *
 * The adapter used to read params.offset, which the router never sets, so
 * every page sent offset 0 and page 2 repeated page 1.
 */

const creds = { accessToken: 'key' }
const PATH = '/v1/person/get'
const UPSTREAM_DEFAULT = 50
const UPSTREAM_MAX = 500
let bodies: Array<Record<string, unknown>> = []

function row(i: number) {
  return { id: String(i + 1), fields: { 'str::first': { v: `p${i + 1}` } } }
}

/** Honours only the documented body members `limit` and `offset`. */
function serve(n: number) {
  const rows = Array.from({ length: n }, (_, i) => row(i))
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init: RequestInit) => {
      const url = new URL(input)
      if (url.pathname !== PATH || init.method !== 'POST') {
        return new Response('not found', { status: 404 })
      }
      const body = JSON.parse(String(init.body)) as Record<string, unknown>
      bodies.push(body)
      const asked = body['limit']
      const limit =
        typeof asked === 'number' && Number.isInteger(asked) && asked >= 1 && asked <= UPSTREAM_MAX
          ? asked
          : UPSTREAM_DEFAULT
      const offset = typeof body['offset'] === 'number' ? body['offset'] : 0
      const page = rows.slice(offset, offset + limit)
      const hasMore = offset + page.length < rows.length
      return new Response(
        JSON.stringify({
          contacts: page,
          meta: { total_contacts: rows.length, total_matches: rows.length },
          offset,
          next_offset: offset + page.length,
          has_more: hasMore,
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    }),
  )
}

function list(params: QueryParams) {
  return new OrttoAdapter().listContacts(creds, params)
}

beforeEach(() => {
  bodies = []
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('ortto listContacts paging', () => {
  it('serves 2L+1 contacts across pages 1..3, each once, in order, with exact hasMore', async () => {
    const L = 3
    serve(2 * L + 1)
    const seen: string[] = []
    const hasMore: (boolean | undefined)[] = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      seen.push(...(await list(params)).map((r) => r.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(['1', '2', '3', '4', '5', '6', '7'])
    expect(hasMore).toEqual([true, true, false])
  })

  it('sends offset = (page - 1) * limit and limit on page 2', async () => {
    serve(7)
    await list(withPageSink({ page: 2, limit: 3 }))
    expect(bodies.at(-1)).toMatchObject({ limit: 3, offset: 3 })
  })

  it('declares the documented maximum of 500', () => {
    expect(new OrttoAdapter().capabilities.maxPageSize).toBe(UPSTREAM_MAX)
  })

  it('clamps a limit above 500 (which Ortto would read as 50) and still serves every row', async () => {
    const N = 2 * UPSTREAM_MAX + 5
    serve(N)
    const seen: string[] = []
    for (let page = 1; page <= 10; page++) {
      const params = withPageSink({ page, limit: 800 })
      seen.push(...(await list(params)).map((r) => r.id))
      expect(bodies.at(-1)).toMatchObject({
        limit: UPSTREAM_MAX,
        offset: (page - 1) * UPSTREAM_MAX,
      })
      if (readUpstreamPage(params)?.hasMore === false) break
    }
    expect(seen).toEqual(Array.from({ length: N }, (_, i) => String(i + 1)))
  })

  it('reports the clamped page size for a raw limit of 800', async () => {
    serve(2 * UPSTREAM_MAX + 5)
    const params = withPageSink({ page: 1, limit: 800 })
    const rows = await list(params)
    expect(readUpstreamPage(params)?.pageSize).toBe(UPSTREAM_MAX)
    expect(rows).toHaveLength(UPSTREAM_MAX)
  })

  it('gives the right meta.hasMore through parseListQuery then listPage', async () => {
    serve(7)
    const adapter = new OrttoAdapter()
    const params = parseListQuery({ page: '2', limit: '3' }, adapter)
    const out = listPage(await adapter.listContacts(creds, params), params, 'ortto')
    expect(out.data.map((r) => r.id)).toEqual(['4', '5', '6'])
    expect(out.meta.hasMore).toBe(true)
    expect(out.meta.totalCount).toBe(7)

    const last = parseListQuery({ page: '3', limit: '3' }, adapter)
    const tail = listPage(await adapter.listContacts(creds, last), last, 'ortto')
    expect(tail.data.map((r) => r.id)).toEqual(['7'])
    expect(tail.meta.hasMore).toBe(false)
  })
})
