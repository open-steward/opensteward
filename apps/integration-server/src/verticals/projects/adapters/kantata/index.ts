/**
 * Kantata OX (formerly Mavenlink) adapter for the projects vertical.
 *
 * Resource mapping:
 *   - canonical Project  ← Kantata Workspace  (`/workspaces.json`)
 *   - canonical Task     ← Kantata Story      (`/stories.json`)
 *   - canonical Comment  ← Kantata Post       (`/posts.json`)
 *   - canonical User     ← Kantata User       (`/users.json`)
 *
 * Not implemented (no clean listable endpoint → auto-501 via BaseAdapter):
 *   - canonical Workspace (Kantata's org is the Account; no suitable list API)
 *   - canonical Tag (Kantata tags are comma-separated strings on a Story, not a
 *     first-class workspace-scoped resource)
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: workspace — The canonical Workspace maps to a Kantata Account;
 *              no /accounts.json or equivalent list endpoint is documented.
 * Unavailable: tag — Tags are stored as a comma-separated tag_list string on
 *              Story objects; no dedicated /tags.json endpoint exists.
 *
 * Kantata responses use a side-loading envelope: the canonical ordered records
 * are referenced in `results` and indexed by id under a typed top-level map.
 * Associations (assignees, tags, parent, workspace, creator, user, story) are
 * only present when requested via the `include` query parameter.
 *
 * Kantata has no documented webhook product, so no webhook handling is provided.
 */
import { reportUpstreamPage, type Credentials, type QueryParams } from '@opensteward/shared'
import type { ProjectsAdapter } from '../../adapter/interface'
import type { Project } from '../../schema/project'
import type { Task } from '../../schema/task'
import type { Comment } from '../../schema/comment'
import type { User } from '../../schema/user'

import {
  buildAuthUrl,
  exchangeCode as kantataExchange,
  refreshCredentials as kantataRefresh,
} from './auth'
import { KantataClient, resolveResults, lookup, type KantataEnvelope } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, DEFAULT_SCOPES } from './constants'

import { transformProject, type RawKantataWorkspace } from './transform/project'
import { transformTask, type RawKantataStory } from './transform/task'
import { transformComment, type RawKantataPost } from './transform/comment'
import { transformUser, type RawKantataUser } from './transform/user'

export interface KantataAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

const STORY_INCLUDES = 'assignees,tags,parent,workspace'
/**
 * Post associations the comment transform reads. Each is listed under the
 * `include` parameter of GET /posts: `user` ("The user who created the
 * post."), `story` ("The task (if any) to which the post is linked."),
 * `workspace` ("The project to which this post belongs.") and `attachments`
 * (populates `attachment_ids`). `user` is load-bearing: "`user_id` will only
 * be included in the response if `user` is in the list of included
 * associations", and the transform throws without it. `recipients` is left
 * out on purpose: its ids are a private post's audience, not mentions.
 */
const POST_INCLUDES = 'user,story,workspace,attachments'

export class KantataAdapter implements ProjectsAdapter {
  readonly platform = 'kantata'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: KantataAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes ?? DEFAULT_SCOPES
  }

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(this.clientId, this.redirectUri, overrideScopes ?? this.scopes, state)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return kantataExchange(code, redirectUri, this.clientId, this.clientSecret)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return kantataRefresh(credentials)
  }

  private client(credentials: Credentials): KantataClient {
    return new KantataClient(credentials)
  }

  /**
   * Kantata's documented paging, shared by every list endpoint
   * (https://developer.kantata.com/kantata/specification/section/pagination):
   * `page` (1-based, default 1) and `per_page` (default 20, maximum 200), with
   * a top-level `count` of "the number of objects returned by the entire
   * query". The caller's page goes out as `page` and its limit, clamped to
   * the maximum, as `per_page`.
   */
  private pageParams(params: QueryParams): { page: number; per_page: number } {
    const asked = Number(params.limit ?? DEFAULT_PAGE_SIZE)
    const limit = Number.isFinite(asked) && asked >= 1 ? Math.floor(asked) : DEFAULT_PAGE_SIZE
    const page = typeof params.page === 'number' && params.page >= 1 ? Math.floor(params.page) : 1
    return { page, per_page: Math.min(limit, MAX_PAGE_SIZE) }
  }

  /** Report the query's total, and the clamped size when it is below the limit. */
  private reportPage(
    params: QueryParams,
    sent: { page: number; per_page: number },
    env: KantataEnvelope,
  ): void {
    const total = typeof env.count === 'number' ? env.count : env.meta?.count
    reportUpstreamPage(params, {
      ...(typeof total === 'number'
        ? { totalCount: total, hasMore: sent.page * sent.per_page < total }
        : {}),
      ...(typeof params.limit === 'number' && sent.per_page < params.limit
        ? { pageSize: sent.per_page }
        : {}),
    })
  }

  // ── Projects (Kantata Workspaces) ──────────────────────────────────────────
  async listProjects(credentials: Credentials, params: QueryParams): Promise<Project[]> {
    const sent = this.pageParams(params)
    const env = await this.client(credentials).get('/workspaces.json', { ...sent })
    this.reportPage(params, sent, env)
    return resolveResults<RawKantataWorkspace>(env).map(transformProject)
  }

  async getProject(credentials: Credentials, id: string): Promise<Project> {
    const env = await this.client(credentials).get(`/workspaces/${id}.json`)
    const raw = lookup<RawKantataWorkspace>(env, 'workspaces', id)
    if (!raw) throw new Error(`Kantata workspace ${id} not found`)
    return transformProject(raw)
  }

  // ── Tasks (Kantata Stories) ────────────────────────────────────────────────
  async listTasks(
    credentials: Credentials,
    projectId: string,
    params: QueryParams,
  ): Promise<Task[]> {
    const sent = this.pageParams(params)
    const env = await this.client(credentials).get('/stories.json', {
      ...sent,
      workspace_id: projectId,
      include: STORY_INCLUDES,
    })
    this.reportPage(params, sent, env)
    return resolveResults<RawKantataStory>(env).map((s) => transformTask(s, projectId))
  }

  async getTask(credentials: Credentials, id: string): Promise<Task> {
    const env = await this.client(credentials).get(`/stories/${id}.json`, {
      include: STORY_INCLUDES,
    })
    const raw = lookup<RawKantataStory>(env, 'stories', id)
    if (!raw) throw new Error(`Kantata story ${id} not found`)
    return transformTask(raw)
  }

  // ── Comments (Kantata Posts) ───────────────────────────────────────────────
  /**
   * A task's posts. GET /posts documents `story_id` ("Only includes posts from
   * the specified task.") alongside the shared `page` / `per_page` paging.
   * `subject_id` is a Post response field, not a filter on this endpoint.
   */
  async listComments(
    credentials: Credentials,
    taskId: string,
    params: QueryParams,
  ): Promise<Comment[]> {
    const sent = this.pageParams(params)
    const env = await this.client(credentials).get('/posts.json', {
      ...sent,
      story_id: taskId,
      include: POST_INCLUDES,
    })
    this.reportPage(params, sent, env)
    return resolveResults<RawKantataPost>(env).map((p) => transformComment(p, taskId))
  }

  async getComment(credentials: Credentials, id: string): Promise<Comment> {
    const env = await this.client(credentials).get(`/posts/${id}.json`, {
      include: POST_INCLUDES,
    })
    const raw = lookup<RawKantataPost>(env, 'posts', id)
    if (!raw) throw new Error(`Kantata post ${id} not found`)
    return transformComment(raw)
  }

  // ── Users ──────────────────────────────────────────────────────────────────
  async listUsers(
    credentials: Credentials,
    workspaceId: string,
    params: QueryParams,
  ): Promise<User[]> {
    const sent = this.pageParams(params)
    const env = await this.client(credentials).get('/users.json', { ...sent })
    this.reportPage(params, sent, env)
    return resolveResults<RawKantataUser>(env).map((u) =>
      transformUser(u, workspaceId || undefined),
    )
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    const env = await this.client(credentials).get(`/users/${id}.json`)
    const raw = lookup<RawKantataUser>(env, 'users', id)
    if (!raw) throw new Error(`Kantata user ${id} not found`)
    return transformUser(raw)
  }
}
