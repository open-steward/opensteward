/**
 * Zammad adapter for the customer-support vertical.
 *
 * Zammad is an open-source, self-hosted helpdesk. Every installation has its
 * own base URL; the caller supplies it via credentials.extra.baseUrl.
 *
 * Auth: API token ("Token token=…" header)
 * Pagination: ?page={n}&per_page={size}
 *
 * Resources supported:
 *   tickets, messages (articles), contacts (customers), users (agents),
 *   tags (tag_list), teams (groups), macros (text_modules)
 *
 * Docs: https://docs.zammad.org/en/latest/api/intro.html
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
import type { Tag } from '../../schema/tag'
import type { Team } from '../../schema/team'
import type { Macro } from '../../schema/macro'
import type { WebhookEvent } from '../../schema/webhook'

import {
  credentialFields as adapterCredentialFields,
  exchangeCredentials as adapterExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import { ZammadClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'
import { verifyZammadWebhook, parseZammadWebhookEvents } from './webhook'

import { transformTicket, type RawZammadTicket } from './transform/ticket'
import { transformMessage, type RawZammadArticle } from './transform/message'
import { transformContact, type RawZammadUser } from './transform/contact'
import { transformUser } from './transform/user'
import { transformTag, type RawZammadTag } from './transform/tag'
import { transformTeam, type RawZammadGroup } from './transform/team'
import { transformMacro, type RawZammadTextModule } from './transform/macro'

/** Shape of the /api/v1/tag_list response envelope */
interface TagListResponse {
  tags?: RawZammadTag[]
}

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ZammadAdapterConfig {}

export class ZammadAdapter implements CustomerSupportAdapter {
  readonly platform = 'zammad'
  readonly version = '0.1.0'

  constructor(_config?: ZammadAdapterConfig) {}

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
    throw new Error('zammad uses static API token auth; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // API tokens do not expire
    return credentials
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyZammadWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseZammadWebhookEvents(payload)
  }

  private client(credentials: Credentials): ZammadClient {
    return new ZammadClient(credentials)
  }

  private pageParams(params: QueryParams): { page: number; per_page: number } {
    return {
      page: params['page'] !== undefined ? Number(params['page']) : 1,
      per_page: params.limit ?? DEFAULT_PAGE_SIZE,
    }
  }

  // ── Tickets ──────────────────────────────────────────────────────────────

  async listTickets(credentials: Credentials, params: QueryParams): Promise<Ticket[]> {
    const items = await this.client(credentials).get<RawZammadTicket[]>(
      '/tickets',
      this.pageParams(params),
    )
    return (Array.isArray(items) ? items : []).map(transformTicket)
  }

  async getTicket(credentials: Credentials, id: string): Promise<Ticket> {
    const item = await this.client(credentials).get<RawZammadTicket>(`/tickets/${id}`)
    return transformTicket(item)
  }

  // ── Messages (ticket articles) ───────────────────────────────────────────

  async listMessages(
    credentials: Credentials,
    ticketId: string,
    params: QueryParams,
  ): Promise<Message[]> {
    // TicketArticlesController#index_by_ticket renders every authorized
    // article of the ticket in one array and reads no page/per_page, so the
    // whole collection is here: page it locally.
    const items = await this.client(credentials).get<RawZammadArticle[]>(
      `/ticket_articles/by_ticket/${ticketId}`,
    )
    const rows = (Array.isArray(items) ? items : []).map((a) => transformMessage(a, ticketId))
    return pageLocally(rows, params)
  }

  async getMessage(credentials: Credentials, id: string): Promise<Message> {
    const item = await this.client(credentials).get<RawZammadArticle>(`/ticket_articles/${id}`)
    const ticketId = item.ticket_id !== undefined ? String(item.ticket_id) : ''
    return transformMessage(item, ticketId)
  }

  // ── Contacts (customers) ─────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    // Zammad /api/v1/users does not support role filtering; fetch all users
    const items = await this.client(credentials).get<RawZammadUser[]>(
      '/users',
      this.pageParams(params),
    )
    return (Array.isArray(items) ? items : []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const item = await this.client(credentials).get<RawZammadUser>(`/users/${id}`)
    return transformContact(item)
  }

  // ── Users (agents) ───────────────────────────────────────────────────────

  async listUsers(credentials: Credentials, params: QueryParams): Promise<User[]> {
    // Zammad /api/v1/users does not support role filtering; fetch all users
    const items = await this.client(credentials).get<RawZammadUser[]>(
      '/users',
      this.pageParams(params),
    )
    return (Array.isArray(items) ? items : []).map(transformUser)
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    const item = await this.client(credentials).get<RawZammadUser>(`/users/${id}`)
    return transformUser(item)
  }

  // ── Tags ─────────────────────────────────────────────────────────────────

  async listTags(credentials: Credentials, params: QueryParams): Promise<Tag[]> {
    // GET /api/v1/tag_list returns { tags: [...] }, not a flat array
    const resp = await this.client(credentials).get<TagListResponse>(
      '/tag_list',
      this.pageParams(params),
    )
    const items: RawZammadTag[] = Array.isArray(resp?.tags) ? resp.tags : []
    return items.map(transformTag)
  }

  // getTag is not supported — Zammad tags have no individual GET endpoint
  async getTag(_credentials: Credentials, id: string): Promise<Tag> {
    throw new Error(`zammad tags have no individual get endpoint. id=${id}`)
  }

  // ── Teams (groups) ───────────────────────────────────────────────────────

  async listTeams(credentials: Credentials, params: QueryParams): Promise<Team[]> {
    const items = await this.client(credentials).get<RawZammadGroup[]>(
      '/groups',
      this.pageParams(params),
    )
    return (Array.isArray(items) ? items : []).map(transformTeam)
  }

  async getTeam(credentials: Credentials, id: string): Promise<Team> {
    const item = await this.client(credentials).get<RawZammadGroup>(`/groups/${id}`)
    return transformTeam(item)
  }

  // ── Macros (text modules) ────────────────────────────────────────────────

  async listMacros(credentials: Credentials, params: QueryParams): Promise<Macro[]> {
    const items = await this.client(credentials).get<RawZammadTextModule[]>(
      '/text_modules',
      this.pageParams(params),
    )
    return (Array.isArray(items) ? items : []).map(transformMacro)
  }

  async getMacro(credentials: Credentials, id: string): Promise<Macro> {
    const item = await this.client(credentials).get<RawZammadTextModule>(`/text_modules/${id}`)
    return transformMacro(item)
  }
}
