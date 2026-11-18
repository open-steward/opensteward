/**
 * Faveo Helpdesk v3 list/read methods against a fake that honours only the
 * documented parameters.
 *
 * - GET v3/api/agent/ticket-threads/{ticketId}
 *   (https://developers.faveohelpdesk.com/ticket-threads-2/): "page integer
 *   Optional ... If not passed then current page will be 1. limit integer
 *   Optional ... If it is not passed, first 10 records will be returned."
 *   Response data: { current_page, last_page, total, ..., threads: [...] }
 * - GET v3/user-export-data (https://developers.faveohelpdesk.com/get-users-list/):
 *   "limit integer Optional Number of records needed in a page. page integer
 *   Optional Page number by default, it is set to 1."
 *   Response data: { current_page, last_page, total, ..., users: [...] }
 * - GET v3/api/admin/get-agent/{agentId}
 *   (https://developers.faveohelpdesk.com/get-agent-admin/): data: { agent: [ {...} ] }
 * - GET v3/api/dependency/{type} (https://developers.faveohelpdesk.com/dependency-list/),
 *   type agents or teams: "limit integer Optional Number of records that is needed
 *   to be fetched from DB. If it is not passed, first 10 records will be returned."
 *   No page parameter is documented. Response: { success, data: { <type>: [{ id, name }] } }
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
import { FaveoHelpdeskAdapter } from '../../../../../../src/verticals/customer-support/adapters/faveo-helpdesk/index'
import { MessageSchema } from '../../../../../../src/verticals/customer-support/schema/message'
import { ContactSchema } from '../../../../../../src/verticals/customer-support/schema/contact'
import { UserSchema } from '../../../../../../src/verticals/customer-support/schema/user'
import { TeamSchema } from '../../../../../../src/verticals/customer-support/schema/team'

/** A fresh token per test: the row pager remembers a walk per connection. */
let tokenSeq = 0
let creds: Credentials

interface Call {
  baseURL: string | undefined
  path: string
  params: Record<string, unknown>
}

let calls: Call[] = []
let rowCount = 0
/** Documented query parameters of v3/api/dependency/{type}. */
const DEPENDENCY_PARAMS = new Set([
  'search-query',
  'limit',
  'strict-search',
  'meta',
  'config',
  'supplements',
])

/** Laravel-style page of `rowCount` rows, honouring only page + limit. */
function laravelPage(params: Record<string, unknown>) {
  const page = typeof params['page'] === 'number' ? params['page'] : 1
  const limit = typeof params['limit'] === 'number' ? params['limit'] : 10
  const start = (page - 1) * limit
  const ids = Array.from({ length: rowCount }, (_, i) => i + 1).slice(start, start + limit)
  return {
    ids,
    meta: {
      current_page: page,
      from: ids.length ? start + 1 : null,
      last_page: Math.max(1, Math.ceil(rowCount / limit)),
      per_page: limit,
      to: ids.length ? start + ids.length : null,
      total: rowCount,
    },
  }
}

function route(path: string, params: Record<string, unknown>): unknown {
  let m = /^\/v3\/api\/agent\/ticket-threads\/(\d+)$/.exec(path)
  if (m) {
    const { ids, meta } = laravelPage(params)
    return {
      success: true,
      data: {
        ...meta,
        threads: ids.map((id) => ({
          id,
          user_id: null,
          title: `t${id}`,
          body: `b${id}`,
          created_at: '2018-03-20 05:17:24',
          attach: [],
        })),
      },
    }
  }
  if (path === '/v3/user-export-data') {
    const { ids, meta } = laravelPage(params)
    return {
      success: true,
      data: {
        ...meta,
        users: ids.map((id) => ({
          id,
          email: `u${id}@example.com`,
          full_name: `User ${id}`,
          mobile: '9876543210',
          roles: 'User',
        })),
      },
    }
  }
  m = /^\/v3\/api\/dependency\/(agents|teams)$/.exec(path)
  if (m) {
    for (const k of Object.keys(params)) {
      if (!DEPENDENCY_PARAMS.has(k)) throw new Error(`undocumented dependency param ${k}`)
    }
    const limit = typeof params['limit'] === 'number' ? params['limit'] : 10
    const ids = Array.from({ length: rowCount }, (_, i) => i + 1).slice(0, limit)
    return { success: true, data: { [m[1]!]: ids.map((id) => ({ id, name: `${m![1]} ${id}` })) } }
  }
  m = /^\/v3\/api\/admin\/get-agent\/(\d+)$/.exec(path)
  if (m) {
    const n = Number(m[1])
    if (n !== 101 && !(n >= 1 && n <= rowCount)) return { success: false, Message: 'Not found' }
    return {
      success: true,
      data: {
        agent: [
          {
            id: n,
            user_name: 'krishna',
            role: 'agent',
            email: 'krishna@faveo.com',
            active: 1,
            departments: [{ id: 1, name: 'Support' }],
            teams: [{ id: 1, name: 'Level 1 Support' }],
            name: 'Krishna Vishwakarma',
          },
        ],
      },
    }
  }
  throw Object.assign(new Error(`404 ${path}`), { response: { status: 404 } })
}

beforeEach(() => {
  creds = { accessToken: `jwt-${++tokenSeq}`, extra: { baseUrl: 'https://helpdesk.example.test' } }
  calls = []
  rowCount = 0
  vi.spyOn(axios, 'create').mockImplementation(
    (config) =>
      ({
        get: async (path: string, cfg?: { params?: Record<string, unknown> }) => {
          const params = { ...(cfg?.params ?? {}) }
          calls.push({ baseURL: config?.baseURL, path, params })
          return { data: route(path, params) }
        },
      }) as unknown as ReturnType<typeof axios.create>,
  )
})

afterEach(() => {
  vi.restoreAllMocks()
})

const adapter = new FaveoHelpdeskAdapter()
const range = (n: number) => Array.from({ length: n }, (_, i) => String(i + 1))

async function walk(run: (p: QueryParams) => Promise<{ id: string }[]>, L: number) {
  const ids: string[] = []
  const hasMore: (boolean | undefined)[] = []
  for (const page of [1, 2, 3]) {
    const params = withPageSink({ page, limit: L })
    const rows = await run(params)
    ids.push(...rows.map((r) => r.id))
    hasMore.push(listPage(rows, params, 'faveo-helpdesk').meta.hasMore ?? undefined)
  }
  return { ids, hasMore }
}

describe('faveo-helpdesk listMessages (v3/api/agent/ticket-threads/{ticketId})', () => {
  const run = (p: QueryParams) => adapter.listMessages(creds, '10394', p)

  it('serves every thread once across 2L+1 rows, hasMore exact', async () => {
    const L = 10
    rowCount = 2 * L + 1
    const { ids, hasMore } = await walk(run, L)
    expect(ids).toEqual(range(2 * L + 1))
    expect(hasMore).toEqual([true, true, false])
  })

  it('sends the documented path and exactly page + limit', async () => {
    rowCount = 30
    const rows = await run(withPageSink({ page: 2, limit: 7 }))
    expect(calls).toEqual([
      {
        baseURL: 'https://helpdesk.example.test',
        path: '/v3/api/agent/ticket-threads/10394',
        params: { page: 2, limit: 7 },
      },
    ])
    for (const r of rows) MessageSchema.parse(r)
    expect(rows.map((r) => r.ticketId)).toEqual(Array(7).fill('10394'))
  })

  it("reports the platform's own page counts", async () => {
    rowCount = 21
    const params = withPageSink({ page: 2, limit: 10 })
    await run(params)
    expect(readUpstreamPage(params)).toEqual({
      currentPage: 2,
      totalPages: 3,
      totalCount: 21,
      hasMore: true,
    })
  })

  it('reports hasMore false on the last page', async () => {
    rowCount = 21
    const params = withPageSink({ page: 3, limit: 10 })
    await run(params)
    expect(readUpstreamPage(params)).toEqual({
      currentPage: 3,
      totalPages: 3,
      totalCount: 21,
      hasMore: false,
    })
  })

  it('API path: page 2 through parseListQuery and listPage', async () => {
    rowCount = 41
    const params = parseListQuery({ page: '2', limit: '20' })
    const env = listPage(await run(params), params, 'faveo-helpdesk')
    expect(env.data.map((r) => r.id)).toEqual(range(40).slice(20))
    expect(env.meta.hasMore).toBe(true)
  })

  it('throws when the response carries no data.threads', async () => {
    vi.restoreAllMocks()
    vi.spyOn(axios, 'create').mockImplementation(
      () =>
        ({
          get: async () => ({ data: { success: false, message: 'API disabled' } }),
        }) as unknown as ReturnType<typeof axios.create>,
    )
    await expect(run(withPageSink({ page: 1, limit: 5 }))).rejects.toThrow(/API disabled/)
  })
})

describe('faveo-helpdesk listContacts (v3/user-export-data)', () => {
  const run = (p: QueryParams) => adapter.listContacts(creds, p)

  it('serves every user once across 2L+1 rows, hasMore exact', async () => {
    const L = 10
    rowCount = 2 * L + 1
    const { ids, hasMore } = await walk(run, L)
    expect(ids).toEqual(range(2 * L + 1))
    expect(hasMore).toEqual([true, true, false])
  })

  it('sends the documented path, outside /v3/api, with exactly page + limit', async () => {
    rowCount = 5
    const rows = await run(withPageSink({ page: 1, limit: 3 }))
    expect(calls).toEqual([
      {
        baseURL: 'https://helpdesk.example.test',
        path: '/v3/user-export-data',
        params: { page: 1, limit: 3 },
      },
    ])
    for (const r of rows) ContactSchema.parse(r)
  })

  it('throws on the documented error response instead of serving an empty page', async () => {
    vi.restoreAllMocks()
    vi.spyOn(axios, 'create').mockImplementation(
      () =>
        ({
          get: async () => ({ data: { success: false, Message: 'No data available in table' } }),
        }) as unknown as ReturnType<typeof axios.create>,
    )
    await expect(run(withPageSink({ page: 1, limit: 5 }))).rejects.toThrow(/no data.users/)
  })

  it('does not pass a search through (only page and limit are sent)', async () => {
    rowCount = 3
    await run(withPageSink({ page: 1, limit: 3, search: 'alan' } as QueryParams))
    expect(Object.keys(calls[0]!.params).sort()).toEqual(['limit', 'page'])
  })
})

describe('faveo-helpdesk refusals', () => {
  it('getContact throws 501 NOT_SUPPORTED and sends no request', async () => {
    await expect(adapter.getContact(creds, '4')).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(calls).toEqual([])
  })
})

describe('faveo-helpdesk getUser (v3/api/admin/get-agent/{agentId})', () => {
  it('reads one agent from the documented path', async () => {
    const u = UserSchema.parse(await adapter.getUser(creds, '101'))
    expect(calls.map((c) => c.path)).toEqual(['/v3/api/admin/get-agent/101'])
    expect(u).toMatchObject({ id: '101', name: 'Krishna Vishwakarma', teamIds: ['1'] })
  })

  it('an unknown agent is a 404', async () => {
    await expect(adapter.getUser(creds, '7')).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('faveo-helpdesk listUsers (v3/api/dependency/agents, then get-agent per row)', () => {
  const run = (p: QueryParams) => adapter.listUsers(creds, p)

  it('serves every agent once across 2L+1 rows, hasMore exact', async () => {
    const L = 4
    rowCount = 2 * L + 1
    const { ids, hasMore } = await walk(run, L)
    expect(ids).toEqual(range(2 * L + 1))
    expect(hasMore).toEqual([true, true, false])
  })

  it('an exact multiple of the page size ends with hasMore false', async () => {
    rowCount = 8
    const params = withPageSink({ page: 2, limit: 4 })
    const rows = await run(params)
    expect(rows.map((r) => r.id)).toEqual(['5', '6', '7', '8'])
    expect(readUpstreamPage(params)).toMatchObject({ hasMore: false })
  })

  it('asks for a documented limit only, then reads each agent on the page', async () => {
    rowCount = 30
    const rows = await run(withPageSink({ page: 2, limit: 3 }))
    expect(calls).toEqual([
      {
        baseURL: 'https://helpdesk.example.test',
        path: '/v3/api/dependency/agents',
        params: { limit: 100 },
      },
      { baseURL: 'https://helpdesk.example.test', path: '/v3/api/admin/get-agent/4', params: {} },
      { baseURL: 'https://helpdesk.example.test', path: '/v3/api/admin/get-agent/5', params: {} },
      { baseURL: 'https://helpdesk.example.test', path: '/v3/api/admin/get-agent/6', params: {} },
    ])
    for (const r of rows) UserSchema.parse(r)
    expect(rows.map((r) => r.teamIds)).toEqual([['1'], ['1'], ['1']])
  })

  it('throws when the response carries no data.agents', async () => {
    vi.restoreAllMocks()
    vi.spyOn(axios, 'create').mockImplementation(
      () =>
        ({
          get: async () => ({ data: { success: false, message: 'Unauthorized' } }),
        }) as unknown as ReturnType<typeof axios.create>,
    )
    await expect(run(withPageSink({ page: 1, limit: 5 }))).rejects.toThrow(/data.agents/)
  })
})

describe('faveo-helpdesk listTeams / getTeam (v3/api/dependency/teams)', () => {
  const run = (p: QueryParams) => adapter.listTeams(creds, p)

  it('serves every team once across 2L+1 rows, hasMore exact', async () => {
    const L = 5
    rowCount = 2 * L + 1
    const { ids, hasMore } = await walk(run, L)
    expect(ids).toEqual(range(2 * L + 1))
    expect(hasMore).toEqual([true, true, false])
  })

  it('sends only the documented limit', async () => {
    rowCount = 30
    const rows = await run(withPageSink({ page: 3, limit: 4 }))
    expect(calls).toEqual([
      {
        baseURL: 'https://helpdesk.example.test',
        path: '/v3/api/dependency/teams',
        params: { limit: 100 },
      },
    ])
    expect(rows.map((r) => TeamSchema.parse(r).id)).toEqual(['9', '10', '11', '12'])
    expect(rows[0]!.name).toBe('teams 9')
  })

  it('a page past the end is empty with hasMore false', async () => {
    rowCount = 3
    const params = withPageSink({ page: 2, limit: 5 })
    expect(await run(params)).toEqual([])
    expect(readUpstreamPage(params)).toMatchObject({ hasMore: false })
  })

  it('walks past the first 100-row prefix when caller pages straddle it', async () => {
    const L = 60
    rowCount = 2 * L + 1
    const { ids, hasMore } = await walk(run, L)
    expect(ids).toEqual(range(2 * L + 1))
    expect(hasMore).toEqual([true, true, false])
    expect(new Set(calls.map((c) => c.params['limit']))).toEqual(new Set([100, 200]))
  })

  it('a list of exactly 100 rows ends with hasMore false', async () => {
    rowCount = 100
    const params = withPageSink({ page: 2, limit: 50 })
    const rows = await run(params)
    expect(rows.map((r) => r.id)).toEqual(range(100).slice(50))
    expect(readUpstreamPage(params)).toMatchObject({ hasMore: false })
  })

  it('throws when the response carries no data.teams', async () => {
    vi.restoreAllMocks()
    vi.spyOn(axios, 'create').mockImplementation(
      () =>
        ({
          get: async () => ({ data: { success: false, message: 'Unauthorized' } }),
        }) as unknown as ReturnType<typeof axios.create>,
    )
    await expect(run(withPageSink({ page: 1, limit: 5 }))).rejects.toThrow(/data.teams/)
  })

  it('getTeam widens the limit until the id is found', async () => {
    rowCount = 150
    const t = TeamSchema.parse(await adapter.getTeam(creds, '130'))
    expect(t).toMatchObject({ id: '130', name: 'teams 130' })
    expect(calls.map((c) => c.params)).toEqual([{ limit: 100 }, { limit: 200 }])
  })

  it('getTeam is a 404 once the whole list is in hand without the id', async () => {
    rowCount = 150
    await expect(adapter.getTeam(creds, '151')).rejects.toMatchObject({ statusCode: 404 })
    expect(calls.map((c) => c.params)).toEqual([{ limit: 100 }, { limit: 200 }])
  })
})
