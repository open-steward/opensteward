import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { listPage, parseListQuery, readUpstreamPage, withPageSink } from '@opensteward/shared'
import { AgendorAdapter } from '../../../../../../src/verticals/crm/adapters/agendor/index'

/**
 * GET /v3/funnels is unpaginated: the vendor's swagger declares no parameters
 * for it ("List all funnels in your account."), unlike /people, /deals and
 * the other collections, which take page and per_page. The adapter used to
 * send the client's per_page=25&page=1 defaults on every call, so caller
 * page 2 repeated page 1. It now fetches the whole list once and pages it
 * locally.
 */

const creds = { accessToken: 'tok' }
let requests: URL[] = []

/** Fake upstream that honours only what the spec documents for /funnels: nothing. */
function serveFunnels(n: number) {
  const funnels = Array.from({ length: n }, (_, i) => ({ id: i + 1, name: `Funnel ${i + 1}` }))
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string) => {
      const url = new URL(input)
      requests.push(url)
      if (url.pathname !== '/v3/funnels') return new Response('not found', { status: 404 })
      return new Response(JSON.stringify({ data: funnels }), {
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

describe('agendor listPipelines paging', () => {
  it('serves 2L+1 funnels across pages 1..3, each once, in order, with exact hasMore', async () => {
    const L = 3
    serveFunnels(2 * L + 1)
    const adapter = new AgendorAdapter()
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

  it('sends no undocumented paging params upstream, on page 2 or any other', async () => {
    serveFunnels(7)
    await new AgendorAdapter().listPipelines(creds, withPageSink({ page: 2, limit: 3 }))
    expect(requests).toHaveLength(1)
    expect(requests[0]!.searchParams.has('page')).toBe(false)
    expect(requests[0]!.searchParams.has('per_page')).toBe(false)
  })

  it('serves every row when the limit exceeds any page size', async () => {
    serveFunnels(40)
    const params = withPageSink({ page: 1, limit: 1000 })
    const rows = await new AgendorAdapter().listPipelines(creds, params)
    expect(rows).toHaveLength(40)
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('gives the right meta.hasMore through parseListQuery then listPage', async () => {
    serveFunnels(7)
    const adapter = new AgendorAdapter()
    const params = parseListQuery({ page: '2', limit: '3' })
    const rows = await adapter.listPipelines(creds, params)
    const out = listPage(rows, params, 'agendor')
    expect(out.data.map((r) => r.id)).toEqual(['4', '5', '6'])
    expect(out.meta.hasMore).toBe(true)
    expect(out.meta.totalCount).toBe(7)
  })
})
