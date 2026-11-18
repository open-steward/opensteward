/**
 * Take Blip customer-support adapter.
 *
 * Take Blip uses a command-based REST API: all operations are submitted as
 * LIME protocol commands via POST /commands to a per-tenant endpoint:
 *   https://{contractId}.http.msging.net/commands
 *
 * Auth: Authorization: Key {apiKey}  (static key from Blip Portal)
 *
 * Supported resources: tickets, contacts, users (attendants), teams, tags.
 * listMessages refuses: GET /tickets/{ticketId}/messages documents no position
 * parameter (see the method).
 *
 * Docs: https://docs.blip.ai/
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unverified: macro — GET /custom-replies endpoint confirmed in Blip Desk docs but
 *             response object field names for individual replies are not accessible
 *             in public documentation (help.blip.ai returns 403; docs are JS-rendered).
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

import {
  credentialFields as adapterCredentialFields,
  exchangeCredentials as adapterExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import { TakeBlipClient, type CollectionResource } from './client'
import { ATTENDANTS_TAKE, CONTACTS_TAKE, DEFAULT_PAGE_SIZE, TICKETS_MAX_TAKE } from './constants'

import { transformTicket, type RawTakeBlipTicket } from './transform/ticket'
import { transformContact, type RawTakeBlipContact } from './transform/contact'
import { transformUser, type RawTakeBlipAgent } from './transform/user'
import { transformTeam, type RawTakeBlipTeam } from './transform/team'
import { transformTag, type RawTakeBlipTag } from './transform/tag'

export class TakeBlipAdapter implements CustomerSupportAdapter {
  readonly platform = 'take-blip'
  readonly version = '0.1.0'

  // No OAuth config needed — static API key
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
    throw new Error('take-blip uses static API key auth; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private client(credentials: Credentials): TakeBlipClient {
    return new TakeBlipClient(credentials)
  }

  /** Pager scope: one Blip contract, one connection. */
  private scope(credentials: Credentials): string {
    return connectionScope(
      `take-blip:${String(credentials.extra?.['contractId'] ?? '')}`,
      credentials,
    )
  }

  // ── Tickets ───────────────────────────────────────────────────────────────

  async listTickets(credentials: Credentials, params: QueryParams): Promise<Ticket[]> {
    const client = this.client(credentials)
    const fetchPage = async (skip: number, take: number): Promise<RawTakeBlipTicket[]> => {
      const res = await client.desk<CollectionResource<RawTakeBlipTicket>>(
        `/tickets?$skip=${skip}&$take=${take}`,
      )
      return (res.resource as CollectionResource<RawTakeBlipTicket> | undefined)?.items ?? []
    }
    // An explicit row offset from the caller is a position, not a page.
    if (params['cursor'] != null) {
      const skip = Number(params['cursor'])
      const take = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, TICKETS_MAX_TAKE)
      return (await fetchPage(skip, take)).map(transformTicket)
    }
    // GET /tickets pages by $skip/$take with $take at most 100 (docs.blip.ai,
    // "Get all tickets of a bot"), so the caller's page is cut from upstream
    // pages of 100. A short upstream page is the last one.
    const key = cursorPagerKey(this.scope(credentials), 'tickets', { take: TICKETS_MAX_TAKE })
    const { items } = await pageByRows<RawTakeBlipTicket, number>(
      key,
      params,
      async (cursor) => {
        const skip = cursor ?? 0
        const rows = await fetchPage(skip, TICKETS_MAX_TAKE)
        return {
          items: rows,
          next: rows.length < TICKETS_MAX_TAKE ? undefined : skip + rows.length,
        }
      },
      { defaultLimit: DEFAULT_PAGE_SIZE },
    )
    return items.map(transformTicket)
  }

  async getTicket(credentials: Credentials, id: string): Promise<Ticket> {
    const res = await this.client(credentials).desk<RawTakeBlipTicket>(`/tickets/${id}`)
    const raw = res.resource as RawTakeBlipTicket | undefined
    if (!raw) throw new Error(`TakeBlip ticket ${id} not found`)
    return transformTicket(raw)
  }

  // ── Messages ──────────────────────────────────────────────────────────────

  async listMessages(
    _credentials: Credentials,
    _ticketId: string,
    _params: QueryParams,
  ): Promise<Message[]> {
    // docs.blip.ai, "Get all messages from a customer by a ticket" documents
    // only $take ("Limit of total of items to be returned."), $ascending and
    // getFromOwnerIfTunnel: no $skip and no other position, so rows past the
    // first $take cannot be reached. It also returns "all messages received
    // and sent from the customer", not the ticket's messages.
    throw Object.assign(
      new Error(
        'Take Blip cannot list ticket messages: GET /tickets/{ticketId}/messages documents only "$take", "$ascending" and "getFromOwnerIfTunnel", with no $skip or other position to reach older rows',
      ),
      { statusCode: 501, code: 'NOT_SUPPORTED' },
    )
  }

  async getMessage(_credentials: Credentials, id: string): Promise<Message> {
    throw new Error(`TakeBlip messages are ticket-scoped; call listMessages(ticketId). id=${id}`)
  }

  // ── Contacts ──────────────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    // GET /contacts to postmaster@crm.msging.net pages by $skip/$take
    // (docs.blip.ai, "Get contacts"). The caller's page is cut from upstream
    // pages of CONTACTS_TAKE rows; a short upstream page is the last one.
    const client = this.client(credentials)
    const key = cursorPagerKey(this.scope(credentials), 'contacts', { take: CONTACTS_TAKE })
    const { items } = await pageByRows<RawTakeBlipContact, number>(
      key,
      params,
      async (cursor) => {
        const skip = cursor ?? 0
        const res = await client.crm<CollectionResource<RawTakeBlipContact>>(
          `/contacts?$skip=${skip}&$take=${CONTACTS_TAKE}`,
        )
        const rows =
          (res.resource as CollectionResource<RawTakeBlipContact> | undefined)?.items ?? []
        return { items: rows, next: rows.length < CONTACTS_TAKE ? undefined : skip + rows.length }
      },
      { defaultLimit: DEFAULT_PAGE_SIZE },
    )
    return items.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    // docs.blip.ai, "Get contact": uri "/contacts/11121023102013021@messenger.gw.msging.net",
    // the identity as is. Only its path-breaking characters are escaped.
    const res = await this.client(credentials).crm<RawTakeBlipContact>(
      `/contacts/${id.replace(/[/?#]/g, encodeURIComponent)}`,
    )
    const raw = res.resource as RawTakeBlipContact | undefined
    if (!raw) throw new Error(`TakeBlip contact ${id} not found`)
    return transformContact(raw)
  }

  // ── Users (agents) ────────────────────────────────────────────────────────

  async listUsers(credentials: Credentials, params: QueryParams): Promise<User[]> {
    // GET /attendants to postmaster@desk.msging.net pages by $skip/$take
    // (docs.blip.ai, "Get all bot's agents"). The caller's page is cut from
    // upstream pages of up to ATTENDANTS_TAKE rows. No $take maximum is
    // documented ("By default, Blip will return 20 agents."), so a short page
    // may be a server cap: only an empty upstream page ends the walk.
    const client = this.client(credentials)
    const key = cursorPagerKey(this.scope(credentials), 'attendants', { take: ATTENDANTS_TAKE })
    const { items } = await pageByRows<RawTakeBlipAgent, number>(
      key,
      params,
      async (cursor) => {
        const skip = cursor ?? 0
        const res = await client.desk<CollectionResource<RawTakeBlipAgent>>(
          `/attendants?$skip=${skip}&$take=${ATTENDANTS_TAKE}`,
        )
        const rows = (res.resource as CollectionResource<RawTakeBlipAgent> | undefined)?.items ?? []
        return { items: rows, next: rows.length === 0 ? undefined : skip + rows.length }
      },
      { defaultLimit: DEFAULT_PAGE_SIZE },
    )
    return items.map(transformUser)
  }

  async getUser(_credentials: Credentials, id: string): Promise<User> {
    // docs.blip.ai documents GET /attendants (the list) and only DELETE on
    // /attendants/{agentId}; no single-attendant GET.
    throw Object.assign(
      new Error(
        `Take Blip cannot get one attendant: only GET /attendants and DELETE /attendants/{agentId} are documented. id=${id}`,
      ),
      { statusCode: 501, code: 'NOT_SUPPORTED' },
    )
  }

  // ── Tags ──────────────────────────────────────────────────────────────────

  async listTags(credentials: Credentials, params: QueryParams): Promise<Tag[]> {
    // GET /tags/active (docs.blip.ai, "Get tags": "To get all the active tags
    // setted on Desk send a command with GET method to
    // postmaster@desk.msging.net and URI /tags/active") documents no paging
    // parameter, so the caller's page is cut locally.
    const res =
      await this.client(credentials).desk<CollectionResource<RawTakeBlipTag>>('/tags/active')
    const items = (res.resource as CollectionResource<RawTakeBlipTag> | undefined)?.items ?? []
    return pageLocally(items.map(transformTag), params)
  }

  async getTag(credentials: Credentials, id: string): Promise<Tag> {
    // No single-tag GET is documented, and a tag's name is its id: read the
    // whole active list (no limit, so pageLocally serves every row).
    const tags = await this.listTags(credentials, {})
    const found = tags.find((t) => t.id === id)
    if (!found) throw new Error(`TakeBlip tag ${id} not found`)
    return found
  }

  // ── Teams ─────────────────────────────────────────────────────────────────

  async listTeams(credentials: Credentials, params: QueryParams): Promise<Team[]> {
    // GET /teams documents no paging parameter and returns every team
    // (docs.blip.ai, "Get all teams"), so the caller's page is cut locally.
    const res = await this.client(credentials).desk<CollectionResource<RawTakeBlipTeam>>('/teams')
    const items = (res.resource as CollectionResource<RawTakeBlipTeam> | undefined)?.items ?? []
    return pageLocally(items.map(transformTeam), params)
  }

  async getTeam(credentials: Credentials, id: string): Promise<Team> {
    const encodedId = encodeURIComponent(id)
    const res = await this.client(credentials).desk<RawTakeBlipTeam>(`/teams/${encodedId}`)
    const raw = res.resource as RawTakeBlipTeam | undefined
    if (!raw) throw new Error(`TakeBlip team ${id} not found`)
    return transformTeam(raw)
  }
}
