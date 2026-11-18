/**
 * Freshchat adapter for the customer-support vertical.
 *
 * Auth: static API token (Bearer), per-account subdomain.
 * API base: https://<accountDomain>/v2
 *
 * Supported resources:
 *   - conversations → Ticket  (GET /v2/conversations, GET /v2/conversations/:id)
 *   - messages      → Message (GET /v2/conversations/:id/messages)
 *   - users         → Contact (GET /v2/users)
 *   - agents        → User    (GET /v2/agents)
 *   - groups        → Team    (GET /v2/groups)
 *
 * Not supported by Freshchat API v2: tags (standalone), macros/canned responses.
 *
 * Webhook events: message_create, conversation_assignment, conversation_resolution,
 * conversation_reopen. Verified via RSA-SHA256 + X-Freshchat-Signature header.
 */
import type { Credentials, CredentialField, QueryParams } from '@opensteward/shared'
import type { CustomerSupportAdapter } from '../../adapter/interface'
import type { Ticket } from '../../schema/ticket'
import type { Message } from '../../schema/message'
import type { Contact } from '../../schema/contact'
import type { User } from '../../schema/user'
import type { Team } from '../../schema/team'
import type { WebhookEvent } from '../../schema/webhook'

import {
  credentialFields as adapterCredentialFields,
  exchangeCredentials as adapterExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import { FreshchatClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'
import { verifyFreshchatWebhook, parseFreshchatWebhookEvents } from './webhook'

import { transformTicket, type RawFreshchatConversation } from './transform/ticket'
import { transformMessage, type RawFreshchatMessage } from './transform/message'
import { transformContact, type RawFreshchatUser } from './transform/contact'
import { transformUser, type RawFreshchatAgent } from './transform/user'
import { transformTeam, type RawFreshchatGroup } from './transform/team'

export type FreshchatAdapterConfig = {
  // Freshchat uses static API key auth — no OAuth config needed.
  // Reserved for future use (e.g. rate-limit overrides).
  [key: string]: never
}

/** Freshchat paginated list responses */
interface ConversationsPage {
  conversations?: RawFreshchatConversation[]
  pagination?: { total_pages?: number; current_page?: number; total_items?: number }
}

interface MessagesPage {
  messages?: RawFreshchatMessage[]
  pagination?: unknown
}

interface UsersPage {
  users?: RawFreshchatUser[]
  pagination?: unknown
}

interface AgentsPage {
  agents?: RawFreshchatAgent[]
  pagination?: unknown
}

interface GroupsPage {
  groups?: RawFreshchatGroup[]
  pagination?: unknown
}

export class FreshchatAdapter implements CustomerSupportAdapter {
  readonly platform = 'freshchat'
  readonly version = '0.1.0'

  constructor(_config?: FreshchatAdapterConfig) {}

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
    throw new Error('freshchat uses static API key auth; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // Static token — no refresh needed
    return credentials
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyFreshchatWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseFreshchatWebhookEvents(payload)
  }

  private client(credentials: Credentials): FreshchatClient {
    return new FreshchatClient(credentials)
  }

  private pageParams(params: QueryParams): Record<string, unknown> {
    return {
      items_per_page: params.limit ?? DEFAULT_PAGE_SIZE,
      ...(params['page'] != null ? { page: Number(params['page']) } : { page: 1 }),
    }
  }

  // ── Tickets (conversations) ──────────────────────────────────────────────

  async listTickets(credentials: Credentials, params: QueryParams): Promise<Ticket[]> {
    const res = await this.client(credentials).get<ConversationsPage>(
      '/conversations',
      this.pageParams(params),
    )
    return (res.conversations ?? []).map(transformTicket)
  }

  async getTicket(credentials: Credentials, id: string): Promise<Ticket> {
    const raw = await this.client(credentials).get<RawFreshchatConversation>(
      `/conversations/${id}`,
    )
    return transformTicket(raw)
  }

  // ── Messages ─────────────────────────────────────────────────────────────

  async listMessages(
    credentials: Credentials,
    conversationId: string,
    params: QueryParams,
  ): Promise<Message[]> {
    const res = await this.client(credentials).get<MessagesPage>(
      `/conversations/${conversationId}/messages`,
      this.pageParams(params),
    )
    return (res.messages ?? []).map((m) => transformMessage(m, conversationId))
  }

  // ── Contacts (end-users) ─────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const res = await this.client(credentials).get<UsersPage>(
      '/users',
      this.pageParams(params),
    )
    return (res.users ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const raw = await this.client(credentials).get<RawFreshchatUser>(`/users/${id}`)
    return transformContact(raw)
  }

  // ── Users (agents) ───────────────────────────────────────────────────────

  async listUsers(credentials: Credentials, params: QueryParams): Promise<User[]> {
    const res = await this.client(credentials).get<AgentsPage>(
      '/agents',
      this.pageParams(params),
    )
    return (res.agents ?? []).map(transformUser)
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    const raw = await this.client(credentials).get<RawFreshchatAgent>(`/agents/${id}`)
    return transformUser(raw)
  }

  // ── Teams (groups) ───────────────────────────────────────────────────────

  async listTeams(credentials: Credentials, params: QueryParams): Promise<Team[]> {
    const res = await this.client(credentials).get<GroupsPage>(
      '/groups',
      this.pageParams(params),
    )
    return (res.groups ?? []).map(transformTeam)
  }

  async getTeam(credentials: Credentials, id: string): Promise<Team> {
    const raw = await this.client(credentials).get<RawFreshchatGroup>(`/groups/${id}`)
    return transformTeam(raw)
  }

  // ── Tags — not supported by Freshchat API v2 ─────────────────────────────
  // (auto-501 from base adapter)

  // ── Macros — not supported by Freshchat API v2 ───────────────────────────
  // (auto-501 from base adapter)
}
