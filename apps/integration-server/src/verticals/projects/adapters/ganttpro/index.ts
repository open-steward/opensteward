/**
 * GanttPRO adapter for the projects vertical.
 *
 * Auth model: API key (X-API-KEY header). Users generate keys at
 * https://app.ganttpro.com/#/settings/integrations (team owner required).
 *
 * Base URL: https://api.ganttpro.com/v1.0
 *
 * Supported resources:
 *   - Projects  (GET /projects, GET /projects/{id})
 *   - Tasks     (GET /tasks?projectId=X, GET /tasks/{id})
 *   - Comments  (GET /comments?taskId=X)
 *   - Workspaces  (team via GET /team — treated as a single workspace)
 *   - Users     (GET /users, GET /users/{id})
 *
 * Not supported (auto-501): tags, webhooks.
 *
 * Paging: no list endpoint documents a paging parameter, and each returns the
 * whole collection (developer.ganttpro.com: GET /projects "Returns all active
 * projects of the team.", GET /users "Returns all members of the team."), so
 * every list is sliced to the caller's page with `pageLocally`.
 */
// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: tag — GanttPRO API has no tags/labels concept or endpoint
//              (confirmed via developer.ganttpro.com; task organisation uses
//              status, priority, and colour only)
import {
  pageLocally,
  type Credentials,
  type CredentialField,
  type QueryParams,
} from '@opensteward/shared'
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
import { GanttproClient } from './client'

import { transformProject, type RawGanttproProject } from './transform/project'
import { transformTask, type RawGanttproTask } from './transform/task'
import { transformComment, type RawGanttproComment } from './transform/comment'
import { transformWorkspace, type RawGanttproTeam } from './transform/workspace'
import { transformUser, type RawGanttproUser } from './transform/user'

// GanttPRO config is minimal — no OAuth client ID/secret needed.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface GanttproAdapterConfig {
  // intentionally empty; all auth is via credentialFields()
}

export class GanttproAdapter implements ProjectsAdapter {
  readonly platform = 'ganttpro'
  readonly version = '0.1.0'

  constructor(_config?: GanttproAdapterConfig) {}

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
    throw new Error('ganttpro uses static API key auth; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // API keys do not expire.
    return credentials
  }

  verifyWebhook(_payload: Buffer, _headers: Record<string, string>, _secret: string): boolean {
    // GanttPRO does not document webhook signature verification.
    return false
  }

  private client(credentials: Credentials): GanttproClient {
    return new GanttproClient(credentials)
  }

  // ── Projects ────────────────────────────────────────────────────────────

  async listProjects(credentials: Credentials, params: QueryParams): Promise<Project[]> {
    const res = await this.client(credentials).get<RawGanttproProject[]>('/projects')
    return pageLocally((Array.isArray(res) ? res : []).map(transformProject), params)
  }

  async getProject(credentials: Credentials, id: string): Promise<Project> {
    const res = await this.client(credentials).get<RawGanttproProject>(`/projects/${id}`)
    return transformProject(res)
  }

  // ── Tasks ────────────────────────────────────────────────────────────────

  async listTasks(
    credentials: Credentials,
    projectId: string,
    params: QueryParams,
  ): Promise<Task[]> {
    const res = await this.client(credentials).get<RawGanttproTask[]>('/tasks', {
      projectId,
    })
    return pageLocally(
      (Array.isArray(res) ? res : []).map((t) => transformTask(t, projectId)),
      params,
    )
  }

  async getTask(credentials: Credentials, id: string): Promise<Task> {
    const res = await this.client(credentials).get<RawGanttproTask>(`/tasks/${id}`)
    return transformTask(res)
  }

  // ── Comments ─────────────────────────────────────────────────────────────

  async listComments(
    credentials: Credentials,
    taskId: string,
    params: QueryParams,
  ): Promise<Comment[]> {
    const res = await this.client(credentials).get<RawGanttproComment[]>('/comments', {
      taskId,
    })
    return pageLocally(
      (Array.isArray(res) ? res : []).map((c) => transformComment(c, taskId)),
      params,
    )
  }

  async getComment(credentials: Credentials, id: string): Promise<Comment> {
    // GanttPRO does not expose a GET /comments/{id} endpoint; fetch by id
    // via the list filtered by the parent task is not feasible without context.
    // We do a best-effort by treating id as "<taskId>:<commentId>" if callers
    // embed it that way; otherwise throw a clear error.
    throw new Error(`ganttpro: getComment(${id}) not supported — no single-comment endpoint`)
  }

  // ── Workspaces (team) ────────────────────────────────────────────────────

  async listWorkspaces(credentials: Credentials, params: QueryParams): Promise<Workspace[]> {
    const res = await this.client(credentials).get<RawGanttproTeam>('/team')
    // /team returns a single object, not an array
    return pageLocally([transformWorkspace(res)], params)
  }

  async getWorkspace(credentials: Credentials, _id: string): Promise<Workspace> {
    const res = await this.client(credentials).get<RawGanttproTeam>('/team')
    return transformWorkspace(res)
  }

  // ── Users ────────────────────────────────────────────────────────────────

  async listUsers(
    credentials: Credentials,
    _workspaceId: string,
    params: QueryParams,
  ): Promise<User[]> {
    const res = await this.client(credentials).get<RawGanttproUser[]>('/users')
    return pageLocally((Array.isArray(res) ? res : []).map(transformUser), params)
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    const res = await this.client(credentials).get<RawGanttproUser>(`/users/${id}`)
    return transformUser(res)
  }
}
