/**
 * Frappe Helpdesk adapter for the customer-support vertical.
 *
 * Frappe Helpdesk is a self-hosted, open-source support platform built on the
 * Frappe framework. It exposes all DocTypes via the standard Frappe REST API:
 *   GET  <siteUrl>/api/resource/<DocType>          — list
 *   GET  <siteUrl>/api/resource/<DocType>/<name>   — get single
 *
 * Auth: Authorization: token <api_key>:<api_secret>  (user-scoped token)
 *
 * Pagination: offset-based — limit_start + limit_page_length
 *
 * Supported resources:
 *   - tickets    (HD Ticket)
 *   - messages   (HD Ticket Comment — ticket-scoped)
 *   - contacts   (HD Customer)
 *   - users      (HD Agent)
 *   - teams      (HD Team)
 *   - tags       (HD Ticket Priority — nearest analog)
 *   - macros     (HD Saved Reply — nearest analog)
 *
 * Webhooks: Frappe Framework supports generic webhooks but does not expose a
 * signed-payload mechanism for HD-specific events. verifyWebhook and
 * parseWebhookEvents are therefore not implemented here.
 *
 * Docs:
 *   https://docs.frappe.io/framework/user/en/api/rest
 *   https://github.com/frappe/helpdesk
 */
import { pageOffset, reportUpstreamPage } from '@opensteward/shared'
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
  credentialFields as adapterCredentialFields,
  exchangeCredentials as adapterExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import { FrappeHelpdeskClient } from './client'
import {
  DEFAULT_PAGE_SIZE,
  DOCTYPE_TICKET,
  DOCTYPE_TICKET_COMMENT,
  DOCTYPE_CUSTOMER,
  DOCTYPE_AGENT,
  DOCTYPE_TEAM,
  DOCTYPE_TICKET_PRIORITY,
  DOCTYPE_SAVED_REPLY,
} from './constants'

import { transformTicket, type RawFrappeTicket } from './transform/ticket'
import { transformMessage, type RawFrappeComment } from './transform/message'
import { transformContact, type RawFrappeCustomer } from './transform/contact'
import { transformUser, type RawFrappeAgent } from './transform/user'
import { transformTag, type RawFrappePriority } from './transform/tag'
import { transformTeam, type RawFrappeTeam } from './transform/team'
import { transformMacro, type RawFrappeSavedReply } from './transform/macro'

// ── Frappe REST list/get response shapes ──────────────────────────────────
interface FrappeListResponse<T> {
  data?: T[]
}
interface FrappeDocResponse<T> {
  data?: T
}

// No OAuth config needed — credentials carry siteUrl + api_key:api_secret
export type FrappeHelpdeskAdapterConfig = Record<string, never>

export class FrappeHelpdeskAdapter implements CustomerSupportAdapter {
  readonly platform = 'frappe-helpdesk'
  readonly version = '0.1.0'

  constructor(_config?: FrappeHelpdeskAdapterConfig) {}

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
    throw new Error('Frappe Helpdesk uses API Key + Secret auth; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // API key tokens do not expire
    return credentials
  }

  // verifyWebhook and parseWebhookEvents are intentionally omitted:
  // Frappe Framework webhooks are generic and do not provide a signed-payload
  // mechanism specific to Frappe Helpdesk events.

  private client(credentials: Credentials): FrappeHelpdeskClient {
    return new FrappeHelpdeskClient(credentials)
  }

  /**
   * Build Frappe-style list query params.
   *
   * Frappe pages by row offset: "You can also page the results by providing
   * the limit_start and limit_page_length params."
   * (https://docs.frappe.io/framework/user/en/api/rest). `limit_start` is
   * 0-based, so page N starts at (N - 1) x the size sent. A legacy numeric
   * `cursor` (a raw offset) is still read when no `page` is given.
   */
  private listParams(params: QueryParams): { limit_page_length: number; limit_start: number } {
    const limit = params.limit ?? DEFAULT_PAGE_SIZE
    const legacy = params.page === undefined && params['cursor'] ? Number(params['cursor']) : NaN
    const start = Number.isFinite(legacy) && legacy >= 0 ? legacy : pageOffset(params, limit)
    return {
      limit_page_length: limit,
      limit_start: start,
    }
  }

  /**
   * The list response carries no count and no next link, so the only end
   * signal is a page shorter than the size asked for. Report that; a full
   * page reports nothing rather than guessing.
   */
  private reportEnd<T>(params: QueryParams, sent: { limit_page_length: number }, rows: T[]): T[] {
    if (rows.length < sent.limit_page_length) reportUpstreamPage(params, { hasMore: false })
    return rows
  }

  // ── Tickets ──────────────────────────────────────────────────────────────

  async listTickets(credentials: Credentials, params: QueryParams): Promise<Ticket[]> {
    const paging = this.listParams(params)
    const res = await this.client(credentials).get<FrappeListResponse<RawFrappeTicket>>(
      `/${encodeURIComponent(DOCTYPE_TICKET)}`,
      {
        ...paging,
        fields: JSON.stringify([
          'name', 'subject', 'status', 'priority', 'raised_by',
          'contact', 'agent_group', '_assign',
          'creation', 'modified', 'resolution_date',
          'feedback_rating', 'via_customer_portal',
        ]),
      },
    )
    return this.reportEnd(params, paging, res.data ?? []).map(transformTicket)
  }

  async getTicket(credentials: Credentials, id: string): Promise<Ticket> {
    const res = await this.client(credentials).get<FrappeDocResponse<RawFrappeTicket>>(
      `/${encodeURIComponent(DOCTYPE_TICKET)}/${encodeURIComponent(id)}`,
    )
    if (!res.data) throw new Error(`Frappe Helpdesk ticket ${id} not found`)
    return transformTicket(res.data)
  }

  // ── Messages ─────────────────────────────────────────────────────────────

  async listMessages(credentials: Credentials, ticketId: string, params: QueryParams): Promise<Message[]> {
    const paging = this.listParams(params)
    const res = await this.client(credentials).get<FrappeListResponse<RawFrappeComment>>(
      `/${encodeURIComponent(DOCTYPE_TICKET_COMMENT)}`,
      {
        ...paging,
        fields: JSON.stringify(['name', 'reference_ticket', 'commented_by', 'content', 'is_pinned', 'creation', 'modified']),
        filters: JSON.stringify([['reference_ticket', '=', ticketId]]),
      },
    )
    return this.reportEnd(params, paging, res.data ?? []).map((c) => transformMessage(c, ticketId))
  }

  // ── Contacts ─────────────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const paging = this.listParams(params)
    const res = await this.client(credentials).get<FrappeListResponse<RawFrappeCustomer>>(
      `/${encodeURIComponent(DOCTYPE_CUSTOMER)}`,
      {
        ...paging,
        fields: JSON.stringify(['name', 'customer_name', 'domain', 'image']),
      },
    )
    return this.reportEnd(params, paging, res.data ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const res = await this.client(credentials).get<FrappeDocResponse<RawFrappeCustomer>>(
      `/${encodeURIComponent(DOCTYPE_CUSTOMER)}/${encodeURIComponent(id)}`,
    )
    if (!res.data) throw new Error(`Frappe Helpdesk customer ${id} not found`)
    return transformContact(res.data)
  }

  // ── Users (agents) ───────────────────────────────────────────────────────

  async listUsers(credentials: Credentials, params: QueryParams): Promise<User[]> {
    const paging = this.listParams(params)
    const res = await this.client(credentials).get<FrappeListResponse<RawFrappeAgent>>(
      `/${encodeURIComponent(DOCTYPE_AGENT)}`,
      {
        ...paging,
        fields: JSON.stringify(['name', 'agent_name', 'user', 'is_active', 'availability']),
      },
    )
    return this.reportEnd(params, paging, res.data ?? []).map(transformUser)
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    const res = await this.client(credentials).get<FrappeDocResponse<RawFrappeAgent>>(
      `/${encodeURIComponent(DOCTYPE_AGENT)}/${encodeURIComponent(id)}`,
    )
    if (!res.data) throw new Error(`Frappe Helpdesk agent ${id} not found`)
    return transformUser(res.data)
  }

  // ── Tags (HD Ticket Priority — nearest analog) ───────────────────────────

  async listTags(credentials: Credentials, params: QueryParams): Promise<Tag[]> {
    const paging = this.listParams(params)
    const res = await this.client(credentials).get<FrappeListResponse<RawFrappePriority>>(
      `/${encodeURIComponent(DOCTYPE_TICKET_PRIORITY)}`,
      {
        ...paging,
        fields: JSON.stringify(['name', 'description', 'integer_value', 'disabled']),
      },
    )
    return this.reportEnd(params, paging, res.data ?? []).map(transformTag)
  }

  async getTag(credentials: Credentials, id: string): Promise<Tag> {
    const res = await this.client(credentials).get<FrappeDocResponse<RawFrappePriority>>(
      `/${encodeURIComponent(DOCTYPE_TICKET_PRIORITY)}/${encodeURIComponent(id)}`,
    )
    if (!res.data) throw new Error(`Frappe Helpdesk ticket priority ${id} not found`)
    return transformTag(res.data)
  }

  // ── Teams ────────────────────────────────────────────────────────────────

  async listTeams(credentials: Credentials, params: QueryParams): Promise<Team[]> {
    const paging = this.listParams(params)
    const res = await this.client(credentials).get<FrappeListResponse<RawFrappeTeam>>(
      `/${encodeURIComponent(DOCTYPE_TEAM)}`,
      {
        ...paging,
        fields: JSON.stringify(['name', 'team_name', 'disabled']),
      },
    )
    return this.reportEnd(params, paging, res.data ?? []).map(transformTeam)
  }

  async getTeam(credentials: Credentials, id: string): Promise<Team> {
    const res = await this.client(credentials).get<FrappeDocResponse<RawFrappeTeam>>(
      `/${encodeURIComponent(DOCTYPE_TEAM)}/${encodeURIComponent(id)}`,
    )
    if (!res.data) throw new Error(`Frappe Helpdesk team ${id} not found`)
    return transformTeam(res.data)
  }

  // ── Macros (HD Saved Reply) ───────────────────────────────────────────────

  async listMacros(credentials: Credentials, params: QueryParams): Promise<Macro[]> {
    const paging = this.listParams(params)
    const res = await this.client(credentials).get<FrappeListResponse<RawFrappeSavedReply>>(
      `/${encodeURIComponent(DOCTYPE_SAVED_REPLY)}`,
      {
        ...paging,
        fields: JSON.stringify(['name', 'title', 'message', 'team']),
      },
    )
    return this.reportEnd(params, paging, res.data ?? []).map(transformMacro)
  }

  async getMacro(credentials: Credentials, id: string): Promise<Macro> {
    const res = await this.client(credentials).get<FrappeDocResponse<RawFrappeSavedReply>>(
      `/${encodeURIComponent(DOCTYPE_SAVED_REPLY)}/${encodeURIComponent(id)}`,
    )
    if (!res.data) throw new Error(`Frappe Helpdesk saved reply ${id} not found`)
    return transformMacro(res.data)
  }
}
