/**
 * Richpanel adapter — customer-support vertical.
 *
 * Auth: API key via `x-richpanel-key` header (static, no OAuth flow).
 * Base URL: https://api.richpanel.com
 * Pagination: GET /v1/users, /v1/tags, /v1/teams and GET /v1/tickets/{id} (comments)
 * document no paging parameters, so those lists fetch the whole collection and page
 * it locally.
 * Refused (501 NOT_SUPPORTED): listTickets and listContacts. The API documents no way
 * to list conversations or customers, only lookups by id, number, email or phone.
 * Rate limit: 100 req/min; 492 status (custom) or 429 when exceeded.
 *
 * Supported resources: tickets, messages (ticket comments), contacts (customers),
 * users (agents), teams.
 *
 * Not supported by Richpanel: macros/canned-responses, webhook signature verification
 * (no documented signing secret mechanism).
 *
 * Schema-firewall: no attachment content, no voice-recording bytes.
 */
import {
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
import { RichpanelClient } from './client'

import { transformTicket, type RawRichpanelTicket } from './transform/ticket'
import { transformMessage } from './transform/message'
import { transformContact, type RawRichpanelCustomer } from './transform/contact'
import { transformUser, type RawRichpanelAgent } from './transform/user'
import { transformTag, type RawRichpanelTag } from './transform/tag'
import { transformTeam, type RawRichpanelTeam } from './transform/team'

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface RichpanelAdapterConfig {}

interface UsersResponse {
  users?: RawRichpanelAgent[]
}
/**
 * GET /v1/tags and GET /v1/teams. The reference specs
 * (https://developer.richpanel.com/reference/list-tags, .../list-teams) document
 * `{ "tag": [...] }` and `{ "team": [...] }`; the object pages
 * (.../the-tag-object, .../the-team-object) show the same endpoints' "Response
 * Example" as a bare array. Both documented shapes are accepted.
 */
type TagsResponse = RawRichpanelTag[] | { tag?: RawRichpanelTag[] }
type TeamsResponse = RawRichpanelTeam[] | { team?: RawRichpanelTeam[] }
interface TicketResponse {
  ticket?: RawRichpanelTicket
}
/** Customer lookup by email returns customer inside a ticket-like wrapper or direct object. */
interface CustomerByEmailResponse {
  customer?: RawRichpanelCustomer
  [key: string]: unknown
}
interface UserResponse {
  user?: RawRichpanelAgent
}

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

/**
 * Reads a documented list envelope: a bare array, or an object whose `key` is an
 * array. Anything else (including an object without `key`, such as the documented
 * 400 body `{}`) throws, so an unreadable body never reaches the sync as an empty
 * (complete) collection.
 */
function documentedRows<T>(
  res: T[] | Partial<Record<string, T[]>> | null | undefined,
  key: string,
  path: string,
): T[] {
  if (Array.isArray(res)) return res
  if (res !== null && typeof res === 'object') {
    const rows = res[key]
    if (Array.isArray(rows)) return rows
  }
  throw new Error(`Richpanel ${path} returned an unexpected response: "${key}" is not an array`)
}

export class RichpanelAdapter implements CustomerSupportAdapter {
  readonly platform = 'richpanel'
  readonly version = '0.1.0'

  constructor(_config: RichpanelAdapterConfig) {}

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
    throw new Error('richpanel uses static API key auth; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  private client(credentials: Credentials): RichpanelClient {
    return new RichpanelClient(credentials)
  }

  // ── Tickets ──────────────────────────────────────────────────────────────

  // https://developer.richpanel.com/reference/the-conversation-object documents
  // retrieval by id, by conversation number and by customer email/phone only;
  // /v1/tickets is documented solely as "Create conversation | `POST /v1/tickets`".
  async listTickets(_credentials: Credentials, _params: QueryParams): Promise<Ticket[]> {
    throw notSupported(
      'Richpanel cannot list tickets: the API documents only "GET /v1/tickets/{id}", ' +
        '"GET /v1/tickets/number/{conversationNo}" and "GET /v1/tickets/customer" lookups, no conversation list',
    )
  }

  async getTicket(credentials: Credentials, id: string): Promise<Ticket> {
    const res = await this.client(credentials).get<TicketResponse>(`/v1/tickets/${id}`)
    if (!res.ticket) throw new Error(`Richpanel ticket ${id} not found`)
    return transformTicket(res.ticket)
  }

  // ── Messages (scoped to a ticket) ────────────────────────────────────────
  // Richpanel does not expose a /v1/tickets/{id}/comments endpoint.
  // Comments are embedded in the ticket object; fetch the ticket and slice the array.

  async listMessages(
    credentials: Credentials,
    ticketId: string,
    params: QueryParams,
  ): Promise<Message[]> {
    const res = await this.client(credentials).get<TicketResponse>(`/v1/tickets/${ticketId}`, {
      include_private_notes: true,
    })
    // One GET returns every comment inline: page them locally.
    return pageLocally(
      (res.ticket?.comments ?? []).map((c) => transformMessage(c, ticketId)),
      params,
    )
  }

  async getMessage(_credentials: Credentials, id: string): Promise<Message> {
    throw new Error(`Richpanel comments are ticket-scoped; call listMessages(ticketId). id=${id}`)
  }

  // ── Contacts (customers) ─────────────────────────────────────────────────
  // https://developer.richpanel.com/reference/the-customer-object documents only an
  // upsert and "Fetch customer details using their email or phone number"
  // (GET /v1/customers/{type}/{id}). getContact takes the email address as the id.

  async listContacts(_credentials: Credentials, _params: QueryParams): Promise<Contact[]> {
    throw notSupported(
      'Richpanel cannot list contacts: customers can only be fetched "using their email or phone number" ' +
        '(GET /v1/customers/{type}/{id}); no customer list is documented',
    )
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    // id is expected to be the customer's email address.
    const res = await this.client(credentials).get<CustomerByEmailResponse>(
      `/v1/customers/email/${encodeURIComponent(id)}`,
    )
    if (!res.customer) throw new Error(`Richpanel customer ${id} not found`)
    return transformContact(res.customer)
  }

  // ── Users (agents) ───────────────────────────────────────────────────────
  // Richpanel exposes /v1/users for agent listing (not /v1/agents).

  async listUsers(credentials: Credentials, params: QueryParams): Promise<User[]> {
    // GET /v1/users documents no paging parameters and returns every agent: page locally.
    const res = await this.client(credentials).get<UsersResponse>('/v1/users')
    return pageLocally((res.users ?? []).map(transformUser), params)
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    const res = await this.client(credentials).get<UserResponse>(`/v1/users/${id}`)
    if (!res.user) throw new Error(`Richpanel user ${id} not found`)
    return transformUser(res.user)
  }

  // ── Tags ─────────────────────────────────────────────────────────────────

  private async allTags(credentials: Credentials): Promise<RawRichpanelTag[]> {
    const res = await this.client(credentials).get<TagsResponse>('/v1/tags')
    return documentedRows<RawRichpanelTag>(res, 'tag', '/v1/tags')
  }

  async listTags(credentials: Credentials, params: QueryParams): Promise<Tag[]> {
    // GET /v1/tags documents no parameters and returns every tag: page locally.
    return pageLocally((await this.allTags(credentials)).map(transformTag), params)
  }

  // No GET-by-id is documented for tags (the tag object page lists only
  // "List all tags | `GET /v1/tags`"), so read the tag back from that list.
  async getTag(credentials: Credentials, id: string): Promise<Tag> {
    const raw = (await this.allTags(credentials)).find((t) => t.id === id)
    if (!raw) throw Object.assign(new Error(`Richpanel tag ${id} not found`), { statusCode: 404 })
    return transformTag(raw)
  }

  // ── Teams ────────────────────────────────────────────────────────────────

  private async allTeams(credentials: Credentials): Promise<RawRichpanelTeam[]> {
    const res = await this.client(credentials).get<TeamsResponse>('/v1/teams')
    return documentedRows<RawRichpanelTeam>(res, 'team', '/v1/teams')
  }

  async listTeams(credentials: Credentials, params: QueryParams): Promise<Team[]> {
    // GET /v1/teams documents no parameters and returns every team: page locally.
    return pageLocally((await this.allTeams(credentials)).map(transformTeam), params)
  }

  // No GET-by-id is documented for teams (the team object page lists only
  // "List all teams | `GET /v1/teams`"), so read the team back from that list.
  async getTeam(credentials: Credentials, id: string): Promise<Team> {
    const raw = (await this.allTeams(credentials)).find((t) => t.id === id)
    if (!raw) throw Object.assign(new Error(`Richpanel team ${id} not found`), { statusCode: 404 })
    return transformTeam(raw)
  }
}
