/**
 * FreeScout adapter for the customer-support vertical.
 *
 * FreeScout is a self-hosted, open-source help desk.  Every tenant has their
 * own instance URL; auth is via API Key (X-FreeScout-API-Key header).
 *
 * Supported resources: tickets (conversations), messages (threads),
 *   contacts (customers), users (agents), tags, teams (mailboxes).
 *
 * Not supported (no equivalent in FreeScout): macros.
 *
 * Docs: https://api-docs.freescout.net/
 */
import {
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
import { FreescoutClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'
import { verifyFreescoutWebhook, parseFreescoutWebhookEvents } from './webhook'

import { transformTicket, type RawFreescoutConversation } from './transform/ticket'
import { transformMessage, type RawFreescoutThread } from './transform/message'
import { transformContact, type RawFreescoutCustomer } from './transform/contact'
import { transformUser, type RawFreescoutUser } from './transform/user'
import { transformTag, type RawFreescoutTag } from './transform/tag'
import { transformTeam, type RawFreescoutMailbox } from './transform/team'

// ── Response envelope shapes ─────────────────────────────────────────────────

interface EmbeddedConversations {
  _embedded?: { conversations?: RawFreescoutConversation[] }
}

interface EmbeddedThreads {
  _embedded?: { threads?: RawFreescoutThread[] }
}

interface EmbeddedCustomers {
  _embedded?: { customers?: RawFreescoutCustomer[] }
}

interface EmbeddedUsers {
  _embedded?: { users?: RawFreescoutUser[] }
}

/** The `page` object FreeScout returns beside `_embedded` on list endpoints. */
interface PageInfo {
  page?: { size?: number; totalElements?: number; totalPages?: number; number?: number }
}

interface EmbeddedMailboxes extends PageInfo {
  _embedded?: { mailboxes?: RawFreescoutMailbox[] }
}

// Tags endpoint returns a plain array of strings (not objects)
type TagsResponse = string[] | ({ _embedded?: { tags?: string[] } } & PageInfo)

// ── Adapter ──────────────────────────────────────────────────────────────────

/** No OAuth config needed; API key auth only. */
export type FreescoutAdapterConfig = Record<string, never>

export class FreescoutAdapter implements CustomerSupportAdapter {
  readonly platform = 'freescout'
  readonly version = '0.1.0'

  constructor(_config?: FreescoutAdapterConfig) {}

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
    throw new Error('freescout uses static API key auth; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyFreescoutWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseFreescoutWebhookEvents(payload)
  }

  private client(credentials: Credentials): FreescoutClient {
    return new FreescoutClient(credentials)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    return {
      pageSize: params.limit ?? DEFAULT_PAGE_SIZE,
      ...(params['page'] ? { page: Number(params['page']) } : {}),
    }
  }

  /**
   * `page` + `pageSize` for GET api/tags and GET api/mailboxes, which
   * https://api-docs.freescout.net/ documents as "Page number." and
   * "Page size (defaults to 50).". One upstream page is one caller page.
   */
  private pageParams(params: QueryParams): { page: number; pageSize: number } {
    return { page: params.page ?? 1, pageSize: params.limit ?? DEFAULT_PAGE_SIZE }
  }

  /** Report the end from the response's `page.totalPages`. */
  private reportPage(params: QueryParams, sent: { page: number }, res: PageInfo): void {
    const info = res.page
    if (typeof info?.totalPages !== 'number') return
    reportUpstreamPage(params, {
      hasMore: sent.page < info.totalPages,
      ...(typeof info.totalElements === 'number' ? { totalCount: info.totalElements } : {}),
    })
  }

  // ── Tickets (conversations) ───────────────────────────────────────────────

  async listTickets(credentials: Credentials, params: QueryParams): Promise<Ticket[]> {
    const res = await this.client(credentials).get<EmbeddedConversations>(
      '/conversations',
      this.listParams(params),
    )
    return (res._embedded?.conversations ?? []).map(transformTicket)
  }

  async getTicket(credentials: Credentials, id: string): Promise<Ticket> {
    const raw = await this.client(credentials).get<RawFreescoutConversation>(`/conversations/${id}`)
    return transformTicket(raw)
  }

  // ── Messages (threads) ────────────────────────────────────────────────────

  async listMessages(credentials: Credentials, ticketId: string, params: QueryParams): Promise<Message[]> {
    const res = await this.client(credentials).get<EmbeddedThreads>(
      `/conversations/${ticketId}/threads`,
      this.listParams(params),
    )
    return (res._embedded?.threads ?? []).map((t) => transformMessage(t, ticketId))
  }

  async getMessage(_credentials: Credentials, id: string): Promise<Message> {
    throw new Error(
      `FreeScout threads are conversation-scoped; call listMessages(ticketId) instead. id=${id}`,
    )
  }

  // ── Contacts (customers) ──────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const res = await this.client(credentials).get<EmbeddedCustomers>(
      '/customers',
      this.listParams(params),
    )
    return (res._embedded?.customers ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const raw = await this.client(credentials).get<RawFreescoutCustomer>(`/customers/${id}`)
    return transformContact(raw)
  }

  // ── Users (agents) ────────────────────────────────────────────────────────

  async listUsers(credentials: Credentials, params: QueryParams): Promise<User[]> {
    const res = await this.client(credentials).get<EmbeddedUsers>(
      '/users',
      this.listParams(params),
    )
    return (res._embedded?.users ?? []).map(transformUser)
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    const raw = await this.client(credentials).get<RawFreescoutUser>(`/users/${id}`)
    return transformUser(raw)
  }

  // ── Tags ──────────────────────────────────────────────────────────────────

  async listTags(credentials: Credentials, params: QueryParams): Promise<Tag[]> {
    const sent = this.pageParams(params)
    const res = await this.client(credentials).get<TagsResponse>('/tags', sent)
    if (!Array.isArray(res)) this.reportPage(params, sent, res)
    // Normalise both plain-array and _embedded envelope variants
    let names: string[]
    if (Array.isArray(res)) {
      names = res.map(String)
    } else {
      names = ((res as { _embedded?: { tags?: string[] } })._embedded?.tags ?? []).map(String)
    }
    return names
      .filter((n) => n.length > 0)
      .map((name) => transformTag({ name } satisfies RawFreescoutTag))
  }

  // FreeScout tags have no individual get endpoint.
  // getTag is intentionally omitted so the interface auto-501s.

  // ── Teams (mailboxes) ─────────────────────────────────────────────────────

  async listTeams(credentials: Credentials, params: QueryParams): Promise<Team[]> {
    const sent = this.pageParams(params)
    const res = await this.client(credentials).get<EmbeddedMailboxes>('/mailboxes', sent)
    this.reportPage(params, sent, res)
    return (res._embedded?.mailboxes ?? []).map(transformTeam)
  }

  async getTeam(credentials: Credentials, id: string): Promise<Team> {
    const raw = await this.client(credentials).get<RawFreescoutMailbox>(`/mailboxes/${id}`)
    return transformTeam(raw)
  }
}
