/**
 * Huly list/get requests and paging against a fake transactor.
 *
 * The fake honours only what Huly documents for
 * `GET /api/v1/find-all/:workspaceId` — the query string of the first-party
 * REST client (huly.core packages/api-client/src/rest/rest.ts: `class`,
 * JSON `query`, JSON `options`), the `FindOptions` keys of
 * packages/core/src/storage.ts, and the `QuerySelector` operators this
 * adapter uses (`$gte` on a number, `$nin`). It answers as the transactor
 * serialises a FindResult (packages/rpc/src/rpc.ts `rpcJSONReplacer`): a
 * `TotalArray` envelope, or a plain array.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import axios from 'axios'
import {
  _resetCursorPager,
  readUpstreamPage,
  withPageSink,
  type Credentials,
  type QueryParams,
} from '@opensteward/shared'
import { HulyAdapter } from '../../../../../../src/verticals/projects/adapters/huly/index'

const WS = '3f2c9a4e-8d1b-4c6f-9e2a-5b7d1c0f4e88'
const BASE = 'https://transactor.example.test/api/v1'
const CREDS: Credentials = {
  accessToken: 'huly-api-token',
  extra: { apiBaseUrl: BASE, workspaceId: WS },
}

type Doc = Record<string, unknown> & { _id: string; _class: string; modifiedOn: number }

const FIND_OPTIONS = new Set([
  'limit',
  'sort',
  'lookup',
  'projection',
  'associations',
  'total',
  'showArchived',
])

function matches(doc: Doc, query: Record<string, unknown>): boolean {
  for (const [k, v] of Object.entries(query)) {
    const actual = doc[k]
    if (v && typeof v === 'object') {
      for (const [op, arg] of Object.entries(v as Record<string, unknown>)) {
        if (op === '$gte') {
          if (typeof arg !== 'number' || typeof actual !== 'number')
            throw new Error('$gte takes a number')
          if (!(actual >= arg)) return false
        } else if (op === '$in') {
          if (!Array.isArray(arg)) throw new Error('$in takes an array')
          if (!arg.includes(actual)) return false
        } else if (op === '$nin') {
          if (!Array.isArray(arg)) throw new Error('$nin takes an array')
          if (arg.includes(actual)) return false
        } else {
          throw new Error(`operator not used by this adapter: ${op}`)
        }
      }
    } else if (actual !== v) {
      return false
    }
  }
  return true
}

/** A fake transactor holding `docs`, answering in the TotalArray envelope unless `plain`. */
function fakeHuly(docs: Doc[], opts: { plain?: boolean } = {}) {
  const get = vi.fn(async (path: string, cfg?: { params?: Record<string, string> }) => {
    const params = cfg?.params ?? {}
    for (const k of Object.keys(params)) {
      if (!['class', 'query', 'options'].includes(k))
        throw new Error(`undocumented query parameter ${k}`)
    }
    if (path !== `/find-all/${WS}`) throw new Error(`unexpected path ${path}`)
    const query = params['query'] ? (JSON.parse(params['query']) as Record<string, unknown>) : {}
    const options = params['options']
      ? (JSON.parse(params['options']) as Record<string, unknown>)
      : {}
    for (const k of Object.keys(options))
      if (!FIND_OPTIONS.has(k)) throw new Error(`not a FindOptions key: ${k}`)
    let rows = docs.filter((d) => d._class === params['class'] && matches(d, query))
    if (!(
      options['showArchived'] === true ||
      typeof query['space'] === 'string' ||
      typeof query['_id'] === 'string'
    )) {
      // huly.server spaceSecurity.ts drops documents whose SPACE is archived
      // (`this.spacesMap.get(p)?.archived !== true`), and archived spaces themselves.
      const archived = new Set(docs.filter((d) => d['archived'] === true).map((d) => d._id))
      rows = rows.filter((d) => !archived.has(d['space'] as string) && !archived.has(d._id))
    }
    const sort = options['sort'] as Record<string, number> | undefined
    if (sort) {
      const [[field, order]] = Object.entries(sort) as [[string, number]]
      rows = [...rows].sort((a, b) => ((a[field] as number) - (b[field] as number)) * order)
    }
    if (typeof options['limit'] === 'number') rows = rows.slice(0, options['limit'])
    return { data: opts.plain ? rows : { dataType: 'TotalArray', total: -1, value: rows } }
  })
  const create = vi
    .spyOn(axios, 'create')
    .mockReturnValue({ get, post: vi.fn(), put: vi.fn(), delete: vi.fn() } as never)
  return { get, create }
}

const project = (id: string, modifiedOn: number, extra: Record<string, unknown> = {}): Doc => ({
  _id: id,
  _class: 'tracker:class:Project',
  space: 'core:space:Space',
  name: `Project ${id}`,
  description: '',
  private: false,
  members: [],
  archived: false,
  identifier: id.toUpperCase(),
  modifiedOn,
  ...extra,
})
const issue = (id: string, space: string, modifiedOn: number): Doc => ({
  _id: id,
  _class: 'tracker:class:Issue',
  space,
  attachedTo: 'tracker:ids:NoParent',
  title: `Issue ${id}`,
  priority: 0,
  assignee: null,
  dueDate: null,
  modifiedOn,
})
const message = (id: string, attachedTo: string, modifiedOn: number): Doc => ({
  _id: id,
  _class: 'chunter:class:ChatMessage',
  space: 'project-1',
  attachedTo,
  attachedToClass: 'tracker:class:Issue',
  collection: 'comments',
  message: `msg ${id}`,
  createdBy: 'social-1',
  createdOn: modifiedOn,
  modifiedOn,
})
const employee = (id: string, modifiedOn: number, extra: Record<string, unknown> = {}): Doc => ({
  _id: id,
  _class: 'contact:mixin:Employee',
  space: 'contact:space:Contacts',
  name: `Person ${id}`,
  modifiedOn,
  ...extra,
})
/** contact `SocialIdentity`: `_id` is the PersonId, `attachedTo` the Person. */
const identity = (personId: string, person: string): Doc => ({
  _id: personId,
  _class: 'contact:class:SocialIdentity',
  space: 'contact:space:Contacts',
  attachedTo: person,
  attachedToClass: 'contact:class:Person',
  collection: 'socialIds',
  type: 'huly',
  value: personId,
  key: `huly:${personId}`,
  modifiedOn: 0,
})
const IDENT = identity('social-1', 'person-1')

const adapter = () => new HulyAdapter()

/** Walk pages 1..n like the sync worker, returning ids per page and each hasMore. */
async function walk(
  fn: (p: QueryParams) => Promise<{ id: string }[]>,
  limit: number,
  pages: number,
) {
  const out: { ids: string[]; hasMore: boolean | undefined }[] = []
  for (let page = 1; page <= pages; page++) {
    const params = withPageSink({ page, limit })
    const ids = (await fn(params)).map((r) => r.id)
    out.push({ ids, hasMore: readUpstreamPage(params)?.hasMore })
  }
  return out
}

beforeEach(() => _resetCursorPager())
afterEach(() => vi.restoreAllMocks())

describe('huly client', () => {
  it('sends the API token as Bearer to the connection base URL', async () => {
    const { create, get } = fakeHuly([project('p1', 1)])
    await adapter().listProjects(CREDS, withPageSink({ page: 1, limit: 10 }))
    const cfg = create.mock.calls[0]![0] as { baseURL: string; headers: Record<string, string> }
    expect(cfg.baseURL).toBe(BASE)
    expect(cfg.headers['Authorization']).toBe('Bearer huly-api-token')
    expect(get.mock.calls[0]![0]).toBe(`/find-all/${WS}`)
  })

  it('page 1 sends class, the caller limit and the modifiedOn sort, with no query', async () => {
    const { get } = fakeHuly([])
    await adapter().listProjects(CREDS, withPageSink({ page: 1, limit: 7 }))
    expect(get.mock.calls[0]![1]).toEqual({
      params: {
        class: 'tracker:class:Project',
        options: JSON.stringify({ showArchived: true, limit: 7, sort: { modifiedOn: 1 } }),
      },
    })
  })

  it('reads a plain-array FindResult as well as a TotalArray', async () => {
    fakeHuly([project('p1', 1)], { plain: true })
    const rows = await adapter().listProjects(CREDS, withPageSink({ page: 1, limit: 10 }))
    expect(rows.map((r) => r.id)).toEqual(['p1'])
  })
})

describe('huly paging (keyset on modifiedOn through pageByCursor)', () => {
  // N = 2L+1 with L = 2, and a run of equal modifiedOn values that straddles
  // the page boundary, so only the $nin exclusion keeps rows from repeating.
  const docs = [
    project('p5', 300),
    project('p1', 100),
    project('p3', 200),
    project('p2', 200),
    project('p4', 200),
  ]

  it('listProjects walks every project once with an exact hasMore', async () => {
    fakeHuly(docs)
    const pages = await walk((p) => adapter().listProjects(CREDS, p), 2, 4)
    expect(pages.map((p) => p.hasMore)).toEqual([true, true, false, false])
    const ids = pages.flatMap((p) => p.ids)
    expect([...ids].sort()).toEqual(['p1', 'p2', 'p3', 'p4', 'p5'])
    expect(new Set(ids).size).toBe(ids.length)
    expect(pages[3]!.ids).toEqual([])
  })

  it('page 2 asks from the last modifiedOn, excluding the ids served at it', async () => {
    const { get } = fakeHuly(docs)
    await walk((p) => adapter().listProjects(CREDS, p), 2, 2)
    const q2 = JSON.parse(get.mock.calls[1]![1]!.params!.query as string)
    expect(q2.modifiedOn).toEqual({ $gte: 200 })
    expect(q2._id.$nin).toHaveLength(1)
  })

  it('includes archived projects', async () => {
    fakeHuly([project('p1', 1), project('p2', 2, { archived: true })])
    const rows = await adapter().listProjects(CREDS, withPageSink({ page: 1, limit: 10 }))
    expect(rows.map((r) => [r.id, r.status])).toEqual([
      ['p1', 'active'],
      ['p2', 'archived'],
    ])
  })

  it('listTasks filters by project space and walks every issue once', async () => {
    const issues = [
      issue('i1', 'proj-a', 10),
      issue('i2', 'proj-a', 20),
      issue('x1', 'proj-b', 15),
      issue('i3', 'proj-a', 20),
      issue('i4', 'proj-a', 30),
      issue('i5', 'proj-a', 40),
    ]
    const { get } = fakeHuly(issues)
    const pages = await walk((p) => adapter().listTasks(CREDS, 'proj-a', p), 2, 3)
    expect(pages.map((p) => p.hasMore)).toEqual([true, true, false])
    const ids = pages.flatMap((p) => p.ids)
    expect([...ids].sort()).toEqual(['i1', 'i2', 'i3', 'i4', 'i5'])
    expect(new Set(ids).size).toBe(5)
    expect(JSON.parse(get.mock.calls[0]![1]!.params!.query as string)).toEqual({ space: 'proj-a' })
  })

  it('listComments filters by attachedTo and walks every message once', async () => {
    const msgs = [
      message('m1', 'i1', 1),
      message('m2', 'i1', 2),
      message('m3', 'i1', 3),
      message('m4', 'i1', 4),
      message('m5', 'i1', 5),
      message('z', 'i2', 3),
    ]
    const { get } = fakeHuly([...msgs, IDENT])
    const pages = await walk((p) => adapter().listComments(CREDS, 'i1', p), 2, 3)
    expect(pages.map((p) => p.ids)).toEqual([['m1', 'm2'], ['m3', 'm4'], ['m5']])
    expect(pages.map((p) => p.hasMore)).toEqual([true, true, false])
    expect(get.mock.calls[0]![1]!.params!.class).toBe('chunter:class:ChatMessage')
    expect(JSON.parse(get.mock.calls[0]![1]!.params!.query as string)).toEqual({ attachedTo: 'i1' })
  })

  it('listUsers lists Employee members and walks every one once', async () => {
    const people = [
      employee('u1', 5),
      employee('u2', 5),
      employee('u3', 5),
      employee('u4', 5),
      employee('u5', 5),
    ]
    const { get } = fakeHuly(people)
    const pages = await walk((p) => adapter().listUsers(CREDS, WS, p), 2, 3)
    const ids = pages.flatMap((p) => p.ids)
    expect([...ids].sort()).toEqual(['u1', 'u2', 'u3', 'u4', 'u5'])
    expect(new Set(ids).size).toBe(5)
    expect(pages.map((p) => p.hasMore)).toEqual([true, true, false])
    expect(get.mock.calls[0]![1]!.params!.class).toBe('contact:mixin:Employee')
  })

  it('listUsers refuses another workspace id', async () => {
    const { get } = fakeHuly([])
    await expect(
      adapter().listUsers(CREDS, 'other-ws', withPageSink({ page: 1, limit: 5 })),
    ).rejects.toMatchObject({
      statusCode: 404,
    })
    expect(get).not.toHaveBeenCalled()
  })
})

describe('huly get* by _id', () => {
  const all = [
    project('p1', 1),
    issue('i1', 'p1', 2),
    message('m1', 'i1', 3),
    employee('u1', 4),
    IDENT,
  ]

  it.each([
    ['getProject', 'p1', 'tracker:class:Project'],
    ['getTask', 'i1', 'tracker:class:Issue'],
    ['getComment', 'm1', 'chunter:class:ChatMessage'],
    ['getUser', 'u1', 'contact:mixin:Employee'],
  ] as const)('%s queries _id with limit 1 and reads the row back', async (method, id, cls) => {
    const { get } = fakeHuly(all)
    const row = await adapter()[method](CREDS, id)
    expect(row.id).toBe(id)
    expect(get.mock.calls[0]![1]).toEqual({
      params: {
        class: cls,
        query: JSON.stringify({ _id: id }),
        options: JSON.stringify({ limit: 1 }),
      },
    })
  })

  it('a missing document is a 404', async () => {
    fakeHuly([])
    await expect(adapter().getProject(CREDS, 'nope')).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('huly workspace', () => {
  it('listWorkspaces returns the connection workspace once, paged locally, with no request', async () => {
    const { get } = fakeHuly([])
    const p1 = withPageSink({ page: 1, limit: 1 })
    expect((await adapter().listWorkspaces(CREDS, p1)).map((w) => w.id)).toEqual([WS])
    expect(readUpstreamPage(p1)).toMatchObject({
      hasMore: false,
      totalCount: 1,
      pagedLocally: true,
    })
    expect(await adapter().listWorkspaces(CREDS, withPageSink({ page: 2, limit: 1 }))).toEqual([])
    expect(get).not.toHaveBeenCalled()
  })

  it('getWorkspace resolves only the connection workspace', async () => {
    fakeHuly([])
    expect((await adapter().getWorkspace(CREDS, WS)).id).toBe(WS)
    await expect(adapter().getWorkspace(CREDS, 'other')).rejects.toMatchObject({ statusCode: 404 })
  })
})

describe('huly connections without the connect-time fields refuse before any request', () => {
  const cases: [string, Credentials][] = [
    ['no apiBaseUrl', { accessToken: 't', extra: { workspaceId: WS } }],
    ['no workspaceId', { accessToken: 't', extra: { apiBaseUrl: BASE } }],
    ['legacy slug only', { accessToken: 't', extra: { workspace: 'acme' } }],
  ]
  it.each(cases)('%s → 501 NOT_SUPPORTED', async (_name, creds) => {
    const { get, create } = fakeHuly([])
    const a = adapter()
    const page = () => withPageSink({ page: 1, limit: 5 })
    for (const call of [
      () => a.listProjects(creds, page()),
      () => a.listTasks(creds, 'p1', page()),
      () => a.listComments(creds, 'i1', page()),
      () => a.listUsers(creds, '', page()),
      () => a.listWorkspaces(creds, page()),
      () => a.getProject(creds, 'p1'),
    ]) {
      await expect(call()).rejects.toMatchObject({ statusCode: 501, code: 'NOT_SUPPORTED' })
    }
    expect(get).not.toHaveBeenCalled()
    expect(create).not.toHaveBeenCalled()
  })
})

describe('huly archived spaces', () => {
  // A message on an issue of an archived project. The fake hides it, as the
  // server does, unless the query says showArchived.
  const docs = [
    project('proj-arch', 1, { archived: true }),
    { ...message('m-arch', 'i-arch', 2), space: 'proj-arch' },
    IDENT,
  ]

  it('listComments returns messages whose project is archived', async () => {
    const { get } = fakeHuly(docs)
    const rows = await adapter().listComments(CREDS, 'i-arch', withPageSink({ page: 1, limit: 5 }))
    expect(rows.map((r) => r.id)).toEqual(['m-arch'])
    expect(JSON.parse(get.mock.calls[0]![1]!.params!.options as string)).toMatchObject({
      showArchived: true,
    })
  })

  it('listUsers sends showArchived', async () => {
    const { get } = fakeHuly([employee('u1', 1)])
    await adapter().listUsers(CREDS, WS, withPageSink({ page: 1, limit: 5 }))
    expect(JSON.parse(get.mock.calls[0]![1]!.params!.options as string)).toMatchObject({
      showArchived: true,
    })
  })
})

describe('huly cross-resource ids resolve to User ids', () => {
  it('Comment.authorId is the Person the createdBy SocialIdentity is attached to', async () => {
    const docs = [
      message('m1', 'i1', 1),
      { ...message('m2', 'i1', 2), createdBy: 'social-2' },
      message('m3', 'i1', 3),
      IDENT,
      identity('social-2', 'person-2'),
    ]
    const { get } = fakeHuly(docs)
    const rows = await adapter().listComments(CREDS, 'i1', withPageSink({ page: 1, limit: 5 }))
    expect(rows.map((r) => [r.id, r.authorId])).toEqual([
      ['m1', 'person-1'],
      ['m2', 'person-2'],
      ['m3', 'person-1'],
    ])
    expect(get).toHaveBeenCalledTimes(2)
    const lookup = get.mock.calls[1]![1]!.params!
    expect(lookup.class).toBe('contact:class:SocialIdentity')
    expect(JSON.parse(lookup.query as string)).toEqual({ _id: { $in: ['social-1', 'social-2'] } })
  })

  it('getComment resolves its author the same way', async () => {
    fakeHuly([message('m1', 'i1', 1), IDENT])
    expect((await adapter().getComment(CREDS, 'm1')).authorId).toBe('person-1')
  })

  it('a createdBy with no SocialIdentity throws instead of emitting the PersonId', async () => {
    fakeHuly([message('m1', 'i1', 1)])
    await expect(
      adapter().listComments(CREDS, 'i1', withPageSink({ page: 1, limit: 5 })),
    ).rejects.toThrow(/SocialIdentity/)
  })

  it('Project.ownerId is the member Person whose personUuid is owners[0]', async () => {
    const docs = [
      project('p1', 1, { owners: ['acc-1'] }),
      project('p2', 2, { owners: ['acc-9'] }),
      employee('person-1', 1, { personUuid: 'acc-1' }),
    ]
    const { get } = fakeHuly(docs)
    const rows = await adapter().listProjects(CREDS, withPageSink({ page: 1, limit: 5 }))
    expect(rows.map((r) => [r.id, r.ownerId, r.metadata['ownerAccountUuid']])).toEqual([
      ['p1', 'person-1', 'acc-1'],
      ['p2', undefined, 'acc-9'],
    ])
    const lookup = get.mock.calls[1]![1]!.params!
    expect(lookup.class).toBe('contact:mixin:Employee')
    expect(JSON.parse(lookup.query as string)).toEqual({ personUuid: { $in: ['acc-1', 'acc-9'] } })
  })
})

describe('huly paging state is per parent', () => {
  it('interleaved listTasks walks of two projects each serve every issue once', async () => {
    const issues = [
      issue('a1', 'proj-a', 10),
      issue('a2', 'proj-a', 20),
      issue('a3', 'proj-a', 30),
      issue('b1', 'proj-b', 100),
      issue('b2', 'proj-b', 200),
      issue('b3', 'proj-b', 300),
    ]
    fakeHuly(issues)
    const a = adapter()
    const call = async (proj: string, page: number) =>
      (await a.listTasks(CREDS, proj, withPageSink({ page, limit: 2 }))).map((r) => r.id)
    expect(await call('proj-a', 1)).toEqual(['a1', 'a2'])
    expect(await call('proj-b', 1)).toEqual(['b1', 'b2'])
    expect(await call('proj-a', 2)).toEqual(['a3'])
    expect(await call('proj-b', 2)).toEqual(['b3'])
  })
})

describe('huly error envelope', () => {
  it('a { error } body from find-all is thrown with the platform status', async () => {
    const get = vi.fn(async () => ({
      data: { error: { severity: 'ERROR', code: 'platform:status:Forbidden', params: {} } },
    }))
    vi.spyOn(axios, 'create').mockReturnValue({ get } as never)
    await expect(
      adapter().listProjects(CREDS, withPageSink({ page: 1, limit: 5 })),
    ).rejects.toThrow(/find-all failed: .*platform:status:Forbidden/)
  })
})
