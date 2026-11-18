/**
 * Deskpro adapter for the customer-support vertical.
 *
 * Per-customer instance URL (e.g. https://acme.deskpro.com). API key auth.
 * Schema-firewall: no attachment content, no voice-recording bytes, no
 * AI-suggested-reply fields.
 *
 * Supported resources:
 *   - tickets         GET /api/v2/tickets, /api/v2/tickets/{id}
 *   - messages        GET /api/v2/tickets/{id}/messages
 *   - contacts        GET /api/v2/people, /api/v2/people/{id}
 *   - users (agents)  GET /api/v2/agents, /api/v2/agents/{id}
 *   - tags (labels)   GET /api/v2/ticket-labels
 *   - teams (depts)   GET /api/v2/departments, /api/v2/departments/{id}
 *   - macros (snippets) GET /api/v2/snippets, /api/v2/snippets/{id}
 *
 * Webhooks: Deskpro supports outbound webhook triggers but does not document
 * a shared-secret / HMAC signature scheme, so verifyWebhook and
 * parseWebhookEvents are intentionally omitted.
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

import {
  credentialFields as adapterCredentialFields,
  exchangeCredentials as adapterExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import { DeskproClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'

import { transformTicket, type RawDeskproTicket } from './transform/ticket'
import { transformMessage, type RawDeskproMessage } from './transform/message'
import { transformContact, type RawDeskproPerson } from './transform/contact'
import { transformUser, type RawDeskproAgent } from './transform/user'
import { transformTag, type RawDeskproLabel } from './transform/tag'
import { transformTeam, type RawDeskproDepartment } from './transform/team'
import { transformMacro, type RawDeskproSnippet } from './transform/macro'

// ── Deskpro response envelopes ────────────────────────────────────────────────
// All Deskpro API responses wrap resources in { data: T } for single or
// { data: T[] } for collections.

interface DeskproCollection<T> {
  data?: T[]
  meta?: { pagination?: { total?: number; page?: number; per_page?: number; total_pages?: number } }
}

interface DeskproSingle<T> {
  data?: T
}

export class DeskproAdapter implements CustomerSupportAdapter {
  readonly platform = 'deskpro'
  readonly version = '0.1.0'

  // No OAuth config required — Deskpro uses API key auth
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
    throw new Error('Deskpro uses static API key auth; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // API keys do not expire
    return credentials
  }

  private client(credentials: Credentials): DeskproClient {
    return new DeskproClient(credentials)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    return {
      count: params.limit ?? DEFAULT_PAGE_SIZE,
      ...(params['page'] ? { page: Number(params['page']) } : {}),
    }
  }

  // ── Tickets ────────────────────────────────────────────────────────────────

  async listTickets(credentials: Credentials, params: QueryParams): Promise<Ticket[]> {
    const res = await this.client(credentials).get<DeskproCollection<RawDeskproTicket>>(
      '/tickets',
      this.listParams(params),
    )
    return (res.data ?? []).map(transformTicket)
  }

  async getTicket(credentials: Credentials, id: string): Promise<Ticket> {
    const res = await this.client(credentials).get<DeskproSingle<RawDeskproTicket>>(`/tickets/${id}`)
    if (!res.data) throw new Error(`Deskpro ticket ${id} not found`)
    return transformTicket(res.data)
  }

  // ── Messages ───────────────────────────────────────────────────────────────

  async listMessages(credentials: Credentials, ticketId: string, params: QueryParams): Promise<Message[]> {
    const res = await this.client(credentials).get<DeskproCollection<RawDeskproMessage>>(
      `/tickets/${ticketId}/messages`,
      this.listParams(params),
    )
    return (res.data ?? []).map((m) => transformMessage(m, ticketId))
  }

  async getMessage(credentials: Credentials, id: string): Promise<Message> {
    // Deskpro messages are ticket-scoped; id format should be "ticketId:messageId"
    const parts = id.split(':')
    if (parts.length !== 2) {
      throw new Error(`Deskpro getMessage requires id in format "ticketId:messageId". Got: ${id}`)
    }
    const [ticketId, messageId] = parts
    const res = await this.client(credentials).get<DeskproSingle<RawDeskproMessage>>(
      `/tickets/${ticketId}/messages/${messageId}`,
    )
    if (!res.data) throw new Error(`Deskpro message ${id} not found`)
    return transformMessage(res.data, ticketId!)
  }

  // ── Contacts ───────────────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const res = await this.client(credentials).get<DeskproCollection<RawDeskproPerson>>(
      '/people',
      this.listParams(params),
    )
    return (res.data ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const res = await this.client(credentials).get<DeskproSingle<RawDeskproPerson>>(`/people/${id}`)
    if (!res.data) throw new Error(`Deskpro person ${id} not found`)
    return transformContact(res.data)
  }

  // ── Users (agents) ─────────────────────────────────────────────────────────

  async listUsers(credentials: Credentials, params: QueryParams): Promise<User[]> {
    const res = await this.client(credentials).get<DeskproCollection<RawDeskproAgent>>(
      '/agents',
      this.listParams(params),
    )
    return (res.data ?? []).map(transformUser)
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    const res = await this.client(credentials).get<DeskproSingle<RawDeskproAgent>>(`/agents/${id}`)
    if (!res.data) throw new Error(`Deskpro agent ${id} not found`)
    return transformUser(res.data)
  }

  // ── Tags (labels) ──────────────────────────────────────────────────────────

  async listTags(credentials: Credentials, params: QueryParams): Promise<Tag[]> {
    const res = await this.client(credentials).get<DeskproCollection<RawDeskproLabel>>(
      '/ticket-labels',
      this.listParams(params),
    )
    return (res.data ?? []).map(transformTag)
  }

  async getTag(credentials: Credentials, id: string): Promise<Tag> {
    // GET /api/v2/ticket-labels/{id} is not a documented Deskpro endpoint.
    // Fetch the full list and filter by id instead.
    const res = await this.client(credentials).get<DeskproCollection<RawDeskproLabel>>('/ticket-labels', {
      count: DEFAULT_PAGE_SIZE,
    })
    const found = (res.data ?? []).find((l) => String(l.id) === id)
    if (!found) throw new Error(`Deskpro label ${id} not found`)
    return transformTag(found)
  }

  // ── Teams (departments) ────────────────────────────────────────────────────

  async listTeams(credentials: Credentials, params: QueryParams): Promise<Team[]> {
    const res = await this.client(credentials).get<DeskproCollection<RawDeskproDepartment>>(
      '/departments',
      this.listParams(params),
    )
    return (res.data ?? []).map(transformTeam)
  }

  async getTeam(credentials: Credentials, id: string): Promise<Team> {
    const res = await this.client(credentials).get<DeskproSingle<RawDeskproDepartment>>(`/departments/${id}`)
    if (!res.data) throw new Error(`Deskpro department ${id} not found`)
    return transformTeam(res.data)
  }

  // ── Macros (snippets) ──────────────────────────────────────────────────────

  async listMacros(credentials: Credentials, params: QueryParams): Promise<Macro[]> {
    const res = await this.client(credentials).get<DeskproCollection<RawDeskproSnippet>>(
      '/snippets',
      this.listParams(params),
    )
    return (res.data ?? []).map(transformMacro)
  }

  async getMacro(credentials: Credentials, id: string): Promise<Macro> {
    const res = await this.client(credentials).get<DeskproSingle<RawDeskproSnippet>>(`/snippets/${id}`)
    if (!res.data) throw new Error(`Deskpro snippet ${id} not found`)
    return transformMacro(res.data)
  }
}
