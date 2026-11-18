/**
 * Zendesk adapter — reference implementation for the customer-support vertical.
 *
 * Per-tenant subdomain (subdomain.zendesk.com). OAuth 2.0 + read scope.
 * Schema-firewall: no attachment content, no voice-recording bytes, no
 * AI-suggested-reply fields.
 */
import type { Credentials, CredentialField, QueryParams } from '@opensteward/shared'
import {
  connectionScope,
  cursorPagerKey,
  pageByCursor,
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
  oauthFields as zendeskOauthFields,
  exchangeCode as zendeskExchangeCode,
  refreshCredentials as zendeskRefreshCredentials,
} from './auth'
import { ZendeskClient } from './client'
import { DEFAULT_PAGE_SIZE, DEFAULT_SCOPES, MAX_PAGE_SIZE } from './constants'
import { verifyZendeskWebhook, parseZendeskWebhookEvents } from './webhook'

import { transformTicket, type RawZendeskTicket } from './transform/ticket'
import { transformMessage, type RawZendeskComment } from './transform/message'
import { transformContact, type RawZendeskUser } from './transform/contact'
import { transformUser, type RawZendeskAgent } from './transform/user'
import { transformTag, type RawZendeskTag } from './transform/tag'
import { transformTeam, type RawZendeskGroup } from './transform/team'
import { transformMacro, type RawZendeskMacro } from './transform/macro'

export interface ZendeskAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

/**
 * What a cursor-paginated list response carries besides its rows: "Repeat the
 * above steps until the meta[has_more] property is false", with the next
 * page's cursor in `meta.after_cursor`.
 * https://developer.zendesk.com/api-reference/introduction/pagination/
 */
interface CursorPageResponse {
  meta?: { has_more?: boolean; after_cursor?: string | null }
}

/**
 * The List Users and List Groups sections document `include_boundary_indicators`:
 * "When true, includes has_more indicator in the cursor pagination response
 * meta." Read literally, those two leave `has_more` out unless asked, so their
 * lists ask. (The cursor guide's own `users.json` example reads `has_more`
 * without the flag, so asking may change nothing; it costs nothing either.)
 * No other list this adapter calls documents the flag, and the pagination
 * guide's example shows `has_more` on a plain tickets request.
 * https://developer.zendesk.com/api-reference/ticketing/users/users/#list-users
 * https://developer.zendesk.com/api-reference/ticketing/groups/groups/#list-groups
 */
const WITH_HAS_MORE = { include_boundary_indicators: 'true' }

interface TicketsResponse extends CursorPageResponse { tickets?: RawZendeskTicket[] }
interface TicketResponse  { ticket?: RawZendeskTicket }
interface CommentsResponse extends CursorPageResponse { comments?: RawZendeskComment[] }
interface UsersResponse extends CursorPageResponse { users?: RawZendeskUser[] }
interface UserResponse { user?: RawZendeskUser }
interface GroupsResponse extends CursorPageResponse { groups?: RawZendeskGroup[] }
interface GroupResponse { group?: RawZendeskGroup }
interface TagsResponse extends CursorPageResponse { tags?: RawZendeskTag[] }
interface MacrosResponse extends CursorPageResponse { macros?: RawZendeskMacro[] }
interface MacroResponse { macro?: RawZendeskMacro }

export class ZendeskAdapter implements CustomerSupportAdapter {
  readonly platform = 'zendesk'
  readonly version = '0.1.0'
  /** Every list pages by cursor at the caller's size, up to Zendesk's 100. */
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: ZendeskAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes ?? DEFAULT_SCOPES
  }

  /** The customer's Zendesk subdomain, asked for on the Connect page before the redirect. */
  oauthFields(): CredentialField[] {
    return zendeskOauthFields()
  }

  getAuthUrl(
    state: string,
    overrideScopes?: string[],
    _codeChallenge?: string,
    inputs?: Record<string, string>,
  ): string {
    // Throws "Zendesk subdomain is required" without inputs. It used to build
    // the URL on the literal host `subdomain.zendesk.com`.
    return buildAuthUrl(
      this.clientId,
      this.redirectUri,
      overrideScopes ?? this.scopes,
      state,
      inputs?.['tenantSubdomain'] ?? '',
    )
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    // Reached only when a flow collected no subdomain, which the start routes
    // refuse; throws before any request rather than exchanging on no host.
    return zendeskExchangeCode(code, redirectUri, this.clientId, this.clientSecret, '')
  }

  /** Exchange on the customer's account; the subdomain lands in credentials.extra for the API client. */
  async exchangeCodeWithInputs(
    code: string,
    redirectUri: string,
    inputs: Record<string, string>,
  ): Promise<Credentials> {
    return zendeskExchangeCode(
      code,
      redirectUri,
      this.clientId,
      this.clientSecret,
      inputs['tenantSubdomain'] ?? '',
    )
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return zendeskRefreshCredentials(credentials)
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyZendeskWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseZendeskWebhookEvents(payload)
  }

  private client(credentials: Credentials): ZendeskClient {
    return new ZendeskClient(credentials)
  }

  /**
   * Pager scope for ONE connection: the subdomain plus a fingerprint of this
   * connection's token (`connectionScope`), never the token itself. Two
   * connections to one account can see different rows (an agent's
   * restrictions), so the subdomain alone is not a connection.
   */
  private pagerScope(credentials: Credentials): string {
    const subdomain = String(credentials.extra?.['tenantSubdomain'] ?? '')
    return connectionScope(`zendesk:${subdomain}`, credentials)
  }

  /**
   * One caller page of a cursor-paginated list.
   *
   * Every list used to send `per_page` alone. Zendesk reads a request without
   * `page[size]` as offset pagination ("If you omit the page[size] parameter,
   * offset pagination is used."), and with no `page` that was page 1 every
   * time: a sync re-fetched the first page until its page ceiling, and the
   * `page[after]` passed for an explicit cursor was ignored.
   *
   * Now `page[size]` is the caller's limit, clamped to the documented 100, and
   * the caller's 1-based `page` resolves through the shared cursor pager,
   * which walks `page[after]` = `meta.after_cursor` while `meta.has_more`.
   * The key holds the path (a ticket's comments are their own chain) and
   * every filter plus the size (`role` keeps contacts and agents apart). An
   * explicit `cursor` wins: that caller already holds a position.
   */
  private async cursorList<Res extends CursorPageResponse, T>(
    credentials: Credentials,
    path: string,
    params: QueryParams,
    rowsOf: (res: Res) => T[] | undefined,
    filters: Record<string, string> = {},
  ): Promise<T[]> {
    const client = this.client(credentials)
    const asked =
      typeof params.limit === 'number' && Number.isFinite(params.limit) && params.limit >= 1
        ? Math.floor(params.limit)
        : DEFAULT_PAGE_SIZE
    const size = Math.min(asked, MAX_PAGE_SIZE)
    const query: Record<string, unknown> = { ...filters, 'page[size]': size }
    const fetchPage = async (after: string | undefined) => {
      const res = await client.get<Res>(
        path,
        after === undefined ? query : { ...query, 'page[after]': after },
      )
      const items = rowsOf(res) ?? []
      // `has_more` is the end signal. The last page still carries a cursor
      // ("After you reach the end of the records, you can save the value of
      // next or after_cursor to retrieve new records in the future"), so a
      // cursor alone is not "more". Where `has_more` is missing, a page with
      // rows is followed: at worst one extra, empty request at the end, never
      // a collection cut short and then marked complete. An empty page ends:
      // "Occasionally, you may get an empty record set, where after_cursor,
      // before_cursor, next and prev are null, even though has_more was true
      // in the previous page."
      // https://developer.zendesk.com/documentation/api-basics/pagination/paginating-through-lists-using-cursor-pagination/
      const hasMore = res.meta?.has_more
      const more = typeof hasMore === 'boolean' ? hasMore : items.length > 0
      return { items, next: more ? (res.meta?.after_cursor ?? undefined) : undefined }
    }

    let page: { items: T[]; hasMore: boolean }
    const explicit = params['cursor']
    if (explicit != null && explicit !== '') {
      const res = await fetchPage(String(explicit))
      page = { items: res.items, hasMore: res.next !== undefined }
    } else {
      const key = cursorPagerKey(this.pagerScope(credentials), path, query)
      page = await pageByCursor<T, string>(key, params.page, fetchPage)
    }
    // A direct call past 100 was asked for at 100: judge its page at that size.
    reportUpstreamPage(params, {
      hasMore: page.hasMore,
      ...(size < asked ? { pageSize: size } : {}),
    })
    return page.items
  }

  async listTickets(credentials: Credentials, params: QueryParams): Promise<Ticket[]> {
    const rows = await this.cursorList(
      credentials,
      '/tickets.json',
      params,
      (r: TicketsResponse) => r.tickets,
    )
    return rows.map(transformTicket)
  }

  async getTicket(credentials: Credentials, id: string): Promise<Ticket> {
    const res = await this.client(credentials).get<TicketResponse>(`/tickets/${id}.json`)
    if (!res.ticket) throw new Error(`Zendesk ticket ${id} not found`)
    return transformTicket(res.ticket)
  }

  async listMessages(credentials: Credentials, ticketId: string, params: QueryParams): Promise<Message[]> {
    const rows = await this.cursorList(
      credentials,
      `/tickets/${ticketId}/comments.json`,
      params,
      (r: CommentsResponse) => r.comments,
    )
    return rows.map((c) => transformMessage(c, ticketId))
  }

  async getMessage(_credentials: Credentials, id: string): Promise<Message> {
    throw new Error(`Zendesk comments are ticket-scoped; call listMessages(ticketId). id=${id}`)
  }

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const rows = await this.cursorList(
      credentials,
      '/users.json',
      params,
      (r: UsersResponse) => r.users,
      { role: 'end-user', ...WITH_HAS_MORE },
    )
    return rows.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const res = await this.client(credentials).get<UserResponse>(`/users/${id}.json`)
    if (!res.user) throw new Error(`Zendesk user ${id} not found`)
    return transformContact(res.user)
  }

  async listUsers(credentials: Credentials, params: QueryParams): Promise<User[]> {
    const rows = await this.cursorList(
      credentials,
      '/users.json',
      params,
      (r: UsersResponse) => r.users,
      { role: 'agent', ...WITH_HAS_MORE },
    )
    return rows.map((u) => transformUser(u as unknown as RawZendeskAgent))
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    const res = await this.client(credentials).get<UserResponse>(`/users/${id}.json`)
    if (!res.user) throw new Error(`Zendesk user ${id} not found`)
    return transformUser(res.user as unknown as RawZendeskAgent)
  }

  async listTags(credentials: Credentials, params: QueryParams): Promise<Tag[]> {
    const rows = await this.cursorList(
      credentials,
      '/tags.json',
      params,
      (r: TagsResponse) => r.tags,
    )
    return rows.map(transformTag)
  }

  async getTag(_credentials: Credentials, id: string): Promise<Tag> {
    throw new Error(`Zendesk tags don't have an individual get endpoint. id=${id}`)
  }

  async listTeams(credentials: Credentials, params: QueryParams): Promise<Team[]> {
    const rows = await this.cursorList(
      credentials,
      '/groups.json',
      params,
      (r: GroupsResponse) => r.groups,
      WITH_HAS_MORE,
    )
    return rows.map(transformTeam)
  }

  async getTeam(credentials: Credentials, id: string): Promise<Team> {
    const res = await this.client(credentials).get<GroupResponse>(`/groups/${id}.json`)
    if (!res.group) throw new Error(`Zendesk group ${id} not found`)
    return transformTeam(res.group)
  }

  async listMacros(credentials: Credentials, params: QueryParams): Promise<Macro[]> {
    const rows = await this.cursorList(
      credentials,
      '/macros.json',
      params,
      (r: MacrosResponse) => r.macros,
    )
    return rows.map(transformMacro)
  }

  async getMacro(credentials: Credentials, id: string): Promise<Macro> {
    const res = await this.client(credentials).get<MacroResponse>(`/macros/${id}.json`)
    if (!res.macro) throw new Error(`Zendesk macro ${id} not found`)
    return transformMacro(res.macro)
  }
}
