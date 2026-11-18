/**
 * Quickbase adapter — projects vertical.
 *
 * Quickbase is a low-code relational platform. Its REST resources map onto the
 * canonical schema as:
 *
 *   app   → Workspace   (GET /apps/{appId})
 *   table → Project     (GET /tables?appId=)
 *   record→ Task        (POST /records/query, from = tableId)
 *   field → Tag         (GET /fields?tableId=)
 *   user  → User        (POST /users — account-scoped, paginated)
 *
 * Only the resources Quickbase supports cleanly through the canonical
 * signatures are implemented. The single-resource GETs for tables, records,
 * and fields each require external context (a parent appId/tableId) that the
 * `get*(credentials, id)` signature can't carry, so getProject / getTask /
 * getTag are intentionally left off — the dispatcher returns 501 for them.
 *
 * Auth is a static user token + realm host (no OAuth). Quickbase webhooks
 * (Pipelines) ship no documented REST signature scheme, so verifyWebhook /
 * parseWebhookEvents are omitted.
 *
 * Docs: https://developer.quickbase.com/
 *
 * ── Resource coverage ──────────────────────────────────────────────────────
 * Unavailable: comment — Quickbase REST API has no comments/notes endpoint
 *   for records; comments are not a first-class REST resource.
 */
import type { Credentials, CredentialField, QueryParams } from '@opensteward/shared'
import {
  connectionScope,
  cursorPagerKey,
  pageByRows,
  pageOffset,
  reportUpstreamPage,
} from '@opensteward/shared'
import type { ProjectsAdapter } from '../../adapter/interface'
import type { Project } from '../../schema/project'
import type { Task } from '../../schema/task'
import type { Tag } from '../../schema/tag'
import type { Workspace } from '../../schema/workspace'
import type { User } from '../../schema/user'

import {
  credentialFields as adapterCredentialFields,
  exchangeCredentials as adapterExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import { QuickbaseClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_FILL_REQUESTS } from './constants'

import { transformTable, type RawQuickbaseTable } from './transform/project'
import { transformRecord, type RawQuickbaseRecord } from './transform/task'
import { transformField, type RawQuickbaseField } from './transform/tag'
import { transformWorkspace, type RawQuickbaseApp } from './transform/workspace'
import { transformUser, type RawQuickbaseUser } from './transform/user'

export interface QuickbaseAdapterConfig {
  clientId?: string
  clientSecret?: string
  redirectUri?: string
  scopes?: string[]
}

// "When `nextPageToken` value in the response is not empty, that indicates
// that there are more results to be returned" — it is returned under
// `metadata` (https://developer.quickbase.com/operation/getUsers).
interface GetUsersResponse {
  users?: RawQuickbaseUser[]
  metadata?: { nextPageToken?: string }
}

interface QueryRecordsResponse {
  data?: RawQuickbaseRecord[]
  fields?: Array<{ id: number; label?: string; type?: string }>
  metadata?: {
    numFields?: number
    numRecords?: number
    skip?: number
    top?: number
    totalRecords?: number
  }
}

export class QuickbaseAdapter implements ProjectsAdapter {
  readonly platform = 'quickbase'
  readonly version = '0.1.0'

  constructor(_config: QuickbaseAdapterConfig = {}) {}

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
    throw new Error('quickbase uses static user-token auth; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  private client(credentials: Credentials): QuickbaseClient {
    return new QuickbaseClient(credentials)
  }

  /**
   * The caller's page size, and the record offset its page starts at: an
   * explicit `cursor` (a raw skip) when given, else `(page - 1) × size`.
   */
  private paging(params: QueryParams): { skip: number; top: number } {
    const topRaw = Number(params.limit ?? DEFAULT_PAGE_SIZE)
    const top = Number.isFinite(topRaw) && topRaw >= 1 ? Math.floor(topRaw) : DEFAULT_PAGE_SIZE
    const skipRaw = params['cursor'] != null ? Number(params['cursor']) : NaN
    return { skip: Number.isFinite(skipRaw) ? skipRaw : pageOffset(params, top), top }
  }

  // ── Workspaces (Quickbase apps) ──────────────────────────────────────────
  // Quickbase has no "list all apps" endpoint; the target app id is supplied
  // via params.app_id and resolved to a single-element list.
  async listWorkspaces(credentials: Credentials, params: QueryParams): Promise<Workspace[]> {
    const appId = params['app_id'] ?? params['workspace_id']
    if (!appId) return []
    return [await this.getWorkspace(credentials, String(appId))]
  }

  async getWorkspace(credentials: Credentials, id: string): Promise<Workspace> {
    const app = await this.client(credentials).get<RawQuickbaseApp>(`/apps/${id}`)
    if (!app?.id) throw new Error(`Quickbase app ${id} not found`)
    return transformWorkspace(app)
  }

  // ── Projects (Quickbase tables) ──────────────────────────────────────────
  async listProjects(credentials: Credentials, params: QueryParams): Promise<Project[]> {
    const appId = params['app_id'] ?? params['workspace_id']
    if (!appId) throw new Error('quickbase listProjects requires params.app_id (the Quickbase app id)')
    const tables = await this.client(credentials).get<RawQuickbaseTable[]>('/tables', {
      appId: String(appId),
    })
    return (tables ?? []).map((t) => transformTable(t, String(appId)))
  }

  // ── Tasks (Quickbase records) ────────────────────────────────────────────
  async listTasks(credentials: Credentials, projectId: string, params: QueryParams): Promise<Task[]> {
    const { skip: start, top } = this.paging(params)
    const titleFieldId =
      params['title_field_id'] != null ? Number(params['title_field_id']) : undefined
    const client = this.client(credentials)
    // POST /records/query pages by options.skip / options.top, but "some
    // requests may not include the entire requested response size", and
    // "numRecords can be compared to totalRecords to determine if further
    // pagination is needed" (https://developer.quickbase.com/operation/runQuery).
    // A short response is continued from skip + numRecords until the caller's
    // page is full or the result set ends, so page N is exactly rows
    // [(N-1)×top, N×top).
    const rows: RawQuickbaseRecord[] = []
    let skip = start
    let total: number | undefined
    for (let i = 0; i < MAX_FILL_REQUESTS && rows.length < top; i++) {
      const body: Record<string, unknown> = {
        from: projectId,
        options: { skip, top: top - rows.length },
      }
      if (params['select'] != null) body['select'] = params['select']
      if (params['where'] != null) body['where'] = params['where']
      const res = await client.post<QueryRecordsResponse>('/records/query', body)
      const data = (res.data ?? []).slice(0, top - rows.length)
      rows.push(...data)
      skip += data.length
      if (typeof res.metadata?.totalRecords === 'number') total = res.metadata.totalRecords
      if (data.length === 0 || total === undefined || skip >= total) break
    }
    if (total !== undefined) {
      reportUpstreamPage(params, { hasMore: start + rows.length < total, totalCount: total })
    }
    return rows.map((r) => transformRecord(r, projectId, { titleFieldId }))
  }

  // ── Tags (Quickbase fields) ──────────────────────────────────────────────
  // Fields belong to a table; the workspaceId arg carries the table id here.
  async listTags(credentials: Credentials, workspaceId: string, _params: QueryParams): Promise<Tag[]> {
    const fields = await this.client(credentials).get<RawQuickbaseField[]>('/fields', {
      tableId: workspaceId,
    })
    return (fields ?? []).map((f) => transformField(f, workspaceId))
  }

  // ── Users (Quickbase account users) ─────────────────────────────────────
  // POST /v1/users is account-scoped; `workspaceId` is stored as the context
  // app id so users are tagged back to it, but the query itself is realm-wide.
  // Docs: https://developer.quickbase.com/operation/getUsers
  async listUsers(credentials: Credentials, workspaceId: string, params: QueryParams): Promise<User[]> {
    const body: Record<string, unknown> = {}
    if (params['account_id'] != null) body['accountId'] = Number(params['account_id'])
    if (params['emails'] != null) body['emails'] = params['emails']
    const client = this.client(credentials)
    // A caller holding an explicit upstream token is at a position, not a row
    // offset: serve that one upstream page as is.
    if (params['next_page_token'] != null) {
      body['nextPageToken'] = String(params['next_page_token'])
      const res = await client.post<GetUsersResponse>('/users', body)
      return (res.users ?? []).map((u) => transformUser(u, workspaceId))
    }
    // "The returned users may be paginated depending on the user count. The
    // count of the returned users may vary." There is no page-size parameter,
    // so one upstream page is not one caller page: walk the nextPageToken
    // chain and cut the caller's rows out of it.
    const realm = String((credentials.extra as Record<string, unknown>)?.['realmHostname'] ?? '')
    const key = cursorPagerKey(connectionScope(realm, credentials), 'users', {
      accountId: body['accountId'],
      emails: body['emails'],
    })
    const { items } = await pageByRows<RawQuickbaseUser>(key, params, async (cursor) => {
      const res = await client.post<GetUsersResponse>(
        '/users',
        cursor ? { ...body, nextPageToken: cursor } : body,
      )
      const next = res.metadata?.nextPageToken
      return { items: res.users ?? [], next: next ? next : undefined }
    })
    return items.map((u) => transformUser(u, workspaceId))
  }
}
