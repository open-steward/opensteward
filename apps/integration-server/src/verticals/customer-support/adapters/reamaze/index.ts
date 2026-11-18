/**
 * Zendesk adapter — reference implementation for the customer-support vertical.
 *
 * Per-tenant subdomain (subdomain.zendesk.com). OAuth 2.0 + read scope.
 * Schema-firewall: no attachment content, no voice-recording bytes, no
 * AI-suggested-reply fields.
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
import type { WebhookEvent } from '../../schema/webhook'

import { credentialFields as adapterCredentialFields, exchangeCredentials as adapterExchangeCredentials, getAuthUrlUnsupported } from './auth'
import { ReamazeClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'
import { verifyReamazeWebhook, parseReamazeWebhookEvents } from './webhook'

import { transformTicket, type RawReamazeTicket } from './transform/ticket'
import { transformMessage, type RawReamazeComment } from './transform/message'
import { transformContact, type RawReamazeUser } from './transform/contact'
import { transformUser, type RawReamazeAgent } from './transform/user'
import { transformTag, type RawReamazeTag } from './transform/tag'
import { transformTeam, type RawReamazeGroup } from './transform/team'
import { transformMacro, type RawReamazeMacro } from './transform/macro'

export interface ReamazeAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

interface TicketsResponse { tickets?: RawReamazeTicket[] }
interface TicketResponse  { ticket?: RawReamazeTicket }
interface CommentsResponse { comments?: RawReamazeComment[] }
interface UsersResponse { users?: RawReamazeUser[] }
interface UserResponse { user?: RawReamazeUser }
interface GroupsResponse { groups?: RawReamazeGroup[] }
interface GroupResponse { group?: RawReamazeGroup }
interface TagsResponse { tags?: RawReamazeTag[] }
interface MacrosResponse { macros?: RawReamazeMacro[] }
interface MacroResponse { macro?: RawReamazeMacro }

export class ReamazeAdapter implements CustomerSupportAdapter {
  readonly platform = 'reamaze'
  readonly version = '0.1.0'

   
  constructor(_config: ReamazeAdapterConfig) {}

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
    throw new Error('reamaze uses static API key auth; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyReamazeWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseReamazeWebhookEvents(payload)
  }

  private client(credentials: Credentials): ReamazeClient {
    return new ReamazeClient(credentials)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    return {
      per_page: params.limit ?? DEFAULT_PAGE_SIZE,
      ...(params['cursor'] ? { 'page[after]': String(params['cursor']) } : {}),
    }
  }

  async listTickets(credentials: Credentials, params: QueryParams): Promise<Ticket[]> {
    const res = await this.client(credentials).get<TicketsResponse>('/tickets.json', this.listParams(params))
    return (res.tickets ?? []).map(transformTicket)
  }

  async getTicket(credentials: Credentials, id: string): Promise<Ticket> {
    const res = await this.client(credentials).get<TicketResponse>(`/tickets/${id}.json`)
    if (!res.ticket) throw new Error(`Zendesk ticket ${id} not found`)
    return transformTicket(res.ticket)
  }

  async listMessages(credentials: Credentials, ticketId: string, params: QueryParams): Promise<Message[]> {
    const res = await this.client(credentials).get<CommentsResponse>(
      `/tickets/${ticketId}/comments.json`,
      this.listParams(params),
    )
    return (res.comments ?? []).map((c) => transformMessage(c, ticketId))
  }

  async getMessage(_credentials: Credentials, id: string): Promise<Message> {
    throw new Error(`Zendesk comments are ticket-scoped; call listMessages(ticketId). id=${id}`)
  }

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const res = await this.client(credentials).get<UsersResponse>('/users.json', {
      ...this.listParams(params),
      role: 'end-user',
    })
    return (res.users ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const res = await this.client(credentials).get<UserResponse>(`/users/${id}.json`)
    if (!res.user) throw new Error(`Zendesk user ${id} not found`)
    return transformContact(res.user)
  }

  async listUsers(credentials: Credentials, params: QueryParams): Promise<User[]> {
    const res = await this.client(credentials).get<UsersResponse>('/users.json', {
      ...this.listParams(params),
      role: 'agent',
    })
    return (res.users ?? []).map((u) => transformUser(u as unknown as RawReamazeAgent))
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    const res = await this.client(credentials).get<UserResponse>(`/users/${id}.json`)
    if (!res.user) throw new Error(`Zendesk user ${id} not found`)
    return transformUser(res.user as unknown as RawReamazeAgent)
  }

  async listTags(credentials: Credentials, params: QueryParams): Promise<Tag[]> {
    const res = await this.client(credentials).get<TagsResponse>('/tags.json', this.listParams(params))
    return (res.tags ?? []).map(transformTag)
  }

  async getTag(_credentials: Credentials, id: string): Promise<Tag> {
    throw new Error(`Zendesk tags don't have an individual get endpoint. id=${id}`)
  }

  async listTeams(credentials: Credentials, params: QueryParams): Promise<Team[]> {
    const res = await this.client(credentials).get<GroupsResponse>('/groups.json', this.listParams(params))
    return (res.groups ?? []).map(transformTeam)
  }

  async getTeam(credentials: Credentials, id: string): Promise<Team> {
    const res = await this.client(credentials).get<GroupResponse>(`/groups/${id}.json`)
    if (!res.group) throw new Error(`Zendesk group ${id} not found`)
    return transformTeam(res.group)
  }

  async listMacros(credentials: Credentials, params: QueryParams): Promise<Macro[]> {
    const res = await this.client(credentials).get<MacrosResponse>('/macros.json', this.listParams(params))
    return (res.macros ?? []).map(transformMacro)
  }

  async getMacro(credentials: Credentials, id: string): Promise<Macro> {
    const res = await this.client(credentials).get<MacroResponse>(`/macros/${id}.json`)
    if (!res.macro) throw new Error(`Zendesk macro ${id} not found`)
    return transformMacro(res.macro)
  }
}
