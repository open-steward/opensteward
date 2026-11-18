import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { listPage, parseListQuery, readUpstreamPage, withPageSink } from '@opensteward/shared'
import type { QueryParams } from '../../../../../../src/verticals/crm/adapter/interface'
import { SalesnexusAdapter } from '../../../../../../src/verticals/crm/adapters/salesnexus/index'

/**
 * SalesNexus (https://logon.salesnexus.com/api/docs/api-v1), POST call-v1:
 *
 * get-contacts — "The start-after is the position that the resulting list
 * should start at, and the page-size parameter is the size of the result
 * list. The order of the returned list is guarenteed, so that a the combined
 * results of two requests made with start-after = 0 and page-size = 50
 * followed by a start-after = 50 and page-size = 50 will result in the same
 * contact ids as start-after = 0 and page-size = 100."
 *
 * get-activities documents the same pair; get-sales takes the same-named
 * `start-after` / `page-size` in its example request. No maximum, total count
 * or has-more flag is documented: a short page is the only end signal.
 */

const creds = { accessToken: 'tok' }
let bodies: Array<Record<string, unknown>> = []

type Method = 'listContacts' | 'listDeals' | 'listActivities'

function row(fn: string, i: number): Record<string, unknown> {
  const id = String(i + 1)
  if (fn === 'get-contacts') return { 'contact-id': id, 'field-values': {} }
  if (fn === 'get-sales') return { 'sales-id': id, 'field-values': {} }
  return { 'activity-id': id }
}

/** Honours only the documented `start-after` (0-based position) and `page-size`. */
function serve(n: number) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_input: string, init: { body: string }) => {
      const [call] = JSON.parse(init.body) as Array<{
        function: string
        parameters: Record<string, unknown>
      }>
      bodies.push(call.parameters)
      const start = Number(call.parameters['start-after'] ?? 0)
      const size = Number(call.parameters['page-size'])
      const all = Array.from({ length: n }, (_, i) => row(call.function, i))
      const result = all.slice(start, start + size)
      return new Response(JSON.stringify([{ function: call.function, successful: true, result }]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }),
  )
}

function call(method: Method, params: QueryParams) {
  const adapter = new SalesnexusAdapter()
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

describe.each<Method>(['listContacts', 'listDeals', 'listActivities'])(
  'salesnexus %s paging',
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
        // No count or has-more flag is documented: a full page claims nothing,
        // a short page reports the end.
        hasMore.push(readUpstreamPage(params)?.hasMore)
      }
      expect(seen).toEqual(['1', '2', '3', '4', '5', '6', '7'])
      expect(hasMore).toEqual([undefined, undefined, false])
    })

    it('sends start-after = (page - 1) * limit and page-size = limit on page 2', async () => {
      serve(7)
      await call(method, withPageSink({ page: 2, limit: 3 }))
      expect(bodies.at(-1)!['start-after']).toBe('3')
      expect(bodies.at(-1)!['page-size']).toBe('3')
    })

    it('reports the end on a tail of exactly limit - 1 rows', async () => {
      serve(5)
      const params = withPageSink({ page: 2, limit: 3 })
      const rows = await call(method, params)
      expect(rows.map((r) => r.id)).toEqual(['4', '5'])
      expect(readUpstreamPage(params)?.hasMore).toBe(false)
    })

    it('sends the default page-size of 50 when no limit is given', async () => {
      serve(120)
      const rows = await call(method, { page: 2 })
      expect(bodies.at(-1)!['start-after']).toBe('50')
      expect(bodies.at(-1)!['page-size']).toBe('50')
      expect(rows[0]!.id).toBe('51')
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
      expect(seen).toEqual(Array.from({ length: N }, (_, i) => String(i + 1)))
    })

    it('gives the right meta.hasMore through parseListQuery then listPage', async () => {
      serve(7)
      const params = parseListQuery({ page: '2', limit: '3' })
      const out = listPage(await call(method, params), params, 'salesnexus')
      expect(out.data.map((r) => r.id)).toEqual(['4', '5', '6'])
      // A full page with no documented end signal is honestly unknown.
      expect(out.meta.hasMore).toBeNull()

      const last = parseListQuery({ page: '3', limit: '3' })
      const tail = listPage(await call(method, last), last, 'salesnexus')
      expect(tail.data.map((r) => r.id)).toEqual(['7'])
      expect(tail.meta.hasMore).toBe(false)
    })
  },
)

describe('salesnexus capabilities', () => {
  it('declares no maxPageSize (the docs give none)', () => {
    const a = new SalesnexusAdapter() as { capabilities?: { maxPageSize?: number } }
    expect(a.capabilities?.maxPageSize).toBeUndefined()
  })
})
