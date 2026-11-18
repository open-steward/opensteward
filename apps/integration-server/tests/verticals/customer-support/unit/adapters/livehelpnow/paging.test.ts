/**
 * LiveHelpNow list paging.
 *
 * GET /api/tickets (https://developer.livehelpnow.net/docs/api/endpoint/ticket/tickets):
 *
 *   "start_index optional Set start index for result set"
 *   "count optional Set the count/limit for page"
 *   "total_rows The total number of tickets matched"
 *
 * Every documented example answers a request that sends no `start_index` with
 * `"start_index" : 1`, so the first row is index 1. The docs name no maximum
 * `count`, so the adapter declares no maxPageSize.
 *
 * GET /api/ticket/{id}, GET /api/departments, GET /api/canned_sets,
 * GET /api/canned_sets/{id}/items and GET /api/analytics/chat/contact_list
 * document no paging parameter at all: each response is the whole collection,
 * which the adapter pages locally.
 *
 * The fake honours ONLY `start_index` (1-based, default 1) and `count`
 * (default 20) on /api/tickets, and ignores any paging parameter elsewhere.
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
  type PageMaxBearing,
} from '@opensteward/shared'
import { LivehelpnowAdapter } from '../../../../../../src/verticals/customer-support/adapters/livehelpnow/index'

const creds: Credentials = { accessToken: 'tok' }

interface Call {
  path: string
  params: Record<string, unknown>
}

let calls: Call[] = []
let respond: (path: string, params: Record<string, unknown>) => unknown

beforeEach(() => {
  calls = []
  vi.spyOn(axios, 'create').mockImplementation(
    () =>
      ({
        get: async (path: string, cfg?: { params?: Record<string, unknown> }) => {
          const params = { ...(cfg?.params ?? {}) }
          calls.push({ path, params })
          return { data: respond(path, params) }
        },
      }) as unknown as ReturnType<typeof axios.create>,
  )
})

afterEach(() => {
  vi.restoreAllMocks()
})

const adapter = new LivehelpnowAdapter()

const L = 3
const N = 2 * L + 1

function ticketRows(n: number) {
  return Array.from({ length: n }, (_, i) => ({
    id: 1000 + i,
    title: `t${i}`,
    status: 'Open',
    created_time: '2026-01-15T09:00:00',
    updated_time: '2026-01-15T09:00:00',
  }))
}

function ticketsFake(all: Array<Record<string, unknown>>) {
  return (path: string, params: Record<string, unknown>) => {
    if (path !== '/api/tickets') throw new Error(`unexpected path ${path}`)
    const start = params['start_index'] === undefined ? 1 : Number(params['start_index'])
    const count = params['count'] === undefined ? 20 : Number(params['count'])
    const tickets = all.slice(start - 1, start - 1 + count)
    return {
      payload: { tickets, count: tickets.length, start_index: start, total_rows: all.length },
      status: 'ok',
    }
  }
}

describe('LivehelpnowAdapter.listTickets pages by start_index + count', () => {
  beforeEach(() => {
    respond = ticketsFake(ticketRows(N))
  })

  it('serves every ticket once, in order, across pages 1..3 with exact hasMore', async () => {
    const seen: string[] = []
    const hasMore: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const got = await adapter.listTickets(creds, params)
      seen.push(...got.map((t) => t.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(Array.from({ length: N }, (_, i) => String(1000 + i)))
    expect(hasMore).toEqual([true, true, false])
  })

  it('sends start_index = (page - 1) x limit + 1 and count = limit on page 2', async () => {
    await adapter.listTickets(creds, withPageSink({ page: 2, limit: L }))
    expect(calls).toHaveLength(1)
    expect(calls[0]!.params['start_index']).toBe(L + 1)
    expect(calls[0]!.params['count']).toBe(L)
  })

  it('reports total_rows as the total', async () => {
    const params = withPageSink({ page: 1, limit: L })
    await adapter.listTickets(creds, params)
    expect(readUpstreamPage(params)?.totalCount).toBe(N)
  })

  it('ends the walk on an empty page even when a stale total_rows promises more', async () => {
    respond = () => ({
      payload: { tickets: [], count: 0, start_index: 7, total_rows: 50 },
      status: 'ok',
    })
    const params = withPageSink({ page: 3, limit: L })
    expect(await adapter.listTickets(creds, params)).toEqual([])
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('without total_rows, a short page ends the walk and a full page reports nothing', async () => {
    const rows = ticketRows(N)
    respond = (path, p) => {
      const out = ticketsFake(rows)(path, p) as { payload: Record<string, unknown> }
      delete out.payload['total_rows']
      return out
    }
    const short = withPageSink({ page: 3, limit: L })
    expect(await adapter.listTickets(creds, short)).toHaveLength(1)
    expect(readUpstreamPage(short)?.hasMore).toBe(false)

    const full = withPageSink({ page: 1, limit: L })
    expect(await adapter.listTickets(creds, full)).toHaveLength(L)
    expect(readUpstreamPage(full)?.hasMore).toBeUndefined()
  })

  it('sends a legacy numeric cursor raw as start_index when no page is given', async () => {
    await adapter.listTickets(creds, { cursor: '5', limit: L } as QueryParams)
    expect(calls).toHaveLength(1)
    expect(calls[0]!.params['start_index']).toBe(5)
    expect(calls[0]!.params['count']).toBe(L)
  })

  it('serves pages 2 and 3 through parseListQuery and listPage on the API path', async () => {
    const p2 = parseListQuery({ page: '2', limit: String(L) }, adapter as PageMaxBearing)
    const env2 = listPage(await adapter.listTickets(creds, p2), p2, 'livehelpnow')
    expect(env2.data.map((t) => t.id)).toEqual(['1003', '1004', '1005'])
    expect(env2.meta.hasMore).toBe(true)
    expect(calls.at(-1)!.params['start_index']).toBe(L + 1)

    const p3 = parseListQuery({ page: '3', limit: String(L) }, adapter as PageMaxBearing)
    const env3 = listPage(await adapter.listTickets(creds, p3), p3, 'livehelpnow')
    expect(env3.data.map((t) => t.id)).toEqual(['1006'])
    expect(env3.meta.hasMore).toBe(false)
  })
})

describe('LivehelpnowAdapter page size', () => {
  it('declares no maxPageSize: the docs name no maximum count', () => {
    expect(
      (adapter as { capabilities?: { maxPageSize?: number } }).capabilities?.maxPageSize,
    ).toBeUndefined()
  })

  it('sends a large caller limit through unchanged', async () => {
    respond = ticketsFake(ticketRows(3))
    await adapter.listTickets(creds, withPageSink({ page: 1, limit: 500 }))
    expect(calls[0]!.params['count']).toBe(500)
    expect(calls[0]!.params['start_index']).toBe(1)
  })
})

type Lister = (params: QueryParams) => Promise<Array<{ id: string }>>

const WHOLE: Array<{
  name: string
  list: Lister
  respond: (path: string) => unknown
  ids: string[]
}> = [
  {
    name: 'listMessages',
    list: (p) => adapter.listMessages(creds, '77', p),
    respond: (path) => {
      if (path !== '/api/ticket/77') throw new Error(`unexpected path ${path}`)
      return {
        payload: {
          id: 77,
          actions: Array.from({ length: N }, (_, i) => ({
            action: `a${i}`,
            action_date: '2026-01-15T09:00:00',
            action_log: 'Agent',
          })),
        },
        status: 'ok',
      }
    },
    ids: Array.from({ length: N }, (_, i) => `77:action:${i}`),
  },
  {
    name: 'listContacts',
    list: (p) => adapter.listContacts(creds, p),
    respond: (path) => {
      if (path !== '/api/analytics/chat/contact_list') throw new Error(`unexpected path ${path}`)
      return {
        payload: Array.from({ length: N }, (_, i) => ({
          VisitorID: `v${i}`,
          ChatID: i,
          Detail4: `v${i}@example.test`,
        })),
        status: 'ok',
      }
    },
    ids: Array.from({ length: N }, (_, i) => `v${i}`),
  },
  {
    name: 'listTeams',
    list: (p) => adapter.listTeams(creds, p),
    respond: (path) => {
      if (path !== '/api/departments') throw new Error(`unexpected path ${path}`)
      return {
        payload: Array.from({ length: N }, (_, i) => ({
          department_id: 100 + i,
          department_name: `D${i}`,
        })),
        status: 'ok',
      }
    },
    ids: Array.from({ length: N }, (_, i) => String(100 + i)),
  },
  {
    name: 'listUsers',
    list: (p) => adapter.listUsers(creds, p),
    respond: (path) => {
      if (path !== '/api/departments') throw new Error(`unexpected path ${path}`)
      return {
        payload: [
          {
            department_id: 1,
            department_name: 'D',
            operators: Array.from({ length: N }, (_, i) => ({
              id: 500 + i,
              email: `o${i}@example.test`,
              first_name: 'O',
              last_name: `${i}`,
              enabled: true,
            })),
          },
        ],
        status: 'ok',
      }
    },
    ids: Array.from({ length: N }, (_, i) => String(500 + i)),
  },
  {
    name: 'listMacros',
    list: (p) => adapter.listMacros(creds, p),
    respond: (path) => {
      if (path === '/api/canned_sets') {
        return { payload: { canned_sets: [{ id: 9, name: 'S', enabled: true }] }, status: 'ok' }
      }
      if (path !== '/api/canned_sets/9/items') throw new Error(`unexpected path ${path}`)
      return {
        payload: {
          canned_items: Array.from({ length: N }, (_, i) => ({
            id: 900 + i,
            title: `m${i}`,
            message: `body ${i}`,
            enabled: true,
          })),
        },
        status: 'ok',
      }
    },
    ids: Array.from({ length: N }, (_, i) => String(900 + i)),
  },
]

describe.each(WHOLE)('LivehelpnowAdapter.$name pages an unpaginated response locally', (m) => {
  beforeEach(() => {
    respond = (path) => m.respond(path)
  })

  it('serves every row once, in order, across pages 1..3 with exact hasMore', async () => {
    const seen: string[] = []
    const hasMore: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const got = await m.list(params)
      seen.push(...got.map((r) => r.id))
      hasMore.push(readUpstreamPage(params)?.hasMore)
      expect(readUpstreamPage(params)?.pagedLocally).toBe(true)
    }
    expect(seen).toEqual(m.ids)
    expect(hasMore).toEqual([true, true, false])
  })

  it('serves page 3 through parseListQuery and listPage on the API path', async () => {
    const p3 = parseListQuery({ page: '3', limit: String(L) }, adapter as PageMaxBearing)
    const env3 = listPage(await m.list(p3), p3, 'livehelpnow')
    expect(env3.data.map((r) => r.id)).toEqual([m.ids[N - 1]])
    expect(env3.meta.hasMore).toBe(false)
  })
})
