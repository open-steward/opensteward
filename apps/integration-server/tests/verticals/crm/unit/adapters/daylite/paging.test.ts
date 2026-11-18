import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { listPage, parseListQuery, readUpstreamPage, withPageSink } from '@opensteward/shared'
import { DayliteAdapter } from '../../../../../../src/verticals/crm/adapters/daylite/index'

/**
 * Daylite's GET list endpoints (contacts, companies, opportunities, pipelines,
 * tasks, notes) are unpaginated: each returns the whole collection as a bare
 * array, and the embedded OpenAPI documents no limit, offset or page — only
 * include_trash (pipelines: no parameters at all). "When you get the list of
 * all contacts, you will get an array with an object for each contact."
 * (https://developer.daylite.app/reference/contacts.md). The adapter used to
 * send an undocumented limit and never forwarded page, so caller page 2
 * repeated page 1. It now fetches the collection once and pages it locally.
 */

const creds = { accessToken: 'tok' }
let requests: URL[] = []

type Method =
  'listContacts' | 'listCompanies' | 'listDeals' | 'listPipelines' | 'listActivities' | 'listNotes'

const CASES: { method: Method; path: string }[] = [
  { method: 'listContacts', path: 'contacts' },
  { method: 'listCompanies', path: 'companies' },
  { method: 'listDeals', path: 'opportunities' },
  { method: 'listPipelines', path: 'pipelines' },
  { method: 'listActivities', path: 'tasks' },
  { method: 'listNotes', path: 'notes' },
]

/** Fake upstream honouring only what the docs describe: no paging params, whole array. */
function serve(path: string, n: number) {
  const rows = Array.from({ length: n }, (_, i) => ({
    self: `/v1/${path}/${i + 1}`,
    name: `Row ${i + 1}`,
    title: `Row ${i + 1}`,
  }))
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string) => {
      const url = new URL(input)
      requests.push(url)
      if (url.pathname !== `/v1/${path}`) return new Response('not found', { status: 404 })
      return new Response(JSON.stringify(rows), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }),
  )
}

function call(
  adapter: DayliteAdapter,
  method: Method,
  params: Parameters<DayliteAdapter[Method]>[1],
) {
  return (adapter[method] as (c: typeof creds, p: typeof params) => Promise<{ id?: string }[]>)(
    creds,
    params,
  )
}

beforeEach(() => {
  requests = []
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe.each(CASES)('daylite $method paging', ({ method, path }) => {
  it('serves 2L+1 rows across pages 1..3, each once, in order, with exact hasMore', async () => {
    const L = 3
    serve(path, 2 * L + 1)
    const adapter = new DayliteAdapter()
    const seen: (string | undefined)[] = []
    const hasMore: (boolean | undefined)[] = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await call(adapter, method, params)
      seen.push(...rows.map((r) => r.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(['1', '2', '3', '4', '5', '6', '7'])
    expect(hasMore).toEqual([true, true, false])
  })

  it('sends no undocumented paging params upstream on page 2', async () => {
    serve(path, 7)
    await call(new DayliteAdapter(), method, withPageSink({ page: 2, limit: 3 }))
    expect(requests).toHaveLength(1)
    for (const key of ['limit', 'offset', 'page']) {
      expect(requests[0]!.searchParams.has(key)).toBe(false)
    }
  })

  it('serves every row when the limit exceeds any page size', async () => {
    serve(path, 40)
    const params = withPageSink({ page: 1, limit: 1000 })
    const rows = await call(new DayliteAdapter(), method, params)
    expect(rows).toHaveLength(40)
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('serves a collection larger than the sync limit whole: page 2 at 500 is rows 501..600', async () => {
    serve(path, 600)
    const params = withPageSink({ page: 2, limit: 500 })
    const rows = await call(new DayliteAdapter(), method, params)
    expect(rows.map((r) => r.id)).toEqual(Array.from({ length: 100 }, (_, i) => String(501 + i)))
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('gives the right meta.hasMore through parseListQuery then listPage', async () => {
    serve(path, 7)
    const params = parseListQuery({ page: '2', limit: '3' })
    const rows = await call(new DayliteAdapter(), method, params)
    const out = listPage(rows, params, 'daylite')
    expect(out.data.map((r) => r.id)).toEqual(['4', '5', '6'])
    expect(out.meta.hasMore).toBe(true)
    expect(out.meta.totalCount).toBe(7)
  })
})
