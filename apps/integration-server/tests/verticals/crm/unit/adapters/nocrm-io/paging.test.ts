import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { listPage, parseListQuery, readUpstreamPage, withPageSink } from '@opensteward/shared'
import type { QueryParams } from '../../../../../../src/verticals/crm/adapter/interface'
import { NocrmIoAdapter } from '../../../../../../src/verticals/crm/adapters/nocrm-io/index'

/**
 * noCRM.io (https://www.nocrm.io/api):
 *
 * GET /leads — "The leads are returned with a limit of 100 by default. However
 * it is possible to lower this limit. To get more than 100 leads, you need to
 * do multiple requests and use the offset parameter to shift the data." The
 * total before pagination comes back in the X-TOTAL-COUNT header.
 *
 * GET /clients documents only `direction` and `order`, and
 * GET /leads/{lead_id}/comments only `lead_id` and `direction`: both return
 * the whole list, so they are paged locally.
 */

const creds = { accessToken: 'key', extra: { subdomain: 'acme' } }
const UPSTREAM_MAX = 100
let requests: URL[] = []

function row(i: number) {
  return { id: i + 1, title: `r${i + 1}`, name: `r${i + 1}`, content: `c${i + 1}` }
}

/** Honours only `limit` (default and max 100) and `offset` on /leads. */
function serve(n: number, opts: { omitTotal?: boolean } = {}) {
  const rows = Array.from({ length: n }, (_, i) => row(i))
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string) => {
      const url = new URL(input)
      requests.push(url)
      const headers: Record<string, string> = { 'content-type': 'application/json' }
      let body: unknown[]
      if (url.pathname === '/api/v2/leads') {
        const raw = url.searchParams.get('limit')
        const limit = Math.min(raw === null ? UPSTREAM_MAX : Number(raw), UPSTREAM_MAX)
        const offset = Number(url.searchParams.get('offset') ?? 0)
        body = rows.slice(offset, offset + limit)
        if (!opts.omitTotal) headers['X-TOTAL-COUNT'] = String(rows.length)
      } else if (
        url.pathname === '/api/v2/clients' ||
        url.pathname === '/api/v2/leads/9/comments'
      ) {
        body = rows
      } else {
        return new Response('not found', { status: 404 })
      }
      return new Response(JSON.stringify(body), { status: 200, headers })
    }),
  )
}

type Method = 'listContacts' | 'listCompanies' | 'listNotes'

function call(method: Method, params: QueryParams) {
  const adapter = new NocrmIoAdapter()
  if (method === 'listNotes') params.lead_id = '9'
  return (
    adapter[method] as (c: typeof creds, p: QueryParams) => Promise<Array<{ id: string }>>
  ).call(adapter, creds, params)
}

beforeEach(() => {
  requests = []
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe.each<Method>(['listContacts', 'listCompanies', 'listNotes'])(
  'nocrm-io %s paging',
  (method) => {
    it('serves 2L+1 rows across pages 1..3, each once, in order, with exact hasMore', async () => {
      const L = 3
      serve(2 * L + 1)
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

    it('clamps a limit above 100 and still serves every row', async () => {
      const N = 2 * UPSTREAM_MAX + 5
      serve(N)
      const seen: string[] = []
      for (let page = 1; page <= 10; page++) {
        const params = withPageSink({ page, limit: 150 })
        seen.push(...(await call(method, params)).map((r) => r.id))
        if (method === 'listContacts') {
          expect(requests.at(-1)!.searchParams.get('limit')).toBe('100')
        }
        if (readUpstreamPage(params)?.hasMore === false) break
      }
      expect(seen).toEqual(Array.from({ length: N }, (_, i) => String(i + 1)))
    })

    it('gives the right meta.hasMore through parseListQuery then listPage', async () => {
      serve(7)
      const params = parseListQuery({ page: '2', limit: '3' })
      const out = listPage(await call(method, params), params, 'nocrm-io')
      expect(out.data.map((r) => r.id)).toEqual(['4', '5', '6'])
      expect(out.meta.hasMore).toBe(true)
      expect(out.meta.totalCount).toBe(7)

      const last = parseListQuery({ page: '3', limit: '3' })
      const tail = listPage(await call(method, last), last, 'nocrm-io')
      expect(tail.data.map((r) => r.id)).toEqual(['7'])
      expect(tail.meta.hasMore).toBe(false)
    })
  },
)

describe('nocrm-io listContacts request', () => {
  it('sends offset = (page - 1) * limit and limit on page 2', async () => {
    serve(7)
    await call('listContacts', withPageSink({ page: 2, limit: 3 }))
    const req = requests.at(-1)!
    expect(req.searchParams.get('offset')).toBe('3')
    expect(req.searchParams.get('limit')).toBe('3')
  })

  it('ends on a short page when X-TOTAL-COUNT is absent, and claims no end on a full one', async () => {
    serve(7, { omitTotal: true })
    const full = withPageSink({ page: 1, limit: 3 })
    await call('listContacts', full)
    expect(readUpstreamPage(full)?.hasMore).toBeUndefined()
    const short = withPageSink({ page: 3, limit: 3 })
    await call('listContacts', short)
    expect(readUpstreamPage(short)?.hasMore).toBe(false)
  })
})

describe.each<Method>(['listCompanies', 'listNotes'])('nocrm-io %s request', (method) => {
  it('sends no undocumented paging parameters', async () => {
    serve(7)
    await call(method, withPageSink({ page: 2, limit: 3 }))
    const keys = [...requests.at(-1)!.searchParams.keys()]
    expect(keys).not.toContain('limit')
    expect(keys).not.toContain('offset')
  })
})

describe('nocrm-io capabilities', () => {
  it('declares the documented /leads maximum of 100', () => {
    expect(new NocrmIoAdapter().capabilities?.maxPageSize).toBe(100)
  })
})

describe('nocrm-io listContacts edge cases', () => {
  it('sends the default page size of 25 when called without a limit', async () => {
    serve(7)
    await new NocrmIoAdapter().listContacts(creds, {})
    expect(requests.at(-1)!.searchParams.get('limit')).toBe('25')
  })

  it('keeps hasMore true when a mid-list page comes back short but X-TOTAL-COUNT says more', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response(JSON.stringify([row(0), row(1)]), {
          status: 200,
          headers: { 'content-type': 'application/json', 'X-TOTAL-COUNT': '3' },
        })
      }),
    )
    const params = withPageSink({ page: 1, limit: 3 })
    await call('listContacts', params)
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })
})

describe.each<Method>(['listCompanies', 'listNotes'])('nocrm-io %s non-array body', (method) => {
  it('treats a non-array 200 body as an empty, ended list', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        return new Response(JSON.stringify({ unexpected: true }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      }),
    )
    const params = withPageSink({ page: 1, limit: 3 })
    expect(await call(method, params)).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })
})
