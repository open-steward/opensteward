import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  effectivePageSize,
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
} from '@opensteward/shared'
import { KlentyAdapter } from '../../../../../../src/verticals/crm/adapters/klenty/index'

/**
 * Klenty GET /prospects pages by `start` (a 1-based page index scaled by
 * `limit`) and caps `limit` at 1000: "if you have a list with 100 prospects and
 * you give start=2 & limit=10, it fetches your record from 11 to 20. You can
 * fetch up to 1000 records in a request."
 * (https://support.klenty.com/en/articles/8193357-klenty-s-get-api-s)
 * The response is a bare array with no next signal. The adapter used to send
 * start=0 on every page, so caller page 2 repeated page 1.
 */

const creds = { accessToken: 'key', extra: { username: 'me@example.com' } }
const MAX = 1000
let requests: URL[] = []

/** Fake upstream honouring only the documented `start` and `limit` (max 1000). */
function serveProspects(n: number) {
  const rows = Array.from({ length: n }, (_, i) => ({ id: String(i + 1), Email: `p${i + 1}@x.io` }))
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string) => {
      const url = new URL(input)
      requests.push(url)
      if (url.pathname !== '/apis/v1/user/me%40example.com/prospects') {
        return new Response('not found', { status: 404 })
      }
      const limit = Number(url.searchParams.get('limit') ?? 100)
      const start = Number(url.searchParams.get('start') ?? 1)
      if (!(limit >= 1 && limit <= MAX) || !(start >= 1)) {
        return new Response('bad request', { status: 400 })
      }
      const from = (start - 1) * limit
      return new Response(JSON.stringify(rows.slice(from, from + limit)), {
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

describe('klenty listContacts paging', () => {
  it('declares the documented maximum page size', () => {
    expect(new KlentyAdapter().capabilities.maxPageSize).toBe(MAX)
  })

  it('serves 2L+1 prospects across pages 1..3, each once, in order, with exact hasMore', async () => {
    const L = 3
    serveProspects(2 * L + 1)
    const adapter = new KlentyAdapter()
    const seen: string[] = []
    const hasMore: (boolean | undefined)[] = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await adapter.listContacts(creds, params)
      seen.push(...rows.map((r) => r.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(['1', '2', '3', '4', '5', '6', '7'])
    expect(hasMore).toEqual([true, true, false])
  })

  it('sends start=2 and the caller limit on page 2', async () => {
    serveProspects(7)
    await new KlentyAdapter().listContacts(creds, withPageSink({ page: 2, limit: 3 }))
    expect(requests).toHaveLength(1)
    expect(requests[0]!.searchParams.get('start')).toBe('2')
    expect(requests[0]!.searchParams.get('limit')).toBe('3')
  })

  it('clamps a limit above 1000 and still serves every row', async () => {
    serveProspects(1500)
    const adapter = new KlentyAdapter()
    const seen: string[] = []
    let page = 1
    for (;;) {
      const params = withPageSink({ page, limit: 5000 })
      const rows = await adapter.listContacts(creds, params)
      seen.push(...rows.map((r) => r.id))
      if (!readUpstreamPage(params)?.hasMore) break
      page++
    }
    expect(requests.map((u) => u.searchParams.get('limit'))).toEqual(['1000', '1000'])
    expect(seen).toEqual(Array.from({ length: 1500 }, (_, i) => String(i + 1)))
  })

  it('gives the right meta.hasMore through parseListQuery then listPage', async () => {
    serveProspects(7)
    const adapter = new KlentyAdapter()
    const p2 = parseListQuery({ page: '2', limit: '3' })
    const out2 = listPage(await adapter.listContacts(creds, p2), p2, 'klenty')
    expect(out2.data.map((r) => r.id)).toEqual(['4', '5', '6'])
    expect(out2.meta.hasMore).toBe(true)

    const p3 = parseListQuery({ page: '3', limit: '3' })
    const out3 = listPage(await adapter.listContacts(creds, p3), p3, 'klenty')
    expect(out3.data.map((r) => r.id)).toEqual(['7'])
    expect(out3.meta.hasMore).toBe(false)
  })

  it('reports the clamped 1000-row page size for a direct call past the maximum', async () => {
    serveProspects(1500)
    const params = withPageSink({ page: 1, limit: 5000 })
    const rows = await new KlentyAdapter().listContacts(creds, params)
    expect(rows).toHaveLength(1000)
    expect(readUpstreamPage(params)?.pageSize).toBe(1000)
    expect(effectivePageSize(params, 5000)).toBe(1000)
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })

  it('reports no more rows for an empty collection', async () => {
    serveProspects(0)
    const params = withPageSink({ page: 1, limit: 3 })
    expect(await new KlentyAdapter().listContacts(creds, params)).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('stops on the empty page after an exactly full last page', async () => {
    serveProspects(3)
    const adapter = new KlentyAdapter()
    const p1 = withPageSink({ page: 1, limit: 3 })
    expect((await adapter.listContacts(creds, p1)).map((r) => r.id)).toEqual(['1', '2', '3'])
    expect(readUpstreamPage(p1)?.hasMore).toBe(true)
    const p2 = withPageSink({ page: 2, limit: 3 })
    expect(await adapter.listContacts(creds, p2)).toEqual([])
    expect(readUpstreamPage(p2)?.hasMore).toBe(false)
  })

  it('defaults to start=1 and limit=100 when called with no page or limit', async () => {
    serveProspects(150)
    const params = withPageSink({})
    const rows = await new KlentyAdapter().listContacts(creds, params)
    expect(requests).toHaveLength(1)
    expect(requests[0]!.searchParams.get('start')).toBe('1')
    expect(requests[0]!.searchParams.get('limit')).toBe('100')
    expect(rows).toHaveLength(100)
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })

  it('forwards listName alongside start and limit', async () => {
    serveProspects(7)
    await new KlentyAdapter().listContacts(
      creds,
      withPageSink({ page: 2, limit: 3, listName: 'Q3 leads' }),
    )
    expect(requests).toHaveLength(1)
    expect(requests[0]!.searchParams.get('listName')).toBe('Q3 leads')
    expect(requests[0]!.searchParams.get('start')).toBe('2')
  })
})
