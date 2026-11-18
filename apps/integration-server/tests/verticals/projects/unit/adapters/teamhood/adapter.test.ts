/**
 * Teamhood adapter: requests, paging and envelopes against a fake that
 * honours ONLY what Teamhood documents.
 *
 * Source: Teamhood's own OpenAPI document ("Teamhood API v1"),
 * https://api-demo.teamhood.com/swagger/v1/swagger.json, and
 * https://teamhood.com/knowledge-base/integrations/open-api/api-examples/
 * ("https://api-YOURTENANT.teamhood.com"; "All requests require an API key in
 * the X-ApiKey header.").
 *
 * - GET /api/v1/items ("Query items") takes the query parameters listed in
 *   ITEMS_PARAMS, among them "Skip" ("How many records to skip") and "Take"
 *   ("How many records to take"), and answers GetItemsResponse
 *   {items, nextPageUrl}. The fake names a nextPageUrl while rows remain, and
 *   with no Take serves an undocumented default of 4 rows.
 * - GET /api/v1/workspaces, /api/v1/workspaces/{id}/boards and /api/v1/users
 *   take no parameters and answer {workspaces}, {boards} and {users} whole.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import axios, { type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios'
import {
  _resetCursorPager,
  readUpstreamPage,
  withPageSink,
  type QueryParams,
} from '@opensteward/shared'
import { TeamhoodAdapter } from '../../../../../../src/verticals/projects/adapters/teamhood/index'
import { ProjectSchema } from '../../../../../../src/verticals/projects/schema/project'
import { TaskSchema } from '../../../../../../src/verticals/projects/schema/task'
import { UserSchema } from '../../../../../../src/verticals/projects/schema/user'
import { WorkspaceSchema } from '../../../../../../src/verticals/projects/schema/workspace'
import { TagSchema } from '../../../../../../src/verticals/projects/schema/tag'
import {
  DOC_BOARDS_RESPONSE,
  DOC_ITEM,
  DOC_USERS_RESPONSE,
  DOC_WORKSPACES_RESPONSE,
} from './fixtures'

const ORIGIN = 'https://api-acme.teamhood.com'
const BOARD = 'board-1'
const DEFAULT_TAKE = 4

const ITEMS_PARAMS = new Set([
  'Completed',
  'AssignedUserId',
  'OwnerId',
  'StatusId',
  'RowId',
  'BoardId',
  'WorkspaceId',
  'ParentId',
  'CustomFields',
  'CreatedSince',
  'ModifiedSince',
  'CompletedSince',
  'Tags',
  'IncludeChildItems',
  'Skip',
  'Take',
])

interface World {
  /** Items on BOARD in workspace ws-1, ids i1..iN. */
  items?: number
  /** Tags on item k (1-based); items of workspace ws-1. */
  tagsOf?: (k: number) => string[]
  /** Boards per workspace, in workspace order; workspaces are ws-1..ws-M. */
  boards?: number[]
  /** Users u1..uN, and the workspaces each can access. */
  users?: Array<string[] | null>
  /** An undocumented server cap on Take: fewer rows come back, nextPageUrl still set. */
  maxTake?: number
  /** Workspaces left out of GET /workspaces (they still answer their boards). */
  hidden?: string[]
  /** What nextPageUrl holds on the last /items page: null (default), '' or absent. */
  endUrl?: null | '' | 'absent'
  /** An empty /items page still names a nextPageUrl. */
  nextOnEmpty?: boolean
  /** Serve these documented example bodies verbatim, by path. */
  verbatim?: Record<string, unknown>
}

let seen: URL[] = []
const realAdapter = axios.defaults.adapter

beforeEach(() => _resetCursorPager())
afterEach(() => {
  axios.defaults.adapter = realAdapter
})

function httpError(status: number, body: unknown): Error {
  return Object.assign(new Error(`HTTP ${status}`), { response: { status, data: body } })
}

const nums = (n: number): number[] => Array.from({ length: n }, (_, i) => i + 1)

function item(k: number, w: World): Record<string, unknown> {
  return {
    ...DOC_ITEM,
    id: `i${k}`,
    boardId: BOARD,
    workspaceId: 'ws-1',
    tags: w.tagsOf ? w.tagsOf(k) : [],
    // Items 1..N were modified on consecutive days from 2026-01-01.
    modifiedDate: new Date(Date.UTC(2026, 0, k)).toISOString(),
  }
}

function fake(base: World, byKey: Record<string, World> = {}): void {
  seen = []
  const worlds: Record<string, World> = { key: base, ...byKey }
  const transport = async (config: InternalAxiosRequestConfig) => {
    const url = new URL(axios.getUri(config))
    seen.push(url)
    if (url.origin !== ORIGIN) throw httpError(404, { message: `no host ${url.origin}` })
    const apiKey = String(config.headers.get('X-ApiKey'))
    if (!Object.hasOwn(worlds, apiKey)) throw httpError(401, { message: 'no X-ApiKey' })
    const w = worlds[apiKey]!
    const q = url.searchParams
    const path = url.pathname
    let data: unknown
    const workspaces = nums((w.boards ?? []).length)
      .map((m) => ({
        id: `ws-${m}`,
        displayId: `W${m}`,
        title: `Workspace ${m}`,
      }))
      .filter((ws) => !(w.hidden ?? []).includes(ws.id))
    if (w.verbatim && Object.hasOwn(w.verbatim, path)) {
      data = w.verbatim[path]
    } else if (path === '/api/v1/items') {
      for (const k of q.keys())
        if (!ITEMS_PARAMS.has(k)) throw httpError(400, { message: `unknown ${k}` })
      let all = nums(w.items ?? 0).map((k) => item(k, w))
      if (q.has('BoardId')) all = all.filter((i) => i.boardId === q.get('BoardId'))
      if (q.has('WorkspaceId')) all = all.filter((i) => i.workspaceId === q.get('WorkspaceId'))
      const since = q.get('ModifiedSince')
      if (since !== null) {
        if (!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d$/.test(since))
          throw httpError(400, { message: `bad ModifiedSince ${since}` })
        all = all.filter((i) => String(i.modifiedDate) >= `${since}.000Z`)
      }
      const skip = Number(q.get('Skip') ?? 0)
      const take = Math.min(Number(q.get('Take') ?? DEFAULT_TAKE), w.maxTake ?? Infinity)
      const rows = all.slice(skip, skip + take)
      const end = skip + rows.length
      const last = w.endUrl === undefined ? null : w.endUrl
      data = {
        items: rows,
        ...(end < all.length || (w.nextOnEmpty && rows.length === 0)
          ? { nextPageUrl: `${ORIGIN}/api/v1/items?Skip=${end}&Take=${take}` }
          : last === 'absent'
            ? {}
            : { nextPageUrl: last }),
      }
    } else {
      if ([...q.keys()].length > 0) throw httpError(400, { message: 'no parameters documented' })
      const board = /^\/api\/v1\/workspaces\/([^/]+)\/boards$/.exec(path)
      const oneWs = /^\/api\/v1\/workspaces\/([^/]+)$/.exec(path)
      const oneItem = /^\/api\/v1\/items\/([^/]+)$/.exec(path)
      if (path === '/api/v1/workspaces') data = { workspaces }
      else if (board) {
        const m = Number(board[1]!.replace('ws-', ''))
        const n = (w.boards ?? [])[m - 1]
        if (n === undefined) throw httpError(404, { message: 'no workspace' })
        data = {
          boards: nums(n).map((b) => ({
            id: `b${m}.${b}`,
            displayId: `B${b}`,
            title: `Board ${b}`,
          })),
        }
      } else if (path === '/api/v1/users')
        data = {
          users: (w.users ?? []).map((acc, i) => ({
            ...DOC_USERS_RESPONSE.users[0]!,
            id: `u${i + 1}`,
            accessibleWorkspaces: acc,
          })),
        }
      else if (oneWs) {
        const ws = workspaces.find((x) => x.id === decodeURIComponent(oneWs[1]!))
        if (!ws) throw httpError(404, { message: 'no workspace' })
        data = ws
      } else if (oneItem) {
        const k = nums(w.items ?? 0).find((n) => `i${n}` === decodeURIComponent(oneItem[1]!))
        if (k === undefined) throw httpError(404, { message: 'no item' })
        data = item(k, w)
      } else throw httpError(404, { message: `no route ${path}` })
    }
    return { data, status: 200, statusText: 'OK', headers: {}, config, request: {} }
  }
  axios.defaults.adapter = transport as unknown as AxiosAdapter
}

const adapter = new TeamhoodAdapter({})
const creds = { accessToken: 'key', extra: { tenant: 'acme' } }

async function page(
  fn: (params: QueryParams) => Promise<Array<{ id: string }>>,
  p: number,
  limit: number,
) {
  const params = withPageSink({ page: p, limit })
  const ids = (await fn(params)).map((r) => r.id)
  return { ids, hasMore: readUpstreamPage(params)?.hasMore }
}

/** Pages 1..3 at `L` of a 2L+1-row collection: every id once, hasMore exact. */
async function walk(
  fn: (params: QueryParams) => Promise<Array<{ id: string }>>,
  L: number,
  all: string[],
) {
  expect(all).toHaveLength(2 * L + 1)
  expect(await page(fn, 1, L)).toEqual({ ids: all.slice(0, L), hasMore: true })
  expect(await page(fn, 2, L)).toEqual({ ids: all.slice(L, 2 * L), hasMore: true })
  expect(await page(fn, 3, L)).toEqual({ ids: all.slice(2 * L), hasMore: false })
}

describe('teamhood listTasks: GET /items by BoardId, Skip/Take, nextPageUrl', () => {
  it.each([3, 10])('walks 2L+1 items once each (L=%i)', async (L) => {
    fake({ items: 2 * L + 1 })
    await walk(
      (p) => adapter.listTasks(creds, BOARD, p),
      L,
      nums(2 * L + 1).map((k) => `i${k}`),
    )
    expect(
      seen.map((u) => [
        u.searchParams.get('BoardId'),
        u.searchParams.get('Skip'),
        u.searchParams.get('Take'),
      ]),
    ).toEqual([
      [BOARD, '0', String(L)],
      [BOARD, String(L), String(L)],
      [BOARD, String(2 * L), String(L)],
    ])
  })

  it('reads the documented {items} envelope and parses each task', async () => {
    fake({ items: 2 })
    const tasks = await adapter.listTasks(creds, BOARD, withPageSink({ page: 1, limit: 5 }))
    expect(tasks.map((t) => TaskSchema.parse(t).projectId)).toEqual([BOARD, BOARD])
  })

  it('sends updatedAfter as ModifiedSince in the documented shape', async () => {
    fake({ items: 5 })
    const tasks = await adapter.listTasks(
      creds,
      BOARD,
      withPageSink({ page: 1, limit: 10, updatedAfter: new Date('2026-01-03T00:00:00.250Z') }),
    )
    expect(seen[0]!.searchParams.get('ModifiedSince')).toBe('2026-01-03T00:00:00')
    expect(tasks.map((t) => t.id)).toEqual(['i3', 'i4', 'i5'])
  })

  it.each([null, '', 'absent'] as const)(
    'ends on an exactly full last page whose nextPageUrl is %j',
    async (endUrl) => {
      fake({ items: 4, endUrl })
      expect(await page((p) => adapter.listTasks(creds, BOARD, p), 1, 4)).toEqual({
        ids: ['i1', 'i2', 'i3', 'i4'],
        hasMore: false,
      })
      expect(seen).toHaveLength(1)
    },
  )

  it('ends on an empty page even if it names a nextPageUrl', async () => {
    fake({ items: 0, nextOnEmpty: true })
    expect(await page((p) => adapter.listTasks(creds, BOARD, p), 1, 5)).toEqual({
      ids: [],
      hasMore: false,
    })
    expect(seen).toHaveLength(1)
  })

  it("sends the caller's limit as Take, with no clamp of its own", async () => {
    fake({ items: 1 })
    await adapter.listTasks(creds, BOARD, withPageSink({ page: 1, limit: 250 }))
    expect(seen[0]!.searchParams.get('Take')).toBe('250')
  })

  it.each([3, 10])(
    'tops up a page the server caps below Take, skipping nothing (L=%i)',
    async (L) => {
      fake({ items: 2 * L + 1, maxTake: 2 })
      await walk(
        (p) => adapter.listTasks(creds, BOARD, p),
        L,
        nums(2 * L + 1).map((k) => `i${k}`),
      )
      // Page 1 at L=3: Skip 0 Take 3 gives 2 rows, then Skip 2 Take 1.
      if (L === 3)
        expect(
          seen.slice(0, 2).map((u) => [u.searchParams.get('Skip'), u.searchParams.get('Take')]),
        ).toEqual([
          ['0', '3'],
          ['2', '1'],
        ])
    },
  )

  it('sends no ModifiedSince without updatedAfter', async () => {
    fake({ items: 1 })
    await adapter.listTasks(creds, BOARD, withPageSink({ page: 1, limit: 10 }))
    expect(seen[0]!.searchParams.has('ModifiedSince')).toBe(false)
  })
})

describe('teamhood listWorkspaces: GET /workspaces {workspaces}, paged locally', () => {
  it.each([3, 10])('walks 2L+1 workspaces once each (L=%i)', async (L) => {
    fake({ boards: nums(2 * L + 1).map(() => 0) })
    await walk(
      (p) => adapter.listWorkspaces(creds, p),
      L,
      nums(2 * L + 1).map((m) => `ws-${m}`),
    )
  })

  it('parses the documented example', async () => {
    fake({ verbatim: { '/api/v1/workspaces': DOC_WORKSPACES_RESPONSE } })
    const [ws] = await adapter.listWorkspaces(creds, withPageSink({ page: 1, limit: 5 }))
    expect(WorkspaceSchema.parse(ws)).toMatchObject({
      id: DOC_WORKSPACES_RESPONSE.workspaces[0]!.id,
      name: 'Workspace title',
    })
  })

  it('getWorkspace reads GET /workspaces/{workspaceId}', async () => {
    fake({ boards: [0, 0] })
    const ws = await adapter.getWorkspace(creds, 'ws-2')
    expect(WorkspaceSchema.parse(ws).id).toBe('ws-2')
    expect(seen.map((u) => u.pathname)).toEqual(['/api/v1/workspaces/ws-2'])
  })
})

describe('teamhood listProjects: boards of every workspace, by pageByRows', () => {
  it('walks 7 boards over uneven workspaces [4, 0, 3] once each (L=3)', async () => {
    fake({ boards: [4, 0, 3] })
    await walk((p) => adapter.listProjects(creds, p), 3, [
      'b1.1',
      'b1.2',
      'b1.3',
      'b1.4',
      'b3.1',
      'b3.2',
      'b3.3',
    ])
  })

  it('walks 21 boards over uneven workspaces [1, 9, 0, 11] once each (L=10)', async () => {
    fake({ boards: [1, 9, 0, 11] })
    const all = ['b1.1', ...nums(9).map((b) => `b2.${b}`), ...nums(11).map((b) => `b4.${b}`)]
    await walk((p) => adapter.listProjects(creds, p), 10, all)
  })

  it('reads {boards}, tags each board with its workspace, and parses', async () => {
    fake({ boards: [2, 1] })
    const rows = await adapter.listProjects(creds, withPageSink({ page: 1, limit: 10 }))
    expect(rows.map((r) => [ProjectSchema.parse(r).id, r.workspaceId])).toEqual([
      ['b1.1', 'ws-1'],
      ['b1.2', 'ws-1'],
      ['b2.1', 'ws-2'],
    ])
    expect(DOC_BOARDS_RESPONSE.boards[0]!.title).toBe('Board title')
  })

  it('refuses to continue from a workspace that is no longer listed', async () => {
    const w: World = { boards: [2, 2, 2, 2] }
    fake(w)
    expect(await page((p) => adapter.listProjects(creds, p), 1, 3)).toEqual({
      ids: ['b1.1', 'b1.2', 'b2.1'],
      hasMore: true,
    })
    // Page 2 continues into ws-3, which has since left the listing: silently
    // ending the walk there would read as a complete collection.
    w.hidden = ['ws-3']
    await expect(adapter.listProjects(creds, withPageSink({ page: 2, limit: 3 }))).rejects.toThrow(
      /no longer listed/,
    )
  })

  it("keeps one connection's walk apart from another's", async () => {
    fake({ boards: [4, 0, 3] }, { other: { boards: [3] } })
    const other = { accessToken: 'other', extra: { tenant: 'acme' } }
    expect(await page((p) => adapter.listProjects(creds, p), 1, 3)).toEqual({
      ids: ['b1.1', 'b1.2', 'b1.3'],
      hasMore: true,
    })
    expect(await page((p) => adapter.listProjects(other, p), 2, 3)).toEqual({
      ids: [],
      hasMore: false,
    })
  })

  it('getProject answers 404 for a board in no workspace', async () => {
    fake({ boards: [1, 2] })
    await expect(adapter.getProject(creds, 'b9.9')).rejects.toMatchObject({ statusCode: 404 })
  })

  it('getProject finds a board under its workspace', async () => {
    fake({ boards: [1, 2] })
    const p = await adapter.getProject(creds, 'b2.2')
    expect([p.id, p.workspaceId]).toEqual(['b2.2', 'ws-2'])
  })
})

describe('teamhood listUsers: GET /users {users}, filtered by accessibleWorkspaces', () => {
  it.each([3, 10])('walks 2L+1 users of the workspace once each (L=%i)', async (L) => {
    const users: Array<string[] | null> = []
    for (const k of nums(2 * L + 1)) users.push(['ws-1'], k % 2 ? ['ws-2'] : null)
    fake({ users })
    const inWs1 = users.flatMap((acc, i) => (acc?.includes('ws-1') ? [`u${i + 1}`] : []))
    await walk((p) => adapter.listUsers(creds, 'ws-1', p), L, inWs1)
  })

  it('parses, and getUser finds by id', async () => {
    fake({ users: [['ws-1'], ['ws-1', 'ws-2']] })
    const [u] = await adapter.listUsers(creds, 'ws-2', withPageSink({ page: 1, limit: 5 }))
    expect(UserSchema.parse(u)).toMatchObject({ id: 'u2', workspaceIds: ['ws-1', 'ws-2'] })
    expect((await adapter.getUser(creds, 'u1')).id).toBe('u1')
  })

  it('getUser answers 404 for an id not in "List all Users"', async () => {
    fake({ users: [['ws-1']] })
    await expect(adapter.getUser(creds, 'u9')).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('teamhood listTags: labels of every item in the workspace', () => {
  it.each([3, 10])('walks 2L+1 distinct labels once each (L=%i)', async (L) => {
    const n = 2 * L + 1
    // Item k carries labels t(k) and t(k-1): every label but the first repeats.
    fake({ items: n, tagsOf: (k) => (k === 1 ? ['t1'] : [`t${k}`, `t${k - 1}`]) })
    await walk(
      (p) => adapter.listTags(creds, 'ws-1', p),
      L,
      nums(n).map((k) => `t${k}`),
    )
  })

  it('reads every item page (Skip advanced by rows received, no Take) and parses', async () => {
    fake({ items: 10, tagsOf: (k) => [`t${k % 3}`] })
    const tags = await adapter.listTags(creds, 'ws-1', withPageSink({ page: 1, limit: 50 }))
    expect(tags.map((t) => TagSchema.parse(t).id)).toEqual(['t1', 't2', 't0'])
    expect(
      seen.map((u) => [
        u.searchParams.get('WorkspaceId'),
        u.searchParams.get('Skip'),
        u.searchParams.has('Take'),
      ]),
    ).toEqual([
      ['ws-1', null, false],
      ['ws-1', '4', false],
      ['ws-1', '8', false],
    ])
  })
})

describe('teamhood connection and lookups', () => {
  it('getTask reads the documented Entities.Item', async () => {
    fake({ items: 5 })
    expect(TaskSchema.parse(await adapter.getTask(creds, 'i5')).projectId).toBe(BOARD)
  })

  it('URL-encodes the item id', async () => {
    fake({ items: 5 })
    await expect(adapter.getTask(creds, 'i/5')).rejects.toBeDefined()
    expect(seen.map((u) => u.pathname)).toEqual(['/api/v1/items/i%2F5'])
  })

  it('trims the tenant slug into the host', async () => {
    fake({ items: 5 })
    const t = await adapter.getTask({ accessToken: 'key', extra: { tenant: ' acme ' } }, 'i5')
    expect(t.id).toBe('i5')
  })

  it('refuses a connection with no tenant before sending anything', async () => {
    fake({ items: 1 })
    await expect(
      adapter.listTasks({ accessToken: 'key' }, BOARD, withPageSink({ page: 1, limit: 5 })),
    ).rejects.toThrow(/no tenant/)
    expect(seen).toHaveLength(0)
  })
})
