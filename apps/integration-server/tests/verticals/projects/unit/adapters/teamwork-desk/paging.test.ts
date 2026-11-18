/**
 * Teamwork Spaces (slug `teamwork-desk`) list paging: the list endpoints the
 * adapter calls document no query parameter at all and describe themselves as
 * returning the whole collection, so each is paged locally.
 *
 * https://apidocs.teamwork.com/docs/spaces/v1/spaces/get-v1-spaces-json
 *   "GET /spaces/api/v1/spaces.json Get a list of spaces for an installation"
 * https://apidocs.teamwork.com/docs/spaces/v1/inline-comments/get-v1-spaces-space-id-pages-page-id-comments-inline-json
 *   "get all comments for a page" (path params spaceID, pageID only)
 * https://apidocs.teamwork.com/docs/spaces/v1/users/get-v1-users-json
 *   "Get all spaces users. Retrieves the space users from the entire installation."
 * https://apidocs.teamwork.com/docs/spaces/v1/tags/get-v1-tags-json
 *   "get all tags by Installation ID"
 *
 * Before the fix the adapter sent an undocumented `pageSize` and read `page`
 * from `cursor`, which the router never sends, so page 2 repeated page 1.
 *
 * listTasks walks a nested page tree rather than a flat list; its paging is
 * covered in tasks.test.ts.
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
import { TeamworkDeskAdapter } from '../../../../../../src/verticals/projects/adapters/teamwork-desk/index'

const CREDS = { accessToken: 'k', extra: { siteUrl: 'https://site.example.test' } }

const L = 3
const N = 2 * L + 1

function ids(n: number) {
  return Array.from({ length: n }, (_, i) => i + 1)
}

/** Build the documented body for each path; any query parameter is refused. */
function body(path: string, n: number): unknown {
  const all = ids(n)
  if (path === '/spaces.json') {
    return { spaces: { Spaces: all.map((i) => ({ id: i, title: `S${i}` })) } }
  }
  if (path === '/spaces/5/pages/9/comments/inline.json') {
    // Parent comments with one reply each: (1, 2), (3, 4), (5, 6), (7).
    const entries: Array<{ comment: object; replies: Array<{ comment: object }> }> = []
    for (let i = 1; i <= n; i += 2) {
      entries.push({
        comment: { id: i, content: `c${i}` },
        replies: i + 1 <= n ? [{ comment: { id: i + 1, content: `c${i + 1}` } }] : [],
      })
    }
    return { comments: entries }
  }
  if (path === '/users.json') {
    return {
      users: all.map((i) => ({ id: i, firstname: `F${i}`, lastname: 'L', email: `u${i}@x.test` })),
    }
  }
  if (path === '/tags.json') {
    return { tags: all.map((i) => ({ id: i, name: `tag${i}` })) }
  }
  throw new Error(`unexpected path ${path}`)
}

function fakeSpaces(n = N) {
  const get = vi.fn(async (path: string, config?: { params?: Record<string, unknown> }) => {
    const keys = Object.keys(config?.params ?? {})
    if (keys.length > 0) throw new Error(`undocumented params ${keys.join(',')} on ${path}`)
    return { data: body(path, n) }
  })
  vi.spyOn(axios, 'create').mockReturnValue({ get } as never)
  return { get }
}

const adapter = () => new TeamworkDeskAdapter()

type Lister = (params: QueryParams) => Promise<{ id: string }[]>
const LISTS: Record<string, Lister> = {
  listProjects: (p) => adapter().listProjects(CREDS, p),
  listComments: (p) => adapter().listComments(CREDS, '5:9', p),
  listUsers: (p) => adapter().listUsers(CREDS, 'default', p),
  listTags: (p) => adapter().listTags(CREDS, 'default', p),
}

afterEach(() => vi.restoreAllMocks())

describe.each(Object.entries(LISTS))('teamwork-desk %s paging', (_name, list) => {
  it('walks pages 1..3 at limit L and yields every row once, in order, with exact hasMore', async () => {
    fakeSpaces()
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
    expect(seen).toEqual(ids(N).map(String))
  })

  it('page 2 sends no paging parameter upstream (none is documented) and differs from page 1', async () => {
    const { get } = fakeSpaces()
    const p1 = (await list(withPageSink({ page: 1, limit: L }))).map((r) => r.id)
    const p2 = (await list(withPageSink({ page: 2, limit: L }))).map((r) => r.id)
    expect(p2).not.toEqual(p1)
    expect(get).toHaveBeenCalledTimes(2)
    for (const [, config] of get.mock.calls) {
      expect(Object.keys((config as { params?: object } | undefined)?.params ?? {})).toEqual([])
    }
  })

  it('a limit above the collection size returns everything and reports the end', async () => {
    fakeSpaces()
    const params = withPageSink({ page: 1, limit: 500 })
    expect((await list(params)).length).toBe(N)
    expect(readUpstreamPage(params)).toMatchObject({ hasMore: false, totalCount: N })
  })

  it('API path: parseListQuery + listPage report exact meta', async () => {
    fakeSpaces()
    const p2 = withPageSink(parseListQuery({ page: '2', limit: String(L) }))
    const env2 = listPage(await list(p2), p2, 'teamwork-desk')
    expect(env2.data.map((r) => r.id)).toEqual(['4', '5', '6'])
    expect(env2.meta).toMatchObject({ page: 2, hasMore: true, totalCount: N })

    const p3 = withPageSink(parseListQuery({ page: '3', limit: String(L) }))
    const env3 = listPage(await list(p3), p3, 'teamwork-desk')
    expect(env3.data.map((r) => r.id)).toEqual(['7'])
    expect(env3.meta).toMatchObject({ page: 3, hasMore: false, totalCount: N })
  })
})
