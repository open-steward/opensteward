/**
 * Tiledesk adapter for the customer-support vertical.
 *
 * Auth: email + password + project_id  →  POST /v3/auth/signin  →  JWT token.
 * All tenant-scoped URLs: https://api.tiledesk.com/v3/:project_id/…
 * Header: Authorization: JWT <token>
 *
 * Supported resources:
 *   - Tickets      → /requests
 *   - Messages     → /requests/:id/messages
 *   - Contacts     → /leads
 *   - Users        → /project_users
 *   - Tags         → /tags
 *   - Teams        → /departments
 *   - Macros       → /canned
 *
 * Webhook signature: not documented; verifyWebhook / parseWebhookEvents
 * are intentionally omitted.
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
import { TiledeskClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'

import { transformTicket, type RawTiledeskRequest } from './transform/ticket'
import { transformMessage, type RawTiledeskMessage } from './transform/message'
import { transformContact, type RawTiledeskLead } from './transform/contact'
import { transformUser, type RawTiledeskProjectUser } from './transform/user'
import { transformTag, type RawTiledeskTag } from './transform/tag'
import { transformTeam, type RawTiledeskDepartment } from './transform/team'
import { transformMacro, type RawTiledeskCannedResponse } from './transform/macro'

// ── Response envelope shapes ──────────────────────────────────────────────────

interface RequestsListResponse {
  requests?: RawTiledeskRequest[]
}

interface LeadsListResponse {
  leads?: RawTiledeskLead[]
  count?: number
  perPage?: number
}

// The project_users and departments endpoints return plain arrays
type ProjectUsersResponse = RawTiledeskProjectUser[]
type DepartmentsResponse  = RawTiledeskDepartment[]
type TagsListResponse     = RawTiledeskTag[]
type MessagesListResponse = RawTiledeskMessage[]

interface CannedListResponse {
  cannedResponses?: RawTiledeskCannedResponse[]
}

export class TiledeskAdapter implements CustomerSupportAdapter {
  readonly platform = 'tiledesk'
  readonly version  = '0.1.0'

  // No OAuth config required — credential exchange is done via email/password
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
    throw new Error('tiledesk uses email/password auth; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // JWT tokens from Tiledesk do not have a public refresh mechanism;
    // re-exchange with the same credentials if needed.
    return credentials
  }

  // ── Internal helpers ───────────────────────────────────────────────────────

  private client(credentials: Credentials): TiledeskClient {
    return new TiledeskClient(credentials)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    return {
      limit: params.limit ?? DEFAULT_PAGE_SIZE,
      ...(params['page'] != null ? { page: Number(params['page']) } : {}),
    }
  }

  // ── Tickets (/requests) ────────────────────────────────────────────────────

  async listTickets(credentials: Credentials, params: QueryParams): Promise<Ticket[]> {
    const res = await this.client(credentials).get<RequestsListResponse>(
      '/requests',
      this.listParams(params),
    )
    return (res.requests ?? []).map(transformTicket)
  }

  async getTicket(credentials: Credentials, id: string): Promise<Ticket> {
    const raw = await this.client(credentials).get<RawTiledeskRequest>(`/requests/${id}`)
    return transformTicket(raw)
  }

  // ── Messages (/requests/:id/messages) ────────────────────────────────────

  async listMessages(
    credentials: Credentials,
    ticketId: string,
    params: QueryParams,
  ): Promise<Message[]> {
    const res = await this.client(credentials).get<MessagesListResponse>(
      `/requests/${ticketId}/messages`,
      this.listParams(params),
    )
    const msgs = Array.isArray(res) ? res : []
    return msgs.map((m) => transformMessage(m, ticketId))
  }

  async getMessage(credentials: Credentials, id: string): Promise<Message> {
    // Tiledesk messages are always scoped to a request; id should be
    // "requestId/messageId" as a convenience convention.
    const parts = id.split('/')
    if (parts.length < 2) {
      throw new Error(`tiledesk: getMessage requires id in format "requestId/messageId", got "${id}"`)
    }
    const [requestId, messageId] = parts
    const raw = await this.client(credentials).get<RawTiledeskMessage>(
      `/requests/${requestId}/messages/${messageId}`,
    )
    return transformMessage(raw, requestId!)
  }

  // ── Contacts (/leads) ─────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const res = await this.client(credentials).get<LeadsListResponse>(
      '/leads',
      this.listParams(params),
    )
    return (res.leads ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const raw = await this.client(credentials).get<RawTiledeskLead>(`/leads/${id}`)
    return transformContact(raw)
  }

  // ── Users (/project_users) ────────────────────────────────────────────────

  async listUsers(credentials: Credentials, params: QueryParams): Promise<User[]> {
    const res = await this.client(credentials).get<ProjectUsersResponse>(
      '/project_users',
      this.listParams(params),
    )
    const arr = Array.isArray(res) ? res : []
    return arr.map(transformUser)
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    const raw = await this.client(credentials).get<RawTiledeskProjectUser>(
      `/project_users/${id}`,
    )
    return transformUser(raw)
  }

  // ── Tags (/tags) ──────────────────────────────────────────────────────────

  async listTags(credentials: Credentials, params: QueryParams): Promise<Tag[]> {
    const res = await this.client(credentials).get<TagsListResponse>(
      '/tags',
      this.listParams(params),
    )
    const arr = Array.isArray(res) ? res : []
    return arr.map(transformTag)
  }

  async getTag(credentials: Credentials, id: string): Promise<Tag> {
    const raw = await this.client(credentials).get<RawTiledeskTag>(`/tags/${id}`)
    return transformTag(raw)
  }

  // ── Teams (/departments) ──────────────────────────────────────────────────

  async listTeams(credentials: Credentials, params: QueryParams): Promise<Team[]> {
    const res = await this.client(credentials).get<DepartmentsResponse>(
      '/departments',
      this.listParams(params),
    )
    const arr = Array.isArray(res) ? res : []
    return arr.map(transformTeam)
  }

  async getTeam(credentials: Credentials, id: string): Promise<Team> {
    const raw = await this.client(credentials).get<RawTiledeskDepartment>(`/departments/${id}`)
    return transformTeam(raw)
  }

  // ── Macros (/canned) ──────────────────────────────────────────────────────

  async listMacros(credentials: Credentials, params: QueryParams): Promise<Macro[]> {
    const res = await this.client(credentials).get<CannedListResponse>(
      '/canned',
      this.listParams(params),
    )
    // Some versions return a plain array, others wrap in cannedResponses
    const arr = Array.isArray(res)
      ? (res as RawTiledeskCannedResponse[])
      : (res.cannedResponses ?? [])
    return arr.map(transformMacro)
  }

  async getMacro(credentials: Credentials, id: string): Promise<Macro> {
    const raw = await this.client(credentials).get<RawTiledeskCannedResponse>(`/canned/${id}`)
    return transformMacro(raw)
  }
}
