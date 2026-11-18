/**
 * Libredesk adapter for the customer-support vertical.
 *
 * Libredesk is an open-source, self-hosted omnichannel support desk.
 * Auth: API key + secret (Basic auth), per-instance base URL.
 * Conversations are the ticket equivalent; messages are scoped to a conversation.
 *
 * Supported resources: tickets (conversations), messages, contacts, users
 * (agents), tags, teams, macros.
 *
 * Pagination: page-based (?page=<n>&page_size=<n>); responses wrapped in
 * PageResults { results, total, per_page, total_pages, page }.
 *
 * Webhook signature: HMAC-SHA256 hex, header X-Libredesk-Signature: sha256=...
 */
import { pageLocally, type Credentials, type CredentialField, type QueryParams } from '@opensteward/shared'
import type { CustomerSupportAdapter } from '../../adapter/interface'
import type { Ticket } from '../../schema/ticket'
import type { Message } from '../../schema/message'
import type { Contact } from '../../schema/contact'
import type { User } from '../../schema/user'
import type { Tag } from '../../schema/tag'
import type { Team } from '../../schema/team'
import type { Macro } from '../../schema/macro'
import type { WebhookEvent } from '../../schema/webhook'

import { credentialFields as adapterCredentialFields, exchangeCredentials as adapterExchangeCredentials, getAuthUrlUnsupported } from './auth'
import { LibredeskClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'
import { verifyLibredeskWebhook, parseLibredeskWebhookEvents } from './webhook'

import { transformTicket, type RawLibredeskConversation } from './transform/ticket'
import { transformMessage, type RawLibredeskMessage } from './transform/message'
import { transformContact, type RawLibredeskContact } from './transform/contact'
import { transformUser, type RawLibredeskAgent } from './transform/user'
import { transformTag, type RawLibredeskTag } from './transform/tag'
import { transformTeam, type RawLibredeskTeam } from './transform/team'
import { transformMacro, type RawLibredeskMacro } from './transform/macro'

// Libredesk is self-hosted — no fixed OAuth config needed.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface LibredeskAdapterConfig {
  // intentionally empty; all connection info lives in Credentials.extra
}

/** PageResults envelope returned by list endpoints */
interface PageResults<T> {
  results?: T[]
  data?: T[]
}

export class LibredeskAdapter implements CustomerSupportAdapter {
  readonly platform = 'libredesk'
  readonly version = '0.1.0'

   
  constructor(_config: LibredeskAdapterConfig = {}) {}

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
    throw new Error('libredesk uses static API key auth; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyLibredeskWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseLibredeskWebhookEvents(payload)
  }

  private client(credentials: Credentials): LibredeskClient {
    return new LibredeskClient(credentials)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    const page = params['page'] ? Number(params['page']) : 1
    return {
      page,
      page_size: params.limit ?? DEFAULT_PAGE_SIZE,
    }
  }

  private unwrapList<T>(res: PageResults<T>): T[] {
    return res.results ?? res.data ?? []
  }

  // ── Tickets (conversations) ───────────────────────────────────────────────

  async listTickets(credentials: Credentials, params: QueryParams): Promise<Ticket[]> {
    const res = await this.client(credentials).get<PageResults<RawLibredeskConversation>>(
      '/conversations/all',
      this.listParams(params),
    )
    return this.unwrapList(res).map(transformTicket)
  }

  async getTicket(credentials: Credentials, id: string): Promise<Ticket> {
    const res = await this.client(credentials).get<RawLibredeskConversation>(
      `/conversations/${id}`,
    )
    return transformTicket(res)
  }

  // ── Messages ─────────────────────────────────────────────────────────────

  async listMessages(
    credentials: Credentials,
    ticketId: string,
    params: QueryParams,
  ): Promise<Message[]> {
    const res = await this.client(credentials).get<PageResults<RawLibredeskMessage>>(
      `/conversations/${ticketId}/messages`,
      this.listParams(params),
    )
    return this.unwrapList(res).map((m) => transformMessage(m, ticketId))
  }

  async getMessage(credentials: Credentials, id: string): Promise<Message> {
    // Libredesk message-get endpoint: /conversations/{cuuid}/messages/{uuid}
    // Without the conversation UUID we cannot call it directly; clients should
    // use listMessages. This path is here for completeness.
    throw new Error(
      `libredesk messages are conversation-scoped; call listMessages(conversationUuid). id=${id}`,
    )
  }

  // ── Contacts ─────────────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const res = await this.client(credentials).get<PageResults<RawLibredeskContact>>(
      '/contacts',
      this.listParams(params),
    )
    return this.unwrapList(res).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const res = await this.client(credentials).get<RawLibredeskContact>(`/contacts/${id}`)
    return transformContact(res)
  }

  // ── Users (agents) ───────────────────────────────────────────────────────

  async listUsers(credentials: Credentials, params: QueryParams): Promise<User[]> {
    const res = await this.client(credentials).get<PageResults<RawLibredeskAgent>>(
      '/agents',
      this.listParams(params),
    )
    return this.unwrapList(res).map(transformUser)
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    const res = await this.client(credentials).get<RawLibredeskAgent>(`/agents/${id}`)
    return transformUser(res)
  }

  // ── Tags ─────────────────────────────────────────────────────────────────

  async listTags(credentials: Credentials, params: QueryParams): Promise<Tag[]> {
    // GET /tags takes no page params in the latest release ("returns all tags from
    // the database", cmd/tags.go at v2.8.0) and returns every tag without them on
    // main, so the whole collection comes back at once; page it here.
    const res = await this.client(credentials).get<RawLibredeskTag[] | PageResults<RawLibredeskTag>>(
      '/tags',
    )
    const items: RawLibredeskTag[] = Array.isArray(res)
      ? res
      : this.unwrapList(res as PageResults<RawLibredeskTag>)
    return pageLocally(items.map(transformTag), params)
  }

  async getTag(_credentials: Credentials, id: string): Promise<Tag> {
    throw new Error(`libredesk tags do not have an individual get endpoint. id=${id}`)
  }

  // ── Teams ────────────────────────────────────────────────────────────────

  async listTeams(credentials: Credentials, params: QueryParams): Promise<Team[]> {
    const res = await this.client(credentials).get<PageResults<RawLibredeskTeam>>(
      '/teams',
      this.listParams(params),
    )
    return this.unwrapList(res).map(transformTeam)
  }

  async getTeam(credentials: Credentials, id: string): Promise<Team> {
    const res = await this.client(credentials).get<RawLibredeskTeam>(`/teams/${id}`)
    return transformTeam(res)
  }

  // ── Macros ────────────────────────────────────────────────────────────────

  async listMacros(credentials: Credentials, params: QueryParams): Promise<Macro[]> {
    const res = await this.client(credentials).get<PageResults<RawLibredeskMacro>>(
      '/macros',
      this.listParams(params),
    )
    return this.unwrapList(res).map(transformMacro)
  }

  async getMacro(credentials: Credentials, id: string): Promise<Macro> {
    const res = await this.client(credentials).get<RawLibredeskMacro>(`/macros/${id}`)
    return transformMacro(res)
  }
}
