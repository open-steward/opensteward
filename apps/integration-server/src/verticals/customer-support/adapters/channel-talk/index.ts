/**
 * Channel Talk (channel.io) adapter for the customer-support vertical.
 *
 * Auth: dual API-key (x-access-key + x-access-secret). No OAuth flow.
 * API:  https://api.channel.io/open/*  — unversioned; the request version is
 *       pinned via the `Channel-Version` header (client.ts), not a path
 *       segment. See constants.ts for the versioning evidence trail.
 *
 * Supported resources:
 *   - listTickets / getTicket      → UserChats
 *   - listMessages                 → UserChat messages
 *   - getContact                   → Users (GET /open/users/{userId})
 *   - listUsers / getUser          → Managers
 *   - listTags                     → ChatTags (GET /open/chat-tags)
 *
 * Not supported (auto-501):
 *   - getMacro / listMacros  — no canned-response API in Channel Talk Open API
 *   - getMessage             — messages are chat-scoped; use listMessages
 *   - getTag                 — /open/chat-tags/{chatTagId} documents only
 *                              patch and delete, no get
 *   - listContacts           — /open/users documents only `post` (createUser);
 *                              there is no way to list users
 *   - listTeams / getTeam    — no `/open/teams` route exists in any API
 *     version. Confirmed both statically (the current OpenAPI spec has no
 *     teams path at any version) and live (2026-09-13): `/open/v5/teams`,
 *     `/open/v5/teams/{id}` and `/open/v4/teams` all 404 at routing —
 *     unauthenticated, same as any other nonexistent path on that stack, not
 *     the 401 authenticated routes return. `UserChat.teamId` is a routing
 *     field on the ticket, not a listable Team entity, and is deliberately
 *     not synthesised into one here — see metadata.ts.
 *
 * Webhook events are parsed; signature verification is not available
 * in the public API documentation.
 *
 * Schema-firewall: no attachment content, no AI-suggestion fields.
 */
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
import type { User } from '../../schema/user'
import type { Tag } from '../../schema/tag'
import type { WebhookEvent } from '../../schema/webhook'

import {
  credentialFields as adapterCredentialFields,
  exchangeCredentials as adapterExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import { ChannelTalkClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, API_PREFIX } from './constants'
import { verifyChannelTalkWebhook, parseChannelTalkWebhookEvents } from './webhook'

import { transformTicket, type RawChannelTalkUserChat } from './transform/ticket'
import { transformMessage, type RawChannelTalkMessage } from './transform/message'
import { transformContact, type RawChannelTalkUser } from './transform/contact'
import { transformUser, type RawChannelTalkManager } from './transform/user'
import { transformTag, type RawChannelTalkChatTag } from './transform/tag'

// ── Response envelope types ──────────────────────────────────────────────────
// Field names verified against the 2026-06-01 OpenAPI spec: list envelopes
// wrap the array under its plural key plus `nextCursor`/`hasNext`; single-
// resource envelopes still wrap the object under its singular key (unchanged
// from the legacy /open/v4 and /open/v5 stack — only the path and the
// pagination cursor field name moved).

interface UserChatsResponse {
  userChats?: RawChannelTalkUserChat[]
  nextCursor?: string | null
  hasNext?: boolean
}

interface UserChatResponse {
  userChat?: RawChannelTalkUserChat
}

interface MessagesResponse {
  messages?: RawChannelTalkMessage[]
  nextCursor?: string | null
  hasNext?: boolean
}

interface UserResponse {
  user?: RawChannelTalkUser
}

interface ManagersResponse {
  managers?: RawChannelTalkManager[]
  nextCursor?: string | null
  hasNext?: boolean
}

interface ManagerResponse {
  manager?: RawChannelTalkManager
}

/** components.schemas.ChatTagsResponse: required chatTags, nextCursor, hasNext */
interface ChatTagsResponse {
  chatTags?: RawChannelTalkChatTag[]
  nextCursor?: string | null
  hasNext?: boolean
}

/** A 501 raised before any request is sent. */
function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

interface CursorEnvelope {
  nextCursor?: string | null
  hasNext?: boolean
}

// ── Adapter ──────────────────────────────────────────────────────────────────

export class ChannelTalkAdapter implements CustomerSupportAdapter {
  readonly platform = 'channel-talk'
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
    throw new Error('channel-talk uses static API key auth; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyChannelTalkWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseChannelTalkWebhookEvents(payload)
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private client(credentials: Credentials): ChannelTalkClient {
    return new ChannelTalkClient(credentials)
  }

  /** Build pagination query params for list endpoints */
  private listParams(params: QueryParams): Record<string, unknown> {
    return {
      limit: Math.min(Math.max(1, params.limit ?? DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE),
      sortOrder: 'desc',
      ...(params['cursor'] ? { cursor: String(params['cursor']) } : {}),
    }
  }

  /**
   * One caller page of a cursor-paged list (`cursor` in, `nextCursor` /
   * `hasNext` out — see constants.ts). The caller's 1-based `page` resolves
   * through the shared cursor pager, so page N follows the `nextCursor` chain
   * from page 1. An explicit caller `cursor` is one request at that position.
   * Either way the page's end is reported through the page sink.
   */
  private async cursorPage<R, T>(
    credentials: Credentials,
    collection: string,
    path: string,
    query: Record<string, unknown>,
    params: QueryParams,
    rows: (res: R) => T[],
  ): Promise<T[]> {
    const client = this.client(credentials)
    const fetchPage = async (cursor: string | undefined) => {
      const res = await client.get<R & CursorEnvelope>(path, {
        ...query,
        ...(cursor !== undefined ? { cursor } : {}),
      })
      const next = res.hasNext !== false && res.nextCursor ? res.nextCursor : undefined
      return { items: rows(res), next }
    }
    const pageSize = Number(query['limit'])
    if (query['cursor'] !== undefined) {
      const one = await fetchPage(String(query['cursor']))
      reportUpstreamPage(params, { hasMore: one.next !== undefined, pageSize })
      return one.items
    }
    const key = cursorPagerKey(connectionScope('channel-talk', credentials), collection, query)
    const result = await pageByCursor<T, string>(key, params.page, fetchPage)
    reportUpstreamPage(params, { hasMore: result.hasMore, pageSize })
    return result.items
  }

  // ── Tickets (UserChats) ────────────────────────────────────────────────────

  async listTickets(credentials: Credentials, params: QueryParams): Promise<Ticket[]> {
    // Fetch all states by querying opened + closed + snoozed separately, or
    // default to all opened. Using 'opened' as the common-case default; callers
    // can pass state via params.extra if needed.
    const query: Record<string, unknown> = {
      ...this.listParams(params),
      state: 'opened',
    }
    return this.cursorPage<UserChatsResponse, Ticket>(
      credentials,
      'user-chats',
      `${API_PREFIX}/user-chats`,
      query,
      params,
      (res) => (res.userChats ?? []).map(transformTicket),
    )
  }

  async getTicket(credentials: Credentials, id: string): Promise<Ticket> {
    const res = await this.client(credentials).get<UserChatResponse>(
      `${API_PREFIX}/user-chats/${id}`,
    )
    if (!res.userChat) throw new Error(`channel-talk UserChat ${id} not found`)
    return transformTicket(res.userChat)
  }

  // ── Messages ───────────────────────────────────────────────────────────────

  async listMessages(
    credentials: Credentials,
    ticketId: string,
    params: QueryParams,
  ): Promise<Message[]> {
    return this.cursorPage<MessagesResponse, Message>(
      credentials,
      `user-chats/${ticketId}/messages`,
      `${API_PREFIX}/user-chats/${ticketId}/messages`,
      this.listParams(params),
      params,
      (res) => (res.messages ?? []).map((m) => transformMessage(m, ticketId)),
    )
  }

  async getMessage(_credentials: Credentials, id: string): Promise<Message> {
    throw new Error(`channel-talk messages are chat-scoped; call listMessages(chatId). id=${id}`)
  }

  // ── Contacts (end-users) ───────────────────────────────────────────────────

  async listContacts(_credentials: Credentials, _params: QueryParams): Promise<Contact[]> {
    // https://api-doc.channel.io/docs/openapi.en.yaml: the `/open/users` path
    // declares only `post: operationId: createUser` ("Create a lead user");
    // users are read one at a time via GET /open/users/{userId}.
    throw notSupported(
      'Channel Talk cannot list contacts: the Open API\'s /open/users path has only "post: operationId: createUser" ("Create a lead user"), with no GET list of users',
    )
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const res = await this.client(credentials).get<UserResponse>(`${API_PREFIX}/users/${id}`)
    if (!res.user) throw new Error(`channel-talk User ${id} not found`)
    return transformContact(res.user)
  }

  // ── Users (managers / agents) ──────────────────────────────────────────────

  async listUsers(credentials: Credentials, params: QueryParams): Promise<User[]> {
    return this.cursorPage<ManagersResponse, User>(
      credentials,
      'managers',
      `${API_PREFIX}/managers`,
      this.listParams(params),
      params,
      (res) => (res.managers ?? []).map(transformUser),
    )
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    const res = await this.client(credentials).get<ManagerResponse>(`${API_PREFIX}/managers/${id}`)
    if (!res.manager) throw new Error(`channel-talk Manager ${id} not found`)
    return transformUser(res.manager)
  }

  // ── Tags (ChatTags) ────────────────────────────────────────────────────────
  // GET /open/chat-tags — operationId listChatTags, "Retrieve a list of chat
  // tags with pagination." Parameters: cursor, limit only (no sortOrder).

  async listTags(credentials: Credentials, params: QueryParams): Promise<Tag[]> {
    const { sortOrder: _undocumented, ...query } = this.listParams(params)
    return this.cursorPage<ChatTagsResponse, Tag>(
      credentials,
      'chat-tags',
      `${API_PREFIX}/chat-tags`,
      query,
      params,
      (res) => (res.chatTags ?? []).map(transformTag),
    )
  }

  async getTag(_credentials: Credentials, id: string): Promise<Tag> {
    throw notSupported(
      `Channel Talk cannot read one tag: /open/chat-tags/{chatTagId} documents only patch (updateChatTag) and delete (deleteChatTag). id=${id}`,
    )
  }
}
