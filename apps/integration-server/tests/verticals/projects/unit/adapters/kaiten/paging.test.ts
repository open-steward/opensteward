/**
 * Kaiten pages its list endpoints by `limit` + `offset` and returns a bare
 * array with no total and no next link (https://developers.kaiten.ru):
 *
 *   - GET /spaces: "limit ... a value greater than 100 is treated as 100",
 *     "offset | Number of spaces to skip";
 *   - GET /cards, GET /tags, GET /users: `limit` "Default: 100 Max: 100" and
 *     `offset` ("Number of records to skip" / "Offset the number of users
 *     returned").
 *
 * The next signal is therefore a full page, and a short page is the end. The
 * adapter sends `offset = (page - 1) × size` with the caller's limit clamped
 * to 100, and reports that size when it clamps.
 *
 * GET /cards/{card_id}/comments documents only the `card_id` path parameter,
 * no query at all: it returns the whole list, so the adapter pages it locally.
 *
 * Every list used to send `limit` and read an offset only from
 * `params.cursor`, so caller page 2 repeated page 1. The fake honours ONLY
 * the documented paging inputs.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { withPageSink, readUpstreamPage, parseListQuery, listPage } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import { KaitenAdapter } from '../../../../../../src/verticals/projects/adapters/kaiten/index'

vi.mock('axios')

const BASE = 'https://acme.kaiten.ru'
const C1: Credentials = { accessToken: 'tok-1', extra: { baseUrl: BASE } }
const C2: Credentials = { accessToken: 'tok-2', extra: { baseUrl: BASE } }

/** Documented default and maximum of `limit`. */
const KAITEN_MAX = 100

interface Req {
  token: string
  path: string
  params: Record<string, unknown>
}

type Kind = 'spaces' | 'cards' | 'tags' | 'users' | 'comments'

/** Numeric ids, far apart per token and per parent, ordered by row index. */
function idNum(token: string, parent: string, n: number): number {
  return (token === 'tok-2' ? 100_000 : 0) + (parent === '2' ? 200_000 : 0) + n + 1
}

function row(kind: Kind, token: string, parent: string, n: number): Record<string, unknown> {
  const id = idNum(token, parent, n)
  const created = new Date(Date.UTC(2024, 0, 1) + n * 1000).toISOString()
  switch (kind) {
    case 'spaces':
      return { id, title: `space ${id}`, created, updated: created }
    case 'cards':
      return { id, title: `card ${id}`, board_id: Number(parent), created, updated: created }
    case 'tags':
      return { id, name: `tag ${id}`, color: 1 }
    case 'users':
      return { id, full_name: `user ${id}`, email: `u${id}@example.com`, created, updated: created }
    case 'comments':
      return { id, text: `comment ${id}`, card_id: Number(parent), created, updated: created }
  }
}

/**
 * One Kaiten endpoint holding `total` rows per (token, parent). Offset
 * endpoints honour only `limit` (default 100; above 100 is treated as 100)
 * and `offset`; the comments endpoint honours nothing and returns every row.
 */
function fakeKaiten(kind: Kind, total: number, requests: Req[] = [], deleted: number[] = []) {
  vi.mocked(axios.create).mockImplementation(((config?: { headers?: Record<string, unknown> }) => {
    const token = String(config?.headers?.['Authorization'] ?? '').replace(/^Bearer /, '')
    const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
      const params = { ...(cfg?.params ?? {}) }
      requests.push({ token, path, params })
      let parent = 'all'
      if (kind === 'comments') {
        const m = path.match(/^\/cards\/([^/]+)\/comments$/)
        if (!m) throw new Error(`unexpected path ${path}`)
        parent = m[1]!
        const all = Array.from({ length: total }, (_, i) => ({
          ...row(kind, token, parent, i),
          ...(deleted.includes(i) ? { deleted: true } : {}),
        }))
        return { data: all }
      }
      if (path !== `/${kind}`) throw new Error(`unexpected path ${path}`)
      if (kind === 'cards') parent = String(params['board_id'])
      const all = Array.from({ length: total }, (_, i) => row(kind, token, parent, i))
      const limRaw = params['limit']
      const lim = limRaw === undefined ? KAITEN_MAX : Math.min(Number(limRaw), KAITEN_MAX)
      if (!Number.isInteger(lim) || lim < 1) throw new Error(`limit ${String(limRaw)} invalid`)
      const offRaw = params['offset']
      const off = offRaw === undefined ? 0 : Number(offRaw)
      if (!Number.isInteger(off) || off < 0) throw new Error(`offset ${String(offRaw)} invalid`)
      return { data: all.slice(off, off + lim) }
    })
    return { get }
  }) as unknown as typeof axios.create)
  return { requests }
}

type Lister = (
  a: KaitenAdapter,
  c: Credentials,
  parent: string,
  p: QueryParams,
) => Promise<{ id: string }[]>

const OFFSET_LISTS: Array<[string, Kind, Lister]> = [
  ['listWorkspaces', 'spaces', (a, c, _p, p) => a.listWorkspaces(c, p)],
  ['listTasks', 'cards', (a, c, parent, p) => a.listTasks(c, parent, p)],
  ['listTags', 'tags', (a, c, parent, p) => a.listTags(c, parent, p)],
  ['listUsers', 'users', (a, c, parent, p) => a.listUsers(c, parent, p)],
]

const ALL_LISTS: Array<[string, Kind, Lister]> = [
  ...OFFSET_LISTS,
  ['listComments', 'comments', (a, c, parent, p) => a.listComments(c, parent, p)],
]

function parentOf(kind: Kind, parent: string): string {
  return kind === 'cards' || kind === 'comments' ? parent : 'all'
}

function ids(kind: Kind, token: string, parent: string, from: number, n: number): string[] {
  const par = parentOf(kind, parent)
  return Array.from({ length: n }, (_, i) => String(idNum(token, par, from + i)))
}

afterEach(() => vi.clearAllMocks())

describe.each(ALL_LISTS)('kaiten %s pages at the caller size', (_name, kind, list) => {
  it('N = 2L+1 rows at limit L: pages 1-3 serve every id once, in order, hasMore exact', async () => {
    const L = 40
    fakeKaiten(kind, 2 * L + 1)
    const adapter = new KaitenAdapter()
    const served: string[] = []
    const more: Array<boolean | undefined> = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: L })
      const rows = await list(adapter, C1, '1', params)
      served.push(...rows.map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(served).toEqual(ids(kind, 'tok-1', '1', 0, 2 * L + 1))
    expect(more).toEqual([true, true, false])
  })

  it('API path: parseListQuery + listPage walks the whole collection once', async () => {
    fakeKaiten(kind, 230)
    const adapter = new KaitenAdapter()
    const served: string[] = []
    for (let page = 1; page < 20; page++) {
      const params = parseListQuery({ limit: '25', page: String(page) })
      const env = listPage(await list(adapter, C1, '1', params), params, 'kaiten')
      served.push(...env.data.map((r) => r.id))
      if (env.meta.hasMore !== true) break
    }
    expect(served).toEqual(ids(kind, 'tok-1', '1', 0, 230))
  })

  it('two connections interleaved each walk their own rows', async () => {
    const L = 40
    fakeKaiten(kind, 2 * L + 1)
    const adapter = new KaitenAdapter()
    const a1 = await list(adapter, C1, '1', withPageSink({ page: 1, limit: L }))
    const b2 = await list(adapter, C2, '1', withPageSink({ page: 2, limit: L }))
    const a2 = await list(adapter, C1, '1', withPageSink({ page: 2, limit: L }))
    expect(a1.map((r) => r.id)).toEqual(ids(kind, 'tok-1', '1', 0, L))
    expect(b2.map((r) => r.id)).toEqual(ids(kind, 'tok-2', '1', L, L))
    expect(a2.map((r) => r.id)).toEqual(ids(kind, 'tok-1', '1', L, L))
  })

  it.runIf(kind === 'cards' || kind === 'comments')(
    'two parents interleaved each walk their own rows',
    async () => {
      const L = 40
      fakeKaiten(kind, 2 * L + 1)
      const adapter = new KaitenAdapter()
      const a1 = await list(adapter, C1, '1', withPageSink({ page: 1, limit: L }))
      const b2 = await list(adapter, C1, '2', withPageSink({ page: 2, limit: L }))
      const a2 = await list(adapter, C1, '1', withPageSink({ page: 2, limit: L }))
      expect(a1.map((r) => r.id)).toEqual(ids(kind, 'tok-1', '1', 0, L))
      expect(b2.map((r) => r.id)).toEqual(ids(kind, 'tok-1', '2', L, L))
      expect(a2.map((r) => r.id)).toEqual(ids(kind, 'tok-1', '1', L, L))
    },
  )
})

describe.each(OFFSET_LISTS)('kaiten %s sends the documented offset', (_name, kind, list) => {
  it('page 2 is fetched with offset = L and limit = L', async () => {
    const L = 40
    const { requests } = fakeKaiten(kind, 2 * L + 1)
    const adapter = new KaitenAdapter()
    await list(adapter, C1, '1', withPageSink({ page: 2, limit: L }))
    const page2 = requests.filter((r) => r.params['offset'] === L)
    expect(page2).toHaveLength(1)
    expect(page2[0]!.params['limit']).toBe(L)
    for (const r of requests) expect(r.params['cursor']).toBeUndefined()
  })

  it('a limit above 100 is clamped to 100, reported, and strides by 100', async () => {
    const L = 250
    const { requests } = fakeKaiten(kind, 2 * L + 1)
    const adapter = new KaitenAdapter()
    const p1 = withPageSink({ page: 1, limit: L })
    const r1 = await list(adapter, C1, '1', p1)
    const p2 = withPageSink({ page: 2, limit: L })
    const r2 = await list(adapter, C1, '1', p2)
    expect(r1.map((r) => r.id)).toEqual(ids(kind, 'tok-1', '1', 0, KAITEN_MAX))
    expect(r2.map((r) => r.id)).toEqual(ids(kind, 'tok-1', '1', KAITEN_MAX, KAITEN_MAX))
    expect(readUpstreamPage(p1)).toMatchObject({ hasMore: true, pageSize: KAITEN_MAX })
    expect(requests.map((r) => [r.params['limit'], r.params['offset']])).toEqual([
      [KAITEN_MAX, 0],
      [KAITEN_MAX, KAITEN_MAX],
    ])
  })

  it('with no caller limit, sends the documented default of 100 and strides by it', async () => {
    const { requests } = fakeKaiten(kind, 2 * KAITEN_MAX + 1)
    const adapter = new KaitenAdapter()
    const params = withPageSink({ page: 2 })
    const rows = await list(adapter, C1, '1', params)
    expect(rows.map((r) => r.id)).toEqual(ids(kind, 'tok-1', '1', KAITEN_MAX, KAITEN_MAX))
    expect(requests.map((r) => [r.params['limit'], r.params['offset']])).toEqual([
      [KAITEN_MAX, KAITEN_MAX],
    ])
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })
})

describe('kaiten listTasks keeps its board filter', () => {
  it('sends board_id and additional_card_fields on every request', async () => {
    const { requests } = fakeKaiten('cards', 5)
    const adapter = new KaitenAdapter()
    await adapter.listTasks(C1, '7', withPageSink({ page: 1, limit: 2 }))
    for (const r of requests) {
      expect(r.params).toMatchObject({ board_id: 7, additional_card_fields: 'description' })
    }
  })
})

describe('kaiten listComments pages the whole list locally', () => {
  it('sends no undocumented paging input and slices the full response', async () => {
    const { requests } = fakeKaiten('comments', 7)
    const adapter = new KaitenAdapter()
    const params = withPageSink({ page: 2, limit: 3 })
    const rows = await adapter.listComments(C1, '1', params)
    expect(rows.map((r) => r.id)).toEqual(ids('comments', 'tok-1', '1', 3, 3))
    expect(readUpstreamPage(params)).toMatchObject({
      totalCount: 7,
      hasMore: true,
      pagedLocally: true,
    })
    expect(requests[0]!.params['limit']).toBeUndefined()
    expect(requests[0]!.params['offset']).toBeUndefined()
  })

  it('drops deleted comments before slicing, so no page comes back short', async () => {
    fakeKaiten('comments', 7, [], [0, 1])
    const adapter = new KaitenAdapter()
    const params = withPageSink({ page: 1, limit: 3 })
    const rows = await adapter.listComments(C1, '1', params)
    expect(rows.map((r) => r.id)).toEqual(ids('comments', 'tok-1', '1', 2, 3))
    expect(readUpstreamPage(params)).toMatchObject({ totalCount: 5, hasMore: true })
  })
})
