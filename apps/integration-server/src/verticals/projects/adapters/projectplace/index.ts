/**
 * Projectplace adapter for the projects vertical.
 *
 * Projectplace's top-level container is the *project* (its workspace), which
 * also serves as the canonical workspace id. Work items are *cards* that live
 * on *boards* within a project and are grouped under planning activities
 * (planlets) — the latter map to `Task.parentId`. Discussion lives on the v3
 * conversations API, anchored to an artifact by `item_id` + `item_name`.
 *
 * Implemented resources: projects, tasks (cards), comments, users (members),
 * tags (project-scoped via GET /1/tags/projects/{project_id}).
 *
 * Auth: OAuth 2.0 (Bearer). Webhooks: Projectplace only supports
 * board-webhook *management* via API with no documented inbound signature
 * scheme, so no webhook verification/parsing is exposed.
 *
 * Docs: https://service.projectplace.com/apidocs/
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: workspace — Projectplace has no separate workspace layer;
 *   the project IS the workspace (GET /1/user/me/projects returns the
 *   top-level containers). The /accounts endpoint covers only custom fields
 *   and intake requests, not organization-level workspace objects.
 */
import { connectionScope, cursorPagerKey, pageByRows, type Credentials, type QueryParams } from '@opensteward/shared'
import type { ProjectsAdapter } from '../../adapter/interface'
import type { Project } from '../../schema/project'
import type { Task } from '../../schema/task'
import type { Comment } from '../../schema/comment'
import type { Tag } from '../../schema/tag'
import type { User } from '../../schema/user'

import { buildAuthUrl, exchangeCode as projectplaceExchange, refreshCredentials as projectplaceRefresh } from './auth'
import { ProjectplaceClient } from './client'
import { COMMENTS_MAX_COUNT, DEFAULT_PAGE_SIZE, DEFAULT_SCOPES } from './constants'

import { transformProject, type RawProjectplaceProject } from './transform/project'
import { transformTask, type RawProjectplaceCard } from './transform/task'
import { transformComment, type RawProjectplaceComment } from './transform/comment'
import { transformTag, type RawProjectplaceTag } from './transform/tag'
import { transformUser, type RawProjectplaceMember } from './transform/user'

export interface ProjectplaceAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

interface BoardSummary {
  id: number | string
}

export class ProjectplaceAdapter implements ProjectsAdapter {
  readonly platform = 'projectplace'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: ProjectplaceAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes ?? DEFAULT_SCOPES
  }

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(this.clientId, this.redirectUri, overrideScopes ?? this.scopes, state)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return projectplaceExchange(code, redirectUri, this.clientId, this.clientSecret)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return projectplaceRefresh(credentials, this.clientId, this.clientSecret)
  }

  private client(credentials: Credentials): ProjectplaceClient {
    return new ProjectplaceClient(credentials)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    return {
      max_items: params.limit ?? DEFAULT_PAGE_SIZE,
      ...(params['cursor'] ? { offset: Number(params['cursor']) } : {}),
    }
  }

  // ── Projects ───────────────────────────────────────────────────────────────

  async listProjects(credentials: Credentials, _params: QueryParams): Promise<Project[]> {
    const res = await this.client(credentials).get<RawProjectplaceProject[]>('/1/user/me/projects')
    return (res ?? []).map(transformProject)
  }

  async getProject(credentials: Credentials, id: string): Promise<Project> {
    const res = await this.client(credentials).get<RawProjectplaceProject>(`/1/projects/${id}`)
    if (!res || res.id == null) throw new Error(`Projectplace project ${id} not found`)
    return transformProject(res)
  }

  // ── Tasks (cards) ────────────────────────────────────────────────────────────

  async listTasks(credentials: Credentials, projectId: string, _params: QueryParams): Promise<Task[]> {
    const client = this.client(credentials)
    const boards = await client.get<BoardSummary[]>(`/1/projects/${projectId}/boards`)
    const cards: RawProjectplaceCard[] = []
    for (const board of boards ?? []) {
      const boardCards = await client.get<RawProjectplaceCard[]>(`/1/boards/${board.id}/cards`)
      for (const card of boardCards ?? []) cards.push(card)
    }
    return cards.map((c) => transformTask(c, projectId))
  }

  async getTask(credentials: Credentials, id: string): Promise<Task> {
    const res = await this.client(credentials).get<RawProjectplaceCard[]>(`/1/cards/${id}`)
    const card = Array.isArray(res) ? res[0] : (res as RawProjectplaceCard | undefined)
    if (!card || card.id == null) throw new Error(`Projectplace card ${id} not found`)
    return transformTask(card)
  }

  // ── Comments (conversations) ─────────────────────────────────────────────────

  /**
   * GET /3/conversations/comments pages by `offset` + `count`: "The API is
   * pageable using the offset and count parameters", count "Defaults to 100
   * entries (which is also the maximum allowable pagination count)", offset
   * "will bypass the first offset comments"
   * (https://service.projectplace.com/apidocs/endpoint_conversations.html).
   * Upstream pages are always the documented maximum and cut to the caller's
   * page by `pageByRows`; a page shorter than `count` ends the thread.
   */
  async listComments(credentials: Credentials, taskId: string, params: QueryParams): Promise<Comment[]> {
    const client = this.client(credentials)
    const count = COMMENTS_MAX_COUNT
    const query = { item_id: taskId, item_name: 'card', count }
    const key = cursorPagerKey(connectionScope('projectplace', credentials), 'comments', query)
    const { items } = await pageByRows<RawProjectplaceComment, number>(
      key,
      params,
      async (offset) => {
        const at = offset ?? 0
        const res = await client.get<RawProjectplaceComment[]>('/3/conversations/comments', {
          ...query,
          ...(at > 0 ? { offset: at } : {}),
        })
        if (res != null && !Array.isArray(res))
          throw new Error('Projectplace GET /3/conversations/comments returned a non-array body')
        const rows = res ?? []
        return { items: rows, next: rows.length < count ? undefined : at + rows.length }
      },
      { defaultLimit: DEFAULT_PAGE_SIZE },
    )
    return items.map((c) => transformComment(c, taskId))
  }

  async getComment(credentials: Credentials, id: string): Promise<Comment> {
    const res = await this.client(credentials).get<RawProjectplaceComment>(
      `/3/conversations/comment/${id}`,
    )
    if (!res || res.id == null) throw new Error(`Projectplace comment ${id} not found`)
    return transformComment(res)
  }

  // ── Tags (project-scoped labels) ─────────────────────────────────────────────

  async listTags(credentials: Credentials, workspaceId: string, _params: QueryParams): Promise<Tag[]> {
    const res = await this.client(credentials).get<RawProjectplaceTag[]>(
      `/1/tags/projects/${workspaceId}`,
    )
    return (res ?? []).map((t) => transformTag(t, workspaceId))
  }

  async getTag(credentials: Credentials, id: string): Promise<Tag> {
    // Projectplace has no single-tag GET endpoint; tags are fetched per project.
    // We resolve by searching the tag's parent project using the tag id, which
    // encodes the project id as the first path segment when structured as
    // "<projectId>/<tagId>" — fall back to a minimal stub if not parseable.
    const parts = id.split('/')
    if (parts.length === 2) {
      const [projectId, tagId] = parts
      const all = await this.client(credentials).get<RawProjectplaceTag[]>(
        `/1/tags/projects/${projectId}`,
      )
      const found = (all ?? []).find((t) => String(t.id) === tagId)
      if (found) return transformTag(found, projectId)
    }
    throw new Error(`Projectplace tag ${id} not found (use "<projectId>/<tagId>" format)`)
  }

  // ── Users (project members) ──────────────────────────────────────────────────

  async listUsers(credentials: Credentials, workspaceId: string, _params: QueryParams): Promise<User[]> {
    const res = await this.client(credentials).get<RawProjectplaceMember[]>(
      `/1/projects/${workspaceId}/members`,
    )
    return (res ?? []).map((m) => transformUser(m, workspaceId))
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    const res = await this.client(credentials).get<RawProjectplaceMember>(`/1/user/${id}/profile`)
    if (!res || res.id == null) throw new Error(`Projectplace user ${id} not found`)
    return transformUser(res)
  }
}
