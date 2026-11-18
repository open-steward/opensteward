/**
 * Wekan list paging: every list endpoint returns the whole collection, so
 * each list method is paged locally.
 *
 * WeKan's REST API spec (https://wekan.fi/api/v9.57/) documents no query
 * parameter on any of the list endpoints the adapter calls — only path
 * parameters:
 *
 *   GET /api/users/{user}/boards                 — parameters: user (path)
 *   GET /api/users                               — no parameters
 *   GET /api/boards/{board}/lists                — board (path)
 *   GET /api/boards/{board}/lists/{list}/cards   — board, list (path)
 *   GET /api/boards/{board}/cards/{card}/comments — board, card (path)
 *   GET /api/boards/{board}/export               — board (path); labels embedded
 *
 * Before the fix each method returned every row, the router cut it to
 * `limit`, and page 2 repeated page 1. Now `pageLocally` slices by
 * `page`/`limit` and reports the total, so `hasMore` is exact.
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
import { WekanAdapter } from '../../../../../../src/verticals/projects/adapters/wekan/index'

const CREDS = {
  accessToken: 'tok',
  extra: { serverUrl: 'https://wekan.example.test', userId: 'u0' },
}

const L = 3
const N = 2 * L + 1

const nums = (n: number) => Array.from({ length: n }, (_, i) => i + 1)

/** Cards split over two lists (4 + 3), in list order. */
const LIST_CARDS: Record<string, number[]> = { l1: [1, 2, 3, 4], l2: [5, 6, 7] }

function fakeWekan(n = N) {
  const get = vi.fn(async (path: string, config?: { params?: Record<string, unknown> }) => {
    // No list endpoint documents a query parameter: refuse any.
    const keys = Object.keys(config?.params ?? {})
    if (keys.length) throw new Error(`undocumented params ${keys.join(',')} on ${path}`)
    let data: unknown
    let m: RegExpMatchArray | null
    if (path === '/users/u0/boards') {
      data = nums(n).map((i) => ({ _id: `b${i}`, title: `Board ${i}` }))
    } else if (path === '/users') {
      data = nums(n).map((i) => ({ _id: `u${i}`, username: `user${i}` }))
    } else if (path === '/boards/b7/lists') {
      data = Object.keys(LIST_CARDS).map((id) => ({ _id: id, title: id }))
    } else if ((m = path.match(/^\/boards\/b7\/lists\/(\w+)\/cards$/))) {
      data = (LIST_CARDS[m[1]] ?? []).map((i) => ({ _id: `c${i}`, title: `C${i}`, listId: m![1] }))
    } else if (path === '/boards/b7/cards/c9/comments') {
      data = nums(n).map((i) => ({ _id: `m${i}`, comment: `text ${i}`, authorId: 'u1' }))
    } else if (path === '/boards/b7/export') {
      data = {
        _id: 'b7',
        title: 'B7',
        labels: nums(n).map((i) => ({ _id: `g${i}`, name: `label${i}`, color: 'green' })),
      }
    } else {
      throw new Error(`unexpected path ${path}`)
    }
    return { data }
  })
  vi.spyOn(axios, 'create').mockReturnValue({ get, post: vi.fn() } as never)
  return { get }
}

const adapter = () => new WekanAdapter()

type Lister = (params: QueryParams) => Promise<{ id: string }[]>
const LISTS: Record<string, { list: Lister; ids: string[] }> = {
  listProjects: {
    list: (p) => adapter().listProjects(CREDS, p),
    ids: nums(N).map((i) => `b${i}`),
  },
  listTasks: {
    list: (p) => adapter().listTasks(CREDS, 'b7', p),
    ids: Object.entries(LIST_CARDS).flatMap(([l, cs]) => cs.map((c) => `b7:${l}:c${c}`)),
  },
  listComments: {
    list: (p) => adapter().listComments(CREDS, 'b7:c9', p),
    ids: nums(N).map((i) => `m${i}`),
  },
  listTags: {
    list: (p) => adapter().listTags(CREDS, 'b7', p),
    ids: nums(N).map((i) => `b7:g${i}`),
  },
  listUsers: {
    list: (p) => adapter().listUsers(CREDS, 'wekan', p),
    ids: nums(N).map((i) => `u${i}`),
  },
}

afterEach(() => vi.restoreAllMocks())

describe.each(Object.entries(LISTS))('wekan %s paging', (_name, { list, ids }) => {
  it('walks pages 1..3 at limit L and yields every row once, in order, with exact hasMore', async () => {
    fakeWekan()
    expect(ids.length).toBe(N)
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
    expect(seen).toEqual(ids)
    expect(new Set(seen).size).toBe(N)
  })

  it('page 2 sends no paging parameter upstream (none is documented) and differs from page 1', async () => {
    const { get } = fakeWekan()
    const p1 = (await list(withPageSink({ page: 1, limit: L }))).map((r) => r.id)
    const p2 = (await list(withPageSink({ page: 2, limit: L }))).map((r) => r.id)
    expect(p2).not.toEqual(p1)
    expect(p2).toEqual(ids.slice(L, 2 * L))
    for (const call of get.mock.calls) {
      const cfg = call[1] as { params?: object } | undefined
      expect(Object.keys(cfg?.params ?? {})).toEqual([])
    }
  })

  it('a limit above the collection size returns everything and reports the end', async () => {
    fakeWekan()
    const params = withPageSink({ page: 1, limit: 500 })
    expect((await list(params)).map((r) => r.id)).toEqual(ids)
    expect(readUpstreamPage(params)).toMatchObject({ hasMore: false, totalCount: N })
  })

  it('API path: parseListQuery + listPage report exact meta', async () => {
    fakeWekan()
    const p2 = withPageSink(parseListQuery({ page: '2', limit: String(L) }))
    const env2 = listPage(await list(p2), p2, 'wekan')
    expect(env2.data.map((r) => r.id)).toEqual(ids.slice(L, 2 * L))
    expect(env2.meta).toMatchObject({ page: 2, hasMore: true, totalCount: N })

    const p3 = withPageSink(parseListQuery({ page: '3', limit: String(L) }))
    const env3 = listPage(await list(p3), p3, 'wekan')
    expect(env3.data.map((r) => r.id)).toEqual(ids.slice(2 * L))
    expect(env3.meta).toMatchObject({ page: 3, hasMore: false, totalCount: N })
  })
})

describe('wekan listWorkspaces paging (one virtual workspace)', () => {
  it('page 1 has the workspace, page 2 is empty, hasMore false', async () => {
    const p1 = withPageSink({ page: 1, limit: 1 })
    expect((await adapter().listWorkspaces(CREDS, p1)).map((w) => w.id)).toEqual(['wekan'])
    expect(readUpstreamPage(p1)).toMatchObject({
      hasMore: false,
      totalCount: 1,
      pagedLocally: true,
    })

    const p2 = withPageSink({ page: 2, limit: 1 })
    expect(await adapter().listWorkspaces(CREDS, p2)).toEqual([])
    expect(readUpstreamPage(p2)).toMatchObject({ hasMore: false, totalCount: 1 })
  })

  it('API path: parseListQuery + listPage', async () => {
    const p = withPageSink(parseListQuery({ page: '2', limit: '10' }))
    const env = listPage(await adapter().listWorkspaces(CREDS, p), p, 'wekan')
    expect(env.data).toEqual([])
    expect(env.meta).toMatchObject({ page: 2, hasMore: false, totalCount: 1 })
  })
})

describe('wekan empty collections report their end', () => {
  function fakeEmptyWekan() {
    const get = vi.fn(async (path: string) => {
      if (path === '/boards/b8/lists') return { data: { error: 'not an array' } }
      if (path === '/boards/b8/export') return { data: { _id: 'b8', title: 'B8' } }
      throw new Error(`unexpected path ${path}`)
    })
    vi.spyOn(axios, 'create').mockReturnValue({ get, post: vi.fn() } as never)
    return { get }
  }

  const EMPTY: Record<string, Lister> = {
    'listTasks when the lists response is not an array': (p) => adapter().listTasks(CREDS, 'b8', p),
    'listTags when the board export has no labels': (p) => adapter().listTags(CREDS, 'b8', p),
    'listTags on the virtual workspace': (p) => adapter().listTags(CREDS, 'wekan', p),
  }

  it.each(Object.entries(EMPTY))('%s', async (_name, list) => {
    fakeEmptyWekan()
    const params = withPageSink({ page: 1, limit: L })
    expect(await list(params)).toEqual([])
    expect(readUpstreamPage(params)).toMatchObject({
      hasMore: false,
      totalCount: 0,
      pagedLocally: true,
    })
  })
})
