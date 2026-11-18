/**
 * Pyrus list paging.
 *
 * From https://pyrus.com/en/help/api/lists (GET /inbox):
 *
 *   "This method returns all inbox tasks, including tasks organized into groups."
 *   Parameters: "item_count The maximum number of tasks in the response, the default
 *   is 50." The response example carries "has_more": false. No offset, page or
 *   cursor parameter is documented, so the only way to reach row N is to ask for
 *   the first N rows: page k asks for item_count = k × limit and keeps its last
 *   `limit` rows, and `has_more` says whether rows exist beyond them.
 *
 * From https://pyrus.com/en/help/api/members (GET /members):
 *   "This method returns a list of all organization participants." (no parameters)
 *
 * From https://pyrus.com/en/help/api/contacts (GET /contacts):
 *   "This method returns a list of contacts available to the current user and grouped
 *   by organization." Parameters: "include_inactive Includes former and inactive
 *   employees in response to request." The response carries organizations[].persons
 *   and organizations[].roles.
 *
 * From https://pyrus.com/en/help/api/tasks (GET /tasks/{task-id}):
 *   "Getting a simple task with all comments".
 *
 * No maximum item_count is documented, so the adapter declares none.
 *
 * The fake honours ONLY those parameters and refuses any other.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import axios from 'axios'
import {
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type Credentials,
  type QueryParams,
} from '@opensteward/shared'
import { PyrusAdapter } from '../../../../../../src/verticals/customer-support/adapters/pyrus/index'

const creds: Credentials = { accessToken: 'pyrus_test' }

interface Call {
  path: string
  params: Record<string, unknown>
}

let calls: Call[] = []
let total = 0
/** A server-side cap on item_count the docs do not state; Infinity unless a test sets it. */
let inboxCap = Infinity
/** When true the fake returns the whole inbox whatever item_count says. */
let inboxIgnoresItemCount = false

const ids = () => Array.from({ length: total }, (_, i) => i + 1)

function only(path: string, params: Record<string, unknown>, allowed: string[]): void {
  for (const k of Object.keys(params)) {
    if (!allowed.includes(k)) throw new Error(`undocumented param ${k} on ${path}`)
  }
}

function respond(path: string, params: Record<string, unknown>): unknown {
  if (path === '/inbox') {
    only(path, params, ['item_count', 'group_item_count'])
    const count = inboxIgnoresItemCount
      ? total
      : Math.min(inboxCap, params['item_count'] === undefined ? 50 : Number(params['item_count']))
    return {
      tasks: ids()
        .slice(0, count)
        .map((id) => ({ id, create_date: '2024-01-01T00:00:00Z', text: `t${id}` })),
      has_more: total > count,
    }
  }
  if (path === '/members') {
    only(path, params, [])
    return { members: ids().map((id) => ({ id, first_name: 'M', last_name: `${id}` })) }
  }
  if (path === '/contacts') {
    only(path, params, ['include_inactive'])
    // Split across two organizations, so flattening order is exercised.
    const all = ids()
    const half = Math.ceil(all.length / 2)
    return {
      organizations: [all.slice(0, half), all.slice(half)].map((chunk, i) => ({
        organization_id: 100 + i,
        name: `org${i}`,
        persons: chunk.map((id) => ({ id, first_name: 'P', last_name: `${id}`, type: 'user' })),
        roles: chunk.map((id) => ({ id, name: `role${id}` })),
      })),
    }
  }
  const m = /^\/tasks\/(\w+)$/.exec(path)
  if (m) {
    only(path, params, [])
    return {
      task: {
        id: Number(m[1]),
        comments: ids().map((id) => ({ id, text: `c${id}`, create_date: '2024-01-01T00:00:00Z' })),
      },
    }
  }
  throw new Error(`unexpected path ${path}`)
}

beforeEach(() => {
  calls = []
  total = 0
  inboxCap = Infinity
  inboxIgnoresItemCount = false
  vi.spyOn(axios, 'create').mockImplementation(() => {
    return {
      get: async (path: string, cfg?: { params?: Record<string, unknown> }) => {
        const params = { ...(cfg?.params ?? {}) }
        calls.push({ path, params })
        return { data: respond(path, params) }
      },
      post: vi.fn(),
    } as unknown as ReturnType<typeof axios.create>
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

const adapter = new PyrusAdapter()

async function walk(run: (p: QueryParams) => Promise<Array<{ id: string }>>, limit: number) {
  const seen: string[] = []
  const reported: Array<boolean | undefined> = []
  const meta: Array<boolean | null | undefined> = []
  for (const page of [1, 2, 3]) {
    const params = withPageSink({ page, limit })
    const rows = await run(params)
    seen.push(...rows.map((r) => r.id))
    reported.push(readUpstreamPage(params)?.hasMore)
    meta.push(listPage(rows, params, 'pyrus').meta.hasMore)
  }
  return { seen, reported, meta }
}

describe('pyrus listTickets pages /inbox by growing item_count', () => {
  const run = (p: QueryParams) => adapter.listTickets(creds, p)

  it('serves 2L+1 rows once, in order, over pages 1..3, with hasMore exact', async () => {
    const L = 4
    total = 2 * L + 1
    const { seen, reported, meta } = await walk(run, L)
    expect(seen).toEqual(ids().map(String))
    expect(reported).toEqual([true, true, false])
    expect(meta).toEqual([true, true, false])
  })

  it('reports hasMore false when page 2 ends exactly at the last row', async () => {
    total = 8
    const params = withPageSink({ page: 2, limit: 4 })
    const rows = await run(params)
    expect(rows.map((r) => r.id)).toEqual(['5', '6', '7', '8'])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('page 2 asks for item_count = 2 × limit', async () => {
    total = 9
    await run(withPageSink({ page: 2, limit: 4 }))
    expect(calls).toEqual([{ path: '/inbox', params: { item_count: 8 } }])
  })

  it('a page past the end is empty with hasMore false', async () => {
    total = 3
    const params = withPageSink({ page: 3, limit: 4 })
    expect(await run(params)).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('throws rather than loop when the inbox caps item_count below the page', async () => {
    total = 20
    inboxCap = 6
    await expect(run(withPageSink({ page: 2, limit: 6 }))).rejects.toThrow(/past what it serves/)
  })

  it('trims to limit and reports hasMore when the inbox returns more than item_count', async () => {
    total = 20
    inboxIgnoresItemCount = true
    const params = withPageSink({ page: 2, limit: 4 })
    const rows = await run(params)
    expect(rows.map((r) => r.id)).toEqual(['5', '6', '7', '8'])
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })

  it('a partial cap yields a short page with hasMore, then the next page throws', async () => {
    total = 20
    inboxCap = 7
    const p2 = withPageSink({ page: 2, limit: 4 })
    expect((await run(p2)).map((r) => r.id)).toEqual(['5', '6', '7'])
    expect(readUpstreamPage(p2)?.hasMore).toBe(true)
    await expect(run(withPageSink({ page: 3, limit: 4 }))).rejects.toThrow(/past what it serves/)
  })

  it('a limit above the router cap is clamped (no Pyrus maximum is documented)', async () => {
    total = 3
    const params = parseListQuery({ limit: '9999' })
    expect(params.limit).toBe(500)
    await run(params)
    expect(calls[0]!.params['item_count']).toBe(500)
  })

  it('API path: page 2 through parseListQuery and listPage', async () => {
    total = 9
    const params = parseListQuery({ page: '2', limit: '4' })
    const env = listPage(await run(params), params, 'pyrus')
    expect(env.data.map((r) => r.id)).toEqual(['5', '6', '7', '8'])
    expect(env.meta.hasMore).toBe(true)
    expect(calls[0]!.params['item_count']).toBe(8)
  })
})

const methods: {
  name: string
  path: string
  run: (p: QueryParams) => Promise<Array<{ id: string }>>
}[] = [
  { name: 'listMessages', path: '/tasks/77', run: (p) => adapter.listMessages(creds, '77', p) },
  { name: 'listContacts', path: '/contacts', run: (p) => adapter.listContacts(creds, p) },
  { name: 'listUsers', path: '/members', run: (p) => adapter.listUsers(creds, p) },
  { name: 'listTeams', path: '/contacts', run: (p) => adapter.listTeams(creds, p) },
]

for (const { name, path, run } of methods) {
  describe(`pyrus ${name} pages the whole collection locally`, () => {
    it('serves 2L+1 rows once, in order, over pages 1..3, with hasMore exact', async () => {
      const L = 4
      total = 2 * L + 1
      const { seen, reported, meta } = await walk(run, L)
      expect(seen).toEqual(ids().map(String))
      expect(reported).toEqual([true, true, false])
      expect(meta).toEqual([true, true, false])
    })

    it('sends no paging parameters (the endpoint documents none)', async () => {
      total = 9
      await run(withPageSink({ page: 2, limit: 4 }))
      expect(calls).toHaveLength(1)
      expect(calls[0]!.path).toBe(path)
      expect(calls[0]!.params).toEqual({})
    })

    it('a limit above the router cap is clamped', async () => {
      total = 600
      const params = parseListQuery({ limit: '9999' })
      expect(params.limit).toBe(500)
      expect(await run(params)).toHaveLength(500)
    })

    it('API path: page 2 through parseListQuery and listPage', async () => {
      total = 9
      const params = parseListQuery({ page: '2', limit: '4' })
      const env = listPage(await run(params), params, 'pyrus')
      expect(env.data.map((r) => r.id)).toEqual(['5', '6', '7', '8'])
      expect(env.meta.hasMore).toBe(true)
      expect(env.meta.totalCount).toBe(9)
    })
  })
}

describe('pyrus listContacts keeps include_inactive across pages', () => {
  it('page 2 with includeInactive sends include_inactive and slices locally', async () => {
    total = 9
    const params = withPageSink({ page: 2, limit: 4, includeInactive: 'true' } as QueryParams)
    const rows = await adapter.listContacts(creds, params)
    expect(rows.map((r) => r.id)).toEqual(['5', '6', '7', '8'])
    expect(calls[0]!.params).toEqual({ include_inactive: true })
  })
})
