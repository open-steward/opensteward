/**
 * Genesys Cloud CX adapter for the customer-support vertical.
 *
 * Auth: OAuth 2.0 Authorization Code with region-specific login hosts.
 * Base URL: https://api.{region}/api/v2  (region = mypurecloud.com by default).
 *
 * Supported resources:
 *   - Tickets      → Conversations  (GET /api/v2/conversations)
 *   - Messages     → Chat messages  (GET /api/v2/conversations/chats/{id}/messages)
 *   - Contacts     → External contacts (GET /api/v2/externalcontacts/contacts)
 *   - Users        → Platform users / agents (GET /api/v2/users)
 *   - Teams        → Routing queues (GET /api/v2/routing/queues)
 *   - Tags         → Wrap-up codes  (GET /api/v2/routing/wrapupcodes)
 *   - Macros       → Response management responses (GET /api/v2/responsemanagement/responses)
 *
 * Schema-firewall: no voice recording audio/transcripts, no AI-generated
 * summaries, no PII beyond email + name + phone.
 *
 * Pagination: offset-based; responses include pageCount/total.
 *   pageSize (max 500, default 100) + pageNumber (1-indexed).
 *
 * Docs: https://developer.genesys.cloud/platform/api/
 */
import type { Credentials, CredentialField, QueryParams } from '@opensteward/shared'
import type { CustomerSupportAdapter } from '../../adapter/interface'
import type { Ticket } from '../../schema/ticket'
import type { Message } from '../../schema/message'
import type { Contact } from '../../schema/contact'
import type { User } from '../../schema/user'
import type { Tag } from '../../schema/tag'
import type { Team } from '../../schema/team'
import type { Macro } from '../../schema/macro'

import {
  buildAuthUrl,
  oauthFields as gcOauthFields,
  exchangeCode as gcExchangeCode,
  refreshCredentials as gcRefreshCredentials,
  DEFAULT_SCOPES,
} from './auth'
import { GenesysCloudClient, type PagedResponse } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'

import { transformTicket, type RawGenesysConversation } from './transform/ticket'
import { transformMessage, type RawGenesysChatMessage } from './transform/message'
import { transformContact, type RawGenesysExternalContact } from './transform/contact'
import { transformUser, type RawGenesysUser } from './transform/user'
import { transformTag, type RawGenesysWrapupCode } from './transform/tag'
import { transformTeam, type RawGenesysQueue } from './transform/team'
import { transformMacro, type RawGenesysResponse } from './transform/macro'

export interface GenesysCloudAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
  /**
   * Deployment-wide region, e.g. 'eu-west-1'. Optional: the region is the
   * customer organisation's, collected at connect time (`oauthFields`) and
   * read back from `credentials.extra.region`. Set this only when every
   * connection on this deployment is in the same region.
   */
  region?: string
}

interface ChatMessagesResponse { entities?: RawGenesysChatMessage[] }

export class GenesysCloudAdapter implements CustomerSupportAdapter {
  readonly platform = 'genesys-cloud'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]
  private region: string | undefined

  constructor(config: GenesysCloudAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes ?? DEFAULT_SCOPES
    this.region = config.region
  }

  /**
   * The region decides the login and API hosts, and it is the one thing the
   * deployment cannot know. Asked for on the Connect page before the redirect.
   */
  oauthFields(): CredentialField[] {
    return gcOauthFields()
  }

  getAuthUrl(
    state: string,
    overrideScopes?: string[],
    _codeChallenge?: string,
    inputs?: Record<string, string>,
  ): string {
    return buildAuthUrl(
      this.clientId,
      this.redirectUri,
      overrideScopes ?? this.scopes,
      state,
      inputs?.['region'] ?? this.region,
    )
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return gcExchangeCode(code, redirectUri, this.clientId, this.clientSecret, this.region)
  }

  /** Exchange on the customer's region and remember it with the credentials. */
  async exchangeCodeWithInputs(
    code: string,
    redirectUri: string,
    inputs: Record<string, string>,
  ): Promise<Credentials> {
    return gcExchangeCode(
      code,
      redirectUri,
      this.clientId,
      this.clientSecret,
      inputs['region'] ?? this.region,
    )
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return gcRefreshCredentials(credentials, this.clientId, this.clientSecret)
  }

  private client(credentials: Credentials): GenesysCloudClient {
    return new GenesysCloudClient(credentials)
  }

  private pageParams(params: QueryParams): Record<string, unknown> {
    const pageNumber = params['page'] ? Number(params['page']) : 1
    return {
      pageSize: params.limit ?? DEFAULT_PAGE_SIZE,
      pageNumber,
    }
  }

  // ── Tickets (Conversations) ───────────────────────────────────────────────

  async listTickets(credentials: Credentials, params: QueryParams): Promise<Ticket[]> {
    const res = await this.client(credentials).get<PagedResponse<RawGenesysConversation>>(
      '/conversations',
      this.pageParams(params),
    )
    return (res.entities ?? []).map(transformTicket)
  }

  async getTicket(credentials: Credentials, id: string): Promise<Ticket> {
    const raw = await this.client(credentials).get<RawGenesysConversation>(`/conversations/${id}`)
    return transformTicket(raw)
  }

  // ── Messages (Chat conversation messages) ────────────────────────────────

  async listMessages(credentials: Credentials, ticketId: string, params: QueryParams): Promise<Message[]> {
    const res = await this.client(credentials).get<ChatMessagesResponse>(
      `/conversations/chats/${ticketId}/messages`,
      this.pageParams(params),
    )
    return (res.entities ?? []).map((m) => transformMessage(m, ticketId))
  }

  async getMessage(_credentials: Credentials, id: string): Promise<Message> {
    throw new Error(`Genesys Cloud messages are conversation-scoped; call listMessages(ticketId). id=${id}`)
  }

  // ── Contacts (External contacts) ─────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const res = await this.client(credentials).get<PagedResponse<RawGenesysExternalContact>>(
      '/externalcontacts/contacts',
      this.pageParams(params),
    )
    return (res.entities ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const raw = await this.client(credentials).get<RawGenesysExternalContact>(
      `/externalcontacts/contacts/${id}`,
    )
    return transformContact(raw)
  }

  // ── Users (Platform agents) ───────────────────────────────────────────────

  async listUsers(credentials: Credentials, params: QueryParams): Promise<User[]> {
    const res = await this.client(credentials).get<PagedResponse<RawGenesysUser>>(
      '/users',
      { ...this.pageParams(params), state: 'active' },
    )
    return (res.entities ?? []).map(transformUser)
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    const raw = await this.client(credentials).get<RawGenesysUser>(`/users/${id}`)
    return transformUser(raw)
  }

  // ── Teams (Routing queues) ────────────────────────────────────────────────

  async listTeams(credentials: Credentials, params: QueryParams): Promise<Team[]> {
    const res = await this.client(credentials).get<PagedResponse<RawGenesysQueue>>(
      '/routing/queues',
      this.pageParams(params),
    )
    return (res.entities ?? []).map(transformTeam)
  }

  async getTeam(credentials: Credentials, id: string): Promise<Team> {
    const raw = await this.client(credentials).get<RawGenesysQueue>(`/routing/queues/${id}`)
    return transformTeam(raw)
  }

  // ── Tags (Wrap-up codes) ──────────────────────────────────────────────────

  async listTags(credentials: Credentials, params: QueryParams): Promise<Tag[]> {
    const res = await this.client(credentials).get<PagedResponse<RawGenesysWrapupCode>>(
      '/routing/wrapupcodes',
      this.pageParams(params),
    )
    return (res.entities ?? []).map(transformTag)
  }

  async getTag(credentials: Credentials, id: string): Promise<Tag> {
    const raw = await this.client(credentials).get<RawGenesysWrapupCode>(
      `/routing/wrapupcodes/${id}`,
    )
    return transformTag(raw)
  }

  // ── Macros (Response management responses) ────────────────────────────────

  async listMacros(credentials: Credentials, params: QueryParams): Promise<Macro[]> {
    const res = await this.client(credentials).get<PagedResponse<RawGenesysResponse>>(
      '/responsemanagement/responses',
      this.pageParams(params),
    )
    return (res.entities ?? []).map(transformMacro)
  }

  async getMacro(credentials: Credentials, id: string): Promise<Macro> {
    const raw = await this.client(credentials).get<RawGenesysResponse>(
      `/responsemanagement/responses/${id}`,
    )
    return transformMacro(raw)
  }
}
