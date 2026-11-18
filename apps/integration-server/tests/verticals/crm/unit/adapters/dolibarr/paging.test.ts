import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { listPage, parseListQuery, readUpstreamPage, withPageSink } from '@opensteward/shared'
import { DolibarrAdapter } from '../../../../../../src/verticals/crm/adapters/dolibarr/index'

/**
 * Dolibarr agenda events: GET /api/index.php/agendaevents, documented in the
 * API explorer (operationId listAgendaevents) with query parameters
 * sortfield, sortorder, limit (default 100), page, user_ids, sqlfilters,
 * properties and pagination_data ("If this parameter is set to true the
 * response will include pagination data. Default value is false. Page starts
 * from 0"). AgendaEvents::index() returns {data, pagination:{total, page,
 * page_count, limit}} when pagination_data is true, and a bare array before
 * 21.0.0. The adapter used to call /actions, which is not an API.
 */

const creds = { accessToken: 'key', extra: { instanceUrl: 'https://erp.example.com' } }
const DOCUMENTED = new Set([
  'sortfield',
  'sortorder',
  'limit',
  'page',
  'user_ids',
  'sqlfilters',
  'properties',
  'pagination_data',
])
let requests: { url: URL; headers: Record<string, string> }[] = []

function event(id: number) {
  return { id, label: `Event ${id}`, type_code: 'AC_OTH', datep: 1767261600 + id, percentage: '0' }
}

/** Fake honouring only documented params, with index()'s 0-based limit/page arithmetic. */
function serveAgenda(n: number, opts: { legacy?: boolean } = {}) {
  const rows = Array.from({ length: n }, (_, i) => event(i + 1))
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string, init?: RequestInit) => {
      const url = new URL(input)
      requests.push({ url, headers: (init?.headers ?? {}) as Record<string, string> })
      for (const k of url.searchParams.keys()) {
        if (!DOCUMENTED.has(k)) return new Response(`undocumented ${k}`, { status: 400 })
      }
      if (url.pathname === '/api/index.php/agendaevents') {
        const limit = Number(url.searchParams.get('limit') ?? 100)
        const page = Math.max(0, Number(url.searchParams.get('page') ?? 0))
        const slice = rows.slice(limit * page, limit * page + limit)
        const body =
          url.searchParams.get('pagination_data') === 'true' && !opts.legacy
            ? {
                data: slice,
                pagination: { total: n, page, page_count: Math.ceil(n / limit), limit },
              }
            : slice
        return new Response(JSON.stringify(body), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }
      const one = /^\/api\/index\.php\/agendaevents\/(\d+)$/.exec(url.pathname)
      if (one) {
        const row = rows.find((r) => r.id === Number(one[1]))
        return row
          ? new Response(JSON.stringify(row), {
              status: 200,
              headers: { 'content-type': 'application/json' },
            })
          : new Response('Agenda Events not found', { status: 404 })
      }
      return new Response('API not found (failed to include API file)', { status: 501 })
    }),
  )
}

beforeEach(() => {
  requests = []
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe('dolibarr listActivities', () => {
  it('walks 2L+1 events over pages 1..3, each id once, with exact hasMore', async () => {
    const L = 3
    serveAgenda(2 * L + 1)
    const adapter = new DolibarrAdapter()
    const seen: string[] = []
    const hasMore: (boolean | undefined)[] = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await adapter.listActivities(creds, params)
      seen.push(...rows.map((r) => r.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
      expect(readUpstreamPage(params)?.totalCount).toBe(2 * L + 1)
    }
    expect(seen).toEqual(['1', '2', '3', '4', '5', '6', '7'])
    expect(hasMore).toEqual([true, true, false])
  })

  it('sends the caller page 0-based with the exact limit to /agendaevents with DOLAPIKEY', async () => {
    serveAgenda(10)
    await new DolibarrAdapter().listActivities(creds, withPageSink({ page: 2, limit: 4 }))
    expect(requests).toHaveLength(1)
    const { url, headers } = requests[0]!
    expect(url.pathname).toBe('/api/index.php/agendaevents')
    expect(url.searchParams.get('page')).toBe('1')
    expect(url.searchParams.get('limit')).toBe('4')
    expect(url.searchParams.get('pagination_data')).toBe('true')
    expect(headers['DOLAPIKEY']).toBe('key')
  })

  it('hasMore is false when the total is an exact multiple of the limit', async () => {
    serveAgenda(6)
    const params = withPageSink({ page: 2, limit: 3 })
    const rows = await new DolibarrAdapter().listActivities(creds, params)
    expect(rows.map((r) => r.id)).toEqual(['4', '5', '6'])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('reports nothing it was not told on a pre-21.0 bare-array reply', async () => {
    serveAgenda(7, { legacy: true })
    const params = withPageSink({ page: 1, limit: 3 })
    const rows = await new DolibarrAdapter().listActivities(creds, params)
    expect(rows.map((r) => r.id)).toEqual(['1', '2', '3'])
    expect(readUpstreamPage(params)).toBeUndefined()
  })

  it('gives the right meta through parseListQuery then listPage', async () => {
    serveAgenda(7)
    const params = parseListQuery({ page: '2', limit: '3' })
    const rows = await new DolibarrAdapter().listActivities(creds, params)
    const out = listPage(rows, params, 'dolibarr')
    expect(out.data.map((r) => r.id)).toEqual(['4', '5', '6'])
    expect(out.meta.hasMore).toBe(true)
    expect(out.meta.totalCount).toBe(7)
  })

  it('getActivity reads a listed id back from /agendaevents/{id}', async () => {
    serveAgenda(3)
    const got = await new DolibarrAdapter().getActivity(creds, '2')
    expect(got.id).toBe('2')
    expect(requests[0]!.url.pathname).toBe('/api/index.php/agendaevents/2')
  })
})

describe('dolibarr refusals', () => {
  it.each([
    [
      'listPipelines',
      (a: DolibarrAdapter) => a.listPipelines(creds, withPageSink({ page: 1, limit: 25 })),
    ],
    ['listNotes', (a: DolibarrAdapter) => a.listNotes(creds, withPageSink({ page: 1, limit: 25 }))],
    ['getNote', (a: DolibarrAdapter) => a.getNote(creds, '1')],
  ])('%s throws 501 NOT_SUPPORTED and sends no request', async (_name, call) => {
    serveAgenda(1)
    await expect(call(new DolibarrAdapter())).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(requests).toHaveLength(0)
  })
})
