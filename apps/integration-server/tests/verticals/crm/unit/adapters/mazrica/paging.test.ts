import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { listPage, parseListQuery, readUpstreamPage, withPageSink } from '@opensteward/shared'
import { MazricaAdapter } from '../../../../../../src/verticals/crm/adapters/mazrica/index'

/**
 * Mazrica's GET /deal_setting/deal_types is unpaginated: the embedded OpenAPI
 * spec at https://mazrica.com/developers/api/ declares no parameters for it
 * ("案件タイプのリスト取得" — retrieve the list of deal types), while every
 * paginated list on the same page declares `page`. The adapter used to return
 * the whole collection for every caller page, so page 2 repeated page 1. It now
 * fetches the collection once and pages it locally.
 */

const creds = { accessToken: 'key' }
let requests: URL[] = []

/** Fake upstream honouring only what the docs describe: no paging params, whole list. */
function serve(n: number) {
  const dealTypes = Array.from({ length: n }, (_, i) => ({ id: i + 1, name: `Type ${i + 1}` }))
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string) => {
      const url = new URL(input)
      requests.push(url)
      if (url.pathname !== '/v1/deal_setting/deal_types') {
        return new Response('not found', { status: 404 })
      }
      return new Response(JSON.stringify({ dealTypes }), {
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

describe('mazrica listPipelines paging', () => {
  it('serves 2L+1 rows across pages 1..3, each once, in order, with exact hasMore', async () => {
    const L = 3
    serve(2 * L + 1)
    const adapter = new MazricaAdapter()
    const seen: string[] = []
    const hasMore: (boolean | undefined)[] = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await adapter.listPipelines(creds, params)
      seen.push(...rows.map((r) => r.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(['1', '2', '3', '4', '5', '6', '7'])
    expect(hasMore).toEqual([true, true, false])
  })

  it('sends no undocumented paging params upstream on page 2', async () => {
    serve(7)
    await new MazricaAdapter().listPipelines(creds, withPageSink({ page: 2, limit: 3 }))
    expect(requests).toHaveLength(1)
    for (const key of ['limit', 'offset', 'page']) {
      expect(requests[0]!.searchParams.has(key)).toBe(false)
    }
  })

  it('serves every row when the limit exceeds any page size', async () => {
    serve(40)
    const params = withPageSink({ page: 1, limit: 1000 })
    const rows = await new MazricaAdapter().listPipelines(creds, params)
    expect(rows).toHaveLength(40)
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('serves a 1201-row collection whole across sync-sized pages', async () => {
    const N = 1201
    serve(N)
    const adapter = new MazricaAdapter()
    const seen: string[] = []
    const hasMore: (boolean | undefined)[] = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: 500 })
      const rows = await adapter.listPipelines(creds, params)
      seen.push(...rows.map((r) => r.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(Array.from({ length: N }, (_, i) => String(i + 1)))
    expect(hasMore).toEqual([true, true, false])
  })

  it('gives the right meta.hasMore through parseListQuery then listPage', async () => {
    serve(7)
    const params = parseListQuery({ page: '2', limit: '3' })
    const rows = await new MazricaAdapter().listPipelines(creds, params)
    const out = listPage(rows, params, 'mazrica')
    expect(out.data.map((r) => r.id)).toEqual(['4', '5', '6'])
    expect(out.meta.hasMore).toBe(true)
  })
})
