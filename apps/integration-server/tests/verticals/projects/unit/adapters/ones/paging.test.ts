/**
 * ONES OpenAPI v2 pages `GET /project/projects` and `GET /project/issues` by
 * cursor: `limit` ("Default value: 50 ... exceeding 100 will be truncated to
 * 100") and `cursor` ("The starting location of this request"), with
 * `pageInfo.endCursor` / `pageInfo.hasNextPage` in the response
 * (https://docs.ones.com/developer/openapi/api/01-get-team-project-list/,
 * https://docs.ones.com/developer/openapi/api/01-get-a-list-of-issues/).
 *
 * `GET /project/issues/:issueID/comments` documents only `teamID` — no limit
 * and no cursor (https://docs.ones.com/developer/openapi/api/01-get-a-list-of-issues-comment/)
 * — so the adapter pages the whole response locally.
 *
 * Every list used to forward only `params.cursor`, so caller page 2 repeated
 * page 1. The fake honours ONLY the documented paging inputs.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import axios from 'axios'
import {
  withPageSink,
  readUpstreamPage,
  _resetCursorPager,
  parseListQuery,
  listPage,
} from '@opensteward/shared'
import type { Credentials, PageMaxBearing, QueryParams } from '@opensteward/shared'
import { OnesAdapter } from '../../../../../../src/verticals/projects/adapters/ones/index'

const CFG = {
  clientId: 'cid',
  clientSecret: 'sec',
  redirectUri: 'http://localhost:3010/auth/projects/ones/callback',
}

const C1: Credentials = {
  accessToken: 'tok-1',
  refreshToken: 'ref-1',
  extra: { domain: 'https://acme.ones.com' },
}
const C2: Credentials = {
  accessToken: 'tok-2',
  refreshToken: 'ref-2',
  extra: { domain: 'https://acme.ones.com' },
}

/** Documented default and maximum of `limit`. */
const ONES_DEFAULT = 50
const ONES_MAX = 100

type Kind = 'projects' | 'issues' | 'comments'

interface Req {
  token: string
  path: string
  params: Record<string, unknown>
}

function idOf(kind: Kind, token: string, parent: string, n: number): string {
  return `${kind}-${token}-${parent}-${String(n).padStart(4, '0')}`
}

function row(kind: Kind, token: string, parent: string, n: number): Record<string, unknown> {
  const id = idOf(kind, token, parent, n)
  switch (kind) {
    case 'projects':
      return { id, name: id, createTime: 1_700_000_000 + n }
    case 'issues':
      return { id, title: id, createTime: 1_700_000_000 + n, project: { id: parent, name: parent } }
    case 'comments':
      return { id, text: id, createTime: 1_700_000_000 + n, owner: { id: 'u1', name: 'u' } }
  }
}

/** Opaque cursor: the fake encodes the start row, the adapter must not parse it. */
function encodeCursor(token: string, parent: string, start: number): string {
  return Buffer.from(`${token}|${parent}|${start}`).toString('base64')
}
function decodeCursor(cursor: string, token: string, parent: string): number {
  const [t, p, s] = Buffer.from(cursor, 'base64').toString('utf8').split('|')
  if (t !== token || p !== parent) throw new Error('cursor from another collection')
  return Number(s)
}

/**
 * One ONES endpoint holding `total` rows per (token, parent). Projects and
 * issues honour only `limit` (≤ 100, truncated above) and `cursor`; the
 * comments endpoint honours neither and returns every row.
 */
function fakeOnes(kind: Kind, total: number, requests: Req[] = [], commentsHasNext = false) {
  vi.spyOn(axios, 'create').mockImplementation(((config?: {
    headers?: Record<string, unknown>
  }) => {
    const token = String(config?.headers?.['Authorization'] ?? '').replace(/^Bearer /, '')
    const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
      const params = { ...(cfg?.params ?? {}) }
      requests.push({ token, path, params })
      let parent: string
      if (kind === 'projects') {
        if (path !== '/project/projects') throw new Error(`unexpected path ${path}`)
        parent = 'all'
      } else if (kind === 'issues') {
        if (path !== '/project/issues') throw new Error(`unexpected path ${path}`)
        parent = String(params['projectID'])
      } else {
        const m = path.match(/^\/project\/issues\/([^/]+)\/comments$/)
        if (!m) throw new Error(`unexpected path ${path}`)
        parent = m[1]!
      }
      // Cursor-list rows belong to the named team, so a dropped teamID shows.
      if (kind !== 'comments' && params['teamID'] !== undefined) {
        parent = `${parent}@${String(params['teamID'])}`
      }
      const all = Array.from({ length: total }, (_, i) => row(kind, token, parent, i))
      if (kind === 'comments') {
        return {
          data: {
            result: 'success',
            data: { list: all, pageInfo: { count: all.length, hasNextPage: commentsHasNext } },
          },
        }
      }
      const rawLimit = params['limit']
      const limit = rawLimit === undefined ? ONES_DEFAULT : Math.min(ONES_MAX, Number(rawLimit))
      if (!Number.isInteger(limit) || limit < 1) throw new Error(`limit ${String(rawLimit)}`)
      const start =
        typeof params['cursor'] === 'string' ? decodeCursor(params['cursor'], token, parent) : 0
      const list = all.slice(start, start + limit)
      const end = start + list.length
      return {
        data: {
          result: 'SUCCESS',
          data: {
            list,
            pageInfo: {
              count: list.length,
              endCursor: encodeCursor(token, parent, end),
              hasNextPage: end < total,
              totalCount: total,
            },
          },
        },
      }
    })
    return { get }
  }) as unknown as typeof axios.create)
  return { requests }
}

type Lister = (
  a: OnesAdapter,
  c: Credentials,
  parent: string,
  p: QueryParams,
) => Promise<{ id: string }[]>

const LISTS: Array<[string, Kind, Lister]> = [
  ['listProjects', 'projects', (a, c, _parent, p) => a.listProjects(c, p)],
  ['listTasks', 'issues', (a, c, parent, p) => a.listTasks(c, parent, p)],
  ['listComments', 'comments', (a, c, parent, p) => a.listComments(c, parent, p)],
]

function ids(kind: Kind, token: string, parent: string, from: number, n: number): string[] {
  const par = kind === 'projects' ? 'all' : parent
  return Array.from({ length: n }, (_, i) => idOf(kind, token, par, from + i))
}

beforeEach(() => _resetCursorPager())
afterEach(() => vi.restoreAllMocks())

describe.each(LISTS)('ones %s pages at the caller size', (_name, kind, list) => {
  it('N = 2L+1 rows at limit L: pages 1-3 serve every id once, in order, hasMore exact', async () => {
    const L = 40
    fakeOnes(kind, 2 * L + 1)
    const adapter = new OnesAdapter(CFG)
    const served: string[] = []
    const more: Array<boolean | undefined> = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: L })
      const rows = await list(adapter, C1, 'p1', params)
      served.push(...rows.map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(served).toEqual(ids(kind, 'tok-1', 'p1', 0, 2 * L + 1))
    expect(more).toEqual([true, true, false])
  })

  it('API path: parseListQuery + listPage walks the whole collection once', async () => {
    fakeOnes(kind, 230)
    const adapter = new OnesAdapter(CFG)
    const served: string[] = []
    for (let page = 1; page < 20; page++) {
      const params = parseListQuery({ limit: '25', page: String(page) }, adapter as PageMaxBearing)
      const env = listPage(await list(adapter, C1, 'p1', params), params, 'ones')
      served.push(...env.data.map((r) => r.id))
      if (env.meta.hasMore !== true) break
    }
    expect(served).toEqual(ids(kind, 'tok-1', 'p1', 0, 230))
  })

  it('two connections interleaved within the TTL each walk their own rows', async () => {
    const L = 40
    fakeOnes(kind, 2 * L + 1)
    const adapter = new OnesAdapter(CFG)
    const a1 = await list(adapter, C1, 'p1', withPageSink({ page: 1, limit: L }))
    const b2 = await list(adapter, C2, 'p1', withPageSink({ page: 2, limit: L }))
    const a2 = await list(adapter, C1, 'p1', withPageSink({ page: 2, limit: L }))
    expect(a1.map((r) => r.id)).toEqual(ids(kind, 'tok-1', 'p1', 0, L))
    expect(b2.map((r) => r.id)).toEqual(ids(kind, 'tok-2', 'p1', L, L))
    expect(a2.map((r) => r.id)).toEqual(ids(kind, 'tok-1', 'p1', L, L))
  })

  it.runIf(kind !== 'projects')('two parents interleaved each walk their own rows', async () => {
    const L = 40
    fakeOnes(kind, 2 * L + 1)
    const adapter = new OnesAdapter(CFG)
    const a1 = await list(adapter, C1, 'p1', withPageSink({ page: 1, limit: L }))
    const b2 = await list(adapter, C1, 'p2', withPageSink({ page: 2, limit: L }))
    const a2 = await list(adapter, C1, 'p1', withPageSink({ page: 2, limit: L }))
    expect(a1.map((r) => r.id)).toEqual(ids(kind, 'tok-1', 'p1', 0, L))
    expect(b2.map((r) => r.id)).toEqual(ids(kind, 'tok-1', 'p2', L, L))
    expect(a2.map((r) => r.id)).toEqual(ids(kind, 'tok-1', 'p1', L, L))
  })
})

const CURSOR_LISTS = LISTS.filter(([, kind]) => kind !== 'comments')

describe.each(CURSOR_LISTS)('ones %s sends the documented paging inputs', (_n, kind, list) => {
  it('page 1 sends limit and no cursor; page 2 carries cursor = pageInfo.endCursor', async () => {
    const { requests } = fakeOnes(kind, 250)
    const adapter = new OnesAdapter(CFG)
    await list(adapter, C1, 'p1', withPageSink({ page: 1, limit: 60 }))
    await list(adapter, C1, 'p1', withPageSink({ page: 2, limit: 60 }))
    expect(requests).toHaveLength(2)
    expect(requests[0]!.params['limit']).toBe(60)
    expect(requests[0]!.params['cursor']).toBeUndefined()
    expect(requests[1]!.params['limit']).toBe(60)
    const parent = kind === 'projects' ? 'all' : 'p1'
    expect(requests[1]!.params['cursor']).toBe(encodeCursor('tok-1', parent, 60))
  })

  it('changing the limit between pages never reuses a cursor stored at another size', async () => {
    fakeOnes(kind, 300)
    const adapter = new OnesAdapter(CFG)
    const p1 = await list(adapter, C1, 'p1', withPageSink({ page: 1, limit: 25 }))
    const p2 = await list(adapter, C1, 'p1', withPageSink({ page: 2, limit: 60 }))
    expect(p1.map((r) => r.id)).toEqual(ids(kind, 'tok-1', 'p1', 0, 25))
    expect(p2.map((r) => r.id)).toEqual(ids(kind, 'tok-1', 'p1', 60, 60))
  })

  it('an explicit cursor param names the upstream page directly', async () => {
    const { requests } = fakeOnes(kind, 40)
    const adapter = new OnesAdapter(CFG)
    const parent = kind === 'projects' ? 'all' : 'p1'
    const cursor = encodeCursor('tok-1', parent, 10)
    const params = withPageSink({ page: 1, limit: 5 })
    params['cursor'] = cursor
    const rows = await list(adapter, C1, 'p1', params)
    expect(requests).toHaveLength(1)
    expect(requests[0]!.params['cursor']).toBe(cursor)
    expect(rows.map((r) => r.id)).toEqual(ids(kind, 'tok-1', 'p1', 10, 5))
    expect(readUpstreamPage(params)?.hasMore).toBe(true)
  })

  it('forwards teamID and keys the cursor chain per team', async () => {
    const { requests } = fakeOnes(kind, 81)
    const adapter = new OnesAdapter(CFG)
    const withTeam = (page: number, team: string): QueryParams => {
      const p = withPageSink({ page, limit: 40 })
      p['teamID'] = team
      return p
    }
    const a1 = await list(adapter, C1, 'p1', withTeam(1, 'tA'))
    const b2 = await list(adapter, C1, 'p1', withTeam(2, 'tB'))
    const a2 = await list(adapter, C1, 'p1', withTeam(2, 'tA'))
    expect(requests[0]!.params['teamID']).toBe('tA')
    const par = kind === 'projects' ? 'all' : 'p1'
    const teamIds = (team: string, from: number, n: number): string[] =>
      Array.from({ length: n }, (_, i) => idOf(kind, 'tok-1', `${par}@${team}`, from + i))
    expect(a1.map((r) => r.id)).toEqual(teamIds('tA', 0, 40))
    expect(b2.map((r) => r.id)).toEqual(teamIds('tB', 40, 40))
    expect(a2.map((r) => r.id)).toEqual(teamIds('tA', 40, 40))
  })

  it('without a caller limit, sends the documented default of 50', async () => {
    const { requests } = fakeOnes(kind, 120)
    const adapter = new OnesAdapter(CFG)
    const rows = await list(adapter, C1, 'p1', withPageSink({ page: 1 }))
    expect(requests[0]!.params['limit']).toBe(ONES_DEFAULT)
    expect(rows).toHaveLength(ONES_DEFAULT)
  })

  it('a limit above the documented maximum is clamped to 100 and reported as the page size', async () => {
    const { requests } = fakeOnes(kind, 250)
    const adapter = new OnesAdapter(CFG)
    const params = withPageSink({ page: 1, limit: 500 })
    const rows = await list(adapter, C1, 'p1', params)
    expect(requests[0]!.params['limit']).toBe(ONES_MAX)
    expect(rows.map((r) => r.id)).toEqual(ids(kind, 'tok-1', 'p1', 0, ONES_MAX))
    expect(readUpstreamPage(params)).toMatchObject({ hasMore: true, pageSize: ONES_MAX })
    const p2 = withPageSink({ page: 2, limit: 500 })
    const rows2 = await list(adapter, C1, 'p1', p2)
    expect(rows2.map((r) => r.id)).toEqual(ids(kind, 'tok-1', 'p1', ONES_MAX, ONES_MAX))
  })
})

describe('ones listComments pages the whole list locally', () => {
  it('sends no undocumented paging input and slices the full response', async () => {
    const { requests } = fakeOnes('comments', 7)
    const adapter = new OnesAdapter(CFG)
    const params = withPageSink({ page: 2, limit: 3 })
    params['teamID'] = 'team-1'
    const rows = await adapter.listComments(C1, 'p1', params)
    expect(rows.map((r) => r.id)).toEqual(ids('comments', 'tok-1', 'p1', 3, 3))
    expect(readUpstreamPage(params)).toMatchObject({
      totalCount: 7,
      hasMore: true,
      pagedLocally: true,
    })
    expect(requests[0]!.params).toEqual({ teamID: 'team-1' })
  })

  it('refuses to serve a list ONES marks as partial (pageInfo.hasNextPage)', async () => {
    fakeOnes('comments', 7, [], true)
    const adapter = new OnesAdapter(CFG)
    await expect(
      adapter.listComments(C1, 'p1', withPageSink({ page: 1, limit: 3 })),
    ).rejects.toThrow(/partial comment list/)
  })
})
