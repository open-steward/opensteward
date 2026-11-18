/**
 * Kore.ai SmartAssist adapter for the customer-support vertical.
 *
 * Authentication: JWT (HS256) in `auth` header + `accountId` header.
 * All contact-center paths are tenant-scoped under:
 *   /agentassist/api/v1/public/{streamId}/…
 *
 * Supported resources:
 *   ✓ listTickets / getTicket       (conversations)
 *   ✓ listMessages                  (conversation history; getMessage not supported)
 *   ✓ listContacts / getContact     (contacts)
 *   ✓ listUsers   / getUser         (agents)
 *   ✓ listTeams   / getTeam         (queues)
 *
 * Not supported (no Kore.ai equivalent):
 *   ✗ listTags / getTag
 *   ✗ listMacros / getMacro
 *   ✗ verifyWebhook / parseWebhookEvents  (no inbound-webhook signature spec)
 *
 * Schema-firewall: no voice-recording bytes, no AI-assist transcripts
 * (TRIGGER_SUMMARY_EVENT omitted), no attachment content.
 */
import {
  connectionScope,
  cursorPagerKey,
  pageByRows,
  pageLocally,
  pageOffset,
  reportUpstreamPage,
  type CursorPage,
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
  getAuthUrlUnsupported,
} from './auth'
import { KoreAiClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'

import { transformTicket, type RawKoreAiConversation } from './transform/ticket'
import { transformMessage, type RawKoreAiMessage } from './transform/message'
import { transformContact, type RawKoreAiContact } from './transform/contact'
import { transformUser, type RawKoreAiAgent } from './transform/user'
import { transformTeam, type RawKoreAiQueue } from './transform/team'

// ── Response envelope types ──────────────────────────────────────────────────

interface PagedResponse<T> {
  results?: T[]
  skip?: number
  limit?: number
  hasMore?: boolean
  totalResults?: number
}

type AgentsResponse = PagedResponse<RawKoreAiAgent>
type QueuesResponse = PagedResponse<RawKoreAiQueue>

// ── Adapter config (no OAuth secrets needed — JWT is provided by operator) ──

export interface KoreAiAdapterConfig {
  /** Unused at runtime; preserved for interface parity with other adapters */
  _?: never
}

export class KoreAiAdapter implements CustomerSupportAdapter {
  readonly platform = 'kore-ai'
  readonly version = '0.1.0'

  constructor(_config?: KoreAiAdapterConfig) {}

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
    throw new Error('kore-ai uses static JWT auth; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // JWTs must be rotated by the operator; no refresh endpoint
    return credentials
  }

  // ── internal helpers ───────────────────────────────────────────────────────

  private client(credentials: Credentials): KoreAiClient {
    return new KoreAiClient(credentials)
  }

  /**
   * Pager scope for one connection: host + account + stream, fingerprinted by
   * the connection's token (see `connectionScope`).
   */
  private scope(credentials: Credentials): string {
    const extra = (credentials.extra ?? {}) as Record<string, string>
    return connectionScope(
      `kore-ai:${extra['host'] ?? ''}:${extra['accountId'] ?? ''}:${extra['streamId'] ?? ''}`,
      credentials,
    )
  }

  /**
   * One caller page of a `skip`/`limit` collection (/conversations, /contacts).
   * The upstream cursor is the absolute `skip` offset, advanced by the rows
   * actually received, so a server that silently serves fewer rows than the
   * `limit` asked (no maximum is documented) loses nothing. `hasMore` in the
   * envelope ends the walk.
   */
  private async skipLimitPage<R>(
    credentials: Credentials,
    path: '/conversations' | '/contacts',
    params: QueryParams,
  ): Promise<R[]> {
    const client = this.client(credentials)
    const limit = Math.max(1, Math.floor(params.limit ?? DEFAULT_PAGE_SIZE))
    // Row positions depend only on `skip`, never on the page size.
    const key = cursorPagerKey(this.scope(credentials), path, {})
    const result = await pageByRows<R, number>(
      key,
      params,
      async (skip): Promise<CursorPage<R, number>> => {
        const from = skip ?? 0
        const res = await client.get<PagedResponse<R>>(path, { limit, skip: from })
        const items = res.results ?? []
        return { items, next: res.hasMore && items.length > 0 ? from + items.length : undefined }
      },
      { defaultLimit: DEFAULT_PAGE_SIZE },
    )
    return result.items
  }

  // ── Tickets (conversations) ────────────────────────────────────────────────

  async listTickets(credentials: Credentials, params: QueryParams): Promise<Ticket[]> {
    const rows = await this.skipLimitPage<RawKoreAiConversation>(
      credentials,
      '/conversations',
      params,
    )
    return rows.map(transformTicket)
  }

  async getTicket(credentials: Credentials, id: string): Promise<Ticket> {
    const raw = await this.client(credentials).get<RawKoreAiConversation>(`/conversations/${id}`)
    return transformTicket(raw)
  }

  // ── Messages (conversation history) ───────────────────────────────────────

  async listMessages(
    credentials: Credentials,
    ticketId: string,
    params: QueryParams,
  ): Promise<Message[]> {
    // The get-single-conversation endpoint includes `notes` and `messages` arrays.
    const conv = await this.client(credentials).get<RawKoreAiConversation>(
      `/conversations/${ticketId}`,
    )
    const raw = conv as RawKoreAiConversation & {
      notes?: RawKoreAiMessage[]
      messages?: RawKoreAiMessage[]
    }
    const msgs: RawKoreAiMessage[] = [...(raw.notes ?? []), ...(raw.messages ?? [])]
    // The conversation carries every note/message inline and the endpoint
    // takes no paging parameter, so the whole list is in hand: page locally.
    return pageLocally(
      msgs.map((m) => transformMessage(m, ticketId)),
      params,
    )
  }

  // getMessage is intentionally absent — kore-ai messages are conversation-scoped
  // and cannot be fetched by message ID alone. The router will return 501.

  // ── Contacts ──────────────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const rows = await this.skipLimitPage<RawKoreAiContact>(credentials, '/contacts', params)
    return rows.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const raw = await this.client(credentials).get<RawKoreAiContact>(`/contacts/${id}`)
    return transformContact(raw)
  }

  // ── Users (agents) ────────────────────────────────────────────────────────

  async listUsers(credentials: Credentials, params: QueryParams): Promise<User[]> {
    const extra = (credentials.extra ?? {}) as Record<string, string>
    const orgId = extra['orgId'] ?? 'default'
    const client = this.client(credentials)
    const path = `/organizations/${orgId}/agents`
    // `page` is the only documented knob: the upstream page size is fixed, so
    // one upstream page is not one caller page. Walk upstream pages as rows.
    const key = cursorPagerKey(this.scope(credentials), path, {})
    const result = await pageByRows<RawKoreAiAgent, number>(
      key,
      params,
      async (page): Promise<CursorPage<RawKoreAiAgent, number>> => {
        const n = page ?? 1
        const res = await client.get<AgentsResponse>(path, { page: n })
        const items = res.results ?? []
        return { items, next: res.hasMore && items.length > 0 ? n + 1 : undefined }
      },
      { defaultLimit: DEFAULT_PAGE_SIZE },
    )
    return result.items.map(transformUser)
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    const extra = (credentials.extra ?? {}) as Record<string, string>
    const orgId = extra['orgId'] ?? 'default'
    const raw = await this.client(credentials).get<RawKoreAiAgent>(
      `/organizations/${orgId}/agents/${id}`,
    )
    return transformUser(raw)
  }

  // ── Teams (queues) ────────────────────────────────────────────────────────

  /**
   * GET /queues documents no query parameter at all (only the `host` and
   * `streamId` path parameters), yet answers in the paged envelope, so the
   * one request is the whole list unless the envelope says otherwise: it is
   * whole when `hasMore` is not true (the end signal the skip/page walks
   * above stop on), or when `totalResults` ("Total number of records
   * available across all pages") is no more than the rows returned. The
   * documented sample needs the second signal: one queue, `"hasMore": true`,
   * `"totalResults": 1`.
   *
   * Otherwise the rows past the first response are unreachable. Caller pages
   * inside the rows returned are still served (with `hasMore` true); a page
   * reaching past them is refused rather than served short, which would tell
   * a sync the collection ended there.
   */
  async listTeams(credentials: Credentials, params: QueryParams): Promise<Team[]> {
    const res = await this.client(credentials).get<QueuesResponse>('/queues')
    const rows = res.results ?? []
    const complete =
      res.hasMore !== true ||
      (typeof res.totalResults === 'number' && rows.length >= res.totalResults)
    if (complete) return pageLocally(rows, params).map(transformTeam)

    const limit = params.limit
    const size =
      typeof limit === 'number' && Number.isFinite(limit) && limit >= 1 ? Math.floor(limit) : 0
    const start = pageOffset(params, size)
    if (size === 0 || start + size > rows.length) {
      const total = typeof res.totalResults === 'number' ? ` of ${res.totalResults}` : ''
      throw Object.assign(
        new Error(
          `Kore.ai GET /queues returned ${rows.length}${total} queues and does not say the list ` +
            'is complete; it documents no request parameter to reach the rest, so this page ' +
            'cannot be listed.',
        ),
        { statusCode: 422, code: 'UPSTREAM_LIMIT' },
      )
    }
    reportUpstreamPage(params, { hasMore: true })
    return rows.slice(start, start + size).map(transformTeam)
  }

  async getTeam(credentials: Credentials, id: string): Promise<Team> {
    const raw = await this.client(credentials).get<RawKoreAiQueue>(`/queues/${id}`)
    return transformTeam(raw)
  }
}
