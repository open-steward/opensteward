/**
 * Verloop.io adapter for the customer-support vertical.
 *
 * Verloop is a Voice AI + conversational automation platform. Its public REST
 * API is the Campaign API, which covers outreach campaigns (→ Ticket) and
 * WhatsApp message templates (→ Macro).
 *
 * Auth:    static API token in Authorization header (no "Bearer" prefix)
 * Base URL: https://<client_id>.verloop.io/api/v1
 * All endpoints: POST with JSON body.
 * Pagination: ListOption { Limit, Offset } in request body, Limit capped at 100.
 *   The response documents no total or next marker, so a page shorter than
 *   the Limit is the last; lists walk upstream pages of 100 with pageByRows.
 *
 * Resources NOT exposed by the Verloop public API:
 *   - Messages  — no per-conversation message-history endpoint; SendMessage is
 *                 outbound-only (Campaign API). Confirmed via docs.
 *   - Contacts  — no contact-management endpoint in Campaign API or WhatsApp
 *                 Partner API. Confirmed via docs.
 *   - Users     — no agent/user-management endpoint in any documented API.
 *                 Confirmed via docs.
 *   - Tags      — not exposed by any documented REST endpoint. Confirmed via docs.
 *   - Teams     — setDepartment is a client-side widget call only; no server-side
 *                 department/team endpoint exists. Confirmed via docs.
 *   - Webhook signature verification (no documented signing scheme)
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: contact — no contact-management endpoint in Campaign API or WhatsApp Partner API
 * Unavailable: message — no message-history endpoint; SendMessage is outbound-only
 * Unavailable: tag     — not exposed by any documented Verloop REST API endpoint
 * Unavailable: team    — setDepartment is client-side widget only; no server-side endpoint
 * Unavailable: user    — no agent/user-management endpoint in any documented Verloop API
 *
 * Docs: https://help.verloop.io/knowledge-base/verloop-campaign-api/
 */
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
import type { Macro } from '../../schema/macro'

import {
  credentialFields as adapterCredentialFields,
  exchangeCredentials as adapterExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import { VerloopClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'
import { transformTicket, type RawVerloopCampaign } from './transform/ticket'
import { transformMacro, type RawVerloopTemplate } from './transform/macro'

export interface VerloopAdapterConfig {
  // No OAuth client credentials needed — Verloop uses static API keys.
  // Config object kept for interface consistency.
  [key: string]: unknown
}

interface ListCampaignsResponse {
  Campaigns?: RawVerloopCampaign[]
}

interface GetCampaignResponse {
  Campaign?: RawVerloopCampaign
}

interface ListTemplatesResponse {
  Templates?: RawVerloopTemplate[]
}

interface GetTemplateResponse {
  Template?: RawVerloopTemplate
}

export class VerloopAdapter implements CustomerSupportAdapter {
  readonly platform = 'verloop'
  readonly version = '0.1.0'
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  constructor(_config?: VerloopAdapterConfig) {}

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
    throw new Error('verloop uses static API key auth; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  private client(credentials: Credentials): VerloopClient {
    return new VerloopClient(credentials)
  }

  /**
   * One caller page of a ListOption-paged list. Verloop takes
   * `ListOption: { Limit, Offset }` (Limit "capped at 100") and returns no
   * total or next marker, so a page shorter than 100 is the last. pageByRows
   * walks Offset 0, 100, 200… and cuts the caller's rows out of those pages,
   * peeking at the next one when a caller page ends on a boundary, so
   * `hasMore` is exact.
   */
  private async pageList<T>(
    credentials: Credentials,
    params: QueryParams,
    collection: string,
    fetchPage: (body: Record<string, unknown>) => Promise<T[]>,
  ): Promise<T[]> {
    const account = String(credentials.extra?.['clientId'] ?? '')
    const key = cursorPagerKey(connectionScope(account, credentials), collection, {
      upstreamPageSize: MAX_PAGE_SIZE,
    })
    const { items } = await pageByRows<T, number>(
      key,
      params,
      async (cursor) => {
        const offset = cursor ?? 0
        const rows = await fetchPage({ ListOption: { Limit: MAX_PAGE_SIZE, Offset: offset } })
        return {
          items: rows,
          next: rows.length >= MAX_PAGE_SIZE ? offset + rows.length : undefined,
        }
      },
      { defaultLimit: DEFAULT_PAGE_SIZE },
    )
    return items
  }

  // ── Tickets (Campaigns) ────────────────────────────────────────────────────

  async listTickets(credentials: Credentials, params: QueryParams): Promise<Ticket[]> {
    const client = this.client(credentials)
    return this.pageList(credentials, params, 'campaigns', async (body) => {
      const res = await client.post<ListCampaignsResponse>('/Campaign/ListCampaigns', body)
      return (res.Campaigns ?? []).map(transformTicket)
    })
  }

  async getTicket(credentials: Credentials, id: string): Promise<Ticket> {
    const res = await this.client(credentials).post<GetCampaignResponse>(
      '/Campaign/GetCampaign',
      { ID: id },
    )
    if (!res.Campaign) throw new Error(`verloop campaign ${id} not found`)
    return transformTicket(res.Campaign)
  }

  // ── Macros (Templates) ────────────────────────────────────────────────────

  async listMacros(credentials: Credentials, params: QueryParams): Promise<Macro[]> {
    const client = this.client(credentials)
    return this.pageList(credentials, params, 'templates', async (body) => {
      const res = await client.post<ListTemplatesResponse>('/Campaign/ListTemplates', body)
      return (res.Templates ?? []).map(transformMacro)
    })
  }

  async getMacro(credentials: Credentials, id: string): Promise<Macro> {
    const res = await this.client(credentials).post<GetTemplateResponse>(
      '/Campaign/GetTemplate',
      { ID: id },
    )
    if (!res.Template) throw new Error(`verloop template ${id} not found`)
    return transformMacro(res.Template)
  }
}
