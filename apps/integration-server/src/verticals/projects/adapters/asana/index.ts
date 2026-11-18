/**
 * Asana adapter — reference implementation for the projects vertical.
 *
 * Cleanest flat-task model. Sections are presentational (ignored at the
 * canonical level). Subtasks resolved via `parent.gid` → `Task.parentId`.
 */
import {
  connectionScope,
  cursorPagerKey,
  pageByCursor,
  pageByRows,
  reportUpstreamPage,
  type Credentials,
  type CursorPage,
  type PagedResult,
  type QueryParams,
} from '@opensteward/shared'
import type { ProjectsAdapter } from '../../adapter/interface'
import type { Project } from '../../schema/project'
import type { Task } from '../../schema/task'
import type { Comment } from '../../schema/comment'
import type { Tag } from '../../schema/tag'
import type { Workspace } from '../../schema/workspace'
import type { User } from '../../schema/user'
import type { WebhookEvent } from '../../schema/webhook'

import { buildAuthUrl, exchangeCode as asanaExchange, refreshCredentials as asanaRefresh } from './auth'
import { AsanaClient } from './client'
import { DEFAULT_PAGE_SIZE, DEFAULT_SCOPES, MAX_PAGE_SIZE } from './constants'
import { verifyAsanaWebhook, parseAsanaWebhookEvents } from './webhook'

import { transformProject, type RawAsanaProject } from './transform/project'
import { transformTask, type RawAsanaTask } from './transform/task'
import { transformComment, type RawAsanaStory } from './transform/comment'
import { transformTag, type RawAsanaTag } from './transform/tag'
import { transformWorkspace, type RawAsanaWorkspace } from './transform/workspace'
import { transformUser, type RawAsanaUser } from './transform/user'

export interface AsanaAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

interface ListResponse<T> {
  data?: T[]
  next_page?: { offset: string; path: string; uri?: string } | null
}

interface GetResponse<T> {
  data?: T
}

/**
 * A story that is a comment, by either field: `resource_subtype` is the one
 * the compact story schema documents, `type` the legacy one. The stories
 * endpoint documents no query parameter that filters by story type (only
 * limit, offset, created_after and opt_fields). Its created_after text
 * mentions `resource_subtype=comment_added`, but that is not a listed
 * parameter, so the filter runs here.
 */
function isComment(s: RawAsanaStory): boolean {
  return s.type === 'comment' || s.resource_subtype === 'comment_added'
}

export class AsanaAdapter implements ProjectsAdapter {
  readonly platform = 'asana'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: AsanaAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes ?? DEFAULT_SCOPES
  }

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(this.clientId, this.redirectUri, overrideScopes ?? this.scopes, state)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return asanaExchange(code, redirectUri, this.clientId, this.clientSecret)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return asanaRefresh(credentials, this.clientId, this.clientSecret)
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyAsanaWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseAsanaWebhookEvents(payload)
  }

  private client(credentials: Credentials): AsanaClient {
    return new AsanaClient(credentials)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    return {
      limit: params.limit ?? DEFAULT_PAGE_SIZE,
      ...(params['cursor'] ? { offset: String(params['cursor']) } : {}),
    }
  }

  /**
   * Pager scope for ONE connection: the Asana user it authorised as, plus a
   * fingerprint of its refresh token (`connectionScope`), never a token
   * itself. Access tokens expire hourly, and one user's two connections can
   * hold different scopes, so neither the token nor the user alone will do.
   */
  private pagerScope(credentials: Credentials): string {
    const userId = credentials.extra?.['userId']
    return connectionScope(`asana:${typeof userId === 'string' ? userId : ''}`, credentials)
  }

  /** The `limit` to send: the caller's, within Asana's documented 1..100. */
  private pageSize(params: QueryParams): number {
    const asked = Number(params.limit ?? DEFAULT_PAGE_SIZE)
    if (!Number.isFinite(asked) || asked < 1) return DEFAULT_PAGE_SIZE
    return Math.min(Math.floor(asked), MAX_PAGE_SIZE)
  }

  /**
   * Fetch one upstream page of an offset-token list: the first when `offset`
   * is absent. "If more results exist, then the response will contain a
   * next_page attribute, which will include an offset" — so `next` is that
   * offset, and its absence is the end.
   */
  private offsetFetcher<T>(
    credentials: Credentials,
    path: string,
    query: Record<string, unknown>,
    limit: number,
  ): (offset: string | undefined) => Promise<CursorPage<T, string>> {
    const client = this.client(credentials)
    return async (offset) => {
      const res = await client.get<ListResponse<T>>(path, {
        limit,
        ...(offset ? { offset } : {}),
        ...query,
      })
      return { items: res.data ?? [], next: res.next_page?.offset || undefined }
    }
  }

  /**
   * One caller page of a list that is exactly one endpoint's rows.
   *
   * Asana pages by an opaque `offset` token and nothing else, so the
   * caller's 1-based `page` resolves through the shared cursor pager, which
   * walks `next_page.offset` from page 1 and remembers each page's token.
   * This adapter used to forward `offset` only from `params.cursor`, which
   * the router and the sync worker never set, so page 2 was page 1 again.
   * An explicit cursor still wins: that caller already holds a position.
   *
   * A limit over Asana's 100 is sent as 100 and reported as the page size,
   * so a full page of 100 is not read as the last one.
   */
  private async offsetList<T>(
    credentials: Credentials,
    path: string,
    params: QueryParams,
    query: Record<string, unknown>,
  ): Promise<T[]> {
    const limit = this.pageSize(params)
    const fetch = this.offsetFetcher<T>(credentials, path, query, limit)
    const cursor = params['cursor']
    let page: PagedResult<T>
    if (cursor) {
      const res = await fetch(String(cursor))
      page = { items: res.items, hasMore: res.next !== undefined }
    } else {
      page = await pageByCursor<T, string>(
        cursorPagerKey(this.pagerScope(credentials), path, { limit }),
        params.page,
        fetch,
      )
    }
    reportUpstreamPage(params, {
      hasMore: page.hasMore,
      ...(limit < (params.limit ?? DEFAULT_PAGE_SIZE) ? { pageSize: limit } : {}),
    })
    return page.items
  }

  async listProjects(credentials: Credentials, params: QueryParams): Promise<Project[]> {
    const workspaceId = params['workspace_id']
    const path = workspaceId ? `/workspaces/${workspaceId}/projects` : '/projects'
    const rows = await this.offsetList<RawAsanaProject>(credentials, path, params, {
      opt_fields:
        'gid,name,notes,archived,current_status,owner,workspace,start_on,due_on,created_at,modified_at',
    })
    return rows.map(transformProject)
  }

  async getProject(credentials: Credentials, id: string): Promise<Project> {
    const res = await this.client(credentials).get<GetResponse<RawAsanaProject>>(
      `/projects/${id}`,
      {
        opt_fields:
          'gid,name,notes,archived,current_status,owner,workspace,start_on,due_on,created_at,modified_at',
      },
    )
    if (!res.data) throw new Error(`Asana project ${id} not found`)
    return transformProject(res.data)
  }

  async listTasks(credentials: Credentials, projectId: string, params: QueryParams): Promise<Task[]> {
    const rows = await this.offsetList<RawAsanaTask>(
      credentials,
      `/projects/${projectId}/tasks`,
      params,
      {
        opt_fields:
          'gid,name,notes,completed,due_on,due_at,parent,projects,assignee,tags,num_subtasks,custom_fields,created_at,modified_at,resource_subtype',
      },
    )
    return rows.map((t) => transformTask(t, projectId))
  }

  async getTask(credentials: Credentials, id: string): Promise<Task> {
    const res = await this.client(credentials).get<GetResponse<RawAsanaTask>>(`/tasks/${id}`, {
      opt_fields:
        'gid,name,notes,completed,due_on,due_at,parent,projects,assignee,tags,num_subtasks,custom_fields,created_at,modified_at,resource_subtype',
    })
    if (!res.data) throw new Error(`Asana task ${id} not found`)
    return transformTask(res.data)
  }

  /**
   * The comments on a task: its stories ("Returns the compact records for
   * all stories on the task."), filtered to comments. No documented query
   * parameter filters by story type (see `isComment`), so an upstream page
   * of N stories holds anywhere from none to N comments, and one upstream
   * page is not one caller page. The row pager walks the `next_page.offset`
   * chain in pages of 100 stories and cuts exactly the caller's comments out
   * of the filtered stream, with `hasMore` exact.
   * An explicit cursor is a position in the chain of stories, not a row
   * offset: that one upstream page at the caller's limit, filtered, so it
   * never returns more than the caller asked for.
   */
  async listComments(credentials: Credentials, taskId: string, params: QueryParams): Promise<Comment[]> {
    const path = `/tasks/${taskId}/stories`
    const query = {
      opt_fields: 'gid,text,html_text,type,resource_subtype,created_by,created_at,target',
    }
    const comments =
      (fetch: (offset: string | undefined) => Promise<CursorPage<RawAsanaStory, string>>) =>
      async (offset: string | undefined): Promise<CursorPage<Comment, string>> => {
        const res = await fetch(offset)
        return {
          items: res.items.filter(isComment).map((s) => transformComment(s, taskId)),
          next: res.next,
        }
      }
    const cursor = params['cursor']
    if (cursor) {
      const fetch = comments(this.offsetFetcher(credentials, path, query, this.pageSize(params)))
      const res = await fetch(String(cursor))
      reportUpstreamPage(params, { hasMore: res.next !== undefined })
      return res.items
    }
    const { items } = await pageByRows<Comment, string>(
      cursorPagerKey(this.pagerScope(credentials), `comments:${path}`, { limit: MAX_PAGE_SIZE }),
      params,
      comments(this.offsetFetcher(credentials, path, query, MAX_PAGE_SIZE)),
      { defaultLimit: DEFAULT_PAGE_SIZE },
    )
    return items
  }

  async getComment(credentials: Credentials, id: string): Promise<Comment> {
    const res = await this.client(credentials).get<GetResponse<RawAsanaStory>>(`/stories/${id}`)
    if (!res.data) throw new Error(`Asana story ${id} not found`)
    return transformComment(res.data)
  }

  async listTags(credentials: Credentials, workspaceId: string, params: QueryParams): Promise<Tag[]> {
    const rows = await this.offsetList<RawAsanaTag>(
      credentials,
      `/workspaces/${workspaceId}/tags`,
      params,
      { opt_fields: 'gid,name,color,workspace' },
    )
    return rows.map(transformTag)
  }

  async getTag(credentials: Credentials, id: string): Promise<Tag> {
    const res = await this.client(credentials).get<GetResponse<RawAsanaTag>>(`/tags/${id}`)
    if (!res.data) throw new Error(`Asana tag ${id} not found`)
    return transformTag(res.data)
  }

  async listWorkspaces(credentials: Credentials, params: QueryParams): Promise<Workspace[]> {
    const rows = await this.offsetList<RawAsanaWorkspace>(credentials, '/workspaces', params, {
      opt_fields: 'gid,name,is_organization,email_domains',
    })
    return rows.map(transformWorkspace)
  }

  async getWorkspace(credentials: Credentials, id: string): Promise<Workspace> {
    const res = await this.client(credentials).get<GetResponse<RawAsanaWorkspace>>(
      `/workspaces/${id}`,
    )
    if (!res.data) throw new Error(`Asana workspace ${id} not found`)
    return transformWorkspace(res.data)
  }

  async listUsers(credentials: Credentials, workspaceId: string, params: QueryParams): Promise<User[]> {
    const res = await this.client(credentials).get<ListResponse<RawAsanaUser>>(
      `/workspaces/${workspaceId}/users`,
      { ...this.listParams(params), opt_fields: 'gid,name,email,workspaces' },
    )
    return (res.data ?? []).map((u) => transformUser(u, workspaceId))
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    const res = await this.client(credentials).get<GetResponse<RawAsanaUser>>(`/users/${id}`)
    if (!res.data) throw new Error(`Asana user ${id} not found`)
    return transformUser(res.data)
  }
}
