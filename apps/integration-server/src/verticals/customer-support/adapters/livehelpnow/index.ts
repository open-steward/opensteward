/**
 * LiveHelpNow adapter for the customer-support vertical.
 *
 * Auth: OAuth 2.0 client_credentials (client_id + client_secret → Bearer token).
 * Base URL: https://developer.livehelpnow.net
 *
 * Supported resources:
 *   - listTickets / getTicket
 *   - listMessages (ticket actions from GET /api/ticket/{id}?include_actions=true)
 *   - listTeams / getTeam  (departments)
 *   - listUsers  (operators embedded in departments)
 *   - listMacros (canned response items across all sets)
 *   - listContacts (date-scoped chat contact list)
 *
 * Not supported (no dedicated API): listTags (refuses with 501), standalone getMessage,
 * getUser, getContact, getMacro individually (no single-item endpoints).
 *
 * Schema-firewall: no attachment content, no voice-recording bytes.
 *
 * Docs: https://developer.livehelpnow.net/docs/api/info/authentication/oauth
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
import type { Tag } from '../../schema/tag'

import {
  credentialFields as adapterCredentialFields,
  exchangeCredentials as adapterExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import { LivehelpnowClient } from './client'
import { DEFAULT_PAGE_SIZE, OAUTH_TOKEN_URL } from './constants'

import { transformTicket, type RawLivehelpnowTicket } from './transform/ticket'
import { transformMessage, type RawLivehelpnowTicketAction } from './transform/message'
import { transformContact, type RawLivehelpnowContact } from './transform/contact'
import { transformUser, type RawLivehelpnowOperator } from './transform/user'
import { transformTeam, type RawLivehelpnowDepartment } from './transform/team'
import { transformMacro, type RawLivehelpnowCannedItem } from './transform/macro'

// ── Response envelopes ────────────────────────────────────────────────────────

interface TicketListResponse {
  payload?: {
    tickets?: RawLivehelpnowTicket[]
    total_rows?: number
    count?: number
    start_index?: number
  }
  status?: string
}

interface TicketDetailResponse {
  payload?: RawLivehelpnowTicket & {
    actions?: RawLivehelpnowTicketAction[]
  }
  status?: string
}

interface DepartmentsResponse {
  payload?: RawLivehelpnowDepartment[]
  status?: string
}

interface ContactListResponse {
  payload?: RawLivehelpnowContact[]
  status?: string
}

interface CannedSetsResponse {
  payload?: {
    canned_sets?: Array<{ id: number; name?: string; enabled?: boolean }>
  }
  status?: string
}

interface CannedItemsResponse {
  payload?: {
    canned_items?: RawLivehelpnowCannedItem[]
  }
  status?: string
}

// ── Adapter config ────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface LivehelpnowAdapterConfig {
  // No additional static config needed; credentials are obtained via
  // credentialFields() → exchangeCredentials() at connect-time.
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export class LivehelpnowAdapter implements CustomerSupportAdapter {
  readonly platform = 'livehelpnow'
  readonly version = '0.1.0'

  constructor(_config?: LivehelpnowAdapterConfig) {}

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
    throw new Error('livehelpnow uses OAuth client_credentials; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // Re-issue a new token using the stored clientId + clientSecret.
    const clientId = String(credentials.extra?.['clientId'] ?? '')
    const clientSecret = String(credentials.extra?.['clientSecret'] ?? '')
    if (!clientId || !clientSecret) return credentials

    interface TokenResponse {
      access_token: string
      expires_in?: number
      refresh_token?: string
    }
    const { data } = await axios.post<TokenResponse>(
      OAUTH_TOKEN_URL,
      new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: clientId,
        client_secret: clientSecret,
      }).toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    )
    return {
      accessToken: data.access_token,
      extra: {
        ...credentials.extra,
        expiresIn: String(data.expires_in ?? ''),
        refreshToken: data.refresh_token ?? '',
      },
    }
  }

  // ── private helpers ─────────────────────────────────────────────────────────

  private client(credentials: Credentials): LivehelpnowClient {
    return new LivehelpnowClient(credentials)
  }

  // ── Tickets ─────────────────────────────────────────────────────────────────

  // GET /api/tickets pages by `start_index` + `count` and reports
  // `total_rows` (https://developer.livehelpnow.net/docs/api/endpoint/ticket/tickets).
  // Every documented example answers a request without `start_index` with
  // `"start_index" : 1`, so the index of the first row is 1: page k starts
  // at row (k - 1) x count + 1. The docs name no maximum `count`.
  async listTickets(credentials: Credentials, params: QueryParams): Promise<Ticket[]> {
    const count = params.limit ?? DEFAULT_PAGE_SIZE
    const legacyCursor =
      params.page === undefined && params['cursor'] ? Number(params['cursor']) : undefined
    const startIndex =
      legacyCursor !== undefined && Number.isFinite(legacyCursor)
        ? legacyCursor
        : pageOffset(params, count) + 1
    const res = await this.client(credentials).get<TicketListResponse>('/api/tickets', {
      start_index: startIndex,
      count,
    })
    const tickets = res.payload?.tickets ?? []
    const total = res.payload?.total_rows
    if (typeof total === 'number' && Number.isFinite(total)) {
      reportUpstreamPage(params, {
        totalCount: total,
        hasMore: startIndex - 1 + tickets.length < total && tickets.length > 0,
      })
    } else if (tickets.length < count) {
      reportUpstreamPage(params, { hasMore: false })
    }
    return tickets.map(transformTicket)
  }

  async getTicket(credentials: Credentials, id: string): Promise<Ticket> {
    const res = await this.client(credentials).get<TicketDetailResponse>(`/api/ticket/${id}`, {
      include_tags: true,
    })
    if (!res.payload) throw new Error(`livehelpnow ticket ${id} not found`)
    return transformTicket(res.payload as RawLivehelpnowTicket)
  }

  // ── Messages ─────────────────────────────────────────────────────────────────

  // The ticket details endpoint returns every action in one response; it has
  // no paging parameters (https://developer.livehelpnow.net/docs/api/endpoint/ticket/details).
  async listMessages(
    credentials: Credentials,
    ticketId: string,
    params: QueryParams,
  ): Promise<Message[]> {
    const res = await this.client(credentials).get<TicketDetailResponse>(
      `/api/ticket/${ticketId}`,
      {
        include_actions: true,
      },
    )
    const actions = res.payload?.actions ?? []
    return pageLocally(
      actions.map((action, i) => transformMessage(action, ticketId, i)),
      params,
    )
  }

  // ── Contacts (date-scoped chat contact list) ──────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    // LiveHelpNow requires date_from / date_to. Default to last 30 days if not supplied.
    const now = new Date()
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    const fmt = (d: Date) => d.toISOString().split('T')[0]

    const dateFrom = pickQueryDate(params, 'dateFrom') ?? fmt(thirtyDaysAgo)
    const dateTo = pickQueryDate(params, 'dateTo') ?? fmt(now)

    const res = await this.client(credentials).get<ContactListResponse>(
      '/api/analytics/chat/contact_list',
      { date_from: dateFrom, date_to: dateTo },
    )
    // contact_list takes only date_from / date_to and returns the whole range.
    return pageLocally((res.payload ?? []).map(transformContact), params)
  }

  // ── Users (operators) ─────────────────────────────────────────────────────────

  // GET /api/departments has no paging parameters: one response is every
  // department (https://developer.livehelpnow.net/docs/api/endpoint/department/departments).
  async listUsers(credentials: Credentials, params: QueryParams): Promise<User[]> {
    const res = await this.client(credentials).get<DepartmentsResponse>('/api/departments', {
      include_operators: true,
    })
    const departments = res.payload ?? []
    const seen = new Set<number>()
    const users: User[] = []

    for (const dept of departments) {
      const deptId = String(dept.department_id)
      const operators =
        (dept as unknown as { operators?: RawLivehelpnowOperator[] }).operators ?? []
      for (const op of operators) {
        if (seen.has(op.id)) continue
        seen.add(op.id)
        users.push(transformUser({ ...op, _departmentId: deptId }))
      }
    }
    return pageLocally(users, params)
  }

  // ── Teams (departments) ────────────────────────────────────────────────────────

  async listTeams(credentials: Credentials, params: QueryParams): Promise<Team[]> {
    const res = await this.client(credentials).get<DepartmentsResponse>('/api/departments')
    return pageLocally((res.payload ?? []).map(transformTeam), params)
  }

  async getTeam(credentials: Credentials, id: string): Promise<Team> {
    // No single-department GET; fetch all and find by id.
    const res = await this.client(credentials).get<DepartmentsResponse>('/api/departments')
    const dept = (res.payload ?? []).find((d) => String(d.department_id) === id)
    if (!dept) throw new Error(`livehelpnow department ${id} not found`)
    return transformTeam(dept)
  }

  // ── Macros (canned responses) ──────────────────────────────────────────────────

  // Neither GET /api/canned_sets nor GET /api/canned_sets/{id}/items takes a
  // paging parameter, so the walk below holds every item.
  async listMacros(credentials: Credentials, params: QueryParams): Promise<Macro[]> {
    // Fetch all canned sets, then fetch items per set.
    const setsRes = await this.client(credentials).get<CannedSetsResponse>('/api/canned_sets')
    const sets = setsRes.payload?.canned_sets ?? []
    const macros: Macro[] = []

    for (const set of sets) {
      if (set.enabled === false) continue
      const itemsRes = await this.client(credentials).get<CannedItemsResponse>(
        `/api/canned_sets/${set.id}/items`,
      )
      const items = itemsRes.payload?.canned_items ?? []
      for (const item of items) {
        macros.push(transformMacro({ ...item, _setName: set.name }))
      }
    }
    return pageLocally(macros, params)
  }

  // ── Tags ──────────────────────────────────────────────────────────────────────
  // The API reference documents no tag list; the only tag endpoint is the write
  // POST /api/ticket/{id}/tag (https://developer.livehelpnow.net/docs/api/endpoint/ticket/tag).
  // Tickets carry tag names on the list (ticket/tickets: "tags ... The tag names")
  // and tag ids on the details (ticket/details with include_tags: "tags ... The tag id"),
  // but no endpoint pairs a name with its id, and TagSchema needs both.

  async listTags(_credentials: Credentials, _params: QueryParams): Promise<Tag[]> {
    throw Object.assign(
      new Error(
        'LiveHelpNow cannot list tags: the API documents no tag list; tickets carry tag names ' +
          '(ticket list) or tag ids (ticket details) but no endpoint pairs a name with its id',
      ),
      { statusCode: 501, code: 'NOT_SUPPORTED' },
    )
  }
}

// ── helpers ───────────────────────────────────────────────────────────────────

function pickQueryDate(params: QueryParams, key: string): string | undefined {
  const v = params[key]
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v
  return undefined
}
