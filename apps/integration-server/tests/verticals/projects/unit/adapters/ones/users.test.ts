/**
 * ONES users.
 *
 * listUsers used to call `GET /account/users/batch`, which is a lookup by id:
 * "Use the team ID and user IDs to retrieve users in a specified team. Each
 * request supports 1–100 users. ... ids string[] required Item count: 1–100"
 * (https://docs.ones.com/developer/openapi/api/01-get-user-list/). It is not
 * a list, and its response is `{ data: [ ... ] }`, not `{ data: { list } }`.
 *
 * The team's user list is `GET /account/users/search`: "Query Parameters
 * teamID string required The team ID limit integer Possible values: <= 100
 * Default value: 50 ... exceeding 100 will be truncated to 100 cursor string
 * The starting location of this request keyword string", answered with
 * `data.list` and `data.pageInfo.endCursor` / `hasNextPage`
 * (https://docs.ones.com/developer/openapi/api/01-get-team-user-search-list/).
 *
 * The fake honours ONLY those documented parameters and rejects anything else.
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
import type { Credentials, PageMaxBearing } from '@opensteward/shared'
import { OnesAdapter } from '../../../../../../src/verticals/projects/adapters/ones/index'
import { UserSchema } from '../../../../../../src/verticals/projects/schema/user'

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

const ONES_DEFAULT = 50
const ONES_MAX = 100
const DOCUMENTED = new Set(['teamID', 'limit', 'cursor', 'keyword'])

interface Req {
  token: string
  path: string
  params: Record<string, unknown>
}

function userId(token: string, team: string, n: number): string {
  return `u-${token}-${team}-${String(n).padStart(4, '0')}`
}

/** Row shaped like the documented example of GET /account/users/search. */
function userRow(token: string, team: string, n: number): Record<string, unknown> {
  return {
    id: userId(token, team, n),
    email: `user${n}@ones.cn`,
    name: `user ${n}`,
    phone: '+860000000000',
    avatar: '/api/project/file/avatar/Fu-Dl5d3F0EUZOe1UUxU1EEsL2Dv',
    organization: 'ONES',
    staffID: String(n).padStart(6, '0'),
    position: 'Software Engineer',
    status: 'normal',
  }
}

function encodeCursor(token: string, team: string, start: number): string {
  return Buffer.from(`${token}|${team}|${start}`).toString('base64')
}
function decodeCursor(cursor: string, token: string, team: string): number {
  const [t, p, s] = Buffer.from(cursor, 'base64').toString('utf8').split('|')
  if (t !== token || p !== team) throw new Error('cursor from another collection')
  return Number(s)
}

function fakeUsers(total: number, requests: Req[] = []) {
  vi.spyOn(axios, 'create').mockImplementation(((config?: {
    headers?: Record<string, unknown>
  }) => {
    const token = String(config?.headers?.['Authorization'] ?? '').replace(/^Bearer /, '')
    const get = vi.fn(async (path: string, cfg?: { params?: Record<string, unknown> }) => {
      const params = { ...(cfg?.params ?? {}) }
      requests.push({ token, path, params })
      if (path !== '/account/users/search') throw new Error(`unexpected path ${path}`)
      for (const k of Object.keys(params)) {
        if (!DOCUMENTED.has(k)) throw new Error(`undocumented parameter ${k}`)
      }
      if (typeof params['teamID'] !== 'string' || params['teamID'] === '') {
        throw new Error('teamID is required')
      }
      const team = params['teamID']
      const rawLimit = params['limit']
      const limit = rawLimit === undefined ? ONES_DEFAULT : Math.min(ONES_MAX, Number(rawLimit))
      if (!Number.isInteger(limit) || limit < 1) throw new Error(`limit ${String(rawLimit)}`)
      const start =
        typeof params['cursor'] === 'string' ? decodeCursor(params['cursor'], token, team) : 0
      const all = Array.from({ length: total }, (_, i) => userRow(token, team, i))
      const list = all.slice(start, start + limit)
      const end = start + list.length
      return {
        data: {
          data: {
            list,
            pageInfo: {
              count: list.length,
              endCursor: encodeCursor(token, team, end),
              hasNextPage: end < total,
              startCursor: encodeCursor(token, team, start),
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

function ids(token: string, team: string, from: number, n: number): string[] {
  return Array.from({ length: n }, (_, i) => userId(token, team, from + i))
}

beforeEach(() => _resetCursorPager())
afterEach(() => vi.restoreAllMocks())

describe('ones listUsers lists the team through GET /account/users/search', () => {
  it('N = 2L+1 rows at limit L: pages 1-3 serve every id once, in order, hasMore exact', async () => {
    const L = 40
    fakeUsers(2 * L + 1)
    const adapter = new OnesAdapter(CFG)
    const served: string[] = []
    const more: Array<boolean | undefined> = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: L })
      const rows = await adapter.listUsers(C1, 'team-1', params)
      served.push(...rows.map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(served).toEqual(ids('tok-1', 'team-1', 0, 2 * L + 1))
    expect(new Set(served).size).toBe(2 * L + 1)
    expect(more).toEqual([true, true, false])
  })

  it('API path: parseListQuery + listPage walks the whole team once', async () => {
    fakeUsers(230)
    const adapter = new OnesAdapter(CFG)
    const served: string[] = []
    for (let page = 1; page < 20; page++) {
      const params = parseListQuery({ limit: '25', page: String(page) }, adapter as PageMaxBearing)
      const env = listPage(await adapter.listUsers(C1, 'team-1', params), params, 'ones')
      served.push(...env.data.map((r) => r.id))
      if (env.meta.hasMore !== true) break
    }
    expect(served).toEqual(ids('tok-1', 'team-1', 0, 230))
  })

  it('sends teamID = the workspace id, the caller limit, and cursor = pageInfo.endCursor on page 2', async () => {
    const { requests } = fakeUsers(250)
    const adapter = new OnesAdapter(CFG)
    await adapter.listUsers(C1, 'team-1', withPageSink({ page: 1, limit: 60 }))
    await adapter.listUsers(C1, 'team-1', withPageSink({ page: 2, limit: 60 }))
    expect(requests).toHaveLength(2)
    expect(requests[0]!.params).toEqual({ teamID: 'team-1', limit: 60 })
    expect(requests[1]!.params).toEqual({
      teamID: 'team-1',
      limit: 60,
      cursor: encodeCursor('tok-1', 'team-1', 60),
    })
  })

  it('two connections and two teams interleaved each walk their own rows', async () => {
    const L = 40
    fakeUsers(2 * L + 1)
    const adapter = new OnesAdapter(CFG)
    const a1 = await adapter.listUsers(C1, 'tA', withPageSink({ page: 1, limit: L }))
    const b2 = await adapter.listUsers(C2, 'tA', withPageSink({ page: 2, limit: L }))
    const c2 = await adapter.listUsers(C1, 'tB', withPageSink({ page: 2, limit: L }))
    const a2 = await adapter.listUsers(C1, 'tA', withPageSink({ page: 2, limit: L }))
    expect(a1.map((r) => r.id)).toEqual(ids('tok-1', 'tA', 0, L))
    expect(b2.map((r) => r.id)).toEqual(ids('tok-2', 'tA', L, L))
    expect(c2.map((r) => r.id)).toEqual(ids('tok-1', 'tB', L, L))
    expect(a2.map((r) => r.id)).toEqual(ids('tok-1', 'tA', L, L))
  })

  it('without a caller limit, sends the documented default of 50', async () => {
    const { requests } = fakeUsers(120)
    const adapter = new OnesAdapter(CFG)
    const rows = await adapter.listUsers(C1, 'team-1', withPageSink({ page: 1 }))
    expect(requests[0]!.params['limit']).toBe(ONES_DEFAULT)
    expect(rows).toHaveLength(ONES_DEFAULT)
  })

  it('a limit above the documented maximum is clamped to 100 and reported as the page size', async () => {
    const { requests } = fakeUsers(250)
    const adapter = new OnesAdapter(CFG)
    const params = withPageSink({ page: 1, limit: 500 })
    const rows = await adapter.listUsers(C1, 'team-1', params)
    expect(requests[0]!.params['limit']).toBe(ONES_MAX)
    expect(rows.map((r) => r.id)).toEqual(ids('tok-1', 'team-1', 0, ONES_MAX))
    expect(readUpstreamPage(params)).toMatchObject({ hasMore: true, pageSize: ONES_MAX })
  })

  it('maps rows to the canonical user in the requested team', async () => {
    fakeUsers(3)
    const adapter = new OnesAdapter(CFG)
    const rows = await adapter.listUsers(C1, 'team-1', withPageSink({ page: 1, limit: 10 }))
    expect(rows).toHaveLength(3)
    for (const u of rows) UserSchema.parse(u)
    expect(rows[0]).toMatchObject({
      id: userId('tok-1', 'team-1', 0),
      email: 'user0@ones.cn',
      name: 'user 0',
      workspaceIds: ['team-1'],
      platform: 'ones',
    })
  })

  it('refuses an empty workspace id without sending a request (teamID is required)', async () => {
    const { requests } = fakeUsers(3)
    const adapter = new OnesAdapter(CFG)
    await expect(
      adapter.listUsers(C1, '', withPageSink({ page: 1, limit: 10 })),
    ).rejects.toMatchObject({ statusCode: 400 })
    expect(requests).toHaveLength(0)
  })
})

describe('ones getUser', () => {
  it('refuses with 501 NOT_SUPPORTED and sends no request: the lookup needs a teamID it is not given', async () => {
    const { requests } = fakeUsers(3)
    const adapter = new OnesAdapter(CFG)
    await expect(adapter.getUser(C1, 'u1')).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(requests).toHaveLength(0)
  })
})
