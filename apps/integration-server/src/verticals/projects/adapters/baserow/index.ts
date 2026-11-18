/**
 * Baserow adapter for the projects vertical.
 *
 * Baserow is an open-source no-code database platform with a REST API at
 * `https://api.baserow.io/api/`. Authentication uses a long-lived personal
 * API token ("database token") in the `Authorization: Token <key>` header.
 * There is no OAuth2 authorization-code flow, so credentials are collected
 * via the Connect Link form (single API-key field via `simpleApiKey`).
 *
 * Canonical mapping:
 *   Workspaces  ← workspaces    GET /workspaces/
 *   Projects    ← applications  GET /applications/   (type=database)
 *   Tasks       ← rows          GET /database/rows/table/{table_id}/
 *   Users       ← workspace members (embedded in GET /workspaces/)
 *
 * Not implemented (Baserow has no API for these):
 *   Comments — row comments exist only in the Baserow Premium plugin
 *              (/api/row_comments/); not accessible via a free-tier database token
 *   Tags     — no tag or label concept in the Baserow REST API
 *   Webhooks — no signed payload; no HMAC verification documented
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: comment — row comments are a Baserow Premium-only feature; not exposed via database token
 * Unavailable: tag     — no tag/label system exists in the Baserow REST API
 *
 * Pagination: DRF-style `{ count, results, next, previous }` with
 * `?page=N&size=M` query params.
 */
import { pageLocally, reportUpstreamPage, simpleApiKey } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import type { ProjectsAdapter } from '../../adapter/interface'
import type { Project } from '../../schema/project'
import type { Task } from '../../schema/task'
import type { Workspace } from '../../schema/workspace'
import type { User } from '../../schema/user'

import { buildAuthUrl, exchangeCode as baserowExchange, refreshCredentials as baserowRefresh } from './auth'
import { BaserowClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_ROW_PAGE_SIZE, TOKEN_HELP_URL } from './constants'

import { transformProject, type RawBaserowApplication } from './transform/project'
import { transformTask, type RawBaserowRow } from './transform/task'
import { transformWorkspace, type RawBaserowWorkspace } from './transform/workspace'
import { transformUser, type RawBaserowUser } from './transform/user'

/** DRF paginated list envelope returned by Baserow list endpoints. */
interface PagedResponse<T> {
  count?: number
  results?: T[]
  next?: string | null
  previous?: string | null
}

/** Connect Link form: single personal API token. */
const CONNECT_FORM = simpleApiKey({
  label: 'Personal API token',
  placeholder: 'your-baserow-database-token',
  helpText: `Create a token in your Baserow workspace settings → Database tokens. See ${TOKEN_HELP_URL}`,
})

export class BaserowAdapter implements ProjectsAdapter {
  readonly platform = 'baserow'
  readonly version = '0.1.0'
  /** The rows endpoint's size ceiling; every other list is paged locally. */
  readonly capabilities = { maxPageSize: MAX_ROW_PAGE_SIZE }

  // Connect Link support — single API-token form.
  credentialFields = CONNECT_FORM.credentialFields
  exchangeCredentials = CONNECT_FORM.exchangeCredentials

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return baserowExchange(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return baserowRefresh(credentials)
  }

  private client(credentials: Credentials): BaserowClient {
    return new BaserowClient(credentials)
  }

  /**
   * Page-based pagination: `?page=N&size=M`, 1-based, `size` at most
   * {@link MAX_ROW_PAGE_SIZE}.
   */
  private listParams(params: QueryParams): { page: number; size: number } {
    return {
      page: params.page ?? 1,
      size: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_ROW_PAGE_SIZE),
    }
  }

  // ── Projects (applications/databases) ────────────────────────────────────

  async listProjects(credentials: Credentials, params: QueryParams): Promise<Project[]> {
    const workspaceId = params['workspace_id']
    const path = workspaceId
      ? `/applications/?workspace_id=${String(workspaceId)}`
      : '/applications/'
    const res = await this.client(credentials).get<RawBaserowApplication[]>(path)
    const items = Array.isArray(res) ? res : []
    // GET /applications/ takes no paging parameters and returns every application.
    return pageLocally(
      items.filter((a) => !a.type || a.type === 'database').map(transformProject),
      params,
    )
  }

  async getProject(credentials: Credentials, id: string): Promise<Project> {
    const res = await this.client(credentials).get<RawBaserowApplication>(`/applications/${id}/`)
    if (!res || res.id == null) throw new Error(`Baserow application ${id} not found`)
    return transformProject(res)
  }

  // ── Tasks (rows) ─────────────────────────────────────────────────────────
  //
  // In Baserow the "project" in listTasks/getTask context is a TABLE id —
  // tables sit inside applications and rows are the canonical task unit.

  async listTasks(credentials: Credentials, projectId: string, params: QueryParams): Promise<Task[]> {
    const query = this.listParams(params)
    const res = await this.client(credentials).get<PagedResponse<RawBaserowRow>>(
      `/database/rows/table/${projectId}/`,
      query,
    )
    // `next`: "URL to the next page.", null on the last one.
    reportUpstreamPage(params, {
      hasMore: res.next != null,
      ...(typeof res.count === 'number' ? { totalCount: res.count } : {}),
      ...(params.limit !== undefined && query.size < params.limit ? { pageSize: query.size } : {}),
    })
    return (res.results ?? []).map((r) => transformTask(r, projectId))
  }

  async getTask(credentials: Credentials, id: string): Promise<Task> {
    // Canonical id is `{tableId}:{rowId}` to allow path reconstruction.
    const sep = id.indexOf(':')
    if (sep === -1) throw new Error(`Baserow task id must be '{tableId}:{rowId}'; got '${id}'`)
    const tableId = id.slice(0, sep)
    const rowId = id.slice(sep + 1)
    const res = await this.client(credentials).get<RawBaserowRow>(
      `/database/rows/table/${tableId}/${rowId}/`,
    )
    if (!res || res.id == null) throw new Error(`Baserow row ${id} not found`)
    return transformTask(res, tableId)
  }

  // ── Workspaces ────────────────────────────────────────────────────────────

  async listWorkspaces(credentials: Credentials, params: QueryParams): Promise<Workspace[]> {
    // GET /workspaces/ takes no paging parameters and returns every workspace.
    const res = await this.client(credentials).get<RawBaserowWorkspace[]>('/workspaces/')
    const items = Array.isArray(res) ? res : []
    return pageLocally(items.map(transformWorkspace), params)
  }

  async getWorkspace(credentials: Credentials, id: string): Promise<Workspace> {
    // Baserow has no single-workspace GET; scan the list.
    const all = await this.client(credentials).get<RawBaserowWorkspace[]>('/workspaces/')
    const items = Array.isArray(all) ? all : []
    const found = items.find((w) => String(w.id) === id)
    if (!found) throw new Error(`Baserow workspace ${id} not found`)
    return transformWorkspace(found)
  }

  // ── Users ─────────────────────────────────────────────────────────────────
  //
  // Baserow embeds the member list in the workspace response. There is no
  // standalone per-user GET-by-id endpoint accessible via database tokens.

  async listUsers(credentials: Credentials, workspaceId: string, params: QueryParams): Promise<User[]> {
    // Every member rides in the one unpaged GET /workspaces/ response.
    const all = await this.client(credentials).get<RawBaserowWorkspace[]>('/workspaces/')
    const items = Array.isArray(all) ? all : []
    const ws = items.find((w) => String(w.id) === workspaceId)
    const members = (ws?.users ?? []).map((u) => transformUser(u as RawBaserowUser, workspaceId))
    return pageLocally(members, params)
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    // Walk all workspaces to find the user by id or email.
    const all = await this.client(credentials).get<RawBaserowWorkspace[]>('/workspaces/')
    const items = Array.isArray(all) ? all : []
    for (const ws of items) {
      const member = (ws.users ?? []).find(
        (u) => String(u.id) === id || u.email === id,
      )
      if (member) return transformUser(member as RawBaserowUser, String(ws.id))
    }
    throw new Error(`Baserow user ${id} not found`)
  }
}

export { DEFAULT_PAGE_SIZE }
