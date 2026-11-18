/**
 * Aha! adapter for the projects vertical.
 *
 * Resource mapping (Aha! → canonical):
 *   Product  → Workspace   (top-level container)
 *   Release  → Project     (time-boxed deliverable, has start/release dates)
 *   Feature  → Task        (work item, workflow_status + assignee + tags)
 *   Comment  → Comment      (per-feature comment thread)
 *   User     → User
 *
 * Aha! exposes no stand-alone tag resource (tags are inline string arrays on
 * features), so `listTags` / `getTag` are intentionally not implemented and
 * auto-501. Aha! documents no outgoing-webhook signature verification, so the
 * webhook methods are omitted as well.
 *
 * ── Resource coverage ──────────────────────────────────────────────────────
 * Unavailable: tag — Aha! has no /tags endpoint; tags are plain strings
 *   embedded on features with no id or color, and cannot satisfy the canonical
 *   Tag schema.
 *
 * Auth: OAuth2 authorization-code grant, long-lived Bearer access tokens.
 *
 * Docs: https://www.aha.io/api
 */
import type { Credentials, QueryParams } from '@opensteward/shared'
import type { ProjectsAdapter } from '../../adapter/interface'
import type { Project } from '../../schema/project'
import type { Task } from '../../schema/task'
import type { Comment } from '../../schema/comment'
import type { Workspace } from '../../schema/workspace'
import type { User } from '../../schema/user'

import { buildAuthUrl, exchangeCode as ahaExchange, refreshCredentials as ahaRefresh } from './auth'
import { AhaClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformProject, type RawAhaRelease } from './transform/project'
import { transformTask, type RawAhaFeature } from './transform/task'
import { transformComment, type RawAhaComment } from './transform/comment'
import { transformWorkspace, type RawAhaProduct } from './transform/workspace'
import { transformUser, type RawAhaUser } from './transform/user'

export interface AhaAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

/**
 * Aha! list responses wrap the records under a resource-named key alongside a
 * `pagination` array, e.g. `{ pagination: [...], features: [...] }`.
 */
type ListResponse = Record<string, unknown>

function pickList<T>(res: ListResponse, key: string): T[] {
  const arr = res[key]
  return Array.isArray(arr) ? (arr as T[]) : []
}

export class AhaAdapter implements ProjectsAdapter {
  readonly platform = 'aha'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: AhaAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes ?? []
  }

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(this.clientId, this.redirectUri, overrideScopes ?? this.scopes, state)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return ahaExchange(code, redirectUri, this.clientId, this.clientSecret)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return ahaRefresh(credentials, this.clientId, this.clientSecret)
  }

  private client(credentials: Credentials): AhaClient {
    return new AhaClient(credentials)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    const perPage = Math.min(Number(params.limit ?? DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE)
    return {
      per_page: perPage,
      ...(params.page ? { page: Number(params.page) } : {}),
    }
  }

  // ── Workspaces ← Products ─────────────────────────────────────────────────
  async listWorkspaces(credentials: Credentials, params: QueryParams): Promise<Workspace[]> {
    const res = await this.client(credentials).get<ListResponse>('/products', this.listParams(params))
    return pickList<RawAhaProduct>(res, 'products').map(transformWorkspace)
  }

  async getWorkspace(credentials: Credentials, id: string): Promise<Workspace> {
    const res = await this.client(credentials).get<{ product?: RawAhaProduct }>(`/products/${id}`)
    if (!res.product) throw new Error(`Aha product ${id} not found`)
    return transformWorkspace(res.product)
  }

  // ── Projects ← Releases ───────────────────────────────────────────────────
  async listProjects(credentials: Credentials, params: QueryParams): Promise<Project[]> {
    const productId = params['workspace_id'] ?? params['product_id']
    const path = productId ? `/products/${productId}/releases` : '/releases'
    const res = await this.client(credentials).get<ListResponse>(path, this.listParams(params))
    const workspaceId = productId ? String(productId) : undefined
    return pickList<RawAhaRelease>(res, 'releases').map((r) => transformProject(r, workspaceId))
  }

  async getProject(credentials: Credentials, id: string): Promise<Project> {
    const res = await this.client(credentials).get<{ release?: RawAhaRelease }>(`/releases/${id}`)
    if (!res.release) throw new Error(`Aha release ${id} not found`)
    return transformProject(res.release)
  }

  // ── Tasks ← Features ──────────────────────────────────────────────────────
  async listTasks(credentials: Credentials, projectId: string, params: QueryParams): Promise<Task[]> {
    const res = await this.client(credentials).get<ListResponse>(
      `/releases/${projectId}/features`,
      this.listParams(params),
    )
    return pickList<RawAhaFeature>(res, 'features').map((f) => transformTask(f, projectId))
  }

  async getTask(credentials: Credentials, id: string): Promise<Task> {
    const res = await this.client(credentials).get<{ feature?: RawAhaFeature }>(`/features/${id}`)
    if (!res.feature) throw new Error(`Aha feature ${id} not found`)
    return transformTask(res.feature)
  }

  // ── Comments ← Feature comments ───────────────────────────────────────────
  async listComments(credentials: Credentials, taskId: string, params: QueryParams): Promise<Comment[]> {
    const res = await this.client(credentials).get<ListResponse>(
      `/features/${taskId}/comments`,
      this.listParams(params),
    )
    return pickList<RawAhaComment>(res, 'comments').map((c) => transformComment(c, taskId))
  }

  // ── Users ─────────────────────────────────────────────────────────────────
  async listUsers(credentials: Credentials, workspaceId: string, params: QueryParams): Promise<User[]> {
    const res = await this.client(credentials).get<ListResponse>('/users', this.listParams(params))
    return pickList<RawAhaUser>(res, 'users').map((u) => transformUser(u, workspaceId || undefined))
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    const res = await this.client(credentials).get<{ user?: RawAhaUser }>(`/users/${id}`)
    if (!res.user) throw new Error(`Aha user ${id} not found`)
    return transformUser(res.user)
  }
}
