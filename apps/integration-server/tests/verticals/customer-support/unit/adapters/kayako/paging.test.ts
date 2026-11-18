/**
 * Kayako list paging.
 *
 * From https://developer.kayako.com/api/v1/reference/pagination/ :
 *
 *   "By default the API returns first 10 items of the collection. This can be changed
 *    with the limit argument."
 *   "Offset-based It's the default pagination style, which is supported by all
 *    resources. The current position in the collection is controlled by the special
 *    offset argument. Like in arrays the offset starts at 0 (the default offset) and
 *    ends at the total count - 1."
 *   "2nd offset=25&limit=25"
 *
 * Every list response carries `total_count` (e.g. "resource": "case", "offset": 0,
 * "limit": 10, "total_count": 1 on GET /api/v1/cases.json), which makes hasMore exact.
 * No maximum `limit` is documented, so the adapter declares none and the router's
 * default cap applies.
 *
 * listMessages merges two collections (GET /api/v1/cases/:id/posts.json and
 * GET /api/v1/cases/:id/notes.json) into one createdAt order, so one upstream page is
 * not one caller page: both are walked to their end by offset and paged locally.
 *
 * The fake honours ONLY `limit` and `offset` (plus the documented `role` filter on
 * /users); any other parameter throws.
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
import { KayakoAdapter } from '../../../../../../src/verticals/customer-support/adapters/kayako/index'
import {
  DEFAULT_PAGE_SIZE,
  MAX_WALK_PAGES,
} from '../../../../../../src/verticals/customer-support/adapters/kayako/constants'

const creds: Credentials = {
  accessToken: 'agent@example.test',
  extra: { password: 'pw', subdomain: 'acme' },
}

interface Call {
  path: string
  params: Record<string, unknown>
}

let calls: Call[] = []
let total = 0
let withTotalCount = true
/** Notes on the case, when it should differ from `total`. */
let notesTotal: number | undefined
/** A server-side cap on `limit` Kayako does not document; undefined = none. */
let serverCap: number | undefined

const ids = (n = total) => Array.from({ length: n }, (_, i) => i + 1)

function rowFor(path: string, id: number): Record<string, unknown> {
  // createdAt ascending with id, so the merged message order is predictable.
  const created = new Date(Date.UTC(2026, 0, 1, 0, 0, id)).toISOString()
  if (path.endsWith('/posts'))
    return { id, contents: `p${id}`, created_at: created, resource_type: 'post' }
  if (path.endsWith('/notes'))
    return {
      id: 10_000 + id,
      body_text: `n${id}`,
      created_at: new Date(Date.UTC(2026, 0, 1, 0, 0, id, 500)).toISOString(),
      resource_type: 'note',
    }
  return { id, subject: `s${id}`, title: `t${id}`, full_name: `u${id}`, created_at: created }
}

function respond(path: string, params: Record<string, unknown>): unknown {
  const allowed = new Set(['limit', 'offset', ...(path === '/users' ? ['role'] : [])])
  for (const k of Object.keys(params)) {
    if (!allowed.has(k)) throw new Error(`undocumented param ${k} on ${path}`)
  }
  const offset = params['offset'] === undefined ? 0 : Number(params['offset'])
  const asked = params['limit'] === undefined ? 10 : Number(params['limit'])
  const limit = serverCap === undefined ? asked : Math.min(asked, serverCap)
  const n = path.endsWith('/notes') ? (notesTotal ?? total) : total
  const data = ids(n)
    .slice(offset, offset + limit)
    .map((id) => rowFor(path, id))
  return withTotalCount
    ? { status: 200, data, offset, limit, total_count: n }
    : { status: 200, data }
}

beforeEach(() => {
  calls = []
  total = 0
  withTotalCount = true
  notesTotal = undefined
  serverCap = undefined
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

const adapter = new KayakoAdapter()

const offsetMethods: {
  name: string
  path: string
  extra: Record<string, unknown>
  run: (p: QueryParams) => Promise<Array<{ id: string }>>
}[] = [
  { name: 'listTickets', path: '/cases', extra: {}, run: (p) => adapter.listTickets(creds, p) },
  {
    name: 'listContacts',
    path: '/users',
    extra: { role: 'CUSTOMER' },
    run: (p) => adapter.listContacts(creds, p),
  },
  {
    name: 'listUsers',
    path: '/users',
    extra: { role: 'AGENT' },
    run: (p) => adapter.listUsers(creds, p),
  },
  { name: 'listTeams', path: '/teams', extra: {}, run: (p) => adapter.listTeams(creds, p) },
  {
    name: 'listMacros',
    path: '/cases/macros',
    extra: {},
    run: (p) => adapter.listMacros(creds, p),
  },
]

async function walk(run: (p: QueryParams) => Promise<Array<{ id: string }>>, limit: number) {
  const seen: string[] = []
  const reported: Array<boolean | undefined> = []
  const meta: Array<boolean | null | undefined> = []
  for (const page of [1, 2, 3]) {
    const params = withPageSink({ page, limit })
    const rows = await run(params)
    seen.push(...rows.map((r) => r.id))
    reported.push(readUpstreamPage(params)?.hasMore)
    meta.push(listPage(rows, params, 'kayako').meta.hasMore)
  }
  return { seen, reported, meta }
}

for (const { name, path, extra, run } of offsetMethods) {
  describe(`kayako ${name} pages by offset + limit`, () => {
    it('serves 2L+1 rows once, in order, over pages 1..3, with hasMore exact', async () => {
      const L = 4
      total = 2 * L + 1
      const { seen, reported, meta } = await walk(run, L)
      expect(seen).toEqual(ids().map(String))
      expect(reported).toEqual([true, true, false])
      expect(meta).toEqual([true, true, false])
    })

    it('page 2 sends offset = limit and limit = limit', async () => {
      total = 9
      await run(withPageSink({ page: 2, limit: 4 }))
      expect(calls).toHaveLength(1)
      expect(calls[0]!.path).toBe(path)
      expect(calls[0]!.params).toEqual({ limit: 4, offset: 4, ...extra })
    })

    it('without total_count, a short page still ends the walk', async () => {
      withTotalCount = false
      total = 9
      const params = withPageSink({ page: 3, limit: 4 })
      const rows = await run(params)
      expect(rows.map((r) => r.id)).toEqual(['9'])
      expect(readUpstreamPage(params)?.hasMore).toBe(false)
    })

    it('a limit above the router cap is clamped (no Kayako maximum is documented)', async () => {
      total = 3
      const params = parseListQuery({ limit: '9999' })
      expect(params.limit).toBe(500)
      await run(params)
      expect(calls[0]!.params['limit']).toBe(500)
      expect(calls[0]!.params['offset']).toBe(0)
    })

    it('API path: page 2 through parseListQuery and listPage', async () => {
      total = 9
      const params = parseListQuery({ page: '2', limit: '4' })
      const env = listPage(await run(params), params, 'kayako')
      expect(env.data.map((r) => r.id)).toEqual(['5', '6', '7', '8'])
      expect(env.meta.hasMore).toBe(true)
      expect(calls[0]!.params['offset']).toBe(4)
    })
  })
}

describe('kayako listMessages walks posts and notes to their end and pages locally', () => {
  const run = (p: QueryParams) => adapter.listMessages(creds, '77', p)
  // posts and notes interleave by createdAt: p1, n1, p2, n2, …
  const merged = () =>
    ids().flatMap((id) => [
      String(id),
      ...(id <= (notesTotal ?? total) ? [String(10_000 + id)] : []),
    ])

  it('serves every merged row once, in order, over pages 1..3, with hasMore exact', async () => {
    const L = 4
    // 5 posts + 4 notes = 2L+1 merged rows.
    total = 5
    notesTotal = 4
    const { seen, reported, meta } = await walk(run, L)
    expect(seen).toEqual(merged())
    expect(reported).toEqual([true, true, false])
    expect(meta).toEqual([true, true, false])
  })

  it('walks each collection past one upstream batch by offset', async () => {
    total = 250
    const params = withPageSink({ page: 2, limit: 4 })
    const rows = await run(params)
    expect(rows.map((r) => r.id)).toEqual(merged().slice(4, 8))
    const postOffsets = calls
      .filter((c) => c.path.endsWith('/posts'))
      .map((c) => c.params['offset'])
    const noteOffsets = calls
      .filter((c) => c.path.endsWith('/notes'))
      .map((c) => c.params['offset'])
    expect(postOffsets).toEqual([0, 100, 200])
    expect(noteOffsets).toEqual([0, 100, 200])
    expect(readUpstreamPage(params)).toMatchObject({
      totalCount: 500,
      hasMore: true,
      pagedLocally: true,
    })
  })

  it('walks a 10,000-row collection (100 batches of 100) to its end', async () => {
    total = 10_000
    const params = withPageSink({ page: 1, limit: 4 })
    await run(params)
    expect(calls.filter((c) => c.path.endsWith('/posts'))).toHaveLength(100)
    expect(readUpstreamPage(params)).toMatchObject({ totalCount: 2 * total, hasMore: true })
  })

  it('throws rather than page a partial collection past MAX_WALK_PAGES batches', async () => {
    total = MAX_WALK_PAGES * DEFAULT_PAGE_SIZE + 1
    await expect(run(withPageSink({ page: 1, limit: 4 }))).rejects.toThrow(
      /refusing to page a partial collection/,
    )
  })

  it('advances by rows returned, so an undocumented server cap on limit skips no row', async () => {
    serverCap = 30
    total = 70
    const rows = await run(withPageSink({ page: 1, limit: 500 }))
    expect(rows.map((r) => r.id)).toEqual(merged())
    const postOffsets = calls
      .filter((c) => c.path.endsWith('/posts'))
      .map((c) => c.params['offset'])
    expect(postOffsets).toEqual([0, 30, 60])
  })

  it('a limit above the router cap is clamped', async () => {
    total = 300
    const params = parseListQuery({ limit: '9999' })
    expect(params.limit).toBe(500)
    expect(await run(params)).toHaveLength(500)
  })

  it('API path: page 2 through parseListQuery and listPage', async () => {
    total = 5
    const params = parseListQuery({ page: '2', limit: '4' })
    const env = listPage(await run(params), params, 'kayako')
    expect(env.data.map((r) => r.id)).toEqual(merged().slice(4, 8))
    expect(env.meta.hasMore).toBe(true)
    expect(env.meta.totalCount).toBe(10)
  })
})
