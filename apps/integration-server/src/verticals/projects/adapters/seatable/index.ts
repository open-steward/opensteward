/**
 * SeaTable adapter for the projects vertical.
 *
 * Auth model: static tokens (api_key), `Authorization: Bearer`. The required
 * base API-Token is exchanged for a Base-Token (rows, comments, users); the
 * optional Account-Token authenticates the account operations (workspaces,
 * bases), which refuse with 501 without it. No OAuth2 flow.
 *
 * Data model mapping:
 *   Workspace  → SeaTable Workspace  (GET /api/v2.1/workspaces/)
 *   Project    → SeaTable Base       (GET /api/v2.1/user-admin-dtables/, or workspace table_list)
 *   Task       → SeaTable Row        (GET /api-gateway/api/v2/dtables/{base_uuid}/rows/)
 *   Comment    → SeaTable Row Comment(GET /api-gateway/api/v2/dtables/{base_uuid}/comments/?row_id=…)
 *   User       → SeaTable Collaborator(GET /api-gateway/api/v2/dtables/{base_uuid}/related-users/)
 *   Tag        → not supported (SeaTable has no native tag/label object)
 */

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: tag — SeaTable has no native tag/label object; tags are implemented as select/multi-select column types within rows, not as standalone API resources
import {
  connectionScope,
  cursorPagerKey,
  pageByRows,
  pageLocally,
  type Credentials,
  type CredentialField,
  type QueryParams,
} from '@opensteward/shared'
import type { ProjectsAdapter } from '../../adapter/interface'
import type { Project } from '../../schema/project'
import type { Task } from '../../schema/task'
import type { Comment } from '../../schema/comment'
import type { Workspace } from '../../schema/workspace'
import type { User } from '../../schema/user'
import type { WebhookEvent } from '../../schema/webhook'

import {
  accountTokenOf,
  credentialFields as adapterCredentialFields,
  exchangeCredentials as adapterExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import { SeatableClient, resolveBaseUrl } from './client'
import { ACCOUNT_API_PATH, GATEWAY_API_PATH, DEFAULT_PAGE_SIZE, ROWS_MAX_LIMIT } from './constants'
import { verifySeatableWebhook, parseSeatableWebhookEvents } from './webhook'

import { transformProject, type RawSeatableProject } from './transform/project'
import { transformTask, type RawSeatableRow } from './transform/task'
import { transformComment, type RawSeatableComment } from './transform/comment'
import { transformWorkspace, type RawSeatableWorkspace } from './transform/workspace'
import { transformUser, type RawSeatableUser } from './transform/user'

// ── Response envelope shapes ─────────────────────────────────────────────────

/** A `workspace_list` entry; `table_list` is present with detail=true. */
interface RawSeatableWorkspaceDetail extends RawSeatableWorkspace {
  table_list?: RawSeatableProject[]
}

interface WorkspacesResponse {
  workspace_list?: RawSeatableWorkspaceDetail[]
}

/** GET /api/v2.1/user-admin-dtables/ — documented example `{ personal: [...], groups: [{ group_id, group_name, dtables: [...] }] }`. */
interface UserAdminDtablesResponse {
  personal?: RawSeatableProject[]
  groups?: Array<{ group_id?: number; group_name?: string; dtables?: RawSeatableProject[] }>
}

/** The "starred" and "shared" entries of `workspace_list` carry `"id": ""`. */
function isWorkspace(w: RawSeatableWorkspaceDetail): boolean {
  return w.id !== ''
}

interface RowsResponse {
  rows?: RawSeatableRow[]
}

interface CommentsResponse {
  comments?: RawSeatableComment[]
}

interface RelatedUsersResponse {
  user_list?: RawSeatableUser[]
}

// ── Config ───────────────────────────────────────────────────────────────────

export type SeatableAdapterConfig = Record<string, never>

// ── Adapter ──────────────────────────────────────────────────────────────────

export class SeatableAdapter implements ProjectsAdapter {
  readonly platform = 'seatable'
  readonly version = '0.1.0'

  constructor(_config?: SeatableAdapterConfig) {}

  getAuthUrl(_state: string, _overrideScopes?: string[]): string {
    return getAuthUrlUnsupported()
  }

  credentialFields(): CredentialField[] {
    return adapterCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return adapterExchangeCredentials(fields)
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('seatable uses static API Token auth; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // API Tokens never expire
    return credentials
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifySeatableWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseSeatableWebhookEvents(payload)
  }

  private client(credentials: Credentials): SeatableClient {
    return new SeatableClient(credentials)
  }

  // ── Workspaces ─────────────────────────────────────────────────────────────

  /**
   * The connection's Account-Token, or a 501 before anything is sent. Every
   * account operation is documented with `security: AccountTokenAuth`; the
   * required API-Token only opens one base.
   */
  private accountToken(credentials: Credentials, what: string): string {
    const token = accountTokenOf(credentials)
    if (!token)
      throw Object.assign(
        new Error(
          `SeaTable cannot ${what} with this connection: the endpoint requires an Account-Token ` +
            '("Every account operation (user, team admin or system admin) requires an Account-Token.") ' +
            'and this connection holds only a base API-Token. Reconnect with an Account-Token.',
        ),
        { statusCode: 501, code: 'NOT_SUPPORTED' },
      )
    return token
  }

  /** GET /api/v2.1/workspaces/ — `workspace_list`, with each base under `table_list` when detail=true. */
  private async fetchWorkspaces(
    credentials: Credentials,
    token: string,
    detail: boolean,
  ): Promise<RawSeatableWorkspaceDetail[]> {
    const res = await this.client(credentials).accountGet<WorkspacesResponse>(
      token,
      `${ACCOUNT_API_PATH}/workspaces/`,
      { detail },
    )
    return res.workspace_list ?? []
  }

  /**
   * GET /api/v2.1/workspaces/ (https://api.seatable.com/reference/listworkspaces):
   * "List all the workspaces/bases you have access to." Its only parameter is
   * `detail`, so the whole list is sliced to the caller's page. The
   * "starred" and "shared" entries have `"id": ""` and are not workspaces.
   */
  async listWorkspaces(credentials: Credentials, params: QueryParams): Promise<Workspace[]> {
    const token = this.accountToken(credentials, 'list workspaces')
    const all = (await this.fetchWorkspaces(credentials, token, false)).filter(isWorkspace)
    return pageLocally(all, params).map(transformWorkspace)
  }

  async getWorkspace(credentials: Credentials, id: string): Promise<Workspace> {
    // SeaTable has no single-workspace GET; read the documented list and find.
    const token = this.accountToken(credentials, 'read a workspace')
    const all = (await this.fetchWorkspaces(credentials, token, false)).filter(isWorkspace)
    const ws = all.find((w) => String(w.id) === id)
    if (!ws) throw new Error(`SeaTable workspace ${id} not found`)
    return transformWorkspace(ws)
  }

  // ── Projects (bases) ───────────────────────────────────────────────────────

  /**
   * GET /api/v2.1/user-admin-dtables/ (https://api.seatable.com/reference/listbases-1):
   * "List all the bases that the current user can administer." It takes no
   * parameters and returns the bases under `personal[]` and
   * `groups[].dtables[]`, so the whole list is sliced to the caller's page.
   *
   * With `workspace_id`, the bases are that workspace's `table_list` from
   * GET /api/v2.1/workspaces/?detail=true.
   */
  async listProjects(credentials: Credentials, params: QueryParams): Promise<Project[]> {
    const token = this.accountToken(credentials, 'list bases')
    const workspaceId = params['workspace_id']
    let bases: RawSeatableProject[]
    if (workspaceId !== undefined && workspaceId !== '') {
      const ws = (await this.fetchWorkspaces(credentials, token, true))
        .filter(isWorkspace)
        .find((w) => String(w.id) === String(workspaceId))
      bases = ws?.table_list ?? []
    } else {
      const res = await this.client(credentials).accountGet<UserAdminDtablesResponse>(
        token,
        `${ACCOUNT_API_PATH}/user-admin-dtables/`,
      )
      // The listbases-1 prose also says the bases are "in the returned
      // `dtables` array", but its example has no top-level `dtables`: it
      // has `personal[]` and `groups[].dtables[]`. Read the example's shape,
      // and fail loudly on any other rather than report an empty account.
      if (!Array.isArray(res.personal))
        throw new Error(
          'SeaTable GET /api/v2.1/user-admin-dtables/ returned no `personal` array; ' +
            'the documented response is { personal: [...], groups: [{ dtables: [...] }] }',
        )
      bases = [...res.personal, ...(res.groups ?? []).flatMap((g) => g.dtables ?? [])]
    }
    return pageLocally(bases, params).map(transformProject)
  }

  async getProject(credentials: Credentials, id: string): Promise<Project> {
    // No single-base GET by uuid; find it in the workspaces' documented table_list.
    const token = this.accountToken(credentials, 'read a base')
    for (const ws of await this.fetchWorkspaces(credentials, token, true)) {
      const base = (ws.table_list ?? []).find((b) => b.uuid === id)
      if (base) return transformProject(base)
    }
    throw new Error(`SeaTable project (base) ${id} not found`)
  }

  // ── Tasks (rows) ───────────────────────────────────────────────────────────

  /**
   * GET /api-gateway/api/v2/dtables/{base_uuid}/rows/ pages by `start` +
   * `limit` (https://api.seatable.com/reference/listrows): start "Starting
   * position (number) of the returned rows. 0 by default."; limit "Number of
   * rows that should be returned. 1000 by default." (maximum 1000). The body
   * carries no next signal, so a page shorter than the `limit` sent ends the
   * table, and `pageByRows` peeks past a full page to make hasMore exact.
   */
  async listTasks(
    credentials: Credentials,
    projectId: string,
    params: QueryParams,
  ): Promise<Task[]> {
    const client = this.client(credentials)
    const tableName = params['table_name'] ?? 'Table1'
    const size = Math.min(
      Math.max(Math.floor(params.limit ?? DEFAULT_PAGE_SIZE), 1),
      ROWS_MAX_LIMIT,
    )
    const fetchRows = async (start: number): Promise<RawSeatableRow[]> => {
      // projectId must be a base_uuid for the gateway endpoint
      const res = await client.gatewayGet<RowsResponse>(
        `${GATEWAY_API_PATH}/dtables/${projectId}/rows/`,
        { table_name: tableName, start, limit: size, convert_keys: true },
      )
      return res.rows ?? []
    }
    if (params['cursor']) {
      // An explicit upstream offset is a position, not a caller page.
      if (!Number.isFinite(size))
        throw new RangeError(
          `SeaTable listTasks: limit must be a number >= 1 (got ${String(params.limit)})`,
        )
      const rows = await fetchRows(Number(params['cursor']))
      return rows.map((r) => transformTask(r, projectId))
    }
    const key = cursorPagerKey(connectionScope(resolveBaseUrl(credentials), credentials), 'rows', {
      base_uuid: projectId,
      table_name: tableName,
      limit: size,
    })
    const { items } = await pageByRows<RawSeatableRow, number>(
      key,
      params,
      async (offset) => {
        const start = offset ?? 0
        const rows = await fetchRows(start)
        return { items: rows, next: rows.length < size ? undefined : start + rows.length }
      },
      { defaultLimit: DEFAULT_PAGE_SIZE },
    )
    return items.map((r) => transformTask(r, projectId))
  }

  async getTask(credentials: Credentials, id: string): Promise<Task> {
    // SeaTable has no single-row GET by row_id across tables without knowing base+table.
    // The caller must pass projectId (base_uuid) via query. We surface a clear error.
    throw new Error(
      `SeaTable getTask(${id}): use listTasks with the base_uuid as projectId and filter client-side`,
    )
  }

  // ── Comments ───────────────────────────────────────────────────────────────

  async listComments(
    credentials: Credentials,
    taskId: string,
    params: QueryParams,
  ): Promise<Comment[]> {
    // taskId = "<base_uuid>:<row_id>" convention OR just row_id when projectId available
    // We expect taskId to be "<row_id>" and params['project_id'] to be the base_uuid
    const baseUuid = params['project_id'] as string | undefined
    const rowId = taskId
    if (!baseUuid) {
      throw new Error(
        'SeaTable listComments requires params.project_id = base_uuid (the base containing the row)',
      )
    }
    const res = await this.client(credentials).gatewayGet<CommentsResponse>(
      `${GATEWAY_API_PATH}/dtables/${baseUuid}/comments/`,
      { row_id: rowId },
    )
    return (res.comments ?? []).map((c) => transformComment(c, rowId, baseUuid))
  }

  async getComment(credentials: Credentials, id: string): Promise<Comment> {
    throw new Error(
      `SeaTable getComment(${id}): no single-comment GET endpoint; use listComments and filter`,
    )
  }

  // ── Users ──────────────────────────────────────────────────────────────────

  /**
   * GET /api-gateway/api/v2/dtables/{base_uuid}/related-users/ takes no paging
   * parameters (https://api.seatable.com/reference/listcollaborators: "List all
   * collaborators of a base with name, email address and avatar."), so the
   * whole `user_list` is sliced to the caller's page.
   */
  async listUsers(
    credentials: Credentials,
    workspaceId: string,
    params: QueryParams,
  ): Promise<User[]> {
    // workspaceId here is expected to be a base_uuid (the related-users endpoint is per-base)
    const baseUuid = workspaceId
    const res = await this.client(credentials).gatewayGet<RelatedUsersResponse>(
      `${GATEWAY_API_PATH}/dtables/${baseUuid}/related-users/`,
    )
    return pageLocally(res.user_list ?? [], params).map((u) => transformUser(u, workspaceId))
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    throw new Error(
      `SeaTable getUser(${id}): no single-user GET endpoint; use listUsers(baseUuid) and filter`,
    )
  }
}
