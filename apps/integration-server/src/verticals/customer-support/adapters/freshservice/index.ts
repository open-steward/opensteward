/**
 * Freshservice adapter for the customer-support vertical.
 *
 * Per-tenant subdomain (subdomain.freshservice.com). API key auth via HTTP Basic.
 * Schema-firewall: no attachment content, no voice-recording bytes.
 *
 * Supported resources:
 *   - tickets        → GET /api/v2/tickets
 *   - messages       → GET /api/v2/tickets/{id}/conversations
 *   - contacts       → GET /api/v2/requesters
 *   - users (agents) → GET /api/v2/agents
 *   - teams (groups) → GET /api/v2/groups
 *
 * Not supported (Freshservice has no equivalent API):
 *   - tags  (auto-501 via interface optional)
 *   - macros (auto-501 via interface optional)
 *   - webhooks (no HMAC signing documented; webhook file omitted)
 */
import type { Credentials, CredentialField, QueryParams } from '@opensteward/shared'
import type { CustomerSupportAdapter } from '../../adapter/interface'
import type { Ticket } from '../../schema/ticket'
import type { Message } from '../../schema/message'
import type { Contact } from '../../schema/contact'
import type { User } from '../../schema/user'
import type { Team } from '../../schema/team'

import { credentialFields as adapterCredentialFields, exchangeCredentials as adapterExchangeCredentials, getAuthUrlUnsupported } from './auth'
import { FreshserviceClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'

import { transformTicket, type RawFreshserviceTicket } from './transform/ticket'
import { transformMessage, type RawFreshserviceConversation } from './transform/message'
import { transformContact, type RawFreshserviceRequester } from './transform/contact'
import { transformUser, type RawFreshserviceAgent } from './transform/user'
import { transformTeam, type RawFreshserviceGroup } from './transform/team'

// Freshservice wraps list responses in a named key
interface TicketsResponse { tickets?: RawFreshserviceTicket[] }
interface TicketResponse  { ticket?: RawFreshserviceTicket }
interface ConversationsResponse { conversations?: RawFreshserviceConversation[] }
interface RequestersResponse { requesters?: RawFreshserviceRequester[] }
interface RequesterResponse { requester?: RawFreshserviceRequester }
interface AgentsResponse { agents?: RawFreshserviceAgent[] }
interface AgentResponse { agent?: RawFreshserviceAgent }
interface GroupsResponse { groups?: RawFreshserviceGroup[] }
interface GroupResponse { group?: RawFreshserviceGroup }

export class FreshserviceAdapter implements CustomerSupportAdapter {
  readonly platform = 'freshservice'
  readonly version = '0.1.0'

  // No OAuth config needed — API key auth only
  constructor() {}

  credentialFields(): CredentialField[] {
    return adapterCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>) {
    return adapterExchangeCredentials(fields)
  }

  getAuthUrl(_state: string, _overrideScopes?: string[]): string {
    return getAuthUrlUnsupported()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('Freshservice uses API key auth; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // API keys do not expire
    return credentials
  }

  private client(credentials: Credentials): FreshserviceClient {
    return new FreshserviceClient(credentials)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    return {
      per_page: params.limit ?? DEFAULT_PAGE_SIZE,
      ...(params['page'] ? { page: Number(params['page']) } : {}),
    }
  }

  // ── Tickets ────────────────────────────────────────────────────────────────

  async listTickets(credentials: Credentials, params: QueryParams): Promise<Ticket[]> {
    const res = await this.client(credentials).get<TicketsResponse>('/tickets', this.listParams(params))
    return (res.tickets ?? []).map(transformTicket)
  }

  async getTicket(credentials: Credentials, id: string): Promise<Ticket> {
    const res = await this.client(credentials).get<TicketResponse>(`/tickets/${id}`)
    if (!res.ticket) throw new Error(`Freshservice ticket ${id} not found`)
    return transformTicket(res.ticket)
  }

  // ── Messages (conversations scoped to a ticket) ────────────────────────────

  async listMessages(credentials: Credentials, ticketId: string, params: QueryParams): Promise<Message[]> {
    const res = await this.client(credentials).get<ConversationsResponse>(
      `/tickets/${ticketId}/conversations`,
      this.listParams(params),
    )
    return (res.conversations ?? []).map((c) => transformMessage(c, ticketId))
  }

  // getMessage is intentionally omitted — Freshservice has no single-conversation-by-ID endpoint.
  // The router will issue 501 Not Implemented automatically.

  // ── Contacts (requesters) ──────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const res = await this.client(credentials).get<RequestersResponse>('/requesters', this.listParams(params))
    return (res.requesters ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const res = await this.client(credentials).get<RequesterResponse>(`/requesters/${id}`)
    if (!res.requester) throw new Error(`Freshservice requester ${id} not found`)
    return transformContact(res.requester)
  }

  // ── Users (agents) ─────────────────────────────────────────────────────────

  async listUsers(credentials: Credentials, params: QueryParams): Promise<User[]> {
    const res = await this.client(credentials).get<AgentsResponse>('/agents', this.listParams(params))
    return (res.agents ?? []).map(transformUser)
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    const res = await this.client(credentials).get<AgentResponse>(`/agents/${id}`)
    if (!res.agent) throw new Error(`Freshservice agent ${id} not found`)
    return transformUser(res.agent)
  }

  // ── Teams (agent groups) ───────────────────────────────────────────────────

  async listTeams(credentials: Credentials, params: QueryParams): Promise<Team[]> {
    const res = await this.client(credentials).get<GroupsResponse>('/groups', this.listParams(params))
    return (res.groups ?? []).map(transformTeam)
  }

  async getTeam(credentials: Credentials, id: string): Promise<Team> {
    const res = await this.client(credentials).get<GroupResponse>(`/groups/${id}`)
    if (!res.group) throw new Error(`Freshservice group ${id} not found`)
    return transformTeam(res.group)
  }

  // Tags and macros are not supported by Freshservice's public API.
  // Methods are omitted so callers receive 501 from the base router.
}
