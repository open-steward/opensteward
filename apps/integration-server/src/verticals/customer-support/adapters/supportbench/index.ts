/**
 * Supportbench adapter — customer-support vertical.
 *
 * Auth: API key via `username` + `password` headers (same key in both).
 * Base URL: https://api.supportbench.com
 *
 * Resources supported:
 *   - Tickets  (cases)    GET /case/:id, POST /activities for list
 *   - Messages (activities) POST /activities scoped to a case
 *   - Contacts            GET /search/contact/:terms, GET /contact/:id
 *
 * Resources NOT implemented (no documented public endpoints):
 *   - Users (agents)  — owner names appear embedded on cases only
 *   - Tags            — bare strings on cases, no list endpoint
 *   - Teams (divs)    — division names embedded on cases, no list endpoint
 *   - Macros          — not a Supportbench concept (no REST endpoint; UI-only feature)
 *   - Webhooks        — webhook delivery is supported via workflow builder
 *                       but signature verification is not documented
 *
 * Pagination (https://supportbench.readme.io/reference/return-activities):
 * POST /activities takes `page_number` ("page_number":2 // return results
 * from page 2) and returns "The top 500 results". Neither the upstream page
 * size nor the meaning of the response's `page` / `page_count` is stated
 * unambiguously, and no size parameter is documented, so both list methods
 * walk `page_number` 1, 2, … until an empty page and cut the caller's page
 * out of those rows with pageByRows.
 * Response envelope: { activities: [...], count, page, page_count }
 */

// ── Resource coverage ──────────────────────────────────────────────────────
// Available:   contact, message, tag, team, ticket, user
// Unavailable: macro — Supportbench has no REST API endpoint for macros/canned
//              responses; the feature exists in the UI only and is not exposed
//              via the public API (confirmed: supportbench.readme.io/llms.txt).

import {
  connectionScope,
  cursorPagerKey,
  pageByRows,
  type Credentials,
  type CredentialField,
  type QueryParams,
} from '@opensteward/shared'
import type { CustomerSupportAdapter } from '../../adapter/interface'
import type { Ticket } from '../../schema/ticket'
import type { Message } from '../../schema/message'
import type { Contact } from '../../schema/contact'

import { credentialFields as adapterCredentialFields, exchangeCredentials as adapterExchangeCredentials, getAuthUrlUnsupported } from './auth'
import { SupportbenchClient } from './client'
import { API_BASE_URL, MAX_PAGE_SIZE } from './constants'

import { transformTicket, type RawSupportbenchCase } from './transform/ticket'
import { transformMessage, type RawSupportbenchActivity } from './transform/message'
import { transformContact, type RawSupportbenchContact } from './transform/contact'

// ── Response envelope types ──────────────────────────────────────────────────

interface ActivitiesResponse {
  activities?: RawSupportbenchActivity[]
  count?: number
  page?: number
  page_count?: number
}

/**
 * Where the next upstream page of the tickets walk starts: its `page_number`,
 * and the case the previous page ended on. Activities come "order by the case
 * creation date", so one case's activities are contiguous and only the case
 * a page ends on can reappear at the start of the next.
 */
interface TicketCursor {
  page: number
  after: string | undefined
}

/** Unique cases, in order, from one page of activities, skipping `after`. */
function casesFrom(activities: RawSupportbenchActivity[], after: string | undefined): RawSupportbenchCase[] {
  const seen = new Set<string>()
  if (after) seen.add(after)
  const cases: RawSupportbenchCase[] = []
  for (const act of activities) {
    const cid = act.case_id
    if (cid && !seen.has(cid)) {
      seen.add(cid)
      cases.push({
        id: cid.includes('-') ? cid.split('-').pop() : cid,
        id_prefix: cid.includes('-') ? cid.split('-')[0] : undefined,
        status: act.case_status ?? undefined,
        contact_id: act.case_contact ?? undefined,
        company: act.case_company ?? undefined,
        owner: act.case_owner ?? undefined,
      })
    }
  }
  return cases
}

interface CaseResponse {
  id?: string
  id_prefix?: string
  subject?: string
  status?: string
  [key: string]: unknown
}

// ── Adapter class ────────────────────────────────────────────────────────────

export class SupportbenchAdapter implements CustomerSupportAdapter {
  readonly platform = 'supportbench'
  readonly version = '0.1.0'
  /**
   * The caller's page size is ours to choose: POST /activities takes no size
   * parameter, and every list method cuts its page out of whole upstream
   * pages with pageByRows. 500 matches the sync worker's page.
   */
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  constructor(_config?: Record<string, unknown>) {}

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
    throw new Error('Supportbench uses API key auth; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  private client(credentials: Credentials): SupportbenchClient {
    return new SupportbenchClient(credentials)
  }

  /** A legacy raw `page_number` cursor, when the caller passed one. */
  private legacyPageNumber(params: QueryParams): number | undefined {
    const cursor = params['cursor']
    if (cursor === undefined) return undefined
    const n = Number(cursor)
    return !Number.isNaN(n) && n > 0 ? n : 1
  }

  /** The connection's scope for paging keys: one Supportbench account per API key. */
  private scope(credentials: Credentials): string {
    return connectionScope(API_BASE_URL, credentials)
  }

  // ── Tickets (cases) ──────────────────────────────────────────────────────

  async listTickets(credentials: Credentials, params: QueryParams): Promise<Ticket[]> {
    // Supportbench returns cases through the POST /activities endpoint; we
    // retrieve the case summary list via activities with status_id = -1 (all
    // cases) and build minimal case objects from the unique case IDs.
    const client = this.client(credentials)
    const legacy = this.legacyPageNumber(params)
    if (legacy !== undefined) {
      const res = await client.post<ActivitiesResponse>('/activities', { status_id: -1, page_number: legacy })
      return casesFrom(res.activities ?? [], undefined).map(transformTicket)
    }
    // No size parameter and no unambiguous end signal is documented, so walk
    // `page_number` until an empty page. A case whose activities straddle an
    // upstream page boundary is counted once.
    const key = cursorPagerKey(this.scope(credentials), 'tickets', { status_id: -1 })
    const { items } = await pageByRows<RawSupportbenchCase, TicketCursor>(key, params, async (cursor) => {
      const page = cursor?.page ?? 1
      const res = await client.post<ActivitiesResponse>('/activities', { status_id: -1, page_number: page })
      const activities = res.activities ?? []
      // The last case this page names (an activity may carry no case_id).
      let last: string | undefined
      for (const a of activities) if (a.case_id) last = a.case_id
      return {
        items: casesFrom(activities, cursor?.after),
        next: activities.length > 0 ? { page: page + 1, after: last ?? cursor?.after } : undefined,
      }
    })
    return items.map(transformTicket)
  }

  async getTicket(credentials: Credentials, id: string): Promise<Ticket> {
    const raw = await this.client(credentials).get<CaseResponse>(`/case/${id}`)
    return transformTicket(raw as RawSupportbenchCase)
  }

  // ── Messages (activities scoped to a case) ───────────────────────────────

  async listMessages(credentials: Credentials, ticketId: string, params: QueryParams): Promise<Message[]> {
    const client = this.client(credentials)
    const legacy = this.legacyPageNumber(params)
    if (legacy !== undefined) {
      const res = await client.post<ActivitiesResponse>('/activities', { cases: ticketId, page_number: legacy })
      return (res.activities ?? []).map((a) => transformMessage(a, ticketId))
    }
    // Walk `page_number` until an empty page; see listTickets.
    const key = cursorPagerKey(this.scope(credentials), 'messages', { cases: ticketId })
    const { items } = await pageByRows<RawSupportbenchActivity, number>(key, params, async (cursor) => {
      const page = cursor ?? 1
      const res = await client.post<ActivitiesResponse>('/activities', { cases: ticketId, page_number: page })
      const activities = res.activities ?? []
      return { items: activities, next: activities.length > 0 ? page + 1 : undefined }
    })
    return items.map((a) => transformMessage(a, ticketId))
  }

  async getMessage(_credentials: Credentials, id: string): Promise<Message> {
    throw new Error(`Supportbench activities are case-scoped; call listMessages(caseId). id=${id}`)
  }

  // ── Contacts ─────────────────────────────────────────────────────────────

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const raw = await this.client(credentials).get<RawSupportbenchContact>(`/contact/${id}`)
    return transformContact(raw)
  }

  // listContacts is not supported via a public list endpoint — only contact
  // search is available (requires a search term). Omitted; returns 501 by default.
}
