/**
 * Fieldwire adapter for the projects vertical.
 *
 * Auth: API token (api_key) — user supplies a long-lived Fieldwire API token
 * which is exchanged for a short-lived Bearer JWT per the /api_keys/jwt
 * endpoint before each client construction.
 *
 * Supported resources:
 *   - listProjects / getProject    (GET /api/v3/projects)
 *   - listTasks / getTask          (GET /api/v3/projects/:id/tasks)
 *   - listComments / getComment    (GET /api/v3/projects/:id/tasks/:id/bubbles)
 *   - listTags / getTag            (GET /api/v3/projects/:id/entity_tags)
 *   - listUsers / getUser          (GET /api/v3/account/projects/:id/users)
 *
 * Workspaces are not enumerable via a standard list endpoint (accounts are
 * returned in project objects); listWorkspaces/getWorkspace are not implemented.
 *
 * Pagination (https://developers.fieldwire.com/docs/pagination): the page size
 * is the `Fieldwire-Per-Page` request header (default 50, max 1000) and the
 * next page is `last_synced_at` = the previous response's `X-Last-Synced-At`,
 * with `X-Has-More` saying whether one exists. `pageByCursor` walks that chain
 * so caller page N is upstream page N at the caller's size. The account
 * project-users endpoint documents none of these and returns the whole list,
 * so listUsers pages it locally.
 *
 * Docs: https://developers.fieldwire.com/docs/getting-started
 */
import {
  connectionScope,
  cursorPagerKey,
  pageByCursor,
  pageLocally,
  reportUpstreamPage,
} from '@opensteward/shared'
import type { Credentials, CredentialField, QueryParams } from '@opensteward/shared'
import type { ProjectsAdapter } from '../../adapter/interface'
import type { Project } from '../../schema/project'
import type { Task } from '../../schema/task'
import type { Comment } from '../../schema/comment'
import type { Tag } from '../../schema/tag'
import type { User } from '../../schema/user'
import {
  credentialFields as adapterCredentialFields,
  exchangeCredentials as adapterExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import { FieldwireClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformProject, type RawFieldwireProject } from './transform/project'
import { transformTask, type RawFieldwireTask } from './transform/task'
import { transformComment, type RawFieldwireBubble } from './transform/comment'
import { transformTag, type RawFieldwireEntityTag } from './transform/tag'
import { transformUser, type RawFieldwireUser } from './transform/user'

export interface FieldwireAdapterConfig {
  /** Unused — Fieldwire uses API key auth. Present for interface compatibility. */
  clientId?: string
  clientSecret?: string
  redirectUri?: string
}

export class FieldwireAdapter implements ProjectsAdapter {
  readonly platform = 'fieldwire'
  readonly version = '0.1.0'
  /** `Fieldwire-Per-Page` "(default: 50, max: 1000)"; listUsers pages locally. */
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  constructor(_config?: FieldwireAdapterConfig) {}

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
    throw new Error('fieldwire uses API key auth; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // API tokens are long-lived; JWT re-exchange happens inside the client
    return credentials
  }

  private client(credentials: Credentials): FieldwireClient {
    return new FieldwireClient(credentials)
  }

  /** The caller's limit, clamped to Fieldwire's documented 1..1000. */
  private pageSize(params: QueryParams): number {
    const limit = params.limit
    const asked =
      typeof limit === 'number' && Number.isFinite(limit) && limit >= 1
        ? Math.floor(limit)
        : DEFAULT_PAGE_SIZE
    return Math.min(asked, MAX_PAGE_SIZE)
  }

  private cursor(params: QueryParams): string | undefined {
    const c = params['cursor']
    return typeof c === 'string' && c.length > 0 ? c : undefined
  }

  /**
   * One caller page of a `Fieldwire-Per-Page` / `last_synced_at` list.
   *
   * An explicit `cursor` param names the upstream page directly. Otherwise
   * `page` is resolved by walking `X-Last-Synced-At` forward, one upstream
   * page per caller page, keyed per connection, path and page size.
   */
  private async listPaged<T>(
    credentials: Credentials,
    path: string,
    params: QueryParams,
  ): Promise<T[]> {
    const client = this.client(credentials)
    const size = this.pageSize(params)
    const explicit = this.cursor(params)
    let result: { items: T[]; hasMore: boolean }
    if (explicit !== undefined) {
      const res = await client.getPage<T>(path, explicit, size)
      result = { items: res.items, hasMore: res.hasMore }
    } else {
      const key = cursorPagerKey(connectionScope('fieldwire', credentials), path, { limit: size })
      result = await pageByCursor<T>(key, params.page, async (cursor) => {
        const res = await client.getPage<T>(path, cursor, size)
        return { items: res.items, next: res.hasMore ? (res.lastSyncedAt ?? null) : null }
      })
    }
    const limit = params.limit
    const clamped = typeof limit === 'number' && limit > size
    reportUpstreamPage(params, { hasMore: result.hasMore, ...(clamped ? { pageSize: size } : {}) })
    return result.items
  }

  // ── Projects ───────────────────────────────────────────────────────────────

  async listProjects(credentials: Credentials, params: QueryParams): Promise<Project[]> {
    const items = await this.listPaged<RawFieldwireProject>(credentials, '/projects', params)
    return items.map(transformProject)
  }

  async getProject(credentials: Credentials, id: string): Promise<Project> {
    const item = await this.client(credentials).get<RawFieldwireProject>(`/projects/${id}`)
    return transformProject(item)
  }

  // ── Tasks ──────────────────────────────────────────────────────────────────

  async listTasks(
    credentials: Credentials,
    projectId: string,
    params: QueryParams,
  ): Promise<Task[]> {
    const items = await this.listPaged<RawFieldwireTask>(
      credentials,
      `/projects/${projectId}/tasks`,
      params,
    )
    return items.map((t) => transformTask(t, projectId))
  }

  async getTask(credentials: Credentials, id: string): Promise<Task> {
    // id must be in '{projectId}:{taskId}' form because Fieldwire's single-task
    // endpoint is GET /projects/:projectId/tasks/:taskId — there is no global /tasks/:id.
    const sep = id.indexOf(':')
    if (sep === -1) {
      throw new Error(`Fieldwire task id must be in '{projectId}:{taskId}' form; got '${id}'.`)
    }
    const projectId = id.slice(0, sep)
    const taskId = id.slice(sep + 1)
    const item = await this.client(credentials).get<RawFieldwireTask>(
      `/projects/${projectId}/tasks/${taskId}`,
    )
    return transformTask(item, projectId)
  }

  // ── Comments (Bubbles) ────────────────────────────────────────────────────

  async listComments(
    credentials: Credentials,
    taskId: string,
    params: QueryParams,
  ): Promise<Comment[]> {
    // taskId must be in '{projectId}:{taskId}' form; Fieldwire's bubbles-in-task endpoint is
    // GET /projects/:projectId/tasks/:taskId/bubbles — there is no global equivalent.
    const sep = taskId.indexOf(':')
    if (sep === -1) {
      throw new Error(
        `Fieldwire listComments taskId must be in '{projectId}:{taskId}' form; got '${taskId}'.`,
      )
    }
    const projectId = taskId.slice(0, sep)
    const tid = taskId.slice(sep + 1)
    const items = await this.listPaged<RawFieldwireBubble>(
      credentials,
      `/projects/${projectId}/tasks/${tid}/bubbles`,
      params,
    )
    return items.map((b) => transformComment(b, tid, projectId))
  }

  async getComment(credentials: Credentials, id: string): Promise<Comment> {
    // id must be in '{projectId}:{bubbleId}' form because the single-bubble endpoint is
    // GET /projects/:projectId/bubbles/:bubbleId — there is no global /bubbles/:id.
    const sep = id.indexOf(':')
    if (sep === -1) {
      throw new Error(`Fieldwire comment id must be in '{projectId}:{bubbleId}' form; got '${id}'.`)
    }
    const projectId = id.slice(0, sep)
    const bubbleId = id.slice(sep + 1)
    const item = await this.client(credentials).get<RawFieldwireBubble>(
      `/projects/${projectId}/bubbles/${bubbleId}`,
    )
    return transformComment(item, item.task_id, projectId)
  }

  // ── Tags (Entity Tags) ────────────────────────────────────────────────────

  async listTags(credentials: Credentials, projectId: string, params: QueryParams): Promise<Tag[]> {
    const items = await this.listPaged<RawFieldwireEntityTag>(
      credentials,
      `/projects/${projectId}/entity_tags`,
      params,
    )
    return items.map((t) => transformTag(t, projectId))
  }

  async getTag(credentials: Credentials, id: string): Promise<Tag> {
    const item = await this.client(credentials).get<RawFieldwireEntityTag>(`/entity_tags/${id}`)
    return transformTag(item)
  }

  // ── Users ─────────────────────────────────────────────────────────────────

  async listUsers(
    credentials: Credentials,
    projectId: string,
    params: QueryParams,
  ): Promise<User[]> {
    // Documents no Fieldwire-Per-Page, last_synced_at or X-Has-More: the whole list.
    const all = await this.client(credentials).get<RawFieldwireUser[]>(
      `/account/projects/${projectId}/users`,
    )
    return pageLocally(Array.isArray(all) ? all : [], params).map((u) =>
      transformUser(u, projectId),
    )
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    const item = await this.client(credentials).get<RawFieldwireUser>(`/users/${id}`)
    return transformUser(item)
  }
}
