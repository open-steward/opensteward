/**
 * Sprinklr Service adapter — customer-support vertical.
 *
 * Auth: OAuth 2.0 Authorization Code grant (api3.sprinklr.com/{env}/oauth).
 * Every request requires:
 *   Authorization: Bearer {access_token}
 *   key: {api_key}                         ← stored in credentials.extra.apiKey
 *
 * Supported resources:
 *   - Tickets (cases): POST /api/v1/case/search (ids, offset paged) + GET /api/v2/case/{caseId}
 *   - Messages:        GET /api/v2/case/associated-messages?id= (every id) + POST /api/v2/message/bulk-fetch
 *   - Users (agents):  GET /api/v1/bootstrap/resources?types=ACCESSIBLE_USERS
 *   - Teams (queues):  GET /api/v1/bootstrap/resources?types=CLIENT_QUEUES
 *   - Macros:          GET /api/v1/bootstrap/resources?types=MACROS
 *
 * NOT supported:
 *   - Tags (no dedicated tag API on Sprinklr Service; omitted)
 *   - getContact (501: GET /api/v2/account/{accountId} reads the brand's own
 *     social accounts, not customers)
 *
 * Webhooks: HMAC-SHA256 over raw body; X-Hub-Signature header.
 */
import axios from 'axios'
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
import type { Team } from '../../schema/team'
import type { Macro } from '../../schema/macro'
import type { WebhookEvent } from '../../schema/webhook'

import {
  credentialFields as adapterCredentialFields,
  buildAuthUrl,
  exchangeCode as adapterExchangeCode,
  refreshCredentials as adapterRefreshCredentials,
} from './auth'
import { SprinklrServiceClient } from './client'
import {
  DEFAULT_PAGE_SIZE,
  DEFAULT_SCOPES,
  OAUTH_TOKEN_URL_TEMPLATE,
  DEFAULT_ENV,
} from './constants'
import { verifySprinklrWebhook, parseSprinklrWebhookEvents } from './webhook'

import { transformTicket, type RawSprinklrCase } from './transform/ticket'
import { transformMessage, type RawSprinklrMessage } from './transform/message'
import { transformUser, type RawSprinklrUser } from './transform/user'
import { transformTeam, type RawSprinklrQueue } from './transform/team'
import { transformMacro, type RawSprinklrMacro } from './transform/macro'

export interface SprinklrServiceAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

// ── Internal response shape helpers ─────────────────────────────────────────

/**
 * `POST /api/v1/case/search` response, per the "Example - Response" and
 * "Response Definitions" of https://dev.sprinklr.com/v1-case-search:
 * `searchResults[].universalCaseApiDTO.id` ("Unique caseId in Sprinklr"),
 * `hasMore` ("If true, more data is available within the same time range")
 * and `totalHits` ("The number of total hits").
 */
interface CaseSearchResponse {
  searchResults?: Array<{ universalCaseApiDTO?: { id?: string } }>
  hasMore?: boolean
  totalHits?: number
}

/** `GET /api/v2/case/{caseId}`: `{ "data": { …case… }, "errors": [] }`. */
interface CaseResponse {
  data?: RawSprinklrCase | null
}

/** `GET /api/v2/case/associated-messages?id=`: `"data": [ "<message id>", … ]`. */
interface AssociatedMessagesResponse {
  data?: string[]
}

/** `POST /api/v2/message/bulk-fetch`: `{ "data": [ …message… ], "errors": [] }`. */
interface BulkMessagesResponse {
  data?: RawSprinklrMessage[]
}

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

interface BootstrapResponse<T> {
  /** Resource type → array of resources */
  [key: string]: unknown
  data?: T[]
  result?: T[]
  users?: T[]
  queues?: T[]
  macros?: T[]
}

// ── Adapter class ────────────────────────────────────────────────────────────

export class SprinklrServiceAdapter implements CustomerSupportAdapter {
  readonly platform = 'sprinklr-service'
  readonly version = '0.1.0'

  private readonly config: SprinklrServiceAdapterConfig

  constructor(config: SprinklrServiceAdapterConfig) {
    this.config = config
  }

  credentialFields(): CredentialField[] {
    return adapterCredentialFields()
  }

  // exchangeCredentials is only used for non-OAuth flows; not applicable here
  async exchangeCredentials(_fields: Record<string, string>): Promise<Credentials> {
    throw new Error('sprinklr-service uses OAuth 2.0; call getAuthUrl() + exchangeCode() instead')
  }

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    const env = '' // caller may override via extra; default to production
    return buildAuthUrl(
      this.config.clientId,
      this.config.redirectUri,
      overrideScopes ?? this.config.scopes ?? DEFAULT_SCOPES,
      state,
      env,
    )
  }

  async exchangeCode(
    code: string,
    redirectUri: string,
    extra?: Record<string, string>,
  ): Promise<Credentials> {
    const env = extra?.['env'] ?? DEFAULT_ENV
    const apiKey = extra?.['apiKey'] ?? ''
    return adapterExchangeCode(
      code,
      redirectUri,
      this.config.clientId,
      this.config.clientSecret,
      apiKey,
      env,
    )
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return adapterRefreshCredentials(credentials, this.config.clientId, this.config.clientSecret)
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifySprinklrWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseSprinklrWebhookEvents(payload)
  }

  private client(credentials: Credentials): SprinklrServiceClient {
    return new SprinklrServiceClient(credentials)
  }

  // ── Tickets (Cases) ────────────────────────────────────────────────────────

  /**
   * "POST v1 Case Search" (https://dev.sprinklr.com/v1-case-search):
   * `POST /api/v1/case/search` with the required `query`, `filters`,
   * `paginationInfo` and `channelType` ("Channel type will always remain
   * SPRINKLR"). The filter is the page's example filter verbatim.
   * `paginationInfo.start` ("the start offset", default 0) and `rows` ("The
   * number of rows to fetch, starting from the configured start offset") page
   * by offset; `sortKey` is `caseCreationTime`, a field named in the page's
   * field list, so rows do not move between pages as cases are modified.
   *
   * The search result DTO documents no case status, which the canonical
   * Ticket requires, so each case on the page is read through
   * `GET /api/v2/case/{caseId}` (https://dev.sprinklr.com/read-case-by-case-id).
   */
  async listTickets(credentials: Credentials, params: QueryParams): Promise<Ticket[]> {
    const rows = params.limit ?? DEFAULT_PAGE_SIZE
    const client = this.client(credentials)
    const res = await client.postV1<CaseSearchResponse>('/case/search', {
      query: '',
      filters: [{ filterType: 'IN', field: 'channelType', values: ['SPRINKLR'] }],
      paginationInfo: { start: pageOffset(params, rows), rows, sortKey: 'caseCreationTime' },
      channelType: 'SPRINKLR',
    })
    if (!Array.isArray(res.searchResults)) {
      throw new Error('Sprinklr case search response has no searchResults')
    }
    const ids = res.searchResults.map((r, i) => {
      const id = r.universalCaseApiDTO?.id
      if (!id) throw new Error(`Sprinklr case search result ${i} has no universalCaseApiDTO.id`)
      return id
    })
    reportUpstreamPage(params, {
      ...(typeof res.hasMore === 'boolean' ? { hasMore: res.hasMore } : {}),
      ...(typeof res.totalHits === 'number' ? { totalCount: res.totalHits } : {}),
    })
    const tickets: Ticket[] = []
    for (const id of ids) tickets.push(await this.readCase(client, id))
    return tickets
  }

  async getTicket(credentials: Credentials, id: string): Promise<Ticket> {
    return this.readCase(this.client(credentials), id)
  }

  private async readCase(client: SprinklrServiceClient, id: string): Promise<Ticket> {
    const res = await client.get<CaseResponse>(`/case/${encodeURIComponent(id)}`)
    if (!res.data) throw new Error(`Sprinklr Service case ${id} not found`)
    return transformTicket(res.data)
  }

  // ── Messages ───────────────────────────────────────────────────────────────

  /**
   * "GET - Case Associated Messages" (https://dev.sprinklr.com/case-associated-messages):
   * `GET /api/v2/case/associated-messages?id={case_id}` returns "all the
   * message Ids associated with the case so far" and takes no paging
   * parameter, so the caller's page is cut from that id list. "Once you have
   * the message Ids, you can call … Read Messages (Bulk) API", which is
   * `POST /api/v2/message/bulk-fetch` with the page's ids as the JSON array
   * body (https://dev.sprinklr.com/read-messages-bulk).
   */
  async listMessages(
    credentials: Credentials,
    ticketId: string,
    params: QueryParams,
  ): Promise<Message[]> {
    const client = this.client(credentials)
    const assoc = await client.get<AssociatedMessagesResponse>('/case/associated-messages', {
      id: ticketId,
    })
    if (!Array.isArray(assoc.data)) {
      throw new Error(`Sprinklr case ${ticketId} associated-messages response has no data array`)
    }
    const pageIds = pageLocally(assoc.data, params)
    if (pageIds.length === 0) return []
    const res = await client.post<BulkMessagesResponse>('/message/bulk-fetch', pageIds)
    if (!Array.isArray(res.data)) {
      throw new Error('Sprinklr message bulk-fetch response has no data array')
    }
    const byId = new Map(res.data.map((m) => [m.messageId, m]))
    const missing = pageIds.filter((mid) => !byId.has(mid))
    if (missing.length > 0) {
      // A short page would read as a complete one; fail instead.
      throw new Error(
        `Sprinklr message bulk-fetch returned no message for ${missing.length} of ${pageIds.length} ids: ${missing.join(', ')}`,
      )
    }
    return pageIds.map((mid) => transformMessage(byId.get(mid)!, ticketId))
  }

  async getMessage(_credentials: Credentials, id: string): Promise<Message> {
    throw new Error(
      `Sprinklr Service messages are case-scoped; call listMessages(caseId). id=${id}`,
    )
  }

  // ── Contacts ───────────────────────────────────────────────────────────────

  async listContacts(_credentials: Credentials, _params: QueryParams): Promise<Contact[]> {
    // Sprinklr does not expose a paginated contacts list endpoint;
    // contacts are accessed individually via account ID from case data.
    return []
  }

  async getContact(_credentials: Credentials, _id: string): Promise<Contact> {
    // The endpoint this used, GET /api/v2/account/{accountId}, is documented as
    // "An Account refers to a social network account that has been added and
    // authorized within Sprinklr": the brand's own accounts, not its customers.
    throw notSupported(
      'Sprinklr Service getContact is not implemented: GET /api/v2/account/{accountId} reads ' +
        '"a social network account that has been added and authorized within Sprinklr", not a customer; ' +
        'the customer read (GET /api/v2/profile/{profileId}, "Find unified profile by Profile Id") is not mapped yet',
    )
  }

  // ── Users (agents) ─────────────────────────────────────────────────────────

  async listUsers(credentials: Credentials, params: QueryParams): Promise<User[]> {
    const res = await this.client(credentials).getV1<BootstrapResponse<RawSprinklrUser>>(
      '/bootstrap/resources',
      { types: 'ACCESSIBLE_USERS' },
    )
    // Response shape: { ACCESSIBLE_USERS: [...] } or { data: [...] }
    const usersArr = ((res['ACCESSIBLE_USERS'] as RawSprinklrUser[] | undefined) ??
      res.users ??
      res.data ??
      res.result ??
      []) as RawSprinklrUser[]
    // bootstrap/resources takes only `types` and returns the whole list.
    return pageLocally(usersArr, params).map(transformUser)
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    // Bootstrap resources don't have a single-user endpoint;
    // fetch all and filter. In practice callers use listUsers().
    const all = await this.listUsers(credentials, {})
    const found = all.find((u) => u.id === id)
    if (!found) throw new Error(`Sprinklr Service user ${id} not found`)
    return found
  }

  // ── Teams (queues) ─────────────────────────────────────────────────────────

  async listTeams(credentials: Credentials, params: QueryParams): Promise<Team[]> {
    const res = await this.client(credentials).getV1<BootstrapResponse<RawSprinklrQueue>>(
      '/bootstrap/resources',
      { types: 'CLIENT_QUEUES' },
    )
    const queuesArr = ((res['CLIENT_QUEUES'] as RawSprinklrQueue[] | undefined) ??
      res.queues ??
      res.data ??
      res.result ??
      []) as RawSprinklrQueue[]
    // bootstrap/resources takes only `types` and returns the whole list.
    return pageLocally(queuesArr, params).map(transformTeam)
  }

  async getTeam(credentials: Credentials, id: string): Promise<Team> {
    const all = await this.listTeams(credentials, {})
    const found = all.find((t) => t.id === id)
    if (!found) throw new Error(`Sprinklr Service queue (team) ${id} not found`)
    return found
  }

  // ── Macros ─────────────────────────────────────────────────────────────────

  async listMacros(credentials: Credentials, params: QueryParams): Promise<Macro[]> {
    const res = await this.client(credentials).getV1<BootstrapResponse<RawSprinklrMacro>>(
      '/bootstrap/resources',
      { types: 'MACROS' },
    )
    const macrosArr = ((res['MACROS'] as RawSprinklrMacro[] | undefined) ??
      res.macros ??
      res.data ??
      res.result ??
      []) as RawSprinklrMacro[]
    // bootstrap/resources takes only `types` and returns the whole list.
    return pageLocally(macrosArr, params).map(transformMacro)
  }

  async getMacro(credentials: Credentials, id: string): Promise<Macro> {
    const all = await this.listMacros(credentials, {})
    const found = all.find((m) => m.id === id)
    if (!found) throw new Error(`Sprinklr Service macro ${id} not found`)
    return found
  }
}

// ── Re-export token URL resolver for use by auth module ─────────────────────
// (allows the adapter registry to refresh tokens without importing auth directly)
export async function refreshTokenDirect(
  refreshToken: string,
  clientId: string,
  clientSecret: string,
  apiKey: string,
  env: string = DEFAULT_ENV,
): Promise<{ access_token: string; refresh_token?: string; expires_in?: number }> {
  const envSegment = env ? `/${env}` : ''
  const tokenUrl = OAUTH_TOKEN_URL_TEMPLATE.replace('/{env}', envSegment)
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
  })
  const { data } = await axios.post(tokenUrl, params.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  })
  return data as { access_token: string; refresh_token?: string; expires_in?: number }
}
