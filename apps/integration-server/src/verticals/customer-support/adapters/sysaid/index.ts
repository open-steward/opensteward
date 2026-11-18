/**
 * SysAid adapter — customer-support vertical.
 *
 * Connects to the SysAid Connect API v1 (https://developers.sysaid.com).
 * Auth: client-credentials OAuth2 (clientId + clientSecret + accountId).
 * Base URL: https://{account}.sysaidit.com/connect/v1
 *
 * Supported resources:
 *   - Tickets  (service-records)
 *   - Messages (service-record activities)
 *   - Contacts (end-users)
 *   - Users    (agents)
 *   - Teams    (groups)
 *
 * Not supported (no discrete API endpoints in SysAid):
 *   - Tags   → auto-501
 *   - Macros → auto-501
 *
 * Webhooks: SysAid does not document a webhook signature scheme for the
 * Connect API; verifyWebhook / parseWebhookEvents are intentionally omitted.
 */
// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: tag    — SysAid Connect API v1 has no tags/label endpoint (confirmed via developers.sysaid.com reference)
// Unavailable: macro  — SysAid Connect API v1 has no macros/canned-response endpoint (confirmed via developers.sysaid.com reference)
import {
  pageOffset,
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
import type { Team } from '../../schema/team'

import {
  credentialFields as adapterCredentialFields,
  exchangeCredentials as adapterExchangeCredentials,
  refreshSysaidCredentials,
  getAuthUrlUnsupported,
} from './auth'
import { SysaidClient } from './client'
import { SR_PAGE_SIZE, DEFAULT_PAGE_SIZE } from './constants'

import { transformTicket, type RawSysaidServiceRecord } from './transform/ticket'
import { transformMessage, type RawSysaidActivity } from './transform/message'
import { transformContact, type RawSysaidEndUser } from './transform/contact'
import { transformUser, type RawSysaidAgent } from './transform/user'
import { transformTeam, type RawSysaidGroup } from './transform/team'

// ─── Response envelope shapes ────────────────────────────────────────────────

interface SysaidPagedResponse<T> {
  data?: T[]
  items?: T[]
  results?: T[]
  total?: number
  totalCount?: number
}

export class SysaidAdapter implements CustomerSupportAdapter {
  readonly platform = 'sysaid'
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
    throw new Error('sysaid uses client-credentials auth; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return refreshSysaidCredentials(credentials)
  }

  private client(credentials: Credentials): SysaidClient {
    return new SysaidClient(credentials)
  }

  /**
   * `limit` and `offset` for one caller page. SysAid pages every list by
   * offset ("Calculated as `(page - 1) * limit` (page starts at 1)."), so the
   * offset strides by the size actually sent: the caller's limit, clamped to
   * the endpoint's documented maximum. A clamped size is reported as
   * `pageSize` so the router and sync worker judge the page at that size.
   */
  private pageParams(params: QueryParams, max: number): { limit: number; offset: number } {
    const asked = params.limit ?? max
    const limit = Math.min(asked, max)
    if (limit < asked) reportUpstreamPage(params, { pageSize: limit })
    return { limit, offset: pageOffset(params, limit) }
  }

  /**
   * The end of an offset page. The Pagination envelope carries `total`, "The
   * total number of elements across all pages."; /service-records/search
   * returns a bare array, so its end is a short page.
   */
  private reportPage<T>(
    params: QueryParams,
    res: SysaidPagedResponse<T> | T[],
    rows: number,
    sent: { limit: number; offset: number },
  ): void {
    const total = Array.isArray(res) ? undefined : (res.total ?? res.totalCount)
    if (typeof total === 'number') {
      reportUpstreamPage(params, { totalCount: total, hasMore: sent.offset + rows < total })
    } else {
      reportUpstreamPage(params, { hasMore: rows >= sent.limit })
    }
  }

  private extractItems<T>(res: SysaidPagedResponse<T> | T[]): T[] {
    if (Array.isArray(res)) return res
    return res.data ?? res.items ?? res.results ?? []
  }

  // ── Tickets ───────────────────────────────────────────────────────────────

  async listTickets(credentials: Credentials, params: QueryParams): Promise<Ticket[]> {
    const sent = this.pageParams(params, SR_PAGE_SIZE)
    const res = await this.client(credentials).get<SysaidPagedResponse<RawSysaidServiceRecord> | RawSysaidServiceRecord[]>(
      '/service-records/search',
      sent,
    )
    const rows = this.extractItems(res)
    this.reportPage(params, res, rows.length, sent)
    return rows.map(transformTicket)
  }

  async getTicket(credentials: Credentials, id: string): Promise<Ticket> {
    const raw = await this.client(credentials).get<RawSysaidServiceRecord>(
      `/service-records/${id}`,
    )
    return transformTicket(raw)
  }

  // ── Messages (activities scoped to a service record) ──────────────────────

  async listMessages(credentials: Credentials, ticketId: string, params: QueryParams): Promise<Message[]> {
    const sent = this.pageParams(params, DEFAULT_PAGE_SIZE)
    const res = await this.client(credentials).get<SysaidPagedResponse<RawSysaidActivity> | RawSysaidActivity[]>(
      '/activities/sr/search',
      {
        srIds: ticketId,
        ...sent,
      },
    )
    const rows = this.extractItems(res)
    this.reportPage(params, res, rows.length, sent)
    return rows.map((a) => transformMessage(a, ticketId))
  }

  // ── Contacts (end-users) ──────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const sent = this.pageParams(params, DEFAULT_PAGE_SIZE)
    const res = await this.client(credentials).get<SysaidPagedResponse<RawSysaidEndUser> | RawSysaidEndUser[]>(
      '/end-users',
      sent,
    )
    const rows = this.extractItems(res)
    this.reportPage(params, res, rows.length, sent)
    return rows.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const raw = await this.client(credentials).get<RawSysaidEndUser>(`/end-users/${id}`)
    return transformContact(raw)
  }

  // ── Users (agents) ────────────────────────────────────────────────────────

  async listUsers(credentials: Credentials, params: QueryParams): Promise<User[]> {
    const sent = this.pageParams(params, DEFAULT_PAGE_SIZE)
    const res = await this.client(credentials).get<SysaidPagedResponse<RawSysaidAgent> | RawSysaidAgent[]>(
      '/agents',
      { ...sent, expand: 'groups' },
    )
    const rows = this.extractItems(res)
    this.reportPage(params, res, rows.length, sent)
    return rows.map(transformUser)
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    const raw = await this.client(credentials).get<RawSysaidAgent>(`/agents/${id}`, { expand: 'groups' })
    return transformUser(raw)
  }

  // ── Teams (groups) ────────────────────────────────────────────────────────

  async listTeams(credentials: Credentials, params: QueryParams): Promise<Team[]> {
    const sent = this.pageParams(params, DEFAULT_PAGE_SIZE)
    const res = await this.client(credentials).get<SysaidPagedResponse<RawSysaidGroup> | RawSysaidGroup[]>(
      '/groups',
      sent,
    )
    const rows = this.extractItems(res)
    this.reportPage(params, res, rows.length, sent)
    return rows.map(transformTeam)
  }

  async getTeam(credentials: Credentials, id: string): Promise<Team> {
    const raw = await this.client(credentials).get<RawSysaidGroup>(`/groups/${id}`)
    return transformTeam(raw)
  }
}
