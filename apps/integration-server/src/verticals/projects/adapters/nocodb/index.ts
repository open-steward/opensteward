/**
 * NocoDB adapter for the projects vertical.
 *
 * NocoDB is an open-source no-code database (Airtable alternative) with a
 * REST API at `https://app.nocodb.com/api/v2` (cloud) or
 * `https://<self-hosted>/api/v2` (self-hosted). Authentication uses a
 * long-lived personal API token ("nc_pat_…") sent in the `xc-token` header.
 * There is no OAuth2 authorization-code flow; credentials are collected via
 * the Connect Link form (single API-key field via `simpleApiKey`).
 *
 * Canonical mapping:
 *   Workspaces ← workspaces   GET /api/v2/meta/workspaces
 *   Projects   ← bases        GET /api/v2/meta/workspaces/{wId}/bases
 *   Tasks      ← records/rows GET /api/v2/tables/{tableId}/records
 *   Comments   ← row comments GET /api/v2/meta/comments?row_id=&fk_model_id=
 *   Users      ← workspace users    GET /api/v2/meta/workspaces/{wId}/users
 *
 * Not implemented (NocoDB has no API for these):
 *   Tags     — no label/tag system exposed via the REST API
 *   Webhooks — no signed HMAC payload documented; webhook events are not
 *              consumed inbound in this vertical
 *
 * Pagination: offset/limit — `?limit=N&offset=M`.
 *   Default: 25, max: 1000. We request 100 per page.
 *
 * Docs: https://nocodb.com/docs/product-docs/developer-resources/rest-apis
 */
// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: tag — NocoDB has no label/tag system exposed via the REST API
// (see github.com/nocodb/nocodb/issues/3661 for the outstanding feature request)

import { pageLocally, pageOffset, reportUpstreamPage, simpleApiKey } from '@opensteward/shared'
import type { Credentials, QueryParams } from '@opensteward/shared'
import type { ProjectsAdapter } from '../../adapter/interface'
import type { Project } from '../../schema/project'
import type { Task } from '../../schema/task'
import type { Comment } from '../../schema/comment'
import type { Workspace } from '../../schema/workspace'
import type { User } from '../../schema/user'

import {
  buildAuthUrl,
  exchangeCode as nocodbExchange,
  refreshCredentials as nocodbRefresh,
} from './auth'
import { NocodbClient } from './client'
import {
  DEFAULT_PAGE_SIZE,
  MAX_RECORDS_LIMIT,
  MAX_TOP_UP_REQUESTS,
  TOKEN_HELP_URL,
} from './constants'

import { transformProject, type RawNocodbBase } from './transform/project'
import { transformTask, type RawNocodbRecord } from './transform/task'
import { transformComment, type RawNocodbComment } from './transform/comment'
import { transformWorkspace, type RawNocodbWorkspace } from './transform/workspace'
import { transformUser, type RawNocodbWorkspaceUser } from './transform/user'

/** NocoDB list envelope: `{ list: T[], pageInfo: { ... } }` */
interface ListEnvelope<T> {
  list?: T[]
  pageInfo?: {
    totalRows?: number
    page?: number
    pageSize?: number
    isLastPage?: boolean
  }
}

/** Connect Link form: single personal API token. */
const CONNECT_FORM = simpleApiKey({
  label: 'API token',
  placeholder: 'nc_pat_…',
  helpText: `Create a token in your NocoDB account settings → API tokens. See ${TOKEN_HELP_URL}`,
})

export class NocodbAdapter implements ProjectsAdapter {
  readonly platform = 'nocodb'
  readonly version = '0.1.0'

  // Connect Link support — single API-token form.
  credentialFields = CONNECT_FORM.credentialFields
  exchangeCredentials = CONNECT_FORM.exchangeCredentials

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return nocodbExchange(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return nocodbRefresh(credentials)
  }

  private client(credentials: Credentials): NocodbClient {
    return new NocodbClient(credentials)
  }

  /** Offset-based pagination: `?limit=N&offset=M`. */
  private listParams(params: QueryParams): Record<string, unknown> {
    return {
      limit: params.limit ?? DEFAULT_PAGE_SIZE,
      ...(params['cursor'] ? { offset: Number(params['cursor']) } : {}),
    }
  }

  // ── Workspaces ────────────────────────────────────────────────────────────

  async listWorkspaces(credentials: Credentials, params: QueryParams): Promise<Workspace[]> {
    const res = await this.client(credentials).get<ListEnvelope<RawNocodbWorkspace>>(
      '/meta/workspaces',
      this.listParams(params),
    )
    return (res.list ?? []).map(transformWorkspace)
  }

  async getWorkspace(credentials: Credentials, id: string): Promise<Workspace> {
    const res = await this.client(credentials).get<RawNocodbWorkspace>(`/meta/workspaces/${id}`)
    if (!res || !res.id) throw new Error(`NocoDB workspace ${id} not found`)
    return transformWorkspace(res)
  }

  // ── Projects (bases) ──────────────────────────────────────────────────────

  async listProjects(credentials: Credentials, params: QueryParams): Promise<Project[]> {
    const workspaceId = params['workspace_id']
    if (workspaceId) {
      const res = await this.client(credentials).get<ListEnvelope<RawNocodbBase>>(
        `/meta/workspaces/${String(workspaceId)}/bases`,
        this.listParams(params),
      )
      return (res.list ?? []).map(transformProject)
    }
    // Without a workspace id, list all bases the token has access to.
    // GET /api/v2/meta/bases/ — "Retrieve a list of all available bases (OSS
    // version)." — documents no query parameters and returns every base.
    const res = await this.client(credentials).get<ListEnvelope<RawNocodbBase>>('/meta/bases')
    return pageLocally((res.list ?? []).map(transformProject), params)
  }

  async getProject(credentials: Credentials, id: string): Promise<Project> {
    const res = await this.client(credentials).get<RawNocodbBase>(`/meta/bases/${id}`)
    if (!res || !res.id) throw new Error(`NocoDB base ${id} not found`)
    return transformProject(res)
  }

  // ── Tasks (rows/records) ──────────────────────────────────────────────────
  //
  // In NocoDB's model the "projectId" passed to listTasks / getTask is the
  // TABLE id (prefixed `m`). Tables sit inside bases, and rows are the
  // canonical task unit.

  async listTasks(
    credentials: Credentials,
    projectId: string,
    params: QueryParams,
  ): Promise<Task[]> {
    // Offset paging: `offset` is "the number of records you want to skip from
    // the beginning of the result set", `limit` at most MAX_RECORDS_LIMIT.
    const size = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_RECORDS_LIMIT)
    const offset = pageOffset(params, size)
    const client = this.client(credentials)
    const rows: RawNocodbRecord[] = []
    let total: number | undefined
    let upstreamMore: boolean | undefined
    // An operator can set NC_DB_QUERY_LIMIT_MAX below `size`, and the server
    // then serves a short page. The next caller page still starts at
    // pageOffset(params, size), so top this page up from where the server
    // stopped rather than leave a gap. The request count is bounded.
    for (let request = 0; request < MAX_TOP_UP_REQUESTS && rows.length < size; request++) {
      const res = await client.get<ListEnvelope<RawNocodbRecord>>(`/tables/${projectId}/records`, {
        limit: size - rows.length,
        offset: offset + rows.length,
      })
      const batch = res.list ?? []
      // A server configured with a higher NC_DB_QUERY_LIMIT_MIN serves more
      // rows than asked; keep exactly this page's rows.
      rows.push(...batch.slice(0, size - rows.length))
      total = typeof res.pageInfo?.totalRows === 'number' ? res.pageInfo.totalRows : undefined
      upstreamMore =
        total !== undefined ? offset + rows.length < total : res.pageInfo?.isLastPage === false
      if (!upstreamMore || batch.length === 0) break
    }
    reportUpstreamPage(params, {
      hasMore: upstreamMore,
      ...(typeof total === 'number' ? { totalCount: total } : {}),
      ...(params.limit !== undefined && size < params.limit ? { pageSize: size } : {}),
    })
    return rows.map((r) => transformTask(r, projectId))
  }

  async getTask(credentials: Credentials, id: string): Promise<Task> {
    // Canonical id is `{tableId}:{rowId}` (set by transformTask).
    const sep = id.indexOf(':')
    if (sep === -1) {
      throw new Error(`NocoDB task id must be '{tableId}:{rowId}'; got '${id}'`)
    }
    const tableId = id.slice(0, sep)
    const rowId = id.slice(sep + 1)
    const res = await this.client(credentials).get<RawNocodbRecord>(
      `/tables/${tableId}/records/${rowId}`,
    )
    if (!res) throw new Error(`NocoDB record ${id} not found`)
    return transformTask(res, tableId)
  }

  // ── Comments ──────────────────────────────────────────────────────────────
  //
  // GET /api/v2/meta/comments ("List Comments", "List all comments") takes
  // exactly `row_id` ("Row ID") and `fk_model_id` ("Foreign Key to Model"),
  // both required, and answers `{ list: Comment[] }` with no paging
  // parameters or page info: every comment on the row, paged locally.
  // `taskId` is the canonical `{tableId}:{rowId}` composite.

  private rowComments(
    credentials: Credentials,
    tableId: string,
    rowId: string,
  ): Promise<{ list?: RawNocodbComment[] }> {
    return this.client(credentials).get<{ list?: RawNocodbComment[] }>('/meta/comments', {
      row_id: rowId,
      fk_model_id: tableId,
    })
  }

  async listComments(
    credentials: Credentials,
    taskId: string,
    params: QueryParams,
  ): Promise<Comment[]> {
    const sep = taskId.indexOf(':')
    if (sep === -1) {
      throw new Error(`NocoDB task id must be '{tableId}:{rowId}'; got '${taskId}'`)
    }
    const res = await this.rowComments(credentials, taskId.slice(0, sep), taskId.slice(sep + 1))
    return pageLocally(res.list ?? [], params).map(transformComment)
  }

  async getComment(credentials: Credentials, id: string): Promise<Comment> {
    // The spec has no GET for one comment (/api/v2/meta/comment/{commentId}
    // is PATCH and DELETE only), so read the row's list and find it.
    // id format: `{tableId}:{rowId}:{commentId}`
    const parts = id.split(':')
    if (parts.length !== 3) {
      throw new Error(`NocoDB comment id must be '{tableId}:{rowId}:{commentId}'; got '${id}'`)
    }
    const [tableId, rowId, commentId] = parts as [string, string, string]
    const res = await this.rowComments(credentials, tableId, rowId)
    const found = (res.list ?? []).find((c) => c.id === commentId)
    if (!found) throw new Error(`NocoDB comment ${id} not found`)
    return transformComment(found)
  }

  // ── Users ─────────────────────────────────────────────────────────────────
  //
  // GET /api/v2/meta/workspaces/{workspaceId}/users ("Workspace users list ☁")
  // documents no query parameters and answers `WorkspaceUserList`
  // `{ list, pageInfo }`. With no way to ask for another page, the list is
  // paged locally, but only when its page info does not say rows are missing:
  // reporting a truncated list as whole would let the sync drop cached users.

  private async workspaceUsers(
    credentials: Credentials,
    workspaceId: string,
  ): Promise<RawNocodbWorkspaceUser[]> {
    const res = await this.client(credentials).get<ListEnvelope<RawNocodbWorkspaceUser>>(
      `/meta/workspaces/${encodeURIComponent(workspaceId)}/users`,
    )
    const list = res.list ?? []
    const info = res.pageInfo
    if (
      info?.isLastPage === false ||
      (typeof info?.totalRows === 'number' && info.totalRows > list.length)
    ) {
      throw Object.assign(
        new Error(
          `NocoDB served ${list.length} of ${info?.totalRows ?? 'more'} users in workspace ${workspaceId}, and the users list documents no parameter to reach the rest`,
        ),
        { statusCode: 502 },
      )
    }
    return list
  }

  async listUsers(
    credentials: Credentials,
    workspaceId: string,
    params: QueryParams,
  ): Promise<User[]> {
    const users = await this.workspaceUsers(credentials, workspaceId)
    return pageLocally(users, params).map((u) => transformUser(u, workspaceId))
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    // The canonical id is the workspace user's `fk_user_id`, which does not
    // name its workspace: walk the workspaces (GET /api/v2/meta/workspaces)
    // and each one's documented users list.
    const wsRes =
      await this.client(credentials).get<ListEnvelope<RawNocodbWorkspace>>('/meta/workspaces')
    for (const ws of wsRes.list ?? []) {
      if (!ws.id) continue
      const found = (await this.workspaceUsers(credentials, ws.id)).find((u) => u.fk_user_id === id)
      if (found) return transformUser(found, ws.id)
    }
    throw new Error(`NocoDB user ${id} not found`)
  }
}
