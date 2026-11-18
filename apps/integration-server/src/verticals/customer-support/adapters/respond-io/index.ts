/**
 * Respond.io adapter for the customer-support vertical.
 *
 * Authentication: API key (Bearer token).
 * Base URL: https://api.respond.io/v2 (servers[0] of every v2 service spec)
 *
 * Docs: https://developers.respond.io/docs/api/ (Stoplight project
 * cHJqOjIyMDQ1OA; the published table of contents is
 * https://stoplight.io/api/v1/projects/cHJqOjIyMDQ1OA/table-of-contents).
 *
 * Supported:
 *   - Contacts  list via POST /contact/list (limit + cursorId in the QUERY,
 *               filter in the body; answers { items, pagination: { next } }),
 *               get via GET /contact/id:{id} (answers the Contact itself)
 *   - Messages  get via GET /contact/{identifier}/message/{messageId}
 *
 * Refused with 501 NOT_SUPPORTED, before any request:
 *   - listTickets / getTicket — the Conversation API documents only
 *     "Assign/unassign conversation" and "Open/close conversation" (both POST);
 *     there is no endpoint that lists or reads a conversation.
 *   - listTags — the Space API documents "Create Space Tag", "Update Space
 *     Tag" and "Delete Space Tag"; there is no endpoint that lists tags.
 */
// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: macro — Respond.io Snippets (canned responses) are a UI-only feature; no REST API endpoint exists in v2 to list or retrieve them.
// Unavailable: team  — Respond.io v2 REST API does not expose a teams/agent-group management endpoint; teams are an internal routing concept with no public API surface.
import type { Credentials, CredentialField, QueryParams } from '@opensteward/shared'
import {
  connectionScope,
  cursorPagerKey,
  pageByCursor,
  reportUpstreamPage,
} from '@opensteward/shared'
import type { CustomerSupportAdapter } from '../../adapter/interface'
import type { Ticket } from '../../schema/ticket'
import type { Message } from '../../schema/message'
import type { Contact } from '../../schema/contact'
import type { Tag } from '../../schema/tag'
import type { WebhookEvent } from '../../schema/webhook'

import {
  credentialFields as adapterCredentialFields,
  exchangeCredentials as adapterExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import { RespondIoClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'
import { verifyRespondIoWebhook, parseRespondIoWebhookEvents } from './webhook'

import { transformContact, type RawRespondIoContact } from './transform/contact'
import { transformMessage, type RawRespondIoMessage } from './transform/message'

// ── Response envelopes ────────────────────────────────────────────────────────

/**
 * POST /contact/list 200: `items` (array of Contact, required) and
 * `pagination` with `next` / `previous`, each a URL such as
 * 'https://api.respond.io/contact/list?limit=10&cursorId=-10'.
 */
interface ContactListResponse {
  items?: RawRespondIoContact[]
  pagination?: { next?: string | null; previous?: string | null } | null
}

interface MessageResponse {
  data?: RawRespondIoMessage
}

/**
 * The POST /contact/list body for "All Contact(s)" — the first request
 * example in the docs: `{ search: '', filter: { $and: [] } }` (the example
 * also carries a sample `timezone`, which the schema does not require and
 * which only shapes timestamp filters, so it is not sent).
 */
const ALL_CONTACTS_BODY = { search: '', filter: { $and: [] } }

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

/**
 * The `cursorId` that starts the next page, read from `pagination.next`.
 * The platform documents no other end signal, so an absent, empty or
 * cursor-less `next`, or a page with no items, ends the walk.
 */
function nextCursor(res: ContactListResponse): string | undefined {
  const next = res.pagination?.next
  if (!next || !(res.items?.length ?? 0)) return undefined
  let cursor: string | null
  try {
    cursor = new URL(next).searchParams.get('cursorId')
  } catch {
    return undefined
  }
  return cursor ? cursor : undefined
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export class RespondIoAdapter implements CustomerSupportAdapter {
  readonly platform = 'respond-io'
  readonly version = '0.1.0'
  /** POST /contact/list `limit`: `exclusiveMaximum: 100` — see constants.ts. */
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  constructor(_config: Record<string, unknown> = {}) {}

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
    throw new Error('respond-io uses static API key auth; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyRespondIoWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseRespondIoWebhookEvents(payload)
  }

  private client(credentials: Credentials): RespondIoClient {
    return new RespondIoClient(credentials)
  }

  // ── Contacts ───────────────────────────────────────────────────────────────

  /**
   * POST /contact/list. `limit` ("Number of contacts to return i.e. page
   * size", 1..99) and `cursorId` ("Pointer to the contact `id` from where the
   * next batch of records should start from") are QUERY parameters; the body
   * is the filter. The caller's 1-based `page` resolves through the shared
   * cursor pager, following the `cursorId` in each `pagination.next`. An
   * explicit caller `cursor` is one request at that position.
   */
  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const limit = Math.min(
      Math.max(1, Math.floor(params.limit ?? DEFAULT_PAGE_SIZE)),
      MAX_PAGE_SIZE,
    )
    const client = this.client(credentials)
    const fetchPage = async (cursorId: string | undefined) => {
      const res = await client.post<ContactListResponse>('/contact/list', ALL_CONTACTS_BODY, {
        limit,
        ...(cursorId !== undefined ? { cursorId } : {}),
      })
      return { items: (res.items ?? []).map(transformContact), next: nextCursor(res) }
    }
    const pageSize = limit < (params.limit ?? limit) ? { pageSize: limit } : {}
    if (params['cursor'] !== undefined && params['cursor'] !== '') {
      const one = await fetchPage(String(params['cursor']))
      reportUpstreamPage(params, { hasMore: one.next !== undefined, ...pageSize })
      return one.items
    }
    const key = cursorPagerKey(connectionScope('respond-io', credentials), 'contacts', { limit })
    const result = await pageByCursor<Contact, string>(key, params.page, fetchPage)
    reportUpstreamPage(params, { hasMore: result.hasMore, ...pageSize })
    return result.items
  }

  /**
   * GET /contact/{identifier} with identifier `id:{id}` ("Examples: id:123,
   * email:abdc@gmail.com, phone:+60121233112"). The 200 body is the Contact
   * itself, not an envelope.
   */
  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const res = await this.client(credentials).get<RawRespondIoContact>(
      `/contact/id:${encodeURIComponent(id)}`,
    )
    return transformContact(res)
  }

  // ── Tickets (conversations) ────────────────────────────────────────────────

  /**
   * Refused: the Conversation API documents only "Assign/unassign
   * conversation" and "Open/close conversation" (both POST). A contact's
   * conversation status is a field of the Contact, not a listable resource.
   */
  async listTickets(_credentials: Credentials, _params: QueryParams): Promise<Ticket[]> {
    throw notSupported(
      'Respond.io cannot list tickets: its Conversation API documents only "Assign/unassign conversation" and "Open/close conversation" (POST), with no endpoint that lists conversations',
    )
  }

  /** Refused for the same reason as {@link listTickets}: no endpoint reads a conversation. */
  async getTicket(_credentials: Credentials, _id: string): Promise<Ticket> {
    throw notSupported(
      'Respond.io cannot get a ticket: its Conversation API documents only "Assign/unassign conversation" and "Open/close conversation" (POST), with no endpoint that reads a conversation',
    )
  }

  // ── Messages ───────────────────────────────────────────────────────────────

  /**
   * Get a single message by its ID.
   * ID format: "contactId:messageId" (composite) or bare messageId.
   * Respond.io: GET /contact/{contactId}/message/{messageId}
   */
  async getMessage(credentials: Credentials, id: string): Promise<Message> {
    const [contactId, messageId] = id.includes(':') ? id.split(':') : ['', id]
    if (!contactId || !messageId) {
      throw new Error(
        `respond-io getMessage requires id in format "contactId:messageId", got: ${id}`,
      )
    }
    const res = await this.client(credentials).get<MessageResponse>(
      `/contact/${contactId}/message/${messageId}`,
    )
    if (!res.data) throw new Error(`respond-io message ${id} not found`)
    return transformMessage(res.data, contactId)
  }

  // ── Tags ───────────────────────────────────────────────────────────────────

  /**
   * Refused: the Space API documents "Create Space Tag", "Update Space Tag"
   * and "Delete Space Tag", and no operation that lists tags.
   */
  async listTags(_credentials: Credentials, _params: QueryParams): Promise<Tag[]> {
    throw notSupported(
      'Respond.io cannot list tags: its Space API documents "Create Space Tag", "Update Space Tag" and "Delete Space Tag", with no endpoint that lists tags',
    )
  }
}
