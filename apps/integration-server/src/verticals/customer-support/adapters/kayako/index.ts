/**
 * Kayako adapter for the customer-support vertical.
 *
 * Per-tenant subdomain (subdomain.kayako.com). Basic HTTP auth
 * (email:password Base64-encoded). REST API v1.
 *
 * Schema-firewall: no attachment content, no voice-recording bytes, no
 * AI-suggested-reply fields.
 *
 * Supported resources: tickets (cases), messages (posts), contacts (customers),
 * users (agents), tags, teams, macros.
 *
 * Tags in Kayako are case-scoped; there is no global tags listing endpoint,
 * so listTags / getTag are not implemented (auto-501).
 *
 * Webhooks: Kayako v1 does not publish a documented signature-verification
 * scheme; verifyWebhook and parseWebhookEvents are not implemented.
 */
import type { Credentials, CredentialField, QueryParams } from '@opensteward/shared'
import { pageLocally, pageOffset, reportUpstreamPage } from '@opensteward/shared'
import type { CustomerSupportAdapter } from '../../adapter/interface'
import type { Ticket } from '../../schema/ticket'
import type { Message } from '../../schema/message'
import type { Contact } from '../../schema/contact'
import type { User } from '../../schema/user'
import type { Team } from '../../schema/team'
import type { Macro } from '../../schema/macro'

import { credentialFields as adapterCredentialFields, exchangeCredentials as adapterExchangeCredentials, getAuthUrlUnsupported } from './auth'
import { KayakoClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_WALK_PAGES } from './constants'

import { transformTicket, type RawKayakoCase } from './transform/ticket'
import { transformMessage, type RawKayakoPost, type RawKayakoNote } from './transform/message'
import { transformContact, type RawKayakoContact } from './transform/contact'
import { transformUser, type RawKayakoAgent } from './transform/user'
import { transformTeam, type RawKayakoTeam } from './transform/team'
import { transformMacro, type RawKayakoMacro } from './transform/macro'

export interface KayakoAdapterConfig {
  /** Intentionally empty — Kayako uses per-user credentials (email + password + subdomain). */
  _?: never
}

/** Kayako API v1 list response envelope */
interface KayakoList<T> {
  status?: number
  data?: T[]
  total_count?: number
  next_url?: string | null
}

/** Kayako API v1 single-item response envelope */
interface KayakoSingle<T> {
  status?: number
  data?: T
}

/**
 * What one offset page says about the collection: `total_count` when Kayako sends it
 * ("the offset starts at 0 ... and ends at the total count - 1"), else only a short
 * page is known to be the last.
 */
function pageMeta(
  offset: number,
  limit: number,
  count: number,
  totalCount: number | undefined,
): { hasMore?: boolean; totalCount?: number } {
  if (typeof totalCount === 'number' && Number.isFinite(totalCount)) {
    return { totalCount, hasMore: offset + count < totalCount }
  }
  return count < limit ? { hasMore: false } : {}
}

export class KayakoAdapter implements CustomerSupportAdapter {
  readonly platform = 'kayako'
  readonly version = '0.1.0'

  constructor(_config?: KayakoAdapterConfig) {}

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
    throw new Error('kayako uses Basic HTTP auth; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  private client(credentials: Credentials): KayakoClient {
    return new KayakoClient(credentials)
  }

  /**
   * One caller page by offset. Kayako: "Offset-based It's the default pagination
   * style, which is supported by all resources. The current position in the
   * collection is controlled by the special offset argument."
   * (https://developer.kayako.com/api/v1/reference/pagination/). No maximum `limit`
   * is documented, so none is declared and the router's cap applies.
   */
  private async listPageOf<T>(
    credentials: Credentials,
    path: string,
    params: QueryParams,
    filters: Record<string, unknown> = {},
  ): Promise<T[]> {
    const limit = params.limit ?? DEFAULT_PAGE_SIZE
    const offset = pageOffset(params, limit)
    const res = await this.client(credentials).get<T[]>(path, { limit, offset, ...filters })
    const envelope = res as unknown as KayakoList<T>
    const rows = envelope.data ?? []
    reportUpstreamPage(params, pageMeta(offset, limit, rows.length, envelope.total_count))
    return rows
  }

  /**
   * Every row of an offset-paged collection, walked to its end by `total_count`
   * (or a short page when the response omits it). Throws rather than return a
   * partial collection that would then be paged locally as if it were whole. The
   * offset advances by the rows actually returned, not by the limit sent, so an
   * undocumented server-side cap on `limit` cannot skip rows.
   */
  private async listAllOf<T>(credentials: Credentials, path: string): Promise<T[]> {
    const client = this.client(credentials)
    const out: T[] = []
    let offset = 0
    for (let i = 0; i < MAX_WALK_PAGES; i++) {
      const res = await client.get<T[]>(path, { limit: DEFAULT_PAGE_SIZE, offset })
      const envelope = res as unknown as KayakoList<T>
      const rows = envelope.data ?? []
      out.push(...rows)
      const meta = pageMeta(offset, DEFAULT_PAGE_SIZE, rows.length, envelope.total_count)
      if (meta.hasMore === false || rows.length === 0) return out
      offset += rows.length
    }
    throw new Error(`Kayako ${path}: more than ${MAX_WALK_PAGES} pages; refusing to page a partial collection`)
  }

  // ── Tickets (cases) ──────────────────────────────────────────────────────

  async listTickets(credentials: Credentials, params: QueryParams): Promise<Ticket[]> {
    const rows = await this.listPageOf<RawKayakoCase>(credentials, '/cases', params)
    return rows.map(transformTicket)
  }

  async getTicket(credentials: Credentials, id: string): Promise<Ticket> {
    const res = await this.client(credentials).get<RawKayakoCase>(`/cases/${id}`)
    const envelope = res as unknown as KayakoSingle<RawKayakoCase>
    if (!envelope.data) throw new Error(`Kayako case ${id} not found`)
    return transformTicket(envelope.data)
  }

  // ── Messages (posts on a case) ───────────────────────────────────────────

  async listMessages(credentials: Credentials, ticketId: string, params: QueryParams): Promise<Message[]> {
    // Two collections merged into one createdAt order: one upstream page is not one
    // caller page, so both are walked to their end and the merge is paged locally.
    const [rawPosts, rawNotes] = await Promise.all([
      this.listAllOf<RawKayakoPost>(credentials, `/cases/${ticketId}/posts`),
      this.listAllOf<RawKayakoNote>(credentials, `/cases/${ticketId}/notes`),
    ])
    const posts = rawPosts.map((p) => transformMessage(p, ticketId))
    const notes = rawNotes.map((n) => transformMessage(n, ticketId))
    const merged = [...posts, ...notes].sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    return pageLocally(merged, params)
  }

  async getMessage(_credentials: Credentials, id: string): Promise<Message> {
    throw new Error(`Kayako posts are case-scoped; call listMessages(caseId). id=${id}`)
  }

  // ── Contacts (customers) ─────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const rows = await this.listPageOf<RawKayakoContact>(credentials, '/users', params, { role: 'CUSTOMER' })
    return rows.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const res = await this.client(credentials).get<RawKayakoContact>(`/users/${id}`)
    const envelope = res as unknown as KayakoSingle<RawKayakoContact>
    if (!envelope.data) throw new Error(`Kayako user ${id} not found`)
    return transformContact(envelope.data)
  }

  // ── Users (agents) ───────────────────────────────────────────────────────

  async listUsers(credentials: Credentials, params: QueryParams): Promise<User[]> {
    const rows = await this.listPageOf<RawKayakoAgent>(credentials, '/users', params, { role: 'AGENT' })
    return rows.map(transformUser)
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    const res = await this.client(credentials).get<RawKayakoAgent>(`/users/${id}`)
    const envelope = res as unknown as KayakoSingle<RawKayakoAgent>
    if (!envelope.data) throw new Error(`Kayako user ${id} not found`)
    return transformUser(envelope.data)
  }

  // ── Teams ─────────────────────────────────────────────────────────────────

  async listTeams(credentials: Credentials, params: QueryParams): Promise<Team[]> {
    const rows = await this.listPageOf<RawKayakoTeam>(credentials, '/teams', params)
    return rows.map(transformTeam)
  }

  async getTeam(credentials: Credentials, id: string): Promise<Team> {
    const res = await this.client(credentials).get<RawKayakoTeam>(`/teams/${id}`)
    const envelope = res as unknown as KayakoSingle<RawKayakoTeam>
    if (!envelope.data) throw new Error(`Kayako team ${id} not found`)
    return transformTeam(envelope.data)
  }

  // ── Macros ────────────────────────────────────────────────────────────────

  async listMacros(credentials: Credentials, params: QueryParams): Promise<Macro[]> {
    const rows = await this.listPageOf<RawKayakoMacro>(credentials, '/cases/macros', params)
    return rows.map(transformMacro)
  }

  async getMacro(credentials: Credentials, id: string): Promise<Macro> {
    const res = await this.client(credentials).get<RawKayakoMacro>(`/cases/macros/${id}`)
    const envelope = res as unknown as KayakoSingle<RawKayakoMacro>
    if (!envelope.data) throw new Error(`Kayako macro ${id} not found`)
    return transformMacro(envelope.data)
  }

  // ── Tags: no global listing endpoint in Kayako v1 — auto-501 ─────────────
  // listTags / getTag are intentionally omitted; the interface marks them optional.
}
