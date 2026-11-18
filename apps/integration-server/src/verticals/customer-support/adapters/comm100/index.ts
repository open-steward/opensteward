/**
 * Comm100 adapter for the customer-support vertical, on the Server API v4
 * (https://developer.comm100.com/docs/server-api-introduction):
 *   - Ticketing tickets   → Tickets   (GET ticketing/tickets)
 *   - Ticket messages     → Messages  (GET ticketing/tickets/{id}/messages)
 *   - Contacts            → Contacts  (GET contact/contacts)
 *   - Agents              → Users     (GET global/agents)
 *   - Ticketing tags      → Tags      (GET ticketing/tags)
 *   - Departments         → Teams     (GET global/departments)
 *
 * Auth: HTTP Basic with the agent's email and API key, plus `siteId` on every
 * request; host api{n}.comm100.io/v4/ for Control Panel domain
 * dash{n}.comm100.io. See ./auth.ts and ./client.ts.
 *
 * Macros: no canned-message endpoint is used here (auto-501).
 */
import {
  connectionScope,
  cursorPagerKey,
  pageByRows,
  pageLocally,
  reportUpstreamPage,
  DEFAULT_PAGE_LIMIT,
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
import { Comm100Client, comm100Connection } from './client'
import { CONTACTS_DEFAULT_PAGE_SIZE, CONTACTS_MAX_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformTicket, type RawComm100Ticket } from './transform/ticket'
import { transformMessage, type RawComm100Message } from './transform/message'
import { transformContact, type RawComm100Contact } from './transform/contact'
import { transformUser, type RawComm100Agent } from './transform/user'
import { transformTeam, type RawComm100Department } from './transform/team'
import { transformTag, type RawComm100Tag } from './transform/tag'

export interface Comm100AdapterConfig {
  clientId?: string
  clientSecret?: string
  redirectUri?: string
  scopes?: string[]
}

/**
 * The paging envelope. https://developer.comm100.com/docs/server-api-introduction,
 * Pagination & Sorting, Response: "nextPage ... URL of the next page, if there
 * is no next page, show null." / "total ... Total count of the list."
 */
interface PagedEnvelope {
  nextPage?: unknown
  previousPage?: unknown
  total?: number
}

/** GET ticketing/tickets: `{ "tickets": [...], "nextPage": null, "previousPage": null, "total": 1 }`. */
interface TicketsResponse extends PagedEnvelope {
  tickets?: RawComm100Ticket[]
}

/** GET contact/contacts: `{ "contacts": [...], "previousPage": null, "nextPage": null, "total": 1 }`. */
interface ContactsResponse extends PagedEnvelope {
  contacts?: RawComm100Contact[]
}

function hasNextPage(res: PagedEnvelope): boolean {
  return res.nextPage !== null && res.nextPage !== undefined && res.nextPage !== ''
}

function callerPage(params: QueryParams): number {
  const p = params.page
  return typeof p === 'number' && Number.isFinite(p) && p >= 1 ? Math.floor(p) : 1
}

function callerLimit(params: QueryParams, fallback: number): number {
  const l = params.limit
  return typeof l === 'number' && Number.isFinite(l) && l >= 1 ? Math.floor(l) : fallback
}

/**
 * The rows of a documented bare-array response. A body that is not an array
 * holds no rows of this list.
 */
function asArray<T>(res: unknown): T[] {
  return Array.isArray(res) ? (res as T[]) : []
}

export class Comm100Adapter implements CustomerSupportAdapter {
  readonly platform = 'comm100'
  readonly version = '0.2.0'

  /** Contacts' documented pageSize ceiling (500); see ./constants.ts. */
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  constructor(_config: Comm100AdapterConfig = {}) {}

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
    throw new Error('comm100 uses API-key authentication; use credentialFields() instead')
  }

  /** The API key does not expire, so there is nothing to refresh. */
  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  private client(credentials: Credentials): Comm100Client {
    return new Comm100Client(credentials)
  }

  /** Pager scope: host, site and agent, fingerprinted with this connection's key. */
  private scope(credentials: Credentials): string {
    const c = comm100Connection(credentials)
    return connectionScope(`comm100:${c.baseURL}:${c.siteId}:${c.email}`, credentials)
  }

  // ── Tickets ────────────────────────────────────────────────────────────────

  /**
   * GET ticketing/tickets (https://developer.comm100.com/docs/server-api-ticketing-ticket).
   * Its parameter table names filters only; its response carries the
   * introduction's paging envelope, whose request side is `pageIndex` and
   * `pageSize` ("The page size of this query. Default number of results is
   * 10."). No ticket page maximum is documented, so the rows are cut by the
   * row pager, which counts what each upstream page really holds: a server
   * that clamps pageSize below the ask shortens pages but skips no row.
   * `nextPage` null ends the chain. The cap on pageSize is this adapter's
   * declared maximum (capabilities.maxPageSize, from the contacts docs), not a
   * documented ticket limit; none is published.
   */
  async listTickets(credentials: Credentials, params: QueryParams): Promise<Ticket[]> {
    const client = this.client(credentials)
    const pageSize = Math.min(callerLimit(params, DEFAULT_PAGE_LIMIT), MAX_PAGE_SIZE)
    const key = cursorPagerKey(this.scope(credentials), 'tickets', { pageSize })
    const { items } = await pageByRows<Ticket, number>(key, params, async (cursor) => {
      const pageIndex = cursor ?? 1
      const res = await client.get<TicketsResponse>('ticketing/tickets', { pageIndex, pageSize })
      return {
        items: (res.tickets ?? []).map(transformTicket),
        next: hasNextPage(res) ? pageIndex + 1 : undefined,
      }
    })
    return items
  }

  /** GET ticketing/tickets/{id}. */
  async getTicket(credentials: Credentials, id: string): Promise<Ticket> {
    const raw = await this.client(credentials).get<RawComm100Ticket>(
      `ticketing/tickets/${encodeURIComponent(id)}`,
    )
    return transformTicket(raw)
  }

  // ── Messages ───────────────────────────────────────────────────────────────

  /**
   * GET ticketing/tickets/{id}/messages
   * (https://developer.comm100.com/docs/server-api-ticketing-message). Its
   * parameters are ticketId ("query yes Filter by ticket id."), notSentById
   * and include; "Response: An array of Message", unpaged, so the whole array
   * is sliced locally.
   */
  async listMessages(
    credentials: Credentials,
    ticketId: string,
    params: QueryParams,
  ): Promise<Message[]> {
    const res = await this.client(credentials).get<unknown>(
      `ticketing/tickets/${encodeURIComponent(ticketId)}/messages`,
      { ticketId },
    )
    const rows = asArray<RawComm100Message>(res).map((m) => transformMessage(m, ticketId))
    return pageLocally(rows, params)
  }

  // ── Contacts ───────────────────────────────────────────────────────────────

  /**
   * GET contact/contacts
   * (https://developer.comm100.com/docs/server-api-global-setting-contact):
   * "pageIndex integer query no Page index." / "pageSize integer query no Page
   * size, default is 50, and the value can not be larger than 500." The
   * response's `nextPage` is null on the last page.
   */
  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const asked = callerLimit(params, CONTACTS_DEFAULT_PAGE_SIZE)
    const pageSize = Math.min(asked, CONTACTS_MAX_PAGE_SIZE)
    const res = await this.client(credentials).get<ContactsResponse>('contact/contacts', {
      pageIndex: callerPage(params),
      pageSize,
    })
    reportUpstreamPage(params, {
      hasMore: hasNextPage(res),
      ...(typeof res.total === 'number' ? { totalCount: res.total } : {}),
      ...(pageSize < asked ? { pageSize } : {}),
    })
    return (res.contacts ?? []).map(transformContact)
  }

  /** GET contact/contacts/{id}. */
  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const raw = await this.client(credentials).get<RawComm100Contact>(
      `contact/contacts/${encodeURIComponent(id)}`,
    )
    return transformContact(raw)
  }

  // ── Users (Agents) ─────────────────────────────────────────────────────────

  /**
   * GET global/agents
   * (https://developer.comm100.com/docs/server-api-global-setting-agent). Its
   * parameters are keywords, departmentId, roleId and include; "Response: An
   * array of Agent", unpaged, so the whole array is sliced locally.
   */
  async listUsers(credentials: Credentials, params: QueryParams): Promise<User[]> {
    const res = await this.client(credentials).get<unknown>('global/agents')
    return pageLocally(asArray<RawComm100Agent>(res).map(transformUser), params)
  }

  /** GET global/agents/{id}. */
  async getUser(credentials: Credentials, id: string): Promise<User> {
    const raw = await this.client(credentials).get<RawComm100Agent>(
      `global/agents/${encodeURIComponent(id)}`,
    )
    return transformUser(raw)
  }

  // ── Tags ───────────────────────────────────────────────────────────────────

  /**
   * GET ticketing/tags (https://developer.comm100.com/docs/server-api-ticketing-tag):
   * "Parameters: No Parameters" / "Response: An array of Tag", unpaged, so the
   * whole array is sliced locally.
   */
  async listTags(credentials: Credentials, params: QueryParams): Promise<Tag[]> {
    const res = await this.client(credentials).get<unknown>('ticketing/tags')
    return pageLocally(asArray<RawComm100Tag>(res).map(transformTag), params)
  }

  // ── Teams (Departments) ────────────────────────────────────────────────────

  /**
   * GET global/departments
   * (https://developer.comm100.com/docs/server-api-global-setting-department).
   * Its parameters are keywords and include; "Response: An array of
   * Department", unpaged, so the whole array is sliced locally.
   */
  async listTeams(credentials: Credentials, params: QueryParams): Promise<Team[]> {
    const res = await this.client(credentials).get<unknown>('global/departments')
    return pageLocally(asArray<RawComm100Department>(res).map(transformTeam), params)
  }

  /** GET global/departments/{id}. */
  async getTeam(credentials: Credentials, id: string): Promise<Team> {
    const raw = await this.client(credentials).get<RawComm100Department>(
      `global/departments/${encodeURIComponent(id)}`,
    )
    return transformTeam(raw)
  }
}
