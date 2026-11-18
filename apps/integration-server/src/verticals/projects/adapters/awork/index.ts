/**
 * awork adapter — awork REST API v1 → canonical projects schema.
 *
 * OAuth2 (authorization-code, confidential client) + REST. Bearer-token
 * auth; list endpoints page with `page`/`pageSize` and return bare JSON
 * arrays.
 *
 * Model notes:
 *   - Tags: GET /projects/tags returns all project tags in use (BaseTagModelWithCount);
 *     tags are name-keyed globally (no uuid at the list level) so we synthesise
 *     a stable id from the normalised tag name.
 *   - Workspace: awork is single-workspace per account. GET /me exposes the
 *     current workspace id (WorkspaceOfUser); we then call GET /workspaces/{id}
 *     for the full record (name, memberCount). listWorkspaces returns the single
 *     workspace; getWorkspace calls the workspace endpoint directly.
 *   - Subtasks → `Task.parentId` (awork `parentId`).
 *   - Comments are list-only (`GET /tasks/{taskId}/comments`); awork has no
 *     single-comment GET endpoint.
 *   - awork webhooks ship no signature/HMAC, so no `verifyWebhook`.
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * All 6 canonical resources are available for this adapter.
 */
import { pageLocally, type Credentials, type QueryParams } from '@opensteward/shared'
import type { ProjectsAdapter } from '../../adapter/interface'
import type { Project } from '../../schema/project'
import type { Task } from '../../schema/task'
import type { Comment } from '../../schema/comment'
import type { Tag } from '../../schema/tag'
import type { Workspace } from '../../schema/workspace'
import type { User } from '../../schema/user'

import { buildAuthUrl, exchangeCode as aworkExchange, refreshCredentials as aworkRefresh } from './auth'
import { AworkClient } from './client'
import { DEFAULT_PAGE_SIZE, DEFAULT_SCOPES } from './constants'

import { transformProject, type RawAworkProject } from './transform/project'
import { transformTask, type RawAworkTask } from './transform/task'
import { transformComment, type RawAworkComment } from './transform/comment'
import { transformTag, type RawAworkProjectTag } from './transform/tag'
import { transformWorkspace, type RawAworkWorkspace } from './transform/workspace'
import { transformUser, type RawAworkUser } from './transform/user'

export interface AworkAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

export class AworkAdapter implements ProjectsAdapter {
  readonly platform = 'awork'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: AworkAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes ?? DEFAULT_SCOPES
  }

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(this.clientId, this.redirectUri, overrideScopes ?? this.scopes, state)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return aworkExchange(code, redirectUri, this.clientId, this.clientSecret)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return aworkRefresh(credentials, this.clientId, this.clientSecret)
  }

  private client(credentials: Credentials): AworkClient {
    return new AworkClient(credentials)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    return {
      page: params.page ?? (params['cursor'] ? Number(params['cursor']) : 1),
      pageSize: params.limit ?? DEFAULT_PAGE_SIZE,
    }
  }

  async listProjects(credentials: Credentials, params: QueryParams): Promise<Project[]> {
    const res = await this.client(credentials).get<RawAworkProject[]>(
      '/projects',
      this.listParams(params),
    )
    return (res ?? []).map(transformProject)
  }

  async getProject(credentials: Credentials, id: string): Promise<Project> {
    const res = await this.client(credentials).get<RawAworkProject>(`/projects/${id}`)
    if (!res) throw new Error(`awork project ${id} not found`)
    return transformProject(res)
  }

  async listTasks(credentials: Credentials, projectId: string, params: QueryParams): Promise<Task[]> {
    const res = await this.client(credentials).get<RawAworkTask[]>(
      `/projects/${projectId}/tasks`,
      this.listParams(params),
    )
    return (res ?? []).map((t) => transformTask(t, projectId))
  }

  async getTask(credentials: Credentials, id: string): Promise<Task> {
    const res = await this.client(credentials).get<RawAworkTask>(`/tasks/${id}`)
    if (!res) throw new Error(`awork task ${id} not found`)
    return transformTask(res)
  }

  async listComments(credentials: Credentials, taskId: string, params: QueryParams): Promise<Comment[]> {
    const res = await this.client(credentials).get<RawAworkComment[]>(
      `/tasks/${taskId}/comments`,
      this.listParams(params),
    )
    return (res ?? []).map((c) => transformComment(c, taskId))
  }

  async listTags(credentials: Credentials, _workspaceId: string, params: QueryParams): Promise<Tag[]> {
    const res = await this.client(credentials).get<RawAworkProjectTag[]>(
      '/projects/tags',
      this.listParams(params),
    )
    return (res ?? []).map((t) => transformTag(t))
  }

  /**
   * awork is single-workspace per account. We call GET /me to retrieve the
   * current workspace id (WorkspaceOfUser), then GET /workspaces/{id} for
   * the full workspace record.
   *
   * GET /me takes no paging parameters ("Returns the current user's profile
   * together with the selected workspace."), so that one workspace is the
   * whole collection and is paged locally: page 2 is empty, not a repeat.
   */
  async listWorkspaces(credentials: Credentials, params: QueryParams): Promise<Workspace[]> {
    return pageLocally(await this.currentWorkspaces(credentials), params)
  }

  private async currentWorkspaces(credentials: Credentials): Promise<Workspace[]> {
    const me = await this.client(credentials).get<{ workspace?: { id?: string } }>('/me')
    const wsId = me?.workspace?.id
    if (!wsId) return []
    const ws = await this.client(credentials).get<RawAworkWorkspace>(`/workspaces/${wsId}`)
    if (!ws) return []
    return [transformWorkspace(ws)]
  }

  async getWorkspace(credentials: Credentials, id: string): Promise<Workspace> {
    const res = await this.client(credentials).get<RawAworkWorkspace>(`/workspaces/${id}`)
    if (!res) throw new Error(`awork workspace ${id} not found`)
    return transformWorkspace(res)
  }

  async listUsers(credentials: Credentials, _workspaceId: string, params: QueryParams): Promise<User[]> {
    const res = await this.client(credentials).get<RawAworkUser[]>(
      '/users',
      this.listParams(params),
    )
    return (res ?? []).map((u) => transformUser(u))
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    const res = await this.client(credentials).get<RawAworkUser>(`/users/${id}`)
    if (!res) throw new Error(`awork user ${id} not found`)
    return transformUser(res)
  }
}
