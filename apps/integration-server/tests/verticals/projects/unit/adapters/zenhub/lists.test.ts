/**
 * listComments, listWorkspaces and listUsers against the public schema
 * (https://developers.zenhub.com/schema/zenhub-public-api.graphql, the SDL
 * the docs Explorer loads):
 *
 *   Issue.comments(after, before, first, last): CommentConnection!
 *   ZenhubUser.zenhubOrganizations(after, before, first, last, query): ZenhubOrganizationConnection!
 *   ZenhubOrganization.workspaces(after, before, first, last, orderBy, query, workspaceIds): WorkspaceConnection!
 *   Workspace.zenhubUsers(after, before, filters, first, last, query): ZenhubUserConnection!
 *
 * Paging (https://developers.zenhub.com/graphql-api-docs/pagination): "it is
 * required that you specify a first or last value, and that this value be no
 * more than 100", and the next page passes `pageInfo.endCursor` as `after`
 * "as long as pageInfo.hasNextPage returns true".
 *
 * The fake honours ONLY those arguments. Cursors are opaque and bound to the
 * token and the parent, so a cursor replayed elsewhere is rejected.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import axios from 'axios'
import {
  withPageSink,
  readUpstreamPage,
  _resetCursorPager,
  _resetRowPager,
  parseListQuery,
  listPage,
} from '@opensteward/shared'
import type { Credentials } from '@opensteward/shared'
import { ZenhubAdapter } from '../../../../../../src/verticals/projects/adapters/zenhub/index'
import { CommentSchema } from '../../../../../../src/verticals/projects/schema/comment'
import { WorkspaceSchema } from '../../../../../../src/verticals/projects/schema/workspace'
import { UserSchema } from '../../../../../../src/verticals/projects/schema/user'

vi.mock('axios')

const C1: Credentials = { accessToken: 'zh-token-1', extra: {} }
const C2: Credentials = { accessToken: 'zh-token-2', extra: {} }
const ZH_MAX = 100

interface Req {
  token: string
  op: string
  query: string
  variables: Record<string, unknown>
}

interface World {
  /** issue id → comment count */
  comments?: Record<string, number>
  /** workspace id → member count */
  members?: Record<string, number>
  /** workspace counts per organization, in order */
  orgs?: number[]
  errors?: string[]
  /** answer `{ data: null }` with no errors array */
  noData?: boolean
  /** break the comments pageInfo: hasNextPage true with a null endCursor */
  noEndCursor?: boolean
}

function encode(token: string, parent: string, offset: number): string {
  return Buffer.from(`c:${token}:${parent}:${offset}`).toString('base64')
}

function decode(cursor: unknown, token: string, parent: string): number {
  if (cursor === undefined || cursor === null) return 0
  const m = Buffer.from(String(cursor), 'base64')
    .toString('utf8')
    .match(/^c:([^:]+):([^:]+):(\d+)$/)
  if (!m || m[1] !== token || m[2] !== parent) throw new Error(`foreign cursor ${String(cursor)}`)
  return Number(m[3])
}

function checkFirst(first: unknown): number {
  if (typeof first !== 'number' || !Number.isInteger(first) || first < 1 || first > ZH_MAX)
    throw new Error(`first ${String(first)} out of range`)
  return first
}

function connection<T>(all: T[], start: number, first: number, token: string, parent: string) {
  const nodes = all.slice(start, start + first)
  const end = start + nodes.length
  return {
    nodes,
    pageInfo: {
      hasNextPage: end < all.length,
      endCursor: nodes.length > 0 ? encode(token, parent, end) : null,
    },
  }
}

const commentId = (t: string, issue: string, i: number) =>
  `cmt-${t}-${issue}-${String(i).padStart(4, '0')}`
const userId = (t: string, ws: string, i: number) => `usr-${t}-${ws}-${String(i).padStart(4, '0')}`
const wsId = (t: string, org: number, i: number) => `ws-${t}-o${org}-${String(i).padStart(4, '0')}`

function allWorkspaceIds(token: string, orgs: number[]): string[] {
  return orgs.flatMap((n, o) => Array.from({ length: n }, (_, i) => wsId(token, o, i)))
}

function fakeZenhub(world: World, requests: Req[] = []) {
  vi.mocked(axios.create).mockImplementation(((config?: { headers?: Record<string, unknown> }) => {
    const token = String(config?.headers?.['Authorization'] ?? '').replace(/^Bearer /, '')
    const post = vi.fn(
      async (_url: string, body: { query: string; variables?: Record<string, unknown> }) => {
        const variables = { ...(body.variables ?? {}) }
        const op = body.query.match(/query (\w+)/)?.[1] ?? ''
        requests.push({ token, op, query: body.query, variables })
        if (world.errors)
          return { data: { data: null, errors: world.errors.map((message) => ({ message })) } }
        if (world.noData) return { data: { data: null } }
        const data = answer(op, body.query, variables, token, world) as Record<string, unknown>
        if (world.noEndCursor) {
          const conn = (data['node'] as { comments?: { pageInfo: object } } | null)?.comments
          if (conn) conn.pageInfo = { hasNextPage: true, endCursor: null }
        }
        return { data: { data } }
      },
    )
    return { post } as unknown as ReturnType<typeof axios.create>
  }) as unknown as typeof axios.create)
  return { requests }
}

function answer(op: string, query: string, v: Record<string, unknown>, token: string, w: World) {
  switch (op) {
    case 'IssueComments': {
      const issue = String(v['id'])
      const n = w.comments?.[issue]
      if (n === undefined) return { node: null }
      if (!query.includes('comments(first: $first, after: $after)'))
        throw new Error('comments args')
      const all = Array.from({ length: n }, (_, i) => ({
        id: commentId(token, issue, i),
        body: `body ${i}`,
        createdAt: '2024-01-15T10:00:00Z',
        updatedAt: '2024-01-15T10:00:00Z',
        lastEditedAt: null,
        author: { id: 'author-1' },
      }))
      const first = checkFirst(v['first'])
      return {
        node: {
          id: issue,
          comments: connection(all, decode(v['after'], token, issue), first, token, issue),
        },
      }
    }
    case 'WorkspaceUsers': {
      const ws = String(v['id'])
      const n = w.members?.[ws]
      if (n === undefined) return { workspace: null }
      const all = Array.from({ length: n }, (_, i) => ({
        id: userId(token, ws, i),
        name: `User ${i}`,
        email: `u${i}@example.com`,
        githubUser: { login: `u${i}` },
      }))
      const first = checkFirst(v['first'])
      return {
        workspace: {
          id: ws,
          zenhubUsers: connection(all, decode(v['after'], token, ws), first, token, ws),
        },
      }
    }
    case 'OrganizationWorkspaces': {
      // `zenhubOrganizations(first: 1, after: $orgsAfter)`: one organization per request.
      if (!query.includes('zenhubOrganizations(first: 1, after: $orgsAfter)'))
        throw new Error('orgs args')
      if (!query.includes('workspaces(first: $first, after: $after)'))
        throw new Error('workspaces args')
      const orgs = w.orgs ?? []
      const o = decode(v['orgsAfter'], token, 'orgs')
      const first = checkFirst(v['first'])
      const orgNodes =
        o < orgs.length
          ? [
              {
                id: `org-${o}`,
                workspaces: connection(
                  Array.from({ length: orgs[o]! }, (_, i) => ({
                    id: wsId(token, o, i),
                    name: null,
                    displayName: `Workspace ${o}/${i}`,
                    description: null,
                  })),
                  decode(v['after'], token, `org-${o}`),
                  first,
                  token,
                  `org-${o}`,
                ),
              },
            ]
          : []
      const end = o + orgNodes.length
      return {
        viewer: {
          zenhubOrganizations: {
            nodes: orgNodes,
            pageInfo: {
              hasNextPage: end < orgs.length,
              endCursor: orgNodes.length > 0 ? encode(token, 'orgs', end) : null,
            },
          },
        },
      }
    }
    case 'WorkspaceById':
      return {
        workspace:
          v['id'] === 'ws-known'
            ? { id: 'ws-known', name: 'Known', displayName: 'Known WS', description: 'd' }
            : null,
      }
    case 'IssueNode':
      return { node: null }
    case 'UserNode':
      return {
        node:
          v['id'] === 'usr-known'
            ? {
                id: 'usr-known',
                name: 'Known',
                email: 'k@example.com',
                githubUser: { login: 'known' },
              }
            : v['id'] === 'not-a-user'
              ? {}
              : null,
      }
    default:
      throw new Error(`unexpected operation ${op}`)
  }
}

async function walk<T extends { id: string }>(
  fetchPage: (params: ReturnType<typeof withPageSink>) => Promise<T[]>,
  limit: number,
  pages: number,
) {
  const served: string[] = []
  const more: Array<boolean | undefined> = []
  for (let page = 1; page <= pages; page++) {
    const params = withPageSink({ page, limit })
    const rows = await fetchPage(params)
    served.push(...rows.map((r) => r.id))
    more.push(readUpstreamPage(params)?.hasMore)
  }
  return { served, more }
}

beforeEach(() => {
  _resetCursorPager()
  _resetRowPager()
})
afterEach(() => vi.clearAllMocks())

// ── listComments ─────────────────────────────────────────────────────────────

describe('zenhub listComments reads Issue.comments', () => {
  const ids = (t: string, issue: string, from: number, n: number) =>
    Array.from({ length: n }, (_, i) => commentId(t, issue, from + i))

  it('N = 2L+1 at limit L: every id once, in order, hasMore exact', async () => {
    const L = 30
    fakeZenhub({ comments: { i1: 2 * L + 1 } })
    const a = new ZenhubAdapter()
    const { served, more } = await walk((p) => a.listComments(C1, 'i1', p), L, 3)
    expect(served).toEqual(ids('zh-token-1', 'i1', 0, 2 * L + 1))
    expect(more).toEqual([true, true, false])
  })

  it('sends the issue id, first = limit and after = the previous endCursor', async () => {
    const L = 30
    const { requests } = fakeZenhub({ comments: { i1: 2 * L + 1 } })
    await new ZenhubAdapter().listComments(C1, 'i1', withPageSink({ page: 2, limit: L }))
    expect(requests.map((r) => r.op)).toEqual(['IssueComments', 'IssueComments'])
    expect(requests[0]!.variables).toEqual({ id: 'i1', first: L })
    expect(requests[1]!.variables).toEqual({
      id: 'i1',
      first: L,
      after: encode('zh-token-1', 'i1', L),
    })
    expect(requests[0]!.query).not.toMatch(/timelineItems|type: key/)
  })

  it('a limit above 100 is sent as first = 100 and reported as the page size', async () => {
    const { requests } = fakeZenhub({ comments: { i1: 250 } })
    const p1 = withPageSink({ page: 1, limit: 250 })
    const rows = await new ZenhubAdapter().listComments(C1, 'i1', p1)
    expect(requests.map((r) => r.variables['first'])).toEqual([100])
    expect(readUpstreamPage(p1)).toMatchObject({ hasMore: true, pageSize: 100 })
    expect(rows.map((r) => r.id)).toEqual(ids('zh-token-1', 'i1', 0, 100))
  })

  it('rows parse with CommentSchema and carry the task id', async () => {
    fakeZenhub({ comments: { i1: 2 } })
    const rows = await new ZenhubAdapter().listComments(
      C1,
      'i1',
      withPageSink({ page: 1, limit: 5 }),
    )
    for (const r of rows)
      expect(CommentSchema.parse(r)).toMatchObject({ taskId: 'i1', authorId: 'author-1' })
  })

  it('API path: parseListQuery + listPage walks the whole collection once', async () => {
    fakeZenhub({ comments: { i1: 130 } })
    const a = new ZenhubAdapter()
    const served: string[] = []
    for (let page = 1; page < 20; page++) {
      const params = parseListQuery({ limit: '25', page: String(page) })
      const env = listPage(await a.listComments(C1, 'i1', params), params, 'zenhub')
      served.push(...env.data.map((r) => r.id))
      if (env.meta.hasMore !== true) break
    }
    expect(served).toEqual(ids('zh-token-1', 'i1', 0, 130))
  })

  it('two connections and two issues interleaved each walk their own rows', async () => {
    const L = 10
    fakeZenhub({ comments: { i1: 25, i2: 25 } })
    const a = new ZenhubAdapter()
    await a.listComments(C1, 'i1', withPageSink({ page: 1, limit: L }))
    const b2 = await a.listComments(C2, 'i1', withPageSink({ page: 2, limit: L }))
    const c2 = await a.listComments(C1, 'i2', withPageSink({ page: 2, limit: L }))
    const a2 = await a.listComments(C1, 'i1', withPageSink({ page: 2, limit: L }))
    expect(b2.map((r) => r.id)).toEqual(ids('zh-token-2', 'i1', L, L))
    expect(c2.map((r) => r.id)).toEqual(ids('zh-token-1', 'i2', L, L))
    expect(a2.map((r) => r.id)).toEqual(ids('zh-token-1', 'i1', L, L))
  })

  it('an explicit cursor param names the upstream page directly', async () => {
    const L = 10
    const { requests } = fakeZenhub({ comments: { i1: 25 } })
    const cursor = encode('zh-token-1', 'i1', L)
    const p = withPageSink({ page: 1, limit: L, cursor })
    const rows = await new ZenhubAdapter().listComments(C1, 'i1', p)
    expect(rows.map((r) => r.id)).toEqual(ids('zh-token-1', 'i1', L, L))
    expect(requests.map((r) => r.variables)).toEqual([{ id: 'i1', first: L, after: cursor }])
    expect(readUpstreamPage(p)?.hasMore).toBe(true)
  })

  it('hasNextPage without an endCursor throws rather than ending the list', async () => {
    fakeZenhub({ comments: { i1: 25 }, noEndCursor: true })
    await expect(
      new ZenhubAdapter().listComments(C1, 'i1', withPageSink({ page: 1, limit: 10 })),
    ).rejects.toThrow(/hasNextPage without an endCursor/)
  })

  it('a response with neither data nor errors throws a no-data error', async () => {
    fakeZenhub({ comments: { i1: 5 }, noData: true })
    await expect(
      new ZenhubAdapter().listComments(C1, 'i1', withPageSink({ page: 1, limit: 10 })),
    ).rejects.toThrow(/ZenHub GraphQL response has no data/)
  })

  it('an id that is not an issue is a 404, not an empty list', async () => {
    fakeZenhub({ comments: {} })
    await expect(
      new ZenhubAdapter().listComments(C1, 'nope', withPageSink({ page: 1, limit: 5 })),
    ).rejects.toMatchObject({ statusCode: 404 })
  })

  it('GraphQL errors (HTTP 200 with errors) are thrown, not read as empty', async () => {
    fakeZenhub({ errors: ['Field x does not exist'] })
    await expect(
      new ZenhubAdapter().listComments(C1, 'i1', withPageSink({ page: 1, limit: 5 })),
    ).rejects.toThrow(/Field x does not exist/)
  })
})

// ── listWorkspaces ───────────────────────────────────────────────────────────

describe('zenhub listWorkspaces walks organizations → workspaces', () => {
  it('N = 2L+1 over uneven upstream pages (3, 0, 100, 51, 7): every id once, hasMore exact', async () => {
    const L = 80
    const orgs = [3, 0, 151, 7] // 161 = 2L+1; org 2 needs two upstream pages
    const { requests } = fakeZenhub({ orgs })
    const a = new ZenhubAdapter()
    const { served, more } = await walk((p) => a.listWorkspaces(C1, p), L, 3)
    expect(served).toEqual(allWorkspaceIds('zh-token-1', orgs))
    expect(more).toEqual([true, true, false])
    expect(requests.every((r) => r.op === 'OrganizationWorkspaces')).toBe(true)
    expect(requests.every((r) => r.variables['first'] === 100)).toBe(true)
  })

  it('pages within one organization send after; the next organization sends orgsAfter', async () => {
    const orgs = [2, 150]
    const { requests } = fakeZenhub({ orgs })
    await new ZenhubAdapter().listWorkspaces(C1, withPageSink({ page: 1, limit: 200 }))
    expect(requests.map((r) => r.variables)).toEqual([
      { orgsAfter: null, first: 100, after: null },
      { orgsAfter: encode('zh-token-1', 'orgs', 1), first: 100, after: null },
      {
        orgsAfter: encode('zh-token-1', 'orgs', 1),
        first: 100,
        after: encode('zh-token-1', 'org-1', 100),
      },
    ])
  })

  it('reports pagedLocally and serves no searchWorkspaces or viewer.login query', async () => {
    const { requests } = fakeZenhub({ orgs: [5] })
    const p = withPageSink({ page: 1, limit: 10 })
    const rows = await new ZenhubAdapter().listWorkspaces(C1, p)
    expect(rows).toHaveLength(5)
    expect(readUpstreamPage(p)).toMatchObject({ hasMore: false, pagedLocally: true })
    for (const r of requests) expect(r.query).not.toMatch(/searchWorkspaces|login/)
    for (const r of rows) expect(WorkspaceSchema.parse(r).name).toMatch(/^Workspace 0\//)
  })

  it('an account with no organizations is empty with hasMore false', async () => {
    fakeZenhub({ orgs: [] })
    const p = withPageSink({ page: 1, limit: 10 })
    expect(await new ZenhubAdapter().listWorkspaces(C1, p)).toEqual([])
    expect(readUpstreamPage(p)?.hasMore).toBe(false)
  })

  it('two connections walk their own workspaces', async () => {
    fakeZenhub({ orgs: [4, 4] })
    const a = new ZenhubAdapter()
    await a.listWorkspaces(C1, withPageSink({ page: 1, limit: 3 }))
    const b = await a.listWorkspaces(C2, withPageSink({ page: 2, limit: 3 }))
    const c = await a.listWorkspaces(C1, withPageSink({ page: 2, limit: 3 }))
    expect(b.map((r) => r.id)).toEqual(allWorkspaceIds('zh-token-2', [4, 4]).slice(3, 6))
    expect(c.map((r) => r.id)).toEqual(allWorkspaceIds('zh-token-1', [4, 4]).slice(3, 6))
  })

  it('getWorkspace reads workspace(id) and maps displayName; unknown is a 404', async () => {
    const { requests } = fakeZenhub({})
    const a = new ZenhubAdapter()
    expect(WorkspaceSchema.parse(await a.getWorkspace(C1, 'ws-known')).name).toBe('Known WS')
    expect(requests[0]!.variables).toEqual({ id: 'ws-known' })
    await expect(a.getWorkspace(C1, 'ws-missing')).rejects.toMatchObject({ statusCode: 404 })
  })
})

// ── listUsers ────────────────────────────────────────────────────────────────

describe('zenhub listUsers reads Workspace.zenhubUsers', () => {
  const ids = (t: string, ws: string, from: number, n: number) =>
    Array.from({ length: n }, (_, i) => userId(t, ws, from + i))

  it('N = 2L+1 at limit L: every id once, in order, hasMore exact', async () => {
    const L = 20
    fakeZenhub({ members: { w1: 2 * L + 1 } })
    const a = new ZenhubAdapter()
    const { served, more } = await walk((p) => a.listUsers(C1, 'w1', p), L, 3)
    expect(served).toEqual(ids('zh-token-1', 'w1', 0, 2 * L + 1))
    expect(more).toEqual([true, true, false])
  })

  it('sends the workspace id, first = limit and after = the previous endCursor', async () => {
    const L = 20
    const { requests } = fakeZenhub({ members: { w1: 2 * L + 1 } })
    await new ZenhubAdapter().listUsers(C1, 'w1', withPageSink({ page: 2, limit: L }))
    expect(requests.map((r) => r.op)).toEqual(['WorkspaceUsers', 'WorkspaceUsers'])
    expect(requests[1]!.variables).toEqual({
      id: 'w1',
      first: L,
      after: encode('zh-token-1', 'w1', L),
    })
  })

  it('rows parse with UserSchema and carry the workspace id', async () => {
    fakeZenhub({ members: { w1: 3 } })
    const rows = await new ZenhubAdapter().listUsers(C1, 'w1', withPageSink({ page: 1, limit: 10 }))
    expect(rows).toHaveLength(3)
    for (const r of rows) expect(UserSchema.parse(r).workspaceIds).toEqual(['w1'])
  })

  it('two connections and two workspaces interleaved each walk their own rows', async () => {
    const L = 10
    fakeZenhub({ members: { w1: 25, w2: 25 } })
    const a = new ZenhubAdapter()
    await a.listUsers(C1, 'w1', withPageSink({ page: 1, limit: L }))
    const b2 = await a.listUsers(C2, 'w1', withPageSink({ page: 2, limit: L }))
    const c2 = await a.listUsers(C1, 'w2', withPageSink({ page: 2, limit: L }))
    const a2 = await a.listUsers(C1, 'w1', withPageSink({ page: 2, limit: L }))
    expect(b2.map((r) => r.id)).toEqual(ids('zh-token-2', 'w1', L, L))
    expect(c2.map((r) => r.id)).toEqual(ids('zh-token-1', 'w2', L, L))
    expect(a2.map((r) => r.id)).toEqual(ids('zh-token-1', 'w1', L, L))
  })

  it('an explicit cursor param names the upstream page directly', async () => {
    const L = 10
    const { requests } = fakeZenhub({ members: { w1: 25 } })
    const cursor = encode('zh-token-1', 'w1', 2 * L)
    const p = withPageSink({ page: 1, limit: L, cursor })
    const rows = await new ZenhubAdapter().listUsers(C1, 'w1', p)
    expect(rows.map((r) => r.id)).toEqual(ids('zh-token-1', 'w1', 2 * L, 5))
    expect(requests.map((r) => r.variables)).toEqual([{ id: 'w1', first: L, after: cursor }])
    expect(readUpstreamPage(p)?.hasMore).toBe(false)
  })

  it('an unknown workspace is a 404', async () => {
    fakeZenhub({ members: {} })
    await expect(
      new ZenhubAdapter().listUsers(C1, 'nope', withPageSink({ page: 1, limit: 5 })),
    ).rejects.toMatchObject({ statusCode: 404 })
  })

  it('getUser reads node(id) on ZenhubUser; a missing or non-user node is a 404', async () => {
    const { requests } = fakeZenhub({})
    const a = new ZenhubAdapter()
    expect(UserSchema.parse(await a.getUser(C1, 'usr-known'))).toMatchObject({
      id: 'usr-known',
      metadata: { githubLogin: 'known' },
    })
    expect(requests[0]!.variables).toEqual({ id: 'usr-known' })
    await expect(a.getUser(C1, 'usr-missing')).rejects.toMatchObject({ statusCode: 404 })
    await expect(a.getUser(C1, 'not-a-user')).rejects.toMatchObject({ statusCode: 404 })
  })
})

// ── getTask variables ────────────────────────────────────────────────────────

describe('zenhub getTask', () => {
  it('sends only the issue id (no connection arguments)', async () => {
    const { requests } = fakeZenhub({})
    await expect(new ZenhubAdapter().getTask(C1, 'iss-1')).rejects.toThrow(/not found/)
    expect(requests.map((r) => r.op)).toEqual(['IssueNode'])
    expect(requests[0]!.variables).toEqual({ id: 'iss-1' })
  })
})
