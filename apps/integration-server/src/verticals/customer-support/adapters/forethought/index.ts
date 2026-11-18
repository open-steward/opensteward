/**
 * Forethought adapter for the customer-support vertical.
 *
 * Forethought is an AI-overlay platform that sits on top of existing helpdesks
 * (e.g. Salesforce, Freshdesk, Intercom).  Its public REST API exposes:
 *
 *   • Solve API  — https://app.forethought.ai/solve/api/v1
 *     Manages AI-driven chat conversations (create, get, continue, CSAT).
 *     Conversations are mapped to Tickets; conversation turns to Messages.
 *
 *   • Triage API — https://api.forethought.ai
 *     Inference-only (POST predict); not a read resource.
 *
 * Resources NOT supported by Forethought's public API (contacts, users, teams,
 * tags, macros) are intentionally omitted — the framework auto-returns 501 for
 * any method not defined on the adapter class.
 *
 * Authentication: Bearer token (`Authorization: Bearer {token}`) issued by
 * Forethought's implementation engineering team per tenant.
 *
 * Docs:
 *   https://support.forethought.ai/hc/en-us/articles/31636750750227-Solve-API-Developer-Reference
 *   https://support.forethought.ai/hc/en-us/articles/26701042038419-Triage-API-Guide-for-Users
 */
import type { Credentials, CredentialField, QueryParams } from '@opensteward/shared'
import type { CustomerSupportAdapter } from '../../adapter/interface'
import type { Ticket } from '../../schema/ticket'
import type { Message } from '../../schema/message'

import {
  credentialFields as adapterCredentialFields,
  exchangeCredentials as adapterExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import { ForethoughtClient } from './client'
import { SOLVE_API_BASE_URL, DEFAULT_PAGE_SIZE } from './constants'

import { transformTicket, type RawForethoughtConversation } from './transform/ticket'
import { transformMessage, type RawForethoughtTurn } from './transform/message'

// ── Solve API response shapes ─────────────────────────────────────────────────

interface ConversationsResponse {
  conversations?: RawForethoughtConversation[]
  /** Cursor for the next page, if the API supports cursor-based pagination. */
  next_cursor?: string | null
}

interface ConversationResponse {
  conversation?: RawForethoughtConversation
  /** Some API versions return the conversation object at the top level. */
  conversation_id?: string
  status?: string
}

interface TurnsResponse {
  turns?: RawForethoughtTurn[]
  messages?: RawForethoughtTurn[]
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export class ForethoughtAdapter implements CustomerSupportAdapter {
  readonly platform = 'forethought'
  readonly version = '0.1.0'

  // No OAuth config required; auth is a static Bearer token per tenant.
  constructor() {}

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
    throw new Error('forethought uses static Bearer token auth; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // Bearer tokens are long-lived; no refresh flow.
    return credentials
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private solveClient(credentials: Credentials): ForethoughtClient {
    return new ForethoughtClient(credentials, SOLVE_API_BASE_URL)
  }

  private pageParams(params: QueryParams): Record<string, unknown> {
    const p: Record<string, unknown> = {
      page_size: params.limit ?? DEFAULT_PAGE_SIZE,
    }
    if (params['cursor']) {
      p['cursor'] = String(params['cursor'])
    }
    return p
  }

  // ── Tickets (= Forethought conversations) ───────────────────────────────────

  /**
   * List conversations from the Forethought Solve API.
   * Maps each conversation to the canonical Ticket shape.
   */
  async listTickets(credentials: Credentials, params: QueryParams): Promise<Ticket[]> {
    const res = await this.solveClient(credentials).get<ConversationsResponse>(
      '/conversations',
      this.pageParams(params),
    )
    return (res.conversations ?? []).map(transformTicket)
  }

  /**
   * Fetch a single conversation by ID.
   */
  async getTicket(credentials: Credentials, id: string): Promise<Ticket> {
    const res = await this.solveClient(credentials).get<ConversationResponse>(
      `/conversation/${id}`,
    )
    // The API may wrap the result or return it flat
    const raw: RawForethoughtConversation = res.conversation ?? {
      conversation_id: res.conversation_id ?? id,
      status: res.status,
      ...res,
    }
    return transformTicket(raw)
  }

  // ── Messages (= conversation turns) ────────────────────────────────────────

  /**
   * List the turns (exchanges) for a given conversation.
   * Maps each turn to the canonical Message shape.
   */
  async listMessages(
    credentials: Credentials,
    ticketId: string,
    _params: QueryParams,
  ): Promise<Message[]> {
    const res = await this.solveClient(credentials).get<TurnsResponse>(
      `/conversation/${ticketId}/turns`,
    )
    // The API may return turns under `turns` or `messages`
    const turns = res.turns ?? res.messages ?? []
    return turns.map((t, idx) => {
      // Ensure each turn has a stable ID (use index as fallback)
      const withId: RawForethoughtTurn = t.turn_id != null ? t : { ...t, turn_id: idx }
      return transformMessage(withId, ticketId)
    })
  }

  /**
   * Forethought conversation turns are scoped to a conversation; there is no
   * global message-by-ID endpoint. Callers should use listMessages(ticketId).
   */
  async getMessage(_credentials: Credentials, id: string): Promise<Message> {
    throw new Error(
      `Forethought conversation turns are scoped to a conversation; call listMessages(conversationId). id=${id}`,
    )
  }
}
