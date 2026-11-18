/**
 * Planfix adapter for the projects vertical.
 *
 * Planfix exposes a per-account REST API at `https://{account}.planfix.com/rest`,
 * authenticated with a static HTTP Bearer token the primary admin mints under
 * Account management → API Access → REST API. There is no OAuth2
 * authorization-code flow for first-party API access, so credentials are
 * collected through the Connect Link form (account host + API token via
 * `customForm`). The token is stored as `accessToken`; the account host rides on
 * `credentials.extra.account` so the client can build the per-account base URL.
 *
 * Canonical mapping (Planfix's model is Account > Project > Task > Comment):
 *   - Projects ← projects   POST /project/list,                GET /project/{id}
 *   - Tasks    ← tasks       POST /task/list (project filter),  GET /task/{id}
 *   - Comments ← comments    POST /task/{id}/comments/list,     GET /comment/{id}
 *   - Users    ← employees   POST /user/list,                   GET /user/{id}
 *
 * Deliberately unsupported (the BaseAdapter default 501s them):
 *   - Tags       — Planfix has no freeform task-tag resource. Its "data tags"
 *                  are structured data-entry forms attached to comments, not the
 *                  label taxonomy the canonical Tag models; there is no
 *                  `/tag/list` endpoint.
 *   - Workspaces — Planfix is single-account: the account host *is* the
 *                  workspace, so there is no enumerable workspace resource.
 *
 * Webhooks: Planfix offers only outbound webhook notifications (account
 * automations posting to a URL) with no documented inbound signed-webhook a
 * connector registers and verifies per connection, so there is no webhook
 * verification/parsing here.
 *
 * Pagination: list methods are POSTs whose JSON body carries
 * `{ offset, pageSize, fields }`. `pageSize` is capped at 100; `fields` is a
 * comma-separated allow-list of the field names to return. List responses are
 * enveloped as `{ result: "success", <collection>: [...] }` with no total and
 * no next link, so a full page is the only next signal and a short page is
 * the end. Caller page N is sent as `offset = (N - 1) × pageSize`.
 */
// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: tag       — Planfix has no freeform task-tag resource; "data tags" are structured data-entry forms on comments, not a label taxonomy; no /tag/list endpoint.
// Unavailable: workspace — Planfix is single-account: the account host is the workspace; no enumerable workspace resource.
import { customForm, pageOffset, reportUpstreamPage } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import type { ProjectsAdapter } from '../../adapter/interface'
import type { Project } from '../../schema/project'
import type { Task } from '../../schema/task'
import type { Comment } from '../../schema/comment'
import type { User } from '../../schema/user'

import { buildAuthUrl, refreshCredentials as planfixRefresh } from './auth'
import { PlanfixClient } from './client'
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  TASK_FIELDS,
  PROJECT_FIELDS,
  COMMENT_FIELDS,
  USER_FIELDS,
  TOKEN_HELP_URL,
} from './constants'

import { transformProject, type RawPlanfixProject } from './transform/project'
import { transformTask, type RawPlanfixTask } from './transform/task'
import { transformComment, type RawPlanfixComment } from './transform/comment'
import { transformUser, type RawPlanfixUser } from './transform/user'

/** Numeric complex-task-filter type for "task belongs to project". */
const TASK_FILTER_TYPE_PROJECT = 5

/** Enveloped list/get responses: `{ result: "success", <collection>: [...] }`. */
interface ListResponse<T> {
  result?: string
  tasks?: T[]
  projects?: T[]
  comments?: T[]
  users?: T[]
}
interface TaskGetResponse {
  result?: string
  task?: RawPlanfixTask
}
interface ProjectGetResponse {
  result?: string
  project?: RawPlanfixProject
}
interface CommentGetResponse {
  result?: string
  comment?: RawPlanfixComment
}
interface UserGetResponse {
  result?: string
  user?: RawPlanfixUser
}

/**
 * Connect Link form: Planfix needs the account host (to build the per-account
 * base URL) and the REST API token. The token is stored as `accessToken`; the
 * account rides on `extra.account`.
 */
const CONNECT_FORM = customForm({
  fields: [
    {
      name: 'account',
      label: 'Account',
      type: 'text',
      placeholder: 'acme  (or acme.planfix.com)',
      required: true,
      helpText:
        'Your Planfix account subdomain — the {name} in https://{name}.planfix.com — or the full host.',
    },
    {
      name: 'apiKey',
      label: 'REST API token',
      type: 'password',
      required: true,
      helpText: `Generate a token as the primary admin under Account management → API Access → REST API. See ${TOKEN_HELP_URL}`,
    },
  ],
  async exchange(fields: Record<string, string>): Promise<Credentials> {
    const account = (fields['account'] ?? '').trim()
    const apiKey = (fields['apiKey'] ?? '').trim()
    if (!account) throw new Error('Account is required.')
    if (!apiKey) throw new Error('REST API token is required.')
    return { accessToken: apiKey, extra: { account } }
  },
})

export class PlanfixAdapter implements ProjectsAdapter {
  readonly platform = 'planfix'
  readonly version = '0.1.0'

  // Connect Link support — account host + REST API token form.
  credentialFields = CONNECT_FORM.credentialFields
  exchangeCredentials = CONNECT_FORM.exchangeCredentials

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    // No OAuth code flow — Connect Link uses exchangeCredentials. Treat the
    // supplied code as the raw API token for the BaseAdapter contract.
    return { accessToken: (code ?? '').trim() }
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return planfixRefresh(credentials)
  }

  private client(credentials: Credentials): PlanfixClient {
    return new PlanfixClient(credentials)
  }

  // Every list method pages at the requested size (clamped to 100) and
  // reports its end, so the router may ask for up to Planfix's maximum.
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  /**
   * One caller page of an offset-paged list. Planfix documents `offset`
   * ("Offset from beginning of list", minimum 0) and `pageSize` ("Size of
   * requested list", maximum 100) on every list body, and returns no total,
   * so a page shorter than the size sent is the last. A caller limit above
   * 100 is sent as 100 and the page reports that size, so the router judges
   * it (and strides the next offset) at 100.
   */
  private async listPage<R>(
    credentials: Credentials,
    path: string,
    collection: 'projects' | 'tasks' | 'comments' | 'users',
    body: Record<string, unknown>,
    params: QueryParams,
  ): Promise<R[]> {
    const limit = params.limit ?? DEFAULT_PAGE_SIZE
    const size = Math.max(1, Math.min(Math.floor(limit), MAX_PAGE_SIZE))
    const res = await this.client(credentials).post<ListResponse<R>>(path, {
      offset: pageOffset(params, size),
      pageSize: size,
      ...body,
    })
    const rows = res[collection]
    const list = Array.isArray(rows) ? rows : []
    reportUpstreamPage(params, {
      hasMore: list.length >= size,
      ...(size < limit ? { pageSize: size } : {}),
    })
    return list
  }

  // ── Projects ───────────────────────────────────────────────────────────────

  async listProjects(credentials: Credentials, params: QueryParams): Promise<Project[]> {
    const rows = await this.listPage<RawPlanfixProject>(
      credentials,
      '/project/list',
      'projects',
      { fields: PROJECT_FIELDS },
      params,
    )
    return rows.map(transformProject)
  }

  async getProject(credentials: Credentials, id: string): Promise<Project> {
    const res = await this.client(credentials).get<ProjectGetResponse>(`/project/${id}`, {
      fields: PROJECT_FIELDS,
    })
    if (!res.project) throw new Error(`Planfix project ${id} not found`)
    return transformProject(res.project)
  }

  // ── Tasks ──────────────────────────────────────────────────────────────────

  async listTasks(
    credentials: Credentials,
    projectId: string,
    params: QueryParams,
  ): Promise<Task[]> {
    const rows = await this.listPage<RawPlanfixTask>(
      credentials,
      '/task/list',
      'tasks',
      {
        fields: TASK_FIELDS,
        ...(projectId
          ? { filters: [{ type: TASK_FILTER_TYPE_PROJECT, operator: 'equal', value: projectId }] }
          : {}),
      },
      params,
    )
    return rows.map((t) => transformTask(t, projectId))
  }

  async getTask(credentials: Credentials, id: string): Promise<Task> {
    const res = await this.client(credentials).get<TaskGetResponse>(`/task/${id}`, {
      fields: TASK_FIELDS,
    })
    if (!res.task) throw new Error(`Planfix task ${id} not found`)
    return transformTask(res.task)
  }

  // ── Comments ─────────────────────────────────────────────────────────────────
  //
  // Comments are scoped to a task; the canonical `taskId` argument is the
  // Planfix task id used to list its comments. A single comment is fetched by
  // its own id via GET /comment/{id}.

  async listComments(
    credentials: Credentials,
    taskId: string,
    params: QueryParams,
  ): Promise<Comment[]> {
    const rows = await this.listPage<RawPlanfixComment>(
      credentials,
      `/task/${taskId}/comments/list`,
      'comments',
      { fields: COMMENT_FIELDS },
      params,
    )
    return rows.map((c) => transformComment(c, taskId))
  }

  async getComment(credentials: Credentials, id: string): Promise<Comment> {
    const res = await this.client(credentials).get<CommentGetResponse>(`/comment/${id}`, {
      fields: COMMENT_FIELDS,
    })
    if (!res.comment) throw new Error(`Planfix comment ${id} not found`)
    return transformComment(res.comment)
  }

  // ── Users (employees) ────────────────────────────────────────────────────────
  //
  // `/user/list` enumerates the account's employees. Planfix is single-account,
  // so the canonical `workspaceId` argument has no upstream analogue and is
  // ignored; each user's `workspaceIds` is left empty.

  async listUsers(
    credentials: Credentials,
    _workspaceId: string,
    params: QueryParams,
  ): Promise<User[]> {
    const rows = await this.listPage<RawPlanfixUser>(
      credentials,
      '/user/list',
      'users',
      { fields: USER_FIELDS },
      params,
    )
    return rows.map(transformUser)
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    const res = await this.client(credentials).get<UserGetResponse>(`/user/${id}`, {
      fields: USER_FIELDS,
    })
    if (!res.user) throw new Error(`Planfix user ${id} not found`)
    return transformUser(res.user)
  }
}

export { DEFAULT_PAGE_SIZE }
