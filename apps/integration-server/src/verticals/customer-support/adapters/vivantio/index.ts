/**
 * Vivantio adapter for the customer-support vertical.
 *
 * Auth: HTTP Basic (username + password).  The base64-encoded credential is
 * stored in credentials.accessToken; the optional regional base URL is in
 * credentials.extra.apiBaseUrl.
 *
 * All Vivantio query endpoints are POST with a SelectPageRequest body.
 * Pagination: offset-based PageNumber / PageSize.
 *
 * Supported resources: Tickets, Messages (Actions), Contacts (Callers),
 * Users (Technicians), Teams (Groups).
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: macro — Vivantio has no canned-response/macro concept; absent from the full API (webservices-na01.vivantio.com/Help)
 * Unavailable: tag   — Vivantio has no tag/label concept; absent from the full API (webservices-na01.vivantio.com/Help)
 *
 * Webhooks: Vivantio's outbound webhooks are fully user-configurable
 * payload templates with no documented HMAC signature scheme, so
 * verifyWebhook / parseWebhookEvents are not implemented.
 */
import {
  pageLocally,
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
import { VivantioClient, type SelectPageRequest } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'

import { transformTicket, type RawVivantioTicket } from './transform/ticket'
import { transformMessage, type RawVivantioAction } from './transform/message'
import { transformContact, type RawVivantioCaller } from './transform/contact'
import { transformUser, type RawVivantioUser } from './transform/user'
import { transformTeam, type RawVivantioGroup } from './transform/team'

// ── Response envelope shapes ────────────────────────────────────────────────

interface SelectPageResponse<T> {
  Results?: T[]
  RecordCount?: number
  Successful?: boolean
  ErrorMessages?: Array<{ Message?: string }>
}

interface SelectResponse<T> {
  Results?: T[]
  Successful?: boolean
  ErrorMessages?: Array<{ Message?: string }>
}

interface SingleItemResponse<T> {
  Item?: T
  Found?: boolean
  Successful?: boolean
  ErrorMessages?: Array<{ Message?: string }>
}

// ── Adapter ─────────────────────────────────────────────────────────────────

export class VivantioAdapter implements CustomerSupportAdapter {
  readonly platform = 'vivantio'
  readonly version = '0.1.0'

  // No config required beyond credentials
   
  constructor() {}

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
    throw new Error('vivantio uses HTTP Basic Auth; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  private client(credentials: Credentials): VivantioClient {
    return new VivantioClient(credentials)
  }

  private pageRequest(params: QueryParams): SelectPageRequest {
    return {
      PageSize: params.limit ?? DEFAULT_PAGE_SIZE,
      PageNumber: params['page'] ? Number(params['page']) : 1,
      Ascending: false,
      Query: { Mode: 0, Items: null },
    }
  }

  // ── Tickets ───────────────────────────────────────────────────────────────

  async listTickets(credentials: Credentials, params: QueryParams): Promise<Ticket[]> {
    const res = await this.client(credentials).selectPage<SelectPageResponse<RawVivantioTicket>>(
      '/Ticket/SelectPage',
      this.pageRequest(params),
    )
    return (res.Results ?? []).map(transformTicket)
  }

  async getTicket(credentials: Credentials, id: string): Promise<Ticket> {
    const res = await this.client(credentials).post<SingleItemResponse<RawVivantioTicket>>(
      `/Ticket/SelectById/${id}`,
    )
    if (!res.Item) throw new Error(`vivantio: ticket ${id} not found`)
    return transformTicket(res.Item)
  }

  // ── Messages (Actions scoped to a ticket) ────────────────────────────────

  async listMessages(
    credentials: Credentials,
    ticketId: string,
    params: QueryParams,
  ): Promise<Message[]> {
    const res = await this.client(credentials).post<SelectResponse<RawVivantioAction>>(
      `/Ticket/ActionSelectByParentId/${ticketId}`,
    )
    // "Returns all the Actions for a specified Ticket" — no page parameter,
    // so the whole collection is sliced locally.
    return pageLocally(
      (res.Results ?? []).map((a) => transformMessage(a, ticketId)),
      params,
    )
  }

  async getMessage(_credentials: Credentials, id: string): Promise<Message> {
    throw new Error(
      `vivantio: actions are ticket-scoped; call listMessages(ticketId). id=${id}`,
    )
  }

  // ── Contacts (Callers) ────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const res = await this.client(credentials).selectPage<SelectPageResponse<RawVivantioCaller>>(
      '/Caller/SelectPage',
      this.pageRequest(params),
    )
    return (res.Results ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const res = await this.client(credentials).post<SingleItemResponse<RawVivantioCaller>>(
      `/Caller/SelectById/${id}`,
    )
    if (!res.Item) throw new Error(`vivantio: caller ${id} not found`)
    return transformContact(res.Item)
  }

  // ── Users (Technicians) ──────────────────────────────────────────────────

  async listUsers(credentials: Credentials, params: QueryParams): Promise<User[]> {
    const res = await this.client(credentials).post<SelectResponse<RawVivantioUser>>(
      '/Configuration/UserSelectAll',
    )
    // "Returns all available Users" — no page parameter; slice locally.
    return pageLocally((res.Results ?? []).map(transformUser), params)
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    const res = await this.client(credentials).post<SingleItemResponse<RawVivantioUser>>(
      `/Configuration/UserSelectById/${id}`,
    )
    if (!res.Item) throw new Error(`vivantio: user ${id} not found`)
    return transformUser(res.Item)
  }

  // ── Teams (Groups) ───────────────────────────────────────────────────────

  async listTeams(credentials: Credentials, params: QueryParams): Promise<Team[]> {
    const res = await this.client(credentials).post<SelectResponse<RawVivantioGroup>>(
      '/Configuration/GroupSelectAll',
    )
    // "Returns all available Groups" — no page parameter; slice locally.
    return pageLocally((res.Results ?? []).map(transformTeam), params)
  }

  async getTeam(_credentials: Credentials, id: string): Promise<Team> {
    // Vivantio has no single-group-by-id endpoint; list and filter
    throw new Error(
      `vivantio: no individual group endpoint; use listTeams() and filter by id=${id}`,
    )
  }
}
