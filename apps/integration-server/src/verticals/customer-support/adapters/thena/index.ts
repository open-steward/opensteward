/**
 * Thena adapter for the customer-support vertical.
 *
 * Base URL: https://platform.thena.ai/v1
 * Auth: x-api-key header (static API key from Organization Settings → Security and Access)
 * Supported: tickets, messages (comments), tags, teams, users (GET /v1/search/users)
 * Not supported: macros (no canned-responses API); contacts (no documented read
 * endpoint: /v1/accounts/contacts is POST-only and /v1/accounts/contacts/{contactId}
 * is PUT/DELETE-only in the platform spec)
 */

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: macro — Thena has no canned-responses/macros REST API; snippets exist only as a product UI feature with no documented endpoint
import type { Credentials, CredentialField, QueryParams } from '@opensteward/shared'
import { pageLocally, reportUpstreamPage } from '@opensteward/shared'
import type { CustomerSupportAdapter } from '../../adapter/interface'
import type { Ticket } from '../../schema/ticket'
import type { Message } from '../../schema/message'
import type { Contact } from '../../schema/contact'
import type { User } from '../../schema/user'
import type { Tag } from '../../schema/tag'
import type { Team } from '../../schema/team'
import type { WebhookEvent } from '../../schema/webhook'

import {
  credentialFields as adapterCredentialFields,
  exchangeCredentials as adapterExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import { ThenaClient } from './client'
import { DEFAULT_PAGE_SIZE, SEARCH_MAX_PER_PAGE, TICKETS_MAX_LIMIT } from './constants'
import { verifyThenaWebhook, parseThenaWebhookEvents } from './webhook'

import { transformTicket, type RawThenaTicket } from './transform/ticket'
import { transformMessage, type RawThenaComment } from './transform/message'
import { transformUser, type RawThenaUser } from './transform/user'
import { transformTag, type RawThenaTag } from './transform/tag'
import { transformTeam, type RawThenaTeam } from './transform/team'

// ── Response envelope shapes ──────────────────────────────────────────────────

interface ThenaListEnvelope<T> {
  status?: boolean
  message?: string
  data?: T[]
}

interface ThenaSingleEnvelope<T> {
  status?: boolean
  message?: string
  data?: T
}

// GET /v1/tickets
type TicketsResponse = ThenaListEnvelope<RawThenaTicket>
// GET /v1/tickets/:id — single ticket is the object itself (no wrapper for single-item GET)
type TicketSingleResponse = ThenaSingleEnvelope<RawThenaTicket>
// GET /v1/comments
type CommentsResponse = ThenaListEnvelope<RawThenaComment>
/**
 * GET /v1/search/{collection} 200 body (platform-openapi.yaml, SearchController_search):
 * `result: { facet_counts, found, hits: [{ document }], page, request_params, search_cutoff }`.
 */
interface SearchUsersResponse {
  result: {
    found: number
    hits: Array<{ document: RawThenaUser }>
    page: number
    search_cutoff?: boolean
  }
}
// GET /v1/tags
type TagsResponse = ThenaListEnvelope<RawThenaTag>
// GET /v1/teams
type TeamsResponse = ThenaListEnvelope<RawThenaTeam>
// Single team
type TeamSingleResponse = ThenaSingleEnvelope<RawThenaTeam>

export class ThenaAdapter implements CustomerSupportAdapter {
  readonly platform = 'thena'
  readonly version = '0.1.0'

  constructor() {}

  credentialFields(): CredentialField[] {
    return adapterCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>) {
    return adapterExchangeCredentials(fields)
  }

  getAuthUrl(_state: string, _overrideScopes?: string[]): string {
    return getAuthUrlUnsupported()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('Thena uses static API key auth; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyThenaWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseThenaWebhookEvents(payload)
  }

  private client(credentials: Credentials): ThenaClient {
    return new ThenaClient(credentials)
  }

  private pageParams(params: QueryParams): Record<string, unknown> {
    // Thena pagination is 1-based; cursor carries the next page number.
    const page = params['cursor'] ? Number(params['cursor']) : 1
    return {
      limit: params.limit ?? DEFAULT_PAGE_SIZE,
      page,
    }
  }

  /**
   * One caller page of a 0-based page-numbered list: GET /v1/tickets documents
   * `page` with "minimum: 0, default: 0", and GET /v1/comments "The page number
   * for pagination (default: 0)". Neither response carries a count or a next
   * marker, so the page is sized at the caller's limit (clamped to `max` where
   * one is documented) and only a short page is reported as the end.
   */
  private zeroBasedPage(params: QueryParams, max?: number): { page: number; limit: number } {
    const asked = Math.floor(Number(params.limit ?? DEFAULT_PAGE_SIZE))
    const limit = max !== undefined && asked > max ? max : asked
    if (limit < asked) reportUpstreamPage(params, { pageSize: limit })
    return { page: (params.page ?? 1) - 1, limit }
  }

  private reportEnd(params: QueryParams, rows: number, limit: number): void {
    if (rows < limit) reportUpstreamPage(params, { hasMore: false })
  }

  // ── Tickets ──────────────────────────────────────────────────────────────

  async listTickets(credentials: Credentials, params: QueryParams): Promise<Ticket[]> {
    const paging = this.zeroBasedPage(params, TICKETS_MAX_LIMIT)
    const res = await this.client(credentials).get<TicketsResponse>('/tickets', paging)
    const rows = res.data ?? []
    this.reportEnd(params, rows.length, paging.limit)
    return rows.map(transformTicket)
  }

  async getTicket(credentials: Credentials, id: string): Promise<Ticket> {
    const res = await this.client(credentials).get<TicketSingleResponse>(`/tickets/${id}`)
    if (!res.data) throw new Error(`Thena ticket ${id} not found`)
    return transformTicket(res.data)
  }

  // ── Messages (comments scoped to a ticket) ────────────────────────────────

  async listMessages(
    credentials: Credentials,
    ticketId: string,
    params: QueryParams,
  ): Promise<Message[]> {
    const paging = this.zeroBasedPage(params)
    const res = await this.client(credentials).get<CommentsResponse>('/comments', {
      entityType: 'ticket',
      entityId: ticketId,
      ...paging,
    })
    const rows = res.data ?? []
    this.reportEnd(params, rows.length, paging.limit)
    return rows.map((c) => transformMessage(c, ticketId))
  }

  async getMessage(_credentials: Credentials, id: string): Promise<Message> {
    throw new Error(`Thena comments are ticket-scoped; call listMessages(ticketId). id=${id}`)
  }

  // ── Contacts ─────────────────────────────────────────────────────────────

  async listContacts(_credentials: Credentials, _params: QueryParams): Promise<Contact[]> {
    throw Object.assign(
      new Error(
        'Thena cannot list contacts: the platform API documents only POST on /v1/accounts/contacts ' +
          '("Create customer contact"), and the customer_contacts search collection is "(Contact support coming soon)"',
      ),
      { statusCode: 501, code: 'NOT_SUPPORTED' },
    )
  }

  async getContact(_credentials: Credentials, id: string): Promise<Contact> {
    throw Object.assign(
      new Error(
        `Thena cannot read contact ${id}: the platform API documents only PUT ("Update customer contact") ` +
          'and DELETE ("Delete customer contact") on /v1/accounts/contacts/{contactId}',
      ),
      { statusCode: 501, code: 'NOT_SUPPORTED' },
    )
  }

  // ── Users (organisation users, via the users search collection) ──────────

  /**
   * GET /v1/search/users with `q=*` and `query_by=*`: the Users search guide's
   * "Get all users in the organization". `page` is 1-based (a first page is
   * answered with `"page": 1`) and `per_page` is capped at 250 ("Results are
   * paginated with a maximum of 250 items per page"). `found` is the total.
   */
  async listUsers(credentials: Credentials, params: QueryParams): Promise<User[]> {
    const asked = Math.floor(Number(params.limit ?? DEFAULT_PAGE_SIZE))
    const perPage = Math.min(asked, SEARCH_MAX_PER_PAGE)
    if (perPage < asked) reportUpstreamPage(params, { pageSize: perPage })
    const page = params.page ?? 1
    const res = await this.client(credentials).get<SearchUsersResponse>('/search/users', {
      q: '*',
      query_by: '*',
      page: String(page),
      per_page: String(perPage),
    })
    const { found, hits } = res.result
    reportUpstreamPage(params, { totalCount: found, hasMore: page * perPage < found })
    return hits.map((h) => transformUser(h.document))
  }

  /**
   * The Users search guide's "By user ID: `userId:=URR9A99BDJ`" filter. Only a
   * document whose `id` is the one asked for is returned. An id outside
   * [A-Za-z0-9_-] is refused so it cannot extend the filter expression.
   */
  async getUser(credentials: Credentials, id: string): Promise<User> {
    if (!/^[A-Za-z0-9_-]+$/.test(id))
      throw new Error(`Thena user id ${JSON.stringify(id)} is not a valid id`)
    const res = await this.client(credentials).get<SearchUsersResponse>('/search/users', {
      q: '*',
      query_by: '*',
      filter_by: `userId:=${id}`,
    })
    const hit = res.result.hits.find((h) => h.document.id === id)
    if (!hit) throw new Error(`Thena user ${id} not found`)
    return transformUser(hit.document)
  }

  // ── Tags ──────────────────────────────────────────────────────────────────

  async listTags(credentials: Credentials, params: QueryParams): Promise<Tag[]> {
    const res = await this.client(credentials).get<TagsResponse>('/tags', {
      type: 'ticket',
      ...this.pageParams(params),
    })
    return (res.data ?? []).map(transformTag)
  }

  async getTag(_credentials: Credentials, id: string): Promise<Tag> {
    throw new Error(`Thena tags do not have an individual get endpoint. id=${id}`)
  }

  // ── Teams ─────────────────────────────────────────────────────────────────

  async listTeams(credentials: Credentials, params: QueryParams): Promise<Team[]> {
    // GET /v1/teams documents no parameters (`parameters: []`): every team in one response.
    const res = await this.client(credentials).get<TeamsResponse>('/teams')
    return pageLocally((res.data ?? []).map(transformTeam), params)
  }

  async getTeam(credentials: Credentials, id: string): Promise<Team> {
    const res = await this.client(credentials).get<TeamSingleResponse>(`/teams/${id}`)
    if (!res.data) throw new Error(`Thena team ${id} not found`)
    return transformTeam(res.data)
  }
}
