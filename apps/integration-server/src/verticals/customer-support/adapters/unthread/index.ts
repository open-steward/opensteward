/**
 * Unthread adapter for the customer-support vertical.
 *
 * Unthread is a Slack-native B2B customer support platform. Conversations
 * (tickets) flow through Slack channels, email inboxes, or triage bots.
 * Auth: static service-account API key in X-Api-Key header.
 *
 * Supported resources:
 *   - Tickets (conversations)
 *   - Messages (conversation messages)
 *   - Contacts (customers/accounts)
 *   - Users (agents / workspace members)
 *   - Tags
 *   - Teams (user-groups)
 *
 * Docs: https://docs.unthread.io/docs/api-docs/api-reference
 *
 * Pagination: every list endpoint is `POST /<resource>/list` with a body of
 *   `{ limit, cursor }` — "Responses are paginated by providing a cursor to the
 *   next or previous page. The limit per page is 100." — and answers with
 *   `cursors: { hasNext, next? }`. The worker's 1-based `page` is resolved
 *   through the cursor pager: one upstream page at the caller's limit IS one
 *   caller page.
 */

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: macro — Unthread has no canned-response / macro feature; no such endpoint exists in the API.
import {
  connectionScope,
  cursorPagerKey,
  pageByCursor,
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
import type { Tag } from '../../schema/tag'
import type { Team } from '../../schema/team'
import type { WebhookEvent } from '../../schema/webhook'

import {
  credentialFields as adapterCredentialFields,
  exchangeCredentials as adapterExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import { UnthreadClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'
import { verifyUnthreadWebhook, parseUnthreadWebhookEvents } from './webhook'

import { transformTicket, type RawUnthreadConversation } from './transform/ticket'
import { transformMessage, type RawUnthreadMessage } from './transform/message'
import { transformContact, type RawUnthreadCustomer } from './transform/contact'
import { transformUser, type RawUnthreadUser } from './transform/user'
import { transformTag, type RawUnthreadTag } from './transform/tag'
import { transformTeam, type RawUnthreadUserGroup } from './transform/team'

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface UnthreadAdapterConfig {}

export class UnthreadAdapter implements CustomerSupportAdapter {
  readonly platform = 'unthread'
  readonly version = '0.1.0'
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  constructor(_config?: UnthreadAdapterConfig) {}

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
    throw new Error('unthread uses static API key auth; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyUnthreadWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseUnthreadWebhookEvents(payload)
  }

  private client(credentials: Credentials): UnthreadClient {
    return new UnthreadClient(credentials)
  }

  /**
   * One caller page of a `POST <path>` list endpoint. `cursors.next` starts the
   * next upstream page; `hasNext: false` (or no `next`) is the end.
   */
  private async pagedList<R>(credentials: Credentials, path: string, params: QueryParams): Promise<R[]> {
    const client = this.client(credentials)
    const limit = Math.min(Math.max(1, Math.floor(params.limit ?? DEFAULT_PAGE_SIZE)), MAX_PAGE_SIZE)
    const key = cursorPagerKey(connectionScope('unthread', credentials), path, { limit })
    const result = await pageByCursor<R, string>(key, params.page, async (cursor) => {
      const res = await client.postList<R>(path, { limit, ...(cursor ? { cursor } : {}) })
      const next = res.cursors?.hasNext && res.cursors.next ? res.cursors.next : undefined
      return { items: res.data ?? [], next }
    })
    reportUpstreamPage(params, { hasMore: result.hasMore })
    return result.items
  }

  // ── Tickets (conversations) ──────────────────────────────────────────────

  async listTickets(credentials: Credentials, params: QueryParams): Promise<Ticket[]> {
    const rows = await this.pagedList<RawUnthreadConversation>(credentials, '/conversations/list', params)
    return rows.map(transformTicket)
  }

  async getTicket(credentials: Credentials, id: string): Promise<Ticket> {
    const raw = await this.client(credentials).get<RawUnthreadConversation>(`/conversations/${id}`)
    return transformTicket(raw)
  }

  // ── Messages ─────────────────────────────────────────────────────────────

  async listMessages(credentials: Credentials, ticketId: string, params: QueryParams): Promise<Message[]> {
    const rows = await this.pagedList<RawUnthreadMessage>(credentials, `/conversations/${ticketId}/messages/list`, params)
    return rows.map((m) => transformMessage(m, ticketId))
  }

  async getMessage(_credentials: Credentials, id: string): Promise<Message> {
    throw new Error(`Unthread messages are conversation-scoped; use listMessages(ticketId). id=${id}`)
  }

  // ── Contacts (customers/accounts) ────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const rows = await this.pagedList<RawUnthreadCustomer>(credentials, '/customers/list', params)
    return rows.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const raw = await this.client(credentials).get<RawUnthreadCustomer>(`/customers/${id}`)
    return transformContact(raw)
  }

  // ── Users (agents) ───────────────────────────────────────────────────────

  async listUsers(credentials: Credentials, params: QueryParams): Promise<User[]> {
    const rows = await this.pagedList<RawUnthreadUser>(credentials, '/users/list', params)
    return rows.map(transformUser)
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    const raw = await this.client(credentials).get<RawUnthreadUser>(`/users/${id}`)
    return transformUser(raw)
  }

  // ── Tags ─────────────────────────────────────────────────────────────────

  async listTags(credentials: Credentials, params: QueryParams): Promise<Tag[]> {
    const rows = await this.pagedList<RawUnthreadTag>(credentials, '/tags/list', params)
    return rows.map(transformTag)
  }

  async getTag(credentials: Credentials, id: string): Promise<Tag> {
    const raw = await this.client(credentials).get<RawUnthreadTag>(`/tags/${id}`)
    return transformTag(raw)
  }

  // ── Teams (user-groups) ──────────────────────────────────────────────────

  async listTeams(credentials: Credentials, params: QueryParams): Promise<Team[]> {
    const rows = await this.pagedList<RawUnthreadUserGroup>(credentials, '/user-groups/list', params)
    return rows.map(transformTeam)
  }

  async getTeam(credentials: Credentials, id: string): Promise<Team> {
    const raw = await this.client(credentials).get<RawUnthreadUserGroup>(`/user-groups/${id}`)
    return transformTeam(raw)
  }
}
