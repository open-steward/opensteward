/**
 * NocoDB users and comments read the documented endpoints and page locally.
 *
 * From NocoDB's own OpenAPI
 * (https://raw.githubusercontent.com/nocodb/nocodb/develop/packages/nocodb/src/schema/swagger-v2.json):
 *
 * - GET /api/v2/meta/comments, "List Comments" / "List all comments", takes
 *   exactly `row_id` ("Row ID", required) and `fk_model_id` ("Foreign Key to
 *   Model", required) and answers `{ list: Comment[] }` with no page info.
 *   The adapter called `/api/v2/tables/{tableId}/comments`, which the spec
 *   does not have. There is no GET for one comment
 *   (`/api/v2/meta/comment/{commentId}` is PATCH and DELETE only).
 * - GET /api/v2/meta/workspaces/{workspaceId}/users, "Workspace users list ☁",
 *   documents no query parameters and answers `WorkspaceUserList`
 *   `{ list: WorkspaceUser[], pageInfo }`. The adapter called `/members` and
 *   read `res.users`, neither of which the spec has.
 *
 * The fake answers at axios's transport, honours only documented parameters,
 * and 404s every path the spec does not list.
 */
import { afterEach, describe, expect, it } from 'vitest'
import axios, { type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios'
import { readUpstreamPage, withPageSink } from '@opensteward/shared'
import { NocodbAdapter } from '../../../../../../src/verticals/projects/adapters/nocodb/index'

const ORIGIN = 'https://app.nocodb.com'
const TABLE = 'md_5mipbdg6ketmv8'
const ROW = '7'
const TASK_ID = `${TABLE}:${ROW}`
const WS = 'w1'

const adapter = new NocodbAdapter()
const CREDS = { accessToken: 'nc_pat_test' }

interface World {
  comments?: number
  /** users per workspace id */
  users?: Record<string, number>
  /** pageInfo the users list answers with, if not the whole-list one */
  usersPageInfo?: Record<string, unknown>
}

let seen: URL[] = []
const realAdapter = axios.defaults.adapter

function httpError(status: number, body: unknown): Error {
  return Object.assign(new Error(`HTTP ${status}`), { response: { status, data: body } })
}

const nums = (n: number): number[] => Array.from({ length: n }, (_, i) => i + 1)
const commentIds = (n: number): string[] => nums(n).map((i) => `cmt${i}`)

const userIds = (ws: string, n: number): string[] => nums(n).map((i) => `usr_${ws}_${i}`)

function rawComment(id: string, rowId: string, tableId: string) {
  return {
    id,
    source_id: null,
    base_id: 'p_63b4q0qengen1x',
    fk_model_id: tableId,
    row_id: rowId,
    created_by: 'usr1',
    resolved_by: '',
    parent_comment_id: null,
    status: null,
    comment: `body ${id}`,
    created_at: '2023-03-13T09:39:14.225Z',
    updated_at: '2023-03-13T09:39:14.225Z',
  }
}

function fake(world: World): void {
  seen = []
  const transport = async (config: InternalAxiosRequestConfig) => {
    const url = new URL(axios.getUri(config))
    seen.push(url)
    if (url.origin !== ORIGIN) throw httpError(404, { msg: `no host ${url.origin}` })
    if (config.headers?.['xc-token'] !== CREDS.accessToken) throw httpError(401, {})
    const q = url.searchParams
    const keys = [...q.keys()]
    let data: unknown
    let m: RegExpMatchArray | null
    if (url.pathname === '/api/v2/meta/comments') {
      for (const k of keys)
        if (k !== 'row_id' && k !== 'fk_model_id') throw httpError(400, { msg: `unknown ${k}` })
      const rowId = q.get('row_id')
      const tableId = q.get('fk_model_id')
      if (!rowId || !tableId) throw httpError(400, { msg: 'row_id and fk_model_id required' })
      const list =
        rowId === ROW && tableId === TABLE
          ? commentIds(world.comments ?? 0).map((id) => rawComment(id, rowId, tableId))
          : []
      data = { list }
    } else if ((m = url.pathname.match(/^\/api\/v2\/meta\/workspaces\/([^/]+)\/users$/))) {
      if (keys.length > 0) throw httpError(400, { msg: 'documents no query parameters' })
      const ws = m[1]!
      const n = world.users?.[ws]
      if (n === undefined) throw httpError(404, { msg: `no workspace ${ws}` })
      data = {
        list: userIds(ws, n).map((id) => ({
          email: `${id}@acme.example`,
          fk_user_id: id,
          invite_accepted: true,
          invite_token: 'tok',
          roles: 'workspace-level-editor',
        })),
        pageInfo: world.usersPageInfo ?? {
          totalRows: n,
          page: 1,
          pageSize: n,
          isFirstPage: true,
          isLastPage: true,
        },
      }
    } else if (url.pathname === '/api/v2/meta/workspaces') {
      if (keys.length > 0) throw httpError(400, { msg: 'documents no query parameters' })
      const ids = Object.keys(world.users ?? {})
      data = {
        list: ids.map((id) => ({ id, title: id })),
        pageInfo: { totalRows: ids.length, isLastPage: true },
      }
    } else {
      throw httpError(404, { msg: `no route ${url.pathname}` })
    }
    return { data, status: 200, statusText: 'OK', headers: {}, config, request: {} }
  }
  axios.defaults.adapter = transport as unknown as AxiosAdapter
}

afterEach(() => {
  axios.defaults.adapter = realAdapter
})

type Method = 'listComments' | 'listUsers'

async function page(
  method: Method,
  p: number,
  limit: number,
): Promise<{ ids: string[]; hasMore: boolean | undefined }> {
  const params = withPageSink({ page: p, limit })
  const rows =
    method === 'listComments'
      ? await adapter.listComments(CREDS, TASK_ID, params)
      : await adapter.listUsers(CREDS, WS, params)
  return { ids: rows.map((r) => r.id), hasMore: readUpstreamPage(params)?.hasMore }
}

const CASES: Array<[Method, (n: number) => World, (n: number) => string[]]> = [
  ['listComments', (n) => ({ comments: n }), (n) => commentIds(n).map((id) => `${TASK_ID}:${id}`)],
  ['listUsers', (n) => ({ users: { [WS]: n } }), (n) => userIds(WS, n)],
]

describe.each(CASES)('nocodb %s pages the whole documented list locally', (method, world, ids) => {
  const L = 10

  it('serves 2L+1 rows over pages 1, 2, 3, each once, hasMore exact', async () => {
    fake(world(2 * L + 1))
    const all = ids(2 * L + 1)
    const out: string[] = []
    expect(await page(method, 1, L)).toEqual({ ids: all.slice(0, L), hasMore: true })
    out.push(...all.slice(0, L))
    expect(await page(method, 2, L)).toEqual({ ids: all.slice(L, 2 * L), hasMore: true })
    out.push(...all.slice(L, 2 * L))
    expect(await page(method, 3, L)).toEqual({ ids: all.slice(2 * L), hasMore: false })
    out.push(...all.slice(2 * L))
    expect(new Set(out).size).toBe(2 * L + 1)
  })

  it('reports pagedLocally with the total', async () => {
    fake(world(5))
    const params = withPageSink({ page: 1, limit: 2 })
    if (method === 'listComments') await adapter.listComments(CREDS, TASK_ID, params)
    else await adapter.listUsers(CREDS, WS, params)
    expect(readUpstreamPage(params)).toMatchObject({
      pagedLocally: true,
      totalCount: 5,
      hasMore: true,
    })
  })
})

describe('nocodb listComments request shape', () => {
  it('sends only row_id and fk_model_id to /api/v2/meta/comments', async () => {
    fake({ comments: 3 })
    await page('listComments', 2, 10)
    expect(seen).toHaveLength(1)
    expect(seen[0]!.pathname).toBe('/api/v2/meta/comments')
    expect(Object.fromEntries(seen[0]!.searchParams)).toEqual({
      row_id: ROW,
      fk_model_id: TABLE,
    })
  })

  it('returns task ids listTasks can read back', async () => {
    fake({ comments: 1 })
    const [c] = await adapter.listComments(CREDS, TASK_ID, {})
    expect(c!.taskId).toBe(TASK_ID)
  })

  it('rejects a task id that is not {tableId}:{rowId} before sending', async () => {
    fake({ comments: 1 })
    await expect(adapter.listComments(CREDS, 'norow', {})).rejects.toThrow(/tableId/)
    expect(seen).toHaveLength(0)
  })
})

describe('nocodb getComment', () => {
  it('reads back a listed comment id from the row it belongs to', async () => {
    fake({ comments: 4 })
    const listed = await adapter.listComments(CREDS, TASK_ID, {})
    expect(listed[2]!.id).toBe(`${TABLE}:${ROW}:cmt3`)
    const got = await adapter.getComment(CREDS, listed[2]!.id)
    expect(got.body).toBe('body cmt3')
    expect(seen.at(-1)!.pathname).toBe('/api/v2/meta/comments')
    expect(Object.fromEntries(seen.at(-1)!.searchParams)).toEqual({
      row_id: ROW,
      fk_model_id: TABLE,
    })
  })

  it('rejects an id with more than three parts before sending', async () => {
    fake({ comments: 2 })
    await expect(adapter.getComment(CREDS, `${TABLE}:${ROW}:cmt1:extra`)).rejects.toThrow(
      /commentId/,
    )
    expect(seen).toHaveLength(0)
  })

  it('throws not found for an id absent from the row', async () => {
    fake({ comments: 2 })
    await expect(adapter.getComment(CREDS, `${TABLE}:${ROW}:cmt99`)).rejects.toThrow(/not found/)
  })
})

describe('nocodb listUsers request shape', () => {
  it('sends no query parameters to /api/v2/meta/workspaces/{workspaceId}/users', async () => {
    fake({ users: { [WS]: 3 } })
    await page('listUsers', 1, 2)
    expect(seen).toHaveLength(1)
    expect(seen[0]!.pathname).toBe(`/api/v2/meta/workspaces/${WS}/users`)
    expect([...seen[0]!.searchParams.keys()]).toEqual([])
  })

  it('refuses to page locally when the page info says rows are missing', async () => {
    fake({
      users: { [WS]: 25 },
      usersPageInfo: { totalRows: 40, page: 1, pageSize: 25, isLastPage: false },
    })
    await expect(page('listUsers', 1, 10)).rejects.toMatchObject({ statusCode: 502 })
  })

  it('refuses when totalRows exceeds the rows served even without isLastPage', async () => {
    fake({ users: { [WS]: 25 }, usersPageInfo: { totalRows: 40, page: 1, pageSize: 25 } })
    await expect(page('listUsers', 1, 10)).rejects.toMatchObject({ statusCode: 502 })
  })

  it('refuses when isLastPage is false even without totalRows', async () => {
    fake({ users: { [WS]: 25 }, usersPageInfo: { page: 1, pageSize: 25, isLastPage: false } })
    await expect(page('listUsers', 1, 10)).rejects.toMatchObject({ statusCode: 502 })
  })
})

describe('nocodb getUser', () => {
  it('finds a listed user id across the workspaces', async () => {
    fake({ users: { w1: 2, w2: 3 } })
    const listed = await adapter.listUsers(CREDS, 'w2', {})
    const got = await adapter.getUser(CREDS, listed[1]!.id)
    expect(got).toMatchObject({ id: 'usr_w2_2', workspaceIds: ['w2'] })
    for (const s of seen) expect([...s.searchParams.keys()]).toEqual([])
  })

  it('throws not found for an unknown id', async () => {
    fake({ users: { w1: 2 } })
    await expect(adapter.getUser(CREDS, 'usr_nobody')).rejects.toThrow(/not found/)
  })
})
