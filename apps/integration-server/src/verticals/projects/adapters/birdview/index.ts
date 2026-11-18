/**
 * Birdview PSA adapter for the projects vertical.
 *
 * Birdview PSA (formerly Easy Projects) serves REST API v2 on the customer's
 * own subdomain, https://{account}.go.easyprojects.net/api/v2, authenticated
 * with an OAuth 2.0 client-credentials token scoped to one Birdview user
 * (see auth.ts). Every path, parameter and field below is taken from the
 * OpenAPI document Birdview's Swagger UI serves,
 * https://app.go.easyprojects.net/api/swagger/v2/swagger.json.
 *
 * Canonical resources:
 *   - Projects  GET /api/v2/projects (Skip/Take, PROJECT_FILTERS), GET /api/v2/projects/{id}
 *   - Tasks     GET /api/v2/tasks?ProjectId= (Skip/Take, TASK_FILTERS), GET /api/v2/tasks/{id};
 *               assignees from GET /api/v2/tasks/assignees?TaskIds= and
 *               GET /api/v2/tasks/{taskId}/assignees
 *   - Users     GET /api/v2/users (Skip/Take), GET /api/v2/users/{id}
 *   - Statuses  GET /api/v2/lists/projectstatuses and /lists/taskstatuses?Ids=
 *               resolve the account-defined StatusId / TaskStatusId.
 *
 * Refused (501): listComments. "/api/v2/tasks/{id}/messages" and
 * "/api/v2/projects/{id}/messages" are declared with only a `post` operation;
 * v2 has no way to read messages back.
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: tag       — Birdview PSA has no first-class tag/label resource; the platform has no /tags endpoint in v2.
 * Unavailable: workspace — Spaces have no list/get endpoint in v2; SpaceId is a filter-only field on projects/tasks.
 *
 * Paging: every list takes "Skip" ("Number of records to skip.") and "Take"
 * ("Number of records to take."), and returns `{"Items": [...]}` with no
 * total. Birdview's help centre: "Skip = (pageNumber - 1) * Take ... until the
 * response returns fewer than 100 items (signaling the last page)."
 */
import { pageOffset, reportUpstreamPage } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import type { ProjectsAdapter } from '../../adapter/interface'
import type { Project } from '../../schema/project'
import type { Task } from '../../schema/task'
import type { Comment } from '../../schema/comment'
import type { User } from '../../schema/user'

import {
  buildAuthUrl,
  CREDENTIAL_FIELDS,
  exchangeCode as bvExchange,
  exchangeCredentials as bvExchangeCredentials,
  refreshCredentials as bvRefresh,
} from './auth'
import { accountOf, BirdviewClient } from './client'
import { MAX_TAKE } from './constants'

import {
  transformProject,
  type RawBirdviewProject,
  type RawBirdviewProjectStatus,
} from './transform/project'
import { transformTask, type RawBirdviewTask, type RawBirdviewTaskStatus } from './transform/task'
import { transformUser, type RawBirdviewUser } from './transform/user'

/** Every v2 list response: `{"Items": [...]}` (ProjectsResponse, TasksResponse, ...). */
interface ItemsResponse<T> {
  Items?: T[]
}

/** `TaskAssigneeModel`: {TaskAssigneeId, TaskId, UserId (nullable), ...}. */
interface RawBirdviewTaskAssignee {
  TaskAssigneeId: number
  TaskId: number
  UserId?: number | null
  [key: string]: unknown
}

/**
 * GET /api/v2/projects declares `IncludeCompleted`, `IncludeDrafts` and
 * `IncludeTemplates` as nullable booleans with no documented default. Leaving
 * them unset would let an undocumented default decide whether completed
 * projects are in the collection, and a short last page is reported as its
 * end, so a sync would drop cached rows the default hid. They are sent
 * explicitly: completed and draft projects are real projects (the transform
 * maps them to 'completed' / 'unknown'); templates are blueprints, not
 * projects, and are left out.
 */
const PROJECT_FILTERS = {
  IncludeCompleted: true,
  IncludeDrafts: true,
  IncludeTemplates: false,
} as const

/**
 * GET /api/v2/tasks declares `IncludeTasksFromCompletedProjects`,
 * `IncludeTasksFromDraftProjects` and `IncludeTasksFromTemplateProjects`, also
 * with no documented default. listTasks names its project with `ProjectId`, so
 * all three are sent as true: the caller's chosen project is served whatever
 * state it is in.
 */
const TASK_FILTERS = {
  IncludeTasksFromCompletedProjects: true,
  IncludeTasksFromDraftProjects: true,
  IncludeTasksFromTemplateProjects: true,
} as const

function itemsOf<T>(res: ItemsResponse<T>, path: string): T[] {
  if (!Array.isArray(res?.Items)) {
    throw new Error(`Birdview PSA ${path} returned no Items array`)
  }
  return res.Items
}

export class BirdviewAdapter implements ProjectsAdapter {
  readonly platform = 'birdview'
  readonly version = '0.2.0'

  credentialFields = () => CREDENTIAL_FIELDS
  exchangeCredentials = bvExchangeCredentials

  getAuthUrl(_state: string): string {
    return buildAuthUrl(_state)
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    return bvExchange(_code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return bvRefresh(credentials)
  }

  /**
   * One caller page of a Skip/Take list: `Take` is the caller's limit clamped
   * to MAX_TAKE, and `Skip` strides by that same size, so each row is served
   * once. A size below the caller's limit is reported, and a short page is
   * reported as the end, which is the end signal Birdview documents.
   */
  private async listPage<T>(
    client: BirdviewClient,
    path: string,
    params: QueryParams,
    filters: Record<string, unknown> = {},
  ): Promise<T[]> {
    const limit =
      typeof params.limit === 'number' && Number.isFinite(params.limit) && params.limit >= 1
        ? Math.floor(params.limit)
        : MAX_TAKE
    const take = Math.min(limit, MAX_TAKE)
    const res = await client.get<ItemsResponse<T>>(path, {
      ...filters,
      Skip: pageOffset(params, take),
      Take: take,
    })
    const items = itemsOf(res, path)
    reportUpstreamPage(params, {
      ...(take < limit ? { pageSize: take } : {}),
      ...(items.length < take ? { hasMore: false } : {}),
    })
    return items
  }

  /**
   * Status rows for the given ids from a /lists endpoint (which takes `Ids`
   * and no Skip/Take). Asked only for the ids on the page in hand, never more
   * than MAX_TAKE of them.
   */
  private async statuses<S extends Record<string, unknown>>(
    client: BirdviewClient,
    path: string,
    idKey: keyof S & string,
    ids: Array<number | null | undefined>,
  ): Promise<Map<number, S>> {
    const wanted = [...new Set(ids.filter((v): v is number => typeof v === 'number'))]
    const out = new Map<number, S>()
    if (wanted.length === 0) return out
    const res = await client.get<ItemsResponse<S>>(path, { Ids: wanted })
    for (const row of itemsOf(res, path)) {
      const id = row[idKey]
      if (typeof id === 'number') out.set(id, row)
    }
    return out
  }

  // ── Projects ───────────────────────────────────────────────────────────────

  async listProjects(credentials: Credentials, params: QueryParams): Promise<Project[]> {
    const account = accountOf(credentials)
    const client = new BirdviewClient(credentials)
    const rows = await this.listPage<RawBirdviewProject>(
      client,
      '/projects',
      params,
      PROJECT_FILTERS,
    )
    const statuses = await this.statuses<RawBirdviewProjectStatus>(
      client,
      '/lists/projectstatuses',
      'ProjectStatusId',
      rows.map((r) => r.StatusId),
    )
    return rows.map((r) =>
      transformProject(r, account, r.StatusId != null ? statuses.get(r.StatusId) : undefined),
    )
  }

  async getProject(credentials: Credentials, id: string): Promise<Project> {
    const account = accountOf(credentials)
    const client = new BirdviewClient(credentials)
    const raw = await client.get<RawBirdviewProject>(`/projects/${encodeURIComponent(id)}`)
    const statuses = await this.statuses<RawBirdviewProjectStatus>(
      client,
      '/lists/projectstatuses',
      'ProjectStatusId',
      [raw.StatusId],
    )
    return transformProject(
      raw,
      account,
      raw.StatusId != null ? statuses.get(raw.StatusId) : undefined,
    )
  }

  // ── Tasks ──────────────────────────────────────────────────────────────────

  /**
   * UserIds assigned to each task, from GET /api/v2/tasks/assignees ("Gets all
   * task assignees visible to current user"), filtered by `TaskIds` and walked
   * with Skip/Take to a short page, since one task can carry several rows.
   * Rows with a null UserId are unnamed resources, not users.
   */
  private async assigneesOf(
    client: BirdviewClient,
    taskIds: number[],
  ): Promise<Map<number, string[]>> {
    const out = new Map<number, string[]>()
    if (taskIds.length === 0) return out
    for (let skip = 0; ; skip += MAX_TAKE) {
      const res = await client.get<ItemsResponse<RawBirdviewTaskAssignee>>('/tasks/assignees', {
        TaskIds: taskIds,
        Skip: skip,
        Take: MAX_TAKE,
      })
      const rows = itemsOf(res, '/tasks/assignees')
      for (const row of rows) addAssignee(out, row)
      if (rows.length < MAX_TAKE) return out
    }
  }

  async listTasks(
    credentials: Credentials,
    projectId: string,
    params: QueryParams,
  ): Promise<Task[]> {
    const client = new BirdviewClient(credentials)
    const rows = await this.listPage<RawBirdviewTask>(client, '/tasks', params, {
      ProjectId: projectId,
      ...TASK_FILTERS,
    })
    const [assignees, statuses] = await Promise.all([
      this.assigneesOf(
        client,
        rows.map((r) => r.TaskId),
      ),
      this.statuses<RawBirdviewTaskStatus>(
        client,
        '/lists/taskstatuses',
        'TaskStatusId',
        rows.map((r) => r.TaskStatusId),
      ),
    ])
    return rows.map((r) =>
      transformTask(
        r,
        assignees.get(r.TaskId) ?? [],
        r.TaskStatusId != null ? statuses.get(r.TaskStatusId) : undefined,
      ),
    )
  }

  async getTask(credentials: Credentials, id: string): Promise<Task> {
    const client = new BirdviewClient(credentials)
    const path = `/tasks/${encodeURIComponent(id)}`
    const raw = await client.get<RawBirdviewTask>(path)
    const [assigneeRes, statuses] = await Promise.all([
      client.get<ItemsResponse<RawBirdviewTaskAssignee>>(`${path}/assignees`),
      this.statuses<RawBirdviewTaskStatus>(client, '/lists/taskstatuses', 'TaskStatusId', [
        raw.TaskStatusId,
      ]),
    ])
    const assignees = new Map<number, string[]>()
    for (const row of itemsOf(assigneeRes, `${path}/assignees`)) addAssignee(assignees, row)
    return transformTask(
      raw,
      assignees.get(raw.TaskId) ?? [],
      raw.TaskStatusId != null ? statuses.get(raw.TaskStatusId) : undefined,
    )
  }

  // ── Comments ───────────────────────────────────────────────────────────────

  async listComments(
    _credentials: Credentials,
    _taskId: string,
    _params: QueryParams,
  ): Promise<Comment[]> {
    throw Object.assign(
      new Error(
        'Birdview PSA cannot list comments: its v2 API declares "/api/v2/tasks/{id}/messages" (and "/api/v2/projects/{id}/messages") with only a "post" operation, and no endpoint reads messages back.',
      ),
      { statusCode: 501, code: 'NOT_SUPPORTED' },
    )
  }

  // ── Users ──────────────────────────────────────────────────────────────────
  //
  // Users are account-wide ("Gets all users visible to current user"); the
  // canonical workspaceId has no Birdview counterpart and is not sent.

  async listUsers(
    credentials: Credentials,
    _workspaceId: string,
    params: QueryParams,
  ): Promise<User[]> {
    const client = new BirdviewClient(credentials)
    const rows = await this.listPage<RawBirdviewUser>(client, '/users', params)
    return rows.map(transformUser)
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    const raw = await new BirdviewClient(credentials).get<RawBirdviewUser>(
      `/users/${encodeURIComponent(id)}`,
    )
    return transformUser(raw)
  }
}

function addAssignee(out: Map<number, string[]>, row: RawBirdviewTaskAssignee): void {
  if (row.UserId == null) return
  const list = out.get(row.TaskId) ?? []
  const uid = String(row.UserId)
  if (!list.includes(uid)) list.push(uid)
  out.set(row.TaskId, list)
}
