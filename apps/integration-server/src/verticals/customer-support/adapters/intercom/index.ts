/**
 * Intercom adapter — customer-support vertical.
 *
 * OAuth 2.0 authorization code for public apps, regional (US/EU/AU) hosts,
 * `Intercom-Version: 2.16` pinned on every request. Read-only: the vertical's
 * interface has no writes.
 *
 * Canonical mapping (every endpoint is in the 2.16 REST reference,
 * https://developers.intercom.com/docs/references/introduction, generated
 * from https://github.com/intercom/Intercom-OpenAPI/blob/main/descriptions/2.16/api.intercom.io.yaml):
 *
 *   tickets   ← conversations      GET /conversations, POST /conversations/search, GET /conversations/{id}
 *   messages  ← conversation source + `comment`/`note` parts of GET /conversations/{id}
 *   contacts  ← contacts           GET /contacts, POST /contacts/search, GET /contacts/{id}
 *   users     ← admins             GET /admins, GET /admins/{id}
 *   teams     ← teams              GET /teams, GET /teams/{id}
 *   tags      ← tags               GET /tags, GET /tags/{id}
 *   macros    ← macros             GET /macros, GET /macros/{id}
 *
 * Refused (501 before any request): getMessage — Intercom documents no
 * endpoint that fetches one conversation part by id.
 */
import type { Credentials, CredentialField, QueryParams } from '@opensteward/shared'
import {
  connectionScope,
  cursorPagerKey,
  pageByCursor,
  pageLocally,
  reportUpstreamPage,
} from '@opensteward/shared'
import type { CustomerSupportAdapter } from '../../adapter/interface'
import type { Ticket } from '../../schema/ticket'
import type { Message } from '../../schema/message'
import type { Contact } from '../../schema/contact'
import type { User } from '../../schema/user'
import type { Tag } from '../../schema/tag'
import type { Team } from '../../schema/team'
import type { Macro } from '../../schema/macro'
import type { WebhookEvent } from '../../schema/webhook'

import {
  buildAuthUrl,
  oauthFields as intercomOauthFields,
  exchangeCode as intercomExchangeCode,
  refreshCredentials as intercomRefreshCredentials,
} from './auth'
import { IntercomClient, regionOf } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'
import { verifyIntercomWebhook, parseIntercomWebhookEvents } from './webhook'

import { transformTicket, type RawIntercomConversation } from './transform/ticket'
import {
  isMessagePart,
  transformMessage,
  transformSourceMessage,
  type RawIntercomConversationPart,
} from './transform/message'
import { transformContact, type RawIntercomContact } from './transform/contact'
import { transformUser, type RawIntercomAdmin } from './transform/user'
import { transformTag, type RawIntercomTag } from './transform/tag'
import { transformTeam, type RawIntercomTeam } from './transform/team'
import { transformMacro, type RawIntercomMacro } from './transform/macro'

export interface IntercomAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

/**
 * The `pages` object every list and search response carries: "You can repeat
 * this process until there is no longer a next object in the response", with
 * the next cursor in `pages.next.starting_after`.
 * https://developers.intercom.com/docs/build-an-integration/learn-more/rest-apis/pagination
 */
interface CursorPageResponse {
  pages?: { next?: { starting_after?: string | null } | null } | null
}

interface ConversationListResponse extends CursorPageResponse {
  conversations?: RawIntercomConversation[]
}
interface ConversationResponse extends RawIntercomConversation {
  conversation_parts?: {
    conversation_parts?: RawIntercomConversationPart[]
    total_count?: number
  } | null
}
interface DataListResponse<T> extends CursorPageResponse {
  data?: T[]
}
interface AdminListResponse {
  admins?: RawIntercomAdmin[]
}
interface TeamListResponse {
  teams?: RawIntercomTeam[]
}

/** A 501 raised before any request is sent; the sync worker skips the resource on it. */
function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

/** Unix seconds for a search filter, or undefined when `updatedAfter` is absent or invalid. */
function unixSeconds(d: unknown): number | undefined {
  if (!(d instanceof Date)) return undefined
  const ms = d.getTime()
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : undefined
}

/**
 * How far before `updatedAfter` the contact-search bound goes: two days.
 * Contact search matches timestamps by calendar day in the workspace's
 * timezone and `>` starts at the next day (see listContacts). The bound must
 * fall on an earlier workspace-local day than `updatedAfter`; one day
 * (86,400 s) is not always enough, because a DST fall-back day is 25 hours
 * long, so a bound 24 hours early can still land on the same local day.
 */
const CONTACT_SEARCH_LOOKBACK_SECONDS = 2 * 86_400

export class IntercomAdapter implements CustomerSupportAdapter {
  readonly platform = 'intercom'
  readonly version = '0.2.0'
  /**
   * Every cursor list and search pages at the caller's size up to 150 ("the
   * max amount for any API is 150"); admins, teams and tags come back whole
   * and are paged locally.
   */
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  private clientId: string
  private clientSecret: string
  private redirectUri: string

  constructor(config: IntercomAdapterConfig) {
    this.clientId = config?.clientId ?? ''
    this.clientSecret = config?.clientSecret ?? ''
    this.redirectUri = config?.redirectUri ?? ''
  }

  // ── Auth ────────────────────────────────────────────────────────────────

  /** The workspace's hosting region, asked for on the Connect page before the redirect. */
  oauthFields(): CredentialField[] {
    return intercomOauthFields()
  }

  /**
   * `overrideScopes` cannot change what Intercom grants: scopes are set on the
   * app in the Developer Hub and the authorize URL takes none, so none is
   * sent (and the default is never sent in its place either).
   */
  getAuthUrl(
    state: string,
    _overrideScopes?: string[],
    _codeChallenge?: string,
    inputs?: Record<string, string>,
  ): string {
    // Throws "Intercom region is required" without inputs.
    return buildAuthUrl(this.clientId, this.redirectUri, state, inputs?.['region'])
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    // Reached only when a flow collected no region, which the start routes
    // refuse; throws before any request rather than exchanging a code whose
    // token could not be routed to the right regional API host.
    return intercomExchangeCode(code, this.clientId, this.clientSecret, undefined)
  }

  /** Exchange on the documented token URL; the region lands in credentials.extra for the API client. */
  async exchangeCodeWithInputs(
    code: string,
    _redirectUri: string,
    inputs: Record<string, string>,
  ): Promise<Credentials> {
    return intercomExchangeCode(code, this.clientId, this.clientSecret, inputs['region'])
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return intercomRefreshCredentials(credentials)
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyIntercomWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseIntercomWebhookEvents(payload)
  }

  // ── Paging ──────────────────────────────────────────────────────────────

  private client(credentials: Credentials): IntercomClient {
    return new IntercomClient(credentials)
  }

  /** Pager scope for ONE connection: region plus a token fingerprint, never the token. */
  private pagerScope(credentials: Credentials): string {
    return connectionScope(`intercom:${regionOf(credentials)}`, credentials)
  }

  private pageSize(params: QueryParams): { size: number; asked: number } {
    const asked =
      typeof params.limit === 'number' && Number.isFinite(params.limit) && params.limit >= 1
        ? Math.floor(params.limit)
        : DEFAULT_PAGE_SIZE
    return { size: Math.min(asked, MAX_PAGE_SIZE), asked }
  }

  /**
   * One caller page of a `starting_after` cursor list. The caller's 1-based
   * `page` resolves through the shared cursor pager, which follows
   * `pages.next.starting_after` while a `next` object is present — "This
   * method of pagination is used to iterate through a result set until all
   * results have been fetched, not to directly go to page X of the results.
   * This is not possible." An explicit `cursor` wins: that caller already
   * holds a position. `request(size, after)` sends one upstream page.
   */
  private async cursorList<Res extends CursorPageResponse, T>(
    credentials: Credentials,
    collection: string,
    keyParams: Record<string, unknown>,
    params: QueryParams,
    request: (client: IntercomClient, size: number, after: string | undefined) => Promise<Res>,
    rowsOf: (res: Res) => T[] | undefined,
  ): Promise<T[]> {
    const client = this.client(credentials)
    const { size, asked } = this.pageSize(params)
    const fetchPage = async (after: string | undefined) => {
      const res = await request(client, size, after)
      const next = res?.pages?.next?.starting_after
      return {
        items: rowsOf(res) ?? [],
        next: typeof next === 'string' && next !== '' ? next : undefined,
      }
    }

    let page: { items: T[]; hasMore: boolean }
    const explicit = params['cursor']
    if (explicit != null && explicit !== '') {
      const res = await fetchPage(String(explicit))
      page = { items: res.items, hasMore: res.next !== undefined }
    } else {
      const key = cursorPagerKey(this.pagerScope(credentials), collection, {
        ...keyParams,
        per_page: size,
      })
      page = await pageByCursor<T, string>(key, params.page, fetchPage)
    }
    reportUpstreamPage(params, {
      hasMore: page.hasMore,
      ...(size < asked ? { pageSize: size } : {}),
    })
    return page.items
  }

  /** A GET list: `per_page` and `starting_after` as query parameters. */
  private getList<Res extends CursorPageResponse, T>(
    credentials: Credentials,
    path: string,
    params: QueryParams,
    rowsOf: (res: Res) => T[] | undefined,
    filters: Record<string, unknown> = {},
  ): Promise<T[]> {
    return this.cursorList(
      credentials,
      `GET ${path}`,
      filters,
      params,
      (client, size, after) =>
        client.get<Res>(path, {
          ...filters,
          per_page: size,
          ...(after === undefined ? {} : { starting_after: after }),
        }),
      rowsOf,
    )
  }

  /**
   * A search: `{ query, pagination: { per_page, starting_after } }` in a POST
   * body — "Unlike the list APIs, the per_page parameter is nested inside of a
   * pagination object."
   */
  private searchList<Res extends CursorPageResponse, T>(
    credentials: Credentials,
    path: string,
    query: Record<string, unknown>,
    params: QueryParams,
    rowsOf: (res: Res) => T[] | undefined,
  ): Promise<T[]> {
    return this.cursorList(
      credentials,
      `POST ${path}`,
      { query },
      params,
      (client, size, after) =>
        client.post<Res>(path, {
          query,
          pagination: { per_page: size, ...(after === undefined ? {} : { starting_after: after }) },
        }),
      rowsOf,
    )
  }

  // ── Tickets (conversations) ─────────────────────────────────────────────

  /**
   * Without `updatedAfter`: List all conversations. With it: Search
   * conversations on `updated_at` ("Date (UNIX timestamp)"), the documented
   * server-side filter. The operator table documents `>` as "Greater (or
   * equal) than"; the bound is still sent one second early so a conversation
   * updated in that very second is kept even if `>` were strict.
   */
  async listTickets(credentials: Credentials, params: QueryParams): Promise<Ticket[]> {
    const since = unixSeconds(params.updatedAfter)
    const rows =
      since === undefined
        ? await this.getList(
            credentials,
            '/conversations',
            params,
            (r: ConversationListResponse) => r.conversations,
          )
        : await this.searchList(
            credentials,
            '/conversations/search',
            { field: 'updated_at', operator: '>', value: since - 1 },
            params,
            (r: ConversationListResponse) => r.conversations,
          )
    return rows.map(transformTicket)
  }

  async getTicket(credentials: Credentials, id: string): Promise<Ticket> {
    const res = await this.client(credentials).get<RawIntercomConversation>(
      `/conversations/${encodeURIComponent(id)}`,
    )
    return transformTicket(res)
  }

  // ── Messages (conversation source + parts) ──────────────────────────────

  /**
   * Retrieve a conversation, `display_as=plaintext` ("Set to plaintext to
   * retrieve conversation messages in plain text"), and serve its opening
   * message plus its `comment` and `note` parts, paged locally: Intercom
   * documents no paged parts endpoint. Its cap applies: "If you have more than
   * that [500] we will return the 500 most recent conversation parts", so on a
   * conversation past 500 parts the oldest are not reachable through the API.
   */
  async listMessages(
    credentials: Credentials,
    ticketId: string,
    params: QueryParams,
  ): Promise<Message[]> {
    const res = await this.client(credentials).get<ConversationResponse>(
      `/conversations/${encodeURIComponent(ticketId)}`,
      { display_as: 'plaintext' },
    )
    const conversationId = res?.id != null ? String(res.id) : ticketId
    const messages: Message[] = []
    const opening = transformSourceMessage(res?.source, conversationId, res?.created_at)
    if (opening) messages.push(opening)
    for (const part of res?.conversation_parts?.conversation_parts ?? []) {
      if (isMessagePart(part)) messages.push(transformMessage(part, conversationId))
    }
    return pageLocally(messages, params)
  }

  async getMessage(_credentials: Credentials, _id: string): Promise<Message> {
    throw notSupported(
      'Intercom cannot get a message by id: it documents no endpoint for one conversation part; list them with listMessages(ticketId).',
    )
  }

  // ── Contacts ────────────────────────────────────────────────────────────

  /**
   * Without `updatedAfter`: List all contacts, paged by `per_page` and
   * `starting_after` (the "Use Pagination with List APIs" guide pages
   * `/contacts` this way). With it: Search contacts on `updated_at`. Contact
   * search matches timestamps "by calendar day" in "your workspace's
   * timezone", and "`>` matches from the start of the *next* day", so the
   * bound is sent two days early (CONTACT_SEARCH_LOOKBACK_SECONDS): it then
   * lands on a workspace-local day before `updatedAfter`'s, so `>` starts no
   * later than the start of `updatedAfter`'s own day and nothing updated
   * since is missed. The cost is re-reading up to two days of contacts.
   */
  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const since = unixSeconds(params.updatedAfter)
    const rows =
      since === undefined
        ? await this.getList(
            credentials,
            '/contacts',
            params,
            (r: DataListResponse<RawIntercomContact>) => r.data,
          )
        : await this.searchList(
            credentials,
            '/contacts/search',
            { field: 'updated_at', operator: '>', value: since - CONTACT_SEARCH_LOOKBACK_SECONDS },
            params,
            (r: DataListResponse<RawIntercomContact>) => r.data,
          )
    return rows.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const res = await this.client(credentials).get<RawIntercomContact>(
      `/contacts/${encodeURIComponent(id)}`,
    )
    return transformContact(res)
  }

  // ── Users (admins) ──────────────────────────────────────────────────────

  /** List all admins: one unpaged response (no paging parameters are documented), paged locally. */
  async listUsers(credentials: Credentials, params: QueryParams): Promise<User[]> {
    const res = await this.client(credentials).get<AdminListResponse>('/admins')
    return pageLocally((res?.admins ?? []).map(transformUser), params)
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    const res = await this.client(credentials).get<RawIntercomAdmin>(
      `/admins/${encodeURIComponent(id)}`,
    )
    return transformUser(res)
  }

  // ── Tags ────────────────────────────────────────────────────────────────

  /** List all tags: one unpaged response, paged locally. */
  async listTags(credentials: Credentials, params: QueryParams): Promise<Tag[]> {
    const res = await this.client(credentials).get<DataListResponse<RawIntercomTag>>('/tags')
    return pageLocally((res?.data ?? []).map(transformTag), params)
  }

  async getTag(credentials: Credentials, id: string): Promise<Tag> {
    const res = await this.client(credentials).get<RawIntercomTag>(
      `/tags/${encodeURIComponent(id)}`,
    )
    return transformTag(res)
  }

  // ── Teams ───────────────────────────────────────────────────────────────

  /** List all teams: one unpaged response, paged locally. */
  async listTeams(credentials: Credentials, params: QueryParams): Promise<Team[]> {
    const res = await this.client(credentials).get<TeamListResponse>('/teams')
    return pageLocally((res?.teams ?? []).map(transformTeam), params)
  }

  async getTeam(credentials: Credentials, id: string): Promise<Team> {
    const res = await this.client(credentials).get<RawIntercomTeam>(
      `/teams/${encodeURIComponent(id)}`,
    )
    return transformTeam(res)
  }

  // ── Macros ──────────────────────────────────────────────────────────────

  /**
   * List all macros: `per_page` (max 150), `starting_after`, and the
   * documented `updated_since` ("Unix timestamp to filter macros updated after
   * this time"), sent one second early so a macro updated in that second is
   * kept.
   */
  async listMacros(credentials: Credentials, params: QueryParams): Promise<Macro[]> {
    const since = unixSeconds(params.updatedAfter)
    const rows = await this.getList(
      credentials,
      '/macros',
      params,
      (r: DataListResponse<RawIntercomMacro>) => r.data,
      since === undefined ? {} : { updated_since: since - 1 },
    )
    return rows.map(transformMacro)
  }

  async getMacro(credentials: Credentials, id: string): Promise<Macro> {
    const res = await this.client(credentials).get<RawIntercomMacro>(
      `/macros/${encodeURIComponent(id)}`,
    )
    return transformMacro(res)
  }
}
