/**
 * Faveo Helpdesk adapter for the customer-support vertical (v3 API).
 *
 * Self-hosted ticketing platform. Every installation has its own base URL.
 * Auth: user_name/email + password → JWT token via POST v3/api/login.
 * Token is passed as Authorization: Bearer <token> on all subsequent requests.
 * Token stored as accessToken; tenant URL stored in credentials.extra.baseUrl.
 *
 * Resources and the v3 routes they use (https://developers.faveohelpdesk.com/):
 *   messages  GET v3/api/agent/ticket-threads/{ticketId}   (page + limit)
 *   contacts  GET v3/user-export-data                      (page + limit)
 *   users     GET v3/api/dependency/agents (limit only), each row read through
 *             GET v3/api/admin/get-agent/{agentId}
 *   teams     GET v3/api/dependency/teams                  (limit only)
 *   tickets: unchanged legacy path, not yet verified against the v3 docs (see README).
 *
 * Not implemented (no dedicated API endpoints in Faveo v3):
 *   tags, macros — these will auto-501.
 *
 * Webhook signature verification is not documented by Faveo; verifyWebhook
 * always returns true (trust-your-own-network model).
 *
 * Schema-firewall: no attachment content, no voice/transcript fields.
 *
 * v3 response envelope: { success: boolean, message: string, data: <payload> }
 */
import {
  connectionScope,
  cursorPagerKey,
  pageByRows,
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

import {
  credentialFields as adapterCredentialFields,
  exchangeCredentials as adapterExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import { FaveoHelpdeskClient } from './client'
import { API_V3_PATH, USER_EXPORT_PATH } from './constants'

import { transformTicket, type RawFaveoTicket } from './transform/ticket'
import { transformMessage, type RawFaveoThread } from './transform/message'
import { transformContact, type RawFaveoUserRow } from './transform/contact'
import { transformUser, type RawFaveoAgent } from './transform/user'
import { transformTeam } from './transform/team'

// ── v3 Response envelope ──────────────────────────────────────────────────────

/**
 * All v3 API responses are wrapped in { success, message, data }.
 * T is the shape of the `data` field.
 */
interface V3Envelope<T> {
  success?: boolean
  message?: string
  data?: T
}

// ── Payload types (inside envelope.data) ─────────────────────────────────────

/** tickets list payload — paginated Laravel response inside v3 data envelope */
interface TicketListPayload {
  data?: RawFaveoTicket[]
  current_page?: number
  last_page?: number
  total?: number
}

/**
 * The documented page fields of a v3 paginated list, e.g.
 * https://developers.faveohelpdesk.com/ticket-threads-2/ :
 * "current_page": 1, "from": 1, "last_page": 1, "per_page": 15, ... "total": 5
 */
interface V3Page {
  current_page: number
  last_page: number
  total: number
}

/** GET v3/api/agent/ticket-threads/{ticketId} → data: { ..., threads: [...] } */
interface ThreadPage extends V3Page {
  threads: RawFaveoThread[]
}

/** GET v3/user-export-data → data: { ..., users: [...] } */
interface UserExportPage extends V3Page {
  users: RawFaveoUserRow[]
}

/** GET v3/api/admin/get-agent/{agentId} → data: { agent: [ {...} ] } */
interface AgentPayload {
  agent: RawFaveoAgent[]
}

type TicketListResponse = V3Envelope<TicketListPayload>

/**
 * GET v3/api/dependency/{type} (https://developers.faveohelpdesk.com/dependency-list/)
 * → { "success":true, "data":{ <type>: [ { "id":1, "name":"type-name 1" } ] } }
 */
interface DependencyRow {
  id: number
  name: string
}
type DependencyType = 'agents' | 'teams'

/**
 * Rows asked for per upstream request past the previous one. The dependency
 * list documents no maximum for limit, and no page parameter.
 */
const DEPENDENCY_CHUNK = 100

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

/**
 * The documented paging query: "page integer Optional To get any page's data.
 * If not passed then current page will be 1. limit integer Optional Number of
 * records that is needed to be fetched from DB." No maximum is documented, so
 * the caller's limit is sent as is.
 */
function pageQuery(params: QueryParams): Record<string, number> {
  const page =
    typeof params.page === 'number' && Number.isFinite(params.page) && params.page >= 1
      ? Math.floor(params.page)
      : 1
  return { page, ...(params.limit !== undefined ? { limit: params.limit } : {}) }
}

/**
 * One caller page of a dependency list, which documents "limit" but no page
 * parameter: "If it is not passed in the parameter, all the records (maximum
 * 10, if limit parameter is also not passed) will be returned." So upstream
 * page j is the prefix of (j + 1) * DEPENDENCY_CHUNK rows with its first
 * j * DEPENDENCY_CHUNK dropped, and pageByRows cuts the caller's page out of
 * those. A prefix shorter than it asked for is the end of the list. No total is
 * documented, so none is reported. Row order is not documented; it is taken to
 * be stable between requests.
 */
async function dependencyPage(
  client: FaveoHelpdeskClient,
  credentials: Credentials,
  type: DependencyType,
  params: QueryParams,
): Promise<DependencyRow[]> {
  const key = cursorPagerKey(connectionScope(client.baseUrl, credentials), `dependency/${type}`, {
    upstreamPageSize: DEPENDENCY_CHUNK,
  })
  const { items } = await pageByRows<DependencyRow, number>(key, params, async (cursor) => {
    const offset = cursor ?? 0
    const end = offset + DEPENDENCY_CHUNK
    const rows = await dependencyRows(client, type, end)
    return { items: rows.slice(offset), next: rows.length >= end ? end : undefined }
  })
  return items
}

async function dependencyRows(
  client: FaveoHelpdeskClient,
  type: DependencyType,
  limit: number,
): Promise<DependencyRow[]> {
  const envelope = await client.get<V3Envelope<Partial<Record<DependencyType, DependencyRow[]>>>>(
    `${API_V3_PATH}/dependency/${type}`,
    { limit },
  )
  const rows = envelope.data?.[type]
  if (!Array.isArray(rows)) {
    throw new Error(
      `faveo-helpdesk: dependency/${type} response has no data.${type} (${envelope.message ?? 'no message'})`,
    )
  }
  return rows
}

function reportPage(params: QueryParams, page: V3Page): void {
  reportUpstreamPage(params, {
    currentPage: page.current_page,
    totalPages: page.last_page,
    totalCount: page.total,
    hasMore: page.current_page < page.last_page,
  })
}

// ── Adapter config ────────────────────────────────────────────────────────────

export interface FaveoHelpdeskAdapterConfig {
  /** No OAuth config needed; Faveo uses user_name/email + password credentials */
  _placeholder?: never
}

// ── Adapter class ─────────────────────────────────────────────────────────────

export class FaveoHelpdeskAdapter implements CustomerSupportAdapter {
  readonly platform = 'faveo-helpdesk'
  readonly version = '0.1.0'

  constructor(_config?: FaveoHelpdeskAdapterConfig) {}

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
    throw new Error('faveo-helpdesk uses username/password auth; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // Faveo JWTs expire; callers should re-exchange credentials when a 401 is received.
    // Pass-through for now — refresh lifecycle is handled externally.
    return credentials
  }

  /**
   * Faveo Helpdesk does not document webhook signature verification.
   * Always returns true — callers should restrict webhook sources by IP/VPN.
   */
  verifyWebhook(_payload: Buffer, _headers: Record<string, string>, _secret: string): boolean {
    return true
  }

  private client(credentials: Credentials): FaveoHelpdeskClient {
    return new FaveoHelpdeskClient(credentials)
  }

  /** Laravel paginator page param */
  private pageParam(params: QueryParams): Record<string, unknown> {
    return {
      ...(params['page'] ? { page: Number(params['page']) } : {}),
      // Faveo default is 10; we leave it as default since per_page is not a standard param
    }
  }

  // ── Tickets ────────────────────────────────────────────────────────────────

  async listTickets(credentials: Credentials, params: QueryParams): Promise<Ticket[]> {
    // v3: GET v3/api/tickets → { success, message, data: { data: RawFaveoTicket[], ... } }
    const envelope = await this.client(credentials).get<TicketListResponse>(
      `${API_V3_PATH}/tickets`,
      this.pageParam(params),
    )
    const payload = envelope.data
    return (payload?.data ?? []).map(transformTicket)
  }

  async getTicket(credentials: Credentials, id: string): Promise<Ticket> {
    // v3 does not have a single-ticket GET by numeric id in the external API;
    // use the list endpoint with ticket_number filter as best effort.
    const envelope = await this.client(credentials).get<TicketListResponse>(
      `${API_V3_PATH}/tickets`,
      {
        ticket_number: id,
      },
    )
    const tickets = envelope.data?.data ?? []
    const found = tickets.find((t) => String(t.id) === id || t.ticket_number === id)
    if (!found) throw new Error(`faveo-helpdesk: ticket ${id} not found`)
    return transformTicket(found)
  }

  // ── Messages ───────────────────────────────────────────────────────────────

  async listMessages(
    credentials: Credentials,
    ticketId: string,
    params: QueryParams,
  ): Promise<Message[]> {
    // https://developers.faveohelpdesk.com/ticket-threads-2/ :
    // "URL : v3/api/agent/ticket-threads/{ticketId} Method : GET"
    const envelope = await this.client(credentials).get<V3Envelope<ThreadPage>>(
      `${API_V3_PATH}/agent/ticket-threads/${encodeURIComponent(ticketId)}`,
      pageQuery(params),
    )
    const page = envelope.data
    if (!page || !Array.isArray(page.threads)) {
      throw new Error(
        `faveo-helpdesk: ticket-threads response has no data.threads (${envelope.message ?? 'no message'})`,
      )
    }
    reportPage(params, page)
    return page.threads.map((t) => transformMessage(t, ticketId))
  }

  async getMessage(_credentials: Credentials, id: string): Promise<Message> {
    throw new Error(
      `faveo-helpdesk: threads are ticket-scoped; use listMessages(ticketId). id=${id}`,
    )
  }

  // ── Contacts ───────────────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    // https://developers.faveohelpdesk.com/get-users-list/ :
    // "URL: v3/ user-export-data Method: GET Description : Fetches list of users"
    const envelope = await this.client(credentials).get<V3Envelope<UserExportPage>>(
      USER_EXPORT_PATH,
      pageQuery(params),
    )
    const page = envelope.data
    if (!page || !Array.isArray(page.users)) {
      throw new Error(
        `faveo-helpdesk: user-export-data response has no data.users (${envelope.message ?? 'no message'})`,
      )
    }
    reportPage(params, page)
    return page.users.map(transformContact)
  }

  async getContact(_credentials: Credentials, _id: string): Promise<Contact> {
    // The v3 docs read users only as a list (v3/user-export-data); the
    // v3/api/customer route this called is the legacy api/v1/helpdesk/customer.
    throw notSupported(
      'Faveo Helpdesk cannot read one contact by id: the v3 API documents users only as a list ("URL: v3/ user-export-data")',
    )
  }

  // ── Users (agents) ─────────────────────────────────────────────────────────

  async listUsers(credentials: Credentials, params: QueryParams): Promise<User[]> {
    // https://developers.faveohelpdesk.com/dependency-list/ : "URL : v3/api/dependency/{type}",
    // type "agents". Its rows are only { id, name } (meta adds email and
    // profile_pic), and the canonical User needs teamIds, so each row is read
    // through the documented get-agent, the same record getUser returns.
    const client = this.client(credentials)
    const rows = await dependencyPage(client, credentials, 'agents', params)
    const users: User[] = []
    for (const row of rows) users.push(await this.readAgent(client, String(row.id)))
    return users
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    return this.readAgent(this.client(credentials), id)
  }

  private async readAgent(client: FaveoHelpdeskClient, id: string): Promise<User> {
    // https://developers.faveohelpdesk.com/get-agent-admin/ :
    // "URL: v3/api/admin/get-agent/{agentId} Method: GET"
    const envelope = await client.get<V3Envelope<AgentPayload>>(
      `${API_V3_PATH}/admin/get-agent/${encodeURIComponent(id)}`,
    )
    const agent = envelope.data?.agent?.[0]
    if (!agent) {
      throw Object.assign(new Error(`faveo-helpdesk: agent ${id} not found`), { statusCode: 404 })
    }
    return transformUser(agent)
  }

  // ── Teams ──────────────────────────────────────────────────────────────────

  async listTeams(credentials: Credentials, params: QueryParams): Promise<Team[]> {
    // https://developers.faveohelpdesk.com/dependency-list/ : "URL : v3/api/dependency/{type}",
    // type "teams". (The Get Teams List page itself is password-protected.)
    const rows = await dependencyPage(this.client(credentials), credentials, 'teams', params)
    return rows.map(transformTeam)
  }

  async getTeam(credentials: Credentials, id: string): Promise<Team> {
    // No readable team-by-id route is documented (Get Team Details is
    // password-protected), so the dependency list is read with a growing
    // limit until the id turns up or a short response proves it is absent.
    const client = this.client(credentials)
    for (let limit = 100; ; limit *= 2) {
      const rows = await dependencyRows(client, 'teams', limit)
      const found = rows.find((t) => String(t.id) === id)
      if (found) return transformTeam(found)
      if (rows.length < limit) {
        throw Object.assign(new Error(`faveo-helpdesk: team ${id} not found`), { statusCode: 404 })
      }
    }
  }
}
