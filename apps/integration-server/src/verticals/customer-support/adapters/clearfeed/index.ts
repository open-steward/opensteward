/**
 * ClearFeed adapter for the customer-support vertical.
 *
 * ClearFeed is a Slack-native support platform. Requests (tickets) live inside
 * Slack channels; customers are organisations. Auth is a static Bearer token.
 *
 * Supported resources:
 *   - Tickets  (requests)       — list + get
 *   - Messages (inline on get)  — listMessages (via include=messages)
 *   - Contacts (customers)      — list + get
 *   - Teams                     — list + get
 *
 * NOT supported by the ClearFeed REST API and therefore omitted:
 *   - listUsers / getUser  (no /users endpoint; team_members only carry Slack IDs)
 *   - listTags / getTag    (no tag resource)
 *   - listMacros / getMacro (no macro/canned-response resource)
 *
 * Pagination: requests and customers are cursor-based — `limit` (1-100,
 *   default 50) and `next_cursor` from the previous `response_metadata`
 *   (docs.clearfeed.ai/api/reference/api-reference/requests, .../customers).
 *   The worker's 1-based `page` is resolved through the cursor pager. Teams and
 *   a request's inline messages have no paging parameters and come back whole,
 *   so they are paged locally.
 * Webhooks: NOT implemented. ClearFeed signs (verb + url + body + timestamp) but
 *   the BaseAdapter verifyWebhook contract only receives (body, headers, secret) —
 *   verb and URL are unavailable. verifyWebhook is intentionally omitted so the
 *   router fails closed (501 Not Implemented) rather than accepting unverifiable
 *   deliveries.
 */
import {
  connectionScope,
  cursorPagerKey,
  pageByCursor,
  pageLocally,
  reportUpstreamPage,
  type Credentials,
  type CredentialField,
  type QueryParams,
} from '@opensteward/shared'
import type { CustomerSupportAdapter } from '../../adapter/interface'
import type { Ticket } from '../../schema/ticket'
import type { Message } from '../../schema/message'
import type { Contact } from '../../schema/contact'
import type { Team } from '../../schema/team'
import { credentialFields as adapterCredentialFields, exchangeCredentials as adapterExchangeCredentials, getAuthUrlUnsupported } from './auth'
import { ClearfeedClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformTicket, type RawClearfeedRequest } from './transform/ticket'
import { transformMessages, type RawClearfeedMessage } from './transform/message'
import { transformContact, type RawClearfeedCustomer } from './transform/contact'
import { transformTeam, type RawClearfeedTeam } from './transform/team'

// ── API response envelopes ───────────────────────────────────────────────────

interface RequestsResponse {
  requests?: RawClearfeedRequest[]
  response_metadata?: { next_cursor?: string; count?: number }
}

interface RequestResponse {
  request?: RawClearfeedRequest & {
    messages?: RawClearfeedMessage[]
  }
}

interface CustomersResponse {
  customers?: RawClearfeedCustomer[]
  response_metadata?: { next_cursor?: string; count?: number }
}

interface CustomerResponse {
  customer?: RawClearfeedCustomer
}

interface TeamsResponse {
  teams?: RawClearfeedTeam[]
}

interface TeamResponse {
  team?: RawClearfeedTeam
}

// ── Adapter ──────────────────────────────────────────────────────────────────

export class ClearfeedAdapter implements CustomerSupportAdapter {
  readonly platform = 'clearfeed'
  readonly version = '0.1.0'
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  constructor() {
    // No OAuth config needed — static API key only.
  }

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
    throw new Error('clearfeed uses static API key auth; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private client(credentials: Credentials): ClearfeedClient {
    return new ClearfeedClient(credentials)
  }

  /**
   * One caller page of a cursor-paginated collection (`/requests`, `/customers`).
   * One upstream page at the caller's limit IS one caller page; `next_cursor`
   * under `response_metadata` starts the next one, and its absence is the end.
   */
  private async cursorPage<E extends { response_metadata?: { next_cursor?: string } }, R>(
    credentials: Credentials,
    path: '/requests' | '/customers',
    pick: (res: E) => R[],
    params: QueryParams,
  ): Promise<R[]> {
    const client = this.client(credentials)
    const limit = Math.min(Math.max(1, Math.floor(params.limit ?? DEFAULT_PAGE_SIZE)), MAX_PAGE_SIZE)
    const key = cursorPagerKey(connectionScope('clearfeed', credentials), path, { limit })
    const result = await pageByCursor<R, string>(key, params.page, async (cursor) => {
      const res = await client.get<E>(path, { limit, ...(cursor ? { next_cursor: cursor } : {}) })
      const next = res.response_metadata?.next_cursor
      return { items: pick(res), next: next ? next : undefined }
    })
    reportUpstreamPage(params, { hasMore: result.hasMore })
    return result.items
  }

  // ── Tickets ────────────────────────────────────────────────────────────────

  async listTickets(credentials: Credentials, params: QueryParams): Promise<Ticket[]> {
    const rows = await this.cursorPage(credentials, '/requests', (res: RequestsResponse) => res.requests ?? [], params)
    return rows.map(transformTicket)
  }

  async getTicket(credentials: Credentials, id: string): Promise<Ticket> {
    const res = await this.client(credentials).get<RequestResponse>(`/requests/${id}`)
    if (!res.request) throw new Error(`ClearFeed request ${id} not found`)
    return transformTicket(res.request)
  }

  // ── Messages ───────────────────────────────────────────────────────────────

  async listMessages(credentials: Credentials, ticketId: string, params: QueryParams): Promise<Message[]> {
    // ClearFeed returns messages inline when include=messages is passed, all
    // of them: Get Request by ID takes no paging parameter, so page locally.
    const res = await this.client(credentials).get<RequestResponse>(
      `/requests/${ticketId}`,
      { include: 'messages' },
    )
    if (!res.request) throw new Error(`ClearFeed request ${ticketId} not found`)
    return pageLocally(transformMessages(res.request.messages, ticketId), params)
  }

  async getMessage(_credentials: Credentials, id: string): Promise<Message> {
    throw new Error(`ClearFeed messages are request-scoped; call listMessages(ticketId). id=${id}`)
  }

  // ── Contacts (customers) ───────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const rows = await this.cursorPage(credentials, '/customers', (res: CustomersResponse) => res.customers ?? [], params)
    return rows.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const res = await this.client(credentials).get<CustomerResponse>(`/customers/${id}`)
    if (!res.customer) throw new Error(`ClearFeed customer ${id} not found`)
    return transformContact(res.customer)
  }

  // ── Teams ──────────────────────────────────────────────────────────────────

  async listTeams(credentials: Credentials, params: QueryParams): Promise<Team[]> {
    // Get All Teams "Retrieves a list of all teams" and takes no paging
    // parameter, so the one response is the whole collection: page locally.
    const res = await this.client(credentials).get<TeamsResponse>('/teams')
    return pageLocally((res.teams ?? []).map(transformTeam), params)
  }

  async getTeam(credentials: Credentials, id: string): Promise<Team> {
    const res = await this.client(credentials).get<TeamResponse>(`/teams/${id}`)
    if (!res.team) throw new Error(`ClearFeed team ${id} not found`)
    return transformTeam(res.team)
  }
}
