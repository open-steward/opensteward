/**
 * InvGate Service Management adapter for the customer-support vertical.
 *
 * Auth: API token (Bearer), per-tenant instance URL.
 * Supported resources: tickets, messages, contacts, users, tags (categories), teams (groups).
 * Not supported: macros (InvGate has no canned-response feature), webhooks (no documented
 *   signature scheme — omitted; verifyWebhook / parseWebhookEvents are not implemented).
 *
 * Pagination:
 *   - Incidents: offset/limit via /incidents.by.status; `total` ends the walk
 *   - Users: no paging parameter documented; the whole list is paged locally
 *   - Groups: non-paginated list, paged locally
 *   - Categories: page/page_size (max 500)
 *   - Comments: returned inline on /incident, paged locally
 *
 * Docs: https://releases.invgate.com/service-desk/api/
 */
import {
  pageLocally,
  pageOffset,
  reportUpstreamPage,
  type Credentials,
  type CredentialField,
  type QueryParams,
} from '@opensteward/shared'
import type { CustomerSupportAdapter } from '../../adapter/interface'
import type { Ticket } from '../../schema/ticket'
import type { Message } from '../../schema/message'
import type { Contact } from '../../schema/contact'
import type { User } from '../../schema/user'
import type { Tag } from '../../schema/tag'
import type { Team } from '../../schema/team'

import { credentialFields as adapterCredentialFields, exchangeCredentials as adapterExchangeCredentials, getAuthUrlUnsupported } from './auth'
import { InvGateClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformTicket, type RawInvGateIncident } from './transform/ticket'
import { transformMessage, type RawInvGateComment } from './transform/message'
import { transformContact, type RawInvGateUser } from './transform/contact'
import { transformUser, type RawInvGateAgent } from './transform/user'
import { transformTag, type RawInvGateCategory } from './transform/tag'
import { transformTeam, type RawInvGateGroup } from './transform/team'

// ── Response shapes ──────────────────────────────────────────────────────────

/** /incidents.by.status response — returns IDs only; we then batch-fetch */
interface ByStatusResponse {
  requestIds?: number[]
  total?: number
  offset?: number
  limit?: number
  status?: string
}

/** /incidents bulk-fetch (POST with ids array) */
interface IncidentsBulkResponse {
  [id: string]: RawInvGateIncident
}

/** /incident single-fetch response */
type IncidentResponse = RawInvGateIncident

/** /users list response — array or object with data key */
type UsersResponse = RawInvGateUser[] | { data?: RawInvGateUser[] }

/** /groups list response */
type GroupsResponse = RawInvGateGroup[] | { data?: RawInvGateGroup[] }

/** /categories list response */
interface CategoriesResponse {
  data?: RawInvGateCategory[]
  categories?: RawInvGateCategory[]
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function extractArray<T>(res: T[] | { data?: T[] } | Record<string, unknown>): T[] {
  if (Array.isArray(res)) return res
  const r = res as Record<string, unknown>
  if (Array.isArray(r['data'])) return r['data'] as T[]
  return []
}

// ── Adapter ──────────────────────────────────────────────────────────────────

export class HelpcrunchNaAdapter implements CustomerSupportAdapter {
  readonly platform = 'helpcrunch-na'
  readonly version = '0.1.0'

   
  constructor(_config?: Record<string, unknown>) {}

  credentialFields(): CredentialField[] {
    return adapterCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return adapterExchangeCredentials(fields)
  }

  getAuthUrl(_state: string, _overrideScopes?: string[]): string {
    return getAuthUrlUnsupported()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('invgate-service-management uses API token auth; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  private client(credentials: Credentials): InvGateClient {
    return new InvGateClient(credentials)
  }

  // ── Tickets ────────────────────────────────────────────────────────────────

  /**
   * Lists tickets via /incidents.by.status (all statuses) then fetches details
   * in batch via /incidents.
   *
   * InvGate does not expose a general open-ended incident list; we enumerate
   * by passing all status IDs (1-4). Offset/limit pagination is used.
   */
  async listTickets(credentials: Credentials, params: QueryParams): Promise<Ticket[]> {
    const limit = Math.min(Number(params.limit ?? DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE)
    // `offset` skips that many items; the caller's page is (page - 1) * limit.
    const offset = params['cursor'] ? Number(params['cursor']) : pageOffset(params, limit)

    const byStatus = await this.client(credentials).get<ByStatusResponse>(
      '/incidents.by.status',
      {
        status_ids: [1, 2, 3, 4],
        limit,
        offset,
        date_format: 'iso8601',
      },
    )

    const ids = byStatus.requestIds ?? []
    const total = typeof byStatus.total === 'number' ? byStatus.total : undefined
    reportUpstreamPage(params, {
      pageSize: limit,
      ...(total !== undefined ? { totalCount: total, hasMore: offset + ids.length < total } : {}),
    })
    if (ids.length === 0) return []

    // Batch-fetch incident details
    const bulk = await this.client(credentials).get<IncidentsBulkResponse>(
      '/incidents',
      { ids, date_format: 'iso8601' },
    )

    return ids
      .map((id) => bulk[String(id)])
      .filter((r): r is RawInvGateIncident => r != null)
      .map(transformTicket)
  }

  async getTicket(credentials: Credentials, id: string): Promise<Ticket> {
    const raw = await this.client(credentials).get<IncidentResponse>(
      '/incident',
      { id: Number(id), date_format: 'iso8601' },
    )
    return transformTicket(raw)
  }

  // ── Messages ───────────────────────────────────────────────────────────────

  /**
   * InvGate returns comments inline when fetching a ticket with ?comments=true.
   * There is no standalone comment-listing endpoint.
   */
  async listMessages(credentials: Credentials, ticketId: string, params: QueryParams): Promise<Message[]> {
    const raw = await this.client(credentials).get<RawInvGateIncident & { comments?: RawInvGateComment[] }>(
      '/incident',
      { id: Number(ticketId), comments: true, date_format: 'iso8601' },
    )
    // Every comment comes back inline; the caller's page is cut from them.
    return pageLocally(raw.comments ?? [], params).map((c) => transformMessage(c, ticketId))
  }

  async getMessage(_credentials: Credentials, id: string): Promise<Message> {
    throw new Error(`InvGate comments are ticket-scoped; call listMessages(ticketId). id=${id}`)
  }

  // ── Contacts ───────────────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    // /users documents no paging parameter and returns every user.
    const res = await this.client(credentials).get<UsersResponse>('/users', {})
    return pageLocally(
      extractArray<RawInvGateUser>(res as RawInvGateUser[] | { data?: RawInvGateUser[] }),
      params,
    ).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const raw = await this.client(credentials).get<RawInvGateUser>('/user', { id: Number(id) })
    return transformContact(raw)
  }

  // ── Users (agents) ─────────────────────────────────────────────────────────

  async listUsers(credentials: Credentials, params: QueryParams): Promise<User[]> {
    // /users documents no paging parameter and returns every user.
    const res = await this.client(credentials).get<UsersResponse>('/users', {})
    return pageLocally(
      extractArray<RawInvGateUser>(res as RawInvGateUser[] | { data?: RawInvGateUser[] }),
      params,
    ).map((u) => transformUser(u as unknown as RawInvGateAgent))
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    const raw = await this.client(credentials).get<RawInvGateAgent>('/user', { id: Number(id) })
    return transformUser(raw)
  }

  // ── Tags (categories) ──────────────────────────────────────────────────────

  async listTags(credentials: Credentials, params: QueryParams): Promise<Tag[]> {
    const page = params['cursor'] ? Number(params['cursor']) : (params.page ?? 1)
    const page_size = Math.min(Number(params.limit ?? DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE)
    const res = await this.client(credentials).get<CategoriesResponse>('/categories', { page, page_size })
    reportUpstreamPage(params, { pageSize: page_size })
    const items: RawInvGateCategory[] =
      (Array.isArray(res) ? res : undefined) ??
      (Array.isArray(res['data']) ? (res['data'] as RawInvGateCategory[]) : undefined) ??
      (Array.isArray(res['categories']) ? (res['categories'] as RawInvGateCategory[]) : undefined) ??
      []
    return items.map(transformTag)
  }

  async getTag(credentials: Credentials, id: string): Promise<Tag> {
    const res = await this.client(credentials).get<CategoriesResponse>('/categories', { id: Number(id) })
    const items: RawInvGateCategory[] =
      (Array.isArray(res) ? res : undefined) ??
      (Array.isArray(res['data']) ? (res['data'] as RawInvGateCategory[]) : undefined) ??
      (Array.isArray(res['categories']) ? (res['categories'] as RawInvGateCategory[]) : undefined) ??
      []
    const found = items.find((c) => String(c.id) === id)
    if (!found) throw new Error(`InvGate category ${id} not found`)
    return transformTag(found)
  }

  // ── Teams (groups / helpdesks) ─────────────────────────────────────────────

  async listTeams(credentials: Credentials, params: QueryParams): Promise<Team[]> {
    // /groups returns every active group; the caller's page is cut from them.
    const res = await this.client(credentials).get<GroupsResponse>('/groups')
    return pageLocally(
      extractArray<RawInvGateGroup>(res as RawInvGateGroup[] | { data?: RawInvGateGroup[] }),
      params,
    ).map(transformTeam)
  }

  async getTeam(credentials: Credentials, id: string): Promise<Team> {
    const res = await this.client(credentials).get<GroupsResponse>('/groups', { id: Number(id) })
    const items = extractArray<RawInvGateGroup>(res as RawInvGateGroup[] | { data?: RawInvGateGroup[] })
    const found = items.find((g) => String(g.id) === id)
    if (!found) throw new Error(`InvGate group ${id} not found`)
    return transformTeam(found)
  }
}
