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
import { TidioClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'
import { verifyTidioWebhook, parseTidioWebhookEvents } from './webhook'

import { transformTicket, type RawTidioTicket } from './transform/ticket'
import { transformMessage, type RawTidioComment } from './transform/message'
import { transformContact, type RawTidioUser } from './transform/contact'
import { transformUser, type RawTidioAgent } from './transform/user'
import { transformTag, type RawTidioTag } from './transform/tag'
import { transformTeam, type RawTidioGroup } from './transform/team'
import { transformMacro, type RawTidioMacro } from './transform/macro'

export interface TidioAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

interface TicketsResponse { tickets?: RawTidioTicket[] }
interface TicketResponse  { ticket?: RawTidioTicket }
interface CommentsResponse { comments?: RawTidioComment[] }
interface UsersResponse { users?: RawTidioUser[] }
interface UserResponse { user?: RawTidioUser }
interface GroupsResponse { groups?: RawTidioGroup[] }
interface GroupResponse { group?: RawTidioGroup }
interface TagsResponse { tags?: RawTidioTag[] }
interface MacrosResponse { macros?: RawTidioMacro[] }
interface MacroResponse { macro?: RawTidioMacro }

export class TidioAdapter implements CustomerSupportAdapter {
  readonly platform = 'tidio'
  readonly version = '0.1.0'

   
  constructor(_config: TidioAdapterConfig) {}

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
    throw new Error('tidio uses static API key auth; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyTidioWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseTidioWebhookEvents(payload)
  }

  private client(credentials: Credentials): TidioClient {
    return new TidioClient(credentials)
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
    return (res.users ?? []).map((u) => transformUser(u as unknown as RawTidioAgent))
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    const res = await this.client(credentials).get<UserResponse>(`/users/${id}.json`)
    if (!res.user) throw new Error(`Zendesk user ${id} not found`)
    return transformUser(res.user as unknown as RawTidioAgent)
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
