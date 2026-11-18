/**
 * eGain customer-support adapter.
 *
 * eGain is a multi-tenant SaaS contact-center platform. Each customer has
 * their own host (e.g. acme.egain.cloud). This adapter targets the eGain
 * Interaction REST API v12 (the authoritative CRM API surface):
 *   https://{tenantHost}/system/ws/v12/interaction/{cases|activities|customers}
 *   https://{tenantHost}/system/ws/v12/administration/{users|groups}
 *
 * Auth: OAuth2 Authorization Code flow.
 *   Authorize: https://ai.egain.cloud/system/auth/{tenantId}-U/oauth2/authorize
 *   Token:     https://ai.egain.cloud/system/auth/{tenantId}-U/oauth2/token
 *
 * Resources implemented: tickets (cases), messages (activities), contacts
 *   (customers), users (agents), teams (groups).
 * Resources NOT implemented (eGain has no such API): tags, macros.
 *
 * Schema-firewall: no attachment content, no voice-recording bytes, no
 * AI-suggested-reply text, contact PII = email + name + phone only.
 *
 * Docs: https://hd.egain.com/api/authoring_interaction_api_reference/html/d1/dfb/intro.html
 */
import type { Credentials, CredentialField, QueryParams } from '@opensteward/shared'
import type { CustomerSupportAdapter } from '../../adapter/interface'
import type { Ticket } from '../../schema/ticket'
import type { Message } from '../../schema/message'
import type { Contact } from '../../schema/contact'
import type { User } from '../../schema/user'
import type { Team } from '../../schema/team'

import {
  buildAuthUrl,
  oauthFields as egainOauthFields,
  exchangeCode as egainExchangeCode,
  normaliseTenantHost,
  refreshCredentials as egainRefreshCredentials,
} from './auth'
import { EgainClient } from './client'
import { DEFAULT_PAGE_SIZE, DEFAULT_SCOPES } from './constants'

import { transformTicket, type RawEgainCase } from './transform/ticket'
import { transformMessage, type RawEgainActivity } from './transform/message'
import { transformContact, type RawEgainCustomer } from './transform/contact'
import { transformUser, type RawEgainUser } from './transform/user'
import { transformTeam, type RawEgainGroup } from './transform/team'

export interface EgainAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
  /**
   * eGain tenant identifier (e.g. ACMECORP123456). Used to build per-tenant
   * OAuth2 URLs. Must be set before calling getAuthUrl / exchangeCode.
   */
  tenantId?: string
  /**
   * eGain instance hostname (e.g. acme.egain.cloud). Used to build the
   * REST API base URL. Must be set before making API calls via EgainClient.
   */
  tenantHost?: string
}

// ── eGain response envelope types ─────────────────────────────────────────

interface CasesResponse { case?: RawEgainCase[]; paginationInfo?: unknown }
interface ActivitiesResponse { activity?: RawEgainActivity[]; paginationInfo?: unknown }
interface CustomersResponse { customer?: RawEgainCustomer[]; paginationInfo?: unknown }
interface UsersResponse { user?: RawEgainUser[]; paginationInfo?: unknown }
interface GroupsResponse { group?: RawEgainGroup[]; paginationInfo?: unknown }

// ── Adapter ────────────────────────────────────────────────────────────────

export class EgainAdapter implements CustomerSupportAdapter {
  readonly platform = 'egain'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]
  private tenantId: string
  private tenantHost: string

  constructor(config: EgainAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes ?? DEFAULT_SCOPES
    this.tenantId = config.tenantId ?? ''
    this.tenantHost = config.tenantHost ?? ''
  }

  /**
   * The tenant ID decides the OAuth endpoints and the host decides the API;
   * both are the customer's. Asked for on the Connect page before the redirect.
   */
  oauthFields(): CredentialField[] {
    return egainOauthFields()
  }

  getAuthUrl(
    state: string,
    overrideScopes?: string[],
    _codeChallenge?: string,
    inputs?: Record<string, string>,
  ): string {
    const url = buildAuthUrl(
      this.clientId,
      this.redirectUri,
      overrideScopes ?? this.scopes,
      state,
      inputs?.['tenantId'] ?? this.tenantId,
    )
    // Checked now too, so a bad host is refused before the customer leaves for eGain.
    normaliseTenantHost(inputs?.['tenantHost'] ?? this.tenantHost)
    return url
  }

  /** Variant used by the connect flow once tenantId is known from the form. */
  getAuthUrlForTenant(state: string, tenantId: string, overrideScopes?: string[]): string {
    return buildAuthUrl(
      this.clientId,
      this.redirectUri,
      overrideScopes ?? this.scopes,
      state,
      tenantId,
    )
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    // tenantId and tenantHost are read from the adapter config populated at
    // construction time. The returned credentials.extra persists them so
    // EgainClient and refreshCredentials can use them on subsequent calls.
    return egainExchangeCode(
      code,
      redirectUri,
      this.clientId,
      this.clientSecret,
      this.tenantId,
      this.tenantHost,
    )
  }

  /** Exchange on the customer's tenant and remember tenant and host with the credentials. */
  async exchangeCodeWithInputs(
    code: string,
    redirectUri: string,
    inputs: Record<string, string>,
  ): Promise<Credentials> {
    return egainExchangeCode(
      code,
      redirectUri,
      this.clientId,
      this.clientSecret,
      inputs['tenantId'] ?? this.tenantId,
      inputs['tenantHost'] ?? this.tenantHost,
    )
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return egainRefreshCredentials(credentials)
  }

  private client(credentials: Credentials): EgainClient {
    return new EgainClient(credentials)
  }

  /**
   * Build eGain-style pagination params.
   * eGain uses $pagenum / $pagesize (1-indexed).
   */
  private listParams(params: QueryParams): Record<string, unknown> {
    const pageSize = params.limit ?? DEFAULT_PAGE_SIZE
    // params.cursor carries a $pagenum value when set by a previous page.
    const pageNum = params['cursor'] ? Number(params['cursor']) : 1
    return { $pagesize: pageSize, $pagenum: pageNum }
  }

  // ── Tickets (Cases) ──────────────────────────────────────────────────────

  async listTickets(credentials: Credentials, params: QueryParams): Promise<Ticket[]> {
    const res = await this.client(credentials).get<CasesResponse>(
      '/interaction/case',
      this.listParams(params),
    )
    return (res.case ?? []).map(transformTicket)
  }

  async getTicket(credentials: Credentials, id: string): Promise<Ticket> {
    const res = await this.client(credentials).get<CasesResponse>(
      `/interaction/case/${id}`,
      { $attribute: 'all' },
    )
    const raw = res.case?.[0]
    if (!raw) throw new Error(`eGain case ${id} not found`)
    return transformTicket(raw)
  }

  // ── Messages (Activities) ────────────────────────────────────────────────

  async listMessages(credentials: Credentials, ticketId: string, params: QueryParams): Promise<Message[]> {
    const res = await this.client(credentials).get<ActivitiesResponse>(
      '/interaction/activity',
      { ...this.listParams(params), case: ticketId },
    )
    return (res.activity ?? []).map((a) => transformMessage(a, ticketId))
  }

  async getMessage(_credentials: Credentials, id: string): Promise<Message> {
    throw new Error(
      `eGain activities are case-scoped; call listMessages(ticketId) instead. id=${id}`,
    )
  }

  // ── Contacts (Customers) ─────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const res = await this.client(credentials).get<CustomersResponse>(
      '/interaction/customer',
      this.listParams(params),
    )
    return (res.customer ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const res = await this.client(credentials).get<CustomersResponse>(
      `/interaction/customer/${id}`,
      { $attribute: 'all' },
    )
    const raw = res.customer?.[0]
    if (!raw) throw new Error(`eGain customer ${id} not found`)
    return transformContact(raw)
  }

  // ── Users (Agents) ───────────────────────────────────────────────────────

  async listUsers(credentials: Credentials, params: QueryParams): Promise<User[]> {
    const res = await this.client(credentials).get<UsersResponse>(
      '/administration/user',
      this.listParams(params),
    )
    return (res.user ?? []).map(transformUser)
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    const res = await this.client(credentials).get<UsersResponse>(
      `/administration/user/${id}`,
      { $attribute: 'all' },
    )
    const raw = res.user?.[0]
    if (!raw) throw new Error(`eGain user ${id} not found`)
    return transformUser(raw)
  }

  // ── Teams (Groups) ───────────────────────────────────────────────────────

  async listTeams(credentials: Credentials, params: QueryParams): Promise<Team[]> {
    const res = await this.client(credentials).get<GroupsResponse>(
      '/administration/group',
      this.listParams(params),
    )
    return (res.group ?? []).map(transformTeam)
  }

  async getTeam(credentials: Credentials, id: string): Promise<Team> {
    const res = await this.client(credentials).get<GroupsResponse>(
      `/administration/group/${id}`,
    )
    const raw = res.group?.[0]
    if (!raw) throw new Error(`eGain group ${id} not found`)
    return transformTeam(raw)
  }

  // ── Tags — NOT IMPLEMENTED ───────────────────────────────────────────────
  // eGain Interaction API does not expose a tags/labels endpoint.

  // ── Macros — NOT IMPLEMENTED ─────────────────────────────────────────────
  // eGain does not have a canned-response or macro API surface in v12.
}
