/**
 * Omnidesk adapter for the customer-support vertical.
 *
 * Auth: HTTP Basic Authentication (staffEmail + apiKey), per-tenant subdomain.
 * Base URL: https://{subdomain}.omnidesk.ru/api
 *
 * Supported resources: tickets (cases), messages, contacts (users),
 * users (staff), tags (labels), teams (groups).
 *
 * Webhooks: not documented by Omnidesk — omitted.
 * Macros: not offered by Omnidesk — omitted.
 */
import type { Credentials, CredentialField, QueryParams } from '@opensteward/shared'
import type { CustomerSupportAdapter } from '../../adapter/interface'
import type { Ticket } from '../../schema/ticket'
import type { Message } from '../../schema/message'
import type { Contact } from '../../schema/contact'
import type { User } from '../../schema/user'
import type { Tag } from '../../schema/tag'
import type { Team } from '../../schema/team'

import { credentialFields as adapterCredentialFields, exchangeCredentials as adapterExchangeCredentials, getAuthUrlUnsupported } from './auth'
import { OmnideskClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'

import { transformTicket, type RawOmnideskCase } from './transform/ticket'
import { transformMessage, type RawOmnideskMessage } from './transform/message'
import { transformContact, type RawOmnideskUser } from './transform/contact'
import { transformUser, type RawOmnideskStaff } from './transform/user'
import { transformTag, type RawOmnideskLabel } from './transform/tag'
import { transformTeam, type RawOmnideskGroup } from './transform/team'

// Omnidesk API wraps list results in numbered keys + total_count:
//   { "0": { case: {...} }, "1": { case: {...} }, total_count: 42 }
// or for flat arrays in some endpoints.

interface OmnideskListResponse<K extends string, T> {
  total_count?: number
  [index: string]: { [key in K]?: T } | number | undefined
}

function extractList<K extends string, T>(
  res: OmnideskListResponse<K, T>,
  key: K,
): T[] {
  const out: T[] = []
  for (const [k, val] of Object.entries(res)) {
    if (k === 'total_count') continue
    const item = (val as Record<string, unknown> | undefined)?.[key]
    if (item !== undefined) out.push(item as T)
  }
  return out
}

export type OmnideskAdapterConfig = Record<string, never>

export class OmnideskAdapter implements CustomerSupportAdapter {
  readonly platform = 'omnidesk'
  readonly version = '0.1.0'

  constructor(_config: OmnideskAdapterConfig = {}) {}

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
    throw new Error('omnidesk uses HTTP Basic auth; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  private client(credentials: Credentials): OmnideskClient {
    return new OmnideskClient(credentials)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    const limit = Math.min(Number(params.limit ?? DEFAULT_PAGE_SIZE), 100)
    return {
      limit,
      ...(params['page'] ? { page: Number(params['page']) } : {}),
    }
  }

  // ── Tickets (cases) ─────────────────────────────────────────────────────

  async listTickets(credentials: Credentials, params: QueryParams): Promise<Ticket[]> {
    const res = await this.client(credentials).get<OmnideskListResponse<'case', RawOmnideskCase>>(
      '/cases.json',
      this.listParams(params),
    )
    return extractList(res, 'case').map(transformTicket)
  }

  async getTicket(credentials: Credentials, id: string): Promise<Ticket> {
    const res = await this.client(credentials).get<{ case?: RawOmnideskCase }>(`/cases/${id}.json`)
    if (!res.case) throw new Error(`omnidesk: case ${id} not found`)
    return transformTicket(res.case)
  }

  // ── Messages ─────────────────────────────────────────────────────────────

  async listMessages(credentials: Credentials, ticketId: string, params: QueryParams): Promise<Message[]> {
    const res = await this.client(credentials).get<OmnideskListResponse<'message', RawOmnideskMessage>>(
      `/cases/${ticketId}/messages.json`,
      this.listParams(params),
    )
    return extractList(res, 'message').map((m) => transformMessage(m, ticketId))
  }

  async getMessage(_credentials: Credentials, id: string): Promise<Message> {
    throw new Error(`omnidesk messages are ticket-scoped; call listMessages(ticketId). id=${id}`)
  }

  // ── Contacts (end-users) ─────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const res = await this.client(credentials).get<OmnideskListResponse<'user', RawOmnideskUser>>(
      '/users.json',
      this.listParams(params),
    )
    return extractList(res, 'user').map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const res = await this.client(credentials).get<{ user?: RawOmnideskUser }>(`/users/${id}.json`)
    if (!res.user) throw new Error(`omnidesk: user ${id} not found`)
    return transformContact(res.user)
  }

  // ── Users (staff / agents) ───────────────────────────────────────────────

  async listUsers(credentials: Credentials, params: QueryParams): Promise<User[]> {
    const res = await this.client(credentials).get<OmnideskListResponse<'staff', RawOmnideskStaff>>(
      '/staff.json',
      this.listParams(params),
    )
    return extractList(res, 'staff').map(transformUser)
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    const res = await this.client(credentials).get<{ staff?: RawOmnideskStaff }>(`/staff/${id}.json`)
    if (!res.staff) throw new Error(`omnidesk: staff ${id} not found`)
    return transformUser(res.staff)
  }

  // ── Tags (labels) ────────────────────────────────────────────────────────

  async listTags(credentials: Credentials, params: QueryParams): Promise<Tag[]> {
    const res = await this.client(credentials).get<OmnideskListResponse<'label', RawOmnideskLabel>>(
      '/labels.json',
      this.listParams(params),
    )
    return extractList(res, 'label').map(transformTag)
  }

  async getTag(_credentials: Credentials, id: string): Promise<Tag> {
    throw new Error(`omnidesk labels do not have an individual GET endpoint. id=${id}`)
  }

  // ── Teams (groups) ───────────────────────────────────────────────────────

  async listTeams(credentials: Credentials, params: QueryParams): Promise<Team[]> {
    const res = await this.client(credentials).get<OmnideskListResponse<'group', RawOmnideskGroup>>(
      '/groups.json',
      this.listParams(params),
    )
    return extractList(res, 'group').map(transformTeam)
  }

  async getTeam(credentials: Credentials, id: string): Promise<Team> {
    const res = await this.client(credentials).get<{ group?: RawOmnideskGroup }>(`/groups/${id}.json`)
    if (!res.group) throw new Error(`omnidesk: group ${id} not found`)
    return transformTeam(res.group)
  }
}
