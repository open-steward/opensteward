/**
 * helpcrunch-na (InvGate Service Management) list paging.
 *
 * The InvGate Service Management API reference
 * (https://releases.invgate.com/service-desk/api/) documents:
 *
 *   - GET /incidents.by.status: `status_ids`, `offset` ("Skip this number of
 *     items in the response."), `limit` ("Number of items per page."), and a
 *     response carrying `requestIds` and `total` ("Total items.");
 *   - GET /incident: `id`, `comments` ("When set to true, it includes the
 *     comments of the request.") and no paging parameter;
 *   - GET /users: `ids`, `include_disabled`, no paging parameter ("otherwise,
 *     it retrieves all users");
 *   - GET /categories: `page_size` ("Number of items per page. Default 20, max
 *     500.") and `page` ("Page number for pagination."), a plain array back;
 *   - GET /groups: `name`, `id`, no paging parameter ("Returns all active
 *     groups of users").
 *
 * The fakes below honour ONLY those parameters. The /incidents detail fake
 * answers in the id-keyed shape the adapter already parses: this suite pins
 * paging, not that payload shape.
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
import { HelpcrunchNaAdapter } from '../../../../../../src/verticals/customer-support/adapters/helpcrunch-na/index'

const creds: Credentials = {
  accessToken: 'tok',
  extra: { instanceHost: 'acme.cloud.invgate.net' },
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

const range = (n: number) => Array.from({ length: n }, (_, i) => String(i + 1))
const ids = (n: number) => Array.from({ length: n }, (_, i) => i + 1)

/** /incidents.by.status honours offset + limit (default: everything) and reports total. */
function incidents(n: number) {
  return (path: string, params: Record<string, unknown>) => {
    if (path === '/incidents.by.status') {
      const offset = Number(params['offset'] ?? 0)
      const limit = params['limit'] === undefined ? n : Number(params['limit'])
      return {
        status: 'OK',
        requestIds: ids(n).slice(offset, offset + limit),
        total: n,
        offset,
        limit,
      }
    }
    if (path === '/incidents') {
      const out: Record<string, unknown> = {}
      for (const id of params['ids'] as number[]) {
        out[String(id)] = { id, title: `t${id}`, status_id: 1, created_at: '2024-01-01T00:00:00Z' }
      }
      return out
    }
    throw new Error(`unexpected ${path}`)
  }
}

/** /categories honours page + page_size (default 20, max 500). */
function categories(n: number) {
  return (_path: string, params: Record<string, unknown>) => {
    const size = Math.min(Number(params['page_size'] ?? 20), 500)
    const page = Number(params['page'] ?? 1)
    return ids(n)
      .slice((page - 1) * size, page * size)
      .map((id) => ({ id, name: `c${id}`, parent_category_id: null }))
  }
}

/** /users returns every user; no paging parameter exists. */
function users(n: number) {
  return () => ids(n).map((id) => ({ id, name: `u${id}`, email: `u${id}@x.test` }))
}

/** /groups returns every active group; no paging parameter exists. */
function groups(n: number) {
  return () => ids(n).map((id) => ({ id, name: `g${id}` }))
}

/** /incident?comments=true returns the request with every comment inline. */
function comments(n: number) {
  return () => ({
    id: 99,
    comments: ids(n).map((id) => ({
      id,
      message: `m${id}`,
      author_id: 1,
      created_at: '2024-01-01T00:00:00Z',
    })),
  })
}

async function walk(run: (p: QueryParams) => Promise<{ id: string }[]>, limit: number) {
  const out: string[] = []
  const hasMore: (boolean | null)[] = []
  for (const page of [1, 2, 3]) {
    const params = withPageSink({ page, limit })
    const rows = await run(params)
    out.push(...rows.map((r) => r.id))
    hasMore.push(listPage(rows, params, 'helpcrunch-na').meta.hasMore)
  }
  return { ids: out, hasMore }
}

describe('helpcrunch-na listTickets paging (offset/limit on /incidents.by.status)', () => {
  const adapter = new HelpcrunchNaAdapter()
  const run = (p: QueryParams) => adapter.listTickets(creds, p)

  it('serves every ticket once, in order, across pages of 2L+1 rows', async () => {
    const L = 10
    handler = incidents(2 * L + 1)
    const { ids: got, hasMore } = await walk(run, L)
    expect(got).toEqual(range(2 * L + 1))
    expect(hasMore).toEqual([true, true, false])
  })

  it('page 2 requests offset=L with limit=L', async () => {
    handler = incidents(21)
    await run(withPageSink({ page: 2, limit: 10 }))
    const byStatus = calls.find((c) => c.path === '/incidents.by.status')!
    expect(byStatus.params['offset']).toBe(10)
    expect(byStatus.params['limit']).toBe(10)
  })

  it('an exact multiple ends on the total, not a full-page guess', async () => {
    handler = incidents(20)
    const { ids: got, hasMore } = await walk(run, 10)
    expect(got).toEqual(range(20))
    expect(hasMore).toEqual([true, false, false])
  })

  it('a limit above the maximum is clamped', async () => {
    handler = incidents(600)
    const params = parseListQuery({ limit: '9999' })
    expect(params.limit).toBe(500)
    const rows = await run(params)
    expect(rows).toHaveLength(500)
    expect(calls.find((c) => c.path === '/incidents.by.status')!.params['limit']).toBe(500)
    expect(listPage(rows, params, 'helpcrunch-na').meta.hasMore).toBe(true)
  })

  it('API path: page 2 through parseListQuery and listPage', async () => {
    handler = incidents(21)
    const params = parseListQuery({ page: '2', limit: '10' })
    const env = listPage(await run(params), params, 'helpcrunch-na')
    expect(env.data.map((r) => r.id)).toEqual(range(20).slice(10))
    expect(env.meta.hasMore).toBe(true)
    expect(env.meta.totalCount).toBe(21)
  })

  // The sync worker reads ONLY the reported hasMore (not totalCount) to decide
  // whether to fetch the next page, so the report itself must be exact.
  async function reported(n: number, limit: number) {
    handler = incidents(n)
    const out: { hasMore?: boolean; totalCount?: number; pageSize?: number }[] = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit })
      await run(params)
      const meta = readUpstreamPage(params)
      out.push({ hasMore: meta?.hasMore, totalCount: meta?.totalCount, pageSize: meta?.pageSize })
    }
    return out
  }

  it('reports hasMore true, true, false for 2L+1 rows (what the sync worker reads)', async () => {
    const got = await reported(21, 10)
    expect(got.map((m) => m.hasMore)).toEqual([true, true, false])
    expect(got.map((m) => m.totalCount)).toEqual([21, 21, 21])
    expect(got.map((m) => m.pageSize)).toEqual([10, 10, 10])
  })

  it('reports hasMore false on the last full page of an exact multiple', async () => {
    const got = await reported(20, 10)
    expect(got.map((m) => m.hasMore)).toEqual([true, false, false])
  })

  it('reports pageSize as the clamped size sent upstream', async () => {
    handler = incidents(600)
    const params = withPageSink({ page: 1, limit: 9999 })
    await run(params)
    expect(calls.find((c) => c.path === '/incidents.by.status')!.params['limit']).toBe(500)
    expect(readUpstreamPage(params)?.pageSize).toBe(500)
  })
})

describe('helpcrunch-na listTags paging (page/page_size on /categories)', () => {
  const adapter = new HelpcrunchNaAdapter()
  const run = (p: QueryParams) => adapter.listTags(creds, p)

  // /categories returns a plain array: no total and no next link. A full page
  // is therefore "unknown" (null), never a guessed true; a short page ends.
  it('serves every category once, in order, across pages of 2L+1 rows', async () => {
    const L = 10
    handler = categories(2 * L + 1)
    const { ids: got, hasMore } = await walk(run, L)
    expect(got).toEqual(range(2 * L + 1))
    expect(hasMore).toEqual([null, null, false])
    expect(calls.map((c) => c.params['page'])).toEqual([1, 2, 3])
  })

  it('an exact multiple ends on the empty page after it', async () => {
    handler = categories(20)
    const { ids: got, hasMore } = await walk(run, 10)
    expect(got).toEqual(range(20))
    expect(hasMore).toEqual([null, null, false])
  })

  it('page 2 requests page=2 with page_size=L', async () => {
    handler = categories(21)
    await run(withPageSink({ page: 2, limit: 10 }))
    expect(calls.map((c) => c.params)).toEqual([{ page: 2, page_size: 10 }])
  })

  it('a limit above the maximum is clamped to page_size=500', async () => {
    handler = categories(600)
    const params = parseListQuery({ limit: '9999' })
    expect(params.limit).toBe(500)
    const rows = await run(params)
    expect(rows).toHaveLength(500)
    expect(calls[0]!.params['page_size']).toBe(500)
  })

  it('API path: page 2 through parseListQuery and listPage', async () => {
    handler = categories(21)
    const params = parseListQuery({ page: '2', limit: '10' })
    const env = listPage(await run(params), params, 'helpcrunch-na')
    expect(env.data.map((r) => r.id)).toEqual(range(20).slice(10))
    expect(env.meta.hasMore).toBeNull()
  })

  it('clamps page_size to the documented max 500 even past the router, and reports it', async () => {
    handler = categories(600)
    const params = withPageSink({ page: 1, limit: 9999 })
    await run(params)
    expect(calls[0]!.params['page_size']).toBe(500)
    expect(readUpstreamPage(params)?.pageSize).toBe(500)
  })

  it('reports pageSize = the page_size sent, and never a hasMore it cannot know', async () => {
    handler = categories(21)
    const params = withPageSink({ page: 1, limit: 10 })
    await run(params)
    expect(readUpstreamPage(params)?.pageSize).toBe(10)
    expect(readUpstreamPage(params)?.hasMore).toBeUndefined()
  })
})

type Row = { id: string }

const whole: {
  name: string
  fake: (n: number) => (path: string, params: Record<string, unknown>) => unknown
  run: (a: HelpcrunchNaAdapter, p: QueryParams) => Promise<Row[]>
  path: string
}[] = [
  {
    name: 'listContacts',
    fake: users,
    run: (a: HelpcrunchNaAdapter, p: QueryParams) => a.listContacts(creds, p),
    path: '/users',
  },
  {
    name: 'listUsers',
    fake: users,
    run: (a: HelpcrunchNaAdapter, p: QueryParams) => a.listUsers(creds, p),
    path: '/users',
  },
  {
    name: 'listTeams',
    fake: groups,
    run: (a: HelpcrunchNaAdapter, p: QueryParams) => a.listTeams(creds, p),
    path: '/groups',
  },
  {
    name: 'listMessages',
    fake: comments,
    run: (a: HelpcrunchNaAdapter, p: QueryParams) => a.listMessages(creds, '99', p),
    path: '/incident',
  },
]

for (const { name, fake, run: runOn, path } of whole) {
  describe(`helpcrunch-na ${name} paging (whole list, paged locally)`, () => {
    const adapter = new HelpcrunchNaAdapter()
    const run = (p: QueryParams) => runOn(adapter, p)

    it('serves every row once, in order, across pages of 2L+1 rows', async () => {
      const L = 4
      handler = fake(2 * L + 1)
      const { ids: got, hasMore } = await walk(run, L)
      expect(got).toEqual(range(2 * L + 1))
      expect(hasMore).toEqual([true, true, false])
    })

    it(`sends no paging parameter to ${path}, since none is documented`, async () => {
      handler = fake(9)
      await run(withPageSink({ page: 2, limit: 4 }))
      expect(calls).toHaveLength(1)
      expect(calls[0]!.path).toBe(path)
      for (const k of ['page', 'page_size', 'limit', 'offset']) {
        expect(calls[0]!.params).not.toHaveProperty(k)
      }
    })

    it('a limit above the maximum is clamped and serves the whole list', async () => {
      handler = fake(12)
      const params = parseListQuery({ limit: '9999' })
      expect(params.limit).toBe(500)
      const rows = await run(params)
      expect(rows).toHaveLength(12)
      expect(listPage(rows, params, 'helpcrunch-na').meta.hasMore).toBe(false)
    })

    it('API path: page 2 through parseListQuery and listPage', async () => {
      handler = fake(9)
      const params = parseListQuery({ page: '2', limit: '4' })
      const env = listPage(await run(params), params, 'helpcrunch-na')
      expect(env.data.map((r) => r.id)).toEqual(['5', '6', '7', '8'])
      expect(env.meta.hasMore).toBe(true)
    })
  })
}
