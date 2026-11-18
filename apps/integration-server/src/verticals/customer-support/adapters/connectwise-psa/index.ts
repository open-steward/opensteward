/**
 * ConnectWise PSA adapter — customer-support vertical.
 *
 * API-key (Basic) auth: companyId + publicKey : privateKey, encoded as Base64.
 * clientId header required on every request.
 *
 * Supported resources:
 *   - Tickets        → GET /service/tickets, /service/tickets/{id}
 *   - Messages       → GET /service/tickets/{id}/notes, /service/tickets/{id}/notes/{noteId}
 *   - Contacts       → GET /company/contacts, /company/contacts/{id}
 *   - Users (agents) → GET /system/members, /system/members/{id}
 *   - Teams          → GET /service/boards, /service/boards/{id}
 *
 * Not supported (ConnectWise PSA has no native equivalent):
 *   - Tags   (no tag entity; tagIds in Ticket is always [])
 *   - Macros (no canned-response entity)
 *
 * Schema-firewall: no attachment bytes, no voice/AI summaries, contact PII = email + name + phone.
 */
import { reportUpstreamPage, type Credentials, type CredentialField, type QueryParams } from '@opensteward/shared'
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
import { ConnectWisePsaClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'
import { verifyConnectwisePsaWebhook, parseConnectwisePsaWebhookEvents } from './webhook'

import { transformTicket, type RawCwTicket } from './transform/ticket'
import { transformMessage, type RawCwNote } from './transform/message'
import { transformContact, type RawCwContact } from './transform/contact'
import { transformUser, type RawCwMember } from './transform/user'
import { transformTeam, type RawCwBoard } from './transform/team'

// ConnectWise PSA REST responses are top-level arrays (no wrapper envelope)

export class ConnectwisePsaAdapter implements CustomerSupportAdapter {
  readonly platform = 'connectwise-psa'
  readonly version = '0.1.0'

  constructor(_config?: Record<string, unknown>) {}

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
    throw new Error('connectwise-psa uses static API key auth; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyConnectwisePsaWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseConnectwisePsaWebhookEvents(payload)
  }

  private client(credentials: Credentials): ConnectWisePsaClient {
    return new ConnectWisePsaClient(credentials)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    const pageSize = params.limit ?? DEFAULT_PAGE_SIZE
    // `page` is 1-based upstream too; an explicit upstream `cursor` still wins.
    const page = params['cursor'] ? Number(params['cursor']) : Math.max(1, Math.floor(params.page ?? 1))
    return { pageSize, page }
  }

  /**
   * One upstream page is one caller page (`page` + `pageSize`). The end comes
   * from the `Link` header ("potentially includes first, prev, next, and/or
   * last"): present without rel="next" is the last page. With no header the
   * router falls back to the short-page rule.
   */
  private async listPage<R>(
    credentials: Credentials,
    path: string,
    params: QueryParams,
    extra: Record<string, unknown> = {},
  ): Promise<R[]> {
    const { data, link } = await this.client(credentials).getPage<R[]>(path, {
      ...this.listParams(params),
      ...extra,
    })
    if (link !== undefined) {
      reportUpstreamPage(params, { hasMore: /rel="?next"?/i.test(link) })
    }
    return data ?? []
  }

  // ── Tickets ─────────────────────────────────────────────────────────────────

  async listTickets(credentials: Credentials, params: QueryParams): Promise<Ticket[]> {
    const res = await this.listPage<RawCwTicket>(credentials, '/service/tickets', params)
    return res.map(transformTicket)
  }

  async getTicket(credentials: Credentials, id: string): Promise<Ticket> {
    const res = await this.client(credentials).get<RawCwTicket>(`/service/tickets/${id}`)
    return transformTicket(res)
  }

  // ── Messages (ticket notes) ──────────────────────────────────────────────────

  async listMessages(credentials: Credentials, ticketId: string, params: QueryParams): Promise<Message[]> {
    const res = await this.listPage<RawCwNote>(credentials, `/service/tickets/${ticketId}/notes`, params)
    return res.map((n) => transformMessage(n, ticketId))
  }

  async getMessage(credentials: Credentials, id: string): Promise<Message> {
    // ConnectWise notes are ticket-scoped; without ticketId we cannot use the nested
    // /service/tickets/{ticketId}/notes/{id} path.  The flat /service/notes endpoint
    // accepts the same conditions query language and lets us look up a note by ID.
    const res = await this.client(credentials).get<RawCwNote[]>(
      '/service/notes',
      { conditions: `id=${id}`, pageSize: 1, page: 1 },
    )
    const note = res?.[0]
    if (!note) throw new Error(`ConnectWise PSA note ${id} not found`)
    const ticketId = String((note as Record<string, unknown>)['ticketId'] ?? '')
    return transformMessage(note, ticketId)
  }

  // ── Contacts ─────────────────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const res = await this.listPage<RawCwContact>(credentials, '/company/contacts', params)
    return res.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const res = await this.client(credentials).get<RawCwContact>(`/company/contacts/${id}`)
    return transformContact(res)
  }

  // ── Users (members / agents) ─────────────────────────────────────────────────

  async listUsers(credentials: Credentials, params: QueryParams): Promise<User[]> {
    const res = await this.listPage<RawCwMember>(credentials, '/system/members', params, {
      // Exclude inactive members and API-only accounts from the agent list
      // ConnectWise PSA conditions require single quotes around string literals
      conditions: "inactiveFlag=false AND licenseClass!='A'",
    })
    return res.map(transformUser)
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    const res = await this.client(credentials).get<RawCwMember>(`/system/members/${id}`)
    return transformUser(res)
  }

  // ── Teams (service boards) ────────────────────────────────────────────────────

  async listTeams(credentials: Credentials, params: QueryParams): Promise<Team[]> {
    const res = await this.listPage<RawCwBoard>(credentials, '/service/boards', params)
    return res.map(transformTeam)
  }

  async getTeam(credentials: Credentials, id: string): Promise<Team> {
    const res = await this.client(credentials).get<RawCwBoard>(`/service/boards/${id}`)
    return transformTeam(res)
  }

  // Tags and Macros are NOT supported by ConnectWise PSA; omitted (auto-501).
}
