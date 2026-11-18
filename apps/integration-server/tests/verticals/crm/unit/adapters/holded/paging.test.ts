import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { listPage, parseListQuery, readUpstreamPage, withPageSink } from '@opensteward/shared'
import { HoldedAdapter } from '../../../../../../src/verticals/crm/adapters/holded/index'

/**
 * Holded v1 GET /api/crm/v1/funnels is unpaginated: "Get all your funnels."
 * (https://www.holded.com/developers/v1/crm-api/funnels/list-funnels). The
 * embedded v1 spec gives it `"parameters":[]` and a bare-array 200 example.
 * The adapter used to send an undocumented limit=25 and ignore page, so caller
 * page 2 repeated page 1. It now fetches every funnel once and pages locally.
 */

const creds = { accessToken: 'tok' }
let requests: URL[] = []

/** Fake upstream honouring only what the docs describe: no paging params, whole array. */
function serveFunnels(n: number) {
  const rows = Array.from({ length: n }, (_, i) => ({ id: String(i + 1), name: `Funnel ${i + 1}` }))
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string) => {
      const url = new URL(input)
      requests.push(url)
      if (url.pathname !== '/api/crm/v1/funnels') return new Response('not found', { status: 404 })
      return new Response(JSON.stringify(rows), {
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

describe('holded listPipelines paging', () => {
  it('serves 2L+1 funnels across pages 1..3, each once, in order, with exact hasMore', async () => {
    const L = 3
    serveFunnels(2 * L + 1)
    const adapter = new HoldedAdapter()
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
    serveFunnels(7)
    await new HoldedAdapter().listPipelines(creds, withPageSink({ page: 2, limit: 3 }))
    expect(requests).toHaveLength(1)
    for (const key of ['limit', 'offset', 'page']) {
      expect(requests[0]!.searchParams.has(key)).toBe(false)
    }
  })

  it('serves every funnel when the limit exceeds any page size', async () => {
    serveFunnels(40)
    const params = withPageSink({ page: 1, limit: 1000 })
    const rows = await new HoldedAdapter().listPipelines(creds, params)
    expect(rows).toHaveLength(40)
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('serves a collection larger than the sync limit whole: page 2 at 500 is rows 501..600', async () => {
    serveFunnels(600)
    const params = withPageSink({ page: 2, limit: 500 })
    const rows = await new HoldedAdapter().listPipelines(creds, params)
    expect(rows.map((r) => r.id)).toEqual(Array.from({ length: 100 }, (_, i) => String(501 + i)))
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('gives the right meta.hasMore through parseListQuery then listPage', async () => {
    serveFunnels(7)
    const params = parseListQuery({ page: '2', limit: '3' })
    const rows = await new HoldedAdapter().listPipelines(creds, params)
    const out = listPage(rows, params, 'holded')
    expect(out.data.map((r) => r.id)).toEqual(['4', '5', '6'])
    expect(out.meta.hasMore).toBe(true)
    expect(out.meta.totalCount).toBe(7)
  })
})
