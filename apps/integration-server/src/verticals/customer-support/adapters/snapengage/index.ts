/**
 * SnapEngage adapter for the customer-support vertical.
 *
 * SnapEngage is a live-chat platform.  Its data model maps as follows:
 *   Ticket   → chat case (from Logs API  GET /{orgId}/logs)
 *   Message  → transcript entry (nested inside each case)
 *   Contact  → requester derived from case.requested_by + requester_details
 *   User     → user account from Provisioning API  GET /api/v1/user.json (by email
 *              only; there is no roster, so listUsers refuses with 501)
 *
 * Tags, Teams, and Macros have no equivalent SnapEngage API; those
 * methods are absent so the router returns 501 automatically.
 *
 * Webhook signature verification is not documented by SnapEngage;
 * verifyWebhook and parseWebhookEvents are therefore not implemented.
 *
 * Auth: Authorization: <api_token>  (no "Bearer" prefix)
 * Org:  orgId is stored in credentials.extra.orgId
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

import axios from 'axios'
import {
  credentialFields as adapterCredentialFields,
  exchangeCredentials as adapterExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import { SnapengageClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'

import { transformTicket, type RawSnapengageCase } from './transform/ticket'
import { transformMessage } from './transform/message'
import { transformContact, type RawSnapengageRequester } from './transform/contact'
import { transformUser, type RawSnapengageAgent } from './transform/user'

// ── Response shapes ──────────────────────────────────────────────────────────

interface LogsResponse {
  cases?: RawSnapengageCase[]
  linkToNextSetOfResults?: string
}

// Provisioning API response wraps the agent object directly at the root.
type AgentResponse = RawSnapengageAgent

// ── Adapter config ───────────────────────────────────────────────────────────

export interface SnapengageAdapterConfig {
  /** Not used for API-key auth; kept for interface compatibility. */
  clientId?: string
  clientSecret?: string
  redirectUri?: string
}

// ── Adapter ──────────────────────────────────────────────────────────────────

export class SnapengageAdapter implements CustomerSupportAdapter {
  readonly platform = 'snapengage'
  readonly version = '0.1.0'

  constructor(_config?: SnapengageAdapterConfig) {}

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
    throw new Error('SnapEngage uses static API-key auth; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  // ── Helpers ─────────────────────────────────────────────────────────────────

  private client(credentials: Credentials): SnapengageClient {
    return new SnapengageClient(credentials)
  }

  private orgId(credentials: Credentials): string {
    return String((credentials.extra as Record<string, unknown>)?.['orgId'] ?? '')
  }

  /**
   * Build date-range params for the Logs API.
   * SnapEngage requires `start` and `end` ISO-8601 strings.
   * We default to the last 30 days when the caller doesn't supply them.
   *
   * The default window ends at the next whole minute, so the pages of one walk
   * (and the pager key that remembers its `next` tokens) share one window
   * instead of each call moving it by a few milliseconds.
   */
  private logsParams(params: QueryParams): Record<string, unknown> {
    const minute = 60 * 1000
    const now = new Date(Math.ceil(Date.now() / minute) * minute)
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
    return {
      start: (params['start'] as string | undefined) ?? thirtyDaysAgo.toISOString(),
      end: (params['end'] as string | undefined) ?? now.toISOString(),
      // Pass `next` pagination token if caller supplied cursor
      ...(params['cursor'] ? { next: String(params['cursor']) } : {}),
      // SnapEngage page size is fixed at 100 max; pass widgetId if provided
      ...(params['widgetId'] ? { widgetId: String(params['widgetId']) } : {}),
    }
  }

  /**
   * The `next` value for the batch after this one, from `linkToNextSetOfResults`.
   * Docs (https://developer.snapengage.com/logs-api/), parameter `next`: "If more
   * than 100 results are returned, a value for linkToNextSetOfResults will be
   * returned that can be used to access the next set of results." Empty or absent
   * ends the stream. When the value is a link carrying `next`, that is sent.
   */
  private nextToken(link: string | undefined): string | undefined {
    if (!link) return undefined
    try {
      const fromLink = new URL(link).searchParams.get('next')
      if (fromLink) return fromLink
    } catch {
      // Not a URL: the value itself is the token.
    }
    return link
  }

  /**
   * The caller's page of rows derived from the Logs API case stream. Batches are
   * a fixed 100 cases, so one upstream batch is not one caller page: pageByRows
   * cuts the caller's rows out of the batches, following linkToNextSetOfResults.
   * A caller holding an explicit `cursor` is at an upstream position and gets
   * that one batch.
   */
  private async pageCases<R>(
    credentials: Credentials,
    params: QueryParams,
    collection: string,
    toRows: (cases: RawSnapengageCase[]) => R[],
  ): Promise<R[]> {
    const c = this.client(credentials)
    const orgId = this.orgId(credentials)
    const path = `/${orgId}/logs`
    const query = this.logsParams(params)
    if (params['cursor']) {
      const res = await c.get<LogsResponse>(path, query)
      return toRows(res.cases ?? [])
    }
    const key = cursorPagerKey(connectionScope(orgId, credentials), collection, {
      ...query,
      pageSize: DEFAULT_PAGE_SIZE,
    })
    const { items } = await pageByRows<R, string>(key, params, async (cursor) => {
      const res = await c.get<LogsResponse>(path, { ...query, ...(cursor ? { next: cursor } : {}) })
      return { items: toRows(res.cases ?? []), next: this.nextToken(res.linkToNextSetOfResults) }
    })
    return items
  }

  // ── Tickets (cases) ─────────────────────────────────────────────────────────

  async listTickets(credentials: Credentials, params: QueryParams): Promise<Ticket[]> {
    return this.pageCases(credentials, params, 'tickets', (cases) => cases.map(transformTicket))
  }

  async getTicket(credentials: Credentials, id: string): Promise<Ticket> {
    // SnapEngage Logs API doesn't support single-case lookup by ID.
    // Search within the last 90 days.
    const c = this.client(credentials)
    const now = new Date()
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
    const res = await c.get<LogsResponse>(`/${this.orgId(credentials)}/logs`, {
      start: ninetyDaysAgo.toISOString(),
      end: now.toISOString(),
    })
    const found = (res.cases ?? []).find((c) => c.id === id)
    if (!found) throw new Error(`SnapEngage case ${id} not found in the last 90 days`)
    return transformTicket(found)
  }

  // ── Messages (transcript entries) ──────────────────────────────────────────

  async listMessages(
    credentials: Credentials,
    ticketId: string,
    params: QueryParams,
  ): Promise<Message[]> {
    const c = this.client(credentials)
    const now = new Date()
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
    const res = await c.get<LogsResponse>(`/${this.orgId(credentials)}/logs`, {
      start: ninetyDaysAgo.toISOString(),
      end: now.toISOString(),
    })
    const caseObj = (res.cases ?? []).find((c) => c.id === ticketId)
    if (!caseObj) return pageLocally<Message>([], params)
    const agentAlias = caseObj.chat_agent_alias
    // The transcript is nested whole inside the case: page it locally.
    return pageLocally(
      (caseObj.transcripts ?? []).map((t) => transformMessage(t, ticketId, agentAlias)),
      params,
    )
  }

  async getMessage(_credentials: Credentials, id: string): Promise<Message> {
    throw new Error(`SnapEngage transcripts are case-scoped; call listMessages(caseId). id=${id}`)
  }

  // ── Contacts ────────────────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    return this.pageCases(credentials, params, 'contacts', (cases) => {
      // Deduplicate by email (within each batch of cases)
      const seen = new Set<string>()
      const contacts: Contact[] = []
      for (const caseObj of cases) {
        const email = caseObj.requested_by ?? ''
        if (email && seen.has(email)) continue
        if (email) seen.add(email)
        const requester: RawSnapengageRequester = {
          email,
          name: caseObj.requester_details?.name,
          phone: caseObj.requester_details?.phones?.[0],
        }
        contacts.push(transformContact(requester))
      }
      return contacts
    })
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    // id = email for SnapEngage contacts
    const c = this.client(credentials)
    const now = new Date()
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000)
    const res = await c.get<LogsResponse>(`/${this.orgId(credentials)}/logs`, {
      start: ninetyDaysAgo.toISOString(),
      end: now.toISOString(),
    })
    const caseObj = (res.cases ?? []).find((c) => c.requested_by === id)
    if (!caseObj) throw new Error(`SnapEngage contact with email ${id} not found in last 90 days`)
    const requester: RawSnapengageRequester = {
      email: caseObj.requested_by,
      name: caseObj.requester_details?.name,
      phone: caseObj.requester_details?.phones?.[0],
    }
    return transformContact(requester)
  }

  // ── Users (agents via Provisioning API) ─────────────────────────────────────

  /**
   * No roster endpoint exists. The Provisioning API (https://developer.snapengage.com/)
   * reads users only one at a time: "GET /api/v1/user.json?api_key={api_key}&email={user_email}",
   * where email is "Required. A valid email address of an existing user." Returning []
   * or a single looked-up row would tell a sync the collection is complete, so refuse.
   */
  async listUsers(_credentials: Credentials, _params: QueryParams): Promise<User[]> {
    throw Object.assign(
      new Error(
        'SnapEngage cannot list users: the Provisioning API only reads one user account by email ' +
          '("GET /api/v1/user.json?api_key={api_key}&email={user_email}"; email is ' +
          '"Required. A valid email address of an existing user.")',
      ),
      { statusCode: 501, code: 'NOT_SUPPORTED' },
    )
  }

  async getUser(credentials: Credentials, id: string): Promise<User> {
    // id = agent email for SnapEngage
    // Provisioning API: GET /api/v1/user.json?api_key=<token>&email=<email>
    // Note: this endpoint lives under /api/v1, not /api/v2, and takes api_key as a query param.
    const { data } = await axios.get<AgentResponse>('https://www.snapengage.com/api/v1/user.json', {
      params: {
        api_key: credentials.accessToken,
        email: id,
      },
      headers: { Accept: 'application/json' },
      timeout: 30_000,
    })
    return transformUser(data)
  }
}
