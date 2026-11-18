import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { listPage, parseListQuery, readUpstreamPage, withPageSink } from '@opensteward/shared'
import type { QueryParams } from '../../../../../../src/verticals/crm/adapter/interface'
import { ReplyIoAdapter } from '../../../../../../src/verticals/crm/adapters/reply-io/index'

/**
 * Reply.io v3 list endpoints page by `top` + `skip` and answer `{ items, hasMore }`
 * (https://docs.reply.io/api-reference/contacts/list-all-contacts.md):
 *
 *   "Paged with the top and skip query parameters."
 *   "Maximum number of contacts to return (default 25, max 1000)"
 *   "Number of contacts to skip"
 *   "Indicates if there are more items to fetch"
 *
 * /contact-accounts and /tasks document the same contract. The adapter used to
 * read `skip` from params.cursor, which the router never sets, so page 2
 * repeated page 1.
 */

const creds = { accessToken: 'tok' }
const MAX = 1000
const DEFAULT = 25
let requests: URL[] = []

type Method = 'listContacts' | 'listCompanies' | 'listActivities'

const CASES: Array<{ method: Method; path: string }> = [
  { method: 'listContacts', path: '/v3/contacts' },
  { method: 'listCompanies', path: '/v3/contact-accounts' },
  { method: 'listActivities', path: '/v3/tasks' },
]

/** Honours only `top` (default 25, 400 outside 1..1000) and `skip`. */
function serve(path: string, n: number) {
  const rows = Array.from({ length: n }, (_, i) => ({ id: i + 1, name: `r${i + 1}` }))
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string) => {
      const url = new URL(input)
      requests.push(url)
      if (url.pathname !== path) return new Response('not found', { status: 404 })
      const rawTop = url.searchParams.get('top')
      const top = rawTop === null ? DEFAULT : Number(rawTop)
      if (top < 1 || top > MAX) {
        return new Response("Parameter 'top' must be between 1 and 1000", { status: 400 })
      }
      const skip = Number(url.searchParams.get('skip') ?? 0)
      const items = rows.slice(skip, skip + top)
      return new Response(JSON.stringify({ items, hasMore: skip + top < rows.length }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    }),
  )
}

function call(method: Method, params: QueryParams) {
  const adapter = new ReplyIoAdapter()
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

describe.each(CASES)('reply-io $method paging', ({ method, path }) => {
  it('serves 2L+1 rows across pages 1..3, each once, in order, with exact hasMore', async () => {
    const L = 3
    serve(path, 2 * L + 1)
    const seen: string[] = []
    const hasMore: (boolean | undefined)[] = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await call(method, params)
      seen.push(...rows.map((r) => r.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(['1', '2', '3', '4', '5', '6', '7'])
    expect(hasMore).toEqual([true, true, false])
  })

  it('forwards the upstream hasMore when the last page is exactly full', async () => {
    const L = 3
    serve(path, 2 * L)
    const hasMore: (boolean | undefined)[] = []
    for (const page of [1, 2]) {
      const params = withPageSink({ page, limit: L })
      await call(method, params)
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(hasMore).toEqual([true, false])
  })

  it('sends the documented default top of 25 when no limit is given', async () => {
    serve(path, 7)
    await call(method, withPageSink({ page: 1 }))
    expect(requests.at(-1)!.searchParams.get('top')).toBe(String(DEFAULT))
  })

  it('sends skip = (page - 1) * limit on page 2', async () => {
    serve(path, 7)
    await call(method, withPageSink({ page: 2, limit: 3 }))
    const req = requests.at(-1)!
    expect(req.searchParams.get('skip')).toBe('3')
    expect(req.searchParams.get('top')).toBe('3')
  })

  it('clamps a limit above 1000 and still serves every row', async () => {
    const N = 2 * MAX + 5
    serve(path, N)
    const seen: string[] = []
    for (let page = 1; page <= 10; page++) {
      const params = withPageSink({ page, limit: 5000 })
      const rows = await call(method, params)
      seen.push(...rows.map((r) => r.id))
      expect(Number(requests.at(-1)!.searchParams.get('top'))).toBe(MAX)
      expect(readUpstreamPage(params)?.pageSize).toBe(MAX)
      if (readUpstreamPage(params)?.hasMore === false) break
    }
    expect(seen).toEqual(Array.from({ length: N }, (_, i) => String(i + 1)))
  })

  it('gives the right meta.hasMore through parseListQuery then listPage', async () => {
    serve(path, 7)
    const adapter = new ReplyIoAdapter()
    const params = parseListQuery({ page: '2', limit: '3' }, adapter)
    const out = listPage(await call(method, params), params, 'reply-io')
    expect(out.data.map((r) => r.id)).toEqual(['4', '5', '6'])
    expect(out.meta.hasMore).toBe(true)

    const last = parseListQuery({ page: '3', limit: '3' }, adapter)
    const tail = listPage(await call(method, last), last, 'reply-io')
    expect(tail.data.map((r) => r.id)).toEqual(['7'])
    expect(tail.meta.hasMore).toBe(false)
  })
})

describe('reply-io capabilities', () => {
  // The router caps at 500 today, below Reply's 1000, so no request can show
  // the declaration; pin it directly so a raised router cap still stops at 1000.
  it('declares the documented top maximum as maxPageSize', () => {
    expect(new ReplyIoAdapter().capabilities.maxPageSize).toBe(MAX)
  })
})
