/**
 * Notion adapter for the projects vertical.
 *
 * Notion has no first-class project/task/tag/workspace model, so this adapter
 * maps Notion's structure onto the canonical schema:
 *   - Project   ← data source  (the queryable table behind a Notion database)
 *   - Task      ← page          (a row inside a data source)
 *   - Comment   ← comment       (on a page or block)
 *   - User      ← workspace user
 *   - Workspace ← derived from GET /users/me (bot.workspace_id / bot.workspace_name)
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: tag — Notion has no tag or label concept exposed via the REST API
 */
import {
  connectionScope,
  cursorPagerKey,
  pageByCursor,
  pageByRows,
  pageLocally,
  reportUpstreamPage,
} from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import type { ProjectsAdapter } from '../../adapter/interface'
import type { Project } from '../../schema/project'
import type { Task } from '../../schema/task'
import type { Comment } from '../../schema/comment'
import type { User } from '../../schema/user'
import type { Workspace } from '../../schema/workspace'
import type { WebhookEvent } from '../../schema/webhook'

import {
  buildAuthUrl,
  exchangeCode as notionExchange,
  refreshCredentials as notionRefresh,
} from './auth'
import { NotionClient } from './client'
import { DEFAULT_PAGE_SIZE, DEFAULT_SCOPES, MAX_PAGE_SIZE } from './constants'
import { verifyNotionWebhook, parseNotionWebhookEvents } from './webhook'

import { transformProject, type RawNotionDataSource } from './transform/project'
import { transformTask, type RawNotionPage } from './transform/task'
import { transformComment, type RawNotionComment } from './transform/comment'
import { transformUser, type RawNotionUser } from './transform/user'
import { transformWorkspace, type RawNotionBotUser } from './transform/workspace'

export interface NotionAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

/** Notion's cursor-paginated list envelope. */
interface ListResponse<T> {
  object?: string
  results?: T[]
  has_more?: boolean
  next_cursor?: string | null
}

export class NotionAdapter implements ProjectsAdapter {
  readonly platform = 'notion'
  readonly version = '0.1.0'
  /** Honours `params.search`; see AdapterCapabilities. Declared so the
   *  router can refuse the parameter on adapters that would drop it. */
  readonly capabilities = { search: true, maxPageSize: MAX_PAGE_SIZE }

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: NotionAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes ?? DEFAULT_SCOPES
  }

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(this.clientId, this.redirectUri, overrideScopes ?? this.scopes, state)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return notionExchange(code, redirectUri, this.clientId, this.clientSecret)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return notionRefresh(credentials, this.clientId, this.clientSecret)
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyNotionWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseNotionWebhookEvents(payload)
  }

  private client(credentials: Credentials): NotionClient {
    return new NotionClient(credentials)
  }

  private pageSize(params: QueryParams): number {
    const limit = params.limit
    const asked =
      typeof limit === 'number' && Number.isFinite(limit) && limit >= 1
        ? Math.floor(limit)
        : DEFAULT_PAGE_SIZE
    return Math.min(asked, MAX_PAGE_SIZE)
  }

  private cursor(params: QueryParams): string | undefined {
    return params['cursor'] ? String(params['cursor']) : undefined
  }

  /** Per-connection pager scope: the workspace the token belongs to, plus a token fingerprint. */
  private scope(credentials: Credentials): string {
    const extra = credentials.extra ?? {}
    const account = String(extra['workspaceId'] ?? extra['botId'] ?? 'notion')
    return connectionScope(`notion:${account}`, credentials)
  }

  /**
   * One caller page of a Notion `page_size` / `start_cursor` list
   * (https://developers.notion.com/reference/intro): one upstream page per
   * caller page, walking `next_cursor` forward while `has_more` is true.
   *
   * An explicit `cursor` param names the upstream page directly. Otherwise
   * `page` is resolved through the cursor pager, keyed per connection,
   * collection and page size.
   */
  private async listPaged<T>(
    credentials: Credentials,
    collection: string,
    params: QueryParams,
    fetch: (size: number, cursor: string | undefined) => Promise<ListResponse<T>>,
  ): Promise<T[]> {
    const size = this.pageSize(params)
    const page = async (cursor: string | undefined) => {
      const res = await fetch(size, cursor)
      return {
        items: res.results ?? [],
        next: res.has_more && res.next_cursor ? res.next_cursor : null,
      }
    }
    const explicit = this.cursor(params)
    let result: { items: T[]; hasMore: boolean }
    if (explicit !== undefined) {
      const res = await page(explicit)
      result = { items: res.items, hasMore: res.next !== null }
    } else {
      const key = cursorPagerKey(this.scope(credentials), collection, { limit: size })
      result = await pageByCursor<T>(key, params.page, page)
    }
    const limit = params.limit
    const clamped = typeof limit === 'number' && limit > size
    reportUpstreamPage(params, { hasMore: result.hasMore, ...(clamped ? { pageSize: size } : {}) })
    return result.items
  }

  // ── Projects (Notion data sources) ─────────────────────────────────────────

  async listProjects(credentials: Credentials, params: QueryParams): Promise<Project[]> {
    const client = this.client(credentials)
    const query = params.search ? String(params.search) : undefined
    const rows = await this.listPaged<RawNotionDataSource>(
      credentials,
      `search:data_source:${query ?? ''}`,
      params,
      (size, start) =>
        client.post<ListResponse<RawNotionDataSource>>('/search', {
          filter: { property: 'object', value: 'data_source' },
          page_size: size,
          ...(start ? { start_cursor: start } : {}),
          ...(query ? { query } : {}),
        }),
    )
    return rows.map(transformProject)
  }

  async getProject(credentials: Credentials, id: string): Promise<Project> {
    const res = await this.client(credentials).get<RawNotionDataSource>(`/data_sources/${id}`)
    if (!res?.id) throw new Error(`Notion data source ${id} not found`)
    return transformProject(res)
  }

  // ── Tasks (Notion pages / data-source rows) ────────────────────────────────

  async listTasks(
    credentials: Credentials,
    projectId: string,
    params: QueryParams,
  ): Promise<Task[]> {
    const client = this.client(credentials)
    const path = `/data_sources/${projectId}/query`
    const rows = await this.listPaged<RawNotionPage>(credentials, path, params, (size, start) =>
      client.post<ListResponse<RawNotionPage>>(path, {
        page_size: size,
        ...(start ? { start_cursor: start } : {}),
      }),
    )
    return rows.map((p) => transformTask(p, projectId))
  }

  async getTask(credentials: Credentials, id: string): Promise<Task> {
    const res = await this.client(credentials).get<RawNotionPage>(`/pages/${id}`)
    if (!res?.id) throw new Error(`Notion page ${id} not found`)
    return transformTask(res)
  }

  // ── Comments ───────────────────────────────────────────────────────────────

  async listComments(
    credentials: Credentials,
    taskId: string,
    params: QueryParams,
  ): Promise<Comment[]> {
    const client = this.client(credentials)
    const rows = await this.listPaged<RawNotionComment>(
      credentials,
      `/comments?block_id=${taskId}`,
      params,
      (size, start) =>
        client.get<ListResponse<RawNotionComment>>('/comments', {
          block_id: taskId,
          page_size: size,
          ...(start ? { start_cursor: start } : {}),
        }),
    )
    return rows.map((c) => transformComment(c, taskId))
  }

  async getComment(credentials: Credentials, id: string): Promise<Comment> {
    const res = await this.client(credentials).get<RawNotionComment>(`/comments/${id}`)
    if (!res?.id) throw new Error(`Notion comment ${id} not found`)
    return transformComment(res)
  }

  // ── Users ──────────────────────────────────────────────────────────────────

  async listUsers(
    credentials: Credentials,
    workspaceId: string,
    params: QueryParams,
  ): Promise<User[]> {
    const client = this.client(credentials)
    const fetchPage = async (size: number, start: string | undefined) => {
      const res = await client.get<ListResponse<RawNotionUser>>('/users', {
        page_size: size,
        ...(start ? { start_cursor: start } : {}),
      })
      return {
        items: (res.results ?? []).filter((u) => u.type !== 'bot'),
        next: res.has_more && res.next_cursor ? res.next_cursor : null,
      }
    }
    const toUser = (u: RawNotionUser) => transformUser(u, workspaceId || undefined)

    // An explicit cursor names one upstream page; serve it as Notion returns it.
    const explicit = this.cursor(params)
    if (explicit !== undefined) {
      const res = await fetchPage(this.pageSize(params), explicit)
      reportUpstreamPage(params, { hasMore: res.next !== null })
      return res.items.map(toUser)
    }

    // Bots are dropped from each upstream page, so one upstream page is not
    // one caller page: cut the people stream into caller pages by rows,
    // reading upstream at the documented maximum.
    const key = cursorPagerKey(this.scope(credentials), '/users:people', {
      page_size: MAX_PAGE_SIZE,
    })
    const result = await pageByRows<RawNotionUser>(
      key,
      params,
      (start) => fetchPage(MAX_PAGE_SIZE, start),
      { defaultLimit: DEFAULT_PAGE_SIZE },
    )
    return result.items.map(toUser)
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    const res = await this.client(credentials).get<RawNotionUser>(`/users/${id}`)
    if (!res?.id) throw new Error(`Notion user ${id} not found`)
    return transformUser(res)
  }

  // ── Workspaces ─────────────────────────────────────────────────────────────
  // Notion has no /workspaces endpoint. The bot-user object at GET /users/me
  // carries workspace_id and workspace_name; a token always scopes to exactly
  // one workspace, so listWorkspaces returns a single-element array.

  async listWorkspaces(credentials: Credentials, params: QueryParams): Promise<Workspace[]> {
    const res = await this.client(credentials).get<RawNotionBotUser>('/users/me')
    // The whole collection is this one workspace; page it locally.
    return pageLocally(res?.id ? [transformWorkspace(res)] : [], params)
  }

  async getWorkspace(credentials: Credentials, id: string): Promise<Workspace> {
    const res = await this.client(credentials).get<RawNotionBotUser>('/users/me')
    if (!res?.id) throw new Error(`Notion workspace ${id} not found`)
    const ws = transformWorkspace(res)
    if (ws.id !== id) throw new Error(`Notion workspace ${id} not found`)
    return ws
  }
}
