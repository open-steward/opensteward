/**
 * Cognigy Live Agent adapter for the customer-support vertical.
 *
 * Cognigy Live Agent is built on Chatwoot. All resource endpoints are
 * account-scoped: /api/v1/accounts/{account_id}/...
 *
 * Auth: api_access_token header (static key from Profile Settings).
 * Pagination: page query param (1-indexed).
 *   Conversations and agents: no strict page-size docs — default 25.
 *   Contacts: page size = 15.
 *   Messages: cursor-based via `after` (message ID).
 *
 * Supported resources:
 *   - Tickets  (conversations)
 *   - Messages (conversation messages)
 *   - Contacts
 *   - Users    (agents)
 *   - Teams
 *
 * NOT supported (Chatwoot/Live Agent has no such endpoints):
 *   - Tags   (labels are strings on conversations; no standalone tag resource)
 *   - Macros (canned responses not exposed in the REST API)
 *
 * Schema-firewall: no attachment content, no voice bytes, no AI summaries.
 */
import {
  connectionScope,
  cursorPagerKey,
  pageByRows,
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
import type { WebhookEvent } from '../../schema/webhook'

import {
  credentialFields as adapterCredentialFields,
  exchangeCredentials as adapterExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import { CognigyClient } from './client'
import { CONTACTS_PAGE_SIZE } from './constants'
import { verifyCognigyWebhook, parseCognigyWebhookEvents } from './webhook'

import { transformTicket, type RawCognigyTicket } from './transform/ticket'
import { transformMessage, type RawCognigyMessage } from './transform/message'
import { transformContact, type RawCognigyContact } from './transform/contact'
import { transformUser, type RawCognigyAgent } from './transform/user'
import { transformTeam, type RawCognigyTeam } from './transform/team'

// ── Response shapes ────────────────────────────────────────────────────────

interface ConversationsResponse {
  data?: {
    meta?: Record<string, unknown>
    payload?: RawCognigyTicket[]
  }
}

interface MessagesResponse {
  payload?: RawCognigyMessage[]
}

interface ContactsResponse {
  payload?: RawCognigyContact[]
  meta?: { count?: number; current_page?: number }
}

/** Position in the conversations walk: the upstream page, and the rows before it. */
interface ConversationCursor {
  page: number
  seen: number
}

export class CognigyAdapter implements CustomerSupportAdapter {
  readonly platform = 'cognigy'
  readonly version = '0.1.0'

  constructor(_config?: Record<string, unknown>) {}

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
    throw new Error('Cognigy Live Agent uses static API key auth; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyCognigyWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseCognigyWebhookEvents(payload)
  }

  private client(credentials: Credentials): CognigyClient {
    return new CognigyClient(credentials)
  }

  /** The instance and account a connection reads, for paging keys. */
  private accountScope(credentials: Credentials): string {
    const baseUrl = (credentials.extra?.['baseUrl'] as string | undefined) ?? ''
    const accountId = (credentials.extra?.['accountId'] as string | undefined) ?? ''
    return `cognigy:${baseUrl}:${accountId}`
  }

  /** Build page-based query params */
  private pageParams(params: QueryParams): Record<string, unknown> {
    return {
      page: params['cursor'] ? Number(params['cursor']) : 1,
    }
  }

  // ── Tickets (conversations) ──────────────────────────────────────────────

  async listTickets(credentials: Credentials, params: QueryParams): Promise<Ticket[]> {
    const client = this.client(credentials)
    const path = `${client.accountPrefix}/conversations`
    const filters = { status: 'all' }
    // An explicit upstream page from the caller is a position, not a row offset.
    if (params['cursor']) {
      const res = await client.get<ConversationsResponse>(path, { ...this.pageParams(params), ...filters })
      return (res.data?.payload ?? []).map(transformTicket)
    }
    // `page` is the only paging parameter and the page size is not documented,
    // so the caller's page is cut from upstream pages. The walk ends on an
    // empty page, or once `data.meta.all_count` rows have been seen.
    const key = cursorPagerKey(
      connectionScope(this.accountScope(credentials), credentials),
      'conversations',
      filters,
    )
    const { items } = await pageByRows<RawCognigyTicket, ConversationCursor>(key, params, async (cursor) => {
      const at = cursor ?? { page: 1, seen: 0 }
      const res = await client.get<ConversationsResponse>(path, { page: at.page, ...filters })
      const rows = res.data?.payload ?? []
      const seen = at.seen + rows.length
      const allCount = res.data?.meta?.['all_count']
      const more = rows.length > 0 && (typeof allCount !== 'number' || seen < allCount)
      return { items: rows, next: more ? { page: at.page + 1, seen } : undefined }
    })
    return items.map(transformTicket)
  }

  async getTicket(credentials: Credentials, id: string): Promise<Ticket> {
    const client = this.client(credentials)
    const raw = await client.get<RawCognigyTicket>(`${client.accountPrefix}/conversations/${id}`)
    return transformTicket(raw)
  }

  // ── Messages ─────────────────────────────────────────────────────────────

  async listMessages(credentials: Credentials, ticketId: string, params: QueryParams): Promise<Message[]> {
    const client = this.client(credentials)
    const path = `${client.accountPrefix}/conversations/${ticketId}/messages`
    if (params['cursor']) {
      const res = await client.get<MessagesResponse>(path, { after: String(params['cursor']) })
      return (res.payload ?? []).map((m) => transformMessage(m, ticketId))
    }
    // The endpoint documents no paging parameter: one response is the whole
    // list, so the caller's page is cut from it.
    const res = await client.get<MessagesResponse>(path, {})
    return pageLocally(res.payload ?? [], params).map((m) => transformMessage(m, ticketId))
  }

  async getMessage(_credentials: Credentials, id: string): Promise<Message> {
    throw new Error(
      `Cognigy Live Agent messages are conversation-scoped; call listMessages(ticketId). id=${id}`,
    )
  }

  // ── Contacts ─────────────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = this.client(credentials)
    const path = `${client.accountPrefix}/contacts`
    if (params['cursor']) {
      const res = await client.get<ContactsResponse>(path, this.pageParams(params))
      return (res.payload ?? []).map(transformContact)
    }
    // Pages are a fixed 15 rows whatever the caller asked for, so the
    // caller's page is cut from them. A short page is the last.
    const key = cursorPagerKey(
      connectionScope(this.accountScope(credentials), credentials),
      'contacts',
      { pageSize: CONTACTS_PAGE_SIZE },
    )
    const { items } = await pageByRows<RawCognigyContact, number>(key, params, async (cursor) => {
      const page = cursor ?? 1
      const res = await client.get<ContactsResponse>(path, { page })
      const rows = res.payload ?? []
      return { items: rows, next: rows.length >= CONTACTS_PAGE_SIZE ? page + 1 : undefined }
    })
    return items.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = this.client(credentials)
    const raw = await client.get<RawCognigyContact>(`${client.accountPrefix}/contacts/${id}`)
    return transformContact(raw)
  }

  // ── Users (agents) ───────────────────────────────────────────────────────

  async listUsers(credentials: Credentials, _params: QueryParams): Promise<User[]> {
    const client = this.client(credentials)
    const raw = await client.get<RawCognigyAgent[]>(`${client.accountPrefix}/agents`)
    return raw.map(transformUser)
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    // Chatwoot has no single-agent GET; fetch the list and filter
    const users = await this.listUsers(credentials, {})
    const user = users.find((u) => u.id === id)
    if (!user) throw new Error(`Cognigy agent ${id} not found`)
    return user
  }

  // ── Teams ────────────────────────────────────────────────────────────────

  async listTeams(credentials: Credentials, _params: QueryParams): Promise<Team[]> {
    const client = this.client(credentials)
    const raw = await client.get<RawCognigyTeam[]>(`${client.accountPrefix}/teams`)
    return raw.map(transformTeam)
  }

  async getTeam(credentials: Credentials, id: string): Promise<Team> {
    const client = this.client(credentials)
    const raw = await client.get<RawCognigyTeam>(`${client.accountPrefix}/teams/${id}`)
    return transformTeam(raw)
  }

  // ── Tags  — not supported (no standalone tag resource in Chatwoot) ────────
  // auto-501 via missing implementation

  // ── Macros — not supported (no macros endpoint in Chatwoot) ──────────────
  // auto-501 via missing implementation
}
