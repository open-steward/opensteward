/**
 * TAPD comments, labels and members, rebuilt onto the documented endpoints.
 *
 * GET https://api.tapd.cn/comments
 * https://open.tapd.cn/document/api-doc/API%E6%96%87%E6%A1%A3/api_reference/comment/get_comments.html
 *   "默认返回 30 条。可通过传 limit 参数设置，最大取 200。也可以传 page 参数翻页"
 *   "workspace_id 是 integer 项目ID" (required), entry_type, entry_id, id, limit, page
 *   "order 否 string 排序规则，规则：字段名 ASC或者DESC" (both /comments and /label)
 *
 * GET https://api.tapd.cn/label (not /labels)
 * https://open.tapd.cn/document/api-doc/API%E6%96%87%E6%A1%A3/api_reference/label/query_label.html
 *   "返回符合查询条件的所有自定义标签（分页显示，默认一页30条）"
 *   "workspace_id 是 integer 项目ID" (required), id, limit (最大取 200), page
 *
 * GET https://api.tapd.cn/workspaces/users
 * https://open.tapd.cn/document/api-doc/API%E6%96%87%E6%A1%A3/api_reference/workspace/users.html
 *   "返回符合查询条件的所有项目成员（无分页）"
 *   workspace_id (required), user, fields; items wrapped as { "UserWorkspace": {...} }
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import axios from 'axios'
import { listPage, parseListQuery, readUpstreamPage, withPageSink } from '@opensteward/shared'
import { TapdAdapter } from '../../../../../../src/verticals/projects/adapters/tapd/index'
import { CommentSchema } from '../../../../../../src/verticals/projects/schema/comment'
import { TagSchema } from '../../../../../../src/verticals/projects/schema/tag'
import { UserSchema } from '../../../../../../src/verticals/projects/schema/user'

const CREDS = { accessToken: 'user:pass' }
const WS = '10104801'
const STORY = '1010104801858505231'
const MAX_LIMIT = 200
const DEFAULT_LIMIT = 30

type Params = Record<string, unknown>

function fakeTapd(opts: { comments?: number; labels?: number; members?: number }) {
  const comments = Array.from({ length: opts.comments ?? 0 }, (_, i) => ({
    Comment: {
      id: String(i + 1),
      title: '标题',
      description: `<p>comment ${i + 1}</p>`,
      author: 'v_xuanfang',
      entry_type: 'stories',
      entry_id: STORY,
      created: '2020-06-09 10:51:06',
      modified: '2020-06-09 10:51:06',
      workspace_id: WS,
    },
  }))
  const labels = Array.from({ length: opts.labels ?? 0 }, (_, i) => ({
    LabelPool: {
      id: String(i + 1),
      workspace_id: WS,
      name: `label ${i + 1}`,
      color: '4',
      creator: 'huanjinxie',
      modifier: '',
      created: '2022-09-25 21:37:44',
      modified: '2022-09-25 21:37:44',
      color_value: '#748096',
    },
  }))
  const members = Array.from({ length: opts.members ?? 0 }, (_, i) => ({
    UserWorkspace: { user: `nick${i + 1}`, role_id: ['1000000000000000089'] },
  }))

  const get = vi.fn(async (path: string, cfg?: { params?: Params }) => {
    const params = cfg?.params ?? {}
    const only = (allowed: string[]) => {
      const extra = Object.keys(params).filter((k) => !allowed.includes(k))
      if (extra.length) throw new Error(`undocumented parameter(s) on ${path}: ${extra.join(', ')}`)
    }
    const ok = (data: unknown) => ({ data: { status: 1, data, info: 'success' } })
    // Without an order TAPD's row order is undocumented: the fake serves
    // newest-first, so a walk that omits the documented order sees it reversed.
    const paged = <T>(input: T[], idOf: (r: T) => string) => {
      const order = params['order']
      if (order !== undefined && order !== 'id asc') {
        throw new Error(`unsupported order ${String(order)}`)
      }
      const rows =
        order === undefined
          ? [...input].reverse()
          : [...input].sort((a, b) => Number(idOf(a)) - Number(idOf(b)))
      const limit = Number(params['limit'] ?? DEFAULT_LIMIT)
      const page = Number(params['page'] ?? 1)
      if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
        throw new Error(`limit must be in [1, ${MAX_LIMIT}] (got ${String(params['limit'])})`)
      }
      const start = (page - 1) * limit
      return rows.slice(start, start + limit)
    }
    if (params['workspace_id'] !== WS) throw new Error(`${path} requires workspace_id`)
    if (path === '/comments') {
      only(['workspace_id', 'entry_type', 'entry_id', 'id', 'limit', 'page', 'order'])
      let rows = comments
      if (params['entry_type'] !== undefined) {
        rows = rows.filter((r) => r.Comment.entry_type === params['entry_type'])
      }
      if (params['entry_id'] !== undefined) {
        rows = rows.filter((r) => r.Comment.entry_id === params['entry_id'])
      }
      if (params['id'] !== undefined) rows = rows.filter((r) => r.Comment.id === params['id'])
      return ok(paged(rows, (r) => r.Comment.id))
    }
    if (path === '/label') {
      only(['workspace_id', 'id', 'limit', 'page', 'order'])
      const rows =
        params['id'] === undefined ? labels : labels.filter((r) => r.LabelPool.id === params['id'])
      return ok(paged(rows, (r) => r.LabelPool.id))
    }
    if (path === '/workspaces/users') {
      only(['workspace_id', 'user', 'fields'])
      const rows =
        params['user'] === undefined
          ? members
          : members.filter((r) => r.UserWorkspace.user === params['user'])
      return ok(rows)
    }
    // The old fabricated /labels path, or anything else, is not a TAPD endpoint here.
    return { data: { status: 404, data: null, info: `no route ${path}` } }
  })
  vi.spyOn(axios, 'create').mockReturnValue({ get } as never)
  return { get }
}

const sent = (get: ReturnType<typeof fakeTapd>['get']) =>
  get.mock.calls.map((c) => ({ path: c[0], params: c[1]?.params }))

const range = (start: number, count: number, fmt: (n: number) => string) =>
  Array.from({ length: count }, (_, i) => fmt(start + i))

afterEach(() => vi.restoreAllMocks())

const L = 10
const N = 2 * L + 1

describe('tapd listComments pages GET /comments under the story workspace', () => {
  it('walks N = 2L+1 comments over pages 1..3, every id once, hasMore exact at the end', async () => {
    const { get } = fakeTapd({ comments: N })
    const adapter = new TapdAdapter()
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await adapter.listComments(CREDS, `${WS}:${STORY}`, params)
      for (const r of rows) CommentSchema.parse(r)
      seen.push(...rows.map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(range(1, N, (n) => `${WS}:${n}`))
    expect(more).toEqual([undefined, undefined, false])
    expect(sent(get)).toEqual(
      [1, 2, 3].map((page) => ({
        path: '/comments',
        params: {
          workspace_id: WS,
          entry_type: 'stories',
          entry_id: STORY,
          limit: L,
          page,
          order: 'id asc',
        },
      })),
    )
  })

  it('clamps a limit above 200 and reports the size sent', async () => {
    const { get } = fakeTapd({ comments: 250 })
    const params = withPageSink({ page: 1, limit: 500 })
    const rows = await new TapdAdapter().listComments(CREDS, `${WS}:${STORY}`, params)
    expect(rows).toHaveLength(MAX_LIMIT)
    expect(readUpstreamPage(params)?.pageSize).toBe(MAX_LIMIT)
    expect(sent(get)[0]?.params).toEqual(expect.objectContaining({ limit: MAX_LIMIT, page: 1 }))
  })

  it('API path: parseListQuery + listPage ends on the short page 3', async () => {
    fakeTapd({ comments: N })
    const params = parseListQuery({ page: '3', limit: String(L) })
    const env = listPage(
      await new TapdAdapter().listComments(CREDS, `${WS}:${STORY}`, params),
      params,
      'tapd',
    )
    expect(env.data.map((c) => c.id)).toEqual([`${WS}:${N}`])
    expect(env.meta).toEqual(expect.objectContaining({ page: 3, limit: L, hasMore: false }))
  })

  it('a bare story id (no workspace) is refused 501 NOT_SUPPORTED and sends nothing', async () => {
    const { get } = fakeTapd({ comments: N })
    await expect(
      new TapdAdapter().listComments(CREDS, STORY, withPageSink({ page: 1, limit: L })),
    ).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect(get).not.toHaveBeenCalled()
  })

  it('a scope that is not an integer workspace_id is refused 501 and sends nothing', async () => {
    const { get } = fakeTapd({ comments: N })
    await expect(
      new TapdAdapter().listComments(CREDS, `proj:${STORY}`, { page: 1, limit: L }),
    ).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    expect(get).not.toHaveBeenCalled()
  })

  it('getComment reads back a listed id with the required workspace_id', async () => {
    const { get } = fakeTapd({ comments: 3 })
    const adapter = new TapdAdapter()
    const [first] = await adapter.listComments(CREDS, `${WS}:${STORY}`, { page: 1, limit: L })
    get.mockClear()
    const c = await adapter.getComment(CREDS, first!.id)
    expect(c.id).toBe(first!.id)
    expect(sent(get)).toEqual([{ path: '/comments', params: { workspace_id: WS, id: '1' } }])
  })

  it('getComment with a bare id is refused 501 and sends nothing', async () => {
    const { get } = fakeTapd({ comments: 3 })
    await expect(new TapdAdapter().getComment(CREDS, '1')).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(get).not.toHaveBeenCalled()
  })
})

describe('tapd listTags pages GET /label', () => {
  it('walks N = 2L+1 labels over pages 1..3 on /label, every id once', async () => {
    const { get } = fakeTapd({ labels: N })
    const adapter = new TapdAdapter()
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await adapter.listTags(CREDS, WS, params)
      for (const r of rows) TagSchema.parse(r)
      seen.push(...rows.map((r) => r.id))
      more.push(readUpstreamPage(params)?.hasMore)
    }
    expect(seen).toEqual(range(1, N, (n) => `${WS}:${n}`))
    expect(more).toEqual([undefined, undefined, false])
    expect(sent(get)).toEqual(
      [1, 2, 3].map((page) => ({
        path: '/label',
        params: { workspace_id: WS, limit: L, page, order: 'id asc' },
      })),
    )
  })

  it('clamps a limit above 200 and reports the size sent', async () => {
    const { get } = fakeTapd({ labels: 250 })
    const params = withPageSink({ page: 2, limit: 500 })
    const rows = await new TapdAdapter().listTags(CREDS, WS, params)
    expect(rows.map((r) => r.externalId)).toEqual(range(201, 50, String))
    expect(readUpstreamPage(params)).toEqual(
      expect.objectContaining({ pageSize: MAX_LIMIT, hasMore: false }),
    )
    expect(sent(get)[0]?.params).toEqual({
      workspace_id: WS,
      limit: MAX_LIMIT,
      page: 2,
      order: 'id asc',
    })
  })

  it('getTag reads back a listed id on /label with the required workspace_id', async () => {
    const { get } = fakeTapd({ labels: 3 })
    const adapter = new TapdAdapter()
    const listed = await adapter.listTags(CREDS, WS, { page: 1, limit: L })
    get.mockClear()
    const t = await adapter.getTag(CREDS, listed[1]!.id)
    expect(t).toEqual(listed[1])
    expect(sent(get)).toEqual([{ path: '/label', params: { workspace_id: WS, id: '2' } }])
  })

  it('getTag with a bare id is refused 501 and sends nothing', async () => {
    const { get } = fakeTapd({ labels: 3 })
    await expect(new TapdAdapter().getTag(CREDS, '2')).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(get).not.toHaveBeenCalled()
  })
})

describe('tapd listUsers slices the unpaginated GET /workspaces/users locally', () => {
  it('walks N = 2L+1 members over pages 1..3, every id once, hasMore exact', async () => {
    const { get } = fakeTapd({ members: N })
    const adapter = new TapdAdapter()
    const seen: string[] = []
    const more: Array<boolean | undefined> = []
    for (const page of [1, 2, 3]) {
      const params = withPageSink({ page, limit: L })
      const rows = await adapter.listUsers(CREDS, WS, params)
      for (const r of rows) UserSchema.parse(r)
      seen.push(...rows.map((r) => r.id))
      const meta = readUpstreamPage(params)
      more.push(meta?.hasMore)
      expect(meta).toEqual(expect.objectContaining({ totalCount: N, pagedLocally: true }))
    }
    expect(seen).toEqual(range(1, N, (n) => `${WS}:nick${n}`))
    expect(more).toEqual([true, true, false])
    // Only documented parameters: no limit/page on an unpaginated endpoint.
    for (const s of sent(get)) {
      expect(s).toEqual({
        path: '/workspaces/users',
        params: { workspace_id: WS, fields: 'user,role_id,name,email,real_join_time' },
      })
    }
  })

  it('getUser reads back a listed id by the documented user filter', async () => {
    const { get } = fakeTapd({ members: 3 })
    const adapter = new TapdAdapter()
    const listed = await adapter.listUsers(CREDS, WS, { page: 1, limit: L })
    get.mockClear()
    const u = await adapter.getUser(CREDS, listed[2]!.id)
    expect(u).toEqual(listed[2])
    expect(sent(get)).toEqual([
      {
        path: '/workspaces/users',
        params: {
          workspace_id: WS,
          user: 'nick3',
          fields: 'user,role_id,name,email,real_join_time',
        },
      },
    ])
  })

  it('getUser with a bare nickname is refused 501 and sends nothing', async () => {
    const { get } = fakeTapd({ members: 3 })
    await expect(new TapdAdapter().getUser(CREDS, 'nick1')).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(get).not.toHaveBeenCalled()
  })
})

// The get* methods filter server-side (id / user), but read back only the row
// whose documented key matches exactly: an upstream that answers with other
// rows (or ignores the filter) must not hand back the wrong record.
describe('tapd get* return only the exactly matching row', () => {
  function stubRows(wrap: string, rows: Array<Record<string, unknown>>) {
    const get = vi.fn(async () => ({
      data: { status: 1, data: rows.map((r) => ({ [wrap]: r })), info: 'success' },
    }))
    vi.spyOn(axios, 'create').mockReturnValue({ get } as never)
    return get
  }
  const comment = (id: string) => ({
    id,
    description: `<p>c${id}</p>`,
    author: 'v_xuanfang',
    entry_type: 'stories',
    entry_id: STORY,
    created: '2020-06-09 10:51:06',
    modified: '2020-06-09 10:51:06',
    workspace_id: WS,
  })
  const label = (id: string) => ({
    id,
    workspace_id: WS,
    name: `label ${id}`,
    created: '2022-09-25 21:37:44',
    color_value: '#748096',
  })

  it('getComment skips a non-matching row that comes first', async () => {
    stubRows('Comment', [comment('7'), comment('8')])
    const c = await new TapdAdapter().getComment(CREDS, `${WS}:8`)
    expect(c.externalId).toBe('8')
  })

  it('getComment throws when no row matches', async () => {
    stubRows('Comment', [comment('7')])
    await expect(new TapdAdapter().getComment(CREDS, `${WS}:8`)).rejects.toThrow(/not found/)
  })

  it('getTag skips a non-matching row that comes first', async () => {
    stubRows('LabelPool', [label('7'), label('8')])
    const t = await new TapdAdapter().getTag(CREDS, `${WS}:8`)
    expect(t.id).toBe(`${WS}:8`)
  })

  it('getTag throws when no row matches', async () => {
    stubRows('LabelPool', [label('7')])
    await expect(new TapdAdapter().getTag(CREDS, `${WS}:8`)).rejects.toThrow(/not found/)
  })

  it('getUser skips a non-matching nickname that comes first', async () => {
    stubRows('UserWorkspace', [{ user: 'nick1' }, { user: 'nick2' }])
    const u = await new TapdAdapter().getUser(CREDS, `${WS}:nick2`)
    expect(u.externalId).toBe('nick2')
  })

  it('getUser throws when no nickname matches', async () => {
    stubRows('UserWorkspace', [{ user: 'nick1' }])
    await expect(new TapdAdapter().getUser(CREDS, `${WS}:nick2`)).rejects.toThrow(/not found/)
  })
})
