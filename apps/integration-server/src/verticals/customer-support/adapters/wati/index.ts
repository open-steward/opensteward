/**
 * WATI adapter for the customer-support vertical.
 *
 * WATI is a WhatsApp Business API platform.  Contacts are identified by
 * WhatsApp phone number (wa_id).  Each contact has one conversation thread.
 *
 * Supported resources:
 *   - contacts  (list + get)
 *   - messages  (list, scoped to a conversation: GET /api/ext/v3/conversations/{target}/messages)
 *
 * Refused (501): users. WATI documents no endpoint that lists operators.
 *
 * Authentication: static Bearer token. Every call is a v3 call to the host of
 * the stored endpoint URL, without its tenant path (see client.ts).
 *
 * Docs: https://docs.wati.io/reference/introduction
 */
import type { Credentials, CredentialField, QueryParams } from '@opensteward/shared'
import { connectionScope, pageByRows, reportUpstreamPage } from '@opensteward/shared'
import type { CustomerSupportAdapter } from '../../adapter/interface'
import type { Message } from '../../schema/message'
import type { Contact } from '../../schema/contact'
import type { User } from '../../schema/user'
import type { WebhookEvent } from '../../schema/webhook'

import {
  credentialFields as adapterCredentialFields,
  exchangeCredentials as adapterExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import { WatiClient, v3BaseUrl } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, API_V3_PREFIX } from './constants'

import { transformContact, type RawWatiContact } from './transform/contact'
import { transformMessage, type RawWatiMessage } from './transform/message'

// ── Resource coverage ──────────────────────────────────────────────────────────
// Unavailable: macro  — WATI quick replies / canned responses are UI-only; no REST endpoint to list them.
// Unavailable: tag    — WATI contact tags are UI-only; no REST endpoint to list tags.
// Unavailable: team   — No REST endpoint to list operator teams/groups (PUT /contacts/teams assigns, does not list).
// Unavailable: user   — No REST endpoint to list or read operators (see listUsers).

// ── WATI API response shapes ──────────────────────────────────────────────────

/** GetContactListResponse (https://docs.wati.io/reference/contacts_getcontactlist.md). */
interface WatiContactListResponse {
  contact_list?: RawWatiContact[] | null
  page_number?: number
  page_size?: number
}

/**
 * GetMessagesByConversationIdResponse
 * (https://docs.wati.io/reference/conversations_getmessagesbyconversationid.md).
 */
interface WatiMessageListResponse {
  message_list?: RawWatiMessage[] | null
  page_number?: number
  page_size?: number
}

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

const NO_OPERATOR_LIST =
  'WATI cannot list users: its API reference (https://docs.wati.io/llms.txt) documents no operator list or lookup endpoint, only "Assign an operator to a conversation" and "Assign User"'

const NO_OPERATOR_LOOKUP =
  'WATI cannot read a user: its API reference (https://docs.wati.io/llms.txt) documents no operator list or lookup endpoint, only "Assign an operator to a conversation" and "Assign User"'

// ── Adapter ───────────────────────────────────────────────────────────────────

export class WatiAdapter implements CustomerSupportAdapter {
  readonly platform = 'wati'
  readonly version = '0.1.0'

  constructor() {}

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
    throw new Error('wati uses static API key auth; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  /**
   * WATI does not document webhook signature verification.
   * verifyWebhook is intentionally not implemented — all callers should treat
   * WATI webhook payloads as unverified and rely on network-level controls.
   */

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseWatiWebhookEvents(payload)
  }

  private client(credentials: Credentials): WatiClient {
    return new WatiClient(credentials)
  }

  // ── Contacts ───────────────────────────────────────────────────────────────

  /**
   * GET /api/ext/v3/contacts pages by `page_number` ("Page number (1-based).")
   * and `page_size` ("Number of items per page (max 100).")
   * (https://docs.wati.io/reference/contacts_getcontactlist.md). The response
   * carries no total and no next flag, so a short page is the end; a page
   * clamped below the caller's limit reports the size it asked for, so a
   * full page of 100 is not read as the last one.
   */
  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const limit = params.limit ?? DEFAULT_PAGE_SIZE
    const pageSize = Math.min(limit, MAX_PAGE_SIZE)
    const res = await this.client(credentials).get<WatiContactListResponse>(
      `${API_V3_PREFIX}/contacts`,
      { page_number: params.page ?? 1, page_size: pageSize },
    )
    if (pageSize < limit) reportUpstreamPage(params, { pageSize })
    return (res.contact_list ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    // id may be wa_id (phone number) or contact UUID
    const res = await this.client(credentials).get<RawWatiContact>(
      `${API_V3_PREFIX}/contacts/${encodeURIComponent(id)}`,
    )
    return transformContact(res)
  }

  // ── Messages ───────────────────────────────────────────────────────────────

  /**
   * GET /api/ext/v3/conversations/{target}/messages
   * (https://docs.wati.io/reference/conversations_getmessagesbyconversationid.md):
   * `target` is a ConversationId, a PhoneNumber or Channel:PhoneNumber;
   * `page_number` ("Page number (1-based).") and `page_size` ("Number of
   * items per page (max 100).") are required. The answer is `message_list`,
   * `page_number` and `page_size`: no total and no next flag, so a short
   * page ends the list.
   *
   * `message_list` holds conversation events, whose `event_type` is "The
   * type of event (e.g., message, ticket, broadcast)." Only `message` events
   * are messages, so an upstream page holds any number of them: the caller's
   * page is cut from the filtered stream by pageByRows, over upstream pages
   * of the documented maximum.
   */
  async listMessages(
    credentials: Credentials,
    ticketId: string,
    params: QueryParams,
  ): Promise<Message[]> {
    const client = this.client(credentials)
    const path = `${API_V3_PREFIX}/conversations/${encodeURIComponent(ticketId)}/messages`
    const key = `${connectionScope(`wati:${v3BaseUrl(credentials)}`, credentials)}:messages:${ticketId}:${MAX_PAGE_SIZE}`
    const { items } = await pageByRows<Message, number>(
      key,
      params,
      async (cursor) => {
        const pageNumber = cursor ?? 1
        const res = await client.get<WatiMessageListResponse>(path, {
          page_number: pageNumber,
          page_size: MAX_PAGE_SIZE,
        })
        const events = res.message_list ?? []
        return {
          items: events
            .filter((e) => e.event_type === 'message')
            .map((e) => transformMessage(e, ticketId)),
          next: events.length < MAX_PAGE_SIZE ? undefined : pageNumber + 1,
        }
      },
      { defaultLimit: DEFAULT_PAGE_SIZE },
    )
    return items
  }

  async getMessage(_credentials: Credentials, id: string): Promise<Message> {
    throw new Error(
      `WATI messages are conversation-scoped; call listMessages(conversationId). id=${id}`,
    )
  }

  // ── Users (operators / agents) ─────────────────────────────────────────────

  /** Refused before any request: WATI documents no endpoint that lists operators. */
  async listUsers(_credentials: Credentials, _params: QueryParams): Promise<User[]> {
    throw notSupported(NO_OPERATOR_LIST)
  }

  /** Refused before any request, for the same reason as listUsers. */
  async getUser(_credentials: Credentials, _id: string): Promise<User> {
    throw notSupported(NO_OPERATOR_LOOKUP)
  }
}

// ── Webhook parsing ────────────────────────────────────────────────────────────

/**
 * WATI webhook event types (eventType field in payload).
 * Docs: https://docs.wati.io/reference/webhooks
 */
const ACTION_MAP: Record<
  string,
  {
    resourceType: import('../../schema/webhook').WebhookResourceType
    action: import('../../schema/webhook').WebhookAction
  }
> = {
  messageReceived: { resourceType: 'messages', action: 'commented' },
  message: { resourceType: 'messages', action: 'commented' },
  sentMessageREAD: { resourceType: 'messages', action: 'updated' },
  sentMessageDELIVERED: { resourceType: 'messages', action: 'updated' },
  sentMessageSENT: { resourceType: 'messages', action: 'updated' },
  sentMessageFAILED: { resourceType: 'messages', action: 'updated' },
}

function parseWatiWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
  const eventType = String(payload['eventType'] ?? payload['type'] ?? '')
  const id = String(payload['id'] ?? '')
  const ticketId = String(payload['ticketId'] ?? payload['conversationId'] ?? '')
  const waId = String(payload['waId'] ?? '')
  const mapped = ACTION_MAP[eventType] ?? {
    resourceType: 'unknown' as import('../../schema/webhook').WebhookResourceType,
    action: 'unknown' as import('../../schema/webhook').WebhookAction,
  }
  return [
    {
      id: `wati:${eventType}:${id || ticketId}`,
      platform: 'wati',
      type: eventType,
      resourceType: mapped.resourceType,
      action: mapped.action,
      resourceId: id || ticketId || waId,
      ticketId: ticketId || undefined,
      payload,
    },
  ]
}
