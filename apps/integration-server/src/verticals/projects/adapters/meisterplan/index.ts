/**
 * Meisterplan adapter for the projects vertical.
 *
 * Meisterplan is a portfolio / resource-planning SaaS.  Its REST API is
 * scenario-scoped: all project data lives under a named scenario
 * (e.g. "Plan of Record").  Resources (people) and Roles are global.
 *
 * Canonical mapping:
 *   Scenario  → Workspace  (GET /scenarios, GET /scenarios/{id})
 *   Project   → Project    (GET /scenarios/{id}/projects, …/{projectId})
 *   Resource  → User       (GET /resources, GET /resources/{id})
 *   Role      → Tag        (GET /roles, GET /roles/{id})
 *   Task      → Task       (GET /scenarios/{id}/projects/{pid}/taskManagementLink/tasks, …/{taskId})
 *   Comment   → Comment    (GET /scenarios/{id}/projects/{pid}/comments, …/{commentId})
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * All 6 canonical resources are available for this adapter.
 *
 * Authentication: long-lived API token stored as `credentials.accessToken`.
 *   The token includes its own `api-` prefix and is sent verbatim as the
 *   `Authorization` header value.  The tenant region (us | eu) is stored in
 *   `credentials.extra.region` and used to resolve the base URL.
 *
 * Pagination: cursor-based (`pageSize` + `pageAfter` query params; response
 *   carries `_pagination.after.cursor` for the next page).  The caller's 1-based
 *   `page` is resolved by walking that chain with `pageByCursor`.  `GET /roles`
 *   and `GET /scenarios` take no paging parameter and return the whole list,
 *   which is paged locally.
 *
 * Connect Link: `customForm` with an `apiToken` field + optional `region`
 *   selector (defaults to "us").
 *
 * Docs: https://api.us.meisterplan.com/docs/api.html
 */
import {
  connectionScope,
  cursorPagerKey,
  customForm,
  pageByCursor,
  pageLocally,
  reportUpstreamPage,
} from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import type { ProjectsAdapter } from '../../adapter/interface'
import type { Project } from '../../schema/project'
import type { Tag } from '../../schema/tag'
import type { Task } from '../../schema/task'
import type { Comment } from '../../schema/comment'
import type { Workspace } from '../../schema/workspace'
import type { User } from '../../schema/user'

import {
  buildAuthUrl,
  exchangeCode as meisterplanExchange,
  refreshCredentials as meisterplanRefresh,
} from './auth'
import { MeisterplanClient } from './client'
import {
  API_KEY_HELP_URL,
  COMMENTS_MAX_PAGE_SIZE,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  PLAN_OF_RECORD_ID,
} from './constants'

import { transformProject, type RawMeisterplanProject } from './transform/project'
import { transformTag, type RawMeisterplanRole } from './transform/tag'
import { transformWorkspace, type RawMeisterplanScenario } from './transform/workspace'
import { transformUser, type RawMeisterplanResource } from './transform/user'
import { transformTask, type RawMeisterplanTask } from './transform/task'
import { transformComment, type RawMeisterplanComment } from './transform/comment'

// ── API response envelopes ──────────────────────────────────────────────────

/** Cursor-paginated list response wrapping `items`. */
interface PagedResponse<T> {
  items?: T[]
  _pagination?: {
    after?: { cursor?: string | null } | null
  } | null
}

// ── Connect Link form ──────────────────────────────────────────────────────

const CONNECT_FORM = customForm({
  fields: [
    {
      name: 'apiToken',
      label: 'API token',
      type: 'password' as const,
      required: true,
      placeholder: 'api-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
      helpText: `Generate an API token at ${API_KEY_HELP_URL}`,
    },
    {
      name: 'region',
      label: 'Region',
      type: 'text' as const,
      required: false,
      placeholder: 'us',
      helpText: 'us (default) or eu — matches the first two letters of your Meisterplan URL',
    },
  ],
  exchange: async (fields: Record<string, string>): Promise<Credentials> => {
    const token = (fields['apiToken'] ?? '').trim()
    if (!token) throw new Error('API token is required.')
    const region = (fields['region'] ?? 'us').trim().toLowerCase()
    return {
      accessToken: token,
      extra: { region: region === 'eu' ? 'eu' : 'us' },
    }
  },
})

// ── Adapter ────────────────────────────────────────────────────────────────

export class MeisterplanAdapter implements ProjectsAdapter {
  readonly platform = 'meisterplan'
  readonly version = '0.1.0'

  // Connect Link support — API-token form with optional region selector.
  credentialFields = CONNECT_FORM.credentialFields
  exchangeCredentials = CONNECT_FORM.exchangeCredentials

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return meisterplanExchange(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return meisterplanRefresh(credentials)
  }

  private client(credentials: Credentials): MeisterplanClient {
    return new MeisterplanClient(credentials)
  }

  /** The caller's limit as a `pageSize`, clamped to the endpoint's documented maximum. */
  private pageSize(params: QueryParams, max: number): number {
    const limit = params.limit
    const asked =
      typeof limit === 'number' && Number.isFinite(limit) && limit >= 1
        ? Math.floor(limit)
        : DEFAULT_PAGE_SIZE
    return Math.min(asked, max)
  }

  /**
   * One caller page of a `pageSize` / `pageAfter` list.
   *
   * An explicit `cursor` param names the upstream page directly. Otherwise
   * `page` is resolved by walking `_pagination.after.cursor` forward, one
   * upstream page per caller page, keyed per connection, path and page size.
   */
  private async listPaged<T>(
    credentials: Credentials,
    path: string,
    params: QueryParams,
    max: number,
  ): Promise<T[]> {
    const client = this.client(credentials)
    const size = this.pageSize(params, max)
    const fetchPage = async (cursor: string | undefined) => {
      const res = await client.get<PagedResponse<T>>(path, {
        pageSize: size,
        ...(cursor !== undefined ? { pageAfter: cursor } : {}),
      })
      const items = res.items ?? []
      const next = res._pagination?.after?.cursor
      // An empty page is the end, whatever cursor rides along with it.
      return { items, next: items.length > 0 && next ? next : null }
    }
    const explicit = params['cursor']
    let result: { items: T[]; hasMore: boolean }
    if (typeof explicit === 'string' && explicit.length > 0) {
      const res = await fetchPage(explicit)
      result = { items: res.items, hasMore: res.next !== null }
    } else {
      const region = credentials.extra?.['region'] === 'eu' ? 'eu' : 'us'
      const key = cursorPagerKey(connectionScope(`meisterplan:${region}`, credentials), path, {
        limit: size,
      })
      result = await pageByCursor<T>(key, params.page, fetchPage)
    }
    const limit = params.limit
    const clamped = typeof limit === 'number' && limit > size
    reportUpstreamPage(params, { hasMore: result.hasMore, ...(clamped ? { pageSize: size } : {}) })
    return result.items
  }

  /**
   * Resolve the scenario (workspace) ID for project calls.
   * Falls back to the Plan of Record sentinel when no explicit id is passed.
   */
  private scenarioId(params: QueryParams): string {
    const id = params['workspace_id'] ?? params['scenario_id']
    return id ? String(id) : PLAN_OF_RECORD_ID
  }

  // ── Projects ─────────────────────────────────────────────────────────────

  async listProjects(credentials: Credentials, params: QueryParams): Promise<Project[]> {
    const sid = this.scenarioId(params)
    const items = await this.listPaged<RawMeisterplanProject>(
      credentials,
      `/scenarios/${sid}/projects`,
      params,
      MAX_PAGE_SIZE,
    )
    return items.map((p) => transformProject(p, sid))
  }

  async getProject(credentials: Credentials, id: string): Promise<Project> {
    // Support composite "scenarioId/projectId" or bare projectId using
    // the Plan of Record sentinel as a fallback scenario.
    const [scenarioId, projectId] = id.includes('/') ? id.split('/') : [PLAN_OF_RECORD_ID, id]
    const raw = await this.client(credentials).get<RawMeisterplanProject>(
      `/scenarios/${scenarioId}/projects/${projectId}`,
    )
    return transformProject(raw, scenarioId)
  }

  // ── Workspaces (scenarios) ────────────────────────────────────────────────

  async listWorkspaces(credentials: Credentials, params: QueryParams): Promise<Workspace[]> {
    // GET /scenarios takes no paging parameter and returns every scenario.
    const res =
      await this.client(credentials).get<PagedResponse<RawMeisterplanScenario>>('/scenarios')
    return pageLocally(res.items ?? [], params).map(transformWorkspace)
  }

  async getWorkspace(credentials: Credentials, id: string): Promise<Workspace> {
    const raw = await this.client(credentials).get<RawMeisterplanScenario>(`/scenarios/${id}`)
    return transformWorkspace(raw)
  }

  // ── Users (resources) ─────────────────────────────────────────────────────

  async listUsers(
    credentials: Credentials,
    _workspaceId: string,
    params: QueryParams,
  ): Promise<User[]> {
    const items = await this.listPaged<RawMeisterplanResource>(
      credentials,
      '/resources',
      params,
      MAX_PAGE_SIZE,
    )
    return items.map((r) => transformUser(r))
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    const raw = await this.client(credentials).get<RawMeisterplanResource>(`/resources/${id}`)
    return transformUser(raw)
  }

  // ── Tags (roles) ──────────────────────────────────────────────────────────

  async listTags(
    credentials: Credentials,
    _workspaceId: string,
    params: QueryParams,
  ): Promise<Tag[]> {
    // GET /roles takes no paging parameter: "Returns a list of all available roles."
    const res = await this.client(credentials).get<PagedResponse<RawMeisterplanRole>>('/roles')
    return pageLocally(res.items ?? [], params).map((r) => transformTag(r))
  }

  async getTag(credentials: Credentials, id: string): Promise<Tag> {
    const raw = await this.client(credentials).get<RawMeisterplanRole>(`/roles/${id}`)
    return transformTag(raw)
  }

  // ── Tasks ─────────────────────────────────────────────────────────────────

  /**
   * Tasks in Meisterplan are scenario-and-project-scoped.
   * The projectId parameter should be a composite "scenarioId/projectId" string
   * or a bare projectId (falls back to Plan of Record scenario).
   *
   * Endpoint (operationId GetAllTasks, "This endpoint is paginated. It returns
   * a list of tasks up to the specified pageSize"):
   *   GET /scenarios/{scenarioId}/projects/{projectId}/taskManagementLink/tasks
   * with `pageSize` (max 500, default 100) and `pageAfter`.
   */
  async listTasks(
    credentials: Credentials,
    projectId: string,
    params: QueryParams,
  ): Promise<Task[]> {
    const [sid, pid] = projectId.includes('/')
      ? projectId.split('/')
      : [PLAN_OF_RECORD_ID, projectId]
    const items = await this.listPaged<RawMeisterplanTask>(
      credentials,
      `/scenarios/${sid}/projects/${pid}/taskManagementLink/tasks`,
      params,
      MAX_PAGE_SIZE,
    )
    return items.map((t) => transformTask(t, pid, sid))
  }

  async getTask(credentials: Credentials, id: string): Promise<Task> {
    // id may be "scenarioId/projectId/taskId" or "projectId/taskId"
    const parts = id.split('/')
    let sid: string
    let pid: string
    let tid: string
    if (parts.length >= 3) {
      ;[sid, pid, tid] = parts
    } else if (parts.length === 2) {
      ;[pid, tid] = parts
      sid = PLAN_OF_RECORD_ID
    } else {
      throw new Error(
        'Meisterplan getTask requires a composite id: "scenarioId/projectId/taskId" or "projectId/taskId"',
      )
    }
    const raw = await this.client(credentials).get<RawMeisterplanTask>(
      `/scenarios/${sid}/projects/${pid}/taskManagementLink/tasks/${tid}`,
    )
    return transformTask(raw, pid, sid)
  }

  // ── Comments ──────────────────────────────────────────────────────────────

  /**
   * Comments in Meisterplan are project-level (not task-level) and are
   * scenario-scoped.  The taskId parameter carries a composite
   * "scenarioId/projectId" (or bare "projectId") so the same signature can
   * locate the project.
   *
   * Endpoint: GET /scenarios/{scenarioId}/projects/{projectId}/comments
   */
  async listComments(
    credentials: Credentials,
    taskId: string,
    params: QueryParams,
  ): Promise<Comment[]> {
    const [sid, pid] = taskId.includes('/') ? taskId.split('/') : [PLAN_OF_RECORD_ID, taskId]
    const items = await this.listPaged<RawMeisterplanComment>(
      credentials,
      `/scenarios/${sid}/projects/${pid}/comments`,
      params,
      COMMENTS_MAX_PAGE_SIZE,
    )
    return items.map((c) => transformComment(c, pid, sid))
  }

  async getComment(credentials: Credentials, id: string): Promise<Comment> {
    // id: "scenarioId/projectId/commentId" or "projectId/commentId"
    const parts = id.split('/')
    let sid: string
    let pid: string
    let cid: string
    if (parts.length >= 3) {
      ;[sid, pid, cid] = parts
    } else if (parts.length === 2) {
      ;[pid, cid] = parts
      sid = PLAN_OF_RECORD_ID
    } else {
      throw new Error(
        'Meisterplan getComment requires a composite id: "scenarioId/projectId/commentId" or "projectId/commentId"',
      )
    }
    const raw = await this.client(credentials).get<RawMeisterplanComment>(
      `/scenarios/${sid}/projects/${pid}/comments/${cid}`,
    )
    return transformComment(raw, pid, sid)
  }
}
