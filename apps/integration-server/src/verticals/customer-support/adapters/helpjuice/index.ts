/**
 * Helpjuice adapter for the customer-support vertical.
 *
 * Per-tenant subdomain: https://<account>.helpjuice.com/api/v3
 * Auth: static API key (Authorization header, raw key — no Bearer prefix).
 *
 * Resource mapping:
 *   Tickets  → Articles  (/articles)
 *   Messages → Article comments  (/articles/:id/comments)
 *   Contacts → Users  (/users)
 *   Users    → Users  (/users)
 *   Teams    → Groups  (/groups)
 *
 * Not supported by Helpjuice API v3: Tags, Macros (auto-501 via missing methods).
 *
 * Schema-firewall: no article body content, no private user data beyond email/name.
 */
import type { Credentials, CredentialField, QueryParams } from '@opensteward/shared'
import type { CustomerSupportAdapter } from '../../adapter/interface'
import type { Ticket } from '../../schema/ticket'
import type { Message } from '../../schema/message'
import type { Contact } from '../../schema/contact'
import type { User } from '../../schema/user'
import type { Team } from '../../schema/team'

import { credentialFields as adapterCredentialFields, exchangeCredentials as adapterExchangeCredentials, getAuthUrlUnsupported } from './auth'
import { HelpjuiceClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'

import { transformTicket, type RawHelpjuiceArticle } from './transform/ticket'
import { transformMessage, type RawHelpjuiceComment } from './transform/message'
import { transformContact, type RawHelpjuiceUser } from './transform/contact'
import { transformUser } from './transform/user'
import { transformTeam, type RawHelpjuiceGroup } from './transform/team'

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface HelpjuiceAdapterConfig {}

interface ArticlesResponse  { articles?: RawHelpjuiceArticle[]; meta?: HelpjuiceMeta }
interface ArticleResponse   { article?: RawHelpjuiceArticle }
interface CommentsResponse  { comments?: RawHelpjuiceComment[]; meta?: HelpjuiceMeta }
interface UsersResponse     { users?: RawHelpjuiceUser[]; meta?: HelpjuiceMeta }
interface UserResponse      { user?: RawHelpjuiceUser }
interface GroupsResponse    { groups?: RawHelpjuiceGroup[]; meta?: HelpjuiceMeta }
interface GroupResponse     { group?: RawHelpjuiceGroup }

interface HelpjuiceMeta {
  current?: number
  limit?: number
  total_pages?: number
  total_count?: number
}

export class HelpjuiceAdapter implements CustomerSupportAdapter {
  readonly platform = 'helpjuice'
  readonly version = '0.1.0'

   
  constructor(_config?: HelpjuiceAdapterConfig) {}

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
    throw new Error('helpjuice uses static API key auth; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  private client(credentials: Credentials): HelpjuiceClient {
    return new HelpjuiceClient(credentials)
  }

  /** Helpjuice pagination uses ?page=N&limit=N */
  private listParams(params: QueryParams): Record<string, unknown> {
    return {
      limit: params.limit ?? DEFAULT_PAGE_SIZE,
      ...(params['page'] ? { page: Number(params['page']) } : {}),
    }
  }

  // ── Articles (Tickets) ────────────────────────────────────────────────────

  async listTickets(credentials: Credentials, params: QueryParams): Promise<Ticket[]> {
    const res = await this.client(credentials).get<ArticlesResponse>('/articles', this.listParams(params))
    return (res.articles ?? []).map(transformTicket)
  }

  async getTicket(credentials: Credentials, id: string): Promise<Ticket> {
    const res = await this.client(credentials).get<ArticleResponse>(`/articles/${id}`)
    if (!res.article) throw new Error(`helpjuice article ${id} not found`)
    return transformTicket(res.article)
  }

  // ── Article Comments (Messages) ───────────────────────────────────────────

  async listMessages(credentials: Credentials, articleId: string, params: QueryParams): Promise<Message[]> {
    const res = await this.client(credentials).get<CommentsResponse>(
      `/articles/${articleId}/comments`,
      this.listParams(params),
    )
    return (res.comments ?? []).map((c) => transformMessage(c, articleId))
  }

  async getMessage(_credentials: Credentials, id: string): Promise<Message> {
    throw new Error(`helpjuice comments are article-scoped; call listMessages(articleId). id=${id}`)
  }

  // ── Users (Contacts) ──────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const res = await this.client(credentials).get<UsersResponse>('/users', this.listParams(params))
    return (res.users ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const res = await this.client(credentials).get<UserResponse>(`/users/${id}`)
    if (!res.user) throw new Error(`helpjuice user ${id} not found`)
    return transformContact(res.user)
  }

  // ── Users (Agents) ────────────────────────────────────────────────────────

  async listUsers(credentials: Credentials, params: QueryParams): Promise<User[]> {
    const res = await this.client(credentials).get<UsersResponse>('/users', this.listParams(params))
    return (res.users ?? []).map(transformUser)
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    const res = await this.client(credentials).get<UserResponse>(`/users/${id}`)
    if (!res.user) throw new Error(`helpjuice user ${id} not found`)
    return transformUser(res.user)
  }

  // ── Groups (Teams) ────────────────────────────────────────────────────────

  async listTeams(credentials: Credentials, params: QueryParams): Promise<Team[]> {
    const res = await this.client(credentials).get<GroupsResponse>('/groups', this.listParams(params))
    return (res.groups ?? []).map(transformTeam)
  }

  async getTeam(credentials: Credentials, id: string): Promise<Team> {
    const res = await this.client(credentials).get<GroupResponse>(`/groups/${id}`)
    if (!res.group) throw new Error(`helpjuice group ${id} not found`)
    return transformTeam(res.group)
  }
}
