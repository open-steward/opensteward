/**
 * Weeek adapter for the projects vertical.
 *
 * Weeek is a task and project management platform.  Its REST API lives at
 * https://api.weeek.net/public/v1, authenticated with a long-lived personal
 * API token sent as `Authorization: Bearer <token>` (no OAuth2 flow), so
 * credentials are collected through the Connect Link form (`simpleApiKey`).
 *
 * Supported canonical resources:
 *   - Workspaces  GET /ws
 *   - Users       GET /ws/members
 *   - Projects    GET /tm/projects, GET /tm/projects/{id}
 *   - Tasks       GET /tm/tasks?projectId={pid}, GET /tm/tasks/{id}
 *   - Tags        GET /ws/tags, GET /ws/tags/{id}
 *
 * Intentionally NOT implemented (left off → auto-respond 501):
 *   - Comments — Weeek v1 public API has no task-comment endpoint.
 *   - Webhooks — Weeek v1 public API does not document signed webhook
 *                delivery, so no verify/parse hooks are declared.
 *
 * Pagination (OpenAPI spec shipped by https://developers.weeek.net/api):
 *   - GET /tm/tasks documents `perPage` + `offset` query parameters and a
 *     `hasMore` boolean. No `perPage` maximum is documented, so the adapter
 *     walks it with `pageByRows`, advancing `offset` by the rows each
 *     response actually held: an upstream that returns fewer rows than asked
 *     loses none.
 *   - GET /tm/projects, GET /ws/members, GET /ws/tags and GET /ws declare no
 *     parameters and return the whole collection; they are paged locally.
 */
import {
  connectionScope,
  cursorPagerKey,
  pageByRows,
  pageLocally,
  simpleApiKey,
} from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import type { ProjectsAdapter } from '../../adapter/interface'
import type { Project } from '../../schema/project'
import type { Task } from '../../schema/task'
import type { Tag } from '../../schema/tag'
import type { Workspace } from '../../schema/workspace'
import type { User } from '../../schema/user'

import {
  buildAuthUrl,
  exchangeCode as weeekExchange,
  refreshCredentials as weeekRefresh,
} from './auth'
import { WeeekClient } from './client'
import { API_BASE_URL, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, TOKEN_HELP_URL } from './constants'

import { transformProject, type RawWeeekProject } from './transform/project'
import { transformTask, type RawWeeekTask } from './transform/task'
import { transformTag, type RawWeeekTag } from './transform/tag'
import { transformWorkspace, type RawWeeekWorkspace } from './transform/workspace'
import { transformUser, type RawWeeekMember } from './transform/user'

// ── Resource coverage ──────────────────────────────────────────────────────────
// Unavailable: comment — Weeek v1 public API has no task-comment endpoint
//              (GET /tm/tasks/{id}/comments returns HTTP 404).

// ── Response envelopes ────────────────────────────────────────────────────────

interface WsInfoResponse {
  success: boolean
  workspace?: RawWeeekWorkspace
}

interface WsMembersResponse {
  success: boolean
  members?: RawWeeekMember[]
}

interface ProjectListResponse {
  success: boolean
  projects?: RawWeeekProject[]
}

interface ProjectSingleResponse {
  success: boolean
  project?: RawWeeekProject
}

interface TaskListResponse {
  success: boolean
  hasMore?: boolean
  tasks?: RawWeeekTask[]
}

interface TaskSingleResponse {
  success: boolean
  task?: RawWeeekTask
}

interface TagListResponse {
  success: boolean
  tags?: RawWeeekTag[]
}

interface TagSingleResponse {
  success: boolean
  tag?: RawWeeekTag
}

// ── Connect Link form ─────────────────────────────────────────────────────────

const CONNECT_FORM = simpleApiKey({
  label: 'API token',
  placeholder: 'Paste your Weeek API token',
  helpText: `Generate an API token from your Weeek workspace settings → API section. See ${TOKEN_HELP_URL}`,
})

// ── Adapter class ─────────────────────────────────────────────────────────────

export class WeeekAdapter implements ProjectsAdapter {
  readonly platform = 'weeek'
  readonly version = '0.1.0'

  // Connect Link support — single API token form.
  credentialFields = CONNECT_FORM.credentialFields
  exchangeCredentials = CONNECT_FORM.exchangeCredentials

  getAuthUrl(_state: string): string {
    return buildAuthUrl(_state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return weeekExchange(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return weeekRefresh(credentials)
  }

  private client(credentials: Credentials): WeeekClient {
    return new WeeekClient(credentials)
  }

  // ── Workspaces ──────────────────────────────────────────────────────────────
  //
  // Weeek has a single workspace per token; GET /ws returns it.

  async listWorkspaces(credentials: Credentials, params: QueryParams): Promise<Workspace[]> {
    // GET /ws takes no parameters and returns the token's one workspace.
    const res = await this.client(credentials).get<WsInfoResponse>('/ws')
    const all = res.workspace ? [res.workspace] : []
    return pageLocally(all, params).map((w) => transformWorkspace(w))
  }

  async getWorkspace(credentials: Credentials, _id: string): Promise<Workspace> {
    const res = await this.client(credentials).get<WsInfoResponse>('/ws')
    if (!res.workspace) throw new Error('Weeek workspace not found')
    return transformWorkspace(res.workspace)
  }

  // ── Users ───────────────────────────────────────────────────────────────────
  //
  // GET /ws/members returns all members of the current workspace.

  async listUsers(
    credentials: Credentials,
    workspaceId: string,
    params: QueryParams,
  ): Promise<User[]> {
    // GET /ws/members documents no parameters: the whole member list.
    const res = await this.client(credentials).get<WsMembersResponse>('/ws/members')
    return pageLocally(res.members ?? [], params).map((m) => transformUser(m, workspaceId))
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    // Weeek has no single-member endpoint; fetch the list and find by id.
    const res = await this.client(credentials).get<WsMembersResponse>('/ws/members')
    const found = (res.members ?? []).find((m) => String(m.id) === id)
    if (!found) throw new Error(`Weeek member ${id} not found`)
    return transformUser(found)
  }

  // ── Projects ────────────────────────────────────────────────────────────────

  async listProjects(credentials: Credentials, params: QueryParams): Promise<Project[]> {
    // Fetch workspace id for enriching project objects
    const workspaceId = await this.resolveWorkspaceId(credentials)
    // GET /tm/projects documents no parameters: the whole project list.
    const res = await this.client(credentials).get<ProjectListResponse>('/tm/projects')
    return pageLocally(res.projects ?? [], params).map((p) => transformProject(p, workspaceId))
  }

  async getProject(credentials: Credentials, id: string): Promise<Project> {
    const workspaceId = await this.resolveWorkspaceId(credentials)
    const res = await this.client(credentials).get<ProjectSingleResponse>(`/tm/projects/${id}`)
    if (!res.project) throw new Error(`Weeek project ${id} not found`)
    return transformProject(res.project, workspaceId)
  }

  // ── Tasks ───────────────────────────────────────────────────────────────────
  //
  // Weeek tasks are scoped to a project via the `projectId` query parameter.

  async listTasks(
    credentials: Credentials,
    projectId: string,
    params: QueryParams,
  ): Promise<Task[]> {
    // perPage + offset, next while `hasMore` is true. The upstream batch is
    // the caller's limit capped at MAX_PAGE_SIZE; the offset advances by the
    // rows actually returned, so a smaller server-side cap loses no rows.
    const limit = Math.floor(Number(params.limit ?? DEFAULT_PAGE_SIZE))
    const perPage = Math.min(
      Number.isFinite(limit) && limit >= 1 ? limit : DEFAULT_PAGE_SIZE,
      MAX_PAGE_SIZE,
    )
    const key = cursorPagerKey(connectionScope(API_BASE_URL, credentials), 'weeek/tm/tasks', {
      projectId,
      perPage,
    })
    const client = this.client(credentials)
    const page = await pageByRows<RawWeeekTask, number>(
      key,
      params,
      async (offset) => {
        const at = offset ?? 0
        const res = await client.get<TaskListResponse>('/tm/tasks', {
          perPage,
          offset: at,
          projectId,
        })
        const items = res.tasks ?? []
        const next = res.hasMore === true && items.length > 0 ? at + items.length : undefined
        return { items, next }
      },
      { defaultLimit: DEFAULT_PAGE_SIZE },
    )
    return page.items.map((t) => transformTask(t, projectId))
  }

  async getTask(credentials: Credentials, id: string): Promise<Task> {
    const res = await this.client(credentials).get<TaskSingleResponse>(`/tm/tasks/${id}`)
    if (!res.task) throw new Error(`Weeek task ${id} not found`)
    return transformTask(res.task)
  }

  // ── Tags ────────────────────────────────────────────────────────────────────
  //
  // Tags are workspace-scoped. GET /ws/tags ("Get tags", parameters:[])
  // returns the whole tag list, so it is paged locally and sends no query.

  async listTags(
    credentials: Credentials,
    workspaceId: string,
    params: QueryParams,
  ): Promise<Tag[]> {
    const res = await this.client(credentials).get<TagListResponse>('/ws/tags')
    return pageLocally(res.tags ?? [], params).map((t) => transformTag(t, workspaceId))
  }

  async getTag(credentials: Credentials, id: string): Promise<Tag> {
    const workspaceId = await this.requireWorkspaceId(credentials)
    const res = await this.client(credentials).get<TagSingleResponse>(
      `/ws/tags/${encodeURIComponent(id)}`,
    )
    if (!res.tag) throw new Error(`Weeek tag ${id} not found`)
    return transformTag(res.tag, workspaceId)
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  /**
   * The token's workspace id from GET /ws ("Get workspace", parameters:[],
   * 200 → {success, workspace: Workspace}, Workspace.id:{type:"integer"}).
   * Throws when /ws fails or carries no workspace: the canonical Tag needs a
   * real workspaceId, never ''.
   */
  private async requireWorkspaceId(credentials: Credentials): Promise<string> {
    const res = await this.client(credentials).get<WsInfoResponse>('/ws')
    if (!res.workspace) throw new Error('Weeek GET /ws returned no workspace')
    return String(res.workspace.id)
  }

  /** Fetch the workspace id string (used to enrich objects that lack it). */
  private async resolveWorkspaceId(credentials: Credentials): Promise<string> {
    try {
      const res = await this.client(credentials).get<WsInfoResponse>('/ws')
      return res.workspace ? String(res.workspace.id) : ''
    } catch {
      return ''
    }
  }
}
