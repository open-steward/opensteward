/**
 * HubSpot Service Hub adapter for the customer-support vertical.
 *
 * Auth: OAuth 2.0 Authorization Code flow.
 *   Authorize: https://app.hubspot.com/oauth/authorize
 *   Token:     https://api.hubapi.com/oauth/v1/token
 *   Access tokens expire in ~30 min; refresh_token is long-lived.
 *
 * Resources supported:
 *   - Tickets       GET /crm/v3/objects/tickets (+ /{id})
 *   - Messages      GET /conversations/v3/conversations/threads?associatedTicketId={ticketId}
 *                   then GET /conversations/v3/conversations/threads/{threadId}/messages
 *   - Contacts      GET /crm/v3/objects/contacts (+ /{id})
 *   - Users/Owners  GET /crm/v3/owners (+ /{ownerId})
 *   - Tags          GET /crm/v3/properties/tickets/hs_tag_ids (list, enum options)
 *                   GET /crm/object-tags/2026-09/{objectTypeId}/{tagId} (get by id)
 *                   Two id spaces: the list returns property-option values,
 *                   object-tags keys on its own ids. getTag resolves across
 *                   both so a listed id round-trips — see getTag.
 *   - Teams         GET /settings/v3/users/teams (list)
 *                   GET /settings/teams/2026-09/{teamId} (get by id)
 *
 * Not supported (no equivalent HubSpot API):
 *   - Macros/canned responses — HubSpot has "snippets" but no public REST endpoint
 *
 * Schema-firewall: no attachment content, no voice recording, no AI summaries.
 * Pagination: cursor-based via paging.next.after in response; passed as `after` param.
 */
import {
  connectionScope,
  cursorPagerKey,
  pageByCursor,
  pageLocally,
  pageByRows,
  reportUpstreamPage,
  type CursorPage,
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
import type { WebhookEvent } from '../../schema/webhook'

import {
  buildAuthUrl,
  credentialFields as hubspotCredentialFields,
  exchangeCode as hubspotExchangeCode,
  refreshCredentials as hubspotRefreshCredentials,
  DEFAULT_SCOPES,
} from './auth'
import { HubspotServiceHubClient } from './client'
import {
  CONVERSATIONS_PAGE_SIZE,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  DEFAULT_TICKET_PROPERTIES,
  DEFAULT_CONTACT_PROPERTIES,
  TICKETS_OBJECT_TYPE_ID,
} from './constants'
import { verifyHubspotWebhook, parseHubspotWebhookEvents } from './webhook'

import { transformTicket, type RawHubspotTicket } from './transform/ticket'
import { isBodyMessage, transformMessage, type RawHubspotMessage } from './transform/message'
import { transformContact, type RawHubspotContact } from './transform/contact'
import { transformUser, type RawHubspotOwner } from './transform/user'
import {
  transformTag,
  type RawHubspotTagOption,
  transformObjectTag,
  type RawHubspotObjectTag,
} from './transform/tag'
import { transformTeam, type RawHubspotTeam } from './transform/team'

export interface HubspotServiceHubAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

// ── HubSpot CRM v3 response envelopes ────────────────────────────────────────

interface CrmListResponse<T> {
  results?: T[]
  paging?: { next?: { after?: string; link?: string } }
}

interface ConversationMessagesResponse {
  results?: RawHubspotMessage[]
  paging?: { next?: { after?: string } }
}

/** `CollectionResponsePublicThreadForwardPaging`; only the thread id is read. */
interface ThreadsListResponse {
  results?: Array<{ id: string }>
  paging?: { next?: { after?: string } }
}

/** A replayable position in a ticket's flattened message stream. */
interface MessagesCursor {
  /** The thread being read, then the threads still to read after it. */
  threads: string[]
  /** `paging.next.after` within the first thread's message history. */
  after?: string
}

interface TeamsListResponse {
  results?: RawHubspotTeam[]
}

interface TagPropertyResponse {
  options?: RawHubspotTagOption[]
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export class HubspotServiceHubAdapter implements CustomerSupportAdapter {
  readonly platform = 'hubspot-service-hub'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: HubspotServiceHubAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes ?? DEFAULT_SCOPES
  }

  credentialFields(): CredentialField[] {
    return hubspotCredentialFields()
  }

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(this.clientId, this.redirectUri, overrideScopes ?? this.scopes, state)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return hubspotExchangeCode(code, redirectUri, this.clientId, this.clientSecret)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return hubspotRefreshCredentials(credentials, this.clientId, this.clientSecret)
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyHubspotWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseHubspotWebhookEvents(payload)
  }

  private client(credentials: Credentials): HubspotServiceHubClient {
    return new HubspotServiceHubClient(credentials)
  }

  /**
   * One caller page of a HubSpot forward-paged list (`/crm/v3/objects/*`,
   * `/crm/v3/owners`). One upstream page at the caller's limit IS one caller
   * page: `paging.next.after` starts the next one, and its absence is the end.
   * The 1-based `page` resolves through the shared cursor pager; an explicit
   * caller `cursor` is sent as `after` in a single request.
   *
   * HubSpot refuses a CRM list `limit` above 100 with a 400, so the size sent
   * is clamped to MAX_PAGE_SIZE and reported when it is below the caller's.
   */
  private async cursorList<T>(
    credentials: Credentials,
    path: string,
    extra: Record<string, unknown>,
    params: QueryParams,
  ): Promise<T[]> {
    const client = this.client(credentials)
    const requested = Math.max(
      1,
      Math.floor(Number(params.limit ?? DEFAULT_PAGE_SIZE)) || DEFAULT_PAGE_SIZE,
    )
    const limit = Math.min(requested, MAX_PAGE_SIZE)
    const sized = limit < requested ? { pageSize: limit } : {}
    const fetchPage = async (after: string | undefined) => {
      const res = await client.get<CrmListResponse<T>>(path, {
        ...extra,
        limit,
        ...(after ? { after } : {}),
      })
      const next = res.paging?.next?.after
      return { items: res.results ?? [], next: next ? next : undefined }
    }

    if (params['cursor']) {
      const res = await fetchPage(String(params['cursor']))
      reportUpstreamPage(params, { hasMore: res.next !== undefined, ...sized })
      return res.items
    }

    const key = cursorPagerKey(connectionScope(this.platform, credentials), path, {
      ...extra,
      limit,
    })
    const result = await pageByCursor<T, string>(key, params.page, fetchPage)
    reportUpstreamPage(params, { hasMore: result.hasMore, ...sized })
    return result.items
  }

  // ── Tickets ─────────────────────────────────────────────────────────────────

  async listTickets(credentials: Credentials, params: QueryParams): Promise<Ticket[]> {
    const rows = await this.cursorList<RawHubspotTicket>(
      credentials,
      '/crm/v3/objects/tickets',
      { properties: DEFAULT_TICKET_PROPERTIES },
      params,
    )
    return rows.map(transformTicket)
  }

  async getTicket(credentials: Credentials, id: string): Promise<Ticket> {
    const res = await this.client(credentials).get<RawHubspotTicket>(
      `/crm/v3/objects/tickets/${id}`,
      { properties: DEFAULT_TICKET_PROPERTIES },
    )
    return transformTicket(res)
  }

  // ── Messages (Conversations threads) ────────────────────────────────────────
  //
  // HubSpot keeps a ticket's messages in Conversations threads. The guide
  // (developers.hubspot.com/docs/api-reference/legacy/conversations/guide):
  // "To filter for messages associated with a specific ticket, provide ticket
  // ID as the associatedTicketId query parameter" on
  // GET /conversations/v3/conversations/threads, and "To get the entire
  // message history, make a GET request to
  // /conversations/v3/conversations/threads/{threadId}/messages". Both page
  // forward by `after` = the previous response's `paging.next.after`.

  /**
   * A ticket's messages, flattened out of every thread associated with it,
   * cut into the caller's pages by pageByRows. A position is the thread being
   * read, the threads still to read after it, and the `after` cursor within
   * the current thread's message history, so every position is replayable.
   * Page 1 lists the ticket's threads afresh. Thread events (assignments,
   * status and inbox changes) carry no body and are not messages.
   */
  async listMessages(
    credentials: Credentials,
    ticketId: string,
    params: QueryParams,
  ): Promise<Message[]> {
    const client = this.client(credentials)
    const key = cursorPagerKey(
      connectionScope(this.platform, credentials),
      '/conversations/v3/conversations/threads/{threadId}/messages',
      { associatedTicketId: ticketId, limit: CONVERSATIONS_PAGE_SIZE },
    )
    const fetchPage = async (
      cursor: MessagesCursor | undefined,
    ): Promise<CursorPage<Message, MessagesCursor>> => {
      const threads = cursor ? cursor.threads : await this.ticketThreadIds(client, ticketId)
      const [threadId, ...rest] = threads
      if (threadId === undefined) return { items: [], next: undefined }
      const res = await client.get<ConversationMessagesResponse>(
        `/conversations/v3/conversations/threads/${threadId}/messages`,
        { limit: CONVERSATIONS_PAGE_SIZE, ...(cursor?.after ? { after: cursor.after } : {}) },
      )
      const items = (res.results ?? [])
        .filter(isBodyMessage)
        .map((m) => transformMessage(m, ticketId))
      const after = res.paging?.next?.after
      const next: MessagesCursor | undefined = after
        ? { threads, after }
        : rest.length > 0
          ? { threads: rest }
          : undefined
      return { items, next }
    }
    const { items } = await pageByRows<Message, MessagesCursor>(key, params, fetchPage)
    return items
  }

  /**
   * Every Conversations thread associated with the ticket, in id order.
   * `archived` is not sent, so archived (trashed) threads are left out: the
   * spec describes it as "Whether to return only results that have been
   * archived.", so sending it would return only those instead.
   */
  private async ticketThreadIds(
    client: HubspotServiceHubClient,
    ticketId: string,
  ): Promise<string[]> {
    const ids: string[] = []
    let after: string | undefined
    for (;;) {
      const res = await client.get<ThreadsListResponse>('/conversations/v3/conversations/threads', {
        associatedTicketId: ticketId,
        limit: CONVERSATIONS_PAGE_SIZE,
        ...(after ? { after } : {}),
      })
      ids.push(...(res.results ?? []).map((t) => t.id))
      const next = res.paging?.next?.after
      if (!next) return ids
      if (next === after) {
        throw new Error(`HubSpot threads for ticket ${ticketId}: paging.next.after repeats ${next}`)
      }
      after = next
    }
  }

  // ── Contacts ─────────────────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const rows = await this.cursorList<RawHubspotContact>(
      credentials,
      '/crm/v3/objects/contacts',
      { properties: DEFAULT_CONTACT_PROPERTIES },
      params,
    )
    return rows.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const res = await this.client(credentials).get<RawHubspotContact>(
      `/crm/v3/objects/contacts/${id}`,
      { properties: DEFAULT_CONTACT_PROPERTIES },
    )
    return transformContact(res)
  }

  // ── Users (Owners / Agents) ──────────────────────────────────────────────────

  async listUsers(credentials: Credentials, params: QueryParams): Promise<User[]> {
    const rows = await this.cursorList<RawHubspotOwner>(credentials, '/crm/v3/owners', {}, params)
    return rows.map(transformUser)
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    const res = await this.client(credentials).get<RawHubspotOwner>(`/crm/v3/owners/${id}`)
    return transformUser(res)
  }

  // ── Tags (from ticket property options) ──────────────────────────────────────

  async listTags(credentials: Credentials, params: QueryParams): Promise<Tag[]> {
    // "Read a property" takes no paging parameter: the one response carries
    // every option, so the visible options are the whole collection.
    const res = await this.client(credentials).get<TagPropertyResponse>(
      '/crm/v3/properties/tickets/hs_tag_ids',
    )
    const tags = (res.options ?? []).filter((opt) => !opt.hidden).map(transformTag)
    return pageLocally(tags, params)
  }

  /**
   * Tags reach this adapter through two unrelated HubSpot id spaces, so a
   * single read cannot serve both.
   *
   * `listTags` returns the ticket property's enum-option VALUES
   * (`hs_tag_ids`); the CRM object-tags API keys on its own tag ids. An id
   * from the list therefore 404s against object-tags, which broke the ordinary
   * list-then-get pattern for every caller.
   *
   * Resolution goes object-tags first — that record carries colour and
   * description the enum options do not — and falls back to the property
   * options when the id is not in that space. Both routes are ones this
   * adapter already calls, so nothing here depends on an object-tags bulk-list
   * endpoint, whose existence is not verifiable: HubSpot's spec index names
   * `crm-object-tags-v2026-09.json` and that file 404s.
   *
   * Only a 404 falls through. A 5xx or an auth failure must surface, not
   * quietly degrade into a lookup that answers a different question.
   */
  async getTag(credentials: Credentials, id: string): Promise<Tag> {
    try {
      const res = await this.client(credentials).get<RawHubspotObjectTag>(
        `/crm/object-tags/2026-09/${TICKETS_OBJECT_TYPE_ID}/${id}`,
      )
      return transformObjectTag(res)
    } catch (err) {
      if ((err as { response?: { status?: number } })?.response?.status !== 404) throw err
    }

    const res = await this.client(credentials).get<TagPropertyResponse>(
      '/crm/v3/properties/tickets/hs_tag_ids',
    )
    // Hidden options are filtered out of listTags, so resolving one here would
    // hand back a tag the list says does not exist.
    const option = (res.options ?? []).find((opt) => !opt.hidden && opt.value === id)
    if (!option) throw new Error(`HubSpot tag ${id} not found in either tag namespace`)
    return transformTag(option)
  }

  // ── Teams ────────────────────────────────────────────────────────────────────

  async listTeams(credentials: Credentials, params: QueryParams): Promise<Team[]> {
    // The response is `CollectionResponsePublicTeamNoPaging` and the endpoint
    // takes no parameters: every team in one response, paged locally.
    const res = await this.client(credentials).get<TeamsListResponse>('/settings/v3/users/teams')
    return pageLocally((res.results ?? []).map(transformTeam), params)
  }

  async getTeam(credentials: Credentials, id: string): Promise<Team> {
    const res = await this.client(credentials).get<RawHubspotTeam>(`/settings/teams/2026-09/${id}`)
    return transformTeam(res)
  }

  // ── Macros — NOT SUPPORTED ───────────────────────────────────────────────────
  // HubSpot has "snippets" but no public REST API; methods intentionally omitted.
  // The interface marks them optional, so they auto-501 via the platform router.
}
