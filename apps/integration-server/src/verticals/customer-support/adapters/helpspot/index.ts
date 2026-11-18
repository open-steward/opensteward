/**
 * HelpSpot adapter for the customer-support vertical.
 *
 * HelpSpot is self-hosted help desk software. Each installation has its own
 * base URL; credentials include baseUrl + API key.
 *
 * Auth: Bearer API key (Authorization: Bearer <key>).
 * API:  <baseUrl>/api/index.php?method=<method>&output=json
 * Pagination: only private.request.search pages, by `start` ("Result sets
 *   should start from this row, defaults to 0. Use this to paginate results in
 *   methods which support it.") and `length` ("Number of results to return in
 *   a result set."), per https://support.helpspot.com/index.php?pg=kb.page&id=157.
 *   No count or next marker comes back, so a short page is the only end signal.
 *   The other list methods take no paging parameters and return the whole
 *   collection ("Retreives all contacts", "Return all currently active staff",
 *   "Returns a list of all categories", "Return all your responses", and a
 *   request's full request_history), so they are paged locally.
 *
 * Resources supported:
 *   - Tickets   (private.request.search / private.request.get)
 *   - Messages  (history items embedded in private.request.get)
 *   - Contacts  (private.addressbook.getContacts)
 *   - Users     (private.util.getActiveStaff)
 *   - Teams     (private.request.getCategories — categories map to teams)
 *   - Macros    (private.response.listAll / private.response.get)
 *
 * Not supported (no documented endpoint):
 *   - Tags  (reporting tags exist but have no dedicated list endpoint;
 *            they appear inline on requests)
 *
 * Webhooks: HelpSpot sends webhooks via automation rules. No documented
 *   HMAC signature verification — verifyWebhook and parseWebhookEvents
 *   are not implemented.
 */
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

import {
  credentialFields as adapterCredentialFields,
  exchangeCredentials as adapterExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import { HelpspotClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'

import { transformTicket, type RawHelpspotRequest } from './transform/ticket'
import { transformMessage, type RawHelpspotHistoryItem } from './transform/message'
import { transformContact, type RawHelpspotContact } from './transform/contact'
import { transformUser, type RawHelpspotStaff } from './transform/user'
import { transformTeam, type RawHelpspotCategory } from './transform/team'
import { transformMacro, type RawHelpspotResponse } from './transform/macro'

// ── API response envelopes ───────────────────────────────────────────────────

/**
 * private.request.search returns an object with numeric keys ("0", "1", …)
 * or an array, plus pagination metadata.
 */
interface SearchResponse {
  [key: string]: unknown
  totalCount?: number | string
}

/**
 * private.request.get returns a flat object with request fields plus a
 * `request_history` array.
 */
interface RequestResponse extends RawHelpspotRequest {
  request_history?: RawHelpspotHistoryItem[]
}

interface StaffResponse {
  [key: string]: RawHelpspotStaff | unknown
}

interface ContactsResponse {
  [key: string]: RawHelpspotContact | unknown
}

interface CategoriesResponse {
  [key: string]: RawHelpspotCategory | unknown
}

interface ResponsesListResponse {
  [key: string]: RawHelpspotResponse | unknown
}

// ── Adapter config ───────────────────────────────────────────────────────────

export interface HelpspotAdapterConfig {
  // No OAuth client credentials needed — API key only.
  // Config object kept for structural parity with other adapters.
  [key: string]: unknown
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * HelpSpot returns JSON objects with numeric keys ("0", "1", …) when the
 * result is a list. Extract those into a typed array.
 */
function extractList<T>(obj: Record<string, unknown>): T[] {
  const results: T[] = []
  for (const key of Object.keys(obj)) {
    if (/^\d+$/.test(key)) {
      const item = obj[key]
      if (item && typeof item === 'object') results.push(item as T)
    }
  }
  return results
}

// ── Adapter ──────────────────────────────────────────────────────────────────

export class HelpspotAdapter implements CustomerSupportAdapter {
  readonly platform = 'helpspot'
  readonly version = '0.1.0'

  constructor(_config?: HelpspotAdapterConfig) {}

  credentialFields(): CredentialField[] {
    return adapterCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return adapterExchangeCredentials(fields)
  }

  getAuthUrl(_state: string, _overrideScopes?: string[]): string {
    return getAuthUrlUnsupported()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('HelpSpot uses API key auth; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  private client(credentials: Credentials): HelpspotClient {
    return new HelpspotClient(credentials)
  }

  /**
   * `start` + `length` for the caller's 1-based `page` at its `limit`. HelpSpot
   * documents no maximum for `length`, so none is declared or applied here.
   */
  private pageParams(params: QueryParams): { start: number; length: number } {
    const length = params.limit ?? DEFAULT_PAGE_SIZE
    return { start: pageOffset(params, length), length }
  }

  // ── Tickets ────────────────────────────────────────────────────────────────

  async listTickets(credentials: Credentials, params: QueryParams): Promise<Ticket[]> {
    const paging = this.pageParams(params)
    const res = await this.client(credentials).query<SearchResponse>(
      'private.request.search',
      // No default order is documented for search; an explicit stable order keeps offset
      // pages from skipping or repeating rows (orderBy/orderByDir are documented params).
      { ...paging, fOpen: 1, orderBy: 'xRequest', orderByDir: 'asc' },
    )
    const items = extractList<RawHelpspotRequest>(res as Record<string, unknown>)
    // No total or next marker is returned: only a short page is known to be the last.
    if (items.length < paging.length) reportUpstreamPage(params, { hasMore: false })
    return items.map(transformTicket)
  }

  async getTicket(credentials: Credentials, id: string): Promise<Ticket> {
    const res = await this.client(credentials).query<RequestResponse>(
      'private.request.get',
      { xRequest: id },
    )
    if (!res.xRequest) throw new Error(`HelpSpot request ${id} not found`)
    return transformTicket(res)
  }

  // ── Messages ───────────────────────────────────────────────────────────────

  async listMessages(credentials: Credentials, ticketId: string, params: QueryParams): Promise<Message[]> {
    const res = await this.client(credentials).query<RequestResponse>(
      'private.request.get',
      { xRequest: ticketId },
    )
    const history = res.request_history ?? []
    // The whole request_history comes back at once; page it here.
    return pageLocally(
      history.map((item, idx) => transformMessage(item, ticketId, idx)),
      params,
    )
  }

  async getMessage(_credentials: Credentials, id: string): Promise<Message> {
    throw new Error(`HelpSpot history items are request-scoped; call listMessages(ticketId). id=${id}`)
  }

  // ── Contacts ───────────────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    // "Parameters: none" — every contact comes back in one response.
    const res = await this.client(credentials).query<ContactsResponse>(
      'private.addressbook.getContacts',
      {},
    )
    const items = extractList<RawHelpspotContact>(res as Record<string, unknown>)
    return pageLocally(items.map(transformContact), params)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    // HelpSpot has no single-contact endpoint; search address book by looking
    // for the item in a full list and matching by xContact.
    const res = await this.client(credentials).query<ContactsResponse>(
      'private.addressbook.getContacts',
      {},
    )
    const items = extractList<RawHelpspotContact>(res as Record<string, unknown>)
    const found = items.find((c) => String(c.xContact) === id || String(c.sEmail) === id)
    if (!found) throw new Error(`HelpSpot contact ${id} not found`)
    return transformContact(found)
  }

  // ── Users (staff) ──────────────────────────────────────────────────────────

  async listUsers(credentials: Credentials, params: QueryParams): Promise<User[]> {
    const res = await this.client(credentials).query<StaffResponse>(
      'private.util.getActiveStaff',
      {},
    )
    const items = extractList<RawHelpspotStaff>(res as Record<string, unknown>)
    return pageLocally(items.map(transformUser), params)
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    const res = await this.client(credentials).query<StaffResponse>(
      'private.util.getActiveStaff',
      {},
    )
    const items = extractList<RawHelpspotStaff>(res as Record<string, unknown>)
    const found = items.find((u) => String(u.xPerson) === id)
    if (!found) throw new Error(`HelpSpot staff member ${id} not found`)
    return transformUser(found)
  }

  // ── Teams (categories) ─────────────────────────────────────────────────────

  async listTeams(credentials: Credentials, params: QueryParams): Promise<Team[]> {
    const res = await this.client(credentials).query<CategoriesResponse>(
      'private.request.getCategories',
      {},
    )
    const items = extractList<RawHelpspotCategory>(res as Record<string, unknown>)
    return pageLocally(items.map(transformTeam), params)
  }

  async getTeam(credentials: Credentials, id: string): Promise<Team> {
    const res = await this.client(credentials).query<CategoriesResponse>(
      'private.request.getCategories',
      {},
    )
    const items = extractList<RawHelpspotCategory>(res as Record<string, unknown>)
    const found = items.find((c) => String(c.xCategory) === id)
    if (!found) throw new Error(`HelpSpot category ${id} not found`)
    return transformTeam(found)
  }

  // ── Macros (saved replies) ─────────────────────────────────────────────────

  async listMacros(credentials: Credentials, params: QueryParams): Promise<Macro[]> {
    const res = await this.client(credentials).query<ResponsesListResponse>(
      'private.response.listAll',
      {},
    )
    const items = extractList<RawHelpspotResponse>(res as Record<string, unknown>)
    return pageLocally(items.map(transformMacro), params)
  }

  async getMacro(credentials: Credentials, id: string): Promise<Macro> {
    const res = await this.client(credentials).query<RawHelpspotResponse>(
      'private.response.get',
      { xResponse: id },
    )
    if (!res.xResponse) throw new Error(`HelpSpot saved reply ${id} not found`)
    return transformMacro(res)
  }
}
