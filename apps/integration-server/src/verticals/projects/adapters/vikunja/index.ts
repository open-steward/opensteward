/**
 * Vikunja adapter for the projects vertical.
 *
 * Vikunja is a self-hostable, open-source task and project management platform.
 * Its REST API lives at `<instance>/api/v1` (public try instance:
 * https://try.vikunja.io/api/v1). Authentication uses a long-lived API token
 * sent as `Authorization: Bearer <token>` — no OAuth2 flow. Credentials are
 * collected through the Connect Link form (`simpleApiKey` helper + an optional
 * base URL field for self-hosted instances).
 *
 * Supported canonical resources:
 *   - Projects    GET /projects, GET /projects/{id}
 *   - Tasks       GET /tasks?filter=project = {id}, GET /tasks/{id}
 *   - Comments    GET /tasks/{id}/comments
 *   - Tags        GET /labels, GET /labels/{id}  (Vikunja labels → canonical tags)
 *   - Workspaces  Synthetic: root-level projects (parent_project_id == null)
 *                 returned from GET /projects?is_archived=false
 *   - Users       GET /projects/{id}/projectusers (per-project user list)
 *   - Webhooks    HMAC-SHA256 via X-Vikunja-Signature header
 *
 * Intentionally NOT implemented (auto-respond 501):
 *   - getWorkspace — Vikunja has no single workspace resource endpoint;
 *     workspaces are derived from the project list.
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
import type { Comment } from '../../schema/comment'
import type { Tag } from '../../schema/tag'
import type { Workspace } from '../../schema/workspace'
import type { User } from '../../schema/user'
import type { WebhookEvent } from '../../schema/webhook'

import { buildAuthUrl, exchangeCode as vikunjaExchange, refreshCredentials as vikunjaRefresh } from './auth'
import { VikunjaClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_ITEMS_PER_PAGE, TOKEN_HELP_URL } from './constants'
import { verifyVikunjaWebhook, parseVikunjaWebhookEvents } from './webhook'

import { transformProject, type RawVikunjaProject } from './transform/project'
import { transformTask, type RawVikunjaTask } from './transform/task'
import { transformComment, type RawVikunjaTaskComment } from './transform/comment'
import { transformTag, type RawVikunjaLabel } from './transform/tag'
import { transformWorkspace, type RawVikunjaWorkspace } from './transform/workspace'
import { transformUser, type RawVikunjaUser } from './transform/user'

/**
 * Connect Link form: a single Vikunja API token plus an optional base URL for
 * self-hosted instances. The token is stored as `accessToken`; the custom base
 * URL (if provided) is stored in `extra.baseUrl`.
 */
const CONNECT_FORM = simpleApiKey({
  label: 'API token',
  placeholder: 'vikunja_tok_…',
  helpText: `Generate an API token from Settings > API Tokens in your Vikunja instance. See ${TOKEN_HELP_URL}`,
})

export class VikunjaAdapter implements ProjectsAdapter {
  readonly platform = 'vikunja'
  readonly version = '0.1.0'

  // Connect Link support — single API key form.
  credentialFields = CONNECT_FORM.credentialFields
  exchangeCredentials = CONNECT_FORM.exchangeCredentials

  getAuthUrl(_state: string): string {
    return buildAuthUrl(_state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return vikunjaExchange(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return vikunjaRefresh(credentials)
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyVikunjaWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseVikunjaWebhookEvents(payload)
  }

  private client(credentials: Credentials): VikunjaClient {
    return new VikunjaClient(credentials)
  }

  /**
   * Serve the caller's page of a list Vikunja's generic list handler pages.
   *
   * Every such endpoint takes `page` ("The page number. Used for pagination.")
   * and `per_page` ("The maximum number of items per page. Note this parameter
   * is limited by the configured maximum of items per page."), and answers with
   * `x-pagination-total-pages` ("The total number of available pages for this
   * request"), per https://try.vikunja.io/api/v1/docs.json. The maximum is the
   * instance's `service.maxitemsperpage` (50 by default), and a larger
   * per_page is clamped to it without an error, so one upstream page is not one
   * caller page. Sending the caller's limit and ignoring `page` repeated page 1
   * on every page. `pageByRows` walks the upstream pages at 50 a page,
   * following the total-pages header (so a lower instance maximum still pages
   * correctly), and cuts exactly the caller's rows with `hasMore` exact.
   *
   * `keep` filters raw rows before they are counted (root projects for
   * workspaces), so a filtered page is still a full caller page.
   *
   * Keyed per connection (instance URL + a token fingerprint) and per path and
   * filter; the upstream page size is fixed, so the caller's limit is left out.
   */
  private async listPaged<T>(
    credentials: Credentials,
    path: string,
    params: QueryParams,
    filters: Record<string, unknown> = {},
    keep?: (row: T) => boolean,
  ): Promise<T[]> {
    const client = this.client(credentials)
    const perPage = MAX_ITEMS_PER_PAGE
    const key = cursorPagerKey(connectionScope(client.baseUrl, credentials), path, {
      ...filters,
      ...(keep ? { keep: 'filtered' } : {}),
      per_page: perPage,
    })
    const { items } = await pageByRows<T, number>(
      key,
      params,
      async (cursor) => {
        const page = cursor ?? 1
        const { data, totalPages } = await client.getPage<T[]>(path, {
          ...filters,
          page,
          per_page: perPage,
        })
        const rows = Array.isArray(data) ? data : []
        // Without the header, a short page is the last one.
        const more = totalPages !== undefined ? page < totalPages : rows.length >= perPage
        return { items: keep ? rows.filter(keep) : rows, next: more ? page + 1 : undefined }
      },
      { defaultLimit: DEFAULT_PAGE_SIZE },
    )
    return items
  }

  // ── Projects ───────────────────────────────────────────────────────────────

  async listProjects(credentials: Credentials, params: QueryParams): Promise<Project[]> {
    const items = await this.listPaged<RawVikunjaProject>(credentials, '/projects', params)
    return items.map(transformProject)
  }

  async getProject(credentials: Credentials, id: string): Promise<Project> {
    const item = await this.client(credentials).get<RawVikunjaProject>(`/projects/${id}`)
    return transformProject(item)
  }

  // ── Tasks ─────────────────────────────────────────────────────────────────

  async listTasks(credentials: Credentials, projectId: string, params: QueryParams): Promise<Task[]> {
    // The spec (https://try.vikunja.io/api/v1/docs.json) documents
    // /projects/{id}/tasks only as PUT ("Create a task"). The documented list is
    // GET /tasks, "Returns all tasks on any project the user has access to.",
    // which takes page, per_page and `filter` ("The filter query to match tasks
    // by"). The Filter API Reference (https://vikunja.io/docs/filters) narrows
    // it to one project: "Through the API, you must use numeric IDs: ...
    // project = 12". sort_by "Default is `id`" and order_by "Default is `asc`"
    // are sent explicitly so the upstream order, and so page N, is stable.
    // (GET /projects/{id}/views/{view}/tasks needs a view id, and a view can
    // carry its own filter.)
    const items = await this.listPaged<RawVikunjaTask>(credentials, '/tasks', params, {
      filter: `project = ${projectId}`,
      sort_by: 'id',
      order_by: 'asc',
    })
    // Each row carries its own documented project_id (models.Task: "The project
    // this task belongs to."), so the label comes from the row, not from the
    // caller's id: an id that is not a plain number cannot relabel other rows.
    return items.map((t) => transformTask(t))
  }

  async getTask(credentials: Credentials, id: string): Promise<Task> {
    const item = await this.client(credentials).get<RawVikunjaTask>(`/tasks/${id}`)
    return transformTask(item)
  }

  // ── Comments ──────────────────────────────────────────────────────────────
  //
  // Vikunja task comments are at GET /tasks/{id}/comments.
  // There is no single-comment GET endpoint; getComment fetches the list and
  // finds by id (format: "{taskId}:{commentId}").

  async listComments(credentials: Credentials, taskId: string, params: QueryParams): Promise<Comment[]> {
    const items = await this.listPaged<RawVikunjaTaskComment>(
      credentials,
      `/tasks/${taskId}/comments`,
      params,
    )
    return items.map((c) => transformComment(c, taskId))
  }

  async getComment(credentials: Credentials, id: string): Promise<Comment> {
    // id format: "{taskId}:{commentId}"
    const sep = id.indexOf(':')
    const taskId = sep !== -1 ? id.slice(0, sep) : id
    const commentId = sep !== -1 ? id.slice(sep + 1) : id
    const items = await this.client(credentials).get<RawVikunjaTaskComment[]>(
      `/tasks/${taskId}/comments`,
    )
    const found = (Array.isArray(items) ? items : []).find((c) => String(c.id) === commentId)
    if (!found) throw new Error(`Vikunja comment ${id} not found`)
    return transformComment(found, taskId)
  }

  // ── Tags (Labels) ─────────────────────────────────────────────────────────
  //
  // Vikunja labels are user-scoped, not workspace-scoped. The `workspaceId`
  // argument from the interface is accepted but not used to filter the request.

  async listTags(credentials: Credentials, _workspaceId: string, params: QueryParams): Promise<Tag[]> {
    const items = await this.listPaged<RawVikunjaLabel>(credentials, '/labels', params)
    return items.map(transformTag)
  }

  async getTag(credentials: Credentials, id: string): Promise<Tag> {
    const item = await this.client(credentials).get<RawVikunjaLabel>(`/labels/${id}`)
    return transformTag(item)
  }

  // ── Workspaces (synthetic — root projects) ─────────────────────────────────
  //
  // Vikunja has no workspace concept. We treat root-level projects
  // (parent_project_id == null or 0) as workspaces.

  async listWorkspaces(credentials: Credentials, params: QueryParams): Promise<Workspace[]> {
    const items = await this.listPaged<RawVikunjaWorkspace>(
      credentials,
      '/projects',
      params,
      {},
      (p) => !p.parent_project_id,
    )
    return items.map(transformWorkspace)
  }

  // ── Users ─────────────────────────────────────────────────────────────────
  //
  // Vikunja exposes per-project users at GET /projects/{id}/projectusers.
  // The `workspaceId` is passed directly as the project id to scope the list.

  async listUsers(
    credentials: Credentials,
    workspaceId: string,
    params: QueryParams,
  ): Promise<User[]> {
    // "Lists all users" and takes only `s` (https://try.vikunja.io/api/v1/docs.json):
    // the whole matching collection in one response, so it is paged locally.
    const items = await this.client(credentials).get<RawVikunjaUser[]>(
      `/projects/${workspaceId}/projectusers`,
      { s: params['q'] ?? '' },
    )
    const all = (Array.isArray(items) ? items : []).map((u) => transformUser(u, workspaceId))
    return pageLocally(all, params)
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    // Vikunja has no single-user GET endpoint in the v1 public API.
    // We resolve the user from admin/users endpoint with a search by id.
    const items = await this.client(credentials).get<RawVikunjaUser[]>('/admin/users', {
      s: id,
      per_page: 50,
    })
    const found = (Array.isArray(items) ? items : []).find((u) => String(u.id) === String(id))
    if (!found) throw new Error(`Vikunja user ${id} not found`)
    return transformUser(found)
  }
}
