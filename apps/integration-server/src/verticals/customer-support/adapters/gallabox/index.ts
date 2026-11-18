/**
 * Gallabox adapter for the customer-support vertical.
 *
 * Gallabox is a WhatsApp-first omnichannel customer engagement platform.
 * All resources are scoped to a tenant accountId stored in credentials.extra.
 *
 * Auth: API Key + API Secret pair delivered as request headers.
 *   apiKey: <credentials.accessToken>
 *   apiSecret: <credentials.extra.apiSecret>
 *
 * Supported resources:
 *   - Contacts  (get by ID)
 *   - Users     (list + get by ID)
 *
 * Refused with 501 NOT_SUPPORTED:
 *   - Conversations → Tickets and Messages (list + get): the docs' Conversations
 *     and Messages pages are empty headings with no endpoint
 *   - Tags, Teams, Macros — not exposed via the Gallabox REST API
 *
 * Schema firewall: no attachment content, no voice recordings, contact PII
 * is email + name + phone only.
 *
 * Docs: https://developers.gallabox.com/
 */
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
import type { WebhookEvent } from '../../schema/webhook'

import {
  credentialFields as adapterCredentialFields,
  exchangeCredentials as adapterExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import { GallaboxClient } from './client'
import { verifyGallaboxWebhook, parseGallaboxWebhookEvents } from './webhook'

import { transformContact, type RawGallaboxContact } from './transform/contact'
import { transformUser, type RawGallaboxUser } from './transform/user'

// ── Refusals ─────────────────────────────────────────────────────────────────

/**
 * Gallabox documents no way to read conversations or message bodies.
 *
 * - https://developers.gallabox.com/gallabox-api/conversations and
 *   https://developers.gallabox.com/gallabox-api/messages are a bare heading
 *   ("# Conversations", "# Messages") with no path, parameter or response.
 * - The first-party Postman reference https://api-docs.gallabox.com (linked
 *   as "API Docs" from https://docs.gallabox.com/llms.txt) has a Conversations
 *   folder of write actions only (assign, change-team, tags, mention,
 *   unassign, resolve), and one message read: "Message Status",
 *   GET /devapi/accounts/:accountId/messages/:messageId/status, "Get delivery
 *   status for outgoing message", whose example response is
 *   {id, recipient_id, message, timestamp, status, localMessageId}: no
 *   conversation id, author or body, which the canonical Message requires.
 *
 * The methods refuse before any request rather than call an invented path.
 */
const CONVERSATIONS_REASON =
  'the Gallabox API reference (https://api-docs.gallabox.com) documents only conversation actions (assign, change-team, tags, mention, unassign, resolve), no conversation list or read endpoint'
const MESSAGES_REASON =
  'the Gallabox API reference (https://api-docs.gallabox.com) documents only sending messages and a delivery-status read (GET /devapi/accounts/:accountId/messages/:messageId/status), which returns no conversation, author or body'

function notSupported(
  action: 'list' | 'read',
  resource: 'conversations' | 'messages',
  reason: string,
): Error {
  return Object.assign(new Error(`Gallabox cannot ${action} ${resource}: ${reason}`), {
    statusCode: 501,
    code: 'NOT_SUPPORTED',
  })
}

// ── Adapter ──────────────────────────────────────────────────────────────────

export class GallaboxAdapter implements CustomerSupportAdapter {
  readonly platform = 'gallabox'
  readonly version = '0.1.0'

  // No OAuth config needed — credentials are entered directly
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
    throw new Error('gallabox uses static API Key + Secret auth; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // API keys do not expire
    return credentials
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyGallaboxWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseGallaboxWebhookEvents(payload)
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private client(credentials: Credentials): GallaboxClient {
    return new GallaboxClient(credentials)
  }

  // ── Conversations → Tickets / Messages (undocumented: refused) ────────────

  async listTickets(_credentials: Credentials, _params: QueryParams): Promise<Ticket[]> {
    throw notSupported('list', 'conversations', CONVERSATIONS_REASON)
  }

  async getTicket(_credentials: Credentials, _id: string): Promise<Ticket> {
    throw notSupported('read', 'conversations', CONVERSATIONS_REASON)
  }

  async listMessages(
    _credentials: Credentials,
    _conversationId: string,
    _params: QueryParams,
  ): Promise<Message[]> {
    throw notSupported('list', 'messages', MESSAGES_REASON)
  }

  async getMessage(_credentials: Credentials, _id: string): Promise<Message> {
    throw notSupported('read', 'messages', MESSAGES_REASON)
  }

  // ── Contacts ───────────────────────────────────────────────────────────────

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const c = this.client(credentials)
    const res = await c.get<
      RawGallaboxContact | { contact?: RawGallaboxContact; data?: RawGallaboxContact }
    >(`/accounts/${c.accountId}/contacts/${id}`)
    const raw =
      (res as { contact?: RawGallaboxContact; data?: RawGallaboxContact }).contact ??
      (res as { data?: RawGallaboxContact }).data ??
      (res as RawGallaboxContact)
    if (!raw || (!raw.id && !raw._id)) throw new Error(`Gallabox contact ${id} not found`)
    return transformContact(raw)
  }

  // ── Users (agents) ─────────────────────────────────────────────────────────

  /**
   * GET /accounts/:accountId/users documents only the accountId path
   * parameter and answers with a bare array of every user
   * (https://developers.gallabox.com/gallabox-api/users) — no page, limit or
   * cursor exists to send, so the whole array is paged locally.
   */
  async listUsers(credentials: Credentials, params: QueryParams): Promise<User[]> {
    return pageLocally(await this.fetchAllUsers(credentials), params)
  }

  private async fetchAllUsers(credentials: Credentials): Promise<User[]> {
    const c = this.client(credentials)
    const res = await c.get<
      RawGallaboxUser[] | { users?: RawGallaboxUser[]; data?: RawGallaboxUser[] }
    >(`/accounts/${c.accountId}/users`)
    const rows = Array.isArray(res)
      ? res
      : ((res as { users?: RawGallaboxUser[] }).users ??
        (res as { data?: RawGallaboxUser[] }).data ??
        [])
    return rows.map((u) => transformUser(u, c.accountId))
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    // Gallabox does not have an individual get-user endpoint — resolve from list
    const users = await this.fetchAllUsers(credentials)
    const found = users.find((u) => u.id === id)
    if (!found) throw new Error(`Gallabox user ${id} not found`)
    return found
  }
}
