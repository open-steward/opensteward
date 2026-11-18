/**
 * osTicket list paging.
 *
 * The list endpoints come from the API Endpoints Plugin the adapter targets
 * (markus-michalski/osticket-api-endpoints). Its OpenAPI spec,
 * https://github.com/markus-michalski/osticket-api-endpoints/blob/main/openapi.yaml,
 * documents GET /tickets-search.php:
 *
 *   "Search tickets by query string, status, department, and other filters.
 *    Supports pagination and sorting."
 *   "Returns a **direct JSON array** (not wrapped in an object)."
 *   limit:  "Maximum results per page (default 20, max 100)"
 *   offset: "Pagination offset"
 *
 * No count or next marker is returned, so a short page is the only end signal.
 * Its TicketService caps a larger limit at 100 ("Values above 100 are capped at 100").
 *
 * GET /tickets-get.php/{number}.json: "Get full ticket details including all
 * thread entries (messages, responses, notes)." It takes no paging parameter,
 * so listMessages pages the whole thread locally.
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
import { OsticketAdapter } from '../../../../../../src/verticals/customer-support/adapters/osticket/index'

const creds: Credentials = {
  accessToken: 'ost_test',
  extra: { baseUrl: 'https://osticket.example.test' },
}

interface Call {
  path: string
  params: Record<string, unknown>
}

let calls: Call[] = []
let total = 0

const SEARCH_PARAMS = new Set(['query', 'status', 'department', 'limit', 'offset', 'sort'])

const ids = () => Array.from({ length: total }, (_, i) => i + 1)

function respond(path: string, params: Record<string, unknown>): unknown {
  if (path === '/tickets-search.php') {
    for (const k of Object.keys(params)) {
      if (!SEARCH_PARAMS.has(k)) throw new Error(`undocumented param ${k} on ${path}`)
    }
    // Plugin: null/invalid -> 20, above 100 -> 100.
    const raw = params['limit'] === undefined ? 20 : Number(params['limit'])
    const limit = raw < 1 ? 20 : Math.min(raw, 100)
    const offset = Math.max(0, Number(params['offset'] ?? 0))
    return ids()
      .slice(offset, offset + limit)
      .map((id) => ({ id, number: String(100000 + id), created: '2026-01-01T00:00:00Z' }))
  }
  const m = /^\/tickets-get\.php\/([^/]+)\.json$/.exec(path)
  if (m) {
    if (Object.keys(params).length > 0) throw new Error(`undocumented params on ${path}`)
    return {
      id: 77,
      number: m[1],
      created: '2026-01-01T00:00:00Z',
      thread: ids().map((id) => ({
        id,
        type: 'message',
        body: `b${id}`,
        created: '2026-01-01T00:00:00Z',
      })),
    }
  }
  throw new Error(`unexpected path ${path}`)
}

beforeEach(() => {
  calls = []
  total = 0
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

const adapter = new OsticketAdapter()

async function walk(run: (p: QueryParams) => Promise<Array<{ id: string }>>, limit: number) {
  const seen: string[] = []
  const reported: Array<boolean | undefined> = []
  const meta: Array<boolean | null | undefined> = []
  for (const page of [1, 2, 3]) {
    const params = withPageSink({ page, limit })
    const rows = await run(params)
    seen.push(...rows.map((r) => r.id))
    reported.push(readUpstreamPage(params)?.hasMore)
    meta.push(listPage(rows, params, 'osticket').meta.hasMore)
  }
  return { seen, reported, meta }
}

describe('osticket capabilities', () => {
  it('declares the documented tickets-search maximum of 100', () => {
    expect(adapter.capabilities.maxPageSize).toBe(100)
  })
})

describe('osticket listTickets pages by limit + offset', () => {
  const run = (p: QueryParams) => adapter.listTickets(creds, p)

  it('serves 2L+1 rows once, in order, over pages 1..3', async () => {
    const L = 4
    total = 2 * L + 1
    const { seen, meta } = await walk(run, L)
    expect(seen).toEqual(ids().map(String))
    // No count or next marker: a full page is unknown, the short page ends it.
    expect(meta).toEqual([null, null, false])
  })

  it('reports hasMore false on the short last page, and nothing on a full one', async () => {
    total = 9
    const full = withPageSink({ page: 2, limit: 4 })
    await run(full)
    expect(readUpstreamPage(full)?.hasMore).toBeUndefined()
    // limit 4 was not clamped, so no pageSize override is reported
    expect(readUpstreamPage(full)?.pageSize).toBeUndefined()
    const last = withPageSink({ page: 3, limit: 4 })
    await run(last)
    expect(readUpstreamPage(last)?.hasMore).toBe(false)
  })

  it('page 2 sends offset = limit and limit = limit', async () => {
    total = 9
    await run(withPageSink({ page: 2, limit: 4 }))
    expect(calls).toHaveLength(1)
    expect(calls[0]!.path).toBe('/tickets-search.php')
    expect(calls[0]!.params).toEqual({ limit: 4, offset: 4 })
  })

  it('a direct limit above 100 is clamped and strides by the clamped size', async () => {
    total = 250
    const params = withPageSink({ page: 2, limit: 150 })
    const rows = await run(params)
    expect(calls[0]!.params).toEqual({ limit: 100, offset: 100 })
    expect(rows.map((r) => r.id)[0]).toBe('101')
    expect(readUpstreamPage(params)?.pageSize).toBe(100)
    // page 2 of 250 is a full clamped page: the end is unknown, never false
    expect(readUpstreamPage(params)?.hasMore).toBeUndefined()
  })

  it('the router clamps the caller limit to the declared maximum', async () => {
    total = 3
    const params = parseListQuery({ limit: '9999' }, adapter)
    expect(params.limit).toBe(100)
    await run(params)
    expect(calls[0]!.params).toEqual({ limit: 100, offset: 0 })
  })

  it('API path: page 2 through parseListQuery and listPage', async () => {
    total = 9
    const params = parseListQuery({ page: '2', limit: '4' }, adapter)
    const env = listPage(await run(params), params, 'osticket')
    expect(env.data.map((r) => r.id)).toEqual(['5', '6', '7', '8'])
    expect(calls[0]!.params['offset']).toBe(4)
  })
})

describe('osticket listMessages pages the ticket thread locally', () => {
  const run = (p: QueryParams) => adapter.listMessages(creds, '100077', p)

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
    expect(calls[0]!.path).toBe('/tickets-get.php/100077.json')
    expect(calls[0]!.params).toEqual({})
  })

  it('a limit above the maximum is clamped by the router', async () => {
    total = 150
    const params = parseListQuery({ limit: '9999' }, adapter)
    expect(params.limit).toBe(100)
    const rows = await run(params)
    expect(rows).toHaveLength(100)
  })

  it('API path: page 2 through parseListQuery and listPage', async () => {
    total = 9
    const params = parseListQuery({ page: '2', limit: '4' }, adapter)
    const env = listPage(await run(params), params, 'osticket')
    expect(env.data.map((r) => r.id)).toEqual(['5', '6', '7', '8'])
    expect(env.meta.hasMore).toBe(true)
    expect(env.meta.totalCount).toBe(9)
  })
})
