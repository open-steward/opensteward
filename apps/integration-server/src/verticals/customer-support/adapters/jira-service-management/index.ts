/**
 * Jira Service Management adapter for the customer-support vertical.
 *
 * Auth: OAuth 2.0 (3LO) via auth.atlassian.com.
 * Base: https://api.atlassian.com/ex/jira/{cloudId}/rest/servicedeskapi
 *       https://api.atlassian.com/ex/jira/{cloudId}/rest/api/3  (users)
 *
 * Supported resources:
 *   listTickets / getTicket         — GET /request
 *   listMessages / getMessage       — GET /request/{key}/comment
 *   listContacts / getContact       — GET /servicedesk/{id}/customer (per desk)
 *   listUsers / getUser             — GET /rest/api/3/users/search
 *   listTeams / getTeam             — GET /servicedesk
 *
 * Not supported by JSM (auto-501 via absent implementation):
 *   Tags, Macros — JSM has no equivalent first-class resources.
 *
 * Webhooks: JSM Cloud does not publish HMAC signature verification headers;
 *   verifyWebhook / parseWebhookEvents are intentionally omitted.
 *
 * Schema-firewall: no attachment content, no voice bytes, no AI summaries,
 *   contact PII = email + name only (JSM UserDTO has no phone field).
 */
import {
  connectionScope,
  cursorPagerKey,
  pageByRows,
  type Credentials,
  type CredentialField,
  type CursorPage,
  type QueryParams,
} from '@opensteward/shared'
import type { CustomerSupportAdapter } from '../../adapter/interface'
import type { Ticket } from '../../schema/ticket'
import type { Message } from '../../schema/message'
import type { Contact } from '../../schema/contact'
import type { User } from '../../schema/user'
import type { Team } from '../../schema/team'

import {
  buildAuthUrl,
  credentialFields as jsmCredentialFields,
  exchangeCode as jsmExchangeCode,
  refreshCredentials as jsmRefreshCredentials,
  DEFAULT_SCOPES,
} from './auth'
import { JiraServiceManagementClient } from './client'
import { SD_UPSTREAM_PAGE_SIZE, USERS_SEARCH_PAGE_SIZE } from './constants'

import { transformTicket, type RawJsmRequest } from './transform/ticket'
import { transformMessage, type RawJsmComment } from './transform/message'
import { transformContact, type RawJsmCustomer } from './transform/contact'
import { transformUser, type RawJiraUser } from './transform/user'
import { transformTeam, type RawJsmServiceDesk } from './transform/team'

export interface JiraServiceManagementAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

// ── JSM paged response wrappers ──────────────────────────────────────────────

interface JsmPaged<T> {
  values?: T[]
  isLastPage?: boolean
  start?: number
  limit?: number
  size?: number
}

/** Where a walk of every desk's customers stands. */
interface DeskWalk {
  /** Desks still to read, the first being read now. */
  desks: string[]
  /** `start` of the next page of service desks; null once the desk list ended. */
  nextDeskStart: number | null
  /** `start` within the first desk's customers. */
  customerStart: number
}

// Jira Platform v3 user search returns a plain array
type UsersSearchResponse = RawJiraUser[]

export class JiraServiceManagementAdapter implements CustomerSupportAdapter {
  readonly platform = 'jira-service-management'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: JiraServiceManagementAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes ?? DEFAULT_SCOPES
  }

  credentialFields(): CredentialField[] {
    return jsmCredentialFields()
  }

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(this.clientId, this.redirectUri, overrideScopes ?? this.scopes, state)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return jsmExchangeCode(code, redirectUri, this.clientId, this.clientSecret)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return jsmRefreshCredentials(credentials, this.clientId, this.clientSecret)
  }

  private client(credentials: Credentials): JiraServiceManagementClient {
    return new JiraServiceManagementClient(credentials)
  }

  /**
   * The row-pager key for one collection of one connection. The cloudId is the
   * site; connectionScope adds a fingerprint of this connection's token, because
   * the pager keeps rows and two users of one site see different requests.
   */
  private pagerKey(
    credentials: Credentials,
    collection: string,
    filters: Record<string, unknown>,
  ): string {
    const cloudId = String(credentials.extra?.['cloudId'] ?? '')
    return cursorPagerKey(connectionScope(cloudId, credentials), collection, filters)
  }

  /**
   * One JSM page at `start`. JSM pages by `start` ("The starting index of the
   * returned objects. Base index: 0.") and `limit`, but "Each resource or method
   * has a unique limit on the maximum number of items returned ... the number of
   * items returned will be capped at the limit for that resource's method", and
   * that limit is undocumented. So the next page starts after the rows actually
   * returned, and `isLastPage` ends the chain.
   */
  private async sdPage<T>(
    client: JiraServiceManagementClient,
    path: string,
    start: number,
    extra: Record<string, unknown> = {},
  ): Promise<CursorPage<T, number>> {
    const res = await client.sdGet<JsmPaged<T>>(path, {
      ...extra,
      start,
      limit: SD_UPSTREAM_PAGE_SIZE,
    })
    const values = res.values ?? []
    const last = res.isLastPage === true || values.length === 0
    return { items: values, next: last ? undefined : start + values.length }
  }

  /** Serve the caller's page of a JSM paged collection, cut out of the upstream pages. */
  private async pageSd<T, R>(
    credentials: Credentials,
    params: QueryParams,
    path: string,
    map: (raw: T) => R,
  ): Promise<R[]> {
    const client = this.client(credentials)
    const key = this.pagerKey(credentials, path, { pageSize: SD_UPSTREAM_PAGE_SIZE })
    const { items } = await pageByRows<T, number>(key, params, (cursor) =>
      this.sdPage<T>(client, path, cursor ?? 0),
    )
    return items.map(map)
  }

  // ── Tickets (Customer Requests) ──────────────────────────────────────────

  async listTickets(credentials: Credentials, params: QueryParams): Promise<Ticket[]> {
    return this.pageSd<RawJsmRequest, Ticket>(credentials, params, '/request', transformTicket)
  }

  async getTicket(credentials: Credentials, id: string): Promise<Ticket> {
    const raw = await this.client(credentials).sdGet<RawJsmRequest>(`/request/${id}`)
    return transformTicket(raw)
  }

  // ── Messages (Comments) ──────────────────────────────────────────────────

  async listMessages(
    credentials: Credentials,
    ticketId: string,
    params: QueryParams,
  ): Promise<Message[]> {
    // Omitting public/internal returns both (each defaults to true).
    return this.pageSd<RawJsmComment, Message>(
      credentials,
      params,
      `/request/${ticketId}/comment`,
      (c) => transformMessage(c, ticketId),
    )
  }

  async getMessage(credentials: Credentials, id: string): Promise<Message> {
    // JSM comments are ticket-scoped; a bare comment id requires ticketId too.
    // The id is expected to be "ticketId/commentId" (slash-separated).
    const [ticketId, commentId] = id.split('/')
    if (!ticketId || !commentId) {
      throw new Error(
        `jira-service-management: getMessage requires id in format "ticketId/commentId", got "${id}"`,
      )
    }
    const raw = await this.client(credentials).sdGet<RawJsmComment>(
      `/request/${ticketId}/comment/${commentId}`,
    )
    return transformMessage(raw, ticketId)
  }

  // ── Contacts (Customers) ─────────────────────────────────────────────────

  /**
   * JSM customers are scoped to a service desk.
   * params.serviceDeskId must be provided; falls back to fetching all service
   * desks and merging customers across all of them when absent.
   */
  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const serviceDeskId = params['serviceDeskId']
    if (serviceDeskId) {
      return this.pageSd<RawJsmCustomer, Contact>(
        credentials,
        params,
        `/servicedesk/${String(serviceDeskId)}/customer`,
        transformContact,
      )
    }
    // No serviceDeskId: every customer of every service desk, desk by desk. Each
    // upstream "page" is one page of one desk's customers (or of the desk list),
    // so the caller's page is cut out of the flattened stream.
    const client = this.client(credentials)
    const key = this.pagerKey(credentials, '/servicedesk/*/customer', {
      pageSize: SD_UPSTREAM_PAGE_SIZE,
    })
    const { items } = await pageByRows<RawJsmCustomer, DeskWalk>(key, params, async (cursor) => {
      const at: DeskWalk = cursor ?? { desks: [], nextDeskStart: 0, customerStart: 0 }
      if (at.desks.length === 0) {
        if (at.nextDeskStart === null) return { items: [] }
        const page = await this.sdPage<RawJsmServiceDesk>(client, '/servicedesk', at.nextDeskStart)
        const desks = page.items.map((d) => (d.id == null ? '' : String(d.id))).filter(Boolean)
        const nextDeskStart = page.next ?? null
        if (desks.length === 0 && nextDeskStart === null) return { items: [] }
        return { items: [], next: { desks, nextDeskStart, customerStart: 0 } }
      }
      const [desk, ...rest] = at.desks
      let page: CursorPage<RawJsmCustomer, number>
      try {
        page = await this.sdPage<RawJsmCustomer>(
          client,
          `/servicedesk/${desk}/customer`,
          at.customerStart,
        )
      } catch {
        // Skip desks we lack access to
        page = { items: [] }
      }
      const next: DeskWalk | undefined =
        page.next != null
          ? { ...at, customerStart: page.next }
          : rest.length > 0 || at.nextDeskStart !== null
            ? { desks: rest, nextDeskStart: at.nextDeskStart, customerStart: 0 }
            : undefined
      return { items: page.items, next }
    })
    return items.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    // JSM does not have a per-customer GET endpoint; use Jira's user lookup
    const raw = await this.client(credentials).jiraGet<RawJsmCustomer>(`/user?accountId=${id}`)
    return transformContact(raw)
  }

  // ── Users (Agents) ───────────────────────────────────────────────────────

  async listUsers(credentials: Credentials, params: QueryParams): Promise<User[]> {
    // Jira Platform v3 "Get all users": startAt ("The index of the first item to
    // return.") and maxResults ("The maximum number of items to return (limited to
    // 1000)."), a plain array with no end marker. Only atlassian accounts are kept,
    // so a caller page is cut out of the filtered stream; an empty page ends it.
    const query = params['query'] ? String(params['query']) : undefined
    const client = this.client(credentials)
    const key = this.pagerKey(credentials, '/users/search', {
      pageSize: USERS_SEARCH_PAGE_SIZE,
      query,
    })
    const { items } = await pageByRows<RawJiraUser, number>(key, params, async (cursor) => {
      const startAt = cursor ?? 0
      const users = await client.jiraGet<UsersSearchResponse>('/users/search', {
        maxResults: USERS_SEARCH_PAGE_SIZE,
        startAt,
        // query is optional; if provided via params pass it through
        ...(query ? { query } : {}),
      })
      const raw = Array.isArray(users) ? users : []
      return {
        items: raw.filter((u) => u.accountType === 'atlassian' || u.accountType == null),
        next: raw.length === 0 ? undefined : startAt + raw.length,
      }
    })
    return items.map(transformUser)
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    const raw = await this.client(credentials).jiraGet<RawJiraUser>(
      `/user?accountId=${id}`,
    )
    return transformUser(raw)
  }

  // ── Teams (Service Desks) ────────────────────────────────────────────────

  async listTeams(credentials: Credentials, params: QueryParams): Promise<Team[]> {
    return this.pageSd<RawJsmServiceDesk, Team>(credentials, params, '/servicedesk', transformTeam)
  }

  async getTeam(credentials: Credentials, id: string): Promise<Team> {
    const raw = await this.client(credentials).sdGet<RawJsmServiceDesk>(`/servicedesk/${id}`)
    return transformTeam(raw)
  }

  // ── Tags / Macros — not supported by JSM ─────────────────────────────────
  // Omitted intentionally; the base interface marks them optional.
  // Callers will receive a 501 from the unified server.
}
