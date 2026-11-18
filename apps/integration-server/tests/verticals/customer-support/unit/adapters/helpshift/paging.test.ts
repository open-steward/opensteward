/**
 * Helpshift ticket (issue) list paging.
 *
 * https://developers.helpshift.com/rest-api/scenarios/ documents GET /issues
 * paging: "There is another parameter page-size for some endpoints (ie.
 * GET /issues ) which a developer can pass in a query. The Page-size parameter
 * will help in formulating the output response by adjusting the total-hits to
 * an integer between 1-1000." and "The parameters page and page-size together
 * can be used to traverse the data returned by these endpoints." Its sample
 * responses carry `page`, `page-size`, `issues`, `total-hits` and
 * `total-pages`.
 *
 * The fake below honours ONLY `page` (1-based, default 1) and `page-size`
 * (default 100, 1..1000), and reports the end through `total-pages`.
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
import { HelpshiftAdapter } from '../../../../../../src/verticals/customer-support/adapters/helpshift/index'

const creds: Credentials = {
  accessToken: 'key',
  extra: { domain: 'acme' },
}

interface Call {
  path: string
  params: Record<string, unknown>
}

let calls: Call[] = []
let handler: (path: string, params: Record<string, unknown>) => unknown

beforeEach(() => {
  calls = []
  vi.spyOn(axios, 'create').mockImplementation(
    () =>
      ({
        get: async (path: string, cfg?: { params?: Record<string, unknown> }) => {
          const params = { ...(cfg?.params ?? {}) }
          calls.push({ path, params })
          return { data: handler(path, params) }
        },
      }) as unknown as ReturnType<typeof axios.create>,
  )
})

afterEach(() => {
  vi.restoreAllMocks()
})

function issues(n: number) {
  return (_path: string, params: Record<string, unknown>) => {
    const page = Number(params['page'] ?? 1)
    const size = Number(params['page-size'] ?? 100)
    if (!Number.isInteger(size) || size < 1 || size > 1000)
      throw new Error(`invalid page-size ${size}`)
    const ids = Array.from({ length: n }, (_, i) => i + 1)
    return {
      page,
      'page-size': size,
      issues: ids.slice((page - 1) * size, page * size).map((id) => ({
        id,
        title: `Issue ${id}`,
        state_data: { state: 'new', changed_at: 1700000000000 },
        created_at: 1700000000000,
      })),
      'total-hits': n,
      'total-pages': Math.max(1, Math.ceil(n / size)),
    }
  }
}

async function walk(run: (p: QueryParams) => Promise<{ id: string }[]>, limit: number) {
  const ids: string[] = []
  const hasMore: (boolean | undefined)[] = []
  const reported: (boolean | undefined)[] = []
  for (const page of [1, 2, 3]) {
    const params = withPageSink({ page, limit })
    const rows = await run(params)
    ids.push(...rows.map((r) => r.id))
    reported.push(readUpstreamPage(params)?.hasMore)
    hasMore.push(listPage(rows, params, 'helpshift').meta.hasMore ?? undefined)
  }
  return { ids, hasMore, reported }
}

const range = (n: number) => Array.from({ length: n }, (_, i) => String(i + 1))

describe('helpshift listTickets paging', () => {
  const adapter = new HelpshiftAdapter({})
  const run = (p: QueryParams) => adapter.listTickets(creds, p)

  it('serves every row once, in order, across pages of 2L+1 rows', async () => {
    const L = 5
    handler = issues(2 * L + 1)
    const { ids, hasMore, reported } = await walk(run, L)
    expect(ids).toEqual(range(2 * L + 1))
    expect(hasMore).toEqual([true, true, false])
    // The sync worker reads only the reported flag, so pin it on its own.
    expect(reported).toEqual([true, true, false])
  })

  it('an exact multiple of the limit ends on its last full page', async () => {
    handler = issues(10)
    const { ids, hasMore, reported } = await walk(run, 5)
    expect(ids).toEqual(range(10))
    expect(hasMore).toEqual([true, false, false])
    expect(reported).toEqual([true, false, false])
  })

  it('page 2 requests the documented page and page-size', async () => {
    handler = issues(30)
    await run(withPageSink({ page: 2, limit: 7 }))
    expect(calls).toEqual([{ path: '/issues', params: { page: 2, 'page-size': 7 } }])
  })

  it('a request without page asks for the first page', async () => {
    handler = issues(30)
    const rows = await run(withPageSink({ limit: 5 }))
    expect(calls).toEqual([{ path: '/issues', params: { page: 1, 'page-size': 5 } }])
    expect(rows.map((r) => r.id)).toEqual(range(5))
  })

  it('the API path without ?page asks for the first page', async () => {
    handler = issues(30)
    const params = parseListQuery({ limit: '5' })
    expect(params.page).toBeUndefined()
    await run(params)
    expect(calls).toEqual([{ path: '/issues', params: { page: 1, 'page-size': 5 } }])
  })

  it('reports total-hits as the total count', async () => {
    handler = issues(11)
    const params = withPageSink({ page: 1, limit: 5 })
    await run(params)
    expect(readUpstreamPage(params)?.totalCount).toBe(11)
  })

  it('a direct call above the documented 1000 maximum is clamped and reports its size', async () => {
    handler = issues(1500)
    const params = withPageSink({ page: 1, limit: 5000 })
    const rows = await run(params)
    expect(calls).toEqual([{ path: '/issues', params: { page: 1, 'page-size': 1000 } }])
    expect(rows).toHaveLength(1000)
    expect(readUpstreamPage(params)).toMatchObject({ hasMore: true, pageSize: 1000 })
  })

  it('the API path: parseListQuery caps the limit and listPage reports more', async () => {
    handler = issues(600)
    const params = parseListQuery({ limit: '9999', page: '1' })
    expect(params.limit).toBe(500)
    const rows = await run(params)
    expect(calls).toEqual([{ path: '/issues', params: { page: 1, 'page-size': 500 } }])
    expect(rows.map((r) => r.id)).toEqual(range(500))
    expect(listPage(rows, params, 'helpshift').meta.hasMore).toBe(true)
  })
})
