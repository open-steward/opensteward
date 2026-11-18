/**
 * Desk365 customer-support adapter.
 *
 * Per-tenant subdomain: https://<subdomain>.desk365.io/apis/v3/
 * Auth: API key passed as the raw Authorization header value.
 * Docs: https://help.desk365.io/en/articles/desk365-api/
 *
 * Supported resources:
 *   - Tickets (list, get)
 *   - Messages / Conversations (list; ticket-scoped)
 *   - Contacts (list, get)
 *
 * Refused with 501 (no path in the v3 spec,
 * https://apps.desk365.io/apis/v3/api-docs?group=v3):
 *   - Users / Agents, Teams / Groups
 *
 * Not supported by Desk365 public API v3 (auto-501 via omission):
 *   - Tags      (no documented endpoint)
 *   - Macros    (canned-responses not exposed via API v3)
 *   - Webhooks  (webhook signature verification not documented)
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
import type { Team } from '../../schema/team'
import type { MessageType } from '../../schema/shared'

import {
  credentialFields as adapterCredentialFields,
  exchangeCredentials as adapterExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import { Desk365Client } from './client'
import { CONTACTS_PAGE_SIZE, DEFAULT_PAGE_SIZE, TICKETS_PAGE_SIZE } from './constants'

import { transformTicket, type RawDesk365Ticket } from './transform/ticket'
import { transformMessage, type RawDesk365Conversation } from './transform/message'
import { transformContact, type RawDesk365Contact } from './transform/contact'

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface Desk365AdapterConfig {
  // No OAuth config needed — API key only
}

// ── Response envelope shapes ──────────────────────────────────────────────────

interface TicketsResponse {
  tickets?: RawDesk365Ticket[]
  count?: number
}

/** ContactList: `count` "Total number of contacts", `content` "List of contacts". */
interface ContactsResponse {
  content?: RawDesk365Contact[]
  count?: number
}

interface ConversationsResponse {
  conversations?: RawDesk365Conversation[]
  count?: number
}

/** The v3 spec documents no path for these; refuse before sending anything. */
function notSupported(resource: string): Error {
  return Object.assign(
    new Error(
      `Desk365 cannot list or read ${resource}: the Desk365 v3 API (https://apps.desk365.io/apis/v3/api-docs?group=v3) has no ${resource} endpoint`,
    ),
    { statusCode: 501, code: 'NOT_SUPPORTED' },
  )
}

/**
 * GET /v3/tickets/conversations flags that leave only private notes
 * ("1 - include ..., 0 - do not include ..."; private notes default to 1).
 */
const PRIVATE_NOTES_ONLY = {
  include_contact_replies: '0',
  include_agent_replies: '0',
  include_public_notes: '0',
  include_forward_messages: '0',
} as const

// ── Adapter ───────────────────────────────────────────────────────────────────

export class DeskcomDesk365Adapter implements CustomerSupportAdapter {
  readonly platform = 'deskcom-desk365'
  readonly version = '0.1.0'

  constructor(_config?: Desk365AdapterConfig) {}

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
    throw new Error('deskcom-desk365 uses static API key auth; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // API keys do not expire
    return credentials
  }

  private client(credentials: Credentials): Desk365Client {
    return new Desk365Client(credentials)
  }

  /** The tenant a connection belongs to, for paging keys. */
  private accountScope(credentials: Credentials): string {
    const subdomain = String(credentials.extra?.['tenantSubdomain'] ?? '')
      .trim()
      .toLowerCase()
    return `deskcom-desk365:${subdomain}`
  }

  /**
   * Build pagination + ordering params for list endpoints.
   * Desk365 uses: ticket_count (30|50|100), offset (integer), order_by, order_type.
   */
  private listParams(params: QueryParams): Record<string, unknown> {
    const limit = params.limit ?? DEFAULT_PAGE_SIZE
    // Clamp to valid Desk365 values: 30, 50, or 100
    const ticketCount = limit >= 100 ? 100 : limit >= 50 ? 50 : 30
    return {
      ticket_count: ticketCount,
      ...(params['cursor'] ? { offset: Number(params['cursor']) } : {}),
    }
  }

  // ── Tickets ────────────────────────────────────────────────────────────────

  async listTickets(credentials: Credentials, params: QueryParams): Promise<Ticket[]> {
    const client = this.client(credentials)
    if (params['cursor']) {
      const res = await client.get<TicketsResponse>('/tickets', this.listParams(params))
      return (res.tickets ?? []).map(transformTicket)
    }
    // GET /v3/tickets pages by `ticket_count` (30 | 50 | 100) and a row
    // `offset`, so the caller's page is cut from upstream pages of 100.
    const key = cursorPagerKey(
      connectionScope(this.accountScope(credentials), credentials),
      'tickets',
      { ticket_count: TICKETS_PAGE_SIZE },
    )
    const { items } = await pageByRows<RawDesk365Ticket, number>(key, params, async (cursor) => {
      const offset = cursor ?? 0
      const res = await client.get<TicketsResponse>('/tickets', {
        ticket_count: TICKETS_PAGE_SIZE,
        offset,
      })
      const rows = res.tickets ?? []
      return {
        items: rows,
        next: rows.length >= TICKETS_PAGE_SIZE ? offset + rows.length : undefined,
      }
    })
    return items.map(transformTicket)
  }

  async getTicket(credentials: Credentials, id: string): Promise<Ticket> {
    const res = await this.client(credentials).get<RawDesk365Ticket>(`/tickets/${id}`)
    return transformTicket(res)
  }

  // ── Messages (ticket-scoped conversations) ─────────────────────────────────

  /**
   * GET /v3/tickets/conversations?ticket_number= ("Get all the ticket
   * conversations for a given ticket number"). It documents no paging
   * parameter, so it returns the whole thread and the caller's page is cut
   * locally. The rows carry no public/private flag, so a second request with
   * only `include_private_notes` left on names the private notes.
   */
  async listMessages(
    credentials: Credentials,
    ticketId: string,
    params: QueryParams,
  ): Promise<Message[]> {
    const client = this.client(credentials)
    const all = await client.get<ConversationsResponse>('/tickets/conversations', {
      ticket_number: ticketId,
    })
    const notes = await client.get<ConversationsResponse>('/tickets/conversations', {
      ticket_number: ticketId,
      ...PRIVATE_NOTES_ONLY,
    })
    const privateIds = new Set((notes.conversations ?? []).map((c) => String(c.id)))
    const rows = (all.conversations ?? []).map((c) => {
      const type: MessageType = privateIds.has(String(c.id)) ? 'internal' : 'public'
      return transformMessage(c, ticketId, type)
    })
    return pageLocally(rows, params)
  }

  async getMessage(_credentials: Credentials, id: string): Promise<Message> {
    throw new Error(
      `Desk365 conversations are ticket-scoped; call listMessages(ticketId). id=${id}`,
    )
  }

  // ── Contacts ───────────────────────────────────────────────────────────────

  /**
   * GET /v3/contacts pages in fixed runs of 30 from a row `offset` ("Get next
   * 30 contacts from offset value."), so the caller's page is cut from those.
   */
  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = this.client(credentials)
    const key = cursorPagerKey(
      connectionScope(this.accountScope(credentials), credentials),
      'contacts',
      { page_size: CONTACTS_PAGE_SIZE },
    )
    const { items } = await pageByRows<RawDesk365Contact, number>(key, params, async (cursor) => {
      const offset = cursor ?? 0
      const res = await client.get<ContactsResponse>('/contacts', { offset })
      const rows = res.content ?? []
      return {
        items: rows,
        next: rows.length >= CONTACTS_PAGE_SIZE ? offset + rows.length : undefined,
      }
    })
    return items.map(transformContact)
  }

  /** GET /v3/contacts/details by `primary_email`, the id listContacts returns. */
  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const res = await this.client(credentials).get<RawDesk365Contact>('/contacts/details', {
      primary_email: id,
    })
    return transformContact(res)
  }

  // ── Users (agents) and Teams (groups): no v3 endpoint ──────────────────────

  async listUsers(_credentials: Credentials, _params: QueryParams): Promise<User[]> {
    throw notSupported('agents')
  }

  async getUser(_credentials: Credentials, _id: string): Promise<User> {
    throw notSupported('agents')
  }

  async listTeams(_credentials: Credentials, _params: QueryParams): Promise<Team[]> {
    throw notSupported('groups')
  }

  async getTeam(_credentials: Credentials, _id: string): Promise<Team> {
    throw notSupported('groups')
  }

  // Tags, Macros: not supported — auto-501 via omission from interface
}
