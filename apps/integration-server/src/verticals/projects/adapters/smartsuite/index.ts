/**
 * SmartSuite adapter for the projects vertical.
 *
 * Auth: API key + Account ID (static credentials, no OAuth).
 * Base URL: https://app.smartsuite.com/api/v1
 *
 * Resource mapping:
 *   Solutions  → Projects   (GET  /solutions/)
 *   Tables     → (structural; used as projectId for record queries)
 *   Records    → Tasks       (POST /applications/{tableId}/records/list/)
 *   Comments   → Comments   (GET  /comments/?record={id})
 *   Members    → Users       (POST /members/list/)
 *   Account    → Workspace   (synthesised from credentials)
 *   Tags       → (not in the REST API: listTags and getTag refuse with 501)
 */
import {
  connectionScope,
  cursorPagerKey,
  pageByRows,
  pageLocally,
  pageOffset,
  reportUpstreamPage,
} from '@opensteward/shared'
import type { Credentials, CredentialField, QueryParams } from '@opensteward/shared'
import type { ProjectsAdapter } from '../../adapter/interface'
import type { Project } from '../../schema/project'
import type { Task } from '../../schema/task'
import type { Comment } from '../../schema/comment'
import type { Tag } from '../../schema/tag'
import type { Workspace } from '../../schema/workspace'
import type { User } from '../../schema/user'

import {
  credentialFields as adapterCredentialFields,
  exchangeCredentials as adapterExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import { SmartsuiteClient } from './client'
import { API_BASE_URL, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformProject, type RawSmartsuiteSolution } from './transform/project'
import { transformTask, type RawSmartsuiteRecord } from './transform/task'
import { transformComment, type RawSmartsuiteComment } from './transform/comment'
import { transformWorkspace, type RawSmartsuiteAccount } from './transform/workspace'
import { transformUser, type RawSmartsuiteMember } from './transform/user'

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface SmartsuiteAdapterConfig {
  // api_key adapters take no constructor args; credentials are collected
  // via credentialFields() at runtime.
}

/** List Records / List Members response: items, total, offset, limit. */
interface ListResponse<T> {
  total?: number
  offset?: number
  limit?: number
  items?: T[]
}

/**
 * List Comments response: "count number or null ... next string or null URL
 * of the next page of results, or null. previous ... results Array of objects".
 */
interface CommentsResponse {
  count?: number | null
  next?: string | null
  previous?: string | null
  results?: RawSmartsuiteComment[]
}

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

/** The connection's workspace, sent as the ACCOUNT-ID header on every request. */
function accountIdOf(credentials: Credentials): string {
  return String(credentials.extra?.['accountId'] ?? '')
}

export class SmartsuiteAdapter implements ProjectsAdapter {
  readonly platform = 'smartsuite'
  readonly version = '0.1.0'

  constructor(_config?: SmartsuiteAdapterConfig) {}

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
    throw new Error('smartsuite uses static API key auth; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // API keys do not expire
    return credentials
  }

  private client(credentials: Credentials): SmartsuiteClient {
    return new SmartsuiteClient(credentials)
  }

  // ── Projects (Solutions) ──────────────────────────────────────────────────

  async listProjects(credentials: Credentials, params: QueryParams): Promise<Project[]> {
    // GET /solutions/ "Lists all Solutions in the Workspace." as a bare array,
    // with no paging parameter: the whole collection, paged locally.
    const items = await this.client(credentials).get<RawSmartsuiteSolution[]>('/solutions/')
    return pageLocally((Array.isArray(items) ? items : []).map(transformProject), params)
  }

  async getProject(credentials: Credentials, id: string): Promise<Project> {
    const item = await this.client(credentials).get<RawSmartsuiteSolution>(`/solutions/${id}/`)
    return transformProject(item)
  }

  // ── Tasks (Records) ────────────────────────────────────────────────────────
  //
  // projectId here is the SmartSuite Table (application) ID.

  async listTasks(
    credentials: Credentials,
    projectId: string,
    params: QueryParams,
  ): Promise<Task[]> {
    // List Records pages by the `offset` and `limit` QUERY parameters
    // (limit "must be less than or equal to 1000"); "The total number of
    // results is contained in the total property".
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const offset = pageOffset(params, limit)
    const res = await this.client(credentials).post<ListResponse<RawSmartsuiteRecord>>(
      `/applications/${projectId}/records/list/`,
      {},
      { offset, limit },
    )
    const items = res.items ?? []
    reportUpstreamPage(params, {
      ...recordsPageEnd(res.total, offset, limit, items.length),
      ...(params.limit !== undefined && limit < params.limit ? { pageSize: limit } : {}),
    })
    return items.map((r) => transformTask(r, projectId))
  }

  async getTask(credentials: Credentials, id: string): Promise<Task> {
    // id format: "{tableId}/{recordId}" or we accept a composite key
    // SmartSuite requires the tableId to fetch a record; we encode as "tableId:recordId"
    const sep = id.indexOf(':')
    if (sep === -1)
      throw new Error(`SmartSuite getTask requires composite id "tableId:recordId", got: ${id}`)
    const tableId = id.slice(0, sep)
    const recordId = id.slice(sep + 1)
    const item = await this.client(credentials).get<RawSmartsuiteRecord>(
      `/applications/${tableId}/records/${recordId}/`,
    )
    return transformTask(item, tableId)
  }

  // ── Comments ─────────────────────────────────────────────────────────────

  async listComments(
    credentials: Credentials,
    taskId: string,
    params: QueryParams,
  ): Promise<Comment[]> {
    // GET /comments/?record=[Record_Id] "Gets a record's comments. Returns an
    // object whose results array holds the comment objects." No page-size
    // parameter is documented; each response names the next page by URL
    // ("next string or null URL of the next page of results, or null"), so
    // follow it and cut the caller's rows out with pageByRows.
    const client = this.client(credentials)
    const key = cursorPagerKey(connectionScope(accountIdOf(credentials), credentials), 'comments', {
      record: taskId,
    })
    const page = await pageByRows<Comment, string>(key, params, async (next) => {
      const res = next
        ? await client.get<CommentsResponse>(sameHost(next))
        : await client.get<CommentsResponse>('/comments/', { record: taskId })
      return { items: (res.results ?? []).map(transformComment), next: res.next ?? undefined }
    })
    return page.items
  }

  // ── Tags ─────────────────────────────────────────────────────────────────
  //
  // The REST reference documents no tags endpoint: its Solution Data section
  // lists Records, Fields, Comments, Tables, Solutions, Views and Webhooks,
  // and the sitemap has no tags page. Refuse before sending anything.

  async listTags(
    _credentials: Credentials,
    _workspaceId: string,
    _params: QueryParams,
  ): Promise<Tag[]> {
    throw notSupported(TAGS_UNSUPPORTED)
  }

  async getTag(_credentials: Credentials, _id: string): Promise<Tag> {
    throw notSupported(TAGS_UNSUPPORTED.replace('cannot list', 'cannot read'))
  }

  // ── Workspaces (Account) ──────────────────────────────────────────────────
  //
  // SmartSuite has no workspace-list endpoint. We synthesize a single
  // workspace from the Account-ID stored in credentials.extra.

  async listWorkspaces(credentials: Credentials, params: QueryParams): Promise<Workspace[]> {
    const accountId = String(credentials.extra?.['accountId'] ?? '')
    const raw: RawSmartsuiteAccount = { id: accountId }
    // The whole collection is this one synthesized row.
    return pageLocally([transformWorkspace(raw)], params)
  }

  async getWorkspace(credentials: Credentials, id: string): Promise<Workspace> {
    const accountId = String(credentials.extra?.['accountId'] ?? id)
    const raw: RawSmartsuiteAccount = { id: accountId }
    return transformWorkspace(raw)
  }

  // ── Users (Members) ───────────────────────────────────────────────────────

  async listUsers(
    credentials: Credentials,
    _workspaceId: string,
    params: QueryParams,
  ): Promise<User[]> {
    // POST /members/list/ "List Workspace Members (users). Responses are
    // similar to List Records responses." Paged by the `offset` and `limit`
    // QUERY parameters (limit "must be less than or equal to 1000"); the
    // workspace is the ACCOUNT-ID header, so the path's workspace id is unused.
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const offset = pageOffset(params, limit)
    const res = await this.client(credentials).post<ListResponse<RawSmartsuiteMember>>(
      '/members/list/',
      {},
      { offset, limit },
    )
    const items = res.items ?? []
    reportUpstreamPage(params, {
      ...recordsPageEnd(res.total, offset, limit, items.length),
      ...(params.limit !== undefined && limit < params.limit ? { pageSize: limit } : {}),
    })
    const workspaceId = accountIdOf(credentials)
    return items.map((m) => transformUser(m, workspaceId))
  }
}

const TAGS_UNSUPPORTED =
  'SmartSuite cannot list tags: the REST API documents no tags endpoint (the sitemap has no tags page, and the Solution Data category lists only "Records 13 items Fields 6 items Comments 3 items Tables 4 items Solutions 6 items Views 2 items Webhooks 7 items")'

/**
 * A `next` URL from List Comments, followed only on the API host: the request
 * carries the API key, which must never go anywhere else.
 */
function sameHost(next: string): string {
  if (!next.startsWith(`${API_BASE_URL}/`))
    throw new Error(`SmartSuite List Comments returned a next URL off the API host: ${next}`)
  return next
}

/**
 * Where a List Records page ends. The docs give `total` two readings on one
 * page: "The total number of results is contained in the total property"
 * (Pagination) and "Total number of records returned" (Response Format).
 * This stays correct under either. A short page always ends the list. A full
 * page continues unless `total` can only be the collection total (it exceeds
 * the page's rows) and the rows reach it. A full first page whose total equals
 * its row count is ambiguous and costs one extra, empty request. totalCount is
 * reported only when `total` cannot be a page count.
 */
function recordsPageEnd(
  total: number | undefined,
  offset: number,
  limit: number,
  rows: number,
): { hasMore: boolean; totalCount?: number } {
  if (typeof total !== 'number') return { hasMore: rows >= limit }
  const isCollectionTotal = total > rows || (offset === 0 && rows < limit)
  return {
    hasMore: rows >= limit && !(isCollectionTotal && offset + rows >= total),
    ...(isCollectionTotal ? { totalCount: total } : {}),
  }
}
