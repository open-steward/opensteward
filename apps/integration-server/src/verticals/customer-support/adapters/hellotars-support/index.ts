/**
 * HelpDesk (by LiveChat) adapter for the customer-support vertical.
 *
 * OAuth 2.0 Authorization Code Grant via shared LiveChat Accounts service.
 * Base URL: https://api.helpdesk.com/v1
 *
 * Supported resources: tickets, messages (the message events of a ticket),
 * agents (users), teams, tags.
 *
 * Not supported by HelpDesk: macros/canned-responses (auto-501 from base),
 * contacts as a standalone resource (requester is embedded in tickets).
 *
 * Schema-firewall: no attachment content, no voice-recording bytes.
 *
 * Docs: https://api.helpdesk.com/docs
 */
import {
  connectionScope,
  cursorPagerKey,
  pageByRows,
  pageLocally,
  type Credentials,
  type CredentialField,
  type QueryParams,
} from '@opensteward/shared'
import type { CustomerSupportAdapter } from '../../adapter/interface'
import type { Ticket } from '../../schema/ticket'
import type { Message } from '../../schema/message'
import type { User } from '../../schema/user'
import type { Tag } from '../../schema/tag'
import type { Team } from '../../schema/team'

import {
  buildAuthUrl,
  credentialFields as helpdeskCredentialFields,
  exchangeCode as helpdeskExchangeCode,
  refreshCredentials as helpdeskRefreshCredentials,
  DEFAULT_SCOPES,
} from './auth'
import { HelpdeskClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_TICKET_PAGE_SIZE } from './constants'

import { transformTicket, type RawHelpdeskTicket } from './transform/ticket'
import {
  transformMessage,
  splitCompositeId,
  isMessageEvent,
  type RawHelpdeskTicketEvent,
} from './transform/message'
import { transformUser, type RawHelpdeskAgent } from './transform/user'
import { transformTag, type RawHelpdeskTag } from './transform/tag'
import { transformTeam, type RawHelpdeskTeam } from './transform/team'

export interface HellotarsSupportAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

/**
 * HelpDesk list response.
 * The API returns an array directly at the top level (not wrapped in a key).
 */
type ListResponse<T> = T[]

/**
 * The /v1/tickets cursor: the `sortBy` value (`createdAt`, the default) and
 * the ID of the last ticket on the current page. Sent as `next.value` and
 * `next.ID` (https://api.helpdesk.com/docs, Tickets: "`next.value` ... ISO
 * 8601 timestamp for the last item on the current page").
 */
interface TicketCursor {
  value: string
  ID: string
}

/** A stable per-connection pager scope: the LiveChat organization / account, plus a token fingerprint. */
function pagerScope(credentials: Credentials): string {
  const extra = credentials.extra ?? {}
  const account =
    String(extra['organizationId'] ?? '') || String(extra['accountId'] ?? '') || 'helpdesk'
  return connectionScope(`helpdesk:${account}`, credentials)
}

export class HellotarsSupportAdapter implements CustomerSupportAdapter {
  readonly platform = 'hellotars-support'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: HellotarsSupportAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes ?? DEFAULT_SCOPES
  }

  credentialFields(): CredentialField[] {
    return helpdeskCredentialFields()
  }

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(this.clientId, this.redirectUri, overrideScopes ?? this.scopes, state)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return helpdeskExchangeCode(code, redirectUri, this.clientId, this.clientSecret)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return helpdeskRefreshCredentials(credentials, this.clientId, this.clientSecret)
  }

  private client(credentials: Credentials): HelpdeskClient {
    return new HelpdeskClient(credentials)
  }

  // ── Tickets ───────────────────────────────────────────────────────────────

  /**
   * GET /v1/tickets pages by cursor: `pageSize` (default 20, max 100) plus
   * `next.value` / `next.ID` taken from the last row. The response carries no
   * next link, so a page shorter than `pageSize` is the end. The adapter always
   * asks for the documented maximum and pageByRows cuts the caller's rows out
   * of those 100-row pages, so a caller limit above 100 is filled from several
   * upstream pages and one below it costs one request per 100 rows.
   */
  async listTickets(credentials: Credentials, params: QueryParams): Promise<Ticket[]> {
    const client = this.client(credentials)
    const pageSize = MAX_TICKET_PAGE_SIZE
    const key = cursorPagerKey(pagerScope(credentials), 'tickets', { pageSize })
    const { items } = await pageByRows<RawHelpdeskTicket, TicketCursor>(
      key,
      params,
      async (cursor) => {
        const res = await client.get<ListResponse<RawHelpdeskTicket>>('/tickets', {
          pageSize,
          ...(cursor ? { 'next.value': cursor.value, 'next.ID': cursor.ID } : {}),
        })
        const rows = Array.isArray(res) ? res : []
        if (rows.length < pageSize) return { items: rows, next: undefined }
        const last = rows[rows.length - 1]!
        if (!last.ID || !last.createdAt)
          throw new Error(
            'HelpDesk /v1/tickets: last ticket of a full page has no ID or createdAt to page from',
          )
        return { items: rows, next: { value: last.createdAt, ID: last.ID } }
      },
      { defaultLimit: DEFAULT_PAGE_SIZE },
    )
    return items.map(transformTicket)
  }

  async getTicket(credentials: Credentials, id: string): Promise<Ticket> {
    const res = await this.client(credentials).get<RawHelpdeskTicket>(`/tickets/${id}`)
    return transformTicket(res)
  }

  // ── Messages (the message events of a ticket) ─────────────────────────────

  /**
   * HelpDesk documents no messages endpoint. GET /v1/tickets/{ticketID}
   * ("Get ticket") returns the ticket with its whole `events` array ("Ticket
   * events") and takes no query parameters, so the ticket's message events are
   * every message it has, and they are paged locally.
   */
  async listMessages(
    credentials: Credentials,
    ticketId: string,
    params: QueryParams,
  ): Promise<Message[]> {
    const events = await this.ticketEvents(credentials, ticketId)
    return pageLocally(
      events.filter(isMessageEvent).map((e) => transformMessage(e, ticketId)),
      params,
    )
  }

  /** Reads the ticket named by the "ticketID:eventID" id and returns that message event. */
  async getMessage(credentials: Credentials, id: string): Promise<Message> {
    const [ticketId, eventId] = splitCompositeId(id)
    if (!ticketId || !eventId)
      throw Object.assign(
        new Error(`HelpDesk message id must be "<ticketID>:<eventID>", got "${id}"`),
        { statusCode: 400, code: 'INVALID_ID' },
      )
    const event = (await this.ticketEvents(credentials, ticketId)).find(
      (e) => e.ID === eventId && isMessageEvent(e),
    )
    if (!event)
      throw Object.assign(
        new Error(`HelpDesk ticket ${ticketId} has no message event ${eventId}`),
        {
          statusCode: 404,
          code: 'NOT_FOUND',
        },
      )
    return transformMessage(event, ticketId)
  }

  /** GET /v1/tickets/{ticketID}: the ticket's `events` (TicketResult "events": "Ticket events"). */
  private async ticketEvents(
    credentials: Credentials,
    ticketId: string,
  ): Promise<RawHelpdeskTicketEvent[]> {
    const ticket = await this.client(credentials).get<{ events?: RawHelpdeskTicketEvent[] | null }>(
      `/tickets/${encodeURIComponent(ticketId)}`,
    )
    return Array.isArray(ticket?.events) ? ticket.events : []
  }

  // ── Users (agents) ────────────────────────────────────────────────────────

  /** GET /v1/agents takes no query parameters and returns the whole collection; paged locally. */
  async listUsers(credentials: Credentials, params: QueryParams): Promise<User[]> {
    const res = await this.client(credentials).get<ListResponse<RawHelpdeskAgent>>('/agents')
    return pageLocally((Array.isArray(res) ? res : []).map(transformUser), params)
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    const res = await this.client(credentials).get<RawHelpdeskAgent>(`/agents/${id}`)
    return transformUser(res)
  }

  // ── Tags ──────────────────────────────────────────────────────────────────

  /** GET /v1/tags takes no query parameters and returns the whole collection; paged locally. */
  async listTags(credentials: Credentials, params: QueryParams): Promise<Tag[]> {
    const res = await this.client(credentials).get<ListResponse<RawHelpdeskTag>>('/tags')
    return pageLocally((Array.isArray(res) ? res : []).map(transformTag), params)
  }

  async getTag(credentials: Credentials, id: string): Promise<Tag> {
    const res = await this.client(credentials).get<RawHelpdeskTag>(`/tags/${id}`)
    return transformTag(res)
  }

  // ── Teams ─────────────────────────────────────────────────────────────────

  /** GET /v1/teams takes no query parameters and returns the whole collection; paged locally. */
  async listTeams(credentials: Credentials, params: QueryParams): Promise<Team[]> {
    const res = await this.client(credentials).get<ListResponse<RawHelpdeskTeam>>('/teams')
    return pageLocally((Array.isArray(res) ? res : []).map(transformTeam), params)
  }

  async getTeam(credentials: Credentials, id: string): Promise<Team> {
    const res = await this.client(credentials).get<RawHelpdeskTeam>(`/teams/${id}`)
    return transformTeam(res)
  }
}
