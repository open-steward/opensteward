/**
 * Nifty (niftypm) adapter — Nifty REST API v1.0 → canonical projects schema.
 *
 * OAuth2 (authorization-code, confidential client) + REST. Bearer-token auth;
 * list endpoints page with `limit`/`offset` and wrap rows in an envelope
 * (`projects`/`tasks`/`messages`/`items` + a `hasMore`/`has_more` flag).
 * Projects, tasks, messages, labels and members send
 * `offset = (page - 1) × size` and report that flag. GET /subteams documents
 * no parameters and answers with every portfolio, paged locally.
 *
 * Model notes:
 *   - Nifty's top-level grouping is the *subteam* (portfolio); it maps to the
 *     canonical Workspace. Projects belong to a subteam, tasks to a project.
 *   - Subtasks → `Task.parentId` (Nifty `task_id`). Status is open vs. closed
 *     (`completed`); the kanban column id is preserved in metadata.
 *   - Comments are Nifty *messages* attached to a task (`GET /messages?task_id`).
 *   - Labels (tags) are team-scoped and list-only — Nifty exposes no
 *     single-label GET, so `getTag` is omitted (auto-501s via the interface).
 *   - Nifty webhooks ship no signature/HMAC, so no `verifyWebhook` /
 *     `parseWebhookEvents`.
 */
import { pageLocally, pageOffset, reportUpstreamPage } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import type { ProjectsAdapter } from '../../adapter/interface'
import type { Project } from '../../schema/project'
import type { Task } from '../../schema/task'
import type { Comment } from '../../schema/comment'
import type { Tag } from '../../schema/tag'
import type { Workspace } from '../../schema/workspace'
import type { User } from '../../schema/user'

import {
  buildAuthUrl,
  exchangeCode as niftyExchange,
  refreshCredentials as niftyRefresh,
} from './auth'
import { NiftyClient } from './client'
import { DEFAULT_PAGE_SIZE, DEFAULT_SCOPES, MAX_PAGE_SIZE } from './constants'

import { transformProject, type RawNiftyProject } from './transform/project'
import { transformTask, type RawNiftyTask } from './transform/task'
import { transformComment, type RawNiftyMessage } from './transform/comment'
import { transformTag, type RawNiftyLabel } from './transform/tag'
import { transformWorkspace, type RawNiftySubteam } from './transform/workspace'
import { transformUser, type RawNiftyMember } from './transform/user'

export interface NiftyAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

/** Nifty list envelopes: rows under a resource-named key + a more flag. */
/** ProjectListResponse: `required: ["projects", "hasMore"]`. */
interface ProjectListResponse {
  projects: RawNiftyProject[]
  hasMore: boolean
}
interface TaskListResponse {
  tasks?: RawNiftyTask[]
  hasMore?: boolean
}
interface MessageListResponse {
  messages?: RawNiftyMessage[]
  has_more?: boolean
}
interface LabelListResponse {
  items?: RawNiftyLabel[]
  hasMore?: boolean
}
/**
 * GetSubTeamsResponse: `subteams` (array of SubteamResponse), `items`
 * (boolean, "True if there are more record else false") and `hasMore`.
 */
interface SubteamListResponse {
  subteams: RawNiftySubteam[]
  items?: boolean
  hasMore?: boolean
}
interface MemberListResponse {
  items?: RawNiftyMember[]
  hasMore?: boolean
  has_more?: boolean
}

export class NiftyAdapter implements ProjectsAdapter {
  readonly platform = 'nifty'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: NiftyAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes ?? DEFAULT_SCOPES
  }

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(this.clientId, this.redirectUri, overrideScopes ?? this.scopes, state)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return niftyExchange(code, redirectUri, this.clientId, this.clientSecret)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return niftyRefresh(credentials, this.clientId, this.clientSecret)
  }

  private client(credentials: Credentials): NiftyClient {
    return new NiftyClient(credentials)
  }

  /**
   * `limit` + `offset` for one caller page. Nifty v1.0: "List operations take
   * `limit` (default `25`) and `offset`, and answer with `hasMore`." The
   * caller's limit is clamped to {@link MAX_PAGE_SIZE}; `size` is what is sent.
   */
  private offsetQuery(params: QueryParams): { limit: number; offset: number } {
    const limit = params.limit ?? DEFAULT_PAGE_SIZE
    const size = Math.max(1, Math.min(Math.floor(limit), MAX_PAGE_SIZE))
    return { limit: size, offset: pageOffset(params, size) }
  }

  /**
   * Report the documented more flag ("`hasMore` is true whenever the page came
   * back full"), or a full page when the response carries none, and the size
   * sent when the clamp made it smaller than the caller's limit.
   */
  private reportPage(params: QueryParams, size: number, rows: number, flag: unknown): void {
    const limit = params.limit ?? DEFAULT_PAGE_SIZE
    reportUpstreamPage(params, {
      hasMore: typeof flag === 'boolean' ? flag : rows >= size,
      ...(size < limit ? { pageSize: size } : {}),
    })
  }

  /**
   * GET /api/v1.0/projects: `subteam_id` ("Subteam ID"), `limit` ("No of
   * records to fetch"), `offset` ("Record Offset"); answers
   * `{ projects, hasMore }`.
   */
  async listProjects(credentials: Credentials, params: QueryParams): Promise<Project[]> {
    const subteamId = params['workspace_id']
    const query = this.offsetQuery(params)
    const res = await this.client(credentials).get<ProjectListResponse>('/projects', {
      ...query,
      ...(subteamId ? { subteam_id: String(subteamId) } : {}),
    })
    // ProjectListResponse `required: ["projects", "hasMore"]`: a body without
    // the rows array is not an empty page, and must not read as a complete one.
    const rows: unknown = res?.projects
    if (!Array.isArray(rows)) {
      throw new Error('Nifty GET /projects answered without the documented `projects` array')
    }
    this.reportPage(params, query.limit, rows.length, res.hasMore)
    return (rows as RawNiftyProject[]).map(transformProject)
  }

  async getProject(credentials: Credentials, id: string): Promise<Project> {
    const res = await this.client(credentials).get<RawNiftyProject>(`/projects/${id}`)
    if (!res) throw new Error(`Nifty project ${id} not found`)
    return transformProject(res)
  }

  async listTasks(
    credentials: Credentials,
    projectId: string,
    params: QueryParams,
  ): Promise<Task[]> {
    const query = this.offsetQuery(params)
    const res = await this.client(credentials).get<TaskListResponse>('/tasks', {
      ...query,
      project_id: projectId,
    })
    const rows = res.tasks ?? []
    this.reportPage(params, query.limit, rows.length, res.hasMore)
    return rows.map((t) => transformTask(t, projectId))
  }

  async getTask(credentials: Credentials, id: string): Promise<Task> {
    const res = await this.client(credentials).get<RawNiftyTask>(`/tasks/${id}`)
    if (!res) throw new Error(`Nifty task ${id} not found`)
    return transformTask(res)
  }

  async listComments(
    credentials: Credentials,
    taskId: string,
    params: QueryParams,
  ): Promise<Comment[]> {
    const query = this.offsetQuery(params)
    const res = await this.client(credentials).get<MessageListResponse>('/messages', {
      ...query,
      task_id: taskId,
    })
    const rows = res.messages ?? []
    // Judged before the deleted filter: the page is full by what Nifty sent.
    this.reportPage(params, query.limit, rows.length, res.has_more)
    return rows.filter((m) => !m.is_deleted).map((m) => transformComment(m, taskId))
  }

  async getComment(credentials: Credentials, id: string): Promise<Comment> {
    const res = await this.client(credentials).get<RawNiftyMessage>(`/messages/${id}`)
    if (!res) throw new Error(`Nifty message ${id} not found`)
    return transformComment(res)
  }

  async listTags(
    credentials: Credentials,
    _workspaceId: string,
    params: QueryParams,
  ): Promise<Tag[]> {
    const query = this.offsetQuery(params)
    const res = await this.client(credentials).get<LabelListResponse>('/labels', query)
    const rows = res.items ?? []
    this.reportPage(params, query.limit, rows.length, res.hasMore)
    return rows.map(transformTag)
  }

  /**
   * GET /api/v1.0/subteams documents `"parameters": []`: no limit or offset,
   * so one call returns every portfolio and the caller's page is cut locally.
   * If Nifty nonetheless flags more rows (`hasMore` / `items`), there is no
   * documented way to fetch them, and a locally paged answer would tell the
   * sync the collection is complete, so the call fails instead.
   */
  async listWorkspaces(credentials: Credentials, params: QueryParams): Promise<Workspace[]> {
    const res = await this.client(credentials).get<SubteamListResponse>('/subteams')
    // GetSubTeamsResponse `required: ["subteams", "items", "hasMore"]`.
    const rows: unknown = res?.subteams
    if (!Array.isArray(rows)) {
      throw new Error('Nifty GET /subteams answered without the documented `subteams` array')
    }
    if (res.hasMore === true || res.items === true) {
      throw new Error(
        'Nifty GET /subteams reported hasMore, but documents no limit/offset to fetch the remaining portfolios',
      )
    }
    return pageLocally(rows as RawNiftySubteam[], params).map(transformWorkspace)
  }

  async getWorkspace(credentials: Credentials, id: string): Promise<Workspace> {
    const res = await this.client(credentials).get<RawNiftySubteam>(`/subteams/${id}`)
    if (!res) throw new Error(`Nifty subteam ${id} not found`)
    return transformWorkspace(res)
  }

  async listUsers(
    credentials: Credentials,
    workspaceId: string,
    params: QueryParams,
  ): Promise<User[]> {
    // Both limit and offset are always sent: "The { items, hasMore } envelope
    // shown below is returned only when BOTH limit and offset are sent".
    const query = this.offsetQuery(params)
    const res = await this.client(credentials).get<MemberListResponse>('/members', query)
    const rows = res.items ?? []
    this.reportPage(params, query.limit, rows.length, res.hasMore ?? res.has_more)
    return rows.map((u) => transformUser(u, workspaceId || undefined))
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    const res = await this.client(credentials).get<RawNiftyMember>(`/members/${id}`)
    if (!res) throw new Error(`Nifty member ${id} not found`)
    return transformUser(res)
  }
}
