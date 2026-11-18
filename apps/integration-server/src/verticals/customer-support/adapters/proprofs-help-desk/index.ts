/**
 * ProProfs Help Desk adapter.
 *
 * Auth: API-key model — account_email + token injected into every POST body.
 * No OAuth flow; no per-tenant subdomain.
 *
 * Supported resources:
 *   - Tickets  (listTickets, getTicket)
 *   - Messages (listMessages — messages are embedded in ticket responses)
 *   - Contacts (getContact — derived from ticket customer fields)
 *
 * Unsupported (no public API endpoints):
 *   - listContacts, listUsers, getUser, listTeams, getTeam,
 *     listTags, getTag, listMacros, getMacro
 *   These are intentionally absent; the framework returns 501 automatically.
 *
 * Webhook verification: ProProfs does not sign payloads; verifyWebhook always
 * returns true. See webhook.ts for details.
 *
 * Docs: https://help.proprofsdesk.com/api-integration
 */
import {
  connectionScope,
  cursorPagerKey,
  pageByRows,
  pageLocally,
  reportUpstreamPage,
  type Credentials,
  type CredentialField,
  type QueryParams,
} from '@opensteward/shared'
import type { CustomerSupportAdapter } from '../../adapter/interface'
import type { Ticket } from '../../schema/ticket'
import type { Message } from '../../schema/message'
import type { Contact } from '../../schema/contact'
import type { WebhookEvent } from '../../schema/webhook'

import { credentialFields as adapterCredentialFields, exchangeCredentials as adapterExchangeCredentials, getAuthUrlUnsupported } from './auth'
import { ProprofsHelpDeskClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'
import { verifyProprofsWebhook, parseProprofsWebhookEvents } from './webhook'

import { transformTicket, type RawProprofsTicket } from './transform/ticket'
import { transformMessage, type RawProprofsMessage } from './transform/message'
import { transformContact, type RawProprofsContact } from './transform/contact'

// ── Response envelope types ───────────────────────────────────────────────────

interface TicketPage {
  status?: string
  ticket_data?: {
    first_page_link?: string
    previous_page_link?: string
    next_page_link?: string
    last_page_link?: string
    total_tickets?: string | number
    page?: number
    total_tickets_on_page?: number
    ticket_per_page?: number
    tickets?: RawProprofsTicket[]
  }
}

/**
 * The page number `next_page_link` names (`.../list/ticket/?page=2`), or the
 * page after `current` when the link carries none.
 */
function nextPageNumber(link: string | undefined, current: number): number {
  const match = /[?&]page=(\d+)/.exec(link ?? '')
  const n = match ? Number(match[1]) : NaN
  return Number.isFinite(n) && n > current ? n : current + 1
}

// ─────────────────────────────────────────────────────────────────────────────

export class ProprofsHelpDeskAdapter implements CustomerSupportAdapter {
  readonly platform = 'proprofs-help-desk'
  readonly version  = '0.1.0'

  // No config required for API-key adapters.
   
  constructor() {}

  // ── Auth ───────────────────────────────────────────────────────────────────

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
    throw new Error('proprofs-help-desk uses static API key auth; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  // ── Webhooks ───────────────────────────────────────────────────────────────

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyProprofsWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseProprofsWebhookEvents(payload)
  }

  // ── Internals ─────────────────────────────────────────────────────────────

  private client(credentials: Credentials): ProprofsHelpDeskClient {
    return new ProprofsHelpDeskClient(credentials)
  }

  // ── Tickets ────────────────────────────────────────────────────────────────

  /**
   * POST /list/ticket/ returns "up to 25 ticket details at a time" and names
   * the next page as `next_page_link` (`.../list/ticket/?page=2`), empty on
   * the last page. The request has no page-size parameter, so one upstream
   * page is not one caller page: pageByRows cuts the caller's rows out of the
   * fixed pages of 25 and reports hasMore exactly.
   * https://help.proprofsdesk.com/api-retrieve-ticket-list
   */
  async listTickets(credentials: Credentials, params: QueryParams): Promise<Ticket[]> {
    const client = this.client(credentials)
    const fetchPage = async (page: number) => {
      const res = await client.post<TicketPage>('/list/ticket/', {}, { page })
      const rows = (res.ticket_data?.tickets ?? []).map(transformTicket)
      const hasNext = Boolean(res.ticket_data?.next_page_link) && rows.length > 0
      return { rows, next: hasNext ? nextPageNumber(res.ticket_data?.next_page_link, page) : undefined }
    }

    // A caller already holding an upstream page number gets exactly that page.
    if (params['cursor']) {
      const { rows, next } = await fetchPage(Number(params['cursor']))
      reportUpstreamPage(params, { hasMore: next !== undefined, pageSize: DEFAULT_PAGE_SIZE })
      return rows
    }

    const account = String(credentials.extra?.['accountEmail'] ?? '')
    const key = cursorPagerKey(connectionScope(account, credentials), 'tickets', {
      upstreamPageSize: DEFAULT_PAGE_SIZE,
    })
    const { items } = await pageByRows<Ticket, number>(key, params, async (cursor) => {
      const { rows, next } = await fetchPage(cursor ?? 1)
      return { items: rows, next }
    })
    return items
  }

  async getTicket(credentials: Credentials, id: string): Promise<Ticket> {
    // The ProProfs API has no single-ticket fetch endpoint; we fetch by ID range.
    const ticketIdNum = Number(id)
    const res = await this.client(credentials).post<TicketPage>('/list/ticket/', {
      start_ticket_id: ticketIdNum,
      end_ticket_id:   ticketIdNum,
      ticket_per_page: 1,
      page: 1,
    })
    const raw = (res.ticket_data?.tickets ?? [])[0]
    if (!raw) throw new Error(`ProProfs Help Desk ticket ${id} not found`)
    return transformTicket(raw)
  }

  // ── Messages ───────────────────────────────────────────────────────────────

  async listMessages(credentials: Credentials, ticketId: string, params: QueryParams): Promise<Message[]> {
    // Messages are embedded, whole, in the ticket response; fetch the ticket
    // to get them, then serve the caller's page of them locally.
    const ticketIdNum = Number(ticketId)
    const res = await this.client(credentials).post<TicketPage>('/list/ticket/', {
      start_ticket_id: ticketIdNum,
      end_ticket_id:   ticketIdNum,
      ticket_per_page: 1,
      page: 1,
    })
    const rawTicket = (res.ticket_data?.tickets ?? [])[0]
    const rawMessages: RawProprofsMessage[] = Array.isArray(rawTicket?.messages)
      ? (rawTicket.messages as RawProprofsMessage[])
      : []
    return pageLocally(
      rawMessages.map((m, i) => transformMessage(m, ticketId, i)),
      params,
    )
  }

  // ── Contacts ──────────────────────────────────────────────────────────────

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    // ProProfs has no list-contacts endpoint. We treat the id as an email and
    // search by fetching tickets for that requester email, then project the
    // customer fields from the first matching ticket.
    const res = await this.client(credentials).post<TicketPage>('/list/ticket/', {
      ticket_per_page: 1,
      page: 1,
    })
    const tickets = res.ticket_data?.tickets ?? []
    const match = tickets.find((t) => t.customer_email === id)
    if (!match) throw new Error(`ProProfs Help Desk contact ${id} not found`)
    const raw: RawProprofsContact = {
      email: match.customer_email,
      name:  match.customer_name,
      phone: match.customer_phone,
    }
    return transformContact(raw)
  }
}
