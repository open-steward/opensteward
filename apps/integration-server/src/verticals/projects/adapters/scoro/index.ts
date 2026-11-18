/**
 * Scoro adapter for the projects vertical.
 *
 * Scoro is an all-in-one business management platform with a rich
 * project + task hierarchy. Auth: static API key passed in every POST
 * body. Base URL is per-account: https://{companyAccountId}.scoro.com/api/v2
 *
 * Supported resources: projects, tasks, comments, tags, workspaces (company accounts), users.
 *
 * Docs: https://api.scoro.com/api/v2
 */
import { reportUpstreamPage } from '@opensteward/shared'
import type { Credentials, CredentialField, QueryParams } from '@opensteward/shared'
import type { ProjectsAdapter } from '../../adapter/interface'
import type { Project } from '../../schema/project'
import type { Task } from '../../schema/task'
import type { Comment } from '../../schema/comment'
import type { Tag } from '../../schema/tag'
import type { Workspace } from '../../schema/workspace'
import type { User } from '../../schema/user'
import {
  credentialFields as adapterCredentialFields,
  exchangeCredentials as adapterExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import { ScoroClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformProject, type RawScoroProject } from './transform/project'
import { transformTask, type RawScoroTask } from './transform/task'
import { transformComment, type RawScoroComment } from './transform/comment'
import { transformTag, type RawScoroTag } from './transform/tag'
import { transformWorkspace, type RawScoroCompanyAccount } from './transform/workspace'
import { transformUser, type RawScoroUser } from './transform/user'

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ScoroAdapterConfig {}

export class ScoroAdapter implements ProjectsAdapter {
  readonly platform = 'scoro'
  readonly version = '0.1.0'
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  constructor(_config: ScoroAdapterConfig = {}) {}

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
    throw new Error('Scoro uses static API key auth; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // API keys do not expire
    return credentials
  }

  private client(credentials: Credentials): ScoroClient {
    return new ScoroClient(credentials)
  }

  /**
   * One caller page of a Scoro `/{module}/list`. Scoro v2 "Request Limits":
   * "A maximum of 100 results will be returned for list methods, regardless of
   * the value sent with the per_page parameter. The page paramater can be used
   * to request additional items." The caller's 1-based `page` is sent as is and
   * its limit, clamped to {@link MAX_PAGE_SIZE}, as `per_page`.
   *
   * No list response documents a page count or total, so after a full page a
   * one-row look-ahead (`per_page: 1`, `page: page × size + 1` — exactly the
   * next row) says whether another page follows. A short page is the end.
   */
  private async listPage<T>(
    credentials: Credentials,
    module: string,
    params: QueryParams,
    request?: Record<string, unknown>,
    filter?: Record<string, unknown>,
  ): Promise<T[]> {
    const limit = params.limit ?? DEFAULT_PAGE_SIZE
    const size = Math.max(1, Math.min(Math.floor(limit), MAX_PAGE_SIZE))
    const raw = params.page
    const page = typeof raw === 'number' && Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : 1
    const client = this.client(credentials)
    const { items } = await client.list<T>(module, page, size, request, filter)
    let hasMore = false
    if (items.length >= size) {
      const next = await client.list<T>(module, page * size + 1, 1, request, filter)
      hasMore = next.items.length > 0
    }
    reportUpstreamPage(params, { hasMore, ...(size < limit ? { pageSize: size } : {}) })
    return items
  }

  // ── Projects ────────────────────────────────────────────────────────────

  async listProjects(credentials: Credentials, params: QueryParams): Promise<Project[]> {
    const filter: Record<string, unknown> = {}
    if (params['workspace_id']) filter['company_id'] = params['workspace_id']

    const items = await this.listPage<RawScoroProject>(
      credentials,
      'projects',
      params,
      undefined,
      Object.keys(filter).length ? filter : undefined,
    )
    return items.map(transformProject)
  }

  async getProject(credentials: Credentials, id: string): Promise<Project> {
    const raw = await this.client(credentials).view<RawScoroProject>('projects', id)
    if (!raw) throw new Error(`Scoro project ${id} not found`)
    return transformProject(raw)
  }

  // ── Tasks ────────────────────────────────────────────────────────────────

  async listTasks(
    credentials: Credentials,
    projectId: string,
    params: QueryParams,
  ): Promise<Task[]> {
    const filter: Record<string, unknown> = { project_id: Number(projectId) }

    const items = await this.listPage<RawScoroTask>(
      credentials,
      'tasks',
      params,
      { include_subtasks: 1 },
      filter,
    )
    return items.map((t) => transformTask(t, projectId))
  }

  async getTask(credentials: Credentials, id: string): Promise<Task> {
    const raw = await this.client(credentials).view<RawScoroTask>('tasks', id)
    if (!raw) throw new Error(`Scoro task ${id} not found`)
    return transformTask(raw)
  }

  // ── Comments ─────────────────────────────────────────────────────────────

  async listComments(
    credentials: Credentials,
    taskId: string,
    params: QueryParams,
  ): Promise<Comment[]> {
    // Scoro comments are filtered by module + object_id in the request body
    const items = await this.listPage<RawScoroComment>(credentials, 'comments', params, {
      module: 'tasks',
      object_id: Number(taskId),
    })
    return items.map((c) => transformComment(c, taskId))
  }

  async getComment(credentials: Credentials, id: string): Promise<Comment> {
    const raw = await this.client(credentials).view<RawScoroComment>('comments', id)
    if (!raw) throw new Error(`Scoro comment ${id} not found`)
    return transformComment(raw)
  }

  // ── Tags ─────────────────────────────────────────────────────────────────

  async listTags(
    credentials: Credentials,
    _workspaceId: string,
    params: QueryParams,
  ): Promise<Tag[]> {
    const items = await this.listPage<RawScoroTag>(credentials, 'tags', params)
    return items.map(transformTag)
  }

  async getTag(credentials: Credentials, id: string): Promise<Tag> {
    const raw = await this.client(credentials).view<RawScoroTag>('tags', id)
    if (!raw) throw new Error(`Scoro tag ${id} not found`)
    return transformTag(raw)
  }

  // ── Workspaces (company accounts) ────────────────────────────────────────

  async listWorkspaces(credentials: Credentials, params: QueryParams): Promise<Workspace[]> {
    const items = await this.listPage<RawScoroCompanyAccount>(credentials, 'companyAccount', params)
    return items.map(transformWorkspace)
  }

  async getWorkspace(credentials: Credentials, id: string): Promise<Workspace> {
    const raw = await this.client(credentials).view<RawScoroCompanyAccount>('companyAccount', id)
    if (!raw) throw new Error(`Scoro company account ${id} not found`)
    return transformWorkspace(raw)
  }

  // ── Users ────────────────────────────────────────────────────────────────

  async listUsers(
    credentials: Credentials,
    _workspaceId: string,
    params: QueryParams,
  ): Promise<User[]> {
    const companyAccountId = String(credentials.extra?.['companyAccountId'] ?? '')
    const items = await this.listPage<RawScoroUser>(credentials, 'users', params)
    return items.map((u) => transformUser(u, companyAccountId))
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    const companyAccountId = String(credentials.extra?.['companyAccountId'] ?? '')
    const raw = await this.client(credentials).view<RawScoroUser>('users', id)
    if (!raw) throw new Error(`Scoro user ${id} not found`)
    return transformUser(raw, companyAccountId)
  }
}
