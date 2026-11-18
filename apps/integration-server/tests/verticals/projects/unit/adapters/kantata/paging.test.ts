/**
 * Kantata OX list paging: listProjects, listTasks and listUsers send the
 * caller's page as `page` and its limit as `per_page`.
 *
 * Kantata documents paging once for every list endpoint, at
 * https://developer.kantata.com/kantata/specification/section/pagination:
 *
 *   "The JSON response will contain a key named count with a value of the
 *    number of objects returned by the entire query. If that number is greater
 *    than the number of objects returned by the request, additional objects may
 *    be requested by setting the parameter page, the parameter per_page, or
 *    both."
 *   "page  type: Integer  default: 1"
 *   "per_page  type: Integer  default: 20  maximum: 200"
 *
 * Before the fix the adapter read the page from `params.cursor`, which the
 * router never sets, so page 2 repeated page 1.
 *
 * listComments pages the same way; it is covered in comments.test.ts, which
 * also pins its documented `story_id` scoping.
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
import { KantataAdapter } from '../../../../../../src/verticals/projects/adapters/kantata/index'

const CREDS = { accessToken: 'kantata_test' }
const MAX = 200

type Kind = 'workspaces' | 'stories' | 'users'
const PATHS: Record<string, Kind> = {
  '/workspaces.json': 'workspaces',
  '/stories.json': 'stories',
  '/users.json': 'users',
}

/**
 * A fake Kantata honouring only the documented paging: `page` (default 1) and
 * `per_page` (default 20, maximum 200). Anything else about paging (cursor,
 * limit/offset) is refused so a regression cannot pass by accident. The
 * total is returned only as the documented top-level `count` (no `meta`), so
 * the adapter must read the key the docs name.
 */
function fakeKantata(n: number) {
  const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
    const kind = PATHS[path]
    if (!kind) throw new Error(`unexpected path ${path}`)
    const params = cfg?.params ?? {}
    for (const bad of ['cursor', 'limit', 'offset']) {
      if (bad in params) throw new Error(`undocumented paging parameter ${bad}`)
    }
    const page = params['page'] === undefined ? 1 : Number(params['page'])
    const perPage = params['per_page'] === undefined ? 20 : Number(params['per_page'])
    if (!Number.isInteger(page) || page < 1) throw new Error(`bad page ${String(params['page'])}`)
    if (!Number.isInteger(perPage) || perPage < 1 || perPage > MAX) {
      throw new Error(`per_page out of range: ${String(params['per_page'])}`)
    }
    const ids = Array.from({ length: n }, (_, i) => String(i + 1))
    const slice = ids.slice((page - 1) * perPage, page * perPage)
    const map: Record<string, Record<string, unknown>> = {}
    for (const id of slice) {
      map[id] =
        kind === 'users'
          ? { id, full_name: `User ${id}`, email_address: `u${id}@example.test` }
          : kind === 'stories'
            ? { id, title: `Story ${id}`, workspace_id: 'ws-1', state: 'not started' }
            : { id, title: `Workspace ${id}` }
    }
    return {
      data: {
        count: n,
        results: slice.map((id) => ({ key: kind, id })),
        [kind]: map,
      },
    }
  })
  vi.spyOn(axios, 'create').mockReturnValue({
    get,
    post: vi.fn(),
    put: vi.fn(),
    delete: vi.fn(),
  } as never)
  return { get }
}

const adapter = () =>
  new KantataAdapter({ clientId: 'c', clientSecret: 's', redirectUri: 'https://example.test/cb' })

const METHODS: Record<string, (params: QueryParams) => Promise<{ id: string }[]>> = {
  listProjects: (p) => adapter().listProjects(CREDS, p),
  listTasks: (p) => adapter().listTasks(CREDS, 'ws-1', p),
  listUsers: (p) => adapter().listUsers(CREDS, 'ws-1', p),
}

afterEach(() => vi.restoreAllMocks())

describe.each(Object.entries(METHODS))('kantata %s paging', (name, call) => {
  it('walks N = 2L+1 rows over pages 1..3, each id once, in order, hasMore exact', async () => {
    const L = 4
    fakeKantata(2 * L + 1)
    const seen: string[] = []
    const expected = [true, true, false]
    for (let k = 1; k <= 3; k++) {
      const params = withPageSink({ page: k, limit: L })
      const rows = await call(params)
      seen.push(...rows.map((r) => r.id))
      expect(readUpstreamPage(params)).toMatchObject({
        hasMore: expected[k - 1],
        totalCount: 2 * L + 1,
      })
      // per_page equals the limit, so no smaller page size is reported.
      expect(readUpstreamPage(params)?.pageSize).toBeUndefined()
    }
    expect(seen).toEqual(Array.from({ length: 2 * L + 1 }, (_, i) => String(i + 1)))
  })

  it('N = 2L ends exactly on a page boundary: page 2 reports hasMore=false', async () => {
    const L = 3
    fakeKantata(2 * L)
    const p1 = withPageSink({ page: 1, limit: L })
    expect((await call(p1)).map((r) => r.id)).toEqual(['1', '2', '3'])
    expect(readUpstreamPage(p1)).toMatchObject({ hasMore: true, totalCount: 2 * L })
    const p2 = withPageSink({ page: 2, limit: L })
    expect((await call(p2)).map((r) => r.id)).toEqual(['4', '5', '6'])
    expect(readUpstreamPage(p2)).toMatchObject({ hasMore: false, totalCount: 2 * L })
  })

  it('an omitted page is sent as page 1', async () => {
    const { get } = fakeKantata(10)
    const rows = await call(withPageSink({ limit: 3 }))
    expect(get.mock.calls[0]?.[1]?.params).toMatchObject({ page: 1, per_page: 3 })
    expect(rows.map((r) => r.id)).toEqual(['1', '2', '3'])
  })

  it('the page-2 request carries the documented page and per_page', async () => {
    const { get } = fakeKantata(10)
    await call(withPageSink({ page: 2, limit: 3 }))
    expect(get.mock.calls[0]?.[1]?.params).toMatchObject({ page: 2, per_page: 3 })
  })

  it('a limit above the documented maximum is clamped to 200 and reported', async () => {
    const { get } = fakeKantata(450)
    const params = withPageSink({ page: 2, limit: 500 })
    const rows = await call(params)
    expect(get.mock.calls[0]?.[1]?.params).toMatchObject({ page: 2, per_page: MAX })
    expect(rows.map((r) => r.id)).toEqual(
      Array.from({ length: MAX }, (_, i) => String(MAX + i + 1)),
    )
    expect(readUpstreamPage(params)).toMatchObject({
      pageSize: MAX,
      hasMore: true,
      totalCount: 450,
    })
  })

  it(`API path: parseListQuery + listPage serve page 2 of ${name} with an exact end`, async () => {
    fakeKantata(5)
    const p1 = withPageSink(parseListQuery({ page: '1', limit: '3' }))
    const env1 = listPage(await call(p1), p1, 'kantata')
    expect(env1.data.map((r) => r.id)).toEqual(['1', '2', '3'])
    expect(env1.meta).toMatchObject({ page: 1, hasMore: true, totalCount: 5 })

    const p2 = withPageSink(parseListQuery({ page: '2', limit: '3' }))
    const env2 = listPage(await call(p2), p2, 'kantata')
    expect(env2.data.map((r) => r.id)).toEqual(['4', '5'])
    expect(env2.meta).toMatchObject({ page: 2, hasMore: false, totalCount: 5 })
  })
})

describe('kantata listTasks scoping', () => {
  it("pages the project's stories: workspace_id rides with page and per_page", async () => {
    const { get } = fakeKantata(10)
    await adapter().listTasks(CREDS, 'ws-1', withPageSink({ page: 2, limit: 3 }))
    expect(get.mock.calls[0]?.[0]).toBe('/stories.json')
    expect(get.mock.calls[0]?.[1]?.params).toMatchObject({
      workspace_id: 'ws-1',
      page: 2,
      per_page: 3,
    })
  })
})
