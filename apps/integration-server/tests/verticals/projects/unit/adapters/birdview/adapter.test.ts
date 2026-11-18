/**
 * Birdview PSA adapter: requests, paging and refusals against a fake that
 * honours ONLY the parameters Birdview documents.
 *
 * Source: the OpenAPI 3.0 document Birdview's Swagger UI serves,
 * https://app.go.easyprojects.net/api/swagger/v2/swagger.json. Every list
 * takes "Skip" ("Number of records to skip.") and "Take" ("Number of records
 * to take.") and answers {"Items": [...]}, with no total. The help centre
 * (https://help.birdviewpsa.com/hc/en-us/articles/38116720932749): "By default,
 * the number of returned items requested by a GET query is limited to 100 ...
 * Skip = (pageNumber - 1) * Take ... until the response returns fewer than 100
 * items (signaling the last page)." The fake caps Take at 100, so a request
 * for more is served short, the way an undocumented cap would.
 */
import { afterEach, describe, expect, it } from 'vitest'
import axios, { type AxiosAdapter, type InternalAxiosRequestConfig } from 'axios'
import { readUpstreamPage, withPageSink, type QueryParams } from '@opensteward/shared'
import { BirdviewAdapter } from '../../../../../../src/verticals/projects/adapters/birdview/index'
import { ProjectSchema } from '../../../../../../src/verticals/projects/schema/project'
import { TaskSchema } from '../../../../../../src/verticals/projects/schema/task'
import { UserSchema } from '../../../../../../src/verticals/projects/schema/user'

const ORIGIN = 'https://acme.go.easyprojects.net'
const PROJECT_ID = '12'
const SERVER_CAP = 100

/** Query parameters the spec declares, per path. */
const DOCUMENTED: Record<string, Set<string>> = {
  '/api/v2/projects': new Set([
    'Ids',
    'IncludeDisabledProjectMembers',
    'IncludeGuestProjectMembers',
    'IncludeTemplates',
    'IncludeDrafts',
    'IncludeCompleted',
    'OnlyTemplates',
    'CanManageProjectMembers',
    'StatusIds',
    'PortfolioIds',
    'CustomerIds',
    'PrioritiesIds',
    'SpaceIds',
    'CreatorIds',
    'StartDateFrom',
    'StartDateTo',
    'EndDateFrom',
    'EndDateTo',
    'CreationDateFrom',
    'CreationDateTo',
    'ActualCompletionDateFrom',
    'ActualCompletionDateTo',
    'LastModificationDateFrom',
    'LastModificationDateTo',
    'CustomFieldAlias',
    'CustomFieldValue',
    'CustomFieldExactMatch',
    'IncludePlainTextDescription',
    'Text',
    'OrderBy',
    'Direction',
    'Skip',
    'Take',
  ]),
  '/api/v2/tasks': new Set([
    'Ids',
    'ParentTaskId',
    'IncludeTasksFromDraftProjects',
    'IncludeTasksFromTemplateProjects',
    'IncludeTasksFromCompletedProjects',
    'TaskTypes',
    'ProjectId',
    'IsBilled',
    'IsMilestone',
    'HasChild',
    'ProjectIds',
    'TaskStatusIds',
    'PrioritiesIds',
    'CreatorIds',
    'BillingTypes',
    'StartDateFrom',
    'StartDateTo',
    'EndDateFrom',
    'EndDateTo',
    'CreationDateFrom',
    'CreationDateTo',
    'ActualCompletionDateFrom',
    'ActualCompletionDateTo',
    'LastModificationDateFrom',
    'LastModificationDateTo',
    'CustomFieldAlias',
    'CustomFieldValue',
    'CustomFieldExactMatch',
    'IncludePlainTextDescription',
    'Text',
    'OrderBy',
    'Direction',
    'Skip',
    'Take',
  ]),
  '/api/v2/users': new Set([
    'Ids',
    'IsEnabled',
    'CanLogin',
    'Text',
    'LastModificationDateFrom',
    'LastModificationDateTo',
    'OrderBy',
    'Direction',
    'Skip',
    'Take',
  ]),
  '/api/v2/tasks/assignees': new Set([
    'TaskAssigneeIds',
    'TaskIds',
    'UserIds',
    'ProjectMemberIds',
    'UnnamedResourceIds',
    'WorkIsDone',
    'WorkIsDoneSetDateFrom',
    'WorkIsDoneSetDateTo',
    'OrderBy',
    'Direction',
    'Skip',
    'Take',
  ]),
  '/api/v2/lists/projectstatuses': new Set(['Ids', 'TreatAsCompleted']),
  '/api/v2/lists/taskstatuses': new Set([
    'TaskTypeId',
    'Ids',
    'TreatAsCompleted',
    'TreatAsHold',
    'TreatAsInactive',
  ]),
}

interface World {
  projects?: number
  tasks?: number
  users?: number
  /** Assignee rows per task (users 1..k, plus one unnamed resource). */
  assigneesPerTask?: number
  /** Repeat each task's first user in a second assignee row. */
  duplicateAssignee?: boolean
  /** Answer lists with {Data: [...]} instead of the documented {Items: [...]}. */
  wrongEnvelope?: boolean
}

let seen: URL[] = []
const realAdapter = axios.defaults.adapter

afterEach(() => {
  axios.defaults.adapter = realAdapter
})

function httpError(status: number, body: unknown): Error {
  return Object.assign(new Error(`HTTP ${status}`), { response: { status, data: body } })
}

const nums = (n: number): number[] => Array.from({ length: n }, (_, i) => i + 1)
const strs = (n: number): string[] => nums(n).map(String)

function project(id: number): Record<string, unknown> {
  return { ProjectId: id, Name: `p${id}`, StatusId: 2, SpaceId: null, IsArchived: false }
}
function task(id: number): Record<string, unknown> {
  return {
    TaskId: id,
    Name: `t${id}`,
    ProjectId: Number(PROJECT_ID),
    TaskStatusId: 7,
    PriorityId: 1,
  }
}
function user(id: number): Record<string, unknown> {
  return { UserId: id, Name: `U ${id}`, EMail: `u${id}@example.com`, Enabled: true }
}
function assignees(w: World): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = []
  let seq = 1
  for (const t of nums(w.tasks ?? 0)) {
    for (const u of nums(w.assigneesPerTask ?? 0))
      out.push({ TaskAssigneeId: seq++, TaskId: t, UserId: u, WorkIsDone: false })
    if (w.duplicateAssignee)
      out.push({ TaskAssigneeId: seq++, TaskId: t, UserId: 1, WorkIsDone: true })
    if ((w.assigneesPerTask ?? 0) > 0)
      out.push({ TaskAssigneeId: seq++, TaskId: t, UserId: null, UnnamedResourceId: 1 })
  }
  return out
}

function fake(w: World): void {
  seen = []
  const transport = async (config: InternalAxiosRequestConfig) => {
    const url = new URL(axios.getUri(config))
    seen.push(url)
    if (url.origin !== ORIGIN) throw httpError(404, { message: `no host ${url.origin}` })
    // "Authorization: Bearer <access_token>" (help article 38116720932749).
    if (config.headers.get('Authorization') !== 'Bearer tk')
      throw httpError(401, { message: 'no bearer token' })
    const q = url.searchParams
    const path = url.pathname
    let data: unknown
    const allowed = DOCUMENTED[path]
    if (allowed) {
      for (const k of q.keys())
        if (!allowed.has(k)) throw httpError(400, { message: `unknown ${k}` })
      const idsFilter = q.getAll('Ids').map(Number)
      let all: Array<Record<string, unknown>>
      if (path === '/api/v2/projects') all = nums(w.projects ?? 0).map(project)
      else if (path === '/api/v2/tasks')
        all = q.get('ProjectId') === PROJECT_ID ? nums(w.tasks ?? 0).map(task) : []
      else if (path === '/api/v2/users') all = nums(w.users ?? 0).map(user)
      else if (path === '/api/v2/tasks/assignees') {
        const taskIds = new Set(q.getAll('TaskIds').map(Number))
        all = assignees(w).filter((a) => taskIds.size === 0 || taskIds.has(a.TaskId as number))
      } else if (path === '/api/v2/lists/projectstatuses')
        all = [
          {
            ProjectStatusId: 2,
            Name: 'Open',
            TreatAsCompleted: false,
            IsDraftStatus: false,
            IsTemplate: false,
          },
          {
            ProjectStatusId: 4,
            Name: 'Done',
            TreatAsCompleted: true,
            IsDraftStatus: false,
            IsTemplate: false,
          },
        ].filter((s) => idsFilter.length === 0 || idsFilter.includes(s.ProjectStatusId))
      else
        all = [
          {
            TaskStatusId: 7,
            Name: 'In work',
            TreatAsCompleted: false,
            TreatAsHold: false,
            TreatAsInactive: false,
          },
          {
            TaskStatusId: 8,
            Name: 'Done',
            TreatAsCompleted: true,
            TreatAsHold: false,
            TreatAsInactive: false,
          },
        ].filter((s) => idsFilter.length === 0 || idsFilter.includes(s.TaskStatusId))
      if (!path.includes('/lists/')) {
        const skip = Number(q.get('Skip') ?? 0)
        const take = Math.min(Number(q.get('Take') ?? SERVER_CAP), SERVER_CAP)
        all = all.slice(skip, skip + take)
      }
      data = w.wrongEnvelope ? { Data: all } : { Items: all }
    } else if (path === `/api/v2/projects/${PROJECT_ID}`) {
      data = { ...project(Number(PROJECT_ID)), StatusId: 4 }
    } else if (path === '/api/v2/tasks/5') {
      data = { ...task(5), TaskStatusId: 8 }
    } else if (path === '/api/v2/tasks/5/assignees') {
      if ([...q.keys()].length > 0) throw httpError(400, { message: 'no params documented' })
      data = { Items: assignees({ tasks: 5, assigneesPerTask: 2 }).filter((a) => a.TaskId === 5) }
    } else if (path === '/api/v2/users/3') {
      data = user(3)
    } else {
      throw httpError(404, { message: `no route ${path}` })
    }
    return { data, status: 200, statusText: 'OK', headers: {}, config, request: {} }
  }
  axios.defaults.adapter = transport as unknown as AxiosAdapter
}

const adapter = new BirdviewAdapter()
const creds = {
  accessToken: 'tk',
  extra: { account: 'acme', clientId: 'c', clientSecret: 's', userId: '7' },
}

type Method = 'listProjects' | 'listTasks' | 'listUsers'

async function call(method: Method, params: QueryParams): Promise<string[]> {
  switch (method) {
    case 'listProjects':
      return (await adapter.listProjects(creds, params)).map((r) => r.id)
    case 'listTasks':
      return (await adapter.listTasks(creds, PROJECT_ID, params)).map((r) => r.id)
    case 'listUsers':
      return (await adapter.listUsers(creds, 'ignored', params)).map((r) => r.id)
  }
}

async function page(method: Method, p: number, limit: number) {
  const params = withPageSink({ page: p, limit })
  const ids = await call(method, params)
  const meta = readUpstreamPage(params)
  return { ids, hasMore: meta?.hasMore, pageSize: meta?.pageSize }
}

const WORLDS: Array<[Method, (n: number) => World]> = [
  ['listProjects', (n) => ({ projects: n })],
  ['listTasks', (n) => ({ tasks: n, assigneesPerTask: 1 })],
  ['listUsers', (n) => ({ users: n })],
]

describe.each(WORLDS)('birdview %s pages by Skip/Take', (method, world) => {
  it.each([3, 10])(
    'serves 2L+1 rows over pages 1, 2, 3 each once, hasMore exact (L=%i)',
    async (L) => {
      fake(world(2 * L + 1))
      const all = strs(2 * L + 1)
      expect(await page(method, 1, L)).toEqual({
        ids: all.slice(0, L),
        hasMore: undefined,
        pageSize: undefined,
      })
      expect(await page(method, 2, L)).toEqual({
        ids: all.slice(L, 2 * L),
        hasMore: undefined,
        pageSize: undefined,
      })
      expect(await page(method, 3, L)).toEqual({
        ids: all.slice(2 * L),
        hasMore: false,
        pageSize: undefined,
      })
      const primary = seen.filter(
        (u) =>
          DOCUMENTED[u.pathname] && u.searchParams.has('Skip') && !u.pathname.includes('assignees'),
      )
      expect(primary.map((u) => [u.searchParams.get('Skip'), u.searchParams.get('Take')])).toEqual([
        ['0', String(L)],
        [String(L), String(L)],
        [String(2 * L), String(L)],
      ])
    },
  )

  it('asks for at most 100 rows, reports that size, and strides by it', async () => {
    fake(world(234))
    const out: string[] = []
    for (let p = 1; p < 10; p++) {
      const got = await page(method, p, 500)
      expect(got.pageSize).toBe(100)
      out.push(...got.ids)
      if (got.hasMore === false) break
    }
    expect(out).toEqual(strs(234))
  })
})

describe('birdview request shapes', () => {
  it('listProjects resolves StatusId through /lists/projectstatuses?Ids= and parses', async () => {
    fake({ projects: 2 })
    const rows = await adapter.listProjects(creds, withPageSink({ page: 1, limit: 10 }))
    rows.forEach((r) => ProjectSchema.parse(r))
    expect(rows.map((r) => [r.id, r.status, r.workspaceId])).toEqual([
      ['1', 'active', 'acme'],
      ['2', 'active', 'acme'],
    ])
    const st = seen.find((u) => u.pathname === '/api/v2/lists/projectstatuses')
    expect(st?.searchParams.getAll('Ids')).toEqual(['2'])
  })

  it('listTasks filters by ProjectId and attaches assignee UserIds from TaskIds', async () => {
    fake({ tasks: 3, assigneesPerTask: 2 })
    const rows = await adapter.listTasks(creds, PROJECT_ID, withPageSink({ page: 1, limit: 10 }))
    rows.forEach((r) => TaskSchema.parse(r))
    expect(rows.map((r) => [r.id, r.projectId, r.status, r.assigneeIds])).toEqual([
      ['1', PROJECT_ID, 'open', ['1', '2']],
      ['2', PROJECT_ID, 'open', ['1', '2']],
      ['3', PROJECT_ID, 'open', ['1', '2']],
    ])
    const tasks = seen.find((u) => u.pathname === '/api/v2/tasks')
    expect(tasks?.searchParams.get('ProjectId')).toBe(PROJECT_ID)
    const asg = seen.find((u) => u.pathname === '/api/v2/tasks/assignees')
    expect(asg?.searchParams.getAll('TaskIds')).toEqual(['1', '2', '3'])
  })

  it('listTasks walks the assignee list past one 100-row page', async () => {
    // 60 tasks × (2 users + 1 unnamed resource) = 180 assignee rows.
    fake({ tasks: 60, assigneesPerTask: 2 })
    const rows = await adapter.listTasks(creds, PROJECT_ID, withPageSink({ page: 1, limit: 100 }))
    expect(rows).toHaveLength(60)
    expect(rows.every((r) => r.assigneeIds.join() === '1,2')).toBe(true)
    const skips = seen
      .filter((u) => u.pathname === '/api/v2/tasks/assignees')
      .map((u) => u.searchParams.get('Skip'))
    expect(skips).toEqual(['0', '100'])
  })

  it('getProject reads the bare ProjectModel', async () => {
    fake({})
    const p = ProjectSchema.parse(await adapter.getProject(creds, PROJECT_ID))
    expect([p.id, p.status]).toEqual([PROJECT_ID, 'completed'])
  })

  it('getTask reads the bare TaskModel and /tasks/{id}/assignees', async () => {
    fake({})
    const t = TaskSchema.parse(await adapter.getTask(creds, '5'))
    expect([t.id, t.status, t.assigneeIds]).toEqual(['5', 'closed', ['1', '2']])
  })

  it('listUsers reads GET /api/v2/users, not task assignees', async () => {
    fake({ users: 2 })
    const rows = await adapter.listUsers(creds, 'ignored', withPageSink({ page: 1, limit: 10 }))
    rows.forEach((r) => UserSchema.parse(r))
    expect(rows.map((r) => [r.id, r.name, r.email])).toEqual([
      ['1', 'U 1', 'u1@example.com'],
      ['2', 'U 2', 'u2@example.com'],
    ])
    expect(seen.map((u) => u.pathname)).toEqual(['/api/v2/users'])
  })

  it('getUser reads GET /api/v2/users/{id}', async () => {
    fake({})
    const u = UserSchema.parse(await adapter.getUser(creds, '3'))
    expect([u.id, u.name]).toEqual(['3', 'U 3'])
  })

  it('listProjects asks for completed and draft projects, not templates', async () => {
    fake({ projects: 1 })
    await adapter.listProjects(creds, withPageSink({ page: 1, limit: 10 }))
    const q = seen.find((u) => u.pathname === '/api/v2/projects')!.searchParams
    expect([q.get('IncludeCompleted'), q.get('IncludeDrafts'), q.get('IncludeTemplates')]).toEqual([
      'true',
      'true',
      'false',
    ])
  })

  it('listTasks asks for tasks of completed, draft and template projects', async () => {
    fake({ tasks: 1 })
    await adapter.listTasks(creds, PROJECT_ID, withPageSink({ page: 1, limit: 10 }))
    const q = seen.find((u) => u.pathname === '/api/v2/tasks')!.searchParams
    expect([
      q.get('IncludeTasksFromCompletedProjects'),
      q.get('IncludeTasksFromDraftProjects'),
      q.get('IncludeTasksFromTemplateProjects'),
    ]).toEqual(['true', 'true', 'true'])
  })

  it('sends Take=100 when the caller gives no limit', async () => {
    fake({ users: 1 })
    await adapter.listUsers(creds, 'ignored', withPageSink({ page: 1 }))
    expect(seen[0]!.searchParams.get('Take')).toBe('100')
  })

  it('lists a user once per task even when two assignee rows name them', async () => {
    fake({ tasks: 1, assigneesPerTask: 2, duplicateAssignee: true })
    const rows = await adapter.listTasks(creds, PROJECT_ID, withPageSink({ page: 1, limit: 10 }))
    expect(rows[0]!.assigneeIds).toEqual(['1', '2'])
  })

  it('rejects a list response without an Items array instead of serving it as empty', async () => {
    fake({ users: 2, wrongEnvelope: true })
    await expect(
      adapter.listUsers(creds, 'ignored', withPageSink({ page: 1, limit: 10 })),
    ).rejects.toThrow(/no Items array/)
  })

  it.each(['evil.example#', 'a/b', 'x@y', 'acme.other'])(
    'refuses account slug %j before any request',
    async (account) => {
      fake({ projects: 1 })
      await expect(
        adapter.listProjects(
          { accessToken: 'tk', extra: { account } },
          withPageSink({ page: 1, limit: 10 }),
        ),
      ).rejects.toMatchObject({ code: 'INVALID_ACCOUNT' })
      expect(seen).toHaveLength(0)
    },
  )

  it('requires the account slug instead of guessing a host', async () => {
    fake({ projects: 1 })
    await expect(
      adapter.listProjects({ accessToken: 'tk' }, withPageSink({ page: 1, limit: 10 })),
    ).rejects.toThrow(/account slug/)
    expect(seen).toHaveLength(0)
  })
})

describe('birdview listComments', () => {
  it('refuses with 501 NOT_SUPPORTED and sends no request', async () => {
    fake({})
    await expect(
      adapter.listComments(creds, '5', withPageSink({ page: 1, limit: 10 })),
    ).rejects.toMatchObject({
      statusCode: 501,
      code: 'NOT_SUPPORTED',
    })
    expect(seen).toHaveLength(0)
  })
})
