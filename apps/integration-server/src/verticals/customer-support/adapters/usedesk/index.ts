/**
 * UseDesk adapter — customer-support vertical implementation.
 *
 * UseDesk uses a static api_token passed in POST request bodies.
 * The cloud base URL is https://secure.usedesk.com/uapi; self-hosted
 * instances override via credentials.extra.baseUrl.
 *
 * Supported resources: tickets, messages (the comments POST /ticket embeds),
 * contacts (clients), users (agents, POST /users), tags (POST /tags),
 * teams (groups).
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: macro — UseDesk REST API has no macros/canned-responses
 *   endpoint; the feature exists only in the UI (en.usedocs.com/category/1653).
 * ───────────────────────────────────────────────────────────────────
 * Webhooks: UseDesk sends POST requests to the configured redirect URL with
 * no documented HMAC signature; verifyWebhook/parseWebhookEvents are omitted.
 *
 * Pagination: `offset` is a PAGE index over fixed pages of 100 ("Offset by 1
 * will show the next 100 entries") with no page-size parameter, so tickets and
 * clients and tags are cut to the caller's page by pageByRows; groups, agents
 * and a ticket's comments come back whole and are paged locally. A caller
 * cursor maps to an offset index.
 *
 * Docs: https://api.usedocs.com/
 */
import {
  connectionScope,
  cursorPagerKey,
  pageByRows,
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
import type { User } from '../../schema/user'
import type { Tag } from '../../schema/tag'
import type { Team } from '../../schema/team'

import {
  credentialFields as adapterCredentialFields,
  exchangeCredentials as adapterExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import { UsedeskClient } from './client'
import { API_BASE_URL, DEFAULT_PAGE_SIZE } from './constants'

import { transformTicket, type RawUsedeskTicket } from './transform/ticket'
import { transformMessage, type RawUsedeskComment } from './transform/message'
import { transformContact, type RawUsedeskClient } from './transform/contact'
import { transformUser, type RawUsedeskAgent } from './transform/user'
import { transformTag, type RawUsedeskTag } from './transform/tag'
import { transformTeam, type RawUsedeskGroup } from './transform/team'

// UseDesk list/read endpoints return raw arrays or wrapper objects.
type TicketListResponse = RawUsedeskTicket[] | { tickets?: RawUsedeskTicket[] }
/** POST /ticket: "The server returns a ticket, all comments, tags and a history of changes." */
interface SingleTicketResponse {
  ticket?: RawUsedeskTicket
  comments?: RawUsedeskComment[]
}
type ClientListResponse = RawUsedeskClient[] | { clients?: RawUsedeskClient[] }
type GroupListResponse = RawUsedeskGroup[] | { groups?: RawUsedeskGroup[] }

/**
 * POST /users `user_type`: "User type or role Possible values: admin;
 * employee; support By default: employee" (https://api.usedocs.com/article/51414).
 * A request without it returns employees only, so every documented value is asked for.
 */
const USER_TYPES = ['admin', 'employee', 'support'] as const

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

/** Normalise UseDesk API responses — some endpoints return a bare array,
    others wrap in an object. */
function toArray<T>(res: T[] | Record<string, T[] | undefined>, key: string): T[] {
  if (Array.isArray(res)) return res
  return (res as Record<string, T[] | undefined>)[key] ?? []
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface UsedeskAdapterConfig {}

export class UsedeskAdapter implements CustomerSupportAdapter {
  readonly platform = 'usedesk'
  readonly version = '0.1.0'

  // No OAuth config required — api_token auth only.
  constructor(_config?: UsedeskAdapterConfig) {}

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
    throw new Error('usedesk uses static API token auth; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  private client(credentials: Credentials): UsedeskClient {
    return new UsedeskClient(credentials)
  }

  /**
   * One caller page of an offset-paged UseDesk list. `offset` is a page index
   * over fixed pages of 100 and the request has no page-size parameter, so one
   * upstream page is not one caller page: pageByRows walks offsets 0, 1, 2…
   * and cuts the caller's rows out of them. A page shorter than 100 is the
   * last. A caller already holding an upstream cursor gets exactly that page.
   */
  private async pageOffsets<T>(
    credentials: Credentials,
    params: QueryParams,
    collection: string,
    fetchPage: (offset: number) => Promise<T[]>,
  ): Promise<T[]> {
    const nextOf = (offset: number, rows: T[]) =>
      rows.length >= DEFAULT_PAGE_SIZE ? offset + 1 : undefined
    if (params['cursor']) {
      const offset = Number(params['cursor'])
      const rows = await fetchPage(offset)
      reportUpstreamPage(params, {
        hasMore: nextOf(offset, rows) !== undefined,
        pageSize: DEFAULT_PAGE_SIZE,
      })
      return rows
    }
    const account = String(credentials.extra?.['baseUrl'] || '') || API_BASE_URL
    const key = cursorPagerKey(connectionScope(account, credentials), collection, {
      upstreamPageSize: DEFAULT_PAGE_SIZE,
    })
    const { items } = await pageByRows<T, number>(key, params, async (cursor) => {
      const offset = cursor ?? 0
      const rows = await fetchPage(offset)
      return { items: rows, next: nextOf(offset, rows) }
    })
    return items
  }

  // ── Tickets ──────────────────────────────────────────────────────────────

  /**
   * POST /tickets: "offset Offset . Offset by 1 will show the next 100 entries"
   * https://api.usedocs.com/article/51376
   */
  async listTickets(credentials: Credentials, params: QueryParams): Promise<Ticket[]> {
    const client = this.client(credentials)
    return this.pageOffsets(credentials, params, 'tickets', async (offset) => {
      const res = await client.post<TicketListResponse>('/tickets', { offset })
      return toArray<RawUsedeskTicket>(
        res as RawUsedeskTicket[] | Record<string, RawUsedeskTicket[] | undefined>,
        'tickets',
      ).map(transformTicket)
    })
  }

  async getTicket(credentials: Credentials, id: string): Promise<Ticket> {
    const res = await this.client(credentials).post<
      RawUsedeskTicket | { ticket?: RawUsedeskTicket }
    >('/ticket', { ticket_id: id })
    // Some versions return the ticket directly; others wrap it
    const raw = (res as { ticket?: RawUsedeskTicket }).ticket ?? (res as RawUsedeskTicket)
    if (!raw || !raw.id) throw new Error(`UseDesk ticket ${id} not found`)
    return transformTicket(raw)
  }

  // ── Messages (scoped to a ticket) ────────────────────────────────────────

  /**
   * UseDesk documents no comment list endpoint (only POST /create/comment,
   * https://api.usedocs.com/article/51381). POST /ticket takes "ticket_id*
   * Ticket ID" and "returns a ticket, all comments, tags and a history of
   * changes" (https://api.usedocs.com/article/51377): the whole `comments`
   * array in one response, paged locally.
   */
  async listMessages(
    credentials: Credentials,
    ticketId: string,
    params: QueryParams,
  ): Promise<Message[]> {
    const res = await this.client(credentials).post<SingleTicketResponse>('/ticket', {
      ticket_id: ticketId,
    })
    if (!res || !Array.isArray(res.comments)) {
      throw new Error(`UseDesk ticket ${ticketId}: response has no comments array`)
    }
    return pageLocally(
      res.comments.map((c) => transformMessage(c, ticketId)),
      params,
    )
  }

  async getMessage(_credentials: Credentials, id: string): Promise<Message> {
    throw new Error(`UseDesk comments are ticket-scoped; call listMessages(ticketId). id=${id}`)
  }

  // ── Contacts (clients) ───────────────────────────────────────────────────

  /**
   * POST /clients: "The response has a maximum of 100 entries, the offset
   * parameter is used." https://api.usedocs.com/article/51383
   */
  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = this.client(credentials)
    return this.pageOffsets(credentials, params, 'clients', async (offset) => {
      const res = await client.post<ClientListResponse>('/clients', { offset })
      return toArray<RawUsedeskClient>(
        res as RawUsedeskClient[] | Record<string, RawUsedeskClient[] | undefined>,
        'clients',
      ).map(transformContact)
    })
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const res = await this.client(credentials).post<
      RawUsedeskClient | { client?: RawUsedeskClient }
    >('/client', { client_id: id })
    const raw = (res as { client?: RawUsedeskClient }).client ?? (res as RawUsedeskClient)
    if (!raw || (!raw.id && !raw.client_id)) throw new Error(`UseDesk client ${id} not found`)
    return transformContact(raw)
  }

  // ── Users (agents) ───────────────────────────────────────────────────────

  /**
   * POST /users "returns the list of company agents with groups that satisfy
   * the specified filter conditions" (https://api.usedocs.com/article/51414).
   * It documents no offset or page size, so the whole list comes back; the
   * default `user_type` is employee, so the three documented values are
   * each requested and merged by agent id, then paged locally.
   */
  async listUsers(credentials: Credentials, params: QueryParams): Promise<User[]> {
    const client = this.client(credentials)
    const byId = new Map<string, User>()
    for (const userType of USER_TYPES) {
      const res = await client.post<RawUsedeskAgent[]>('/users', { user_type: userType })
      if (!Array.isArray(res))
        throw new Error(`UseDesk /users (${userType}): response is not an array`)
      for (const raw of res) {
        const user = transformUser(raw)
        if (!byId.has(user.id)) byId.set(user.id, user)
      }
    }
    return pageLocally([...byId.values()], params)
  }

  /**
   * POST /users `user_id`: "User ID If this field is passed, information
   * about one agent will be returned" (https://api.usedocs.com/article/51414).
   */
  async getUser(credentials: Credentials, id: string): Promise<User> {
    const res = await this.client(credentials).post<RawUsedeskAgent[] | RawUsedeskAgent>('/users', {
      user_id: id,
    })
    const rows = Array.isArray(res) ? res : res ? [res] : []
    const raw = rows.find((r) => r.id != null && String(r.id) === id)
    if (!raw) throw new Error(`UseDesk agent ${id} not found`)
    return transformUser(raw)
  }

  // ── Tags ─────────────────────────────────────────────────────────────────

  /**
   * POST /tags: "The method implements a page breakdown. The response has a
   * maximum of 100 entries, the offset parameter is used." and "offset …
   * Offset by 1 will show the next 100 entries"
   * (https://api.usedocs.com/article/51382).
   */
  async listTags(credentials: Credentials, params: QueryParams): Promise<Tag[]> {
    const client = this.client(credentials)
    return this.pageOffsets(credentials, params, 'tags', async (offset) => {
      const res = await client.post<RawUsedeskTag[]>('/tags', { offset })
      if (!Array.isArray(res)) throw new Error('UseDesk /tags: response is not an array')
      return res.map(transformTag)
    })
  }

  async getTag(_credentials: Credentials, _id: string): Promise<Tag> {
    throw notSupported(
      'UseDesk cannot read a single tag: the API documents only "Get a list of tags" (POST /uapi/tags), with no tag lookup',
    )
  }

  // ── Teams (groups) ───────────────────────────────────────────────────────

  /**
   * POST /groups documents only `api_token` and "returns a list of groups":
   * the whole list in one response, paged locally.
   * https://api.usedocs.com/article/51418
   */
  async listTeams(credentials: Credentials, params: QueryParams): Promise<Team[]> {
    const res = await this.client(credentials).post<GroupListResponse>('/groups', {})
    const rows = toArray<RawUsedeskGroup>(
      res as RawUsedeskGroup[] | Record<string, RawUsedeskGroup[] | undefined>,
      'groups',
    ).map(transformTeam)
    return pageLocally(rows, params)
  }

  async getTeam(credentials: Credentials, id: string): Promise<Team> {
    const res = await this.client(credentials).post<RawUsedeskGroup | { group?: RawUsedeskGroup }>(
      '/group',
      { group_id: id },
    )
    const raw = (res as { group?: RawUsedeskGroup }).group ?? (res as RawUsedeskGroup)
    if (!raw || !raw.id) throw new Error(`UseDesk group ${id} not found`)
    return transformTeam(raw)
  }
}
