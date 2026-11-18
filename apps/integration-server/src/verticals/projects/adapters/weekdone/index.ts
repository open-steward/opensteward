/**
 * Weekdone adapter for the projects vertical.
 *
 * Resource mapping:
 *   Workspace  → Team          (GET /teams)
 *   Project    → Objective     (GET /objective)
 *   Task       → Item          (GET /items  — weekly report entries)
 *   Comment    → Item comment  (GET /item/<id>/comments)
 *   Tag        → Tag           (GET /tag)
 *   User       → User          (GET /users)
 *
 * Auth: OAuth 2.0 Authorization Code flow.
 * Token: passed as `token` query param on every request.
 * Webhooks: not documented by Weekdone — not implemented.
 */
import { pageLocally, type Credentials, type QueryParams } from '@opensteward/shared'
import type { ProjectsAdapter } from '../../adapter/interface'
import type { Project } from '../../schema/project'
import type { Task } from '../../schema/task'
import type { Comment } from '../../schema/comment'
import type { Tag } from '../../schema/tag'
import type { Workspace } from '../../schema/workspace'
import type { User } from '../../schema/user'

import { buildAuthUrl, exchangeCode as weekdoneExchange, refreshCredentials as weekdoneRefresh } from './auth'
import { WeekdoneClient } from './client'
import { DEFAULT_SCOPES } from './constants'

import { transformProject, type RawWeekdoneObjective } from './transform/project'
import { transformTask, type RawWeekdoneItem } from './transform/task'
import { transformComment, type RawWeekdoneComment } from './transform/comment'
import { transformTag, type RawWeekdoneTag } from './transform/tag'
import { transformWorkspace, type RawWeekdoneTeam } from './transform/workspace'
import { transformUser, type RawWeekdoneUser } from './transform/user'

export interface WeekdoneAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

// ── Weekdone envelope shapes ──────────────────────────────────────────────────

interface TeamsResponse {
  status?: string
  teams?: RawWeekdoneTeam[]
}

interface ObjectivesResponse {
  status?: string
  data?: RawWeekdoneObjective[]
}

interface ObjectiveResponse {
  status?: string
  data?: RawWeekdoneObjective
}

interface ItemsResponse {
  status?: string
  items?: RawWeekdoneItem[]
}

interface CommentsResponse {
  status?: string
  comments?: RawWeekdoneComment[]
}

interface TagsResponse {
  status?: string
  tags?: RawWeekdoneTag[]
}

interface TagResponse {
  status?: string
  tag?: RawWeekdoneTag
}

interface UsersResponse {
  status?: string
  users?: RawWeekdoneUser[]
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export class WeekdoneAdapter implements ProjectsAdapter {
  readonly platform = 'weekdone'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: WeekdoneAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes ?? DEFAULT_SCOPES
  }

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(this.clientId, this.redirectUri, overrideScopes ?? this.scopes, state)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return weekdoneExchange(code, redirectUri, this.clientId, this.clientSecret)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return weekdoneRefresh(credentials, this.clientId, this.clientSecret)
  }

  private client(credentials: Credentials): WeekdoneClient {
    return new WeekdoneClient(credentials)
  }

  // ── Workspaces (teams) ──────────────────────────────────────────────────────

  async listWorkspaces(credentials: Credentials, params: QueryParams): Promise<Workspace[]> {
    // "Get all teams" documents no paging parameter: the response is the whole collection.
    const res = await this.client(credentials).get<TeamsResponse>('/teams')
    return pageLocally((res.teams ?? []).map(transformWorkspace), params)
  }

  async getWorkspace(credentials: Credentials, id: string): Promise<Workspace> {
    // Weekdone has no single-team endpoint; fetch all and find by id
    const res = await this.client(credentials).get<TeamsResponse>('/teams')
    const team = (res.teams ?? []).find((t) => String(t.id) === id)
    if (!team) throw new Error(`Weekdone team ${id} not found`)
    return transformWorkspace(team)
  }

  // ── Projects (objectives) ───────────────────────────────────────────────────

  async listProjects(credentials: Credentials, params: QueryParams): Promise<Project[]> {
    const query: Record<string, unknown> = {}
    if (params['workspace_id']) query['team_id'] = params['workspace_id']
    // "Get all Objectives" documents no paging parameter: the response is the whole collection.
    const res = await this.client(credentials).get<ObjectivesResponse>('/objective', query)
    return pageLocally((res.data ?? []).map(transformProject), params)
  }

  async getProject(credentials: Credentials, id: string): Promise<Project> {
    const res = await this.client(credentials).get<ObjectiveResponse>(`/objective/${id}`)
    if (!res.data) throw new Error(`Weekdone objective ${id} not found`)
    return transformProject(res.data)
  }

  // ── Tasks (items) ───────────────────────────────────────────────────────────

  async listTasks(credentials: Credentials, projectId: string, params: QueryParams): Promise<Task[]> {
    // Weekdone items are scoped by team; projectId is treated as team_id here
    // because objectives (projects) live in teams
    const query: Record<string, unknown> = { team_id: projectId }
    if (params['user_id']) query['user_id'] = params['user_id']
    if (params['cursor']) query['period'] = params['cursor']
    // "Search for items" documents no paging parameter: the response is every item for the query.
    const res = await this.client(credentials).get<ItemsResponse>('/items', query)
    return pageLocally(
      (res.items ?? []).map((item) => transformTask(item, projectId)),
      params,
    )
  }

  async getTask(credentials: Credentials, id: string): Promise<Task> {
    // Weekdone has no single-item GET; fetch by id via items list with item_id filter
    const res = await this.client(credentials).get<ItemsResponse>('/items', { item_id: id })
    const item = (res.items ?? []).find((i) => String(i.id) === id)
    if (!item) throw new Error(`Weekdone item ${id} not found`)
    return transformTask(item)
  }

  // ── Comments ────────────────────────────────────────────────────────────────

  async listComments(credentials: Credentials, taskId: string, params: QueryParams): Promise<Comment[]> {
    // "Get item comments" documents no paging parameter: the response is the whole collection.
    const res = await this.client(credentials).get<CommentsResponse>(`/item/${taskId}/comments`)
    return pageLocally(
      (res.comments ?? []).map((c) => transformComment(c, taskId)),
      params,
    )
  }

  async getComment(credentials: Credentials, id: string): Promise<Comment> {
    // id is expected to be in '{itemId}:{commentId}' composite form, matching
    // what transformComment() stores. The item id is needed because Weekdone
    // has no global comment endpoint — only GET /item/<itemId>/comments.
    const sep = id.indexOf(':')
    if (sep === -1) {
      throw new Error(
        `Weekdone comment id must be in '{itemId}:{commentId}' form; got '${id}'.`,
      )
    }
    const itemId = id.slice(0, sep)
    const commentId = id.slice(sep + 1)
    const res = await this.client(credentials).get<CommentsResponse>(`/item/${itemId}/comments`)
    const comment = (res.comments ?? []).find((c) => String(c.id) === commentId)
    if (!comment) throw new Error(`Weekdone comment ${id} not found`)
    return transformComment(comment, itemId)
  }

  // ── Tags ────────────────────────────────────────────────────────────────────

  async listTags(credentials: Credentials, _workspaceId: string, params: QueryParams): Promise<Tag[]> {
    // "Get all tags" documents no paging parameter: the response is the whole collection.
    const res = await this.client(credentials).get<TagsResponse>('/tag')
    return pageLocally((res.tags ?? []).map(transformTag), params)
  }

  async getTag(credentials: Credentials, id: string): Promise<Tag> {
    const res = await this.client(credentials).get<TagResponse>(`/tag/${id}`)
    if (!res.tag) throw new Error(`Weekdone tag ${id} not found`)
    return transformTag(res.tag)
  }

  // ── Users ───────────────────────────────────────────────────────────────────

  async listUsers(credentials: Credentials, workspaceId: string, params: QueryParams): Promise<User[]> {
    const query: Record<string, unknown> = workspaceId ? { team_id: workspaceId } : {}
    // "Get all users" documents no paging parameter: the response is the whole collection.
    const res = await this.client(credentials).get<UsersResponse>('/users', query)
    return pageLocally(
      (res.users ?? []).map((u) => transformUser(u, workspaceId || undefined)),
      params,
    )
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    const res = await this.client(credentials).get<UsersResponse>('/users')
    const user = (res.users ?? []).find((u) => String(u.id) === id)
    if (!user) throw new Error(`Weekdone user ${id} not found`)
    return transformUser(user)
  }
}
