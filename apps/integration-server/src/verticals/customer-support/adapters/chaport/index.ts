/**
 * Chaport adapter for the customer-support vertical.
 *
 * Auth: API key (Bearer token generated in Settings → API).
 * Base URL: https://app.chaport.com/api/v1
 *
 * Resource mapping:
 *   Contacts  → Visitors  (GET /visitors, GET /visitors/:id)
 *   Users     → Operators (GET /operators, GET /operators/:id)
 *   Tickets   → Chats     (visitor-scoped; ticket id = "visitorId:chatId")
 *   Messages  → Chat events (GET /visitors/:visitorId/chats/:chatId/events)
 *   Tags / Teams / Macros → not available in Chaport API (omitted; auto-501)
 *
 * Webhook signature: Chaport does not document HMAC verification; verifyWebhook
 * is intentionally omitted. parseWebhookEvents handles the event payload shape.
 */
import type { Credentials, CredentialField, QueryParams } from '@opensteward/shared'
import type { CustomerSupportAdapter } from '../../adapter/interface'
import type { Ticket } from '../../schema/ticket'
import type { Message } from '../../schema/message'
import type { Contact } from '../../schema/contact'
import type { User } from '../../schema/user'
import type { WebhookEvent } from '../../schema/webhook'
import type { WebhookAction, WebhookResourceType } from '../../schema/webhook'

import { credentialFields as adapterCredentialFields, exchangeCredentials as adapterExchangeCredentials, getAuthUrlUnsupported } from './auth'
import { ChaportClient } from './client'

import { transformContact, type RawChaportVisitor } from './transform/contact'
import { transformUser, type RawChaportOperator } from './transform/user'
import { transformTicket, chaportTicketId, type RawChaportChat } from './transform/ticket'
import { transformMessage, type RawChaportChatEvent } from './transform/message'

// ── Response shapes ───────────────────────────────────────────────────────────

interface ListVisitorsResponse {
  result?: RawChaportVisitor[]
  links?: { next?: string; prev?: string }
}

interface GetVisitorResponse {
  result?: RawChaportVisitor
}

interface ListOperatorsResponse {
  result?: RawChaportOperator[]
}

interface GetOperatorResponse {
  result?: RawChaportOperator
}

interface GetChatResponse {
  result?: RawChaportChat
}

interface ListChatEventsResponse {
  result?: RawChaportChatEvent[]
}

// ── Adapter ───────────────────────────────────────────────────────────────────

const ACTION_MAP: Record<string, { resourceType: WebhookResourceType; action: WebhookAction }> = {
  'visitor.created':    { resourceType: 'contacts', action: 'created' },
  'visitor.updated':    { resourceType: 'contacts', action: 'updated' },
  'chat.started':       { resourceType: 'tickets',  action: 'created' },
  'chat.finished':      { resourceType: 'tickets',  action: 'resolved' },
  'chat.closed':        { resourceType: 'tickets',  action: 'closed' },
  'chat.stage.updated': { resourceType: 'tickets',  action: 'updated' },
  'chat.newEvent.visitor-message':  { resourceType: 'messages', action: 'commented' },
  'chat.newEvent.operator-message': { resourceType: 'messages', action: 'commented' },
  'chat.messageRead':   { resourceType: 'messages', action: 'updated' },
}

export class ChaportAdapter implements CustomerSupportAdapter {
  readonly platform = 'chaport'
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
    throw new Error('chaport uses static API key auth; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    const event = String(payload['event'] ?? '')
    const data = (payload['data'] as Record<string, unknown> | undefined) ?? {}
    const visitorId = String(data['visitorId'] ?? data['visitor_id'] ?? '')
    const chatId = String(data['chatId'] ?? data['chat_id'] ?? data['id'] ?? '')
    const resourceId = event.startsWith('visitor') ? visitorId : chaportTicketId(visitorId, chatId)
    const mapped = ACTION_MAP[event] ?? { resourceType: 'unknown' as WebhookResourceType, action: 'unknown' as WebhookAction }
    return [
      {
        id: `chaport:${event}:${resourceId}`,
        platform: 'chaport',
        type: event,
        resourceType: mapped.resourceType,
        action: mapped.action,
        resourceId,
        ticketId: mapped.resourceType === 'messages' ? resourceId : undefined,
        payload,
      },
    ]
  }

  private client(credentials: Credentials): ChaportClient {
    return new ChaportClient(credentials)
  }

  private pageParam(params: QueryParams): Record<string, unknown> {
    return params.page != null ? { page: params.page } : {}
  }

  // ── Tickets (chats) ───────────────────────────────────────────────────────

  /**
   * Lists tickets by fetching the most-recent chat for each visitor page.
   * Visitors are returned most-recently-chatted first by Chaport.
   * Chat lookups are parallelised with Promise.allSettled to reduce wall-clock time.
   */
  async listTickets(credentials: Credentials, params: QueryParams): Promise<Ticket[]> {
    const cl = this.client(credentials)
    const visRes = await cl.get<ListVisitorsResponse>('/visitors', this.pageParam(params))
    const visitors = visRes.result ?? []
    const results = await Promise.allSettled(
      visitors.map((visitor) =>
        cl.get<GetChatResponse>(`/visitors/${visitor.id}/chats`).then((chatRes) => ({
          chatRes,
          visitorId: String(visitor.id),
        })),
      ),
    )
    const tickets: Ticket[] = []
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value.chatRes.result) {
        tickets.push(transformTicket(r.value.chatRes.result, r.value.visitorId))
      }
      // rejected = visitor has no chat; skip gracefully
    }
    return tickets
  }

  /**
   * Retrieves a single ticket by id.
   * @param id Composed id: "visitorId:chatId" (as produced by transformTicket / chaportTicketId)
   */
  async getTicket(credentials: Credentials, id: string): Promise<Ticket> {
    const sep = id.indexOf(':')
    if (sep < 0) throw new Error(`chaport ticket id must be "visitorId:chatId"; got: ${id}`)
    const visitorId = id.slice(0, sep)
    const chatId = id.slice(sep + 1)
    const res = await this.client(credentials).get<GetChatResponse>(`/visitors/${visitorId}/chats/${chatId}`)
    if (!res.result) throw new Error(`chaport chat ${chatId} not found for visitor ${visitorId}`)
    return transformTicket(res.result, visitorId)
  }

  // ── Messages (chat events) ────────────────────────────────────────────────

  /**
   * Lists messages (chat events) for a ticket.
   * @param ticketId Composed id: "visitorId:chatId"
   */
  async listMessages(credentials: Credentials, ticketId: string, params: QueryParams): Promise<Message[]> {
    const sep = ticketId.indexOf(':')
    if (sep < 0) throw new Error(`chaport ticket id must be "visitorId:chatId"; got: ${ticketId}`)
    const visitorId = ticketId.slice(0, sep)
    const chatId = ticketId.slice(sep + 1)
    const res = await this.client(credentials).get<ListChatEventsResponse>(
      `/visitors/${visitorId}/chats/${chatId}/events`,
      this.pageParam(params),
    )
    return (res.result ?? []).map((e, i) => transformMessage(e, visitorId, chatId, i))
  }

  // ── Contacts (visitors) ───────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const res = await this.client(credentials).get<ListVisitorsResponse>('/visitors', this.pageParam(params))
    return (res.result ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const res = await this.client(credentials).get<GetVisitorResponse>(`/visitors/${id}`)
    if (!res.result) throw new Error(`chaport visitor ${id} not found`)
    return transformContact(res.result)
  }

  // ── Users (operators) ─────────────────────────────────────────────────────

  async listUsers(credentials: Credentials, params: QueryParams): Promise<User[]> {
    const res = await this.client(credentials).get<ListOperatorsResponse>('/operators', this.pageParam(params))
    return (res.result ?? []).map(transformUser)
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    const res = await this.client(credentials).get<GetOperatorResponse>(`/operators/${id}`)
    if (!res.result) throw new Error(`chaport operator ${id} not found`)
    return transformUser(res.result)
  }
}
