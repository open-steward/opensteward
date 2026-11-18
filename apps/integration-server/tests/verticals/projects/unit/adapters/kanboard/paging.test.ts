/**
 * Kanboard list paging: every list procedure returns the whole collection,
 * so each is paged locally.
 *
 * Kanboard's JSON-RPC procedures document no paging parameter at all
 * (https://docs.kanboard.org/v1/api/):
 *
 *   getAllProjects   — "Get all available projects", Parameters: none
 *   getAllTasks      — "Get all available tasks", project_id + status_id
 *   getAllComments   — "Get all available comments", task_id
 *   getTagsByProject — "Get all tags for a given project", project_id
 *   getAllTags       — "Get all tags", Parameters: none
 *   getProjectUsers  — "Get all members of a project", "Dictionary of user_id => user name"
 *   getAllUsers      — "Get all available users", Parameters: none
 *
 * Before the fix the adapter sliced by an offset read from `cursor`, which the
 * router never sends, so page 2 repeated page 1. Now `pageLocally` slices by
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
import { KanboardAdapter } from '../../../../../../src/verticals/projects/adapters/kanboard/index'

const CREDS = { accessToken: '', extra: { baseUrl: 'https://kb.example.test', apiToken: 't' } }

const L = 3
const N = 2 * L + 1

/** Documented params per procedure; anything else (a paging key) is refused. */
const DOCUMENTED: Record<string, string[]> = {
  getAllProjects: [],
  getAllTasks: ['project_id', 'status_id'],
  getAllComments: ['task_id'],
  getTagsByProject: ['project_id'],
  getAllTags: [],
  getProjectUsers: ['project_id'],
  getAllUsers: [],
  getVersion: [],
}

function rows(n: number) {
  return Array.from({ length: n }, (_, i) => i + 1)
}

function fakeKanboard(n = N) {
  const post = vi.fn(
    async (_path: string, body: { method: string; params?: Record<string, unknown> }) => {
      const allowed = DOCUMENTED[body.method]
      if (!allowed) throw new Error(`unexpected procedure ${body.method}`)
      for (const k of Object.keys(body.params ?? {})) {
        if (!allowed.includes(k)) throw new Error(`undocumented param ${k} on ${body.method}`)
      }
      const ids = rows(n)
      let result: unknown
      switch (body.method) {
        case 'getAllProjects':
          result = ids.map((i) => ({ id: String(i), name: `P${i}`, is_active: '1' }))
          break
        case 'getAllTasks':
          result = ids.map((i) => ({
            id: String(i),
            title: `T${i}`,
            project_id: '7',
            is_active: '1',
          }))
          break
        case 'getAllComments':
          result = ids.map((i) => ({ id: String(i), task_id: '9', comment: `c${i}`, user_id: '1' }))
          break
        case 'getTagsByProject':
        case 'getAllTags':
          result = ids.map((i) => ({ id: String(i), name: `tag${i}`, project_id: '7' }))
          break
        case 'getProjectUsers':
          result = Object.fromEntries(ids.map((i) => [String(i), `user${i}`]))
          break
        case 'getAllUsers':
          result = ids.map((i) => ({ id: String(i), username: `user${i}`, name: `User ${i}` }))
          break
        case 'getVersion':
          result = '1.2.30'
          break
      }
      return { data: { jsonrpc: '2.0', id: 1, result } }
    },
  )
  vi.spyOn(axios, 'create').mockReturnValue({ post } as never)
  return { post }
}

const adapter = () => new KanboardAdapter()

type Lister = (params: QueryParams) => Promise<{ id: string }[]>
const LISTS: Record<string, Lister> = {
  listProjects: (p) => adapter().listProjects(CREDS, p),
  listTasks: (p) => adapter().listTasks(CREDS, '7', p),
  listComments: (p) => adapter().listComments(CREDS, '9', p),
  'listTags (project)': (p) => adapter().listTags(CREDS, '7', p),
  'listTags (all)': (p) => adapter().listTags(CREDS, 'default', p),
  'listUsers (project)': (p) => adapter().listUsers(CREDS, '7', p),
  'listUsers (all)': (p) => adapter().listUsers(CREDS, 'default', p),
}

/** The one procedure each list (and branch) must post; pins branch routing. */
const PROCEDURE: Record<string, string> = {
  listProjects: 'getAllProjects',
  listTasks: 'getAllTasks',
  listComments: 'getAllComments',
  'listTags (project)': 'getTagsByProject',
  'listTags (all)': 'getAllTags',
  'listUsers (project)': 'getProjectUsers',
  'listUsers (all)': 'getAllUsers',
}

afterEach(() => vi.restoreAllMocks())

describe.each(Object.entries(LISTS))('kanboard %s paging', (name, list) => {
  it('posts only its documented procedure', async () => {
    const { post } = fakeKanboard()
    await list(withPageSink({ page: 2, limit: L }))
    expect(post).toHaveBeenCalled()
    for (const [, body] of post.mock.calls) {
      expect((body as { method?: string }).method).toBe(PROCEDURE[name])
    }
  })

  it('walks pages 1..3 at limit L and yields every row once, in order, with exact hasMore', async () => {
    fakeKanboard()
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
    expect(seen.map((s) => s.replace(/\D/g, ''))).toEqual(rows(N).map(String))
    expect(new Set(seen).size).toBe(N)
  })

  it('page 2 sends no paging parameter upstream (none is documented) and differs from page 1', async () => {
    const { post } = fakeKanboard()
    const p1 = (await list(withPageSink({ page: 1, limit: L }))).map((r) => r.id)
    const p2 = (await list(withPageSink({ page: 2, limit: L }))).map((r) => r.id)
    expect(p2).not.toEqual(p1)
    for (const [, body] of post.mock.calls) {
      const keys = Object.keys((body as { params?: object }).params ?? {})
      expect(keys).not.toContain('page')
      expect(keys).not.toContain('limit')
      expect(keys).not.toContain('offset')
    }
  })

  it('a limit above the collection size returns everything and reports the end', async () => {
    fakeKanboard()
    const params = withPageSink({ page: 1, limit: 500 })
    expect((await list(params)).length).toBe(N)
    expect(readUpstreamPage(params)).toMatchObject({ hasMore: false, totalCount: N })
  })

  it('API path: parseListQuery + listPage report exact meta', async () => {
    fakeKanboard()
    const p2 = withPageSink(parseListQuery({ page: '2', limit: String(L) }))
    const env2 = listPage(await list(p2), p2, 'kanboard')
    expect(env2.data.length).toBe(L)
    expect(env2.meta).toMatchObject({ page: 2, hasMore: true, totalCount: N })

    const p3 = withPageSink(parseListQuery({ page: '3', limit: String(L) }))
    const env3 = listPage(await list(p3), p3, 'kanboard')
    expect(env3.data.length).toBe(1)
    expect(env3.meta).toMatchObject({ page: 3, hasMore: false, totalCount: N })
  })
})

describe('kanboard listWorkspaces paging (one synthetic workspace)', () => {
  it('page 1 has the workspace, page 2 is empty, hasMore false', async () => {
    fakeKanboard()
    const p1 = withPageSink({ page: 1, limit: 1 })
    expect((await adapter().listWorkspaces(CREDS, p1)).map((w) => w.id)).toEqual(['default'])
    expect(readUpstreamPage(p1)).toMatchObject({
      hasMore: false,
      totalCount: 1,
      pagedLocally: true,
    })

    const p2 = withPageSink({ page: 2, limit: 1 })
    expect(await adapter().listWorkspaces(CREDS, p2)).toEqual([])
    expect(readUpstreamPage(p2)).toMatchObject({ hasMore: false, totalCount: 1 })
  })

  it('getWorkspace still returns the workspace', async () => {
    fakeKanboard()
    expect((await adapter().getWorkspace(CREDS, 'default')).id).toBe('default')
  })

  it('API path: parseListQuery + listPage', async () => {
    fakeKanboard()
    const p = withPageSink(parseListQuery({ page: '2', limit: '10' }))
    const env = listPage(await adapter().listWorkspaces(CREDS, p), p, 'kanboard')
    expect(env.data).toEqual([])
    expect(env.meta).toMatchObject({ page: 2, hasMore: false, totalCount: 1 })
  })
})
