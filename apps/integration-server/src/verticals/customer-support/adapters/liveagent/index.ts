/**
 * LiveAgent adapter for the customer-support vertical.
 *
 * Per-tenant subdomain (subdomain.ladesk.com). API key auth via `apikey`
 * header. Implements: tickets, messages, contacts, users (agents), tags,
 * teams (departments), macros (canned messages).
 *
 * Webhook signature verification is NOT documented by LiveAgent and is
 * therefore omitted — verifyWebhook / parseWebhookEvents are not implemented.
 *
 * Paging (https://support.ladesk.com/docs/api/v3/): every list endpoint but
 * GET /tags takes `_page` ("Page to display") + `_perPage` ("Results per
 * page") and returns a bare array with no total or next link. Those lists are
 * cut into caller pages by pageByRows over upstream pages of the caller's
 * size, ending on an empty page so a silent server cap cannot read as the
 * end. GET /tags takes no parameters and returns every tag, which pageLocally
 * slices.
 *
 * Schema-firewall: no attachment content, no voice-recording bytes.
 */
import {
  connectionScope,
  cursorPagerKey,
  pageByRows,
  pageLocally,
  type Credentials,
  type CredentialField,
  type QueryParams,
} from '@opensteward/shared'
import type { CustomerSupportAdapter } from '../../adapter/interface'
import type { Ticket } from '../../schema/ticket'
import type { Message } from '../../schema/message'
import type { Contact } from '../../schema/contact'
import type { User } from '../../schema/user'
import type { Tag } from '../../schema/tag'
import type { Team } from '../../schema/team'
import type { Macro } from '../../schema/macro'

import { credentialFields as adapterCredentialFields, exchangeCredentials as adapterExchangeCredentials, getAuthUrlUnsupported } from './auth'
import { LiveagentClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'

import { transformTicket, type RawLiveagentTicket } from './transform/ticket'
import { transformMessageGroup, type RawLiveagentMessageGroup } from './transform/message'
import { transformContact, type RawLiveagentContact } from './transform/contact'
import { transformUser, type RawLiveagentAgent } from './transform/user'
import { transformTag, type RawLiveagentTag } from './transform/tag'
import { transformTeam, type RawLiveagentDepartment } from './transform/team'
import { transformMacro, type RawLiveagentCannedMessage } from './transform/macro'

export class LiveagentAdapter implements CustomerSupportAdapter {
  readonly platform = 'liveagent'
  readonly version = '0.1.0'

  // No OAuth config needed — credentials are api key + subdomain via credentialFields.
  constructor() {}

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
    throw new Error('liveagent uses static API key auth; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  private client(credentials: Credentials): LiveagentClient {
    return new LiveagentClient(credentials)
  }

  /**
   * The caller's page of a documented `_page` + `_perPage` list, as raw rows
   * flattened by `rowsOf`.
   *
   * LiveAgent returns a bare array and documents neither a total nor a
   * maximum `_perPage`, so the chain continues while a page has rows and
   * ends on an empty one. A short page is not taken as the end: a server that
   * caps `_perPage` below what was sent would otherwise truncate the list.
   * pageByRows counts the rows each upstream page actually held.
   *
   * A legacy `params.cursor` is a raw page number: one request at that page.
   */
  private async pageList<Raw, Row>(
    credentials: Credentials,
    path: string,
    params: QueryParams,
    rowsOf: (raw: Raw[]) => Row[],
  ): Promise<Row[]> {
    const client = this.client(credentials)
    const perPage = Math.max(1, Math.floor(params.limit ?? DEFAULT_PAGE_SIZE))
    if (params['cursor']) {
      const res = await client.get<Raw[]>(path, { _page: Number(params['cursor']), _perPage: perPage })
      return rowsOf(Array.isArray(res) ? res : [])
    }
    const subdomain = String(credentials.extra?.['subdomain'] ?? '').trim()
    const key = cursorPagerKey(connectionScope(subdomain, credentials), path, { _perPage: perPage })
    const { items } = await pageByRows<Row, number>(
      key,
      params,
      async (cursor) => {
        const page = cursor ?? 1
        const res = await client.get<Raw[]>(path, { _page: page, _perPage: perPage })
        const raw = Array.isArray(res) ? res : []
        return { items: rowsOf(raw), next: raw.length > 0 ? page + 1 : undefined }
      },
      { defaultLimit: DEFAULT_PAGE_SIZE },
    )
    return items
  }

  // ── Tickets ──────────────────────────────────────────────────────────────

  async listTickets(credentials: Credentials, params: QueryParams): Promise<Ticket[]> {
    return this.pageList<RawLiveagentTicket, Ticket>(credentials, '/tickets', params, (raw) => raw.map(transformTicket))
  }

  async getTicket(credentials: Credentials, id: string): Promise<Ticket> {
    const res = await this.client(credentials).get<RawLiveagentTicket>(`/tickets/${id}`)
    return transformTicket(res)
  }

  // ── Messages (scoped to a ticket) ────────────────────────────────────────

  /**
   * LiveAgent v3 returns message groups (GET /tickets/{id}/messages).
   * Each group contains one or more individual Message objects.
   * We flatten them into a single canonical Message list.
   */
  async listMessages(
    credentials: Credentials,
    ticketId: string,
    params: QueryParams,
  ): Promise<Message[]> {
    // `_perPage` counts groups, not messages, so rows are cut by pageByRows.
    return this.pageList<RawLiveagentMessageGroup, Message>(
      credentials,
      `/tickets/${ticketId}/messages`,
      params,
      (groups) => groups.flatMap((g) => transformMessageGroup(g, ticketId)),
    )
  }

  // getMessage is not implemented: LiveAgent messages are ticket-scoped.

  // ── Contacts ─────────────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    return this.pageList<RawLiveagentContact, Contact>(credentials, '/contacts', params, (raw) => raw.map(transformContact))
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const res = await this.client(credentials).get<RawLiveagentContact>(`/contacts/${id}`)
    return transformContact(res)
  }

  // ── Users (agents) ───────────────────────────────────────────────────────

  async listUsers(credentials: Credentials, params: QueryParams): Promise<User[]> {
    return this.pageList<RawLiveagentAgent, User>(credentials, '/agents', params, (raw) => raw.map(transformUser))
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    const res = await this.client(credentials).get<RawLiveagentAgent>(`/agents/${id}`)
    return transformUser(res)
  }

  // ── Tags ─────────────────────────────────────────────────────────────────

  async listTags(credentials: Credentials, params: QueryParams): Promise<Tag[]> {
    // GET /tags documents no parameters and returns every tag.
    const res = await this.client(credentials).get<RawLiveagentTag[]>('/tags')
    return pageLocally((Array.isArray(res) ? res : []).map(transformTag), params)
  }

  async getTag(credentials: Credentials, id: string): Promise<Tag> {
    const res = await this.client(credentials).get<RawLiveagentTag>(`/tags/${id}`)
    return transformTag(res)
  }

  // ── Teams (departments) ──────────────────────────────────────────────────

  async listTeams(credentials: Credentials, params: QueryParams): Promise<Team[]> {
    return this.pageList<RawLiveagentDepartment, Team>(credentials, '/departments', params, (raw) => raw.map(transformTeam))
  }

  async getTeam(credentials: Credentials, id: string): Promise<Team> {
    const res = await this.client(credentials).get<RawLiveagentDepartment>(`/departments/${id}`)
    return transformTeam(res)
  }

  // ── Macros (canned messages) ─────────────────────────────────────────────

  async listMacros(credentials: Credentials, params: QueryParams): Promise<Macro[]> {
    return this.pageList<RawLiveagentCannedMessage, Macro>(credentials, '/canned_messages', params, (raw) => raw.map(transformMacro))
  }

  async getMacro(credentials: Credentials, id: string): Promise<Macro> {
    const res = await this.client(credentials).get<RawLiveagentCannedMessage>(`/canned_messages/${id}`)
    return transformMacro(res)
  }
}
