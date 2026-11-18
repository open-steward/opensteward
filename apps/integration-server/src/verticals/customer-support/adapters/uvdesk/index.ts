/**
 * UVdesk adapter for the customer-support vertical.
 *
 * Per-tenant subdomain (subdomain.uvdesk.com). API-key auth via Bearer token.
 * Schema-firewall: no attachment content, no voice-recording bytes.
 *
 * Supported resources:
 *   - Tickets        GET /{locale}/api/tickets.json
 *   - Threads        GET /{locale}/api/ticket/{id}/threads.json
 *   - Customers      GET /{locale}/api/customers.json
 *   - Members        GET /{locale}/api/members.json
 *   - Tags           GET /{locale}/api/tags.json
 *   - Groups         GET /{locale}/api/groups.json  (mapped to Teams)
 *   - Saved replies  GET /{locale}/api/saved-replys.json  (mapped to Macros)
 *
 * Webhooks: UVdesk does not document a webhook signature scheme; omitted.
 *
 * Docs: https://www.uvdesk.com/en/api-doc/
 */
import type { Credentials, CredentialField, QueryParams } from '@opensteward/shared'
import type { CustomerSupportAdapter } from '../../adapter/interface'
import type { Ticket } from '../../schema/ticket'
import type { Message } from '../../schema/message'
import type { Contact } from '../../schema/contact'
import type { User } from '../../schema/user'
import type { Tag } from '../../schema/tag'
import type { Team } from '../../schema/team'
import type { Macro } from '../../schema/macro'

import { credentialFields as adapterCredentialFields, exchangeCredentials as adapterExchangeCredentials, getAuthUrlUnsupported } from './auth'
import { UvdeskClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'

import { transformTicket, type RawUvdeskTicket } from './transform/ticket'
import { transformMessage, type RawUvdeskThread } from './transform/message'
import { transformContact, type RawUvdeskCustomer } from './transform/contact'
import { transformUser, type RawUvdeskMember } from './transform/user'
import { transformTag, type RawUvdeskTag } from './transform/tag'
import { transformTeam, type RawUvdeskGroup } from './transform/team'
import { transformMacro, type RawUvdeskSavedReply } from './transform/macro'

// ── Response envelope types ──────────────────────────────────────────────────

interface TicketsEnvelope {
  tickets?: RawUvdeskTicket[]
  data?: RawUvdeskTicket[]
}
interface TicketEnvelope {
  ticket?: RawUvdeskTicket
  data?: RawUvdeskTicket
}
interface ThreadsEnvelope {
  threads?: RawUvdeskThread[]
  data?: RawUvdeskThread[]
}
interface CustomersEnvelope {
  customers?: RawUvdeskCustomer[]
  data?: RawUvdeskCustomer[]
}
interface CustomerEnvelope {
  customer?: RawUvdeskCustomer
  data?: RawUvdeskCustomer
}
interface MembersEnvelope {
  members?: RawUvdeskMember[]
  data?: RawUvdeskMember[]
}
interface MemberEnvelope {
  member?: RawUvdeskMember
  data?: RawUvdeskMember
  agent?: RawUvdeskMember
}
interface TagsEnvelope {
  tags?: RawUvdeskTag[]
  data?: RawUvdeskTag[]
}
interface GroupsEnvelope {
  groups?: RawUvdeskGroup[]
  data?: RawUvdeskGroup[]
}
interface GroupEnvelope {
  group?: RawUvdeskGroup
  data?: RawUvdeskGroup
}
interface SavedRepliesEnvelope {
  savedReplies?: RawUvdeskSavedReply[]
  savedReply?: RawUvdeskSavedReply[]
  data?: RawUvdeskSavedReply[]
}
interface SavedReplyEnvelope {
  savedReply?: RawUvdeskSavedReply
  data?: RawUvdeskSavedReply
}

// ── Adapter ──────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface UvdeskAdapterConfig {}

export class UvdeskAdapter implements CustomerSupportAdapter {
  readonly platform = 'uvdesk'
  readonly version = '0.1.0'

  constructor(_config: UvdeskAdapterConfig = {}) {}

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
    throw new Error('uvdesk uses static API key auth; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private client(credentials: Credentials): UvdeskClient {
    return new UvdeskClient(credentials)
  }

  /**
   * Build pagination query params.
   * UVdesk uses ?page=N&numItemsPerPage=N
   * The cursor is treated as a page number.
   */
  private listParams(params: QueryParams): Record<string, unknown> {
    return {
      numItemsPerPage: params.limit ?? DEFAULT_PAGE_SIZE,
      ...(params['cursor'] ? { page: Number(params['cursor']) } : { page: 1 }),
    }
  }

  // ── Tickets ────────────────────────────────────────────────────────────────

  async listTickets(credentials: Credentials, params: QueryParams): Promise<Ticket[]> {
    const res = await this.client(credentials).get<TicketsEnvelope>('/tickets.json', this.listParams(params))
    const items = res.tickets ?? res.data ?? []
    return items.map(transformTicket)
  }

  async getTicket(credentials: Credentials, id: string): Promise<Ticket> {
    const res = await this.client(credentials).get<TicketEnvelope>(`/ticket/${id}.json`)
    const item = res.ticket ?? res.data
    if (!item) throw new Error(`uvdesk: ticket ${id} not found`)
    return transformTicket(item)
  }

  // ── Threads (Messages scoped to a ticket) ──────────────────────────────────

  async listMessages(credentials: Credentials, ticketId: string, params: QueryParams): Promise<Message[]> {
    const res = await this.client(credentials).get<ThreadsEnvelope>(
      `/ticket/${ticketId}/threads.json`,
      this.listParams(params),
    )
    const items = res.threads ?? res.data ?? []
    return items.map((t) => transformMessage(t, ticketId))
  }

  async getMessage(_credentials: Credentials, id: string): Promise<Message> {
    throw new Error(`uvdesk: threads are ticket-scoped; call listMessages(ticketId). id=${id}`)
  }

  // ── Customers (Contacts) ───────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const res = await this.client(credentials).get<CustomersEnvelope>('/customers.json', this.listParams(params))
    const items = res.customers ?? res.data ?? []
    return items.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const res = await this.client(credentials).get<CustomerEnvelope>(`/customer/${id}.json`)
    const item = res.customer ?? res.data
    if (!item) throw new Error(`uvdesk: customer ${id} not found`)
    return transformContact(item)
  }

  // ── Members (Agents / Users) ───────────────────────────────────────────────

  async listUsers(credentials: Credentials, params: QueryParams): Promise<User[]> {
    const res = await this.client(credentials).get<MembersEnvelope>('/members.json', this.listParams(params))
    const items = res.members ?? res.data ?? []
    return items.map(transformUser)
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    const res = await this.client(credentials).get<MemberEnvelope>(`/member/${id}.json`)
    const item = res.member ?? res.agent ?? res.data
    if (!item) throw new Error(`uvdesk: member ${id} not found`)
    return transformUser(item)
  }

  // ── Tags ───────────────────────────────────────────────────────────────────

  async listTags(credentials: Credentials, params: QueryParams): Promise<Tag[]> {
    const res = await this.client(credentials).get<TagsEnvelope>('/tags.json', this.listParams(params))
    const items = res.tags ?? res.data ?? []
    return items.map(transformTag)
  }

  // UVdesk does not expose a single-tag GET endpoint.

  // ── Groups (Teams) ─────────────────────────────────────────────────────────

  async listTeams(credentials: Credentials, params: QueryParams): Promise<Team[]> {
    const res = await this.client(credentials).get<GroupsEnvelope>('/groups.json', this.listParams(params))
    const items = res.groups ?? res.data ?? []
    return items.map(transformTeam)
  }

  async getTeam(credentials: Credentials, id: string): Promise<Team> {
    const res = await this.client(credentials).get<GroupEnvelope>(`/group/${id}.json`)
    const item = res.group ?? res.data
    if (!item) throw new Error(`uvdesk: group ${id} not found`)
    return transformTeam(item)
  }

  // ── Saved Replies (Macros) ─────────────────────────────────────────────────

  async listMacros(credentials: Credentials, params: QueryParams): Promise<Macro[]> {
    const res = await this.client(credentials).get<SavedRepliesEnvelope>('/saved-replys.json', this.listParams(params))
    const items = res.savedReplies ?? res.savedReply ?? res.data ?? []
    return items.map(transformMacro)
  }

  async getMacro(credentials: Credentials, id: string): Promise<Macro> {
    const res = await this.client(credentials).get<SavedReplyEnvelope>(`/saved-reply/${id}.json`)
    const item = res.savedReply ?? res.data
    if (!item) throw new Error(`uvdesk: saved-reply ${id} not found`)
    return transformMacro(item)
  }
}
