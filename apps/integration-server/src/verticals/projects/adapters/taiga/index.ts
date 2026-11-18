/**
 * Taiga adapter for the projects vertical.
 *
 * Auth: API key (auth_token from Taiga UI → User Settings → API).
 *       Stored as credentials.accessToken; sent as Authorization: Bearer <token>.
 *
 * Resources implemented:
 *   - Projects    GET /projects, GET /projects/{id}
 *   - Tasks       GET /userstories?project={id}, GET /userstories/{id}
 *                 GET /tasks?project={id}&user_story={usId}, GET /tasks/{id}
 *                 GET /issues?project={id}, GET /issues/{id}
 *                 (all three mapped to canonical Task; resourceType in metadata)
 *   - Comments    GET /history/userstory/{id}, /history/task/{id}, /history/issue/{id}
 *   - Tags        Derived from project.tags_colors map
 *   - Workspaces  GET /users/me (account-as-workspace)
 *   - Users       GET /memberships?project={id}, GET /users/{id}
 *   - Webhooks    X-TAIGA-WEBHOOK-SIGNATURE HMAC-SHA1 verify + parse
 *
 * Pagination: page-number based (?page=N&page_size=M).
 *
 * Docs: https://docs.taiga.io/api.html
 */
import type { Credentials, QueryParams, CredentialField } from '@opensteward/shared'
import {
  connectionScope,
  cursorPagerKey,
  pageByRows,
  pageLocally,
  reportUpstreamPage,
} from '@opensteward/shared'
import type { ProjectsAdapter } from '../../adapter/interface'
import type { Project } from '../../schema/project'
import type { Task } from '../../schema/task'
import type { Comment } from '../../schema/comment'
import type { Tag } from '../../schema/tag'
import type { Workspace } from '../../schema/workspace'
import type { User } from '../../schema/user'
import type { WebhookEvent } from '../../schema/webhook'

import {
  credentialFields as adapterCredentialFields,
  exchangeCredentials as adapterExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import { TaigaClient } from './client'
import { API_BASE_URL, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'
import { verifyTaigaWebhook, parseTaigaWebhookEvents } from './webhook'

import { transformProject, type RawTaigaProject } from './transform/project'
import { transformTask, type RawTaigaTask } from './transform/task'
import { transformComment, type RawTaigaComment } from './transform/comment'
import { transformTag, expandTagsColors } from './transform/tag'
import { transformWorkspace, type RawTaigaMe } from './transform/workspace'
import {
  transformUser,
  transformMembershipUser,
  type RawTaigaUser,
  type RawTaigaMembership,
} from './transform/user'

export interface TaigaAdapterConfig {
  /** Optional override for self-hosted instances. Default: https://api.taiga.io/api/v1 */
  baseUrl?: string
}

export class TaigaAdapter implements ProjectsAdapter {
  readonly platform = 'taiga'
  readonly version = '0.1.0'

  // Taiga uses API key auth; no OAuth config needed.

  getAuthUrl(_state: string): string {
    return getAuthUrlUnsupported()
  }

  credentialFields(): CredentialField[] {
    return adapterCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return adapterExchangeCredentials(fields)
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('taiga does not support OAuth code exchange; use credentialFields()')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // Taiga tokens are long-lived; no refresh needed.
    return credentials
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyTaigaWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseTaigaWebhookEvents(payload)
  }

  private client(credentials: Credentials): TaigaClient {
    return new TaigaClient(credentials)
  }

  /** The caller's 1-based page, sent upstream as `?page=N`. */
  private page(params: QueryParams): number {
    const n = params.page
    return typeof n === 'number' && Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1
  }

  /** The caller's limit as Taiga's `page_size`, capped at its 1000 cutoff. */
  private pageSize(params: QueryParams): number {
    const n =
      typeof params.limit === 'number' && Number.isFinite(params.limit) && params.limit >= 1
        ? Math.floor(params.limit)
        : DEFAULT_PAGE_SIZE
    return Math.min(n, MAX_PAGE_SIZE)
  }

  /** The connection a row-pager walk belongs to: the instance plus its token. */
  private scope(credentials: Credentials): string {
    const baseUrl = (credentials.extra?.['baseUrl'] as string | undefined) || API_BASE_URL
    return connectionScope(baseUrl, credentials)
  }

  // ── Projects ───────────────────────────────────────────────────────────────

  async listProjects(credentials: Credentials, params: QueryParams): Promise<Project[]> {
    // Taiga pages with ?page=N&page_size=M and sends `x-pagination-next`
    // while another page exists (https://docs.taiga.io/api.html#_pagination).
    const pageSize = this.pageSize(params)
    const { items, hasNext, count } = await this.client(
      credentials,
    ).getPageWithMeta<RawTaigaProject>('/projects', this.page(params), pageSize, {
      order_by: 'id',
    })
    reportUpstreamPage(params, {
      hasMore: hasNext,
      ...(count !== undefined ? { totalCount: count } : {}),
      ...(typeof params.limit === 'number' && pageSize < params.limit ? { pageSize } : {}),
    })
    return items.map(transformProject)
  }

  async getProject(credentials: Credentials, id: string): Promise<Project> {
    const raw = await this.client(credentials).get<RawTaigaProject>(`/projects/${id}`)
    return transformProject(raw)
  }

  // ── Tasks ──────────────────────────────────────────────────────────────────
  //
  // Taiga has three task-like types. We map all to the canonical Task:
  //   User Stories: the primary work unit (no parent)
  //   Tasks: sub-tasks linked to a user story (parentId = user_story id)
  //   Issues: bug/feature tracker (no parent)
  //
  // listTasks fetches all three and merges them.

  async listTasks(
    credentials: Credentials,
    projectId: string,
    params: QueryParams,
  ): Promise<Task[]> {
    // Three paginated endpoints streamed as one list: every page of user
    // stories, then of tasks, then of issues, each followed while Taiga sends
    // `x-pagination-next`. One upstream page is not one caller page, so the
    // caller's rows are cut from that stream by pageByRows.
    const client = this.client(credentials)
    const pageSize = this.pageSize(params)
    const projectParam = { project: projectId }
    const sources = [
      ['/userstories', 'userstory'],
      ['/tasks', 'task'],
      ['/issues', 'issue'],
    ] as const
    type Pos = { source: number; page: number }
    const key = cursorPagerKey(this.scope(credentials), 'tasks', {
      project: projectId,
      pageSize,
    })
    const { items } = await pageByRows<Task, Pos>(
      key,
      params,
      async (pos) => {
        const at = pos ?? { source: 0, page: 1 }
        const [path, kind] = sources[at.source]!
        const res = await client.getPageWithMeta<RawTaigaTask>(
          path,
          at.page,
          pageSize,
          projectParam,
        )
        const next: Pos | undefined = res.hasNext
          ? { source: at.source, page: at.page + 1 }
          : at.source + 1 < sources.length
            ? { source: at.source + 1, page: 1 }
            : undefined
        return { items: res.items.map((t) => transformTask(t, projectId, kind)), next }
      },
      { defaultLimit: DEFAULT_PAGE_SIZE },
    )
    return items
  }

  async getTask(credentials: Credentials, id: string): Promise<Task> {
    // id format: "userstory:<id>" | "task:<id>" | "issue:<id>" | plain numeric
    const [prefix, numericId] = id.includes(':') ? id.split(':', 2) : ['userstory', id]
    const endpoint =
      prefix === 'task'
        ? `/tasks/${numericId}`
        : prefix === 'issue'
          ? `/issues/${numericId}`
          : `/userstories/${numericId}`
    const raw = await this.client(credentials).get<RawTaigaTask>(endpoint)
    return transformTask(raw, raw.project != null ? String(raw.project) : undefined, prefix)
  }

  // ── Comments ───────────────────────────────────────────────────────────────
  //
  // History endpoint: GET /history/{type}/{id}
  // type is one of: userstory | task | issue
  // We try userstory first; fall back to task then issue based on taskId prefix.

  async listComments(
    credentials: Credentials,
    taskId: string,
    params: QueryParams,
  ): Promise<Comment[]> {
    const [prefix, numericId] = taskId.includes(':') ? taskId.split(':', 2) : ['userstory', taskId]
    const historyType = prefix === 'task' ? 'task' : prefix === 'issue' ? 'issue' : 'userstory'
    const items = await this.client(credentials).getAll<RawTaigaComment>(
      `/history/${historyType}/${numericId}`,
    )
    // Filter to comment-only entries (comment field non-empty). The fetch
    // disables pagination, so these are all of the item's comments.
    return pageLocally(
      items
        .filter((e) => e.comment && e.comment.trim().length > 0)
        .map((e) => transformComment(e, taskId)),
      params,
    )
  }

  async getComment(credentials: Credentials, id: string): Promise<Comment> {
    // Comments are not independently retrievable by id in Taiga's REST API;
    // they are embedded in the history list. Return a stub with the id.
    // The caller should use listComments to obtain the full entry.
    throw new Error(
      `taiga: getComment(${id}) is not supported — use listComments to retrieve comments`,
    )
  }

  // ── Tags ───────────────────────────────────────────────────────────────────
  //
  // Tags are stored on projects as tags_colors: { tagName: hexColor | null }.
  // workspaceId is interpreted as the project id here.

  async listTags(
    credentials: Credentials,
    workspaceId: string,
    params: QueryParams,
  ): Promise<Tag[]> {
    const project = await this.client(credentials).get<RawTaigaProject>(`/projects/${workspaceId}`)
    const tagsColors = (project.tags_colors ?? {}) as Record<string, string | null>
    // Every tag of the project is in this one object: page it locally.
    return pageLocally(expandTagsColors(tagsColors, workspaceId).map(transformTag), params)
  }

  async getTag(credentials: Credentials, id: string): Promise<Tag> {
    // id format: "{projectId}:{tagName}" (as produced by transformTag)
    const colonIdx = id.indexOf(':')
    if (colonIdx < 0)
      throw new Error(`taiga: invalid tag id "${id}" — expected "projectId:tagName"`)
    const projectId = id.slice(0, colonIdx)
    const tagName = id.slice(colonIdx + 1)
    const project = await this.client(credentials).get<RawTaigaProject>(`/projects/${projectId}`)
    const tagsColors = (project.tags_colors ?? {}) as Record<string, string | null>
    if (!(tagName in tagsColors))
      throw new Error(`taiga: tag "${tagName}" not found in project ${projectId}`)
    return transformTag({ name: tagName, color: tagsColors[tagName], projectId })
  }

  // ── Workspaces ─────────────────────────────────────────────────────────────
  //
  // Taiga has no workspace concept. We expose the authenticated user's account
  // as a single workspace via GET /users/me.

  async listWorkspaces(credentials: Credentials, params: QueryParams): Promise<Workspace[]> {
    const me = await this.client(credentials).get<RawTaigaMe>('/users/me')
    // A one-row collection: page 2 onwards is empty.
    return pageLocally([transformWorkspace(me)], params)
  }

  async getWorkspace(credentials: Credentials, id: string): Promise<Workspace> {
    const me = await this.client(credentials).get<RawTaigaMe>('/users/me')
    if (String(me.id) !== id) {
      throw new Error(
        `taiga: workspace ${id} not found (only the authenticated user's workspace is accessible)`,
      )
    }
    return transformWorkspace(me)
  }

  // ── Users ──────────────────────────────────────────────────────────────────
  //
  // Taiga scopes people to projects, so workspaceId is read as a project id
  // (as listTags reads it). Its members are the membership detail objects of
  // GET /memberships?project={id}: "The results can be filtered using the
  // following parameters: project: project id" (docs.taiga.io/api.html,
  // Memberships/Invitations > List), paged like every Taiga list.

  async listUsers(
    credentials: Credentials,
    workspaceId: string,
    params: QueryParams,
  ): Promise<User[]> {
    const pageSize = this.pageSize(params)
    const { items, hasNext } = await this.client(credentials).getPageWithMeta<RawTaigaMembership>(
      '/memberships',
      this.page(params),
      pageSize,
      { project: workspaceId },
    )
    // x-pagination-count counts invitations too, so it is not sent as a total.
    reportUpstreamPage(params, {
      hasMore: hasNext,
      ...(typeof params.limit === 'number' && pageSize < params.limit ? { pageSize } : {}),
    })
    // A membership with no user is a pending invitation, not a user.
    return items.filter((m) => m.user != null).map((m) => transformMembershipUser(m, workspaceId))
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    const raw = await this.client(credentials).get<RawTaigaUser>(`/users/${id}`)
    return transformUser(raw)
  }
}
