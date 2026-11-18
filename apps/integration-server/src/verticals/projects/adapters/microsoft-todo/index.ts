/**
 * Microsoft To Do adapter (Microsoft Graph REST API).
 *
 * To Do has a single level of grouping: the `todoTaskList`, which maps onto
 * the canonical `Project`. Tasks (`todoTask`) live inside a list. There is no
 * org/workspace tier above the mailbox, so a single synthetic `Workspace`
 * (the `/me` user) parents every list.
 *
 * ── Resource coverage ──────────────────────────────────────────────────────
 * Unavailable: comment — Microsoft To Do has no comment entity; the task
 *   `body` field is a single description (not threaded), and `checklistItems`
 *   are subtasks, not comments.
 *
 * ── Paging ─────────────────────────────────────────────────────────────────
 * Graph collections take `$top` and answer with an absolute
 * `@odata.nextLink` while more rows remain
 * (https://learn.microsoft.com/en-us/graph/paging). The guide also warns that
 * "A page of results might contain zero or more results" and that a `$top`
 * above an API's maximum "might be ignored", so one upstream page is not
 * reliably one caller page: lists, tasks and categories cut the caller's rows
 * out of the nextLink chain with `pageByRows`. No `maxPageSize` is
 * declared: Microsoft documents none for these endpoints. Workspaces and
 * users are the single `/me` object, paged locally.
 */
import { connectionScope, cursorPagerKey, pageByRows, pageLocally } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import type { ProjectsAdapter } from '../../adapter/interface'
import type { Project } from '../../schema/project'
import type { Tag } from '../../schema/tag'
import type { Task } from '../../schema/task'
import type { User } from '../../schema/user'
import type { Workspace } from '../../schema/workspace'
import type { WebhookEvent } from '../../schema/webhook'

import {
  buildAuthUrl,
  exchangeCode as microsoftTodoExchange,
  refreshCredentials as microsoftTodoRefresh,
} from './auth'
import { MicrosoftTodoClient } from './client'
import { DEFAULT_PAGE_SIZE, DEFAULT_SCOPES } from './constants'
import { verifyMicrosoftTodoWebhook, parseMicrosoftTodoWebhookEvents } from './webhook'

import { transformProject, type RawTodoTaskList } from './transform/project'
import { transformTag, type RawOutlookCategory } from './transform/tag'
import { transformTask, type RawTodoTask } from './transform/task'
import { transformUser } from './transform/user'
import { transformWorkspace, type RawMeUser } from './transform/workspace'

export interface MicrosoftTodoAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

/** Synthetic workspace id for the signed-in mailbox (no org tier in To Do). */
const ME_WORKSPACE_ID = 'me'

export class MicrosoftTodoAdapter implements ProjectsAdapter {
  readonly platform = 'microsoft-todo'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: MicrosoftTodoAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes ?? DEFAULT_SCOPES
  }

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(this.clientId, this.redirectUri, overrideScopes ?? this.scopes, state)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return microsoftTodoExchange(code, redirectUri, this.clientId, this.clientSecret)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return microsoftTodoRefresh(credentials, this.clientId, this.clientSecret)
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyMicrosoftTodoWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseMicrosoftTodoWebhookEvents(payload)
  }

  private client(credentials: Credentials): MicrosoftTodoClient {
    return new MicrosoftTodoClient(credentials)
  }

  /** The `$top` sent upstream: the caller's page size. */
  private pageSize(params: QueryParams): number {
    const n = Number(params.limit)
    return Number.isFinite(n) && n >= 1 ? Math.floor(n) : DEFAULT_PAGE_SIZE
  }

  /**
   * The caller's page of the Graph collection at `path`, cut out of the
   * `@odata.nextLink` chain with `hasMore` exact. The pager key names the
   * connection, the collection and the `$top` that minted the chain.
   */
  private async listRows<T>(credentials: Credentials, path: string, params: QueryParams): Promise<T[]> {
    const client = this.client(credentials)
    const first = { $top: this.pageSize(params) }
    const key = cursorPagerKey(connectionScope('microsoft-todo', credentials), path, first)
    const page = await pageByRows<T, string>(
      key,
      params,
      (nextLink) => client.getPage<T>(path, first, nextLink),
      { defaultLimit: DEFAULT_PAGE_SIZE },
    )
    return page.items
  }

  // ── Projects (todoTaskList) ───────────────────────────────────────────────
  async listProjects(credentials: Credentials, params: QueryParams): Promise<Project[]> {
    const lists = await this.listRows<RawTodoTaskList>(credentials, '/me/todo/lists', params)
    return lists.map((l) => transformProject(l, ME_WORKSPACE_ID))
  }

  async getProject(credentials: Credentials, id: string): Promise<Project> {
    const list = await this.client(credentials).get<RawTodoTaskList>(`/me/todo/lists/${id}`)
    return transformProject(list, ME_WORKSPACE_ID)
  }

  // ── Tasks (todoTask) ──────────────────────────────────────────────────────
  async listTasks(credentials: Credentials, projectId: string, params: QueryParams): Promise<Task[]> {
    const tasks = await this.listRows<RawTodoTask>(
      credentials,
      `/me/todo/lists/${projectId}/tasks`,
      params,
    )
    return tasks.map((t) => transformTask(t, projectId))
  }

  async getTask(credentials: Credentials, id: string): Promise<Task> {
    // Graph requires the parent list id to address a task — `/me/todo/tasks/{id}`
    // does not exist. The canonical interface only passes an id, so a task is
    // addressed by a composite `{listId}:{taskId}` id (the same shape emitted by
    // `listTasks`, since `transformTask` records `projectId`). We split on the
    // last colon to tolerate colons inside Graph ids.
    const sep = id.lastIndexOf(':')
    if (sep <= 0) {
      throw new Error(
        `Microsoft To Do task id must be "{listId}:{taskId}", received "${id}"`,
      )
    }
    const projectId = id.slice(0, sep)
    const taskId = id.slice(sep + 1)
    const task = await this.client(credentials).get<RawTodoTask>(
      `/me/todo/lists/${projectId}/tasks/${taskId}`,
    )
    return transformTask(task, projectId)
  }

  // ── Tags (Outlook master categories) ─────────────────────────────────────
  // Requires MailboxSettings.Read scope (included in DEFAULT_SCOPES).
  // Endpoint: GET /me/outlook/masterCategories
  async listTags(credentials: Credentials, _workspaceId: string, params: QueryParams): Promise<Tag[]> {
    const categories = await this.listRows<RawOutlookCategory>(
      credentials,
      '/me/outlook/masterCategories',
      params,
    )
    return categories.map((c) => transformTag(c, ME_WORKSPACE_ID))
  }

  async getTag(credentials: Credentials, id: string): Promise<Tag> {
    const category = await this.client(credentials).get<RawOutlookCategory>(
      `/me/outlook/masterCategories/${id}`,
    )
    return transformTag(category, ME_WORKSPACE_ID)
  }

  // ── Workspaces (synthetic /me mailbox) ────────────────────────────────────
  async listWorkspaces(credentials: Credentials, params: QueryParams): Promise<Workspace[]> {
    const me = await this.client(credentials).get<RawMeUser>('/me')
    return pageLocally([transformWorkspace(me)], params)
  }

  async getWorkspace(credentials: Credentials, _id: string): Promise<Workspace> {
    const me = await this.client(credentials).get<RawMeUser>('/me')
    return transformWorkspace(me)
  }

  // ── Users (/me only — no member directory under Tasks.Read) ───────────────
  async listUsers(credentials: Credentials, _workspaceId: string, params: QueryParams): Promise<User[]> {
    const me = await this.client(credentials).get<RawMeUser>('/me')
    return pageLocally([transformUser(me)], params)
  }

  async getUser(credentials: Credentials, _id: string): Promise<User> {
    const me = await this.client(credentials).get<RawMeUser>('/me')
    return transformUser(me)
  }
}
