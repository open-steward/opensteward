/**
 * Yellow.ai customer-support adapter.
 *
 * Auth: API key in the documented `x-api-key` header; credentials also carry
 * the bot id (the documented `bot` query parameter) and an optional region
 * code selecting a documented server (see constants.ts).
 *
 * Served:
 *   - Users (agents): GET /api/agents/public/v1/agents/concurrency
 *     (https://docs.yellow.ai/api/agent-chat-concurrency) — "Returns every
 *     agent in the bot", no paging parameters, so it is paged locally.
 *   - Contact by id: GET /cdp/api/v1/user/{userId}
 *     (https://docs.yellow.ai/api/get-user-details).
 *
 * Refused with 501 NOT_SUPPORTED, before any request (reasons below, each
 * quoted from the docs.yellow.ai OpenAPI):
 *   - listContacts: the User API has no list route.
 *   - listTickets / getTicket: the Email Ticket list covers only the past 30
 *     days and documents only id/status/created_at; the Inbox Ticketing
 *     routes document their ticket objects only as `{ "type": "object" }`.
 *   - listMessages: the Messages route requires a user `uid`, and the Inbox
 *     ticket-messages route documents its items only as `{ "type": "object" }`.
 *
 * Docs: https://docs.yellow.ai/api/introduction
 */
// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: macro  — Yellow.ai's public REST API exposes no endpoint for canned responses / macros; the feature is UI-only and bulk API access is explicitly unsupported per docs.
// Unavailable: tag    — Yellow.ai's public REST API exposes no endpoint for listing or retrieving tags; tag management is UI-only.
// Unavailable: team   — Yellow.ai's public REST API exposes no endpoint for agent groups / teams; group management is UI-only.
import {
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

import {
  credentialFields as adapterCredentialFields,
  exchangeCredentials as adapterExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import { YellowAiClient } from './client'

import { transformContact, type RawYellowAiContact } from './transform/contact'
import { transformUser, type RawYellowAiAgent } from './transform/user'

// ── Response envelope types ──────────────────────────────────────────────────

/** Agent chat concurrency 200: `{ agents: object[] }`. */
interface AgentsResponse {
  agents?: RawYellowAiAgent[]
}

/** Get user details 200: `{ message, data }`. */
interface UserDetailsResponse {
  message?: string
  data?: RawYellowAiContact
}

function notSupported(reason: string): Error {
  return Object.assign(new Error(reason), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

const TICKETS_REFUSED =
  'Yellow.ai cannot list tickets: the Email Ticket list (GET /api/ticketing/ticket) "Fetches a ' +
  'paginated list of tickets created in the past 30 days" and documents only id, status and ' +
  'created_at per ticket (no subject, requester or channel); the Inbox Ticketing lists (GET ' +
  '/api/agents/public/v1/ticket/search, /views/{viewId}/tickets) document their tickets only as ' +
  '"items": { "type": "object" }'

const TICKET_REFUSED =
  'Yellow.ai cannot read a ticket: Retrieve a ticket (GET /api/agents/public/v1/tickets/{id}) ' +
  'documents its response only as "ticket": { "type": "object" }'

const MESSAGES_REFUSED =
  'Yellow.ai cannot list messages by ticket: Get messages (GET /data/messages) requires "uid" ' +
  '("The unique ID of the user associated with the messages", required: true), which a ticket id ' +
  'does not supply, and List ticket messages (GET /api/agents/public/v1/tickets/{id}/messages) ' +
  'documents its messages only as "items": { "type": "object" }'

const CONTACTS_REFUSED =
  'Yellow.ai cannot list contacts: its User API documents only per-user routes — Get user details ' +
  '(GET /cdp/api/v1/user/{userId}) "Retrieve all details of a specific user" — and no list'

// ── Adapter ──────────────────────────────────────────────────────────────────

export class YellowAiAdapter implements CustomerSupportAdapter {
  readonly platform = 'yellow-ai'
  readonly version = '0.1.0'

  // No OAuth config needed — API key only
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
    throw new Error('yellow-ai uses static API key auth; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  // ── No webhook signature scheme documented for the public API ─────────────
  // verifyWebhook / parseWebhookEvents intentionally omitted.

  private client(credentials: Credentials): YellowAiClient {
    return new YellowAiClient(credentials)
  }

  // ── Tickets ────────────────────────────────────────────────────────────────

  async listTickets(_credentials: Credentials, _params: QueryParams): Promise<Ticket[]> {
    throw notSupported(TICKETS_REFUSED)
  }

  async getTicket(_credentials: Credentials, _id: string): Promise<Ticket> {
    throw notSupported(TICKET_REFUSED)
  }

  // ── Messages ───────────────────────────────────────────────────────────────

  async listMessages(
    _credentials: Credentials,
    _ticketId: string,
    _params: QueryParams,
  ): Promise<Message[]> {
    throw notSupported(MESSAGES_REFUSED)
  }

  async getMessage(_credentials: Credentials, id: string): Promise<Message> {
    throw new Error(
      `yellow-ai messages are scoped to a ticket uid; call listMessages(ticketId). id=${id}`,
    )
  }

  // ── Contacts ───────────────────────────────────────────────────────────────

  async listContacts(_credentials: Credentials, _params: QueryParams): Promise<Contact[]> {
    throw notSupported(CONTACTS_REFUSED)
  }

  /** "GET /cdp/api/v1/user/{userId}" with the required `bot` query parameter. */
  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const res = await this.client(credentials).get<UserDetailsResponse>(
      `/cdp/api/v1/user/${encodeURIComponent(id)}`,
    )
    if (!res.data) {
      throw Object.assign(new Error(`yellow-ai user ${id} not found`), { statusCode: 404 })
    }
    return transformContact(res.data)
  }

  // ── Users (agents) ─────────────────────────────────────────────────────────

  /** "Returns every agent in the bot" — one unpaged request, sliced locally. */
  private async allAgents(credentials: Credentials): Promise<User[]> {
    const res = await this.client(credentials).get<AgentsResponse>(
      '/api/agents/public/v1/agents/concurrency',
    )
    return (res.agents ?? []).map(transformUser)
  }

  async listUsers(credentials: Credentials, params: QueryParams): Promise<User[]> {
    return pageLocally(await this.allAgents(credentials), params)
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    const found = (await this.allAgents(credentials)).find((u) => u.id === id)
    if (!found) {
      throw Object.assign(new Error(`yellow-ai agent ${id} not found`), { statusCode: 404 })
    }
    return found
  }
}
