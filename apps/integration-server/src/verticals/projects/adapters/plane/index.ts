/**
 * Plane adapter — Plane Cloud REST API v1 → canonical projects schema.
 *
 * Model notes:
 * - Plane is workspace-scoped. The workspace slug is captured at OAuth time in
 *   `credentials.extra.workspaceSlug`; it may also be overridden per-call via
 *   `params.workspace_slug`. Every REST path is rooted at
 *   `/workspaces/{slug}/...`.
 * - Work items (Plane's "issues") are the task model; a single `parent` UUID
 *   → `Task.parentId`. Their canonical status is derived from the work item's
 *   state `group` (backlog/unstarted/started/completed/cancelled), resolved
 *   from the project's states.
 * - Comments are work-item comments; `actor` is the author user UUID.
 * - Tags map to Plane labels, which are PROJECT-scoped.
 * - Workspace members are exposed via `GET /workspaces/{slug}/members/` →
 *   `listUsers` / `getUser`. A standalone workspace object is NOT surfaced
 *   by the public v1 REST API, so `listWorkspaces` / `getWorkspace` are not
 *   implemented and resolve to 501 at the dispatch layer.
 * - Get-by-id paths for work items, comments and labels need their parent
 *   project (and for comments, the work item). Those ids are accepted as
 *   slash-joined composite ids — `projectId/workItemId`,
 *   `projectId/workItemId/commentId`, `projectId/labelId` — matching the ids
 *   the list endpoints surface in `Task.metadata` / `raw`.
 */

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: workspace — The Plane public REST API v1 exposes no dedicated
//   workspace endpoint; workspaces are routing parameters (slug) only and are
//   not returned as a standalone resource object.
import {
  connectionScope,
  cursorPagerKey,
  pageByCursor,
  pageLocally,
  reportUpstreamPage,
} from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import type { ProjectsAdapter } from '../../adapter/interface'
import type { Project } from '../../schema/project'
import type { Task } from '../../schema/task'
import type { Comment } from '../../schema/comment'
import type { Tag } from '../../schema/tag'
import type { User } from '../../schema/user'
import type { WebhookEvent } from '../../schema/webhook'

import {
  buildAuthUrl,
  exchangeCode as planeExchange,
  refreshCredentials as planeRefresh,
} from './auth'
import { PlaneClient } from './client'
import { DEFAULT_PAGE_SIZE, DEFAULT_SCOPES, MAX_PAGE_SIZE } from './constants'
import { verifyPlaneWebhook, parsePlaneWebhookEvents } from './webhook'

import { transformProject, type RawPlaneProject } from './transform/project'
import { transformTask, type RawPlaneIssue } from './transform/task'
import { transformComment, type RawPlaneComment } from './transform/comment'
import { transformTag, type RawPlaneLabel } from './transform/tag'
import { transformUser, type RawPlaneMember } from './transform/user'

export interface PlaneAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

/** Cursor-paginated list envelope returned by Plane list endpoints. */
interface ListResponse<T> {
  results?: T[]
  next_cursor?: string | null
  prev_cursor?: string | null
  next_page_results?: boolean
  total_results?: number
}

interface RawPlaneState {
  id: string
  group?: string
  [key: string]: unknown
}

export class PlaneAdapter implements ProjectsAdapter {
  readonly platform = 'plane'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: PlaneAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes ?? DEFAULT_SCOPES
  }

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(this.clientId, this.redirectUri, overrideScopes ?? this.scopes, state)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return planeExchange(code, redirectUri, this.clientId, this.clientSecret)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return planeRefresh(credentials, this.clientId, this.clientSecret)
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyPlaneWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parsePlaneWebhookEvents(payload)
  }

  private client(credentials: Credentials): PlaneClient {
    return new PlaneClient(credentials)
  }

  /** Resolve the workspace slug from per-call params, then OAuth-captured extra. */
  private workspaceSlug(credentials: Credentials, params?: QueryParams): string {
    const fromParams = params?.['workspace_slug']
    if (fromParams) return String(fromParams)
    const fromExtra = credentials.extra?.['workspaceSlug']
    if (fromExtra) return String(fromExtra)
    throw new Error(
      'Plane requires a workspace slug (params.workspace_slug or credentials.extra.workspaceSlug)',
    )
  }

  /** Cursor pagination — `per_page` + opaque `cursor` token. */
  private listParams(params: QueryParams): Record<string, unknown> {
    return {
      per_page: params.limit ?? DEFAULT_PAGE_SIZE,
      ...(params['cursor'] ? { cursor: String(params['cursor']) } : {}),
    }
  }

  /**
   * Caller page `params.page` of a cursor-paginated collection at the caller's
   * size. Plane documents `per_page` (max 100) and an opaque `cursor`, and
   * answers with `next_cursor` plus `next_page_results` — "Boolean indicating
   * if there are more results after the current page". Plane mints a
   * `next_cursor` even on the last page, so only `next_page_results` ends the
   * walk. `pageByCursor` carries each page's cursor into the next, so caller
   * page N is upstream page N.
   * Docs: https://developers.plane.so/api-reference/introduction
   */
  private async cursorPage<T>(
    credentials: Credentials,
    slug: string,
    path: string,
    params: QueryParams,
  ): Promise<T[]> {
    const asked = params.limit ?? DEFAULT_PAGE_SIZE
    const size = Math.min(asked, MAX_PAGE_SIZE)
    const client = this.client(credentials)
    const key = cursorPagerKey(connectionScope(`plane:${slug}`, credentials), path, {
      limit: size,
    })
    const result = await pageByCursor<T>(key, params.page, async (cursor) => {
      const res = await client.get<ListResponse<T>>(path, {
        per_page: size,
        ...(cursor ? { cursor } : {}),
      })
      const next = res.next_page_results === true && res.next_cursor ? res.next_cursor : null
      return { items: res.results ?? [], next }
    })
    reportUpstreamPage(params, {
      hasMore: result.hasMore,
      ...(size < asked ? { pageSize: size } : {}),
    })
    return result.items
  }

  /** Split a slash-joined composite id, padding missing leading segments. */
  private splitId(id: string, parts: number): string[] {
    const segs = id.split('/')
    while (segs.length < parts) segs.unshift('')
    return segs.slice(segs.length - parts)
  }

  /** Build a `stateId → group` map for a project's workflow states. */
  private async stateGroups(
    credentials: Credentials,
    slug: string,
    projectId: string,
  ): Promise<Record<string, string>> {
    try {
      const res = await this.client(credentials).get<ListResponse<RawPlaneState>>(
        `/workspaces/${slug}/projects/${projectId}/states/`,
        { per_page: DEFAULT_PAGE_SIZE },
      )
      const map: Record<string, string> = {}
      for (const s of res.results ?? []) {
        if (s.id && s.group) map[s.id] = s.group
      }
      return map
    } catch {
      return {}
    }
  }

  // ── Projects ───────────────────────────────────────────────────────────────
  async listProjects(credentials: Credentials, params: QueryParams): Promise<Project[]> {
    const slug = this.workspaceSlug(credentials, params)
    const rows = await this.cursorPage<RawPlaneProject>(
      credentials,
      slug,
      `/workspaces/${slug}/projects/`,
      params,
    )
    return rows.map((p) => transformProject(p))
  }

  async getProject(credentials: Credentials, id: string): Promise<Project> {
    const slug = this.workspaceSlug(credentials)
    const raw = await this.client(credentials).get<RawPlaneProject>(
      `/workspaces/${slug}/projects/${id}/`,
    )
    return transformProject(raw)
  }

  // ── Tasks (work items) ──────────────────────────────────────────────────────
  async listTasks(
    credentials: Credentials,
    projectId: string,
    params: QueryParams,
  ): Promise<Task[]> {
    const slug = this.workspaceSlug(credentials, params)
    const [groups, rows] = await Promise.all([
      this.stateGroups(credentials, slug, projectId),
      this.cursorPage<RawPlaneIssue>(
        credentials,
        slug,
        `/workspaces/${slug}/projects/${projectId}/work-items/`,
        params,
      ),
    ])
    return rows.map((t) => transformTask(t, projectId, t.state ? groups[t.state] : undefined))
  }

  async getTask(credentials: Credentials, id: string): Promise<Task> {
    const slug = this.workspaceSlug(credentials)
    const [projectId, workItemId] = this.splitId(id, 2)
    if (!projectId || !workItemId) {
      throw new Error('Plane getTask requires a composite id "projectId/workItemId"')
    }
    const [groups, raw] = await Promise.all([
      this.stateGroups(credentials, slug, projectId),
      this.client(credentials).get<RawPlaneIssue>(
        `/workspaces/${slug}/projects/${projectId}/work-items/${workItemId}/`,
      ),
    ])
    return transformTask(raw, projectId, raw.state ? groups[raw.state] : undefined)
  }

  // ── Comments ────────────────────────────────────────────────────────────────
  async listComments(
    credentials: Credentials,
    taskId: string,
    params: QueryParams,
  ): Promise<Comment[]> {
    const slug = this.workspaceSlug(credentials, params)
    const [projectId, workItemId] = this.splitId(taskId, 2)
    if (!projectId || !workItemId) {
      throw new Error('Plane listComments requires a composite task id "projectId/workItemId"')
    }
    const res = await this.client(credentials).get<ListResponse<RawPlaneComment>>(
      `/workspaces/${slug}/projects/${projectId}/work-items/${workItemId}/comments/`,
      this.listParams(params),
    )
    return (res.results ?? []).map((c) => transformComment(c, workItemId, projectId))
  }

  async getComment(credentials: Credentials, id: string): Promise<Comment> {
    const slug = this.workspaceSlug(credentials)
    const [projectId, workItemId, commentId] = this.splitId(id, 3)
    if (!projectId || !workItemId || !commentId) {
      throw new Error('Plane getComment requires a composite id "projectId/workItemId/commentId"')
    }
    const raw = await this.client(credentials).get<RawPlaneComment>(
      `/workspaces/${slug}/projects/${projectId}/work-items/${workItemId}/comments/${commentId}/`,
    )
    return transformComment(raw, workItemId, projectId)
  }

  // ── Tags (project-scoped labels) ────────────────────────────────────────────
  async listTags(
    credentials: Credentials,
    workspaceId: string,
    params: QueryParams,
  ): Promise<Tag[]> {
    const slug = this.workspaceSlug(credentials, params)
    const projectId = params['project_id']
    if (!projectId) {
      throw new Error('Plane listTags requires params.project_id (labels are project-scoped)')
    }
    const res = await this.client(credentials).get<ListResponse<RawPlaneLabel>>(
      `/workspaces/${slug}/projects/${String(projectId)}/labels/`,
      this.listParams(params),
    )
    return (res.results ?? []).map((l) => transformTag(l, workspaceId || undefined))
  }

  async getTag(credentials: Credentials, id: string): Promise<Tag> {
    const slug = this.workspaceSlug(credentials)
    const [projectId, labelId] = this.splitId(id, 2)
    if (!projectId || !labelId) {
      throw new Error('Plane getTag requires a composite id "projectId/labelId"')
    }
    const raw = await this.client(credentials).get<RawPlaneLabel>(
      `/workspaces/${slug}/projects/${projectId}/labels/${labelId}/`,
    )
    return transformTag(raw)
  }

  // ── Users (workspace members) ───────────────────────────────────────────────
  async listUsers(
    credentials: Credentials,
    _workspaceId: string,
    params: QueryParams,
  ): Promise<User[]> {
    const slug = this.workspaceSlug(credentials, params)
    // The members endpoint documents no query parameters and returns every
    // member as a bare JSON array, so the whole list is paged locally.
    // Docs: https://developers.plane.so/api-reference/members/get-workspace-members
    const res = await this.client(credentials).get<RawPlaneMember[] | ListResponse<RawPlaneMember>>(
      `/workspaces/${slug}/members/`,
    )
    const all = Array.isArray(res) ? res : (res.results ?? [])
    return pageLocally(all, params).map((m) => transformUser(m, slug))
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    const slug = this.workspaceSlug(credentials)
    const raw = await this.client(credentials).get<RawPlaneMember>(
      `/workspaces/${slug}/members/${id}/`,
    )
    return transformUser(raw, slug)
  }
}
