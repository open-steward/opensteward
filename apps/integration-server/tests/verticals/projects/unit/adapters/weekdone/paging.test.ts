/**
 * Weekdone list paging: every list endpoint returns the whole collection, so
 * each is paged locally.
 *
 * Weekdone's API documentation (https://weekdone.com/developer) lists each of
 * these as "Get all ..." with no paging parameter anywhere on the page:
 *
 *   GET /1/teams              — "Get all teams"
 *   GET /1/objective          — "Get all Objectives"; search: type, department_id, team_id, user_id, period
 *   GET /1/items              — "Search for items"; search: user_id, team_id, period
 *   GET /1/item/<id>/comments — "Get item comments"
 *   GET /1/tag                — "Get all tags"
 *   GET /1/users              — "Get all users"
 *
 * Before the fix each method returned the whole response for every page, so
 * page 2 repeated page 1. Now `pageLocally` slices by `page`/`limit` and
 * reports the total, so `hasMore` is exact.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import {
  listPage,
  parseListQuery,
  readUpstreamPage,
  withPageSink,
  type QueryParams,
} from '@opensteward/shared'
import { WeekdoneAdapter } from '../../../../../../src/verticals/projects/adapters/weekdone/index'

const CREDS = { accessToken: 'tok' }

const L = 3
const N = 2 * L + 1

/** Documented query params per path (plus `token`). */
const DOCUMENTED: Record<string, string[]> = {
  '/teams': [],
  '/objective': ['type', 'department_id', 'team_id', 'user_id', 'period'],
  '/items': ['user_id', 'team_id', 'period'],
  '/item/9/comments': [],
  '/tag': [],
  '/users': [],
}

/**
 * NOT documented: "Get all users" lists no search parameters, but the adapter
 * already sent `team_id` before this paging change. Tolerated here so the fake
 * does not pretend it is documented; if Weekdone ignores it the response is the
 * whole company's users, which local paging still slices correctly.
 */
const PRE_EXISTING_UNDOCUMENTED: Record<string, string[]> = {
  '/users': ['team_id'],
}

function rows(n: number) {
  return Array.from({ length: n }, (_, i) => i + 1)
}

function fakeWeekdone(n = N) {
  const get = vi.fn(async (path: string, opts?: { params?: Record<string, unknown> }) => {
    const documented = DOCUMENTED[path]
    if (!documented) throw new Error(`unexpected path ${path}`)
    const allowed = [...documented, ...(PRE_EXISTING_UNDOCUMENTED[path] ?? [])]
    for (const k of Object.keys(opts?.params ?? {})) {
      if (k === 'token') continue
      if (!allowed.includes(k)) throw new Error(`undocumented param ${k} on ${path}`)
    }
    const ids = rows(n)
    let data: unknown
    switch (path) {
      case '/teams':
        data = { status: 'ok', teams: ids.map((i) => ({ id: i, name: `Team ${i}` })) }
        break
      case '/objective':
        data = {
          status: 'ok',
          data: ids.map((i) => ({ id: i, description: `O${i}`, type: 'team', team_id: 7 })),
        }
        break
      case '/items':
        data = {
          status: 'ok',
          items: ids.map((i) => ({ id: i, description: `I${i}`, type_id: 2, team_id: 7 })),
        }
        break
      case '/item/9/comments':
        data = {
          status: 'ok',
          comments: ids.map((i) => ({ id: i, comment: `c${i}`, user_id: 1 })),
        }
        break
      case '/tag':
        data = { status: 'ok', tags: ids.map((i) => ({ id: i, tag: `tag${i}` })) }
        break
      case '/users':
        data = { status: 'ok', users: ids.map((i) => ({ id: i, name: `User ${i}`, team_id: 7 })) }
        break
    }
    return { data }
  })
  vi.spyOn(axios, 'create').mockReturnValue({ get } as never)
  return { get }
}

const adapter = () =>
  new WeekdoneAdapter({ clientId: 'c', clientSecret: 's', redirectUri: 'https://r.example.test' })

type Lister = (params: QueryParams) => Promise<{ id: string }[]>
const LISTS: Record<string, [Lister, string]> = {
  listWorkspaces: [(p) => adapter().listWorkspaces(CREDS, p), '/teams'],
  listProjects: [(p) => adapter().listProjects(CREDS, p), '/objective'],
  listTasks: [(p) => adapter().listTasks(CREDS, '7', p), '/items'],
  listComments: [(p) => adapter().listComments(CREDS, '9', p), '/item/9/comments'],
  listTags: [(p) => adapter().listTags(CREDS, '7', p), '/tag'],
  listUsers: [(p) => adapter().listUsers(CREDS, '7', p), '/users'],
}

/** The trailing number of an id, whatever composite form the transform uses. */
const tail = (id: string) => id.replace(/^.*?(\d+)$/, '$1')

afterEach(() => vi.restoreAllMocks())

describe.each(Object.entries(LISTS))('weekdone %s paging', (_name, [list, path]) => {
  it('calls only its documented endpoint', async () => {
    const { get } = fakeWeekdone()
    await list(withPageSink({ page: 2, limit: L }))
    expect(get).toHaveBeenCalled()
    for (const [p] of get.mock.calls) expect(p).toBe(path)
  })

  it('walks pages 1..3 at limit L and yields every row once, in order, with exact hasMore', async () => {
    fakeWeekdone()
    const seen: string[] = []
    const expectedHasMore = [true, true, false]
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink({ page: k, limit: L })
      const got = (await list(params)).map((r) => r.id)
      expect(got.length).toBe(k < 3 ? L : 1)
      seen.push(...got)
      expect(readUpstreamPage(params)).toMatchObject({
        hasMore: expectedHasMore[k - 1],
        totalCount: N,
        pagedLocally: true,
      })
    }
    expect(seen.map(tail)).toEqual(rows(N).map(String))
    expect(new Set(seen).size).toBe(N)
  })

  it('page 2 sends no paging parameter upstream (none is documented) and differs from page 1', async () => {
    const { get } = fakeWeekdone()
    const p1 = (await list(withPageSink({ page: 1, limit: L }))).map((r) => r.id)
    const p2 = (await list(withPageSink({ page: 2, limit: L }))).map((r) => r.id)
    expect(p2).not.toEqual(p1)
    for (const [, opts] of get.mock.calls) {
      const keys = Object.keys((opts as { params?: object }).params ?? {})
      expect(keys).not.toContain('page')
      expect(keys).not.toContain('limit')
      expect(keys).not.toContain('offset')
    }
  })

  it('a limit above the collection size returns everything and reports the end', async () => {
    fakeWeekdone()
    const params = withPageSink({ page: 1, limit: 500 })
    expect((await list(params)).length).toBe(N)
    expect(readUpstreamPage(params)).toMatchObject({ hasMore: false, totalCount: N })
  })

  it('API path: parseListQuery + listPage report exact meta', async () => {
    fakeWeekdone()
    const p2 = withPageSink(parseListQuery({ page: '2', limit: String(L) }))
    const env2 = listPage(await list(p2), p2, 'weekdone')
    expect(env2.data.length).toBe(L)
    expect(env2.meta).toMatchObject({ page: 2, hasMore: true, totalCount: N })

    const p3 = withPageSink(parseListQuery({ page: '3', limit: String(L) }))
    const env3 = listPage(await list(p3), p3, 'weekdone')
    expect(env3.data.length).toBe(1)
    expect(env3.meta).toMatchObject({ page: 3, hasMore: false, totalCount: N })
  })
})
