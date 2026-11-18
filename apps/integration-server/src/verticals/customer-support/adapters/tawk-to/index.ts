/**
 * tawk.to adapter for the customer-support vertical.
 *
 * Auth: HTTP Basic Authentication using the API key as the username
 * (empty password). The REST API v1 is RPC-style — all reads use POST.
 *
 * Supported resources:
 *   - tickets  (ticket.list / not individually gettable by ID in public API)
 *   - messages (returned inside chat transcripts; listMessages uses chat.list)
 *   - users    (agent.me — returns the authenticated agent only)
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: contact — no contact list or read endpoint; official tawk.to rep
 *              confirmed contacts cannot be read or created via the REST API
 * Unavailable: macro   — no canned-reply or macro endpoint in the REST API
 * Unavailable: tag     — no tag list endpoint; tags are stat-filter dimensions only
 * Unavailable: team    — no team or department list endpoint in the REST API
 *
 * Webhooks: HMAC-SHA1 via X-Tawk-Signature header.
 *   Events: chat:start, chat:end, chat:transcript_created, ticket:create
 *
 * Docs: https://help.tawk.to/article/rest-api
 *       https://developer.tawk.to/webhooks/
 */
import type { Credentials, CredentialField, QueryParams } from '@opensteward/shared'
import { pageLocally } from '@opensteward/shared'
import type { CustomerSupportAdapter } from '../../adapter/interface'
import type { Ticket } from '../../schema/ticket'
import type { Message } from '../../schema/message'
import type { User } from '../../schema/user'
import type { WebhookEvent } from '../../schema/webhook'

import {
  credentialFields as adapterCredentialFields,
  exchangeCredentials as adapterExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import { TawkToClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'
import { verifyTawkToWebhook, parseTawkToWebhookEvents } from './webhook'
import { transformTicket, type RawTawkToTicket } from './transform/ticket'
import { transformMessage, type RawTawkToMessage } from './transform/message'
import { transformUser, type RawTawkToAgent } from './transform/user'

export interface TawkToAdapterConfig {
  // tawk.to uses API key auth — no OAuth client credentials required.
  // Config object kept for interface compatibility.
  propertyId?: string
}

/** Standard list response envelope from tawk.to REST API v1 */
interface ListResponse<T> {
  ok?: boolean
  total?: number
  data?: T[]
}

/** tawk.to chat object returned by chat.list */
interface RawTawkToChat {
  _id?: string
  id?: string
  visitor?: { name?: string; email?: string; city?: string; country?: string }
  agents?: Array<{ _id?: string; id?: string | number; fullName?: string; email?: string }>
  messages?: RawTawkToMessage[]
  status?: string
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

export class TawkToAdapter implements CustomerSupportAdapter {
  readonly platform = 'tawk-to'
  readonly version = '0.1.0'

  private readonly config: TawkToAdapterConfig

  constructor(config: TawkToAdapterConfig) {
    this.config = config
  }

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
    throw new Error('tawk-to uses API key auth; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyTawkToWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseTawkToWebhookEvents(payload)
  }

  private client(credentials: Credentials): TawkToClient {
    return new TawkToClient(credentials)
  }

  private pageBody(params: QueryParams, extra?: Record<string, unknown>): Record<string, unknown> {
    const body: Record<string, unknown> = {
      size: params.limit ?? DEFAULT_PAGE_SIZE,
    }
    if (params['page']) body['page'] = Number(params['page'])
    if (this.config.propertyId) body['propertyId'] = this.config.propertyId
    if (extra) Object.assign(body, extra)
    return body
  }

  // ── Tickets ──────────────────────────────────────────────────────────────

  async listTickets(credentials: Credentials, params: QueryParams): Promise<Ticket[]> {
    const res = await this.client(credentials).post<ListResponse<RawTawkToTicket>>(
      '/ticket.list',
      this.pageBody(params),
    )
    return (res.data ?? []).map(transformTicket)
  }

  // tawk.to v1 does not expose a single-ticket-by-id endpoint publicly.
  // Returning a minimal stub that re-lists and filters; callers should prefer listTickets.
  async getTicket(credentials: Credentials, id: string): Promise<Ticket> {
    const res = await this.client(credentials).post<ListResponse<RawTawkToTicket>>('/ticket.list', {
      ...(this.config.propertyId ? { propertyId: this.config.propertyId } : {}),
      size: 100,
    })
    const found = (res.data ?? []).find(
      (t) => (t._id ?? t.id) === id || String(t.humanId) === id,
    )
    if (!found) throw new Error(`tawk-to ticket ${id} not found`)
    return transformTicket(found)
  }

  // ── Messages (scoped to a chat/ticket) ───────────────────────────────────

  async listMessages(credentials: Credentials, ticketId: string, params: QueryParams): Promise<Message[]> {
    // Retrieve chats and find the matching chat; extract its messages array.
    const res = await this.client(credentials).post<ListResponse<RawTawkToChat>>(
      '/chat.list',
      this.pageBody(params),
    )
    const chat = (res.data ?? []).find((c) => (c._id ?? c.id) === ticketId)
    if (!chat) return []
    return (chat.messages ?? []).map((m, i) => transformMessage(m, ticketId, i))
  }

  async getMessage(_credentials: Credentials, id: string): Promise<Message> {
    throw new Error(`tawk-to messages are chat-scoped; call listMessages(chatId). id=${id}`)
  }

  // ── Users (agents) ───────────────────────────────────────────────────────

  // agent.me returns ONE agent object ("Get the current agent’s details",
  // https://help.tawk.to/article/rest-api) and takes no paging parameters, so
  // the whole collection is that single row: page it locally so page 2 is
  // empty instead of repeating page 1.
  async listUsers(credentials: Credentials, params: QueryParams): Promise<User[]> {
    const res = await this.client(credentials).post<RawTawkToAgent>('/agent.me', {})
    return pageLocally([transformUser(res)], params)
  }

  async getUser(credentials: Credentials, _id: string): Promise<User> {
    const res = await this.client(credentials).post<RawTawkToAgent>('/agent.me', {})
    return transformUser(res)
  }
}
