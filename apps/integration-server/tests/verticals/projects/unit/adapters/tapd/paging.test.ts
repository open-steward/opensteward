/**
 * TAPD list paging.
 *
 * GET https://api.tapd.cn/stories (listTasks) pages by `limit` + `page`:
 * https://open.tapd.cn/document/api-doc/API%E6%96%87%E6%A1%A3/api_reference/story/get_stories.html
 *   "默认返回 30 条。可通过传 limit 参数设置，最大取 200。也可以传 page 参数翻页"
 *   limit: "设置返回数量限制，默认为30"
 *   page:  "返回当前数量限制下第N页的数据，默认为1（第一页）"
 * The response carries no total and no next link, so a short page is the only
 * end signal: a full page leaves `hasMore` unknown (null) on the API path.
 *
 * GET https://api.tapd.cn/workspaces/projects (listProjects, listWorkspaces)
 * has no paging at all:
 * https://open.tapd.cn/document/api-doc/API%E6%96%87%E6%A1%A3/api_reference/workspace/projects.html
 *   "返回符合查询条件的所有项目（无分页）"
 *   "一次返回所有符合条件的值,只能传公司参数，一次只能查一个公司"
 * so the whole list is sliced locally.
 *
 * listComments, listTags and listUsers (rebuilt onto the documented /comments,
 * /label and /workspaces/users) are covered in rebuild.test.ts.
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
import { TapdAdapter } from '../../../../../../src/verticals/projects/adapters/tapd/index'

const CREDS = { accessToken: 'user:pass', extra: { companyId: '20003261' } }
const WORKSPACE = '10104801'
/** Documented: "默认返回 30 条" and "最大取 200". */
const DEFAULT_LIMIT = 30
const MAX_LIMIT = 200

type Params = Record<string, unknown>

/**
 * A fake TAPD that honours ONLY the documented parameters. /stories takes
 * workspace_id, limit (default 30, max 200) and page (default 1);
 * /workspaces/projects takes company_id and returns every row; /workspaces/info
 * takes workspace_id and returns that one Workspace.
 */
function fakeTapd(opts: { stories?: number; projects?: number }) {
  const stories = Array.from({ length: opts.stories ?? 0 }, (_, i) => ({
    Story: { id: String(i + 1), name: `Story ${i + 1}`, workspace_id: WORKSPACE },
  }))
  const projects = Array.from({ length: opts.projects ?? 0 }, (_, i) => ({
    Workspace: { id: String(i + 1), name: `Project ${i + 1}`, status: 'normal' },
  }))
  const get = vi.fn(async (path: string, cfg?: { params?: Params }) => {
    const params = cfg?.params ?? {}
    const only = (allowed: string[]) => {
      const extra = Object.keys(params).filter((k) => !allowed.includes(k))
      if (extra.length) throw new Error(`undocumented parameter(s) on ${path}: ${extra.join(', ')}`)
    }
    if (path === '/stories') {
      only(['workspace_id', 'limit', 'page'])
      const limit = Number(params['limit'] ?? DEFAULT_LIMIT)
      const page = Number(params['page'] ?? 1)
      if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
        throw new Error(`limit must be in [1, ${MAX_LIMIT}] (got ${String(params['limit'])})`)
      }
      if (!Number.isInteger(page) || page < 1) throw new Error(`bad page ${String(page)}`)
      const start = (page - 1) * limit
      return { data: { status: 1, data: stories.slice(start, start + limit), info: 'success' } }
    }
    if (path === '/workspaces/info') {
      only(['workspace_id'])
      const Workspace = { id: String(params['workspace_id']), name: 'Solo', status: 'normal' }
      return { data: { status: 1, data: { Workspace }, info: 'success' } }
    }
    if (path === '/workspaces/projects') {
      only(['company_id'])
      return { data: { status: 1, data: projects, info: 'success' } }
    }
    throw new Error(`unexpected path ${path}`)
  })
  vi.spyOn(axios, 'create').mockReturnValue({ get } as never)
  return { get }
}

const ids = (start: number, count: number) =>
  Array.from({ length: count }, (_, i) => String(start + i))

const sent = (get: ReturnType<typeof fakeTapd>['get']) => get.mock.calls.map((c) => c[1]?.params)

afterEach(() => vi.restoreAllMocks())

describe('tapd listTasks pages /stories by limit + page', () => {
  const L = 10
  const N = 2 * L + 1

  it('walks N = 2L+1 stories over pages 1..3, every id once, in order', async () => {
    const { get } = fakeTapd({ stories: N })
    const adapter = new TapdAdapter()
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      seen.push(...(await adapter.listTasks(CREDS, WORKSPACE, params)).map((t) => t.id))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(ids(1, N))
    // No total or next link from TAPD: full pages stay unknown, the short page ends it.
    expect(more).toEqual([undefined, undefined, false])
    expect(sent(get)).toEqual([
      { limit: L, page: 1, workspace_id: WORKSPACE },
      { limit: L, page: 2, workspace_id: WORKSPACE },
      { limit: L, page: 3, workspace_id: WORKSPACE },
    ])
  })

  it('the page-2 request carries page=2 and the caller limit', async () => {
    const { get } = fakeTapd({ stories: N })
    const rows = await new TapdAdapter().listTasks(CREDS, WORKSPACE, { page: 2, limit: L })
    expect(rows.map((t) => t.id)).toEqual(ids(L + 1, L))
    expect(sent(get)).toEqual([{ limit: L, page: 2, workspace_id: WORKSPACE }])
  })

  it('a limit above the documented maximum (200) is clamped and reported as the page size', async () => {
    const { get } = fakeTapd({ stories: 450 })
    const adapter = new TapdAdapter()
    const p1 = withPageSink({ page: 1, limit: 500 })
    const p2 = withPageSink({ page: 2, limit: 500 })
    expect((await adapter.listTasks(CREDS, WORKSPACE, p1)).map((t) => t.id)).toEqual(
      ids(1, MAX_LIMIT),
    )
    expect((await adapter.listTasks(CREDS, WORKSPACE, p2)).map((t) => t.id)).toEqual(
      ids(MAX_LIMIT + 1, MAX_LIMIT),
    )
    expect(readUpstreamPage(p1)?.pageSize).toBe(MAX_LIMIT)
    // A full clamped page (200 of 500 asked) is not the end: comparing the
    // rows with the asked limit instead of the sent one would stop a sync here.
    expect(readUpstreamPage(p1)?.hasMore).toBeUndefined()
    expect(readUpstreamPage(p2)?.hasMore).toBeUndefined()
    expect(sent(get)).toEqual([
      { limit: MAX_LIMIT, page: 1, workspace_id: WORKSPACE },
      { limit: MAX_LIMIT, page: 2, workspace_id: WORKSPACE },
    ])
  })

  it('a numeric legacy cursor is read as the page when page is absent', async () => {
    const { get } = fakeTapd({ stories: N })
    const rows = await new TapdAdapter().listTasks(CREDS, WORKSPACE, { cursor: '2', limit: L })
    expect(rows.map((t) => t.id)).toEqual(ids(L + 1, L))
    expect(sent(get)).toEqual([{ limit: L, page: 2, workspace_id: WORKSPACE }])
  })

  it('API path: parseListQuery + listPage serves page 3 as the last page', async () => {
    fakeTapd({ stories: N })
    const adapter = new TapdAdapter()
    const params: QueryParams = parseListQuery({ page: '3', limit: String(L) })
    const env = listPage(await adapter.listTasks(CREDS, WORKSPACE, params), params, 'tapd')
    expect(env.data.map((t) => t.id)).toEqual([String(N)])
    expect(env.meta).toEqual(expect.objectContaining({ page: 3, limit: L, hasMore: false }))
  })
})

type ListCall = (a: TapdAdapter, p: QueryParams) => Promise<Array<{ id: string }>>

describe.each<{ name: string; call: ListCall }>([
  {
    name: 'listProjects',
    call: (a: TapdAdapter, p: QueryParams) => a.listProjects(CREDS, p),
  },
  {
    name: 'listWorkspaces',
    call: (a: TapdAdapter, p: QueryParams) => a.listWorkspaces(CREDS, p),
  },
])('tapd $name slices the unpaginated /workspaces/projects locally', ({ call }) => {
  const L = 10
  const N = 2 * L + 1

  it('walks N = 2L+1 over pages 1..3, every id once, in order, hasMore exact', async () => {
    const { get } = fakeTapd({ projects: N })
    const adapter = new TapdAdapter()
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      seen.push(...(await call(adapter, params)).map((r) => r.id))
      const meta = readUpstreamPage(params)
      more.push(meta?.hasMore)
      expect(meta).toEqual(expect.objectContaining({ totalCount: N, pagedLocally: true }))
    }
    expect(seen).toEqual(ids(1, N))
    expect(more).toEqual([true, true, false])
    // Only the documented company_id is sent: the endpoint takes no paging.
    for (const p of sent(get)) expect(p).toEqual({ company_id: '20003261' })
  })

  it('API path: parseListQuery + listPage reports page 2 with more to come', async () => {
    fakeTapd({ projects: N })
    const adapter = new TapdAdapter()
    const params = parseListQuery({ page: '2', limit: String(L) })
    const env = listPage(await call(adapter, params), params, 'tapd')
    expect(env.data.map((r) => r.id)).toEqual(ids(L + 1, L))
    expect(env.meta).toEqual(
      expect.objectContaining({ page: 2, limit: L, hasMore: true, totalCount: N }),
    )
  })
})

describe('tapd list fallbacks without a company_id still report their end', () => {
  const NO_COMPANY = { accessToken: 'user:pass' }

  it('listProjects by workspace_id pages the single /workspaces/info row locally', async () => {
    const { get } = fakeTapd({})
    const params = withPageSink({ page: 1, limit: 10, workspace_id: WORKSPACE })
    const rows = await new TapdAdapter().listProjects(NO_COMPANY, params)
    expect(rows.map((r) => r.id)).toEqual([WORKSPACE])
    expect(readUpstreamPage(params)).toEqual(
      expect.objectContaining({ hasMore: false, totalCount: 1, pagedLocally: true }),
    )
    expect(sent(get)).toEqual([{ workspace_id: WORKSPACE }])
  })

  it('listProjects with neither company_id nor workspace_id reports an empty end', async () => {
    const { get } = fakeTapd({})
    const params = withPageSink({ page: 1, limit: 10 })
    expect(await new TapdAdapter().listProjects(NO_COMPANY, params)).toEqual([])
    expect(readUpstreamPage(params)).toEqual(
      expect.objectContaining({ hasMore: false, totalCount: 0, pagedLocally: true }),
    )
    expect(get).not.toHaveBeenCalled()
  })

  it('listWorkspaces with no company_id reports an empty end', async () => {
    const { get } = fakeTapd({})
    const params = withPageSink({ page: 1, limit: 10 })
    expect(await new TapdAdapter().listWorkspaces(NO_COMPANY, params)).toEqual([])
    expect(readUpstreamPage(params)).toEqual(
      expect.objectContaining({ hasMore: false, totalCount: 0, pagedLocally: true }),
    )
    expect(get).not.toHaveBeenCalled()
  })
})
