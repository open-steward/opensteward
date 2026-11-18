/**
 * Rocketlane adapter for the projects vertical.
 *
 * Rocketlane is a customer onboarding and project management platform. Its
 * REST API lives at https://api.rocketlane.com/api/1.0, authenticated with a
 * long-lived API key sent in the `api-key` header (no OAuth2 flow), so
 * credentials are collected through the Connect Link form (`simpleApiKey`).
 *
 * Supported canonical resources:
 *   - Projects    GET /projects, GET /projects/{projectId}
 *   - Tasks       GET /tasks?projectId.eq={pid}, GET /tasks/{taskId}
 *   - Comments    GET /tasks/{taskId} for the task's project, then
 *                 GET /comments?projectId.eq={pid}&sourceType=TASK, keeping
 *                 the comments whose source is the task; GET /comments/{id}
 *   - Users       GET /users, GET /users/{userId}
 *
 * Intentionally NOT implemented (left off → auto-respond 501):
 *   - Tags       — Rocketlane has no standalone tag resource.
 *   - Workspaces — Rocketlane has no workspace concept; customers (companies)
 *                  are surfaced as workspaceId on projects instead.
 *   - Webhooks   — Rocketlane's public API does not document signed webhook
 *                  delivery, so no verify/parse hooks are declared.
 */

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: tag       — Rocketlane has no standalone tag/label resource in its public REST API.
// Unavailable: workspace — Rocketlane has no workspace concept; account is single-tenant.
import {
  connectionScope,
  cursorPagerKey,
  pageByCursor,
  pageByRows,
  reportUpstreamPage,
  simpleApiKey,
} from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import type { ProjectsAdapter } from '../../adapter/interface'
import type { Project } from '../../schema/project'
import type { Task } from '../../schema/task'
import type { Comment } from '../../schema/comment'
import type { User } from '../../schema/user'

import { buildAuthUrl, exchangeCode as rlExchange, refreshCredentials as rlRefresh } from './auth'
import { RocketlaneClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, TOKEN_HELP_URL } from './constants'

import { transformProject, type RawRocketlaneProject } from './transform/project'
import { transformTask, type RawRocketlaneTask } from './transform/task'
import { transformComment, type RawRocketlaneComment } from './transform/comment'
import { transformUser, type RawRocketlaneUser } from './transform/user'

/**
 * Paginated list envelope returned by Rocketlane list endpoints. The next-page
 * signal lives under `pagination`: `nextPageToken` starts the next page and
 * `hasMore` says whether one exists
 * (https://developer.rocketlane.com/docs/pagination).
 */
interface PagedResponse<T> {
  data?: T[]
  pagination?: {
    pageSize?: number
    hasMore?: boolean
    totalRecordCount?: number
    nextPageToken?: string | null
  }
}

/** The part of GET /1.0/tasks/{taskId} listComments reads: `project.projectId`. */
interface RawRocketlaneTaskRef {
  project?: { projectId?: number }
}

/** Single-object envelope. */
interface SingleResponse<T> {
  data?: T
}

/**
 * Connect Link form: a single Rocketlane API key.
 */
const CONNECT_FORM = simpleApiKey({
  label: 'API key',
  placeholder: 'rl_…',
  helpText: `Generate an API key from your Rocketlane app → Profile → Settings → API → Create API key. See ${TOKEN_HELP_URL}`,
})

export class RocketlaneAdapter implements ProjectsAdapter {
  readonly platform = 'rocketlane'
  readonly version = '0.1.0'

  // Connect Link support — single API key form.
  credentialFields = CONNECT_FORM.credentialFields
  exchangeCredentials = CONNECT_FORM.exchangeCredentials

  getAuthUrl(_state: string): string {
    return buildAuthUrl(_state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return rlExchange(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return rlRefresh(credentials)
  }

  private client(credentials: Credentials): RocketlaneClient {
    return new RocketlaneClient(credentials)
  }

  /** The caller's limit, clamped to Rocketlane's documented maximum of 100. */
  private pageSize(params: QueryParams): number {
    const limit = params.limit
    const asked =
      typeof limit === 'number' && Number.isFinite(limit) && limit >= 1
        ? Math.floor(limit)
        : DEFAULT_PAGE_SIZE
    return Math.min(asked, MAX_PAGE_SIZE)
  }

  /**
   * One caller page of a `pageSize` / `pageToken` list.
   *
   * An explicit `cursor` param names the upstream page directly. Otherwise
   * `page` is resolved by walking `pagination.nextPageToken` forward, one
   * upstream page per caller page, keyed per connection, path, filters and
   * page size.
   */
  private async listPaged<T>(
    credentials: Credentials,
    path: string,
    filters: Record<string, unknown>,
    params: QueryParams,
  ): Promise<T[]> {
    const client = this.client(credentials)
    const size = this.pageSize(params)
    const fetchPage = async (token: string | undefined) => {
      const res = await client.get<PagedResponse<T>>(path, {
        pageSize: size,
        ...(token !== undefined ? { pageToken: token } : {}),
        ...filters,
      })
      const next = res.pagination?.nextPageToken
      const more = res.pagination?.hasMore === true && typeof next === 'string' && next.length > 0
      return { items: res.data ?? [], next: more ? next : null }
    }
    const explicit = params['cursor']
    let result: { items: T[]; hasMore: boolean }
    if (typeof explicit === 'string' && explicit.length > 0) {
      const page = await fetchPage(explicit)
      result = { items: page.items, hasMore: page.next != null }
    } else {
      const key = cursorPagerKey(connectionScope('rocketlane', credentials), path, {
        ...filters,
        limit: size,
      })
      result = await pageByCursor<T>(key, params.page, fetchPage)
    }
    const limit = params.limit
    const clamped = typeof limit === 'number' && limit > size
    reportUpstreamPage(params, { hasMore: result.hasMore, ...(clamped ? { pageSize: size } : {}) })
    return result.items
  }

  // ── Projects ───────────────────────────────────────────────────────────────

  async listProjects(credentials: Credentials, params: QueryParams): Promise<Project[]> {
    const rows = await this.listPaged<RawRocketlaneProject>(
      credentials,
      '/projects',
      { includeAllFields: true },
      params,
    )
    return rows.map(transformProject)
  }

  async getProject(credentials: Credentials, id: string): Promise<Project> {
    const res = await this.client(credentials).get<SingleResponse<RawRocketlaneProject>>(
      `/projects/${id}`,
      { includeAllFields: true },
    )
    if (!res.data) throw new Error(`Rocketlane project ${id} not found`)
    return transformProject(res.data)
  }

  // ── Tasks ─────────────────────────────────────────────────────────────────
  //
  // Rocketlane tasks are filtered to a project via the `projectId.eq` query
  // param. GET /projects/{id}/tasks also works but the flat endpoint is more
  // consistent with pagination.

  async listTasks(
    credentials: Credentials,
    projectId: string,
    params: QueryParams,
  ): Promise<Task[]> {
    const rows = await this.listPaged<RawRocketlaneTask>(
      credentials,
      '/tasks',
      { 'projectId.eq': projectId, includeAllFields: true },
      params,
    )
    return rows.map((t) => transformTask(t, projectId))
  }

  async getTask(credentials: Credentials, id: string): Promise<Task> {
    const res = await this.client(credentials).get<SingleResponse<RawRocketlaneTask>>(
      `/tasks/${id}`,
      { includeAllFields: true },
    )
    if (!res.data) throw new Error(`Rocketlane task ${id} not found`)
    return transformTask(res.data)
  }

  // ── Comments ──────────────────────────────────────────────────────────────
  //
  // GET /1.0/comments documents no task filter: its filters are `projectId.eq`
  // ("Filter comments by the id of the project they belong to."), `sourceType`
  // (TASK or PROJECT_CONVERSATIONS, "Defaults to TASK."), `createdBy.eq`,
  // `createdAt.*` and `isPrivate.eq`. Each comment carries its `source`
  // (`sourceId`, `sourceType`). So a task's comments are the project's TASK
  // comments whose `source.sourceId` is the task, and the task's project comes
  // from GET /1.0/tasks/{taskId} (`project.projectId`). Filtering leaves an
  // uneven number of rows per upstream page, so pageByRows cuts the caller's
  // page out of them; the upstream page is always the documented maximum.

  async listComments(
    credentials: Credentials,
    taskId: string,
    params: QueryParams,
  ): Promise<Comment[]> {
    const client = this.client(credentials)
    const task = await client.get<RawRocketlaneTaskRef>(`/tasks/${encodeURIComponent(taskId)}`)
    const pid = task.project?.projectId
    if (pid == null) throw new Error(`Rocketlane task ${taskId} has no project.projectId`)
    const projectId = String(pid)
    const filters = {
      'projectId.eq': projectId,
      sourceType: 'TASK',
      includeFields: 'attachments',
    }
    const key = cursorPagerKey(connectionScope('rocketlane', credentials), '/comments', {
      ...filters,
      taskId,
      pageSize: MAX_PAGE_SIZE,
    })
    const { items } = await pageByRows<RawRocketlaneComment>(key, params, async (token) => {
      const res = await client.get<PagedResponse<RawRocketlaneComment>>('/comments', {
        pageSize: MAX_PAGE_SIZE,
        ...(token !== undefined ? { pageToken: token } : {}),
        ...filters,
      })
      const next = res.pagination?.nextPageToken
      const more = res.pagination?.hasMore === true && typeof next === 'string' && next.length > 0
      const rows = (res.data ?? []).filter(
        (c) => c.source?.sourceType === 'TASK' && String(c.source.sourceId) === taskId,
      )
      return { items: rows, next: more ? next : null }
    })
    return items.map((c) => transformComment(c, projectId))
  }

  async getComment(credentials: Credentials, id: string): Promise<Comment> {
    const res = await this.client(credentials).get<RawRocketlaneComment>(
      `/comments/${encodeURIComponent(id)}`,
      { includeFields: 'attachments' },
    )
    return transformComment(res)
  }

  // ── Users ─────────────────────────────────────────────────────────────────
  //
  // Rocketlane users belong to the whole account. `workspaceId` is accepted
  // for interface compatibility but is not used to scope the request.

  async listUsers(
    credentials: Credentials,
    _workspaceId: string,
    params: QueryParams,
  ): Promise<User[]> {
    const rows = await this.listPaged<RawRocketlaneUser>(
      credentials,
      '/users',
      { includeAllFields: true },
      params,
    )
    return rows.map(transformUser)
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    const res = await this.client(credentials).get<SingleResponse<RawRocketlaneUser>>(
      `/users/${id}`,
      { includeAllFields: true },
    )
    if (!res.data) throw new Error(`Rocketlane user ${id} not found`)
    return transformUser(res.data)
  }
}
