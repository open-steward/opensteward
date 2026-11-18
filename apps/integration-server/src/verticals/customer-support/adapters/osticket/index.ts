/**
 * osTicket adapter — customer-support vertical.
 *
 * osTicket is a self-hosted open-source helpdesk. Authentication uses an
 * X-API-Key header; the base URL is per-credential (self-hosted install).
 *
 * Supported resources (have API endpoints):
 *   - Tickets  → GET /api/tickets-search.php (list) + GET /api/tickets-get.php/{n}.json (get)
 *   - Messages → extracted from TicketDetail.thread (thread entries per ticket)
 *
 * Unsupported resources (no osTicket REST API endpoints; confirmed via official docs
 *   and markus-michalski/osticket-api-endpoints openapi.yaml — tickets only):
 *   - Contacts, Users, Tags, Teams, Macros
 *
 * ── Resource coverage ──────────────────────────────────────────────────────
 * Unavailable: contact — no REST endpoint; only ticket creation in official API and plugin
 * Unavailable: macro   — canned responses are UI-only; no REST endpoint in any known release
 * Unavailable: tag     — tags exist in data model but no REST listing endpoint
 * Unavailable: team    — teams referenced on tickets but no dedicated REST endpoint
 * Unavailable: user    — staff/agents not exposed via any REST endpoint
 *
 * osTicket does not publish a webhook signing specification; parseWebhookEvents
 * and verifyWebhook are therefore not implemented on this adapter.
 *
 * Schema-firewall: no attachment binary content; thread bodies only.
 */
import type { Credentials, CredentialField, QueryParams } from '@opensteward/shared'
import { pageLocally, pageOffset, reportUpstreamPage } from '@opensteward/shared'
import type { CustomerSupportAdapter } from '../../adapter/interface'
import type { Ticket } from '../../schema/ticket'
import type { Message } from '../../schema/message'

import {
  credentialFields as adapterCredentialFields,
  exchangeCredentials as adapterExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import { OsticketClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformTicket, type RawOsticketTicket } from './transform/ticket'
import { transformMessage, type RawOsticketThreadEntry } from './transform/message'

// ── Response shapes ────────────────────────────────────────────────────────

/** Response from GET /tickets-search.php — direct array of TicketSummary */
type TicketSearchResponse = RawOsticketTicket[]

/** Response from GET /tickets-get.php/{number}.json — single TicketDetail */
type TicketDetailResponse = RawOsticketTicket

// ── Adapter config (no OAuth; kept for consistency with factory signature) ──

export interface OsticketAdapterConfig {
  /** Not used at runtime — osTicket has no OAuth flow. */
  _unused?: never
}

// ── Adapter class ──────────────────────────────────────────────────────────

export class OsticketAdapter implements CustomerSupportAdapter {
  readonly platform = 'osticket'
  readonly version = '0.1.0'
  /** tickets-search.php: "Maximum results per page (default 20, max 100)"; listMessages pages locally. */
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  constructor(_config?: OsticketAdapterConfig) {}

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
    throw new Error('osticket uses static API key auth; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // API keys do not expire; return as-is.
    return credentials
  }

  // ── Private helpers ──────────────────────────────────────────────────────

  private client(credentials: Credentials): OsticketClient {
    return new OsticketClient(credentials)
  }

  /**
   * Build query params for GET /tickets-search.php pagination.
   * The plugin documents `limit` ("Maximum results per page (default 20, max 100)")
   * and `offset` ("Pagination offset"). The offset strides by the size actually
   * sent, so a direct call above the maximum does not skip rows.
   */
  private searchParams(params: QueryParams): { limit: number; offset: number } {
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    return { limit, offset: pageOffset(params, limit) }
  }

  // ── Tickets ──────────────────────────────────────────────────────────────

  /**
   * List tickets via GET /api/tickets-search.php.
   * Returns a direct JSON array (not wrapped in an object).
   * Requires the API Endpoints Plugin (markus-michalski/osticket-api-endpoints).
   */
  async listTickets(credentials: Credentials, params: QueryParams): Promise<Ticket[]> {
    const paging = this.searchParams(params)
    const res = await this.client(credentials).get<TicketSearchResponse>('/tickets-search.php', paging)
    const items = Array.isArray(res) ? res : []
    // A bare array with no count or next marker: only a short page is known to be the last.
    reportUpstreamPage(params, {
      ...(items.length < paging.limit ? { hasMore: false } : {}),
      ...(params.limit !== undefined && paging.limit < params.limit ? { pageSize: paging.limit } : {}),
    })
    return items.map(transformTicket)
  }

  /**
   * Get a single ticket by number or internal ID.
   * Uses GET /api/tickets-get.php/{number}.json.
   * Requires the API Endpoints Plugin.
   */
  async getTicket(credentials: Credentials, id: string): Promise<Ticket> {
    const res = await this.client(credentials).get<TicketDetailResponse>(
      `/tickets-get.php/${encodeURIComponent(id)}.json`,
    )
    if (!res || typeof res !== 'object') {
      throw new Error(`osticket ticket ${id} not found`)
    }
    return transformTicket(res)
  }

  // ── Messages ─────────────────────────────────────────────────────────────

  /**
   * List thread entries for a ticket.
   * Fetches the TicketDetail and extracts its `thread` array.
   * Each thread entry (message/response/note) becomes a canonical Message.
   * The endpoint returns every thread entry, so the thread is paged locally.
   */
  async listMessages(credentials: Credentials, ticketId: string, params: QueryParams): Promise<Message[]> {
    const res = await this.client(credentials).get<TicketDetailResponse>(
      `/tickets-get.php/${encodeURIComponent(ticketId)}.json`,
    )
    const thread: RawOsticketThreadEntry[] = Array.isArray(res?.thread) ? res.thread : []
    // The ticket detail carries the whole thread and takes no paging parameter.
    const page = pageLocally(thread, params)
    return page.map((entry) => transformMessage(entry, ticketId))
  }

  /**
   * Thread entries are ticket-scoped; individual lookup is not supported.
   */
  async getMessage(_credentials: Credentials, id: string): Promise<Message> {
    throw new Error(`osticket thread entries are ticket-scoped; call listMessages(ticketId). id=${id}`)
  }
}
