/**
 * odoo-project over the shared Odoo client, against a JSON-2 / JSON-RPC fake
 * that honours only what Odoo documents.
 *
 * https://www.odoo.com/documentation/19.0/developer/reference/external_api.html
 *   "Post a JSON object at the /json/2/<model>/<method> URL."
 * https://www.odoo.com/documentation/19.0/developer/reference/external_rpc_api.html
 *   "offset and limit parameters are available to only retrieve a subset of all matched records."
 *   "fields_get() can be used to inspect a model's fields"
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  _resetOdooUidCache,
  readUpstreamPage,
  setDnsResolver,
  withPageSink,
} from '@opensteward/shared'
import {
  OdooProjectAdapter,
  _resetOdooProjectCaches,
} from '../../../../../../src/verticals/projects/adapters/odoo-project'
import { metadata } from '../../../../../../src/verticals/projects/adapters/odoo-project/metadata'
import { ADAPTER_FACTORIES } from '../../../../../../src/verticals/projects/adapter/factories'
import {
  CommentSchema,
  ProjectSchema,
  TagSchema,
  TaskSchema,
  UserSchema,
  WorkspaceSchema,
} from '../../../../../../src/verticals/projects/schema'

const KEY = 'odoo_key'
const BASE = 'https://acme.odoo.com'
const CREDS = { accessToken: KEY, extra: { baseUrl: BASE, database: 'acme', apiVersion: 'json2' } }
const RPC_CREDS = {
  accessToken: KEY,
  extra: { baseUrl: BASE, database: 'acme', login: 'bot@acme.com', apiVersion: 'rpc' },
}

type Row = Record<string, unknown> & { id: number }
interface Sent {
  path: string
  headers: Headers
  body: Record<string, unknown>
}

/** A Many2one reads as [id, name]; a Many2many as a list of ids. */
function isMany2one(v: unknown): v is [number, string] {
  return Array.isArray(v) && v.length === 2 && typeof v[0] === 'number' && typeof v[1] === 'string'
}

function matches(row: Row, domain: unknown[]): boolean {
  return domain.every((c) => {
    const [f, op, v] = c as [string, string, unknown]
    if (!(f in row)) throw new Error(`fake: row has no ${f}`)
    const raw = row[f]
    if (Array.isArray(raw) && !isMany2one(raw)) {
      // x2many: `in` is "any of the ids"
      if (op !== 'in') throw new Error(`fake: unsupported x2many operator ${op}`)
      return (v as unknown[]).some((x) => (raw as unknown[]).includes(x))
    }
    const have = isMany2one(raw) ? raw[0] : raw
    if (op === '=') return have === v
    if (op === 'in') return (v as unknown[]).includes(have)
    // Datetimes are 'YYYY-MM-DD HH:MM:SS' strings, which order as text.
    if (op === '>=') return typeof have === 'string' && typeof v === 'string' && have >= v
    throw new Error(`fake: unsupported operator ${op}`)
  })
}

/** Fields each model has on 19.0 (see the transform tests' sources). */
const MODEL_FIELDS: Record<string, string[]> = {
  'project.project': [
    'id',
    'name',
    'description',
    'active',
    'partner_id',
    'company_id',
    'user_id',
    'date_start',
    'date',
    'tag_ids',
    'privacy_visibility',
    'last_update_status',
    'create_date',
    'write_date',
  ],
  'project.task': [
    'id',
    'active',
    'name',
    'description',
    'priority',
    'stage_id',
    'tag_ids',
    'state',
    'is_closed',
    'date_deadline',
    'project_id',
    'user_ids',
    'company_id',
    'parent_id',
    'subtask_count',
    'milestone_id',
    'create_date',
    'write_date',
  ],
  'mail.message': [
    'id',
    'body',
    'model',
    'res_id',
    'message_type',
    'subtype_id',
    'is_internal',
    'author_id',
    'create_uid',
    'attachment_ids',
    'date',
    'create_date',
    'write_date',
  ],
  'project.tags': ['id', 'name', 'color'],
  'res.company': ['id', 'name', 'parent_id'],
  'res.users': ['id', 'name', 'email', 'active', 'share', 'company_ids'],
}

/**
 * The RPC route serves Odoo 14–18; there the fake is Odoo 14.0, the oldest
 * (odoo/odoo 14.0 addons/project/models/project.py):
 *   - project.project has no tag_ids and no last_update_status (15.0+).
 *   - project.task has no state (17.0+), user_ids (15.0+) or milestone_id
 *     (16.0+); it has kanban_state and user_id ('Assigned to').
 *   - priority is [('0', 'Normal'), ('1', 'Important')].
 * Odoo refuses a read naming a field the model lacks, so the fake does too.
 */
const ODOO_14_FIELDS: Record<string, { drop: string[]; add: string[] }> = {
  'project.project': { drop: ['tag_ids', 'last_update_status'], add: [] },
  'project.task': {
    drop: ['state', 'user_ids', 'milestone_id'],
    add: ['kanban_state', 'user_id'],
  },
}

const PRIORITY_19 = [
  ['0', 'Low priority'],
  ['1', 'Medium priority'],
  ['2', 'High priority'],
  ['3', 'Urgent'],
]
const PRIORITY_14 = [
  ['0', 'Normal'],
  ['1', 'Important'],
]

function fakeOdoo(stores: Record<string, Row[]>) {
  const sent: Sent[] = []
  function handle(model: string, method: string, body: Record<string, unknown>, rpc = false) {
    const all = MODEL_FIELDS[model]
    const v14 = ODOO_14_FIELDS[model]
    const fields =
      rpc && all && v14 ? [...all.filter((f) => !v14.drop.includes(f)), ...v14.add] : all
    if (!fields)
      return { status: 404, body: { name: 'werkzeug.exceptions.NotFound', message: model } }
    if (method === 'fields_get') {
      const attributes = (body['attributes'] as string[] | undefined) ?? []
      return {
        status: 200,
        body: Object.fromEntries(
          fields.map((f) => [
            f,
            attributes.includes('selection') && f === 'priority'
              ? { selection: rpc ? PRIORITY_14 : PRIORITY_19 }
              : attributes.includes('selection')
                ? {}
                : { type: 'char' },
          ]),
        ),
      }
    }
    const asked = (body['fields'] as string[] | undefined) ?? []
    const bad = asked.find((f) => !fields.includes(f))
    if (bad)
      return {
        status: 500,
        body: { name: 'builtins.ValueError', message: `Invalid field '${bad}'` },
      }
    const store = stores[model] ?? []
    const pick = (r: Row) =>
      Object.fromEntries([['id', r.id], ...asked.map((f) => [f, r[f] ?? false])])
    if (method === 'read') {
      const ids = body['ids'] as number[]
      return { status: 200, body: store.filter((r) => ids.includes(r.id)).map(pick) }
    }
    const hits = store.filter((r) => matches(r, (body['domain'] as unknown[]) ?? []))
    if (method === 'search_count') return { status: 200, body: hits.length }
    const ordered = body['order'] === 'id asc' ? [...hits].sort((a, b) => a.id - b.id) : hits
    const offset = (body['offset'] as number | undefined) ?? 0
    const limit = body['limit'] as number | undefined
    return {
      status: 200,
      body: ordered.slice(offset, limit === undefined ? undefined : offset + limit).map(pick),
    }
  }
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input))
    const headers = new Headers(init?.headers)
    const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
    if (url.origin !== BASE || init?.method !== 'POST') return Response.json({}, { status: 404 })
    if (url.pathname === '/jsonrpc') {
      const id = body['id'] ?? null
      const { service, method, args } = body['params'] as {
        service: string
        method: string
        args: unknown[]
      }
      const ok = (result: unknown) => Response.json({ jsonrpc: '2.0', id, result })
      if (service === 'common' && method === 'authenticate') {
        return ok(args[0] === 'acme' && args[1] === 'bot@acme.com' && args[2] === KEY ? 7 : false)
      }
      const [, , , model, m, pos, kw] = args as [
        string,
        number,
        string,
        string,
        string,
        unknown[],
        Record<string, unknown>,
      ]
      sent.push({ path: `rpc:${model}/${m}`, headers, body: { pos, kw } })
      const named =
        m === 'read' ? { ids: pos[0], ...kw } : m === 'fields_get' ? kw : { domain: pos[0], ...kw }
      const r = handle(model, m, named, true)
      if (r.status !== 200) {
        const { name, message } = r.body as { name: string; message: string }
        return Response.json({
          jsonrpc: '2.0',
          id,
          error: { code: 200, message: 'Odoo Server Error', data: { name, message } },
        })
      }
      return ok(r.body)
    }
    const m = /^\/json\/2\/([^/]+)\/([^/]+)$/.exec(url.pathname)
    if (!m) return Response.json({}, { status: 404 })
    sent.push({ path: url.pathname, headers, body })
    if (headers.get('authorization') !== `bearer ${KEY}`) {
      return Response.json(
        { name: 'werkzeug.exceptions.Unauthorized', message: 'Invalid apikey' },
        { status: 401 },
      )
    }
    const r = handle(m[1]!, m[2]!, body)
    return Response.json(r.body, { status: r.status })
  })
  return sent
}

/** The calls that are not the client's own fields_get(['type']) probe. */
function calls(sent: Sent[]): Sent[] {
  return sent.filter((s) => {
    if (!s.path.endsWith('/fields_get')) return true
    const attrs = (s.body['attributes'] ??
      (s.body['kw'] as Record<string, unknown>)?.['attributes']) as string[] | undefined
    return !(attrs && attrs.length === 1 && attrs[0] === 'type')
  })
}

const project = (id: number): Row => ({
  id,
  name: `Project ${id}`,
  description: '<p>About</p>',
  active: true,
  partner_id: false,
  company_id: [1, 'YourCompany'],
  user_id: [2, 'Mitchell Admin'],
  date_start: '2026-01-01',
  date: false,
  tag_ids: [5],
  privacy_visibility: 'portal',
  last_update_status: 'on_track',
  create_date: '2026-01-01 00:00:00',
  write_date: '2026-01-02 00:00:00',
})

const task = (id: number, projectId: number, extra: Record<string, unknown> = {}): Row => ({
  id,
  active: true,
  name: `Task ${id}`,
  description: false,
  priority: '1',
  stage_id: [3, 'In Progress'],
  tag_ids: [5],
  state: '01_in_progress',
  kanban_state: 'normal',
  is_closed: false,
  date_deadline: '2026-02-01 12:00:00',
  project_id: [projectId, `Project ${projectId}`],
  user_ids: [2],
  user_id: [2, 'Mitchell Admin'],
  company_id: [1, 'YourCompany'],
  parent_id: false,
  subtask_count: 0,
  milestone_id: false,
  create_date: '2026-01-01 00:00:00',
  write_date: '2026-01-02 00:00:00',
  ...extra,
})

const message = (id: number, model: string, resId: number, type = 'comment'): Row => ({
  id,
  body: `<p>Comment ${id}</p>`,
  model,
  res_id: resId,
  message_type: type,
  subtype_id: [1, 'Discussions'],
  is_internal: false,
  author_id: [3, 'Mitchell Admin'],
  create_uid: [2, 'Mitchell Admin'],
  attachment_ids: [],
  date: '2026-01-03 00:00:00',
  create_date: '2026-01-03 00:00:00',
  write_date: '2026-01-03 00:00:00',
})

const user = (id: number, share: boolean, companies: number[]): Row => ({
  id,
  name: `User ${id}`,
  email: `user${id}@acme.example`,
  active: true,
  share,
  company_ids: companies,
})

beforeEach(() => {
  setDnsResolver(async () => [{ address: '93.184.216.34' }])
  _resetOdooUidCache()
  _resetOdooProjectCaches()
})
afterEach(() => {
  vi.restoreAllMocks()
  setDnsResolver(undefined)
})

describe('odoo-project registration', () => {
  it('is registered in the projects factories', () => {
    expect(ADAPTER_FACTORIES['odoo-project']!({} as never)).toBeInstanceOf(OdooProjectAdapter)
  })

  it('collects the shared Odoo form, not an OAuth redirect', () => {
    const a = new OdooProjectAdapter()
    expect(a.credentialFields().map((f) => f.name)).toEqual([
      'baseUrl',
      'apiVersion',
      'database',
      'login',
      'apiKey',
    ])
    expect(a.getAuthUrl('state')).toBe('#api-key-auth')
  })

  it('metadata declares all six resources available', () => {
    expect([...metadata.availableResources].sort()).toEqual([
      'comment',
      'project',
      'tag',
      'task',
      'user',
      'workspace',
    ])
    expect(metadata.unavailableResources).toEqual([])
  })
})

describe('odoo-project request shape (JSON-2, Odoo 19)', () => {
  it('posts project.project search_read to /json/2 with the bearer key and database', async () => {
    const sent = fakeOdoo({ 'project.project': [project(1)] })
    const rows = await new OdooProjectAdapter().listProjects(CREDS, { page: 1, limit: 5 })
    rows.forEach((r) => ProjectSchema.parse(r))
    const [call] = calls(sent)
    expect(call!.path).toBe('/json/2/project.project/search_read')
    expect(call!.headers.get('authorization')).toBe(`bearer ${KEY}`)
    expect(call!.headers.get('x-odoo-database')).toBe('acme')
    expect(call!.body).toMatchObject({ domain: [], offset: 0, limit: 5, order: 'id asc' })
    expect(rows[0]).toMatchObject({ id: '1', workspaceId: '1', status: 'active' })
  })

  it("lists one project's tasks by project_id and maps 19.0 priority from the selection", async () => {
    const sent = fakeOdoo({
      'project.task': [task(1, 4), task(2, 9), task(3, 4, { priority: '3' })],
    })
    const rows = await new OdooProjectAdapter().listTasks(CREDS, '4', { page: 1, limit: 10 })
    rows.forEach((r) => TaskSchema.parse(r))
    expect(rows.map((r) => [r.id, r.priority, r.status])).toEqual([
      ['1', 'medium', 'in_progress'],
      ['3', 'urgent', 'in_progress'],
    ])
    const made = calls(sent)
    expect(made[0]!.path).toBe('/json/2/project.task/search_read')
    expect(made[0]!.body['domain']).toEqual([['project_id', '=', 4]])
    expect(made[0]!.body['fields']).toContain('state')
    expect(made[0]!.body['fields']).not.toContain('kanban_state')
    const selection = made.find((s) => s.path === '/json/2/project.task/fields_get')
    expect(selection!.body).toEqual({ attributes: ['selection'] })
  })

  it('asks for the priority selection once per database', async () => {
    const sent = fakeOdoo({ 'project.task': [task(1, 4)] })
    const a = new OdooProjectAdapter()
    await a.listTasks(CREDS, '4', { page: 1, limit: 10 })
    await a.getTask(CREDS, '1')
    expect(calls(sent).filter((s) => s.path.endsWith('/fields_get'))).toHaveLength(1)
  })

  it('reads a task by id with read', async () => {
    const sent = fakeOdoo({ 'project.task': [task(7, 4, { parent_id: [6, 'Parent'] })] })
    const t = TaskSchema.parse(await new OdooProjectAdapter().getTask(CREDS, '7'))
    expect(t).toMatchObject({ id: '7', parentId: '6', projectId: '4' })
    expect(calls(sent)[0]!.path).toBe('/json/2/project.task/read')
  })

  it("lists a task's comments from mail.message, comments only", async () => {
    const sent = fakeOdoo({
      'mail.message': [
        message(1, 'project.task', 21),
        message(2, 'project.task', 21, 'notification'),
        message(3, 'project.task', 22),
        message(4, 'crm.lead', 21),
      ],
    })
    const rows = await new OdooProjectAdapter().listComments(CREDS, '21', { page: 1, limit: 10 })
    rows.forEach((r) => CommentSchema.parse(r))
    expect(rows.map((r) => r.id)).toEqual(['1'])
    expect(rows[0]).toMatchObject({ taskId: '21', authorId: '2', body: 'Comment 1' })
    expect(calls(sent)[0]!.body['domain']).toEqual([
      ['model', '=', 'project.task'],
      ['res_id', '=', 21],
      ['message_type', '=', 'comment'],
    ])
  })

  it('getComment returns a task or project comment and 404s any other message', async () => {
    fakeOdoo({
      'mail.message': [
        message(1, 'project.task', 21),
        message(2, 'project.project', 4),
        message(3, 'crm.lead', 9),
        message(4, 'project.task', 21, 'notification'),
      ],
    })
    const a = new OdooProjectAdapter()
    expect(CommentSchema.parse(await a.getComment(CREDS, '1')).taskId).toBe('21')
    expect(CommentSchema.parse(await a.getComment(CREDS, '2')).projectId).toBe('4')
    await expect(a.getComment(CREDS, '3')).rejects.toMatchObject({ statusCode: 404 })
    await expect(a.getComment(CREDS, '4')).rejects.toMatchObject({ statusCode: 404 })
  })

  it('lists every tag whatever the workspace, since tags have no company', async () => {
    const sent = fakeOdoo({ 'project.tags': [{ id: 5, name: 'Internal', color: 3 }] })
    const a = new OdooProjectAdapter()
    const rows = await a.listTags(CREDS, '1', { page: 1, limit: 10 })
    rows.forEach((r) => TagSchema.parse(r))
    expect(rows.map((r) => r.name)).toEqual(['Internal'])
    expect(calls(sent)[0]!.body['domain']).toEqual([])
    expect(TagSchema.parse(await a.getTag(CREDS, '5')).name).toBe('Internal')
  })

  it('workspaces are companies', async () => {
    const sent = fakeOdoo({
      'res.company': [
        { id: 1, name: 'YourCompany', parent_id: false },
        { id: 2, name: 'Chicago', parent_id: [1, 'YourCompany'] },
      ],
    })
    const a = new OdooProjectAdapter()
    const rows = await a.listWorkspaces(CREDS, { page: 1, limit: 10 })
    rows.forEach((r) => WorkspaceSchema.parse(r))
    expect(rows.map((r) => r.name)).toEqual(['YourCompany', 'Chicago'])
    expect(calls(sent)[0]!.path).toBe('/json/2/res.company/search_read')
    expect(WorkspaceSchema.parse(await a.getWorkspace(CREDS, '2')).metadata).toEqual({
      parentCompanyId: '1',
    })
  })

  it("users are a company's internal users", async () => {
    const sent = fakeOdoo({
      'res.users': [user(2, false, [1]), user(3, true, [1]), user(4, false, [2])],
    })
    const a = new OdooProjectAdapter()
    const rows = await a.listUsers(CREDS, '1', { page: 1, limit: 10 })
    rows.forEach((r) => UserSchema.parse(r))
    expect(rows.map((r) => r.id)).toEqual(['2'])
    expect(calls(sent)[0]!.body['domain']).toEqual([
      ['share', '=', false],
      ['company_ids', 'in', [1]],
    ])
    expect(UserSchema.parse(await a.getUser(CREDS, '4')).workspaceIds).toEqual(['2'])
  })
})

describe('odoo-project on Odoo 14–18 (RPC)', () => {
  it('talks /jsonrpc execute_kw and reads the 14.0 field set', async () => {
    const sent = fakeOdoo({
      'project.project': [project(1)],
      'project.task': [task(1, 1, { kanban_state: 'done' }), task(2, 1, { is_closed: true })],
    })
    const a = new OdooProjectAdapter()
    const projects = await a.listProjects(RPC_CREDS, { page: 1, limit: 10 })
    projects.forEach((r) => ProjectSchema.parse(r))
    expect(projects[0]!.metadata['lastUpdateStatus']).toBeUndefined()

    const tasks = await a.listTasks(RPC_CREDS, '1', { page: 1, limit: 10 })
    tasks.forEach((r) => TaskSchema.parse(r))
    // 14.0: no `state`; kanban_state 'done' (Ready) is in review, a closing stage is closed;
    // priority '1' is 'Important' of two, so high; one assignee from user_id.
    expect(tasks.map((t) => [t.status, t.priority, t.assigneeIds])).toEqual([
      ['in_review', 'high', ['2']],
      ['closed', 'high', ['2']],
    ])
    const made = calls(sent)
    expect(made.map((s) => s.path)).toContain('rpc:project.task/search_read')
    const taskRead = made.find((s) => s.path === 'rpc:project.task/search_read')!
    const fields = (taskRead.body['kw'] as Record<string, unknown>)['fields'] as string[]
    expect(fields).toContain('kanban_state')
    expect(fields).not.toContain('state')
    expect(fields).not.toContain('user_ids')
    expect(made.map((s) => s.path)).toContain('rpc:project.task/fields_get')
  })

  it('reads comments, tags, workspaces and users over RPC', async () => {
    fakeOdoo({
      'mail.message': [message(1, 'project.task', 21)],
      'project.tags': [{ id: 5, name: 'Internal', color: 3 }],
      'res.company': [{ id: 1, name: 'YourCompany', parent_id: false }],
      'res.users': [user(2, false, [1])],
    })
    const a = new OdooProjectAdapter()
    ;(await a.listComments(RPC_CREDS, '21', { page: 1, limit: 10 })).forEach((r) =>
      CommentSchema.parse(r),
    )
    ;(await a.listTags(RPC_CREDS, '1', { page: 1, limit: 10 })).forEach((r) => TagSchema.parse(r))
    ;(await a.listWorkspaces(RPC_CREDS, { page: 1, limit: 10 })).forEach((r) =>
      WorkspaceSchema.parse(r),
    )
    const users = await a.listUsers(RPC_CREDS, '1', { page: 1, limit: 10 })
    users.forEach((r) => UserSchema.parse(r))
    expect(users.map((u) => u.id)).toEqual(['2'])
  })
})

describe('odoo-project ids and limits', () => {
  it.each([
    ['getProject', 'abc'],
    ['getTask', '0'],
    ['getComment', '-1'],
    ['getTag', '1.5'],
    ['getWorkspace', 'x'],
    ['getUser', ''],
  ] as const)('%s(%j) is a 404 before any call', async (method, id) => {
    const sent = fakeOdoo({})
    const a = new OdooProjectAdapter()
    await expect(
      (a[method] as (c: unknown, id: string) => Promise<unknown>)(CREDS, id),
    ).rejects.toMatchObject({ statusCode: 404, code: 'NOT_FOUND' })
    expect(sent).toEqual([])
  })

  it('a parent id that is not an Odoo id is a 404 before any call', async () => {
    const sent = fakeOdoo({})
    const a = new OdooProjectAdapter()
    await expect(a.listTasks(CREDS, 'proj', { page: 1 })).rejects.toMatchObject({ statusCode: 404 })
    await expect(a.listComments(CREDS, 'x', { page: 1 })).rejects.toMatchObject({ statusCode: 404 })
    await expect(a.listUsers(CREDS, 'ws', { page: 1 })).rejects.toMatchObject({ statusCode: 404 })
    expect(sent).toEqual([])
  })

  it('a missing project is a 404', async () => {
    fakeOdoo({ 'project.project': [] })
    await expect(new OdooProjectAdapter().getProject(CREDS, '99')).rejects.toMatchObject({
      statusCode: 404,
    })
  })

  it('a fractional limit is floored; a limit below 1 is a 400 before any call', async () => {
    const sent = fakeOdoo({ 'project.project': [project(1), project(2), project(3)] })
    const a = new OdooProjectAdapter()
    await a.listProjects(CREDS, { page: 1, limit: 2.7 })
    expect(calls(sent)[0]!.body['limit']).toBe(2)
    sent.length = 0
    await expect(a.listProjects(CREDS, { page: 1, limit: 0 })).rejects.toMatchObject({
      statusCode: 400,
      code: 'VALIDATION',
    })
    expect(sent).toEqual([])
  })

  it('a key Odoo refuses is a 401', async () => {
    fakeOdoo({ 'project.project': [project(1)] })
    await expect(
      new OdooProjectAdapter().listProjects(
        { ...CREDS, accessToken: 'wrong' },
        { page: 1, limit: 5 },
      ),
    ).rejects.toMatchObject({ statusCode: 401 })
  })

  it('a connection from before the shared form is told to reconnect', async () => {
    fakeOdoo({})
    await expect(
      new OdooProjectAdapter().listProjects({ accessToken: KEY }, { page: 1, limit: 5 }),
    ).rejects.toMatchObject({ statusCode: 401, code: 'UNAUTHORIZED' })
  })
})

describe('odoo-project updated_after', () => {
  it('narrows a list to write_date >= the watermark, to the second, in the count too', async () => {
    const sent = fakeOdoo({
      'project.task': [
        task(1, 4, { write_date: '2026-01-01 23:59:59' }),
        task(2, 4, { write_date: '2026-01-02 00:00:00' }),
        task(3, 4, { write_date: '2026-03-01 08:00:00' }),
      ],
    })
    const rows = await new OdooProjectAdapter().listTasks(CREDS, '4', {
      page: 1,
      limit: 2,
      updatedAfter: new Date('2026-01-02T00:00:00.500Z'),
    })
    expect(rows.map((r) => r.id)).toEqual(['2', '3'])
    const filter = ['write_date', '>=', '2026-01-02 00:00:00']
    const made = calls(sent)
    const search = made.find((s) => s.path === '/json/2/project.task/search_read')!
    expect(search.body['domain']).toEqual([['project_id', '=', 4], filter])
    const count = made.find((s) => s.path === '/json/2/project.task/search_count')!
    expect(count.body['domain']).toEqual([['project_id', '=', 4], filter])
  })

  it('applies to every list, and not at all without a watermark', async () => {
    const sent = fakeOdoo({
      'project.project': [project(1)],
      'mail.message': [message(1, 'project.task', 21)],
    })
    const a = new OdooProjectAdapter()
    const updatedAfter = new Date('2026-01-02T00:00:00Z')
    expect(await a.listProjects(CREDS, { page: 1, limit: 10, updatedAfter })).toHaveLength(1)
    expect(await a.listComments(CREDS, '21', { page: 1, limit: 10, updatedAfter })).toHaveLength(1)
    await a.listProjects(CREDS, { page: 1, limit: 10 })
    const domains = calls(sent)
      .filter((s) => s.path.endsWith('/search_read'))
      .map((s) => s.body['domain'])
    expect(domains).toEqual([
      [['write_date', '>=', '2026-01-02 00:00:00']],
      [
        ['model', '=', 'project.task'],
        ['res_id', '=', 21],
        ['message_type', '=', 'comment'],
        ['write_date', '>=', '2026-01-02 00:00:00'],
      ],
      [],
    ])
  })
})

describe('odoo-project paging', () => {
  it('walks projects by offset/limit in id order and reports the total', async () => {
    fakeOdoo({ 'project.project': [3, 1, 5, 2, 4].map(project) })
    const a = new OdooProjectAdapter()
    const seen: string[] = []
    const metas: unknown[] = []
    for (let page = 1; page <= 3; page++) {
      const params = withPageSink({ page, limit: 2 })
      seen.push(...(await a.listProjects(CREDS, params)).map((r) => r.id))
      metas.push(readUpstreamPage(params))
    }
    expect(seen).toEqual(['1', '2', '3', '4', '5'])
    expect(metas).toEqual([
      { totalCount: 5, hasMore: true },
      { totalCount: 5, hasMore: true },
      { totalCount: 5, hasMore: false },
    ])
  })

  it("walks one project's tasks over RPC with the same offsets", async () => {
    const sent = fakeOdoo({
      'project.task': [task(4, 1), task(1, 1), task(9, 2), task(3, 1)],
    })
    const a = new OdooProjectAdapter()
    const seen: string[] = []
    for (let page = 1; page <= 2; page++) {
      const params = withPageSink({ page, limit: 2 })
      seen.push(...(await a.listTasks(RPC_CREDS, '1', params)).map((r) => r.id))
    }
    expect(seen).toEqual(['1', '3', '4'])
    const offsets = calls(sent)
      .filter((s) => s.path === 'rpc:project.task/search_read')
      .map((s) => (s.body['kw'] as Record<string, unknown>)['offset'])
    expect(offsets).toEqual([0, 2])
  })
})
