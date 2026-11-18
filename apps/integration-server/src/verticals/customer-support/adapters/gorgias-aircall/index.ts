/**
 * Pylon adapter for the customer-support vertical.
 *
 * Pylon is a B2B customer support platform. REST API at https://api.usepylon.com.
 * Auth: Bearer token (API key generated in the Pylon dashboard by Admins).
 * Pagination: cursor-based; list responses return { data: [], pagination: { cursor, has_next_page } }.
 *
 * Supported resources: issues (tickets), messages, contacts, users, tags, teams, macros.
 */
import {
  connectionScope,
  cursorPagerKey,
  pageByCursor,
  pageLocally,
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
import type { Macro } from '../../schema/macro'
import type { WebhookEvent } from '../../schema/webhook'

import { credentialFields as adapterCredentialFields, exchangeCredentials as adapterExchangeCredentials, getAuthUrlUnsupported } from './auth'
import { PylonClient } from './client'
import {
  DEFAULT_PAGE_SIZE,
  MAX_ISSUES_PAGE_SIZE,
  MAX_MESSAGES_PAGE_SIZE,
  MAX_PAGE_SIZE,
} from './constants'
import { verifyPylonWebhook, parsePylonWebhookEvents } from './webhook'

import { transformTicket, type RawPylonIssue } from './transform/ticket'
import { transformMessage, type RawPylonMessage } from './transform/message'
import { transformContact, type RawPylonContact } from './transform/contact'
import { transformUser, type RawPylonUser } from './transform/user'
import { transformTag, type RawPylonTag } from './transform/tag'
import { transformTeam, type RawPylonTeam } from './transform/team'
import { transformMacro, type RawPylonMacro } from './transform/macro'

// ── Pylon pagination wrapper ────────────────────────────────────────────────
interface PaginatedResponse<T> {
  data?: T[]
  pagination?: { cursor?: string; has_next_page?: boolean }
  request_id?: string
}

/**
 * The default /issues window a cursor walk was started under, per walk.
 *
 * Pylon mints an issues cursor under one start_time/end_time pair; a window
 * recomputed from the clock on every page would never match page 1 again.
 * Page 1 anchors the window, later pages reuse it. An idle anchor is dropped
 * after the cursor pager's own time-to-live, and a page past that starts a
 * fresh window — and so, through the pager key, a fresh walk.
 */
const WINDOW_TTL_MS = 60_000
const issueWindows = new Map<string, { start: string; end: string; at: number }>()

interface SingleResponse<T> {
  data?: T
  request_id?: string
}

export class GorgiasAircallAdapter implements CustomerSupportAdapter {
  readonly platform = 'gorgias-aircall'
  readonly version = '0.1.0'
  /**
   * Issues, contacts and messages page at the caller's size by cursor and
   * report their end; users, tags, teams and macros are paged locally.
   */
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

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
    throw new Error('gorgias-aircall (Pylon) uses static API key auth; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyPylonWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parsePylonWebhookEvents(payload)
  }

  private client(credentials: Credentials): PylonClient {
    return new PylonClient(credentials)
  }

  private pageSize(params: QueryParams, max: number): number {
    const raw = params.limit
    const n = typeof raw === 'number' && Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : DEFAULT_PAGE_SIZE
    return Math.min(n, max)
  }

  /**
   * One Pylon cursor page is one caller page: send the caller's size, carry
   * `pagination.cursor` forward while `has_next_page` is true.
   */
  private async cursorPage<R>(
    credentials: Credentials,
    path: string,
    params: QueryParams,
    max: number,
    filters: Record<string, unknown> = {},
  ): Promise<R[]> {
    const limit = this.pageSize(params, max)
    const key = cursorPagerKey(connectionScope('pylon', credentials), path, { ...filters, limit })
    const result = await pageByCursor<R, string>(key, params.page, async (cursor) => {
      const res = await this.client(credentials).get<PaginatedResponse<R>>(path, {
        ...filters,
        limit,
        ...(cursor !== undefined ? { cursor } : {}),
      })
      const next = res.pagination?.has_next_page && res.pagination.cursor ? res.pagination.cursor : null
      return { items: res.data ?? [], next }
    })
    reportUpstreamPage(params, { hasMore: result.hasMore })
    return result.items
  }

  // ── Issues (Tickets) ───────────────────────────────────────────────────────
  // Pylon's GET /issues requires start_time + end_time (max 30-day window).
  // When no time range is supplied we default to the past 30 days so the
  // adapter never throws on a plain listTickets() call. The default window is
  // anchored per walk (see issueWindows) so every page of one walk sends the
  // window its cursor was minted under.
  private issueWindow(credentials: Credentials, params: QueryParams): { start_time: string; end_time: string } {
    const givenStart = params['start_time'] as string | undefined
    const givenEnd = params['end_time'] as string | undefined
    const scope = cursorPagerKey(connectionScope('pylon', credentials), '/issues#window', {
      limit: this.pageSize(params, MAX_ISSUES_PAGE_SIZE),
      start_time: givenStart,
      end_time: givenEnd,
    })
    const now = Date.now()
    for (const [k, w] of issueWindows) if (now - w.at >= WINDOW_TTL_MS) issueWindows.delete(k)
    const page = typeof params.page === 'number' && params.page > 1 ? params.page : 1
    let anchor = page > 1 ? issueWindows.get(scope) : undefined
    if (!anchor) {
      const end = new Date(now)
      const start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000)
      anchor = { start: start.toISOString(), end: end.toISOString(), at: now }
    }
    anchor.at = now
    issueWindows.set(scope, anchor)
    return { start_time: givenStart ?? anchor.start, end_time: givenEnd ?? anchor.end }
  }

  async listTickets(credentials: Credentials, params: QueryParams): Promise<Ticket[]> {
    const rows = await this.cursorPage<RawPylonIssue>(
      credentials,
      '/issues',
      params,
      MAX_ISSUES_PAGE_SIZE,
      this.issueWindow(credentials, params),
    )
    return rows.map(transformTicket)
  }

  async getTicket(credentials: Credentials, id: string): Promise<Ticket> {
    const res = await this.client(credentials).get<SingleResponse<RawPylonIssue>>(`/issues/${id}`)
    if (!res.data) throw new Error(`Pylon issue ${id} not found`)
    return transformTicket(res.data)
  }

  // ── Messages ──────────────────────────────────────────────────────────────
  // Pylon has no GET /messages/{id} endpoint — messages are issue-scoped and
  // can only be retrieved via GET /issues/{id}/messages. The optional
  // getMessage interface method is deliberately omitted; use listMessages.
  async listMessages(credentials: Credentials, ticketId: string, params: QueryParams): Promise<Message[]> {
    const rows = await this.cursorPage<RawPylonMessage>(
      credentials,
      `/issues/${ticketId}/messages`,
      params,
      MAX_MESSAGES_PAGE_SIZE,
    )
    return rows.map((m) => transformMessage(m, ticketId))
  }

  // ── Contacts ───────────────────────────────────────────────────────────────
  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const rows = await this.cursorPage<RawPylonContact>(credentials, '/contacts', params, MAX_PAGE_SIZE)
    return rows.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const res = await this.client(credentials).get<SingleResponse<RawPylonContact>>(`/contacts/${id}`)
    if (!res.data) throw new Error(`Pylon contact ${id} not found`)
    return transformContact(res.data)
  }

  // ── Users (agents) ────────────────────────────────────────────────────────
  async listUsers(credentials: Credentials, params: QueryParams): Promise<User[]> {
    // /users documents no paging parameter: the whole list, paged locally.
    const res = await this.client(credentials).get<PaginatedResponse<RawPylonUser>>('/users')
    return pageLocally((res.data ?? []).map(transformUser), params)
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    const res = await this.client(credentials).get<SingleResponse<RawPylonUser>>(`/users/${id}`)
    if (!res.data) throw new Error(`Pylon user ${id} not found`)
    return transformUser(res.data)
  }

  // ── Tags ──────────────────────────────────────────────────────────────────
  async listTags(credentials: Credentials, params: QueryParams): Promise<Tag[]> {
    // /tags documents no paging parameter: the whole list, paged locally.
    const res = await this.client(credentials).get<PaginatedResponse<RawPylonTag>>('/tags')
    return pageLocally((res.data ?? []).map(transformTag), params)
  }

  async getTag(credentials: Credentials, id: string): Promise<Tag> {
    const res = await this.client(credentials).get<SingleResponse<RawPylonTag>>(`/tags/${id}`)
    if (!res.data) throw new Error(`Pylon tag ${id} not found`)
    return transformTag(res.data)
  }

  // ── Teams ─────────────────────────────────────────────────────────────────
  async listTeams(credentials: Credentials, params: QueryParams): Promise<Team[]> {
    // /teams documents no paging parameter: the whole list, paged locally.
    const res = await this.client(credentials).get<PaginatedResponse<RawPylonTeam>>('/teams')
    return pageLocally((res.data ?? []).map(transformTeam), params)
  }

  async getTeam(credentials: Credentials, id: string): Promise<Team> {
    const res = await this.client(credentials).get<SingleResponse<RawPylonTeam>>(`/teams/${id}`)
    if (!res.data) throw new Error(`Pylon team ${id} not found`)
    return transformTeam(res.data)
  }

  // ── Macros ────────────────────────────────────────────────────────────────
  async listMacros(credentials: Credentials, params: QueryParams): Promise<Macro[]> {
    // /macros documents no paging parameter: the whole list, paged locally.
    const res = await this.client(credentials).get<PaginatedResponse<RawPylonMacro>>('/macros')
    return pageLocally((res.data ?? []).map(transformMacro), params)
  }

  async getMacro(credentials: Credentials, id: string): Promise<Macro> {
    const res = await this.client(credentials).get<SingleResponse<RawPylonMacro>>(`/macros/${id}`)
    if (!res.data) throw new Error(`Pylon macro ${id} not found`)
    return transformMacro(res.data)
  }
}
