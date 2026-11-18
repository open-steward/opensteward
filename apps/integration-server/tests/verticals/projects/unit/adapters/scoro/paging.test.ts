/**
 * Scoro list paging: every list method pages by `page` + `per_page`.
 *
 * Scoro API v2 (https://api.scoro.com/api/v2), "Request Limits":
 *
 *   "A maximum of 100 results will be returned for list methods, regardless of
 *    the value sent with the per_page parameter. The page paramater can be used
 *    to request additional items."
 *
 * No list response documents a page count or total, so after a full page the
 * adapter looks one row ahead (`per_page: 1`, `page: page × size + 1`, which is
 * exactly the next row) and reports `hasMore` from that; a short page is the end.
 *
 * Before the fix every method read its page from `cursor`, which the router
 * never sends, so page 2 repeated page 1.
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
import { ScoroAdapter } from '../../../../../../src/verticals/projects/adapters/scoro/index'

const CREDS = { accessToken: 'key', extra: { companyAccountId: 'acme' } }

const L = 3
const N = 2 * L + 1
/** Scoro's documented list ceiling. */
const MAX = 100

/**
 * Top-level body keys the Scoro v2 example request bodies show on list
 * requests. The docs contradict themselves on `basic_data` and
 * `include_subtasks`: the prose says "in request object", while the example
 * bodies put them at the top level. Both placements are therefore allowed here.
 */
const DOCUMENTED = new Set([
  'apiKey',
  'user_token',
  'lang',
  'company_account_id',
  'per_page',
  'page',
  'detailed_response',
  'request',
  'filter',
  'bookmark',
  'basic_data',
  'include_subtasks',
])

/** One raw row per module, keyed by the id field each transform reads. */
const ROW: Record<string, (i: number) => Record<string, unknown>> = {
  projects: (i) => ({ project_id: i, project_name: `P${i}` }),
  tasks: (i) => ({ event_id: i, event_name: `T${i}`, project_id: 7 }),
  comments: (i) => ({ comment_id: i, comment: `c${i}`, user_id: 1 }),
  tags: (i) => ({ id: i, tag_id: i, name: `tag${i}`, tag_name: `tag${i}` }),
  companyAccount: (i) => ({ entity_id: i, entity_name: `E${i}` }),
  users: (i) => ({ id: i, firstname: `U${i}`, email: `u${i}@x.test` }),
}

/**
 * A Scoro that honours only `page` (1-based, default 1) and `per_page` (capped
 * at 100). It returns `data` only: no page count or total is documented.
 */
function fakeScoro(n = N) {
  const post = vi.fn(async (path: string, body: Record<string, unknown>) => {
    const m = /^\/(\w+)\/list$/.exec(path)
    const make = m ? ROW[m[1]!] : undefined
    if (!make) throw new Error(`unexpected path ${path}`)
    for (const k of Object.keys(body)) {
      if (!DOCUMENTED.has(k)) throw new Error(`undocumented body key ${k}`)
    }
    const perPage = Math.min(Number(body['per_page'] ?? MAX), MAX)
    const page = Number(body['page'] ?? 1)
    const start = (page - 1) * perPage
    const ids = Array.from({ length: n }, (_, i) => i + 1).slice(start, start + perPage)
    return { data: { status: 'OK', statusCode: 200, messages: null, data: ids.map(make) } }
  })
  vi.spyOn(axios, 'create').mockReturnValue({ post } as never)
  return { post }
}

const adapter = () => new ScoroAdapter()

type Lister = (params: QueryParams) => Promise<{ id: string }[]>
const LISTS: Record<string, [string, Lister]> = {
  listProjects: ['projects', (p) => adapter().listProjects(CREDS, p)],
  listTasks: ['tasks', (p) => adapter().listTasks(CREDS, '7', p)],
  listComments: ['comments', (p) => adapter().listComments(CREDS, '9', p)],
  listTags: ['tags', (p) => adapter().listTags(CREDS, 'w', p)],
  listWorkspaces: ['companyAccount', (p) => adapter().listWorkspaces(CREDS, p)],
  listUsers: ['users', (p) => adapter().listUsers(CREDS, 'w', p)],
}

afterEach(() => vi.restoreAllMocks())

it('declares Scoro’s documented 100-row list ceiling', () => {
  expect(adapter().capabilities.maxPageSize).toBe(MAX)
})

describe.each(Object.entries(LISTS))('scoro %s paging', (_name, [module, list]) => {
  it('walks pages 1..3 at limit L and yields every row once, in order, with exact hasMore', async () => {
    fakeScoro()
    const seen: string[] = []
    const expectedHasMore = [true, true, false]
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink({ page: k, limit: L })
      const got = (await list(params)).map((r) => r.id)
      expect(got.length).toBe(k < 3 ? L : 1)
      seen.push(...got)
      expect(readUpstreamPage(params)?.hasMore).toBe(expectedHasMore[k - 1])
    }
    expect(seen).toEqual(Array.from({ length: N }, (_, i) => String(i + 1)))
  })

  it('reports the end on a full last page (N = 2L)', async () => {
    fakeScoro(2 * L)
    const params = withPageSink({ page: 2, limit: L })
    expect((await list(params)).length).toBe(L)
    expect(readUpstreamPage(params)?.hasMore).toBe(false)
  })

  it('the page-2 request carries page 2 and per_page L to the documented list path', async () => {
    const { post } = fakeScoro()
    await list(withPageSink({ page: 2, limit: L }))
    const [path, body] = post.mock.calls[0]!
    expect(path).toBe(`/${module}/list`)
    expect(body).toMatchObject({ page: 2, per_page: L })
  })

  it('a limit above 100 is clamped to per_page 100 and the size sent is reported', async () => {
    const { post } = fakeScoro(250)
    const params = withPageSink({ page: 1, limit: 500 })
    expect((await list(params)).length).toBe(MAX)
    expect(post.mock.calls[0]![1]).toMatchObject({ page: 1, per_page: MAX })
    expect(readUpstreamPage(params)).toMatchObject({ hasMore: true, pageSize: MAX })

    const p3 = withPageSink({ page: 3, limit: 500 })
    expect((await list(p3)).map((r) => r.id)[0]).toBe('201')
    expect(readUpstreamPage(p3)).toMatchObject({ hasMore: false, pageSize: MAX })
  })

  it('after a full page it looks ahead exactly one row, not a whole page', async () => {
    const { post } = fakeScoro()
    const params = withPageSink({ page: 2, limit: L })
    await list(params)
    expect(post).toHaveBeenCalledTimes(2)
    // page × size + 1 at per_page 1 is row 2L+1: the first row of page 3.
    expect(post.mock.calls[1]![1]).toMatchObject({ page: 2 * L + 1, per_page: 1 })
  })

  it('a short page makes no look-ahead request', async () => {
    const { post } = fakeScoro()
    await list(withPageSink({ page: 3, limit: L }))
    expect(post).toHaveBeenCalledTimes(1)
  })

  it('reports pageSize only when the limit was clamped', async () => {
    fakeScoro()
    const params = withPageSink({ page: 1, limit: L })
    await list(params)
    expect(readUpstreamPage(params)).not.toHaveProperty('pageSize')
  })

  it('with no limit it sends the default per_page of 50', async () => {
    const { post } = fakeScoro()
    await list(withPageSink({ page: 1 }))
    expect(post.mock.calls[0]![1]).toMatchObject({ page: 1, per_page: 50 })
  })

  it('API path: parseListQuery + listPage report exact meta', async () => {
    fakeScoro()
    const p2 = withPageSink(parseListQuery({ page: '2', limit: String(L) }, adapter()))
    const env2 = listPage(await list(p2), p2, 'scoro')
    expect(env2.data.map((r) => r.id)).toEqual(['4', '5', '6'])
    expect(env2.meta).toMatchObject({ page: 2, hasMore: true })

    const p3 = withPageSink(parseListQuery({ page: '3', limit: String(L) }, adapter()))
    const env3 = listPage(await list(p3), p3, 'scoro')
    expect(env3.data.map((r) => r.id)).toEqual(['7'])
    expect(env3.meta).toMatchObject({ page: 3, hasMore: false })
  })
})
