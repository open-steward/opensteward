/**
 * GoodDay adapter for the projects vertical.
 *
 * GoodDay uses a static API token passed as the `gd-api-token` header.
 * Base URL: https://api.goodday.work/2.0
 *
 * Supported resources: projects, tasks, comments (task messages), users.
 * Workspaces and tags are not available as discrete list endpoints in v2
 * (the organisation is the single implicit workspace).
 *
 * Webhooks: GoodDay supports outbound webhooks but does not document a
 * signature-verification scheme, so verifyWebhook / parseWebhookEvents
 * are not implemented.
 */
// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: tag       — GoodDay API v2 exposes GET /tag/{TAG-ID}/tasks but
//                          has no /tags list endpoint; tags cannot be enumerated.
// Unavailable: workspace — GoodDay has a single implicit organisation-level
//                          workspace; no workspace list or get endpoint exists.
import type { Credentials, CredentialField, QueryParams } from '@opensteward/shared'
import type { ProjectsAdapter } from '../../adapter/interface'
import type { Project } from '../../schema/project'
import type { Task } from '../../schema/task'
import type { Comment } from '../../schema/comment'
import type { User } from '../../schema/user'

import {
  credentialFields as adapterCredentialFields,
  exchangeCredentials as adapterExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import { GooddayClient } from './client'

import { transformProject, type RawGooddayProject } from './transform/project'
import { transformTask, type RawGooddayTask } from './transform/task'
import { transformComment, type RawGooddayMessage } from './transform/comment'
import { transformUser, type RawGooddayUser } from './transform/user'

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface GooddayAdapterConfig {}

export class GooddayAdapter implements ProjectsAdapter {
  readonly platform = 'goodday'
  readonly version = '0.1.0'

  constructor(_config?: GooddayAdapterConfig) {}

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
    throw new Error('GoodDay uses static API key auth; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // API tokens do not expire
    return credentials
  }

  private client(credentials: Credentials): GooddayClient {
    return new GooddayClient(credentials)
  }

  // ── Projects ───────────────────────────────────────────────────────────────

  async listProjects(credentials: Credentials, params: QueryParams): Promise<Project[]> {
    const archived = params['archived'] === 'true' ? true : undefined
    const rootOnly = params['root_only'] === 'true' ? true : undefined
    const queryParams: Record<string, unknown> = {}
    if (archived !== undefined) queryParams['archived'] = archived
    if (rootOnly !== undefined) queryParams['rootOnly'] = rootOnly

    const res = await this.client(credentials).get<RawGooddayProject[]>('/projects', queryParams)
    return (res ?? []).map(transformProject)
  }

  async getProject(credentials: Credentials, id: string): Promise<Project> {
    const res = await this.client(credentials).get<RawGooddayProject>(`/project/${id}`)
    return transformProject(res)
  }

  // ── Tasks ──────────────────────────────────────────────────────────────────

  async listTasks(credentials: Credentials, projectId: string, params: QueryParams): Promise<Task[]> {
    const closed = params['closed'] === 'true' ? true : undefined
    const queryParams: Record<string, unknown> = {}
    if (closed !== undefined) queryParams['closed'] = closed

    const res = await this.client(credentials).get<RawGooddayTask[]>(
      `/project/${projectId}/tasks`,
      queryParams,
    )
    return (res ?? []).map((t) => transformTask(t, projectId))
  }

  async getTask(credentials: Credentials, id: string): Promise<Task> {
    const res = await this.client(credentials).get<RawGooddayTask>(`/task/${id}`)
    return transformTask(res)
  }

  // ── Comments (task messages) ───────────────────────────────────────────────

  async listComments(
    credentials: Credentials,
    taskId: string,
    _params: QueryParams,
  ): Promise<Comment[]> {
    const res = await this.client(credentials).get<RawGooddayMessage[]>(
      `/task/${taskId}/messages`,
    )
    return (res ?? []).map((m) => transformComment(m, taskId))
  }

  // ── Users ──────────────────────────────────────────────────────────────────

  async listUsers(
    credentials: Credentials,
    _workspaceId: string,
    _params: QueryParams,
  ): Promise<User[]> {
    const res = await this.client(credentials).get<RawGooddayUser[]>('/users')
    return (res ?? []).map((u) => transformUser(u))
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    const res = await this.client(credentials).get<RawGooddayUser>(`/user/${id}`)
    return transformUser(res)
  }
}
