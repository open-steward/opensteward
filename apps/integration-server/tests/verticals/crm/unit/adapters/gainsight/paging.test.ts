import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { listPage, parseListQuery, readUpstreamPage, withPageSink } from '@opensteward/shared'
import type { QueryParams } from '../../../../../../src/verticals/crm/adapter/interface'
import { GainsightAdapter } from '../../../../../../src/verticals/crm/adapters/gainsight/index'

/**
 * Gainsight's Read API (POST /v1/data/objects/query/{object}) pages by a
 * `limit` + 0-based `offset` in the JSON body
 * (https://support.gainsight.com/gainsight_nxt/API_and_Developer_Docs/Company_and_Relationship_API/Company_API_Documentation):
 *
 *   "Read API fetches a maximum of 5000 records from one API call. ... "limit": 100, ... "offset": 0"
 *
 * The Timeline read (activity_timeline) takes the same body
 * (https://support.gainsight.com/gainsight_nxt/API_and_Developer_Docs/Timeline_API/Timeline_APIs).
 * Neither response carries a total or has-more flag, so a full page is the only
 * sign more rows exist. The adapter used to read a never-set `params.offset`,
 * so page 2 repeated page 1.
 */

const creds = { accessToken: 'key', extra: { domain: 'acme' } }
const MAX = 5000

type Method = 'listCompanies' | 'listNotes'

const CASES: Array<{ method: Method; url: string; wrap: (rows: unknown[]) => unknown }> = [
  {
    method: 'listCompanies',
    url: 'https://companyapi.gainsightcloud.com/v1/data/objects/query/Company',
    wrap: (rows) => ({ result: true, data: rows }),
  },
  {
    method: 'listNotes',
    url: 'https://acme.gainsightcloud.com/v1/data/objects/query/activity_timeline',
    wrap: (rows) => ({ result: true, data: { records: rows } }),
  },
]

let bodies: Array<Record<string, unknown>> = []

/** Honours only the documented body `limit` (capped at 5000) and `offset`. */
function serve(url: string, n: number, wrap: (rows: unknown[]) => unknown) {
  const rows = Array.from({ length: n }, (_, i) => ({
    Gsid: String(i + 1),
    Name: `c${i + 1}`,
    Subject: `s${i + 1}`,
    Notes: `n${i + 1}`,
    CreatedDate: '2026-01-01T00:00:00Z',
    ModifiedDate: '2026-01-01T00:00:00Z',
  }))
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init: RequestInit) => {
      if (input !== url || init.method !== 'POST') return new Response('not found', { status: 404 })
      const body = JSON.parse(String(init.body)) as Record<string, unknown>
      bodies.push(body)
      const limit = Math.min(Number(body.limit ?? 100), MAX)
      const offset = Number(body.offset ?? 0)
      return new Response(JSON.stringify(wrap(rows.slice(offset, offset + limit))), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }),
  )
}

function call(method: Method, params: QueryParams) {
  const adapter = new GainsightAdapter()
  return (
    adapter[method] as (c: typeof creds, p: QueryParams) => Promise<Array<{ id: string }>>
  ).call(adapter, creds, params)
}

beforeEach(() => {
  bodies = []
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe.each(CASES)('gainsight $method paging', ({ method, url, wrap }) => {
  it('serves 2L+1 rows across pages 1..3, each once, in order, with exact hasMore', async () => {
    const L = 3
    serve(url, 2 * L + 1, wrap)
    const seen: string[] = []
    const hasMore: (boolean | undefined)[] = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      seen.push(...(await call(method, params)).map((r) => r.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(['1', '2', '3', '4', '5', '6', '7'])
    expect(hasMore).toEqual([true, true, false])
  })

  it('sends offset = (page - 1) * limit and limit on page 2', async () => {
    serve(url, 7, wrap)
    await call(method, withPageSink({ page: 2, limit: 3 }))
    expect(bodies.at(-1)).toMatchObject({ offset: 3, limit: 3 })
  })

  it('clamps a limit above 5000 and still serves every row', async () => {
    const N = 2 * MAX + 5
    serve(url, N, wrap)
    const seen: string[] = []
    for (let page = 1; page <= 5; page++) {
      const params = withPageSink({ page, limit: 8000 })
      seen.push(...(await call(method, params)).map((r) => r.id))
      const sent = bodies.at(-1)!
      expect(sent.limit).toBe(MAX)
      expect(sent.offset).toBe((page - 1) * MAX)
      expect(readUpstreamPage(params)?.pageSize).toBe(MAX)
      if (readUpstreamPage(params)?.hasMore === false) break
    }
    expect(seen).toEqual(Array.from({ length: N }, (_, i) => String(i + 1)))
  })

  it('gives the right meta.hasMore through parseListQuery then listPage', async () => {
    serve(url, 7, wrap)
    const params = parseListQuery({ page: '2', limit: '3' })
    const out = listPage(await call(method, params), params, 'gainsight')
    expect(out.data.map((r) => r.id)).toEqual(['4', '5', '6'])
    expect(out.meta.hasMore).toBe(true)

    const last = parseListQuery({ page: '3', limit: '3' })
    const tail = listPage(await call(method, last), last, 'gainsight')
    expect(tail.data.map((r) => r.id)).toEqual(['7'])
    expect(tail.meta.hasMore).toBe(false)
  })

  it('reports hasMore false on a tail one row short of a full page (2L-1 rows)', async () => {
    const L = 4
    serve(url, 2 * L - 1, wrap)
    const seen: string[] = []
    const hasMore: (boolean | undefined)[] = []
    for (const page of [1, 2]) {
      const params = withPageSink({ page, limit: L })
      seen.push(...(await call(method, params)).map((r) => r.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(['1', '2', '3', '4', '5', '6', '7'])
    expect(hasMore).toEqual([true, false])
  })

  it('sends the default page size of 25 when no limit is given', async () => {
    serve(url, 60, wrap)
    const params = withPageSink({ page: 2 })
    const rows = await call(method, params)
    expect(bodies.at(-1)).toMatchObject({ offset: 25, limit: 25 })
    expect(rows).toHaveLength(25)
    expect(readUpstreamPage(params)).toMatchObject({ hasMore: true, pageSize: 25 })
  })
})

describe('gainsight listNotes ordering', () => {
  it('sends a stable CreatedDate desc order so offset pages do not shift', async () => {
    serve(CASES[1]!.url, 3, CASES[1]!.wrap)
    await call('listNotes', withPageSink({ page: 1, limit: 3 }))
    expect(bodies.at(-1)).toMatchObject({ orderBy: { CreatedDate: 'desc' } })
  })
})
