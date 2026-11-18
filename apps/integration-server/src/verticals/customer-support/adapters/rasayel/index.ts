/**
 * Rasayel adapter — customer-support vertical.
 *
 * Rasayel is a WhatsApp-first team inbox. Its public API is GraphQL-only at
 * https://api.rasayel.io/api/graphql. Auth: raw API key in Authorization header
 * (no "Bearer " prefix — Rasayel issues a pre-encoded Basic auth value).
 *
 * Supported resources: Conversations (Ticket), Messages, ChannelUsers (Contact),
 * AppUsers (User), Teams, Tags, SavedReplies (Macro).
 *
 * Webhook events are parsed from the Rasayel event envelope. Signature
 * verification is not documented; the verifyWebhook method always returns true
 * (callers should secure the endpoint via network controls or a shared secret
 * checked at the app layer).
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
import type { Team } from '../../schema/team'
import type { Macro } from '../../schema/macro'
import type { WebhookAction, WebhookEvent, WebhookResourceType } from '../../schema/webhook'

import {
  credentialFields as adapterCredentialFields,
  exchangeCredentials as adapterExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import { RasayelClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'

import { transformTicket, type RawRasayelConversation } from './transform/ticket'
import { transformMessage, type RawRasayelMessage } from './transform/message'
import { transformContact, type RawRasayelChannelUser } from './transform/contact'
import { transformUser, type RawRasayelAppUser } from './transform/user'
import { transformTag, type RawRasayelTag } from './transform/tag'
import { transformTeam, type RawRasayelTeam } from './transform/team'
import { transformMacro, type RawRasayelSavedReply } from './transform/macro'

// ── Resource coverage ──────────────────────────────────────────────────────
// Available: contact, macro, message, tag, team, ticket, user

// ── GraphQL response wrapper types ─────────────────────────────────────────

/** https://developers.rasayel.io/types/PageInfo */
interface PageInfo {
  endCursor?: string | null
  hasNextPage?: boolean
}

interface Connection<N> {
  edges?: Array<{ node: N }>
  pageInfo?: PageInfo
}

interface ConversationsData {
  app?: {
    conversations?: Connection<RawRasayelConversation>
  }
}

interface ConversationData {
  app?: {
    conversation?: RawRasayelConversation
  }
}

interface MessagesData {
  app?: {
    conversation?: {
      messages?: Connection<RawRasayelMessage>
    } | null
  }
}

interface ChannelUsersData {
  app?: {
    channelUsers?: Connection<RawRasayelChannelUser>
  }
}

interface ChannelUserData {
  app?: {
    channelUser?: RawRasayelChannelUser
  }
}

interface AppUsersData {
  app?: {
    appUsers?: {
      edges?: Array<{ node: RawRasayelAppUser }>
      pageInfo?: PageInfo
    }
  }
}

interface AppUserData {
  app?: {
    appUser?: RawRasayelAppUser
  }
}

interface TeamsData {
  app?: {
    teams?: Array<RawRasayelTeam>
  }
}

interface TagsData {
  app?: {
    tags?: {
      edges?: Array<{ node: RawRasayelTag }>
      pageInfo?: PageInfo
    }
  }
}

interface SavedRepliesData {
  app?: {
    savedReplies?: {
      edges?: Array<{ node: RawRasayelSavedReply }>
      pageInfo?: PageInfo
    }
  }
}

// ── GraphQL query strings ───────────────────────────────────────────────────

// Every query below is written against the SDL the docs site publishes
// (https://developers.rasayel.io/types/App). Record ids are `Int!`, so the id
// variables are `Int!`, as in the "Exporting All Conversations" guide
// (https://developers.rasayel.io/useful-scripts/exporting-all-conversations):
// `query ExportAllMessagesQuery($conversationId: Int!, $first: Int, $after: String)`.

const CONVERSATION_FIELDS = `
  id uuid state channelType
  createdAt updatedAt lastClosedAt
  contact { id }
  assignee { id }
  assignedTeam { id }
  tags { nodes { id } }
`

const LIST_CONVERSATIONS = `
  query ListConversations($first: Int, $after: String) {
    app {
      conversations(first: $first, after: $after) {
        edges { node { ${CONVERSATION_FIELDS} } }
        pageInfo { endCursor hasNextPage }
      }
    }
  }
`

const GET_CONVERSATION = `
  query GetConversation($id: Int!) {
    app {
      conversation(id: $id) { ${CONVERSATION_FIELDS} }
    }
  }
`

const MESSAGE_FIELDS = `
  __typename id uuid direction messageType messageCategory createdAt
  user { __typename id }
  ... on TextMessage { body }
  ... on NoteMessage { body attachments { mimeType } }
  ... on RichMessage { body attachments { mimeType } }
  ... on FlowResponseMessage { body }
  ... on InteractiveMessage { body }
  ... on ImageMessage { caption attachments { mimeType } }
  ... on VideoMessage { caption attachments { mimeType } }
  ... on AudioMessage { caption attachments { mimeType } }
  ... on DocumentMessage { caption attachments { mimeType } }
  ... on AnimationMessage { caption attachments { mimeType } }
`

const LIST_MESSAGES = `
  query ListMessages($conversationId: Int!, $first: Int, $after: String) {
    app {
      conversation(id: $conversationId) {
        messages(first: $first, after: $after) {
          edges { node { ${MESSAGE_FIELDS} } }
          pageInfo { endCursor hasNextPage }
        }
      }
    }
  }
`

const CHANNEL_USER_FIELDS = `
  id uuid displayName
  identifiers { category sourceId }
`

const LIST_CHANNEL_USERS = `
  query ListChannelUsers($first: Int, $after: String) {
    app {
      channelUsers(first: $first, after: $after) {
        edges { node { ${CHANNEL_USER_FIELDS} } }
        pageInfo { endCursor hasNextPage }
      }
    }
  }
`

const GET_CHANNEL_USER = `
  query GetChannelUser($id: Int!) {
    app {
      channelUser(id: $id) { ${CHANNEL_USER_FIELDS} }
    }
  }
`

const APP_USER_FIELDS = `
  id uuid email displayName fullName
  userRole { name }
  status
`

const LIST_APP_USERS = `
  query ListAppUsers($first: Int, $after: String) {
    app {
      appUsers(first: $first, after: $after) {
        edges { node { ${APP_USER_FIELDS} } }
        pageInfo { endCursor hasNextPage }
      }
    }
  }
`

const GET_APP_USER = `
  query GetAppUser($id: ID!) {
    app {
      appUser(id: $id) { ${APP_USER_FIELDS} }
    }
  }
`

const LIST_TEAMS = `
  query ListTeams {
    app {
      teams {
        id uuid name emoji default isAway
      }
    }
  }
`

const TAG_FIELDS = `id uuid tagName tagColor tagDescription isSmart`

const LIST_TAGS = `
  query ListTags($first: Int, $after: String) {
    app {
      tags(first: $first, after: $after) {
        edges { node { ${TAG_FIELDS} } }
        pageInfo { endCursor hasNextPage }
      }
    }
  }
`

const SAVED_REPLY_FIELDS = `
  id uuid title body
  folder { id name }
  active createdAt updatedAt
`

const LIST_SAVED_REPLIES = `
  query ListSavedReplies($first: Int, $after: String) {
    app {
      savedReplies(first: $first, after: $after) {
        edges { node { ${SAVED_REPLY_FIELDS} } }
        pageInfo { endCursor hasNextPage }
      }
    }
  }
`

// ── Webhook event mapping ───────────────────────────────────────────────────

const WEBHOOK_ACTION_MAP: Record<
  string,
  { resourceType: WebhookResourceType; action: WebhookAction }
> = {
  'conversation.created': { resourceType: 'tickets', action: 'created' },
  'conversation.opened': { resourceType: 'tickets', action: 'reopened' },
  'conversation.closed': { resourceType: 'tickets', action: 'closed' },
  'conversation.assigned': { resourceType: 'tickets', action: 'assigned' },
  'conversation.snoozed': { resourceType: 'tickets', action: 'updated' },
  'message.created': { resourceType: 'messages', action: 'commented' },
  'message.updated': { resourceType: 'messages', action: 'updated' },
  'channel_user.created': { resourceType: 'contacts', action: 'created' },
  'channel_user.tag.created': { resourceType: 'contacts', action: 'updated' },
  'channel_user.tag.destroyed': { resourceType: 'contacts', action: 'updated' },
  'conversation.tag.created': { resourceType: 'tickets', action: 'updated' },
  'conversation.tag.destroyed': { resourceType: 'tickets', action: 'updated' },
}

// ── Ids ─────────────────────────────────────────────────────────────────────

function notFound(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 404, code: 'NOT_FOUND' })
}

/**
 * Conversation and ChannelUser ids are `Int!` in the schema (`conversation(id:
 * Int!)`, `channelUser(id: Int!)`); anything else names no record.
 */
function intId(kind: string, id: string): number {
  if (!/^\d+$/.test(id)) throw notFound(`Rasayel ${kind} ${id} not found: ids are integers`)
  return Number(id)
}

// ── Adapter ─────────────────────────────────────────────────────────────────

export class RasayelAdapter implements CustomerSupportAdapter {
  readonly platform = 'rasayel'
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
    throw new Error('rasayel uses static API key auth; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  /**
   * Rasayel does not document webhook signature verification.
   * Always returns true; callers must secure the endpoint via network controls.
   */
  verifyWebhook(_payload: Buffer, _headers: Record<string, string>, _secret: string): boolean {
    return true
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    const eventType = String(payload['event'] ?? '')
    const id = String(payload['id'] ?? '')
    const data = (payload['data'] as Record<string, unknown> | undefined) ?? {}
    const resourceId = String((data as { id?: unknown })['id'] ?? id)

    const mapped = WEBHOOK_ACTION_MAP[eventType] ?? {
      resourceType: 'unknown' as WebhookResourceType,
      action: 'unknown' as WebhookAction,
    }

    return [
      {
        id,
        platform: 'rasayel',
        type: eventType,
        resourceType: mapped.resourceType,
        action: mapped.action,
        resourceId,
        ticketId:
          mapped.resourceType === 'messages'
            ? String((data as { conversationId?: unknown })['conversationId'] ?? resourceId)
            : undefined,
        payload,
      },
    ]
  }

  private client(credentials: Credentials): RasayelClient {
    return new RasayelClient(credentials)
  }

  /**
   * One caller page of an `app` connection. Rasayel pages every connection by
   * cursor (https://developers.rasayel.io/graphql/pagination): `first` sizes
   * the page, `pageInfo.endCursor` goes back as `after`, and
   * `pageInfo.hasNextPage` says whether there is more. The caller's 1-based
   * `page` resolves through the shared cursor pager; an explicit caller
   * `cursor` is one request at that position. No maximum `first` is
   * documented, so the caller's limit is sent as is.
   */
  private async cursorPage<R, N, T>(
    credentials: Credentials,
    collection: string,
    query: string,
    params: QueryParams,
    connection: (res: R) => Connection<N> | undefined,
    map: (node: N) => T,
    vars: Record<string, unknown> = {},
  ): Promise<T[]> {
    const client = this.client(credentials)
    const first = params.limit ?? DEFAULT_PAGE_SIZE
    const fetchPage = async (after: string | undefined) => {
      const res = await client.query<R>(query, {
        ...vars,
        first,
        ...(after !== undefined ? { after } : {}),
      })
      const conn = connection(res)
      const info = conn?.pageInfo
      const next = info?.hasNextPage === true && info.endCursor ? info.endCursor : undefined
      return { items: (conn?.edges ?? []).map((e) => map(e.node)), next }
    }
    const explicit = params['cursor'] ? String(params['cursor']) : undefined
    if (explicit !== undefined) {
      const one = await fetchPage(explicit)
      reportUpstreamPage(params, { hasMore: one.next !== undefined, pageSize: first })
      return one.items
    }
    const key = cursorPagerKey(connectionScope('rasayel', credentials), collection, {
      limit: first,
    })
    const result = await pageByCursor<T, string>(key, params.page, fetchPage)
    reportUpstreamPage(params, { hasMore: result.hasMore, pageSize: first })
    return result.items
  }

  // ── Tickets (Conversations) ───────────────────────────────────────────────

  async listTickets(credentials: Credentials, params: QueryParams): Promise<Ticket[]> {
    return this.cursorPage(
      credentials,
      'conversations',
      LIST_CONVERSATIONS,
      params,
      (res: ConversationsData) => res?.app?.conversations,
      transformTicket,
    )
  }

  async getTicket(credentials: Credentials, id: string): Promise<Ticket> {
    const data = await this.client(credentials).query<ConversationData>(GET_CONVERSATION, {
      id: intId('conversation', id),
    })
    const conv = data?.app?.conversation
    if (!conv) throw notFound(`Rasayel conversation ${id} not found`)
    return transformTicket(conv)
  }

  // ── Messages ─────────────────────────────────────────────────────────────

  async listMessages(
    credentials: Credentials,
    ticketId: string,
    params: QueryParams,
  ): Promise<Message[]> {
    const conversationId = intId('conversation', ticketId)
    return this.cursorPage(
      credentials,
      `conversation:${conversationId}:messages`,
      LIST_MESSAGES,
      params,
      (res: MessagesData) => {
        const conversation = res?.app?.conversation
        if (!conversation) throw notFound(`Rasayel conversation ${ticketId} not found`)
        return conversation.messages
      },
      (node: RawRasayelMessage) => transformMessage(node, ticketId),
      { conversationId },
    )
  }

  async getMessage(_credentials: Credentials, id: string): Promise<Message> {
    throw new Error(
      `Rasayel messages are conversation-scoped; call listMessages(conversationId). id=${id}`,
    )
  }

  // ── Contacts (ChannelUsers) ───────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    return this.cursorPage(
      credentials,
      'channelUsers',
      LIST_CHANNEL_USERS,
      params,
      (res: ChannelUsersData) => res?.app?.channelUsers,
      transformContact,
    )
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const data = await this.client(credentials).query<ChannelUserData>(GET_CHANNEL_USER, {
      id: intId('channelUser', id),
    })
    const user = data?.app?.channelUser
    if (!user) throw notFound(`Rasayel channelUser ${id} not found`)
    return transformContact(user)
  }

  // ── Users (AppUsers / agents) ─────────────────────────────────────────────

  async listUsers(credentials: Credentials, params: QueryParams): Promise<User[]> {
    return this.cursorPage(
      credentials,
      'appUsers',
      LIST_APP_USERS,
      params,
      (res: AppUsersData) => res?.app?.appUsers,
      transformUser,
    )
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    const data = await this.client(credentials).query<AppUserData>(GET_APP_USER, { id })
    const user = data?.app?.appUser
    if (!user) throw new Error(`Rasayel appUser ${id} not found`)
    return transformUser(user)
  }

  // ── Teams ────────────────────────────────────────────────────────────────

  async listTeams(credentials: Credentials, params: QueryParams): Promise<Team[]> {
    // `App.teams` takes no arguments and returns `[Team!]!` — every team in
    // one response (https://developers.rasayel.io/types/App) — so it pages locally.
    const data = await this.client(credentials).query<TeamsData>(LIST_TEAMS, {})
    const teams = data?.app?.teams ?? []
    return pageLocally(teams.map(transformTeam), params)
  }

  async getTeam(credentials: Credentials, id: string): Promise<Team> {
    // Rasayel does not expose a single-team query; fetch all and find by id
    const allTeams = await this.listTeams(credentials, {})
    const found = allTeams.find((t) => t.id === id)
    if (!found) throw new Error(`Rasayel team ${id} not found`)
    return found
  }

  // ── Tags ─────────────────────────────────────────────────────────────────

  async listTags(credentials: Credentials, params: QueryParams): Promise<Tag[]> {
    return this.cursorPage(
      credentials,
      'tags',
      LIST_TAGS,
      params,
      (res: TagsData) => res?.app?.tags,
      transformTag,
    )
  }

  async getTag(_credentials: Credentials, id: string): Promise<Tag> {
    throw new Error(`Rasayel does not expose a single-tag endpoint. id=${id}`)
  }

  // ── Macros (SavedReplies) ─────────────────────────────────────────────────

  async listMacros(credentials: Credentials, params: QueryParams): Promise<Macro[]> {
    return this.cursorPage(
      credentials,
      'savedReplies',
      LIST_SAVED_REPLIES,
      params,
      (res: SavedRepliesData) => res?.app?.savedReplies,
      transformMacro,
    )
  }

  async getMacro(credentials: Credentials, id: string): Promise<Macro> {
    // Rasayel does not expose a single savedReply query; fetch all and find by id
    const allMacros = await this.listMacros(credentials, {})
    const found = allMacros.find((m) => m.id === id)
    if (!found) throw new Error(`Rasayel savedReply ${id} not found`)
    return found
  }
}
