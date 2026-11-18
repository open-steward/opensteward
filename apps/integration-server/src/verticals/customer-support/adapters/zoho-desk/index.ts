/**
 * Zoho Desk adapter: OAuth 2.0 on the customer's data centre, Desk API v1.
 *
 * API reference: https://desk.zoho.com/DeskAPIDocument (fetched 2026-09-28),
 * with the published OpenAPI files at https://github.com/zoho/zohodesk-oas
 * for parameter bounds.
 *
 * Reads:
 *   tickets   GET /tickets, GET /tickets/{id}; with `updated_after`,
 *             GET /tickets/search?modifiedTimeRange=...
 *   messages  GET /tickets/{id}/conversations (threads and comments)
 *   contacts  GET /contacts, GET /contacts/{id}; with `updated_after`,
 *             GET /contacts/search?modifiedTimeRange=...
 *   users     GET /agents, GET /agents/{id}
 *   teams     GET /teams, GET /teams/{id}
 *
 * Refused with 501 NOT_SUPPORTED, before any request:
 *   getMessage  threads and comments are addressed under their ticket
 *               (/tickets/{ticket_id}/threads/{thread_id}), and a bare id
 *               names no ticket.
 *   listTags    GET /ticketTags needs a `departmentId` ("required"), so no
 *               request lists the organization's tags.
 *   getTag      no GET /tags/{tag_id} is documented (only PUT and DELETE).
 *   list/getMacro  Zoho Desk documents no macro resource.
 *
 * Paging: every list pages by offset. `from` is the 0-based row index and
 * `limit` the size ("Pagination in listing APIs is made possible by two
 * parameters: from and limit"). The per-endpoint bounds say 0-based: GET
 * /agents and /tickets/{id}/conversations "range : >=0", GET /teams
 * "Zero-based index number", GET /tickets/search "starts from 0", and the
 * OpenAPI file gives GET /tickets `from` "default": 0. (The general
 * Pagination section says the default of `from` is 1; the per-endpoint docs
 * are followed.) Lists return no total and no has-more flag. Search returns
 * `count` of undocumented meaning (see searchModified). A short page is
 * reported as the last one; a full page's continuation is left unknown.
 *
 * `updated_after` is applied server-side on tickets and contacts (search).
 * GET /agents and GET /teams document no modified-time filter, so there it
 * is ignored and the whole list is served.
 */
import {
  DEFAULT_PAGE_LIMIT,
  pageOffset,
  reportUpstreamPage,
  type Credentials,
  type CredentialField,
  type QueryParams,
  type UpstreamPageMeta,
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

import { buildAuthUrl, exchangeCode, refreshAccessToken } from './auth'
import { ZohoDeskClient } from './client'
import { DEFAULT_SCOPES, MAX_PAGE_SIZE, SEARCH_MAX_FROM, ZOHO_DESK_DATA_CENTRES } from './constants'
import { verifyZohoDeskWebhook, parseZohoDeskWebhookEvents } from './webhook'

import { transformTicket, type RawZohoDeskTicket } from './transform/ticket'
import { transformMessage, type RawZohoDeskConversation } from './transform/message'
import { transformContact, type RawZohoDeskContact } from './transform/contact'
import { transformUser, type RawZohoDeskAgent } from './transform/user'
import { transformTeam, type RawZohoDeskTeam } from './transform/team'

export interface ZohoDeskAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

/** List responses: "a key called data and a JSON array of resources". */
interface DataPage<T> {
  data?: T[]
}
/** Search responses add `"count" : 1` (meaning undocumented; see searchModified). */
interface SearchPage<T> extends DataPage<T> {
  count?: number | string
}
/** GET /teams is the exception: its rows are under `teams`. */
interface TeamsPage {
  teams?: RawZohoDeskTeam[]
}

export class ZohoDeskAdapter implements CustomerSupportAdapter {
  readonly platform = 'zoho-desk'
  readonly version = '0.2.0'
  /** The shared list ceiling; see MAX_PAGE_SIZE. */
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: ZohoDeskAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes ?? DEFAULT_SCOPES
  }

  /** The customer's data centre hosts both the accounts server and the Desk API. */
  oauthFields(): CredentialField[] {
    return [
      {
        name: 'dataCentre',
        label: 'Zoho data centre',
        type: 'select',
        required: true,
        helpText: 'The Zoho domain you sign in at, e.g. desk.zoho.eu means Europe.',
        options: Object.entries(ZOHO_DESK_DATA_CENTRES).map(([value, dc]) => ({
          value,
          label: dc.label,
        })),
      },
    ]
  }

  getAuthUrl(
    state: string,
    overrideScopes?: string[],
    _codeChallenge?: string,
    inputs?: Record<string, string>,
  ): string {
    // Throws "Zoho data centre is required" without inputs: there is no
    // deployment-wide default to fall back on.
    return buildAuthUrl(
      this.clientId,
      this.redirectUri,
      overrideScopes ?? this.scopes,
      state,
      inputs?.['dataCentre'],
    )
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    // Reached only by a flow that collected no data centre; throws before
    // any request rather than sending the client secret to a guessed host.
    return exchangeCode(code, this.clientId, this.clientSecret, redirectUri, undefined)
  }

  /** Exchange on the customer's accounts server; records data centre and orgId. */
  async exchangeCodeWithInputs(
    code: string,
    redirectUri: string,
    inputs: Record<string, string>,
  ): Promise<Credentials> {
    return exchangeCode(code, this.clientId, this.clientSecret, redirectUri, inputs['dataCentre'])
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    if (!credentials.refreshToken) throw new Error('No refresh token available')
    const dataCentre = credentials.extra?.['dataCentre']
    const creds = await refreshAccessToken(
      credentials.refreshToken,
      this.clientId,
      this.clientSecret,
      typeof dataCentre === 'string' ? dataCentre : undefined,
    )
    creds.tenantId = credentials.tenantId
    creds.extra = { ...(credentials.extra ?? {}) }
    // The refresh runner stores exactly what this returns, and the webhook
    // verifier reads the Zoho webhookId from `webhookSecret` (see webhook.ts),
    // so dropping it here would turn webhooks off at the first token refresh.
    if (credentials.webhookSecret) creds.webhookSecret = credentials.webhookSecret
    return creds
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyZohoDeskWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseZohoDeskWebhookEvents(payload)
  }

  private client(credentials: Credentials): ZohoDeskClient {
    return new ZohoDeskClient(credentials)
  }

  /** The caller's limit clamped to the documented ceiling, and what was asked. */
  private pageSize(params: QueryParams): { size: number; asked: number } {
    const asked =
      typeof params.limit === 'number' && Number.isFinite(params.limit) && params.limit >= 1
        ? Math.floor(params.limit)
        : DEFAULT_PAGE_LIMIT
    return { size: Math.min(asked, MAX_PAGE_SIZE), asked }
  }

  /**
   * One caller page of an offset list: `from` = the 0-based row offset of the
   * caller's page at the size actually sent, `limit` = that size. The API
   * reports no total here, so only a short page is reported, as the end.
   */
  private async offsetList<T>(
    credentials: Credentials,
    path: string,
    params: QueryParams,
    rowsOf: (body: unknown) => T[] | undefined,
    filters: Record<string, string> = {},
  ): Promise<T[]> {
    const { size, asked } = this.pageSize(params)
    const body = await this.client(credentials).get<unknown>(path, {
      ...filters,
      from: pageOffset(params, size),
      limit: size,
    })
    const rows = (body === undefined ? undefined : rowsOf(body)) ?? []
    const meta: UpstreamPageMeta = size < asked ? { pageSize: size } : {}
    if (rows.length < size) meta.hasMore = false
    reportUpstreamPage(params, meta)
    return rows
  }

  /**
   * Rows modified at or after `updated_after`, through a search endpoint
   * (GET /tickets/search or /contacts/search): "modifiedTimeRange: Key that
   * filters tickets [contacts] modified in a particular period of time. Enter
   * the from and to dates in the ISO date format of yyyy-MM-ddThh:mm:ss.SSSZ",
   * sorted by `modifiedTime` ascending ("For ascending order:
   * sortBy=modifiedTime"). The plain lists have no modified-time filter.
   *
   * Search's `from` stops at 4999 ("range : 0-4999"; "Each search can
   * return up to 5,000 resources"): a page that would start past it is
   * refused before any request rather than served empty and reported
   * complete.
   *
   * Search responses carry `count`, but the reference never says whether it
   * counts every match or only this page's rows (its examples have one row
   * and `"count" : 1`). So it is not reported as `totalCount`. It is read
   * only one way that holds under both meanings: a count beyond the rows
   * served so far means more rows exist. A short page is the end; a full page
   * otherwise leaves the end unknown.
   */
  private async searchModified<T>(
    credentials: Credentials,
    path: string,
    params: QueryParams,
    since: Date,
  ): Promise<T[]> {
    const { size, asked } = this.pageSize(params)
    const from = pageOffset(params, size)
    if (from > SEARCH_MAX_FROM) {
      throw notSupported(
        `Zoho Desk search serves the first ${SEARCH_MAX_FROM + 1} matches only ("from" range 0-${SEARCH_MAX_FROM}); ` +
          'narrow updated_after to reach later rows.',
      )
    }
    const res = await this.client(credentials).get<SearchPage<T>>(path, {
      modifiedTimeRange: `${since.toISOString()},${new Date().toISOString()}`,
      sortBy: 'modifiedTime',
      from,
      limit: size,
    })
    const rows = res?.data ?? []
    const count = Number(res?.count)
    const meta: UpstreamPageMeta = size < asked ? { pageSize: size } : {}
    if (rows.length < size) meta.hasMore = false
    else if (Number.isFinite(count) && from + rows.length < count) meta.hasMore = true
    reportUpstreamPage(params, meta)
    return rows
  }

  private static updatedAfter(params: QueryParams): Date | undefined {
    const d = params.updatedAfter
    return d instanceof Date && !Number.isNaN(d.getTime()) ? d : undefined
  }

  async listTickets(credentials: Credentials, params: QueryParams): Promise<Ticket[]> {
    const since = ZohoDeskAdapter.updatedAfter(params)
    if (since) {
      const rows = await this.searchModified<RawZohoDeskTicket>(
        credentials,
        '/tickets/search',
        params,
        since,
      )
      return rows.map(transformTicket)
    }
    // "sortBy ... Possible values for sorting: responseDueDate,
    // customerResponseTime, createdTime" (ascending by default): a fixed
    // order keeps offsets stable between pages.
    const rows = await this.offsetList(
      credentials,
      '/tickets',
      params,
      (b) => (b as DataPage<RawZohoDeskTicket>).data,
      { sortBy: 'createdTime' },
    )
    return rows.map(transformTicket)
  }

  async getTicket(credentials: Credentials, id: string): Promise<Ticket> {
    const res = await this.client(credentials).get<RawZohoDeskTicket>(
      `/tickets/${encodeURIComponent(id)}`,
    )
    if (!res) throw new Error(`Zoho Desk ticket ${id} not found`)
    return transformTicket(res)
  }

  async listMessages(
    credentials: Credentials,
    ticketId: string,
    params: QueryParams,
  ): Promise<Message[]> {
    const rows = await this.offsetList(
      credentials,
      `/tickets/${encodeURIComponent(ticketId)}/conversations`,
      params,
      (b) => (b as DataPage<RawZohoDeskConversation>).data,
    )
    return rows.map((c) => transformMessage(c, ticketId))
  }

  async getMessage(_credentials: Credentials, id: string): Promise<Message> {
    throw notSupported(
      `Zoho Desk threads and comments are fetched under their ticket (/tickets/{ticket_id}/threads/{thread_id}); a bare id names no ticket. Use listMessages(ticketId). id=${id}`,
    )
  }

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const since = ZohoDeskAdapter.updatedAfter(params)
    if (since) {
      // GET /contacts/search: "modifiedTimeRange ... Key that filters contacts
      // modified in a particular period of time"; sortBy "can be: relevance,
      // modifiedTime, createdTime, lastName, firstName".
      const rows = await this.searchModified<RawZohoDeskContact>(
        credentials,
        '/contacts/search',
        params,
        since,
      )
      return rows.map(transformContact)
    }
    // "sortBy: Sort by a specific attribute: firstName, lastName, or createdTime."
    const rows = await this.offsetList(
      credentials,
      '/contacts',
      params,
      (b) => (b as DataPage<RawZohoDeskContact>).data,
      { sortBy: 'createdTime' },
    )
    return rows.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const res = await this.client(credentials).get<RawZohoDeskContact>(
      `/contacts/${encodeURIComponent(id)}`,
    )
    if (!res) throw new Error(`Zoho Desk contact ${id} not found`)
    return transformContact(res)
  }

  async listUsers(credentials: Credentials, params: QueryParams): Promise<User[]> {
    const rows = await this.offsetList(
      credentials,
      '/agents',
      params,
      (b) => (b as DataPage<RawZohoDeskAgent>).data,
    )
    return rows.map(transformUser)
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    const res = await this.client(credentials).get<RawZohoDeskAgent>(
      `/agents/${encodeURIComponent(id)}`,
    )
    if (!res) throw new Error(`Zoho Desk agent ${id} not found`)
    return transformUser(res)
  }

  async listTeams(credentials: Credentials, params: QueryParams): Promise<Team[]> {
    // "List teams from all associated departments". A limit of 0 means "all
    // teams with no upper bound", which pageSize never sends (it is >= 1).
    const rows = await this.offsetList(credentials, '/teams', params, (b) => (b as TeamsPage).teams)
    return rows.map(transformTeam)
  }

  async getTeam(credentials: Credentials, id: string): Promise<Team> {
    const res = await this.client(credentials).get<RawZohoDeskTeam>(
      `/teams/${encodeURIComponent(id)}`,
    )
    if (!res) throw new Error(`Zoho Desk team ${id} not found`)
    return transformTeam(res)
  }

  async listTags(_credentials: Credentials, _params: QueryParams): Promise<Tag[]> {
    throw notSupported(
      'Zoho Desk lists ticket tags per department only (GET /ticketTags: "departmentId ... required"); no request lists every tag.',
    )
  }

  async getTag(_credentials: Credentials, id: string): Promise<Tag> {
    throw notSupported(`Zoho Desk documents no GET /tags/{tag_id} (only PUT and DELETE). id=${id}`)
  }

  async listMacros(_credentials: Credentials, _params: QueryParams): Promise<Macro[]> {
    throw notSupported('Zoho Desk documents no macro resource.')
  }

  async getMacro(_credentials: Credentials, id: string): Promise<Macro> {
    throw notSupported(`Zoho Desk documents no macro resource. id=${id}`)
  }
}
