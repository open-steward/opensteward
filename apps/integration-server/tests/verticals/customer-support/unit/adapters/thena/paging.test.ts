/**
 * Thena list paging.
 *
 * GET /v1/tickets, from https://docs.thena.ai/api-reference/platform/tickets/get-all-tickets.md:
 *
 *   - name: page ... description: The page number to fetch tickets by
 *     schema: minimum: 0, default: 0
 *   - name: limit ... description: The limit number of tickets to fetch
 *     schema: minimum: 1, maximum: 100, default: 10
 *
 * GET /v1/comments, from https://docs.thena.ai/api-reference/mcp/comments/get-comments-on-entity.md:
 *
 *   | page | number | No | The page number for pagination (default: 0) |
 *   | limit | number | No | Maximum number of comments to return (default: 10) |
 *
 * Both pages are 0-based, and neither response carries a count or a next marker
 * (`{ status, message, timestamp, data }`), so a short page is the only end signal.
 * No maximum is documented for comments.
 *
 * GET /v1/teams, from https://docs.thena.ai/api-reference/platform/teams/get-all-teams-that-user-is-the-part-of!.md:
 * `parameters: []` -- the whole collection in one response, paged locally.
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
import { ThenaAdapter } from '../../../../../../src/verticals/customer-support/adapters/thena/index'

const creds: Credentials = { accessToken: 'thena_test' }

interface Call {
  path: string
  params: Record<string, unknown>
}

let calls: Call[] = []
let total = 0

const ids = () => Array.from({ length: total }, (_, i) => `r${i + 1}`)

function only(path: string, params: Record<string, unknown>, allowed: string[]): void {
  for (const k of Object.keys(params)) {
    if (!allowed.includes(k)) throw new Error(`undocumented param ${k} on ${path}`)
  }
}

/** A 0-based page of `limit` rows, as the docs describe; `max` caps limit when documented. */
function pageOf(params: Record<string, unknown>, max?: number): string[] {
  const page = params['page'] === undefined ? 0 : Number(params['page'])
  const limit = params['limit'] === undefined ? 10 : Number(params['limit'])
  if (!Number.isInteger(page) || page < 0) throw new Error(`bad page ${String(params['page'])}`)
  if (!Number.isInteger(limit) || limit < 1) throw new Error(`bad limit ${String(params['limit'])}`)
  if (max !== undefined && limit > max) throw new Error(`limit ${limit} above maximum ${max}`)
  return ids().slice(page * limit, page * limit + limit)
}

function respond(path: string, params: Record<string, unknown>): unknown {
  switch (path) {
    case '/tickets':
      only(path, params, ['teamId', 'dateRange', 'page', 'limit'])
      return {
        status: true,
        message: 'Success',
        data: pageOf(params, 100).map((id) => ({ id, status: 'open' })),
      }
    case '/comments':
      only(path, params, ['page', 'limit', 'entityType', 'entityId'])
      if (params['entityType'] !== 'ticket' || params['entityId'] !== 'T1')
        throw new Error('bad entity')
      return {
        status: true,
        message: 'Success',
        data: pageOf(params).map((id) => ({ id, content: 'x' })),
      }
    case '/teams':
      only(path, params, [])
      return {
        status: true,
        message: 'Success',
        data: ids().map((id) => ({ id, name: `team ${id}` })),
      }
    default:
      throw new Error(`unexpected path ${path}`)
  }
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

const adapter = new ThenaAdapter()

async function walk(run: (p: QueryParams) => Promise<Array<{ id: string }>>, limit: number) {
  const seen: string[] = []
  const reported: Array<boolean | undefined> = []
  const meta: Array<boolean | null | undefined> = []
  for (const page of [1, 2, 3]) {
    const params = withPageSink({ page, limit })
    const rows = await run(params)
    seen.push(...rows.map((r) => r.id))
    reported.push(readUpstreamPage(params)?.hasMore)
    meta.push(listPage(rows, params, 'thena').meta.hasMore)
  }
  return { seen, reported, meta }
}

const forwardPaged: {
  name: string
  path: string
  run: (p: QueryParams) => Promise<Array<{ id: string }>>
}[] = [
  { name: 'listTickets', path: '/tickets', run: (p) => adapter.listTickets(creds, p) },
  { name: 'listMessages', path: '/comments', run: (p) => adapter.listMessages(creds, 'T1', p) },
]

for (const { name, path, run } of forwardPaged) {
  describe(`thena ${name} pages by 0-based page + limit`, () => {
    it('serves 2L+1 rows once, in order, over pages 1..3', async () => {
      const L = 4
      total = 2 * L + 1
      const { seen, reported, meta } = await walk(run, L)
      expect(seen).toEqual(ids())
      // No count or next marker: a full page is unknown, the short page ends it.
      expect(reported).toEqual([undefined, undefined, false])
      expect(meta).toEqual([null, null, false])
    })

    it('page 2 sends page=1 (0-based) and limit = the caller limit; page 3 sends page=2', async () => {
      total = 9
      await run(withPageSink({ page: 2, limit: 4 }))
      await run(withPageSink({ page: 3, limit: 4 }))
      expect(calls).toHaveLength(2)
      expect(calls[0]!.path).toBe(path)
      expect(calls[0]!.params).toMatchObject({ page: 1, limit: 4 })
      expect(calls[1]!.params).toMatchObject({ page: 2, limit: 4 })
    })

    it('caller page 1 asks for upstream page 0', async () => {
      total = 3
      const rows = await run(withPageSink({ page: 1, limit: 2 }))
      expect(calls[0]!.params['page']).toBe(0)
      expect(rows.map((r) => r.id)).toEqual(['r1', 'r2'])
    })

    it('API path: page 2 through parseListQuery and listPage', async () => {
      total = 9
      const params = parseListQuery({ page: '2', limit: '4' })
      const env = listPage(await run(params), params, 'thena')
      expect(env.data.map((r) => r.id)).toEqual(['r5', 'r6', 'r7', 'r8'])
      expect(calls[0]!.params['page']).toBe(1)
    })
  })
}

describe('thena listTickets clamps to the documented maximum of 100', () => {
  it('a limit above 100 is sent as 100 and reported as the page size', async () => {
    total = 250
    const params = parseListQuery({ limit: '9999' })
    const rows = await adapter.listTickets(creds, params)
    expect(calls[0]!.params['limit']).toBe(100)
    expect(rows).toHaveLength(100)
    expect(readUpstreamPage(params)?.pageSize).toBe(100)
  })

  it('page 2 at a clamped size starts at row 101', async () => {
    total = 250
    const params = withPageSink({ page: 2, limit: 500 })
    const rows = await adapter.listTickets(creds, params)
    expect(calls[0]!.params).toMatchObject({ page: 1, limit: 100 })
    expect(rows[0]!.id).toBe('r101')
    expect(readUpstreamPage(params)?.pageSize).toBe(100)
  })
})

describe('thena listMessages sends the caller limit unclamped (no maximum documented)', () => {
  it('a limit of 500 is sent as 500 with no page size reported', async () => {
    total = 600
    const params = withPageSink({ page: 1, limit: 500 })
    const rows = await adapter.listMessages(creds, 'T1', params)
    expect(calls[0]!.params).toMatchObject({ page: 0, limit: 500 })
    expect(rows).toHaveLength(500)
    expect(readUpstreamPage(params)?.pageSize).toBeUndefined()
  })
})

describe('thena listTeams pages the whole collection locally', () => {
  const run = (p: QueryParams) => adapter.listTeams(creds, p)

  it('serves 2L+1 rows once, in order, over pages 1..3, with hasMore exact', async () => {
    const L = 4
    total = 2 * L + 1
    const { seen, reported, meta } = await walk(run, L)
    expect(seen).toEqual(ids())
    expect(reported).toEqual([true, true, false])
    expect(meta).toEqual([true, true, false])
  })

  it('sends no paging parameters (GET /v1/teams documents none)', async () => {
    total = 9
    await run(withPageSink({ page: 2, limit: 4 }))
    expect(calls).toHaveLength(1)
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
    const env = listPage(await run(params), params, 'thena')
    expect(env.data.map((r) => r.id)).toEqual(['r5', 'r6', 'r7', 'r8'])
    expect(env.meta.hasMore).toBe(true)
    expect(env.meta.totalCount).toBe(9)
  })
})
