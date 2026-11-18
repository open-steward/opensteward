/**
 * Missive adapter — customer-support vertical.
 *
 * Authentication: personal API key (Bearer token, `missive_pat-...`).
 * Base URL: https://public.missiveapp.com/v1
 *
 * Supported resources:
 *   - Tickets    → Missive conversations  (GET /v1/conversations?all=true)
 *   - Messages   → Missive messages       (GET /v1/conversations/:id/messages)
 *   - Contacts   → Missive contacts       (GET /v1/contacts, requires contact_book param)
 *   - Users      → Missive users          (GET /v1/users)
 *   - Tags       → Missive shared_labels  (GET /v1/shared_labels)
 *   - Teams      → Missive teams          (GET /v1/teams)
 *   - Macros     → Missive responses      (GET /v1/responses)
 *
 * Schema-firewall: no attachment content, no voice-recording bytes, no
 * AI-suggested-reply fields.
 */
import { connectionScope, cursorPagerKey, pageByRows } from '@opensteward/shared'
import type { Credentials, CredentialField, QueryParams } from '@opensteward/shared'
import type { CustomerSupportAdapter } from '../../adapter/interface'
import type { Ticket } from '../../schema/ticket'
import type { Message } from '../../schema/message'
import type { Contact } from '../../schema/contact'
import type { User } from '../../schema/user'
import type { Tag } from '../../schema/tag'
import type { Team } from '../../schema/team'
import type { Macro } from '../../schema/macro'
import type { WebhookEvent } from '../../schema/webhook'

import {
  credentialFields as adapterCredentialFields,
  exchangeCredentials as adapterExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import { MissiveClient } from './client'
import {
  DEFAULT_PAGE_SIZE,
  DEFAULT_CONVERSATION_PAGE_SIZE,
  MAX_CONVERSATION_PAGE_SIZE,
  MAX_MESSAGE_PAGE_SIZE,
  MAX_OFFSET_PAGE_SIZE,
} from './constants'
import { verifyMissiveWebhook, parseMissiveWebhookEvents } from './webhook'

import {
  isGuestConversation,
  transformTicket,
  type RawMissiveConversation,
} from './transform/ticket'
import { transformMessage, type RawMissiveMessage } from './transform/message'
import { transformContact, type RawMissiveContact } from './transform/contact'
import { transformUser, type RawMissiveUser } from './transform/user'
import { transformTag, type RawMissiveSharedLabel } from './transform/tag'
import { transformTeam, type RawMissiveTeam } from './transform/team'
import { transformMacro, type RawMissiveResponse } from './transform/macro'

// ── Response envelope types ──────────────────────────────────────────────────

/** List conversations and Get a conversation both answer `{ "conversations": [ … ] }`. */
interface ConversationsResponse {
  conversations?: RawMissiveConversation[]
}
interface MessagesResponse {
  messages?: RawMissiveMessage[]
}
interface ContactsResponse {
  contacts?: RawMissiveContact[]
}
interface ContactResponse {
  contact?: RawMissiveContact
}
interface UsersResponse {
  users?: RawMissiveUser[]
}
interface SharedLabelsResponse {
  shared_labels?: RawMissiveSharedLabel[]
}
interface TeamsResponse {
  teams?: RawMissiveTeam[]
}
interface ResponsesResponse {
  responses?: RawMissiveResponse[]
}

/**
 * Where the next page of a conversation's messages starts: `until` is the
 * oldest `delivered_at` served so far, and `seen` the ids already served at
 * exactly that timestamp, so a boundary row the platform returns again is not
 * served twice.
 */
interface MessageCursor {
  until: number
  seen: string[]
}

/** The same for conversations, keyed on `last_activity_at`. */
interface ConversationCursor {
  until: number
  seen: string[]
}

export class MissiveAdapter implements CustomerSupportAdapter {
  readonly platform = 'missive'
  readonly version = '0.1.0'

  // Missive uses static API key auth — no OAuth config required.
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
    throw new Error('Missive uses static API key auth; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyMissiveWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseMissiveWebhookEvents(payload)
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private client(credentials: Credentials): MissiveClient {
    return new MissiveClient(credentials)
  }

  /**
   * One caller page of a Missive offset list (contacts, users, shared labels,
   * teams, responses). Each documents `limit` ("Max value: 200", default 50)
   * and `offset` ("Offset used to paginate.") and returns no total and no
   * next link, so the end is only a short page. pageByRows walks the offsets
   * in upstream pages of the documented 200 and cuts the caller's rows out of
   * them, whatever the caller's limit, peeking past a page that ends on an
   * upstream boundary, so `hasMore` is exact rather than a guess.
   */
  private async offsetList<R>(
    credentials: Credentials,
    params: QueryParams,
    path: string,
    pick: (res: Record<string, unknown>) => R[] | undefined,
    filters: Record<string, string> = {},
  ): Promise<R[]> {
    const limit = MAX_OFFSET_PAGE_SIZE
    const client = this.client(credentials)
    const key = cursorPagerKey(connectionScope(this.platform, credentials), path, {
      ...filters,
      limit,
    })
    const { items } = await pageByRows<R, number>(
      key,
      params,
      async (cursor) => {
        const offset = cursor ?? 0
        const res = await client.get<Record<string, unknown>>(path, { ...filters, limit, offset })
        const rows = pick(res) ?? []
        return { items: rows, next: rows.length >= limit ? offset + rows.length : undefined }
      },
      { defaultLimit: DEFAULT_PAGE_SIZE },
    )
    return items
  }

  // ── Tickets (Conversations) ────────────────────────────────────────────────

  async listTickets(credentials: Credentials, params: QueryParams): Promise<Ticket[]> {
    // Documented (List conversations, GET /v1/conversations): "At least one
    // mailbox filter is required. Omitting all of them returns a \"You need to
    // paginate at least one mailbox\" error." The broadest documented one is
    // `all`: "Pass true to list conversations in the All mailbox."
    // "Returns conversations ordered from newest to oldest activity. To
    // paginate, pass an until param equal to the last_activity_at of the oldest
    // conversation returned in the previous page. The last page is reached when
    // fewer conversations than limit are returned or if all conversations in a
    // page have the same last_activity_at." limit: "Default: 25 . Max: 50".
    // "A page may return more conversations than limit", so pageByRows cuts
    // the caller's rows out of upstream pages of 50.
    const client = this.client(credentials)
    const mailbox = { all: true }
    const key = cursorPagerKey(connectionScope(this.platform, credentials), 'conversations', {
      ...mailbox,
      limit: MAX_CONVERSATION_PAGE_SIZE,
    })
    const { items } = await pageByRows<RawMissiveConversation, ConversationCursor>(
      key,
      params,
      async (cursor) => {
        const qp: Record<string, unknown> = { ...mailbox, limit: MAX_CONVERSATION_PAGE_SIZE }
        if (cursor) qp['until'] = cursor.until
        const res = await client.get<ConversationsResponse>('/conversations', qp)
        const raw = res.conversations ?? []
        const seen = new Set(cursor?.seen ?? [])
        // "Conversations where the API token user is a guest will be returned
        // with limited data, containing only the id and last_activity_at
        // fields": no created_at, so no Ticket. They still place the cursor.
        const rows = raw.filter(
          (conv) =>
            !isGuestConversation(conv) &&
            !(cursor && conv.last_activity_at === cursor.until && seen.has(conv.id)),
        )
        const times = raw.map((conv) => conv.last_activity_at)
        const valid = times.every((t) => typeof t === 'number' && Number.isFinite(t))
        const oldest = valid && times.length > 0 ? Math.min(...times) : undefined
        const newest = valid && times.length > 0 ? Math.max(...times) : undefined
        const more =
          raw.length >= MAX_CONVERSATION_PAGE_SIZE && oldest !== undefined && oldest !== newest
        if (!more) return { items: rows, next: undefined }
        const atOldest = raw
          .filter((conv) => conv.last_activity_at === oldest)
          .map((conv) => conv.id)
        return { items: rows, next: { until: oldest, seen: atOldest } }
      },
      { defaultLimit: DEFAULT_CONVERSATION_PAGE_SIZE },
    )
    return items.map(transformTicket)
  }

  async getTicket(credentials: Credentials, id: string): Promise<Ticket> {
    // Get a conversation (GET /v1/conversations/:id) answers with a
    // `conversations` array; "The returned conversation may have a different
    // id" when conversations were merged.
    const res = await this.client(credentials).get<ConversationsResponse>(
      `/conversations/${encodeURIComponent(id)}`,
    )
    const conversation = res.conversations?.[0]
    if (!conversation) throw new Error(`Missive conversation ${id} not found`)
    return transformTicket(conversation)
  }

  // ── Messages ──────────────────────────────────────────────────────────────

  async listMessages(
    credentials: Credentials,
    conversationId: string,
    params: QueryParams,
  ): Promise<Message[]> {
    // Documented: `limit` "Default: 10 . Max: 10", paged by `until` = the
    // `delivered_at` of the oldest message of the previous page; the last page
    // is short or has a single `delivered_at`, and "A page may return more
    // messages than limit". One upstream page is not one caller page, so
    // pageByRows cuts the caller's rows out of pages of 10.
    const client = this.client(credentials)
    const path = `/conversations/${conversationId}/messages`
    const key = cursorPagerKey(connectionScope(this.platform, credentials), 'messages', {
      conversationId,
      limit: MAX_MESSAGE_PAGE_SIZE,
    })
    const { items } = await pageByRows<RawMissiveMessage, MessageCursor>(
      key,
      params,
      async (cursor) => {
        const qp: Record<string, unknown> = { limit: MAX_MESSAGE_PAGE_SIZE }
        if (cursor) qp['until'] = cursor.until
        const res = await client.get<MessagesResponse>(path, qp)
        const raw = res.messages ?? []
        const seen = new Set(cursor?.seen ?? [])
        const rows = cursor
          ? raw.filter((m) => !(deliveredAt(m) === cursor.until && seen.has(m.id)))
          : raw
        const times = raw.map(deliveredAt).filter((t): t is number => t !== undefined)
        const oldest = times.length > 0 ? Math.min(...times) : undefined
        const newest = times.length > 0 ? Math.max(...times) : undefined
        const more =
          raw.length >= MAX_MESSAGE_PAGE_SIZE &&
          oldest !== undefined &&
          times.length === raw.length &&
          oldest !== newest
        if (!more) return { items: rows, next: undefined }
        const atOldest = raw.filter((m) => deliveredAt(m) === oldest).map((m) => m.id)
        return { items: rows, next: { until: oldest, seen: atOldest } }
      },
      { defaultLimit: MAX_MESSAGE_PAGE_SIZE },
    )
    return items.map((m) => transformMessage(m, conversationId))
  }

  async getMessage(_credentials: Credentials, id: string): Promise<Message> {
    // Missive messages are scoped to a conversation; there is no standalone get-by-id.
    throw new Error(
      `Missive messages are conversation-scoped; call listMessages(conversationId). id=${id}`,
    )
  }

  // ── Contacts ──────────────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    // contact_book is required by the Missive API; fall back to listing all by
    // omitting it (the API will return an error if no accessible contact books exist).
    const filters: Record<string, string> = {}
    if (params['contactBook']) filters['contact_book'] = String(params['contactBook'])
    const rows = await this.offsetList(
      credentials,
      params,
      '/contacts',
      (res) => (res as ContactsResponse).contacts,
      filters,
    )
    return rows.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const res = await this.client(credentials).get<ContactResponse>(`/contacts/${id}`)
    if (!res.contact) throw new Error(`Missive contact ${id} not found`)
    return transformContact(res.contact)
  }

  // ── Users ─────────────────────────────────────────────────────────────────

  async listUsers(credentials: Credentials, params: QueryParams): Promise<User[]> {
    const rows = await this.offsetList(
      credentials,
      params,
      '/users',
      (res) => (res as UsersResponse).users,
    )
    return rows.map(transformUser)
  }

  async getUser(_credentials: Credentials, id: string): Promise<User> {
    // Missive does not expose a single-user endpoint; list and filter.
    throw new Error(
      `Missive does not expose a single-user endpoint; call listUsers() and filter. id=${id}`,
    )
  }

  // ── Tags (Shared Labels) ──────────────────────────────────────────────────

  async listTags(credentials: Credentials, params: QueryParams): Promise<Tag[]> {
    const rows = await this.offsetList(
      credentials,
      params,
      '/shared_labels',
      (res) => (res as SharedLabelsResponse).shared_labels,
    )
    return rows.map(transformTag)
  }

  async getTag(_credentials: Credentials, id: string): Promise<Tag> {
    throw new Error(
      `Missive does not expose a single shared-label endpoint; call listTags() and filter. id=${id}`,
    )
  }

  // ── Teams ─────────────────────────────────────────────────────────────────

  async listTeams(credentials: Credentials, params: QueryParams): Promise<Team[]> {
    const rows = await this.offsetList(
      credentials,
      params,
      '/teams',
      (res) => (res as TeamsResponse).teams,
    )
    return rows.map(transformTeam)
  }

  async getTeam(_credentials: Credentials, id: string): Promise<Team> {
    throw new Error(
      `Missive does not expose a single-team endpoint; call listTeams() and filter. id=${id}`,
    )
  }

  // ── Macros (Saved Responses) ───────────────────────────────────────────────

  async listMacros(credentials: Credentials, params: QueryParams): Promise<Macro[]> {
    const rows = await this.offsetList(
      credentials,
      params,
      '/responses',
      (res) => (res as ResponsesResponse).responses,
    )
    return rows.map(transformMacro)
  }

  async getMacro(_credentials: Credentials, id: string): Promise<Macro> {
    throw new Error(
      `Missive does not expose a single saved-response endpoint; call listMacros() and filter. id=${id}`,
    )
  }
}

/** A message's `delivered_at` as Unix seconds, or undefined when it is not one. */
function deliveredAt(m: RawMissiveMessage): number | undefined {
  const v = m.delivered_at
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' ? Number(v) : NaN
  return Number.isFinite(n) ? n : undefined
}
