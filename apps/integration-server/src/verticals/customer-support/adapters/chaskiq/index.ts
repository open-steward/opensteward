/**
 * Chaskiq adapter for the customer-support vertical.
 *
 * Chaskiq exposes a single GraphQL endpoint (POST /graphql).
 * Auth: OAuth2 Bearer token (Doorkeeper) + APP header carrying the workspace key.
 *
 * Supported resources: conversations (tickets), conversation parts (messages),
 * app_users (contacts), agents (users), teams.
 * Not supported: tags (no standalone API), macros (concept does not exist).
 *
 * Self-hosted users supply `extra.instanceUrl`; cloud users default to
 * https://app.chaskiq.io/graphql.
 */
import type { Credentials, CredentialField, QueryParams } from '@opensteward/shared'
import { pageLocally, reportUpstreamPage } from '@opensteward/shared'
import type { CustomerSupportAdapter } from '../../adapter/interface'
import type { Ticket } from '../../schema/ticket'
import type { Message } from '../../schema/message'
import type { Contact } from '../../schema/contact'
import type { User } from '../../schema/user'
import type { Team } from '../../schema/team'

import {
  credentialFields as adapterCredentialFields,
  exchangeCredentials as adapterExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import { ChaskiqClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'

import { transformTicket, type RawChaskiqConversation } from './transform/ticket'
import { transformMessage, type RawChaskiqConversationPart } from './transform/message'
import { transformContact, type RawChaskiqAppUser } from './transform/contact'
import { transformUser, type RawChaskiqAgent } from './transform/user'
import { transformTeam, type RawChaskiqTeam } from './transform/team'

// ── GraphQL response shapes ────────────────────────────────────────────────

interface PaginatedMeta {
  current_page?: number | null
  next_page?: number | null
  total_pages?: number | null
  total_count?: number | null
}

interface ConversationsData {
  app?: {
    conversations?: {
      collection?: RawChaskiqConversation[]
      meta?: PaginatedMeta
    } | null
  } | null
}

interface ConversationData {
  app?: {
    conversation?: RawChaskiqConversation | null
  } | null
}

interface ConversationMessagesData {
  app?: {
    conversation?: {
      messages?: {
        collection?: RawChaskiqConversationPart[]
        meta?: PaginatedMeta
      } | null
    } | null
  } | null
}

interface AppUsersData {
  app?: {
    app_users?: RawChaskiqAppUser[] | null
  } | null
}

interface AppUserData {
  app?: {
    app_user?: RawChaskiqAppUser | null
  } | null
}

interface AgentsData {
  app?: {
    agents?: RawChaskiqAgent[] | null
  } | null
}

interface TeamsData {
  app?: {
    teams?: {
      collection?: RawChaskiqTeam[]
      meta?: PaginatedMeta
    } | null
  } | null
}

interface TeamData {
  app?: {
    team?: RawChaskiqTeam | null
  } | null
}

// ── GraphQL query strings ─────────────────────────────────────────────────

const CONVERSATIONS_QUERY = `
  query GetConversations($key: String!, $page: Int, $per: Int) {
    app(key: $key) {
      conversations(page: $page, per: $per) {
        collection {
          id
          key
          subject
          state
          priority
          created_at: createdAt
          closed_at: closedAt
          tag_list: tagList
          conversation_channels: conversationChannels
          assignee { id }
          main_participant: mainParticipant { id }
        }
        meta
      }
    }
  }
`

const CONVERSATION_QUERY = `
  query GetConversation($key: String!, $id: String!) {
    app(key: $key) {
      conversation(id: $id) {
        id
        key
        subject
        state
        priority
        created_at: createdAt
        closed_at: closedAt
        tag_list: tagList
        conversation_channels: conversationChannels
        assignee { id }
        main_participant: mainParticipant { id }
      }
    }
  }
`

const CONVERSATION_MESSAGES_QUERY = `
  query GetConversationMessages($key: String!, $id: String!, $page: Int, $per: Int) {
    app(key: $key) {
      conversation(id: $id) {
        messages(page: $page, per: $per) {
          collection {
            id
            key
            private_note: privateNote
            from_bot: fromBot
            created_at: createdAt
            app_user: appUser { id kind }
            message { text_content: textContent html_content: htmlContent }
          }
          meta
        }
      }
    }
  }
`

const APP_USERS_QUERY = `
  query GetAppUsers($key: String!) {
    app(key: $key) {
      app_users: appUsers {
        id
        email
        name
        display_name: displayName
        full_name: fullName
        phone
        kind
        tag_list: tagList
      }
    }
  }
`

const APP_USER_QUERY = `
  query GetAppUser($key: String!, $id: String!) {
    app(key: $key) {
      app_user: appUser(id: $id) {
        id
        email
        name
        display_name: displayName
        full_name: fullName
        phone
        kind
        tag_list: tagList
      }
    }
  }
`

const AGENTS_QUERY = `
  query GetAgents($key: String!) {
    app(key: $key) {
      agents {
        id
        email
        name
        display_name: displayName
        available
        lang
        area_of_expertise: areaOfExpertise
        availability
      }
    }
  }
`

const TEAMS_QUERY = `
  query GetTeams($key: String!, $page: Int, $per: Int) {
    app(key: $key) {
      teams(page: $page, per: $per) {
        collection { id name }
        meta
      }
    }
  }
`

const TEAM_QUERY = `
  query GetTeam($key: String!, $id: String!) {
    app(key: $key) {
      team(id: $id) {
        id
        name
      }
    }
  }
`

// ── Adapter ───────────────────────────────────────────────────────────────

// No OAuth client config required — API key flow only.
export type ChaskiqAdapterConfig = Record<never, never>

export class ChaskiqAdapter implements CustomerSupportAdapter {
  readonly platform = 'chaskiq'
  readonly version = '0.1.0'

  constructor(_config?: ChaskiqAdapterConfig) {}

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
    throw new Error('chaskiq uses static Bearer token auth; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  private client(credentials: Credentials): ChaskiqClient {
    return new ChaskiqClient(credentials)
  }

  private appKey(credentials: Credentials): string {
    const extra = (credentials.extra ?? {}) as Record<string, string>
    return extra['appKey'] ?? ''
  }

  /**
   * The 1-based Kaminari page to ask for. `params.page` is the contract; a
   * numeric `cursor` is the legacy spelling of the same page number.
   */
  private page(params: QueryParams): number {
    const raw = params.page ?? (params['cursor'] ? Number(params['cursor']) : 1)
    // GraphQL `Int`: a fractional page is a validation error, so floor it; and
    // Kaminari's page is 1-based, so never send below 1.
    return Number.isFinite(raw) ? Math.max(1, Math.floor(raw)) : 1
  }

  /**
   * Chaskiq's `meta` is a JSON scalar holding Kaminari's `next_page` (null on
   * the last page) and `total_count`; forward both as the end signal.
   */
  private reportMeta(params: QueryParams, meta: PaginatedMeta | null | undefined): void {
    if (!meta) return
    reportUpstreamPage(params, {
      hasMore: meta.next_page !== null && meta.next_page !== undefined,
      ...(typeof meta.total_count === 'number' ? { totalCount: meta.total_count } : {}),
    })
  }

  private per(params: QueryParams): number {
    return params.limit ?? DEFAULT_PAGE_SIZE
  }

  // ── Tickets (conversations) ─────────────────────────────────────────────

  async listTickets(credentials: Credentials, params: QueryParams): Promise<Ticket[]> {
    const data = await this.client(credentials).query<ConversationsData>(CONVERSATIONS_QUERY, {
      key: this.appKey(credentials),
      page: this.page(params),
      per: this.per(params),
    })
    this.reportMeta(params, data?.app?.conversations?.meta)
    return (data?.app?.conversations?.collection ?? []).map(transformTicket)
  }

  async getTicket(credentials: Credentials, id: string): Promise<Ticket> {
    const data = await this.client(credentials).query<ConversationData>(CONVERSATION_QUERY, {
      key: this.appKey(credentials),
      id,
    })
    const raw = data?.app?.conversation
    if (!raw) throw new Error(`Chaskiq conversation ${id} not found`)
    return transformTicket(raw)
  }

  // ── Messages (conversation parts) ──────────────────────────────────────

  async listMessages(
    credentials: Credentials,
    ticketId: string,
    params: QueryParams,
  ): Promise<Message[]> {
    const data = await this.client(credentials).query<ConversationMessagesData>(
      CONVERSATION_MESSAGES_QUERY,
      {
        key: this.appKey(credentials),
        id: ticketId,
        page: this.page(params),
        per: this.per(params),
      },
    )
    this.reportMeta(params, data?.app?.conversation?.messages?.meta)
    return (data?.app?.conversation?.messages?.collection ?? []).map((p) =>
      transformMessage(p, ticketId),
    )
  }

  async getMessage(_credentials: Credentials, id: string): Promise<Message> {
    throw new Error(
      `Chaskiq conversation parts are scoped to a conversation; call listMessages(ticketId). id=${id}`,
    )
  }

  // ── Contacts (app_users) ────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    // Chaskiq's appUsers field takes no arguments and returns every app user,
    // so the caller's page is cut from the whole collection.
    const data = await this.client(credentials).query<AppUsersData>(APP_USERS_QUERY, {
      key: this.appKey(credentials),
    })
    return pageLocally(data?.app?.app_users ?? [], params).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const data = await this.client(credentials).query<AppUserData>(APP_USER_QUERY, {
      key: this.appKey(credentials),
      id,
    })
    const raw = data?.app?.app_user
    if (!raw) throw new Error(`Chaskiq app_user ${id} not found`)
    return transformContact(raw)
  }

  // ── Users (agents) ──────────────────────────────────────────────────────

  async listUsers(credentials: Credentials, params: QueryParams): Promise<User[]> {
    const data = await this.client(credentials).query<AgentsData>(AGENTS_QUERY, {
      key: this.appKey(credentials),
    })
    // `agents` takes no arguments and returns every agent.
    return pageLocally(data?.app?.agents ?? [], params).map(transformUser)
  }

  async getUser(_credentials: Credentials, id: string): Promise<User> {
    throw new Error(
      `Chaskiq does not expose a single-agent fetch endpoint; call listUsers(). id=${id}`,
    )
  }

  // ── Teams ────────────────────────────────────────────────────────────────

  async listTeams(credentials: Credentials, params: QueryParams): Promise<Team[]> {
    const data = await this.client(credentials).query<TeamsData>(TEAMS_QUERY, {
      key: this.appKey(credentials),
      page: this.page(params),
      per: this.per(params),
    })
    this.reportMeta(params, data?.app?.teams?.meta)
    return (data?.app?.teams?.collection ?? []).map(transformTeam)
  }

  async getTeam(credentials: Credentials, id: string): Promise<Team> {
    const data = await this.client(credentials).query<TeamData>(TEAM_QUERY, {
      key: this.appKey(credentials),
      id,
    })
    const raw = data?.app?.team
    if (!raw) throw new Error(`Chaskiq team ${id} not found`)
    return transformTeam(raw)
  }
}
