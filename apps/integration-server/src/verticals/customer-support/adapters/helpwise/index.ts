/**
 * Helpwise adapter for the customer-support vertical.
 *
 * Auth:     HTTP Basic — "Basic BASE_64(API_KEY:API_SECRET)"
 * Base URL: https://apis.helpwise.io (the V1 API)
 * Docs:     https://documenter.getpostman.com/view/29744652/2s9YC5yYKf
 *           (helpwise.io/developers redirects there)
 *
 * Served: contacts (list, get) and tags (list, get).
 *
 * Refused with 501 NOT_SUPPORTED, before any request:
 * - tickets and messages: every documented conversation route is scoped to an
 *   inbox ("inboxIds (required)", "InboxId (required)", "mailboxId
 *   (required)"), and a connection carries only an API key and secret.
 * - users: the one documented list ("POST .../dev-apis/users/list", body
 *   `{"mailbox_id":204390}`) is scoped to a mailbox too; there is no user
 *   lookup by id, only "users/me".
 * - teams: the collection has no teams resource.
 * Not supported: macros (no Helpwise equivalent endpoint).
 *
 * Webhooks: Helpwise delivers webhook payloads with a secret appended as a
 * query parameter (secret_key=...) rather than an HMAC header; the secret is
 * validated by comparing the query-param value against the configured secret.
 * No HMAC signature header is issued by Helpwise, so verifyWebhook is omitted.
 *
 * Schema-firewall: no attachment content, no AI-generated summaries.
 */
import {
  DEFAULT_PAGE_LIMIT,
  pageLocally,
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
import type { Tag } from '../../schema/tag'
import type { Team } from '../../schema/team'
import type { WebhookEvent } from '../../schema/webhook'
import type { WebhookAction, WebhookResourceType } from '../../schema/webhook'

import {
  credentialFields as adapterCredentialFields,
  exchangeCredentials as adapterExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import { HelpwiseClient } from './client'

import { transformContact, type RawHelpwiseContact } from './transform/contact'
import { transformTag, type RawHelpwiseTag } from './transform/tag'

// ── Response envelope shapes ────────────────────────────────────────────────

/** "List Contact": `{ "nextPage": false, "results": [ ... ] }`. */
interface ContactsResponse {
  nextPage?: boolean
  results?: RawHelpwiseContact[]
}

function notSupported(reason: string): Error {
  return Object.assign(new Error(reason), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

const INBOX_SCOPED =
  'the connection holds only an API key and secret, and Helpwise has no inbox id to scope the request to'

// ── Adapter ─────────────────────────────────────────────────────────────────

export class HelpwiseAdapter implements CustomerSupportAdapter {
  readonly platform = 'helpwise'
  readonly version = '0.2.0'

  // No OAuth config needed — api_key + api_secret only
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
    throw new Error('helpwise uses static API key auth; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  // ── Webhook ──────────────────────────────────────────────────────────────
  // Helpwise passes secret as query param (secret_key=...) rather than an
  // HMAC header. The verifyWebhook method is therefore omitted — callers
  // should validate the query-param secret server-side.

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    // Helpwise webhook payload structure:
    //   { event: "conversation.created" | ..., data: { id: "...", ... } }
    const event = String(payload['event'] ?? '')
    const data = (payload['data'] as Record<string, unknown> | undefined) ?? {}
    const resourceId = String(data['id'] ?? '')

    const ACTION_MAP: Record<string, { resourceType: WebhookResourceType; action: WebhookAction }> =
      {
        'conversation.created': { resourceType: 'tickets', action: 'created' },
        'conversation.assigned': { resourceType: 'tickets', action: 'assigned' },
        'conversation.closed': { resourceType: 'tickets', action: 'closed' },
        'conversation.deleted': { resourceType: 'tickets', action: 'deleted' },
        'conversation.reopened': { resourceType: 'tickets', action: 'reopened' },
        'conversation.note_added': { resourceType: 'messages', action: 'commented' },
        'conversation.tag_applied': { resourceType: 'tags', action: 'updated' },
        'reply.agent': { resourceType: 'messages', action: 'created' },
        'reply.customer': { resourceType: 'messages', action: 'created' },
      }

    const mapped = ACTION_MAP[event] ?? {
      resourceType: 'unknown' as WebhookResourceType,
      action: 'unknown' as WebhookAction,
    }

    return [
      {
        id: `helpwise:${event}:${resourceId}`,
        platform: 'helpwise',
        type: event,
        resourceType: mapped.resourceType,
        action: mapped.action,
        resourceId,
        ticketId: mapped.resourceType === 'messages' ? resourceId : undefined,
        payload,
      },
    ]
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private client(credentials: Credentials): HelpwiseClient {
    return new HelpwiseClient(credentials)
  }

  // ── Tickets (conversations) ───────────────────────────────────────────────

  /**
   * Refused. The documented list is "GET
   * https://apis.helpwise.io/conversations?inboxIds[]=204568&labelId=14&limit=100&pageToken=PAGE_TOKEN"
   * with "inboxIds (required) | number array | mailbox id of your inbox".
   */
  async listTickets(_credentials: Credentials, _params: QueryParams): Promise<Ticket[]> {
    throw notSupported(
      `Helpwise cannot list tickets: GET /conversations takes "inboxIds (required)", and ${INBOX_SCOPED}`,
    )
  }

  /**
   * Refused. The documented read is "GET
   * https://apis.helpwise.io/inboxes/227136/conversations/116851645" with
   * "InboxId (required) | number | inbox id of your Helpwise inbox".
   */
  async getTicket(_credentials: Credentials, id: string): Promise<Ticket> {
    throw notSupported(
      `Helpwise cannot read ticket ${id}: GET /inboxes/{InboxId}/conversations/{conversationId} takes "InboxId (required)", and ${INBOX_SCOPED}`,
    )
  }

  // ── Messages ──────────────────────────────────────────────────────────────

  /**
   * Refused. The documented list is "POST
   * https://app.helpwise.io/dev-apis/emails/list" with "mailboxId (required)
   * | number | id of the mailbox" and "threadId (required)"; the V1
   * conversation read that carries messages takes "InboxId (required)".
   */
  async listMessages(
    _credentials: Credentials,
    ticketId: string,
    _params: QueryParams,
  ): Promise<Message[]> {
    throw notSupported(
      `Helpwise cannot list messages of ticket ${ticketId}: POST /dev-apis/emails/list takes "mailboxId (required)", and ${INBOX_SCOPED}`,
    )
  }

  async getMessage(_credentials: Credentials, id: string): Promise<Message> {
    // Helpwise messages are thread-scoped; individual get is not supported
    throw new Error(`Helpwise messages are thread-scoped; call listMessages(ticketId). id=${id}`)
  }

  // ── Contacts ──────────────────────────────────────────────────────────────

  /**
   * "GET https://apis.helpwise.io/contacts?limit=<LIMIT>&offset=<OFFSET>",
   * answering `{ "nextPage": false, "results": [ ... ] }`. The caller's page
   * becomes a row offset at the caller's limit; `nextPage` is the end signal.
   */
  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const limit = params.limit ?? DEFAULT_PAGE_LIMIT
    const res = await this.client(credentials).get<ContactsResponse>('/contacts', {
      limit,
      offset: pageOffset(params, limit),
    })
    reportUpstreamPage(params, { hasMore: res.nextPage === true })
    return (res.results ?? []).map(transformContact)
  }

  /** "GET https://apis.helpwise.io/contacts/{{contactId}}". */
  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const raw = await this.client(credentials).get<RawHelpwiseContact>(
      `/contacts/${encodeURIComponent(id)}`,
    )
    return transformContact(raw)
  }

  // ── Users (agents) ────────────────────────────────────────────────────────

  /**
   * Refused. The only documented list is "POST
   * https://app.helpwise.io/dev-apis/users/list" with body
   * `{"mailbox_id":204390}`.
   */
  async listUsers(_credentials: Credentials, _params: QueryParams): Promise<User[]> {
    throw notSupported(
      `Helpwise cannot list users: POST /dev-apis/users/list is scoped by "mailbox_id", and ${INBOX_SCOPED}`,
    )
  }

  /** Refused. Helpwise documents "users/list" and "users/me", but no user read by id. */
  async getUser(_credentials: Credentials, id: string): Promise<User> {
    throw notSupported(
      `Helpwise cannot read user ${id}: the API documents only POST /dev-apis/users/list and /dev-apis/users/me, no lookup by id`,
    )
  }

  // ── Tags ──────────────────────────────────────────────────────────────────

  /**
   * "GET https://apis.helpwise.io/tags" documents no parameters and answers a
   * bare array, so the whole list is sliced to the caller's page.
   */
  async listTags(credentials: Credentials, params: QueryParams): Promise<Tag[]> {
    const rows = await this.client(credentials).get<RawHelpwiseTag[]>('/tags')
    return pageLocally((Array.isArray(rows) ? rows : []).map(transformTag), params)
  }

  /** "GET https://apis.helpwise.io/tags/{{tagId}}". */
  async getTag(credentials: Credentials, id: string): Promise<Tag> {
    const raw = await this.client(credentials).get<RawHelpwiseTag>(
      `/tags/${encodeURIComponent(id)}`,
    )
    return transformTag(raw)
  }

  // ── Teams ─────────────────────────────────────────────────────────────────

  async listTeams(_credentials: Credentials, _params: QueryParams): Promise<Team[]> {
    throw notSupported(
      'Helpwise cannot list teams: its API documents no teams resource in V0 or V1',
    )
  }

  async getTeam(_credentials: Credentials, id: string): Promise<Team> {
    throw notSupported(
      `Helpwise cannot read team ${id}: its API documents no teams resource in V0 or V1`,
    )
  }
}
