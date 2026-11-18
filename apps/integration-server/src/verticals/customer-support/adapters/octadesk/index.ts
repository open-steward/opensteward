/**
 * Octadesk adapter for the customer-support vertical.
 *
 * Octadesk is a Brazilian customer-support platform.
 * Base URL: https://api.octadesk.services
 * Auth: Bearer token (API key) + octa-agent-email header.
 * No OAuth — static API key issued from admin Settings > Integrations > API.
 *
 * Supported resources: tickets, messages (interactions), contacts (persons),
 * users (agents), teams (groups), tags.
 * Not supported: macros (Octadesk has no canned-response API).
 * Webhooks: Octadesk does not publish webhook signature verification docs;
 * webhook methods are intentionally omitted.
 *
 * Docs: https://developers.octadesk.com/reference/authentication
 */
import type { Credentials, CredentialField, QueryParams } from '@opensteward/shared'
import type { CustomerSupportAdapter } from '../../adapter/interface'
import type { Ticket } from '../../schema/ticket'
import type { Message } from '../../schema/message'
import type { Contact } from '../../schema/contact'
import type { User } from '../../schema/user'
import type { Tag } from '../../schema/tag'
import type { Team } from '../../schema/team'

import {
  credentialFields as adapterCredentialFields,
  exchangeCredentials as adapterExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import { OctadeskClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'

import { transformTicket, type RawOctadeskTicket } from './transform/ticket'
import { transformMessage, type RawOctadeskInteraction } from './transform/message'
import { transformContact, type RawOctadeskContact } from './transform/contact'
import { transformUser, type RawOctadeskAgent } from './transform/user'
import { transformTag, type RawOctadeskTag } from './transform/tag'
import { transformTeam, type RawOctadeskGroup } from './transform/team'

// ── Response envelope types ───────────────────────────────────────────────────

/** GET /tickets — returns an array of ticket objects directly or wrapped */
type TicketsResponse = RawOctadeskTicket[] | { data?: RawOctadeskTicket[]; tickets?: RawOctadeskTicket[] }

/** GET /tickets/{number}/interactions — returns array directly or wrapped */
type InteractionsResponse = RawOctadeskInteraction[] | { data?: RawOctadeskInteraction[]; interactions?: RawOctadeskInteraction[] }

/** GET /persons — returns array directly or wrapped */
type ContactsResponse = RawOctadeskContact[] | { data?: RawOctadeskContact[]; persons?: RawOctadeskContact[] }

/** GET /tickets/groups — returns array directly or wrapped */
type GroupsResponse = RawOctadeskGroup[] | { data?: RawOctadeskGroup[]; groups?: RawOctadeskGroup[] }

/** GET /tickets/tags — Octadesk tags endpoint returns string[] or object[] */
type TagsResponse = (string | RawOctadeskTag)[] | { data?: (string | RawOctadeskTag)[]; tags?: (string | RawOctadeskTag)[] }

// ── Helpers ───────────────────────────────────────────────────────────────────

function unwrapArray<T>(res: T[] | { data?: T[]; [k: string]: unknown }, key: string): T[] {
  if (Array.isArray(res)) return res
  const typed = res as { data?: T[]; [k: string]: unknown }
  if (Array.isArray(typed.data)) return typed.data
  const byKey = typed[key]
  if (Array.isArray(byKey)) return byKey as T[]
  return []
}

function normaliseTag(raw: string | RawOctadeskTag): RawOctadeskTag {
  if (typeof raw === 'string') return { name: raw }
  return raw
}

// ── Adapter config (static API key — no OAuth client needed) ─────────────────

export interface OctadeskAdapterConfig {
  /** Unused for API-key auth; kept for interface compatibility. */
  clientId?: string
  clientSecret?: string
  redirectUri?: string
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export class OctadeskAdapter implements CustomerSupportAdapter {
  readonly platform = 'octadesk'
  readonly version = '0.1.0'

   
  constructor(_config: OctadeskAdapterConfig = {}) {}

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
    throw new Error('octadesk uses static API key auth; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // API keys do not expire
    return credentials
  }

  private client(credentials: Credentials): OctadeskClient {
    return new OctadeskClient(credentials)
  }

  /**
   * Build page-based pagination params.
   * Octadesk uses page (1-based) + limit query params.
   */
  private listParams(params: QueryParams): Record<string, unknown> {
    return {
      limit: params.limit ?? DEFAULT_PAGE_SIZE,
      page: params['page'] ? Number(params['page']) : 1,
    }
  }

  // ── Tickets ─────────────────────────────────────────────────────────────────

  async listTickets(credentials: Credentials, params: QueryParams): Promise<Ticket[]> {
    const res = await this.client(credentials).get<TicketsResponse>('/tickets', this.listParams(params))
    return unwrapArray<RawOctadeskTicket>(res as RawOctadeskTicket[] | { data?: RawOctadeskTicket[]; [k: string]: unknown }, 'tickets').map(transformTicket)
  }

  async getTicket(credentials: Credentials, id: string): Promise<Ticket> {
    const raw = await this.client(credentials).get<RawOctadeskTicket>(`/tickets/${id}`)
    return transformTicket(raw)
  }

  // ── Messages (interactions scoped to a ticket) ───────────────────────────────

  async listMessages(credentials: Credentials, ticketId: string, params: QueryParams): Promise<Message[]> {
    const res = await this.client(credentials).get<InteractionsResponse>(
      `/tickets/${ticketId}/interactions`,
      this.listParams(params),
    )
    return unwrapArray<RawOctadeskInteraction>(res as RawOctadeskInteraction[] | { data?: RawOctadeskInteraction[]; [k: string]: unknown }, 'interactions')
      .map((i) => transformMessage(i, ticketId))
  }

  async getMessage(_credentials: Credentials, id: string): Promise<Message> {
    throw new Error(`Octadesk interactions are ticket-scoped; call listMessages(ticketId). id=${id}`)
  }

  // ── Contacts (persons) ───────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const res = await this.client(credentials).get<ContactsResponse>('/persons', this.listParams(params))
    return unwrapArray<RawOctadeskContact>(res as RawOctadeskContact[] | { data?: RawOctadeskContact[]; [k: string]: unknown }, 'persons').map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const raw = await this.client(credentials).get<RawOctadeskContact>(`/persons/${id}`)
    return transformContact(raw)
  }

  // ── Users (agents) ───────────────────────────────────────────────────────────

  async listUsers(credentials: Credentials, params: QueryParams): Promise<User[]> {
    const res = await this.client(credentials).get<ContactsResponse>('/persons', {
      ...this.listParams(params),
      role: 'agent',
    })
    return unwrapArray<RawOctadeskAgent>(res as RawOctadeskAgent[] | { data?: RawOctadeskAgent[]; [k: string]: unknown }, 'persons').map(transformUser)
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    const raw = await this.client(credentials).get<RawOctadeskAgent>(`/persons/${id}`)
    return transformUser(raw)
  }

  // ── Teams (groups) ───────────────────────────────────────────────────────────

  async listTeams(credentials: Credentials, params: QueryParams): Promise<Team[]> {
    const res = await this.client(credentials).get<GroupsResponse>('/tickets/groups', this.listParams(params))
    return unwrapArray<RawOctadeskGroup>(res as RawOctadeskGroup[] | { data?: RawOctadeskGroup[]; [k: string]: unknown }, 'groups').map(transformTeam)
  }

  async getTeam(_credentials: Credentials, id: string): Promise<Team> {
    throw new Error(`Octadesk groups have no individual get endpoint; call listTeams(). id=${id}`)
  }

  // ── Tags ─────────────────────────────────────────────────────────────────────

  async listTags(credentials: Credentials, params: QueryParams): Promise<Tag[]> {
    const res = await this.client(credentials).get<TagsResponse>('/tickets/tags', this.listParams(params))
    const items = unwrapArray<string | RawOctadeskTag>(res as (string | RawOctadeskTag)[] | { data?: (string | RawOctadeskTag)[]; [k: string]: unknown }, 'tags')
    return items.map(normaliseTag).map(transformTag)
  }

  async getTag(_credentials: Credentials, id: string): Promise<Tag> {
    throw new Error(`Octadesk tags have no individual get endpoint; call listTags(). id=${id}`)
  }
}
