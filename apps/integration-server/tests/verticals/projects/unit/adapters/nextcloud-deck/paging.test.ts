/**
 * Nextcloud Deck list paging (https://deck.readthedocs.io/en/latest/API/).
 *
 * - GET /ocs/v2.php/apps/deck/api/v1.0/cards/{cardId}/comments pages by
 *   `limit` ("The maximum number of comments that should be returned,
 *   defaults to 20") and `offset` ("The start offset used for pagination,
 *   defaults to 0"); "If no or no more comments are available the list will
 *   be empty." The docs give no maximum, but Deck's CommentService::list
 *   silently clamps `limit` to 200 (stable31 and main), so the fake clamps
 *   too and a caller page above 200 is fetched in offset chunks of 200.
 *   `offset = (page - 1) × limit`, and a short page is the end.
 * - GET /boards/{boardId} ("Get board details") takes only `boardId`: labels
 *   (tags) and owner + acl participants (users) come back whole, so the
 *   adapter pages them locally.
 *
 * listComments used to read its offset from `params.cursor`, and listTags /
 * listUsers returned every row, so caller page 2 repeated page 1. The fake
 * honours ONLY the documented paging inputs.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { withPageSink, readUpstreamPage, parseListQuery, listPage } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import { NextcloudDeckAdapter } from '../../../../../../src/verticals/projects/adapters/nextcloud-deck/index'

vi.mock('axios')

const SERVER = 'https://cloud.example.test'
const C1: Credentials = { accessToken: 'dG9rLTE=', extra: { serverUrl: SERVER } }

/** Documented default of `limit` on the comments endpoint. */
const DECK_COMMENT_DEFAULT = 20
/** Deck's silent clamp in CommentService::list (`if ($limit > 200) { $limit = 200; }`). */
const DECK_COMMENT_CLAMP = 200

interface Req {
  ocs: boolean
  path: string
  params: Record<string, unknown>
}

type Kind = 'comments' | 'tags' | 'users'

function fakeDeck(kind: Kind, total: number, requests: Req[] = []) {
  vi.mocked(axios.create).mockImplementation(((config?: { baseURL?: string }) => {
    const ocs = String(config?.baseURL ?? '').includes('/ocs/v2.php/')
    const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
      const params = { ...(cfg?.params ?? {}) }
      requests.push({ ocs, path, params })
      if (kind === 'comments') {
        const m = path.match(/^\/cards\/([^/]+)\/comments$/)
        if (!ocs || !m) throw new Error(`unexpected path ${path}`)
        const all = Array.from({ length: total }, (_, i) => ({
          id: i + 1,
          objectId: Number(m[1]),
          message: `comment ${i + 1}`,
          actorId: 'admin',
          creationDateTime: new Date(Date.UTC(2024, 0, 1) + i * 1000).toISOString(),
        }))
        const limRaw = params['limit']
        const lim = limRaw === undefined ? DECK_COMMENT_DEFAULT : Number(limRaw)
        if (!Number.isInteger(lim) || lim < 1) throw new Error(`limit ${String(limRaw)} invalid`)
        const offRaw = params['offset']
        const off = offRaw === undefined ? 0 : Number(offRaw)
        if (!Number.isInteger(off) || off < 0) throw new Error(`offset ${String(offRaw)} invalid`)
        const served = Math.min(lim, DECK_COMMENT_CLAMP)
        return { data: { ocs: { meta: { status: 'ok' }, data: all.slice(off, off + served) } } }
      }
      const m = path.match(/^\/boards\/([^/]+)$/)
      if (ocs || !m) throw new Error(`unexpected path ${path}`)
      // Get board details takes no query: the board comes back whole.
      const boardId = Number(m[1])
      const labels = Array.from({ length: kind === 'tags' ? total : 0 }, (_, i) => ({
        id: i + 1,
        title: `label ${i + 1}`,
        color: 'ff0000',
        boardId,
      }))
      const users = Array.from({ length: kind === 'users' ? total : 1 }, (_, i) => ({
        primaryKey: `u${i + 1}`,
        uid: `u${i + 1}`,
        displayname: `User ${i + 1}`,
      }))
      return {
        data: {
          id: boardId,
          title: 'Board',
          owner: users[0],
          labels,
          acl: users.slice(1).map((participant, i) => ({ id: i + 1, participant })),
        },
      }
    })
    return { get }
  }) as unknown as typeof axios.create)
  return { requests }
}

type Lister = (a: NextcloudDeckAdapter, p: QueryParams) => Promise<{ id: string }[]>

const LISTS: Array<[string, Kind, Lister]> = [
  ['listComments', 'comments', (a, p) => a.listComments(C1, '12', p)],
  ['listTags', 'tags', (a, p) => a.listTags(C1, '10', p)],
  ['listUsers', 'users', (a, p) => a.listUsers(C1, '10', p)],
]

function ids(kind: Kind, from: number, n: number): string[] {
  return Array.from({ length: n }, (_, i) => {
    const k = from + i + 1
    if (kind === 'comments') return String(k)
    if (kind === 'tags') return `10/${k}`
    return `10/u${k}`
  })
}

afterEach(() => vi.clearAllMocks())

describe.each(LISTS)('nextcloud-deck %s pages at the caller size', (_name, kind, list) => {
  it('N = 2L+1 rows at limit L: pages 1-3 serve every id once, in order, hasMore exact', async () => {
    const L = 40
    fakeDeck(kind, 2 * L + 1)
    const adapter = new NextcloudDeckAdapter({})
    const served: string[] = []
    const more: Array<boolean | undefined> = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: L })
      const rows = await list(adapter, params)
      served.push(...rows.map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(served).toEqual(ids(kind, 0, 2 * L + 1))
    expect(more).toEqual([true, true, false])
  })

  it('API path: parseListQuery + listPage walks the whole collection once', async () => {
    fakeDeck(kind, 230)
    const adapter = new NextcloudDeckAdapter({})
    const served: string[] = []
    for (let page = 1; page < 20; page++) {
      const params = parseListQuery({ limit: '25', page: String(page) })
      const env = listPage(await list(adapter, params), params, 'nextcloud-deck')
      served.push(...env.data.map((r) => r.id))
      if (env.meta.hasMore !== true) break
    }
    expect(served).toEqual(ids(kind, 0, 230))
  })
})

describe('nextcloud-deck listComments sends the documented offset', () => {
  it('page 2 is fetched with offset = L and limit = L, never a cursor', async () => {
    const L = 40
    const { requests } = fakeDeck('comments', 2 * L + 1)
    const adapter = new NextcloudDeckAdapter({})
    await adapter.listComments(C1, '12', withPageSink({ page: 2, limit: L }))
    expect(requests).toHaveLength(1)
    expect(requests[0]!.path).toBe('/cards/12/comments')
    expect(requests[0]!.params).toMatchObject({ limit: L, offset: L })
    expect(requests[0]!.params['cursor']).toBeUndefined()
  })

  it('a stray params.cursor is ignored: the offset comes from page alone', async () => {
    const L = 40
    const { requests } = fakeDeck('comments', 2 * L + 1)
    const adapter = new NextcloudDeckAdapter({})
    const params = withPageSink({ page: 2, limit: L, cursor: '999' } as QueryParams)
    const rows = await adapter.listComments(C1, '12', params)
    expect(requests.map((r) => [r.params['limit'], r.params['offset']])).toEqual([[L, L]])
    expect(rows.map((r) => r.id)).toEqual(ids('comments', L, L))
  })

  it('limit 500 against the 200 clamp: chunks of 200 serve every row of 1,101, hasMore exact', async () => {
    const L = 500
    const total = 2 * L + 101
    const { requests } = fakeDeck('comments', total)
    const adapter = new NextcloudDeckAdapter({})
    const served: string[] = []
    const more: Array<boolean | undefined> = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: L })
      const rows = await adapter.listComments(C1, '12', params)
      served.push(...rows.map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(served).toEqual(ids('comments', 0, total))
    expect(more).toEqual([true, true, false])
    // Every request stays within the clamp, and page 2 starts at row 500.
    expect(requests.every((r) => Number(r.params['limit']) <= DECK_COMMENT_CLAMP)).toBe(true)
    expect(requests.map((r) => [r.params['limit'], r.params['offset']])).toEqual([
      [200, 0],
      [200, 200],
      [100, 400],
      [200, 500],
      [200, 700],
      [100, 900],
      [200, 1000],
    ])
  })

  it('limit 500 with exactly 500 rows: page 1 is full, page 2 is empty and ends the walk', async () => {
    const L = 500
    fakeDeck('comments', L)
    const adapter = new NextcloudDeckAdapter({})
    const p1 = withPageSink({ page: 1, limit: L })
    expect(await adapter.listComments(C1, '12', p1)).toHaveLength(L)
    const p2 = withPageSink({ page: 2, limit: L })
    expect(await adapter.listComments(C1, '12', p2)).toEqual([])
    expect(readUpstreamPage(p2)?.hasMore).toBe(false)
  })

  it('a compound task id still reaches the plain card id', async () => {
    const { requests } = fakeDeck('comments', 3)
    const adapter = new NextcloudDeckAdapter({})
    await adapter.listComments(C1, '10/4/12', withPageSink({ page: 1, limit: 2 }))
    expect(requests[0]!.path).toBe('/cards/12/comments')
  })
})

describe('nextcloud-deck board-detail lists page the whole board locally', () => {
  it.each([
    ['listTags', 'tags'],
    ['listUsers', 'users'],
  ] as const)('%s sends no paging input and reports the total', async (_n, kind) => {
    const { requests } = fakeDeck(kind, 7)
    const adapter = new NextcloudDeckAdapter({})
    const params = withPageSink({ page: 2, limit: 3 })
    const rows =
      kind === 'tags'
        ? await adapter.listTags(C1, '10', params)
        : await adapter.listUsers(C1, '10', params)
    expect(rows.map((r) => r.id)).toEqual(ids(kind, 3, 3))
    expect(readUpstreamPage(params)).toMatchObject({
      totalCount: 7,
      hasMore: true,
      pagedLocally: true,
    })
    expect(requests).toHaveLength(1)
    expect(requests[0]!.params).toEqual({})
  })

  it('getUser still finds a user past the first page', async () => {
    fakeDeck('users', 90)
    const adapter = new NextcloudDeckAdapter({})
    const user = await adapter.getUser(C1, '10/u88')
    expect(user.id).toBe('10/u88')
  })
})
