/**
 * ClearFeed list paging: 1-based `page` + caller's `limit` → ClearFeed's
 * `limit` + `next_cursor` for requests and customers; teams and a request's
 * messages come back whole and are paged locally.
 *
 * From https://docs.clearfeed.ai/api/reference/api-reference/requests (Get Requests,
 * GET https://api.clearfeed.app/v1/rest/requests):
 *
 *   next_cursor: "Utilize the `next_cursor` parameter to access the next batch of results
 *                 when paginating. This field will be present under `response_metadata` in
 *                 the previous API response."
 *   limit:       "Specify the number of results per response (1-100), defaulting to 50."
 *
 * From https://docs.clearfeed.ai/api/reference/api-reference/customers (Get All Customers,
 * GET https://api.clearfeed.app/v1/rest/customers):
 *
 *   limit:       "Optional. Number of results to return (1-100). Defaults to 50."
 *   next_cursor: "Optional. Base64-encoded cursor for pagination."
 *   response:    "response_metadata": { "next_cursor": "MTI0", "count": 1 }
 *
 * From https://docs.clearfeed.ai/api/reference/api-reference/teams (Get All Teams):
 *
 *   "Retrieves a list of all teams configured in your ClearFeed account." — its only
 *   query parameter is `include`.
 *
 * From the requests page (Get Request by ID, GET /v1/rest/requests/:id): its only query
 * parameter is `include`, and "`messages` adds the `messages` array".
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import axios from 'axios'
import {
  _resetCursorPager,
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type QueryParams,
} from '@opensteward/shared'
import { ClearfeedAdapter } from '../../../../../../src/verticals/customer-support/adapters/clearfeed/index'

const CREDS = { accessToken: 'cf_test' }
/** Documented: "(1-100), defaulting to 50". */
const MAX = 100
const DEFAULT = 50

type Call = { path: string; params: Record<string, unknown> }

/**
 * A fake ClearFeed honouring ONLY the documented parameters: on the cursor
 * endpoints `limit` (1..100, default 50) and `next_cursor` (opaque, from the
 * previous `response_metadata`); on /teams and /requests/:id nothing but
 * `include`, and every row in one response. Out-of-range limits are refused.
 */
function fakeClearfeed(sizes: {
  requests?: number
  customers?: number
  teams?: number
  messages?: number
}) {
  const calls: Call[] = []
  const rows = (prefix: string, n: number) =>
    Array.from({ length: n }, (_, i) => ({ id: i + 1, prefix }))
  const encode = (offset: number) => Buffer.from(String(offset)).toString('base64')
  const decode = (c: unknown) => Number(Buffer.from(String(c), 'base64').toString('utf8'))

  const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
    const params = cfg?.params ?? {}
    calls.push({ path, params })
    const cursorList = (key: 'requests' | 'customers', all: unknown[]) => {
      const limit = params['limit'] ?? DEFAULT
      if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1 || limit > MAX) {
        throw Object.assign(new Error(`limit must be 1..${MAX} (got ${String(limit)})`), {
          response: { status: 400 },
        })
      }
      const start = params['next_cursor'] === undefined ? 0 : decode(params['next_cursor'])
      const page = all.slice(start, start + limit)
      const end = start + page.length
      return {
        data: {
          [key]: page,
          response_metadata: {
            ...(end < all.length ? { next_cursor: encode(end) } : {}),
            count: page.length,
          },
        },
      }
    }
    if (path === '/requests') return cursorList('requests', rows('r', sizes.requests ?? 0))
    if (path === '/customers') return cursorList('customers', rows('c', sizes.customers ?? 0))
    for (const k of Object.keys(params)) {
      if (k !== 'include') throw new Error(`undocumented param ${k} on ${path}`)
    }
    if (path === '/teams')
      return {
        data: { teams: rows('t', sizes.teams ?? 0).map((t) => ({ ...t, name: `team ${t.id}` })) },
      }
    if (path === '/requests/42') {
      const msgs = Array.from({ length: sizes.messages ?? 0 }, (_, i) => ({
        ts: `1700000000.${String(i + 1).padStart(6, '0')}`,
        text: `m${i + 1}`,
      }))
      return { data: { request: { id: 42, messages: msgs } } }
    }
    throw new Error(`unexpected GET ${path}`)
  })
  vi.spyOn(axios, 'create').mockReturnValue({ get, post: vi.fn() } as never)
  return calls
}

type ListFn = (a: ClearfeedAdapter, p: QueryParams) => Promise<Array<{ id: string }>>

const LISTS: Array<[string, 'requests' | 'customers' | 'teams' | 'messages', ListFn]> = [
  ['listTickets', 'requests', (a, p) => a.listTickets(CREDS, p)],
  ['listContacts', 'customers', (a, p) => a.listContacts(CREDS, p)],
  ['listTeams', 'teams', (a, p) => a.listTeams(CREDS, p)],
  ['listMessages', 'messages', (a, p) => a.listMessages(CREDS, '42', p)],
]

beforeEach(() => _resetCursorPager())
afterEach(() => vi.restoreAllMocks())

describe('ClearFeed lists serve every row once, page by page', () => {
  for (const [name, resource, list] of LISTS) {
    it(`${name}: 2L+1 rows over pages 1..3 at limit L, with hasMore exact`, async () => {
      const L = 4
      fakeClearfeed({ [resource]: 2 * L + 1 })
      const adapter = new ClearfeedAdapter()
      const seen: string[] = []
      const more: Array<boolean | undefined> = []
      for (const page of [1, 2, 3]) {
        const params = withPageSink({ page, limit: L })
        const rows = await list(adapter, params)
        seen.push(...rows.map((r) => r.id))
        more.push(readUpstreamPage(params)?.hasMore)
      }
      expect(seen).toHaveLength(2 * L + 1)
      expect(new Set(seen).size).toBe(2 * L + 1)
      expect(more).toEqual([true, true, false])
    })
  }

  it('listTickets: page 2 sends the next_cursor from page 1, at the caller size', async () => {
    const calls = fakeClearfeed({ requests: 9 })
    const adapter = new ClearfeedAdapter()
    await adapter.listTickets(CREDS, withPageSink({ page: 1, limit: 4 }))
    await adapter.listTickets(CREDS, withPageSink({ page: 2, limit: 4 }))
    expect(calls).toHaveLength(2)
    expect(calls[0]!.params).toEqual({ limit: 4 })
    expect(calls[1]!.params).toEqual({ limit: 4, next_cursor: Buffer.from('4').toString('base64') })
  })

  it('listContacts: page 2 sends the next_cursor from page 1', async () => {
    const calls = fakeClearfeed({ customers: 9 })
    const adapter = new ClearfeedAdapter()
    await adapter.listContacts(CREDS, withPageSink({ page: 1, limit: 4 }))
    await adapter.listContacts(CREDS, withPageSink({ page: 2, limit: 4 }))
    expect(calls[1]!.path).toBe('/customers')
    expect(calls[1]!.params['next_cursor']).toBe(Buffer.from('4').toString('base64'))
  })

  it('a cold page 3 walks the cursor chain rather than repeating page 1', async () => {
    fakeClearfeed({ requests: 9 })
    const rows = await new ClearfeedAdapter().listTickets(
      CREDS,
      withPageSink({ page: 3, limit: 4 }),
    )
    expect(rows.map((r) => r.id)).toEqual(['9'])
  })

  it('a limit above the documented 100 is clamped', async () => {
    const calls = fakeClearfeed({ requests: 150, customers: 150 })
    const adapter = new ClearfeedAdapter()
    const t = await adapter.listTickets(CREDS, withPageSink({ page: 1, limit: 500 }))
    const c = await adapter.listContacts(CREDS, withPageSink({ page: 1, limit: 500 }))
    expect(calls.map((c) => c.params['limit'])).toEqual([MAX, MAX])
    expect(t).toHaveLength(MAX)
    expect(c).toHaveLength(MAX)
  })

  it('a page size change mid-walk starts a fresh cursor chain at the new size', async () => {
    const calls = fakeClearfeed({ requests: 30 })
    const adapter = new ClearfeedAdapter()
    await adapter.listTickets(CREDS, withPageSink({ page: 1, limit: 4 }))
    const rows = await adapter.listTickets(CREDS, withPageSink({ page: 2, limit: 10 }))
    expect(rows.map((r) => r.id)).toEqual(Array.from({ length: 10 }, (_, i) => String(11 + i)))
    expect(calls.slice(1).map((c) => c.params)).toEqual([
      { limit: 10 },
      { limit: 10, next_cursor: Buffer.from('10').toString('base64') },
    ])
  })

  it('cursors are scoped per connection: another token walks its own chain', async () => {
    const calls = fakeClearfeed({ requests: 9 })
    const adapter = new ClearfeedAdapter()
    await adapter.listTickets(CREDS, withPageSink({ page: 1, limit: 4 }))
    const other = { accessToken: 'cf_other_tenant' }
    await adapter.listTickets(other, withPageSink({ page: 2, limit: 4 }))
    expect(calls.slice(1).map((c) => c.params)).toEqual([
      { limit: 4 },
      { limit: 4, next_cursor: Buffer.from('4').toString('base64') },
    ])
  })

  it('declares the documented maximum', () => {
    expect(new ClearfeedAdapter().capabilities.maxPageSize).toBe(MAX)
  })

  it('API path: parseListQuery → listTickets → listPage reports the next page', async () => {
    fakeClearfeed({ requests: 250 })
    const adapter = new ClearfeedAdapter()
    const params = parseListQuery({ limit: '500', page: '2' }, adapter)
    const rows = await adapter.listTickets(CREDS, params)
    const env = listPage(rows, params, 'clearfeed')
    expect(env.meta.limit).toBe(MAX)
    expect(env.data.map((r) => r.id)).toEqual(
      Array.from({ length: MAX }, (_, i) => String(MAX + i + 1)),
    )
    expect(env.meta.hasMore).toBe(true)
  })
})
