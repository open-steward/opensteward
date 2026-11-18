/**
 * TeamSupport adapter for the customer-support vertical.
 *
 * Authentication: HTTP Basic Auth — OrganizationID (username) + APIToken (password).
 * Base URL: https://app.teamsupport.com
 * Endpoints: /api/json/{resource}.json
 *
 * Supported resources: tickets, messages (ticket actions), contacts, users (agents), teams (groups).
 *
 * Pagination (https://support.teamsupport.com/knowledgeBase/20136045): pageNumber
 * (1-based) + pageSize work on the Tickets and Contacts tables, and the response
 * carries TotalRecords. Users, Groups and ticket Actions are absent from that
 * article's list ("Pagination works with the following tables/urls: API Tickets
 * Table Contacts Table Customer Table ..."), so they are fetched whole and paged
 * locally. Endpoint list: https://support.teamsupport.com/knowledgeBase/20136023.
 * No webhook signature scheme is publicly documented; webhook methods are omitted.
 */
// ── Resource coverage ──────────────────────────────────────────────────────
// Unverified: tag    — TeamSupport has a Ticket Tags UI feature but all REST API
//                      documentation requires authentication; no public source
//                      confirms a /api/json/tags endpoint exists.
// Unverified: macro  — TeamSupport has a Suggested Solutions (canned responses)
//                      UI feature but all REST API documentation requires
//                      authentication; no public source confirms a macros endpoint.
import { pageLocally, reportUpstreamPage, type Credentials, type CredentialField, type QueryParams } from '@opensteward/shared'
import type { CustomerSupportAdapter } from '../../adapter/interface'
import type { Ticket } from '../../schema/ticket'
import type { Message } from '../../schema/message'
import type { Contact } from '../../schema/contact'
import type { User } from '../../schema/user'
import type { Team } from '../../schema/team'

import { credentialFields as adapterCredentialFields, exchangeCredentials as adapterExchangeCredentials, getAuthUrlUnsupported } from './auth'
import { TeamsupportClient } from './client'
import { PATHS, DEFAULT_PAGE_SIZE } from './constants'

import { transformTicket, type RawTeamsupportTicket } from './transform/ticket'
import { transformMessage, type RawTeamsupportAction } from './transform/message'
import { transformContact, type RawTeamsupportContact } from './transform/contact'
import { transformUser, type RawTeamsupportUser } from './transform/user'
import { transformTeam, type RawTeamsupportGroup } from './transform/team'

// TeamSupport uses static API key auth; no OAuth config needed
export type TeamsupportAdapterConfig = Record<string, never>

// TeamSupport wraps list responses in a keyed object, e.g. { Tickets: [...] }.
// Paginated tables also carry TotalRecords.
interface PagedResponse { TotalRecords?: number | string }
interface TicketsResponse extends PagedResponse { Tickets?: RawTeamsupportTicket[] }
interface TicketResponse { Ticket?: RawTeamsupportTicket }
interface ActionsResponse { Actions?: RawTeamsupportAction[] }
interface ContactsResponse extends PagedResponse { Contacts?: RawTeamsupportContact[] }
interface ContactResponse { Contact?: RawTeamsupportContact }
interface UsersResponse { Users?: RawTeamsupportUser[] }
interface UserResponse { User?: RawTeamsupportUser }
interface GroupsResponse { Groups?: RawTeamsupportGroup[] }
interface GroupResponse { Group?: RawTeamsupportGroup }

export class TeamsupportAdapter implements CustomerSupportAdapter {
  readonly platform = 'teamsupport'
  readonly version = '0.1.0'

  constructor(_config: TeamsupportAdapterConfig) {}

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
    throw new Error('teamsupport uses static API key auth; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // Static API key — no refresh needed
    return credentials
  }

  private client(credentials: Credentials): TeamsupportClient {
    return new TeamsupportClient(credentials)
  }

  /**
   * Query for a paginated table (Tickets, Contacts): `pageNumber` is 1-based and
   * `pageSize` is the caller's limit.
   */
  private listParams(params: QueryParams): { pageNumber: number; pageSize: number } {
    const pageSize = params.limit ?? DEFAULT_PAGE_SIZE
    const pageNumber = params.page ?? 1
    return { pageNumber, pageSize }
  }

  /** Report the end of a paginated table from its TotalRecords, when present. */
  private reportPage(params: QueryParams, sent: { pageNumber: number; pageSize: number }, res: PagedResponse): void {
    const raw = res.TotalRecords
    if (raw === undefined || raw === null || String(raw).trim() === '') return
    const total = Number(raw)
    if (!Number.isInteger(total) || total < 0) return
    reportUpstreamPage(params, { totalCount: total, hasMore: sent.pageNumber * sent.pageSize < total })
  }

  // ── Tickets ────────────────────────────────────────────────────────────────

  async listTickets(credentials: Credentials, params: QueryParams): Promise<Ticket[]> {
    const sent = this.listParams(params)
    const res = await this.client(credentials).get<TicketsResponse>(PATHS.tickets, sent)
    this.reportPage(params, sent, res)
    return (res.Tickets ?? []).map(transformTicket)
  }

  async getTicket(credentials: Credentials, id: string): Promise<Ticket> {
    const res = await this.client(credentials).get<TicketResponse>(PATHS.ticket(id))
    if (!res.Ticket) throw new Error(`TeamSupport ticket ${id} not found`)
    return transformTicket(res.Ticket)
  }

  // ── Messages (ticket actions) ──────────────────────────────────────────────

  async listMessages(credentials: Credentials, ticketId: string, params: QueryParams): Promise<Message[]> {
    // Actions is not in KB 20136045's list of paginated tables: fetched whole.
    const res = await this.client(credentials).get<ActionsResponse>(PATHS.ticketActions(ticketId))
    return pageLocally((res.Actions ?? []).map((a) => transformMessage(a, ticketId)), params)
  }

  async getMessage(_credentials: Credentials, id: string): Promise<Message> {
    throw new Error(`TeamSupport actions are ticket-scoped; call listMessages(ticketId). id=${id}`)
  }

  // ── Contacts ──────────────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const sent = this.listParams(params)
    const res = await this.client(credentials).get<ContactsResponse>(PATHS.contacts, sent)
    this.reportPage(params, sent, res)
    return (res.Contacts ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const res = await this.client(credentials).get<ContactResponse>(PATHS.contact(id))
    if (!res.Contact) throw new Error(`TeamSupport contact ${id} not found`)
    return transformContact(res.Contact)
  }

  // ── Users (agents) ────────────────────────────────────────────────────────

  async listUsers(credentials: Credentials, params: QueryParams): Promise<User[]> {
    // Users is not in KB 20136045's list of paginated tables.
    const res = await this.client(credentials).get<UsersResponse>(PATHS.users)
    return pageLocally((res.Users ?? []).map(transformUser), params)
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    const res = await this.client(credentials).get<UserResponse>(PATHS.user(id))
    if (!res.User) throw new Error(`TeamSupport user ${id} not found`)
    return transformUser(res.User)
  }

  // ── Teams (groups) ────────────────────────────────────────────────────────

  async listTeams(credentials: Credentials, params: QueryParams): Promise<Team[]> {
    // Groups is not in KB 20136045's list of paginated tables.
    const res = await this.client(credentials).get<GroupsResponse>(PATHS.groups)
    return pageLocally((res.Groups ?? []).map(transformTeam), params)
  }

  async getTeam(credentials: Credentials, id: string): Promise<Team> {
    const res = await this.client(credentials).get<GroupResponse>(PATHS.group(id))
    if (!res.Group) throw new Error(`TeamSupport group ${id} not found`)
    return transformTeam(res.Group)
  }

}
