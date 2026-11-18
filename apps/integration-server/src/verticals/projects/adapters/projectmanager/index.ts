/**
 * ProjectManager adapter for the projects vertical.
 *
 * Auth: API key (bearer token) — user supplies a workspace-scoped API key
 * generated in ProjectManager settings (Admin / Global Admin only).
 *
 * Supported resources:
 *   - listProjects / getProject    (GET /api/data/projects)
 *   - listTasks / getTask          (GET /api/data/tasks)
 *   - listComments / getComment    (GET /api/data/tasks/{taskId}/discussions)
 *   - listUsers / getUser          (GET /api/data/resources)
 *   - getWorkspace                 (GET /api/data/me → workspace fields)
 *
 * Tags: TaskTagDto objects are embedded within task query results. A dedicated
 * listTags endpoint is not documented; listTags is not implemented.
 *
 * Workspaces: API keys are workspace-scoped; listWorkspaces returns the single
 * authenticated workspace derived from GET /api/data/me.
 *
 * Pagination: OData $top / $skip on projects, tasks and resources. The OpenAPI
 * (https://developer.projectmanager.com/openapi.json) documents `$top` "The
 * number of records to return" and `$skip` "Skips the given number of records
 * and then returns $top records", and a `…ListAstroResult` response with no
 * next link and no count, so a page shorter than `$top` is the end. No maximum
 * `$top` is documented, so no `maxPageSize` is declared. Discussions
 * ("Retrieve all comments written about a task") take no paging parameter and
 * are sliced locally; `/me` yields the key's one workspace, also sliced locally.
 *
 * Docs: https://developer.projectmanager.com/getting-started/overview
 */
import { pageLocally, pageOffset, reportUpstreamPage } from '@opensteward/shared'
import type { Credentials, CredentialField, QueryParams } from '@opensteward/shared'
import type { ProjectsAdapter } from '../../adapter/interface'
import type { Project } from '../../schema/project'
import type { Task } from '../../schema/task'
import type { Comment } from '../../schema/comment'
import type { Workspace } from '../../schema/workspace'
import type { User } from '../../schema/user'

import {
  credentialFields as adapterCredentialFields,
  exchangeCredentials as adapterExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import { ProjectManagerClient, type PmListResponse } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'

import { transformProject, type RawProjectManagerProject } from './transform/project'
import { transformTask, type RawProjectManagerTask } from './transform/task'
import { transformComment, type RawProjectManagerComment } from './transform/comment'
import { transformWorkspace, type RawProjectManagerWorkspace } from './transform/workspace'
import { transformUser, type RawProjectManagerUser } from './transform/user'

export interface ProjectmanagerAdapterConfig {
  /** Unused — ProjectManager uses API key auth. Present for interface compatibility. */
  clientId?: string
  clientSecret?: string
  redirectUri?: string
}

/** /api/data/me response shape (workspace + user info) */
interface MeResponse {
  success?: boolean
  data?: RawProjectManagerWorkspace & {
    id?: string
    name?: string
    email?: string
  }
}

export class ProjectmanagerAdapter implements ProjectsAdapter {
  readonly platform = 'projectmanager'
  readonly version = '0.1.0'

  constructor(_config?: ProjectmanagerAdapterConfig) {}

  getAuthUrl(_state: string, _overrideScopes?: string[]): string {
    return getAuthUrlUnsupported()
  }

  credentialFields(): CredentialField[] {
    return adapterCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return adapterExchangeCredentials(fields)
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('projectmanager uses API key auth; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // API keys are long-lived (2 years); no refresh needed
    return credentials
  }

  private client(credentials: Credentials): ProjectManagerClient {
    return new ProjectManagerClient(credentials)
  }

  /**
   * OData paging params for the caller's page: `$top` is the caller's limit
   * and `$skip` the rows of the pages before it (`page` is 1-based).
   */
  private odataParams(params: QueryParams): { $top: number; $skip?: number } {
    const n = Math.floor(Number(params.limit))
    const top = Number.isFinite(n) && n >= 1 ? n : DEFAULT_PAGE_SIZE
    const skip = pageOffset(params, top)
    return skip > 0 ? { $top: top, $skip: skip } : { $top: top }
  }

  /**
   * Fetch one OData page and report whether more rows may follow: the
   * documented response has no next link or count, so a full page may have
   * more and a short page is the end.
   */
  private async listOData<T>(
    credentials: Credentials,
    path: string,
    params: QueryParams,
    filter?: string,
  ): Promise<T[]> {
    const paging = this.odataParams(params)
    const res = await this.client(credentials).get<PmListResponse<T>>(
      path,
      filter === undefined ? paging : { ...paging, $filter: filter },
    )
    const rows = res.data ?? []
    reportUpstreamPage(params, { hasMore: rows.length >= paging.$top })
    return rows
  }

  // ── Projects ───────────────────────────────────────────────────────────────

  async listProjects(credentials: Credentials, params: QueryParams): Promise<Project[]> {
    const rows = await this.listOData<RawProjectManagerProject>(credentials, '/projects', params)
    return rows.map(transformProject)
  }

  async getProject(credentials: Credentials, id: string): Promise<Project> {
    const res = await this.client(credentials).get<PmListResponse<RawProjectManagerProject>>(
      '/projects',
      { $filter: `id eq '${id}'`, $top: 1 },
    )
    const item = res.data?.[0]
    if (!item) throw new Error(`ProjectManager project ${id} not found`)
    return transformProject(item)
  }

  // ── Tasks ──────────────────────────────────────────────────────────────────

  async listTasks(credentials: Credentials, projectId: string, params: QueryParams): Promise<Task[]> {
    const rows = await this.listOData<RawProjectManagerTask>(
      credentials,
      '/tasks',
      params,
      `projectId eq '${projectId}'`,
    )
    return rows.map((t) => transformTask(t, projectId))
  }

  async getTask(credentials: Credentials, id: string): Promise<Task> {
    const res = await this.client(credentials).get<PmListResponse<RawProjectManagerTask>>(
      '/tasks',
      { $filter: `id eq '${id}'`, $top: 1 },
    )
    const item = res.data?.[0]
    if (!item) throw new Error(`ProjectManager task ${id} not found`)
    return transformTask(item)
  }

  // ── Comments (Discussions) ────────────────────────────────────────────────

  async listComments(credentials: Credentials, taskId: string, params: QueryParams): Promise<Comment[]> {
    // "Retrieve all comments written about a task": no paging parameter, so
    // the whole discussion comes back and is sliced to the caller's page.
    const res = await this.client(credentials).get<PmListResponse<RawProjectManagerComment>>(
      `/tasks/${taskId}/discussions`,
    )
    return pageLocally(res.data ?? [], params).map((c) => transformComment(c, taskId))
  }

  async getComment(credentials: Credentials, id: string): Promise<Comment> {
    // ProjectManager does not expose a single-comment GET; we cannot look up by
    // comment id alone without taskId. Callers should prefer listComments.
    // Surface a descriptive error rather than silently failing.
    void credentials
    throw new Error(
      `ProjectManager: getComment(${id}) is not supported — use listComments(taskId) instead`,
    )
  }

  // ── Workspaces ────────────────────────────────────────────────────────────
  // API keys are workspace-scoped; return the single authenticated workspace.

  async listWorkspaces(credentials: Credentials, params: QueryParams): Promise<Workspace[]> {
    const res = await this.client(credentials).get<MeResponse>('/me')
    const all = res.data?.workSpaceId ? [res.data as RawProjectManagerWorkspace] : []
    return pageLocally(all, params).map(transformWorkspace)
  }

  async getWorkspace(credentials: Credentials, _id: string): Promise<Workspace> {
    const res = await this.client(credentials).get<MeResponse>('/me')
    if (!res.data?.workSpaceId) throw new Error('ProjectManager workspace not found')
    return transformWorkspace(res.data as RawProjectManagerWorkspace)
  }

  // ── Users (Resources) ────────────────────────────────────────────────────

  async listUsers(credentials: Credentials, workspaceId: string, params: QueryParams): Promise<User[]> {
    const rows = await this.listOData<RawProjectManagerUser>(credentials, '/resources', params)
    return rows.map((u) => transformUser(u, workspaceId))
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    const res = await this.client(credentials).get<PmListResponse<RawProjectManagerUser>>(
      '/resources',
      { $filter: `id eq '${id}'`, $top: 1 },
    )
    const item = res.data?.[0]
    if (!item) throw new Error(`ProjectManager resource ${id} not found`)
    return transformUser(item)
  }
}
