/**
 * Smartsupp adapter for the customer-support vertical.
 *
 * Auth: static API key (Bearer token).
 * Base URL: https://api.smartsupp.com/v2
 * Docs: https://docs.smartsupp.com/rest-api/
 *
 * Supported resources:
 *   - Tickets   → Conversations  (POST /conversations/search, GET /conversations/{id})
 *   - Messages  → Messages       (GET /conversations/{id}/messages, GET /messages/{id})
 *   - Contacts  → Contacts       (GET /contacts/{id}, GET /contacts/find)
 *   - Users     → Agents         (GET /agents, GET /agents/{id})
 *   - Tags      → Tags           (GET /tags)
 *
 * NOT supported (auto-501): Teams, Macros — Smartsupp v2 OpenAPI spec has no equivalent endpoints.
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: macro — Smartsupp has no macros/canned-response REST API endpoint; shortcuts are UI-only and not exposed in the v2 OpenAPI spec.
 * Unavailable: team  — Smartsupp has no teams/groups REST API endpoint; groups are UI-only routing rules with no v2 API representation.
 *
 * Pagination: cursor-based. POST /conversations/search uses `after` array.
 *             GET /conversations/{id}/messages uses `after` numeric cursor.
 */
import type { Credentials, CredentialField, QueryParams } from '@opensteward/shared'
import {
  connectionScope,
  cursorPagerKey,
  pageByCursor,
  pageLocally,
  reportUpstreamPage,
} from '@opensteward/shared'
import type { CustomerSupportAdapter } from '../../adapter/interface'
import type { Ticket } from '../../schema/ticket'
import type { Message } from '../../schema/message'
import type { Contact } from '../../schema/contact'
import type { User } from '../../schema/user'
import type { Tag } from '../../schema/tag'
import type { WebhookEvent } from '../../schema/webhook'

import {
  credentialFields as adapterCredentialFields,
  exchangeCredentials as adapterExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import { SmartsuppClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'
import { verifySmartsuppWebhook, parseSmartsuppWebhookEvents } from './webhook'

import { transformTicket, type RawSmartsuppConversation } from './transform/ticket'
import { transformMessage, type RawSmartsuppMessage } from './transform/message'
import { transformContact, type RawSmartsuppContact } from './transform/contact'
import { transformUser, type RawSmartsuppAgent } from './transform/user'
import { transformTag, type RawSmartsuppTag } from './transform/tag'

// Response envelope shapes
interface ConversationsSearchResponse {
  total?: number
  after?: number[] | null
  items?: RawSmartsuppConversation[]
}

type ConversationResponse = RawSmartsuppConversation

interface MessagesResponse {
  total?: number
  after?: number[] | null
  items?: RawSmartsuppMessage[]
}

/**
 * GET /agents ("List agents") declares no parameters and answers
 * `{ agents: agent[] }` with `"required": ["agents"]`
 * (https://api.smartsupp.com/v2/specs/open-api.json).
 */
interface AgentsResponse {
  agents: RawSmartsuppAgent[]
}

export class SmartsuppAdapter implements CustomerSupportAdapter {
  readonly platform = 'smartsupp'
  readonly version = '0.1.0'

  // No OAuth config needed — API key only
  constructor(_config?: Record<string, unknown>) {}

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
    throw new Error('smartsupp uses static API key auth; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifySmartsuppWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseSmartsuppWebhookEvents(payload)
  }

  private client(credentials: Credentials): SmartsuppClient {
    return new SmartsuppClient(credentials)
  }

  /**
   * One caller page of a list Smartsupp pages with `after` (docs Overview ->
   * Pagination: repeat the same `size` and `sort`, add the previous response's
   * `after`, until `after` is null). Page N follows the chain from page 1
   * through the shared cursor pager. An explicit caller `cursor` is one request
   * at that position, as before.
   */
  private async cursorPage<T>(
    credentials: Credentials,
    collection: string,
    query: Record<string, unknown>,
    params: QueryParams,
    fetch: (after: number[] | undefined) => Promise<{ items: T[]; next?: number[] | null }>,
  ): Promise<T[]> {
    const fetchPage = async (after: number[] | undefined) => {
      const res = await fetch(after)
      const next = Array.isArray(res.next) && res.next.length > 0 ? res.next : undefined
      return { items: res.items, next }
    }
    const pageSize = Number(query['size'])
    if (params['cursor']) {
      const one = await fetchPage([Number(params['cursor'])])
      reportUpstreamPage(params, { hasMore: one.next !== undefined, pageSize })
      return one.items
    }
    const key = cursorPagerKey(connectionScope('smartsupp', credentials), collection, query)
    const result = await pageByCursor<T, number[]>(key, params.page, fetchPage)
    reportUpstreamPage(params, { hasMore: result.hasMore, pageSize })
    return result.items
  }

  // ── Tickets (Conversations) ───────────────────────────────────────────────

  async listTickets(credentials: Credentials, params: QueryParams): Promise<Ticket[]> {
    const size = params.limit ?? DEFAULT_PAGE_SIZE
    const body: Record<string, unknown> = {
      size,
      sort: [{ createdAt: 'asc' }],
    }
    const client = this.client(credentials)
    return this.cursorPage(credentials, 'conversations', body, params, async (after) => {
      const res = await client.post<ConversationsSearchResponse>('/conversations/search', {
        ...body,
        ...(after !== undefined ? { after } : {}),
      })
      return { items: (res.items ?? []).map(transformTicket), next: res.after }
    })
  }

  async getTicket(credentials: Credentials, id: string): Promise<Ticket> {
    const res = await this.client(credentials).get<ConversationResponse>(`/conversations/${id}`)
    return transformTicket(res)
  }

  // ── Messages ─────────────────────────────────────────────────────────────

  async listMessages(
    credentials: Credentials,
    ticketId: string,
    params: QueryParams,
  ): Promise<Message[]> {
    const query: Record<string, unknown> = {
      size: params.limit ?? DEFAULT_PAGE_SIZE,
      sort: 'asc',
    }
    const client = this.client(credentials)
    return this.cursorPage(credentials, `messages:${ticketId}`, query, params, async (after) => {
      // The query parameter `after` is a number; the response's `after` is the
      // one-element array the next request continues from.
      const res = await client.get<MessagesResponse>(`/conversations/${ticketId}/messages`, {
        ...query,
        ...(after !== undefined && after.length > 0 ? { after: after[0] } : {}),
      })
      return { items: (res.items ?? []).map((m) => transformMessage(m, ticketId)), next: res.after }
    })
  }

  async getMessage(credentials: Credentials, id: string): Promise<Message> {
    const res = await this.client(credentials).get<RawSmartsuppMessage>(`/messages/${id}`)
    const ticketId = pickStr(res.conversation_id) ?? ''
    return transformMessage(res, ticketId)
  }

  // ── Contacts ─────────────────────────────────────────────────────────────

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const res = await this.client(credentials).get<RawSmartsuppContact>(`/contacts/${id}`)
    return transformContact(res)
  }

  // ── Users (Agents) ───────────────────────────────────────────────────────

  async listUsers(credentials: Credentials, params: QueryParams): Promise<User[]> {
    // GET /agents takes no paging parameters and returns every agent at once.
    const res = await this.client(credentials).get<AgentsResponse>('/agents')
    return pageLocally((Array.isArray(res.agents) ? res.agents : []).map(transformUser), params)
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    const res = await this.client(credentials).get<RawSmartsuppAgent>(`/agents/${id}`)
    return transformUser(res)
  }

  // ── Tags ─────────────────────────────────────────────────────────────────

  async listTags(credentials: Credentials, params: QueryParams): Promise<Tag[]> {
    // GET /tags takes no paging parameters and returns every tag as one array.
    const res = await this.client(credentials).get<RawSmartsuppTag[]>('/tags')
    return pageLocally((Array.isArray(res) ? res : []).map(transformTag), params)
  }

  async getTag(_credentials: Credentials, _id: string): Promise<Tag> {
    throw new Error(
      'smartsupp does not provide a single-tag endpoint (GET /tags/{id}); use listTags() to retrieve all tags',
    )
  }
}

function pickStr(v: unknown): string | undefined {
  if (typeof v === 'string' && v.length > 0) return v
  if (v == null) return undefined
  return String(v)
}
