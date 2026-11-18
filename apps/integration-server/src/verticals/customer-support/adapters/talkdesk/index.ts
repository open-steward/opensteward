/**
 * Talkdesk adapter for the customer-support vertical.
 *
 * Auth: OAuth 2.0 Authorization Code flow.
 * REST API base URL: https://api.talkdeskapp.com (US); EU/CA/UK via credentials.extra.region.
 * Token endpoint:    https://{accountName}.talkdeskid.com/oauth/token (account-scoped).
 *
 * Supported resources:
 *   - listTickets / getTicket         → Cases API  GET /cases
 *   - listMessages                    → Case Notes API  GET /cases/{id}/notes
 *   - listContacts / getContact       → Contacts API  GET /contacts
 *   - listUsers / getUser             → Users API  GET /users
 *   - listTeams / getTeam             → Teams API  GET /teams
 *
 * getMessage is case-note-scoped; call listMessages(ticketId) instead.
 *
 * ── Resource coverage ──────────────────────────────────────────────────────
 * Unavailable: macro — Talkdesk has no macros/canned-responses REST API; Templates
 *              and Quick Replies exist as UI features but are not exposed via any
 *              public REST endpoint.
 * Unavailable: tag   — Tags are a UI-only case property; there is no dedicated
 *              /tags REST endpoint in the public Talkdesk API (21 APIs listed,
 *              none is a Tags API).
 *
 * Schema-firewall: no attachment content, no voice-recording bytes,
 * no AI-generated summaries.
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
  buildAuthUrl,
  oauthFields as talkdeskOauthFields,
  exchangeCode as talkdeskExchangeCode,
  refreshCredentials as talkdeskRefreshCredentials,
} from './auth'
import { TalkdeskClient } from './client'
import { DEFAULT_PAGE_SIZE, DEFAULT_SCOPES } from './constants'
import { verifyTalkdeskWebhook, parseTalkdeskWebhookEvents } from './webhook'

import { transformTicket, type RawTalkdeskCase } from './transform/ticket'
import { transformMessage, type RawTalkdeskCaseNote } from './transform/message'
import { transformContact, type RawTalkdeskContact } from './transform/contact'
import { transformUser, type RawTalkdeskAgent } from './transform/user'
import { transformTeam, type RawTalkdeskTeam } from './transform/team'

export interface TalkdeskAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  /**
   * Deployment-wide Talkdesk account name (subdomain). Optional: the account
   * is the customer's, collected at connect time (`oauthFields`) and read back
   * from `credentials.extra.accountName`. Set this only when every connection
   * on this deployment is the same account.
   */
  accountName?: string
  scopes?: string[]
  /** Deployment-wide Talkdesk region ('us', 'eu', …). Optional; normally from `credentials.extra.region`. */
  region?: string
}

// ── API response envelope shapes ─────────────────────────────────────────────

/** Talkdesk list responses use HAL-style _embedded for the items array. */
interface EmbeddedCasesResponse {
  _embedded?: { cases?: RawTalkdeskCase[] }
  total?: number
  page?: number
  per_page?: number
  count?: number
}

interface SingleCaseResponse {
  id?: string
  [key: string]: unknown
}

interface EmbeddedNotesResponse {
  _embedded?: { notes?: RawTalkdeskCaseNote[] }
  total?: number
}

interface EmbeddedContactsResponse {
  _embedded?: { contacts?: RawTalkdeskContact[] }
  total?: number
}

interface SingleContactResponse {
  id?: string
  [key: string]: unknown
}

interface EmbeddedUsersResponse {
  _embedded?: { users?: RawTalkdeskAgent[] }
  total?: number
}

interface SingleUserResponse {
  id?: string
  [key: string]: unknown
}

interface EmbeddedTeamsResponse {
  _embedded?: { teams?: RawTalkdeskTeam[] }
  total?: number
}

interface SingleTeamResponse {
  teamId?: string
  id?: string
  [key: string]: unknown
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export class TalkdeskAdapter implements CustomerSupportAdapter {
  readonly platform = 'talkdesk'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private accountName: string | undefined
  private scopes: string[]
  private region: string | undefined

  constructor(config: TalkdeskAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.accountName = config.accountName
    this.scopes = config.scopes ?? DEFAULT_SCOPES
    this.region = config.region
  }

  /**
   * The account host and region decide every Talkdesk URL, and both are the
   * customer's. Asked for on the Connect page before the redirect.
   */
  oauthFields(): CredentialField[] {
    return talkdeskOauthFields()
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
      inputs?.['accountName'] ?? this.accountName,
      inputs?.['region'] ?? this.region,
    )
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return talkdeskExchangeCode(
      code,
      redirectUri,
      this.clientId,
      this.clientSecret,
      this.accountName,
      this.region,
    )
  }

  /** Exchange on the customer's account host and remember it with the credentials. */
  async exchangeCodeWithInputs(
    code: string,
    redirectUri: string,
    inputs: Record<string, string>,
  ): Promise<Credentials> {
    return talkdeskExchangeCode(
      code,
      redirectUri,
      this.clientId,
      this.clientSecret,
      inputs['accountName'] ?? this.accountName,
      inputs['region'] ?? this.region,
    )
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return talkdeskRefreshCredentials(credentials)
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyTalkdeskWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseTalkdeskWebhookEvents(payload)
  }

  private client(credentials: Credentials): TalkdeskClient {
    return new TalkdeskClient(credentials)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    return {
      'page[size]': params.limit ?? DEFAULT_PAGE_SIZE,
      ...(params['page'] ? { 'page[number]': String(params['page']) } : {}),
    }
  }

  // ── Tickets (Cases) ──────────────────────────────────────────────────────

  async listTickets(credentials: Credentials, params: QueryParams): Promise<Ticket[]> {
    const res = await this.client(credentials).get<EmbeddedCasesResponse>(
      '/cases',
      this.listParams(params),
    )
    return (res._embedded?.cases ?? []).map(transformTicket)
  }

  async getTicket(credentials: Credentials, id: string): Promise<Ticket> {
    const res = await this.client(credentials).get<SingleCaseResponse>(`/cases/${id}`)
    if (!res.id) throw new Error(`Talkdesk case ${id} not found`)
    return transformTicket(res as unknown as RawTalkdeskCase)
  }

  // ── Messages (Case Notes) ────────────────────────────────────────────────

  async listMessages(credentials: Credentials, ticketId: string, params: QueryParams): Promise<Message[]> {
    const res = await this.client(credentials).get<EmbeddedNotesResponse>(
      `/cases/${ticketId}/notes`,
      this.listParams(params),
    )
    return (res._embedded?.notes ?? []).map((n) => transformMessage(n, ticketId))
  }

  async getMessage(_credentials: Credentials, id: string): Promise<Message> {
    throw new Error(`Talkdesk case notes are case-scoped; call listMessages(ticketId). id=${id}`)
  }

  // ── Contacts ─────────────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const res = await this.client(credentials).get<EmbeddedContactsResponse>(
      '/contacts',
      this.listParams(params),
    )
    return (res._embedded?.contacts ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const res = await this.client(credentials).get<SingleContactResponse>(`/contacts/${id}`)
    if (!res.id) throw new Error(`Talkdesk contact ${id} not found`)
    return transformContact(res as unknown as RawTalkdeskContact)
  }

  // ── Users (Agents) ───────────────────────────────────────────────────────

  async listUsers(credentials: Credentials, params: QueryParams): Promise<User[]> {
    const res = await this.client(credentials).get<EmbeddedUsersResponse>(
      '/users',
      this.listParams(params),
    )
    return (res._embedded?.users ?? []).map(transformUser)
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    const res = await this.client(credentials).get<SingleUserResponse>(`/users/${id}`)
    if (!res.id) throw new Error(`Talkdesk user ${id} not found`)
    return transformUser(res as unknown as RawTalkdeskAgent)
  }

  // ── Teams ────────────────────────────────────────────────────────────────

  async listTeams(credentials: Credentials, params: QueryParams): Promise<Team[]> {
    const res = await this.client(credentials).get<EmbeddedTeamsResponse>(
      '/teams',
      this.listParams(params),
    )
    return (res._embedded?.teams ?? []).map(transformTeam)
  }

  async getTeam(credentials: Credentials, id: string): Promise<Team> {
    const res = await this.client(credentials).get<SingleTeamResponse>(`/teams/${id}`)
    if (!res.teamId && !res.id) throw new Error(`Talkdesk team ${id} not found`)
    return transformTeam(res as unknown as RawTalkdeskTeam)
  }
}
