/**
 * Jitbit Helpdesk adapter — customer-support vertical.
 *
 * Auth:       Bearer token (from /User/Token) OR Basic (username:password).
 *             Base URL stored in credentials.extra.baseUrl — required because
 *             Jitbit is available as SaaS (company.jitbit.com/helpdesk/api) and
 *             as self-hosted installations.
 *
 * Pagination (https://www.jitbit.com/docs/api/):
 *   - /Tickets pages by `offset` + `count` (max 300); cut into caller pages
 *     by pageByRows from upstream pages of 300.
 *   - /Users pages by `page` + `count` (default 500); contacts and users are
 *     filtered out of it client-side, so they are cut by pageByRows too.
 *   - /comments, /categories and /CommentTemplates take no paging parameter
 *     and return the whole collection, which pageLocally slices.
 *
 * Resources implemented:
 *   - Tickets      → GET /Tickets, GET /ticket?id=
 *   - Messages     → GET /comments?id=
 *   - Contacts     → GET /Users (non-tech, non-admin)
 *   - Users        → GET /Users (tech or admin)
 *   - Teams        → GET /categories (Categories as queues/teams)
 *   - Macros       → GET /CommentTemplates
 *
 * Not implemented (Jitbit has no standalone tags resource):
 *   - Tags         → listTags / getTag auto-501 via interface optional methods
 *
 * Webhooks: Jitbit does not document outbound webhook signature verification;
 *           verifyWebhook and parseWebhookEvents are not implemented.
 *
 * Schema-firewall: no attachment content, no voice/audio, no AI summaries.
 */
import {
  connectionScope,
  cursorPagerKey,
  pageByRows,
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
import type { Team } from '../../schema/team'
import type { Macro } from '../../schema/macro'

import { credentialFields as adapterCredentialFields, exchangeCredentials as adapterExchangeCredentials, getAuthUrlUnsupported } from './auth'
import { JitbitHelpdeskClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, USERS_PAGE_SIZE } from './constants'

import { transformTicket, type RawJitbitTicket } from './transform/ticket'
import { transformMessage, type RawJitbitComment } from './transform/message'
import { transformContact, type RawJitbitUser } from './transform/contact'
import { transformUser } from './transform/user'
import { transformTeam, type RawJitbitCategory } from './transform/team'
import { transformMacro, type RawJitbitCommentTemplate } from './transform/macro'

// Jitbit Helpdesk does not require OAuth config — all auth is via credentials
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface JitbitHelpdeskAdapterConfig {
  // intentionally empty — no client ID/secret needed for token/basic auth
}

export class JitbitHelpdeskAdapter implements CustomerSupportAdapter {
  readonly platform = 'jitbit-helpdesk'
  readonly version = '0.1.0'
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  constructor(_config: JitbitHelpdeskAdapterConfig) {}

  credentialFields(): CredentialField[] {
    return adapterCredentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>) {
    return adapterExchangeCredentials(fields)
  }

  getAuthUrl(_state: string, _overrideScopes?: string[]): string {
    return getAuthUrlUnsupported()
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('jitbit-helpdesk uses token/password auth; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // Token-based auth does not expire unless the user changes their password
    return credentials
  }

  private client(credentials: Credentials): JitbitHelpdeskClient {
    return new JitbitHelpdeskClient(credentials)
  }

  /** The helpdesk this connection talks to: SaaS subdomain or self-hosted URL. */
  private accountScope(credentials: Credentials): string {
    return String(credentials.extra?.['baseUrl'] ?? '').replace(/\/$/, '')
  }

  /**
   * GET /Users walked by its documented `page` + `count`, filtered to the
   * rows `keep` accepts, and cut into the caller's page.
   */
  private async pageUsers(
    credentials: Credentials,
    params: QueryParams,
    collection: string,
    keep: (u: RawJitbitUser) => boolean,
  ): Promise<RawJitbitUser[]> {
    const client = this.client(credentials)
    const key = cursorPagerKey(
      connectionScope(this.accountScope(credentials), credentials),
      collection,
      { count: USERS_PAGE_SIZE },
    )
    const { items } = await pageByRows<RawJitbitUser, number>(key, params, async (cursor) => {
      const page = cursor ?? 1
      const res = await client.get<RawJitbitUser[]>('/Users', { count: USERS_PAGE_SIZE, page })
      const rows = Array.isArray(res) ? res : []
      return {
        items: rows.filter(keep),
        next: rows.length >= USERS_PAGE_SIZE ? page + 1 : undefined,
      }
    })
    return items
  }

  // ── Tickets ──────────────────────────────────────────────────────────────

  async listTickets(credentials: Credentials, params: QueryParams): Promise<Ticket[]> {
    const client = this.client(credentials)
    if (params['cursor']) {
      // Legacy raw-offset cursor: one request at that offset.
      const items = await client.get<RawJitbitTicket[]>('/Tickets', {
        count: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
        offset: Number(params['cursor']),
        mode: 'all',
      })
      return (Array.isArray(items) ? items : []).map(transformTicket)
    }
    // GET /Tickets pages by `offset` + `count` (max 300) and reports no
    // total or next link, so the caller's page is cut from upstream pages of
    // 300 and a peek at the next one makes hasMore exact.
    const key = cursorPagerKey(
      connectionScope(this.accountScope(credentials), credentials),
      'tickets',
      { count: MAX_PAGE_SIZE, mode: 'all' },
    )
    const { items } = await pageByRows<RawJitbitTicket, number>(key, params, async (cursor) => {
      const offset = cursor ?? 0
      const res = await client.get<RawJitbitTicket[]>('/Tickets', {
        count: MAX_PAGE_SIZE,
        offset,
        mode: 'all',
      })
      const rows = Array.isArray(res) ? res : []
      return {
        items: rows,
        next: rows.length >= MAX_PAGE_SIZE ? offset + rows.length : undefined,
      }
    })
    return items.map(transformTicket)
  }

  async getTicket(credentials: Credentials, id: string): Promise<Ticket> {
    const item = await this.client(credentials).get<RawJitbitTicket>('/ticket', { id })
    if (!item || !item.IssueID) throw new Error(`jitbit-helpdesk ticket ${id} not found`)
    return transformTicket(item)
  }

  // ── Messages ─────────────────────────────────────────────────────────────

  async listMessages(credentials: Credentials, ticketId: string, params: QueryParams): Promise<Message[]> {
    // Jitbit returns all comments for a ticket in one call (no pagination)
    const items = await this.client(credentials).get<RawJitbitComment[]>('/comments', { id: ticketId })
    const all = (Array.isArray(items) ? items : []).map((c) => transformMessage(c, ticketId))
    return pageLocally(all, params)
  }

  async getMessage(_credentials: Credentials, id: string): Promise<Message> {
    // Jitbit comments are ticket-scoped; no single-comment endpoint
    throw new Error(`jitbit-helpdesk comments are ticket-scoped; call listMessages(ticketId). id=${id}`)
  }

  // ── Contacts (non-tech / non-admin users) ────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const items = await this.pageUsers(credentials, params, 'contacts', (u) => !u.IsTech && !u.IsAdmin)
    return items.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const item = await this.client(credentials).get<RawJitbitUser>('/User', { userId: id })
    if (!item || !item.UserID) throw new Error(`jitbit-helpdesk user ${id} not found`)
    return transformContact(item)
  }

  // ── Users (technicians + admins) ─────────────────────────────────────────

  async listUsers(credentials: Credentials, params: QueryParams): Promise<User[]> {
    const items = await this.pageUsers(credentials, params, 'users', (u) => Boolean(u.IsTech || u.IsAdmin))
    return items.map(transformUser)
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    const item = await this.client(credentials).get<RawJitbitUser>('/User', { userId: id })
    if (!item || !item.UserID) throw new Error(`jitbit-helpdesk user ${id} not found`)
    return transformUser(item)
  }

  // ── Teams (mapped from Categories) ───────────────────────────────────────

  async listTeams(credentials: Credentials, params: QueryParams): Promise<Team[]> {
    // Categories are returned in a flat list with no pagination
    const items = await this.client(credentials).get<RawJitbitCategory[]>('/categories')
    return pageLocally((Array.isArray(items) ? items : []).map(transformTeam), params)
  }

  async getTeam(credentials: Credentials, id: string): Promise<Team> {
    // No single-category endpoint; fetch all and find
    const items = await this.client(credentials).get<RawJitbitCategory[]>('/categories')
    const found = (Array.isArray(items) ? items : []).find((c) => String(c.CategoryID) === id)
    if (!found) throw new Error(`jitbit-helpdesk category ${id} not found`)
    return transformTeam(found)
  }

  // ── Macros (canned responses / comment templates) ────────────────────────

  async listMacros(credentials: Credentials, params: QueryParams): Promise<Macro[]> {
    // CommentTemplates are returned in a flat list
    const items = await this.client(credentials).get<RawJitbitCommentTemplate[]>('/CommentTemplates')
    return pageLocally((Array.isArray(items) ? items : []).map(transformMacro), params)
  }

  async getMacro(_credentials: Credentials, id: string): Promise<Macro> {
    // No single-template endpoint
    throw new Error(`jitbit-helpdesk has no single-template endpoint; call listMacros(). id=${id}`)
  }
}
