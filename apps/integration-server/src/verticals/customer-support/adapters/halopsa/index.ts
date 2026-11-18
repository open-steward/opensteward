/**
 * HaloPSA adapter — customer-support vertical.
 *
 * Auth: OAuth 2.0 client_credentials. Every HaloPSA instance is
 * tenant-hosted; the base URL and token endpoint are derived from the
 * customer-supplied tenantUrl credential field.
 *
 * Supported resources:
 *   Tickets   — GET /Tickets, GET /Tickets/{id}
 *   Messages  — GET /Actions?ticket_id={id}  (Actions = ticket updates/replies)
 *   Contacts  — GET /Customer, GET /Customer/{id}
 *   Users     — GET /Agent, GET /Agent/{id}
 *   Teams     — GET /Team, GET /Team/{id}
 *
 * Not supported (auto-501):
 *   Tags   — HaloPSA tags are embedded in tickets; no standalone list endpoint.
 *   Macros — HaloPSA has no canned-responses API.
 *
 * Webhooks — HaloPSA supports configurable outbound webhooks but does not
 * document a signing scheme, so verifyWebhook / parseWebhookEvents are
 * intentionally omitted.
 *
 * Schema-firewall: no attachment content, no voice bytes, no AI fields.
 */
import type { Credentials, CredentialField, QueryParams } from '@opensteward/shared'
import type { CustomerSupportAdapter } from '../../adapter/interface'
import type { Ticket } from '../../schema/ticket'
import type { Message } from '../../schema/message'
import type { Contact } from '../../schema/contact'
import type { User } from '../../schema/user'
import type { Team } from '../../schema/team'

import {
  credentialFields as halopCredentialFields,
  exchangeCredentials as halopExchangeCredentials,
  refreshCredentials as halopRefreshCredentials,
} from './auth'
import { HaloPsaClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'

import { transformTicket, type RawHaloPsaTicket } from './transform/ticket'
import { transformMessage, type RawHaloPsaAction } from './transform/message'
import { transformContact, type RawHaloPsaCustomer } from './transform/contact'
import { transformUser, type RawHaloPsaAgent } from './transform/user'
import { transformTeam, type RawHaloPsaTeam } from './transform/team'

// ── Response envelope shapes ────────────────────────────────────────────────

interface TicketsEnvelope {
  record_count?: number
  tickets?: RawHaloPsaTicket[]
  /** HaloPSA may also return the array directly on the "faults" key */
  faults?: RawHaloPsaTicket[]
}

interface ActionsEnvelope {
  record_count?: number
  actions?: RawHaloPsaAction[]
}

interface CustomersEnvelope {
  record_count?: number
  customers?: RawHaloPsaCustomer[]
  users?: RawHaloPsaCustomer[]
}

interface AgentsEnvelope {
  record_count?: number
  agents?: RawHaloPsaAgent[]
}

interface TeamsEnvelope {
  record_count?: number
  teams?: RawHaloPsaTeam[]
}

// ── Adapter config ───────────────────────────────────────────────────────────

export interface HalopsaAdapterConfig {
  /** Not used — HaloPSA uses client_credentials, not authorization_code.
   *  Retained to match the BaseAdapter constructor contract. */
  clientId?: string
  clientSecret?: string
  redirectUri?: string
  scopes?: string[]
}

// ── Adapter ──────────────────────────────────────────────────────────────────

export class HalopsaAdapter implements CustomerSupportAdapter {
  readonly platform = 'halopsa'
  readonly version = '0.1.0'

  constructor(_config: HalopsaAdapterConfig = {}) {}

  // ── Auth ──────────────────────────────────────────────────────────────────

  credentialFields(): CredentialField[] {
    return halopCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return halopExchangeCredentials(fields)
  }

  /**
   * HaloPSA uses client_credentials, not authorization_code.
   * getAuthUrl is not applicable; callers should use credentialFields() instead.
   */
  getAuthUrl(_state: string, _overrideScopes?: string[]): string {
    throw new Error('HaloPSA uses OAuth2 client_credentials; use credentialFields() instead of getAuthUrl()')
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('HaloPSA uses OAuth2 client_credentials; use exchangeCredentials() instead of exchangeCode()')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return halopRefreshCredentials(credentials)
  }

  // ── Client factory ───────────────────────────────────────────────────────

  private client(credentials: Credentials): HaloPsaClient {
    return new HaloPsaClient(credentials)
  }

  private pageParams(params: QueryParams, extra?: Record<string, unknown>): Record<string, unknown> {
    const page = typeof params.page === 'number' ? params.page : 1
    return {
      page_no: page,
      page_size: params.limit ?? DEFAULT_PAGE_SIZE,
      ...extra,
    }
  }

  // ── Tickets ───────────────────────────────────────────────────────────────

  async listTickets(credentials: Credentials, params: QueryParams): Promise<Ticket[]> {
    const res = await this.client(credentials).get<TicketsEnvelope>('/Tickets', this.pageParams(params, {
      includedetails: true,
      includestatus: true,
    }))
    const items = res.tickets ?? res.faults ?? []
    return items.map(transformTicket)
  }

  async getTicket(credentials: Credentials, id: string): Promise<Ticket> {
    const raw = await this.client(credentials).get<RawHaloPsaTicket>(`/Tickets/${id}`)
    return transformTicket(raw)
  }

  // ── Messages (Actions) ────────────────────────────────────────────────────

  async listMessages(credentials: Credentials, ticketId: string, params: QueryParams): Promise<Message[]> {
    const res = await this.client(credentials).get<ActionsEnvelope>('/Actions', this.pageParams(params, {
      ticket_id: Number(ticketId),
    }))
    return (res.actions ?? []).map((a) => transformMessage(a, ticketId))
  }

  async getMessage(_credentials: Credentials, id: string): Promise<Message> {
    throw new Error(`HaloPSA actions are ticket-scoped; call listMessages(ticketId). id=${id}`)
  }

  // ── Contacts (Customers) ──────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const res = await this.client(credentials).get<CustomersEnvelope>('/Customer', this.pageParams(params))
    const items = res.customers ?? res.users ?? []
    return items.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const raw = await this.client(credentials).get<RawHaloPsaCustomer>(`/Customer/${id}`)
    return transformContact(raw)
  }

  // ── Users (Agents) ────────────────────────────────────────────────────────

  async listUsers(credentials: Credentials, params: QueryParams): Promise<User[]> {
    const res = await this.client(credentials).get<AgentsEnvelope>('/Agent', this.pageParams(params))
    return (res.agents ?? []).map(transformUser)
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    const raw = await this.client(credentials).get<RawHaloPsaAgent>(`/Agent/${id}`)
    return transformUser(raw)
  }

  // ── Teams ─────────────────────────────────────────────────────────────────

  async listTeams(credentials: Credentials, params: QueryParams): Promise<Team[]> {
    const res = await this.client(credentials).get<TeamsEnvelope>('/Team', this.pageParams(params))
    return (res.teams ?? []).map(transformTeam)
  }

  async getTeam(credentials: Credentials, id: string): Promise<Team> {
    const raw = await this.client(credentials).get<RawHaloPsaTeam>(`/Team/${id}`)
    return transformTeam(raw)
  }

  // Tags and Macros are intentionally omitted — HaloPSA has no standalone
  // tags list endpoint and no canned-response (macro) feature via REST API.
  // The adapter framework will return 501 for listTags/getMacro etc.
}
