/**
 * UseDesk list paging.
 *
 * https://api.usedocs.com/article/51376 (POST /uapi/tickets):
 *   "offset Offset . Offset by 1 will show the next 100 entries"
 * https://api.usedocs.com/article/51383 (POST /uapi/clients):
 *   "The method implements page breakdown. The response has a maximum of 100
 *    entries, the offset parameter is used."
 * https://api.usedocs.com/article/51418 (POST /uapi/groups) documents only
 *   `api_token`: the whole list comes back in one response.
 *
 * `offset` is a PAGE index, not a row offset, and there is no page-size
 * parameter, so the fake below honours ONLY body `offset` (pages of a fixed
 * 100) on /tickets and /clients, and ignores it on /groups.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import {
  _resetRowPager,
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type Credentials,
  type QueryParams,
} from '@opensteward/shared'
import { UsedeskAdapter } from '../../../../../../src/verticals/customer-support/adapters/usedesk/index'

const UPSTREAM = 100

const creds: Credentials = { accessToken: 'tok' }

interface Call {
  path: string
  body: Record<string, unknown>
}

let calls: Call[] = []
let handler: (call: Call) => unknown

beforeEach(() => {
  _resetRowPager()
  calls = []
  vi.spyOn(axios, 'create').mockImplementation(
    () =>
      ({
        post: async (path: string, body?: Record<string, unknown>) => {
          const call = { path, body: { ...(body ?? {}) } }
          calls.push(call)
          return { data: handler(call) }
        },
      }) as unknown as ReturnType<typeof axios.create>,
  )
})

afterEach(() => {
  vi.restoreAllMocks()
})

const range = (n: number, prefix = '') => Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`)

/** A paged UseDesk list: body `offset` is a page index over pages of 100. */
function paged(n: number, prefix = '') {
  return (call: Call) => {
    const offset = Math.max(0, Number(call.body['offset'] ?? 0))
    return range(n, prefix)
      .slice(offset * UPSTREAM, (offset + 1) * UPSTREAM)
      .map((id) => ({ id, name: `n${id}` }))
  }
}

/** /groups: every group, whatever the body says. */
function whole(n: number) {
  return () => range(n).map((id) => ({ id, name: `g${id}` }))
}

async function walk(run: (p: QueryParams) => Promise<{ id: string }[]>, limit: number) {
  const ids: string[] = []
  const hasMore: (boolean | undefined)[] = []
  for (const page of [1, 2, 3]) {
    const params = withPageSink({ page, limit })
    const rows = await run(params)
    ids.push(...rows.map((r) => r.id))
    hasMore.push(listPage(rows, params, 'usedesk').meta.hasMore ?? undefined)
  }
  return { ids, hasMore }
}

const adapter = new UsedeskAdapter()

type Run = (p: QueryParams) => Promise<{ id: string }[]>
const pagedMethods: [string, string, Run][] = [
  ['listTickets', '/tickets', (p) => adapter.listTickets(creds, p)],
  ['listContacts', '/clients', (p) => adapter.listContacts(creds, p)],
]

for (const [method, path, run] of pagedMethods) {
  describe(`usedesk ${method} paging`, () => {
    it('serves every row once, in order, across pages of 2L+1 rows', async () => {
      const L = 10
      handler = paged(2 * L + 1)
      const { ids, hasMore } = await walk(run, L)
      expect(ids).toEqual(range(2 * L + 1))
      expect(hasMore).toEqual([true, true, false])
    })

    it('serves every row once when caller pages span upstream pages of 100', async () => {
      const L = 150
      handler = paged(2 * L + 1)
      const { ids, hasMore } = await walk(run, L)
      expect(ids).toEqual(range(2 * L + 1))
      expect(hasMore).toEqual([true, true, false])
    })

    it('page 2 requests the documented offset page index', async () => {
      handler = paged(500)
      await run(withPageSink({ page: 2, limit: 100 }))
      expect(calls.every((c) => c.path === path)).toBe(true)
      expect(calls.map((c) => c.body['offset'])).toContain(1)
    })

    it('an exact multiple of 100 ends on the last page', async () => {
      handler = paged(200)
      const { ids, hasMore } = await walk(run, 100)
      expect(ids).toEqual(range(200))
      expect(hasMore).toEqual([true, false, false])
    })

    it('a limit above the maximum is clamped and serves the whole collection', async () => {
      handler = paged(260)
      const params = parseListQuery({ limit: '9999' })
      expect(params.limit).toBe(500)
      const rows = await run(params)
      expect(rows.map((r) => r.id)).toEqual(range(260))
      expect(listPage(rows, params, 'usedesk').meta.hasMore).toBe(false)
    })

    it('API path: page 2 through parseListQuery and listPage', async () => {
      handler = paged(41)
      const params = parseListQuery({ page: '2', limit: '20' })
      const env = listPage(await run(params), params, 'usedesk')
      expect(env.data.map((r) => r.id)).toEqual(range(40).slice(20))
      expect(env.meta.hasMore).toBe(true)
    })

    it('a caller cursor fetches exactly that offset page and reports hasMore', async () => {
      handler = paged(250)
      const full = withPageSink({ cursor: '1', limit: 20 })
      const fullRows = await run(full)
      expect(calls.map((c) => c.body['offset'])).toEqual([1])
      expect(fullRows.map((r) => r.id)).toEqual(range(200).slice(100))
      expect(readUpstreamPage(full)?.hasMore).toBe(true)

      calls = []
      const last = withPageSink({ cursor: '2', limit: 20 })
      const lastRows = await run(last)
      expect(calls.map((c) => c.body['offset'])).toEqual([2])
      expect(lastRows.map((r) => r.id)).toEqual(range(250).slice(200))
      expect(readUpstreamPage(last)?.hasMore).toBe(false)
    })

    it("keeps one connection's rows away from another token", async () => {
      const other: Credentials = { accessToken: 'other' }
      handler = paged(100, 'a')
      await run(withPageSink({ page: 1, limit: 20 }))
      handler = paged(100, 'b')
      calls = []
      const rows =
        method === 'listTickets'
          ? await adapter.listTickets(other, withPageSink({ page: 2, limit: 20 }))
          : await adapter.listContacts(other, withPageSink({ page: 2, limit: 20 }))
      expect(rows.map((r) => r.id)).toEqual(range(40, 'b').slice(20))
      expect(calls.length).toBeGreaterThan(0)
    })
  })
}

describe('usedesk listTeams paging', () => {
  const run = (p: QueryParams) => adapter.listTeams(creds, p)

  it('serves every group once, in order, across pages of 2L+1 rows', async () => {
    const L = 5
    handler = whole(2 * L + 1)
    const { ids, hasMore } = await walk(run, L)
    expect(ids).toEqual(range(2 * L + 1))
    expect(hasMore).toEqual([true, true, false])
  })

  it('a limit above the maximum is clamped', async () => {
    handler = whole(600)
    const params = parseListQuery({ limit: '9999' })
    const rows = await run(params)
    expect(rows).toHaveLength(500)
    expect(listPage(rows, params, 'usedesk').meta.hasMore).toBe(true)
  })

  it('API path: page 2 through parseListQuery and listPage', async () => {
    handler = whole(41)
    const params = parseListQuery({ page: '2', limit: '20' })
    const env = listPage(await run(params), params, 'usedesk')
    expect(env.data.map((r) => r.id)).toEqual(range(40).slice(20))
    expect(env.meta.hasMore).toBe(true)
    expect(calls.every((c) => c.path === '/groups')).toBe(true)
    expect(calls.length).toBeGreaterThan(0)
    // 51418 documents only api_token: no undocumented offset goes out.
    expect(calls.every((c) => c.body['offset'] === undefined)).toBe(true)
  })
})
