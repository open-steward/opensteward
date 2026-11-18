/**
 * Userlike adapter for the customer-support vertical.
 *
 * Userlike (now Lime Connect) JSON API v3.
 * Base URL: https://api.userlike.com/api/um/v3/
 * Auth: bare API token in `Authorization` header (no "Bearer" prefix).
 *
 * Supported resources:
 *   - Conversations → Tickets  (GET /conversations/all/)
 *   - Messages      → Messages (GET /conversations/{id}/messages/)
 *   - Contacts      → Contacts (GET /contact_identities/all/)
 *   - Operators     → Users    (GET /operators/)
 *
 * Unsupported (no API surface): Tags, Teams (standalone), Macros.
 * Webhooks: Userlike Add-on API uses unsigned POST callbacks; no
 *   signature verification is documented, so webhook methods are omitted.
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: macro — Lime Connect JSON API v3 has no macros/canned-responses endpoint; feature is UI-only.
 * Unavailable: tag   — Lime Connect JSON API v3 has no tags endpoint; conversation tags not accessible via REST.
 * Unavailable: team  — Lime Connect JSON API v3 has no teams/groups endpoint; operator grouping not exposed via REST.
 */
import {
  connectionScope,
  cursorPagerKey,
  pageByCursor,
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

import {
  credentialFields as adapterCredentialFields,
  exchangeCredentials as adapterExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import { UserlikeClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformTicket, type RawUserlikeConversation } from './transform/ticket'
import { transformMessage, type RawUserlikeMessage } from './transform/message'
import { transformContact, type RawUserlikeContact } from './transform/contact'
import { transformUser, type RawUserlikeOperator } from './transform/user'

// ── Paginated list response shape ────────────────────────────────────────────
interface PagedResponse<T> {
  count?: number
  next?: string | null
  previous?: string | null
  results?: T[]
}

/** The `cursor` query value of a response's `next` link, or undefined at the end. */
function nextCursor(next: string | null | undefined): string | undefined {
  if (!next) return undefined
  try {
    return new URL(next, 'https://api.userlike.com').searchParams.get('cursor') || undefined
  } catch {
    return undefined
  }
}

export class UserlikeAdapter implements CustomerSupportAdapter {
  readonly platform = 'userlike'
  readonly version = '0.1.0'
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  // Config is unused (static API key auth); kept for interface parity
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
    throw new Error('userlike uses static API token auth; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  private client(credentials: Credentials): UserlikeClient {
    return new UserlikeClient(credentials)
  }

  /** The caller's limit, clamped to the documented maximum of 100. */
  private pageSize(params: QueryParams): number {
    return Math.min(Math.max(1, Math.floor(params.limit ?? DEFAULT_PAGE_SIZE)), MAX_PAGE_SIZE)
  }

  /**
   * One caller page of a cursor-paginated endpoint (`/conversations/all/`,
   * `/contact_identities/all/`, `/conversations/{id}/messages/`).
   *
   * Docs: "You can provide us with a resource reference in the cursor query
   * parameter ... Responses you receive will have a next link and a previous
   * link with the correct cursor set if there are resources that come before
   * or after the results list." Only the `cursor` value of the next link is
   * carried: the documented next link of the /all/ endpoints drops `/all/`.
   */
  private async cursorList<R>(credentials: Credentials, path: string, params: QueryParams): Promise<R[]> {
    const client = this.client(credentials)
    const limit = this.pageSize(params)
    const key = cursorPagerKey(connectionScope('userlike', credentials), path, { limit })
    const result = await pageByCursor<R, string>(key, params.page, async (cursor) => {
      const res = await client.get<PagedResponse<R>>(path, {
        limit,
        ordering: 'id',
        ...(cursor !== undefined ? { cursor } : {}),
      })
      return { items: res.results ?? [], next: nextCursor(res.next) }
    })
    reportUpstreamPage(params, { hasMore: result.hasMore })
    return result.items
  }

  // ── Tickets (Conversations) ───────────────────────────────────────────────

  async listTickets(credentials: Credentials, params: QueryParams): Promise<Ticket[]> {
    const rows = await this.cursorList<RawUserlikeConversation>(credentials, '/conversations/all/', params)
    return rows.map(transformTicket)
  }

  async getTicket(credentials: Credentials, id: string): Promise<Ticket> {
    const raw = await this.client(credentials).get<RawUserlikeConversation>(`/conversations/${id}/`)
    return transformTicket(raw)
  }

  // ── Messages ─────────────────────────────────────────────────────────────

  async listMessages(credentials: Credentials, ticketId: string, params: QueryParams): Promise<Message[]> {
    const rows = await this.cursorList<RawUserlikeMessage>(
      credentials,
      `/conversations/${ticketId}/messages/`,
      params,
    )
    return rows.map((m) => transformMessage(m, ticketId))
  }

  // ── Contacts ─────────────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const rows = await this.cursorList<RawUserlikeContact>(credentials, '/contact_identities/all/', params)
    return rows.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const raw = await this.client(credentials).get<RawUserlikeContact>(`/contact_identities/${id}/`)
    return transformContact(raw)
  }

  // ── Users (Operators) ────────────────────────────────────────────────────

  /**
   * `/operators/` uses limit/offset pagination: "The result will also contain
   * the total number of existing resource items and provide links to the
   * previous and next results page (if applicable)."
   */
  async listUsers(credentials: Credentials, params: QueryParams): Promise<User[]> {
    const limit = this.pageSize(params)
    const offset = pageOffset(params, limit)
    const res = await this.client(credentials).get<PagedResponse<RawUserlikeOperator>>('/operators/', {
      limit,
      ...(offset > 0 ? { offset } : {}),
    })
    reportUpstreamPage(params, {
      hasMore: res.next != null && res.next !== '',
      ...(typeof res.count === 'number' ? { totalCount: res.count } : {}),
    })
    return (res.results ?? []).map(transformUser)
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    const raw = await this.client(credentials).get<RawUserlikeOperator>(`/operators/${id}/`)
    return transformUser(raw)
  }
}
