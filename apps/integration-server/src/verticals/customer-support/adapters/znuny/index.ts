/**
 * Znuny adapter — customer-support vertical.
 *
 * Znuny is a self-hosted OTRS fork with a built-in REST web service
 * (GenericTicketConnectorREST). The adapter implements only the resources
 * that GenericTicketConnectorREST exposes natively:
 *
 *   - Tickets  (TicketSearch → TicketGet with AllArticles)
 *   - Messages (articles embedded in TicketGet)
 *
 * Auth:  per-request UserLogin + Password (no OAuth / no sessions).
 *        instanceUrl is tenant-specific (self-hosted).
 *
 * Docs:
 *   https://doc.znuny.org/znuny/admin/webservices/examples/GenericTicketConnectorREST/
 *   https://itgovernanceportal.com/znuny/znuny-otrs-rest-api-routes/
 *   https://github.com/znuny/Znuny/blob/dev/development/webservices/GenericTicketConnectorREST.yml
 */

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: contact — GenericTicketConnectorREST has no customer/contact list or get endpoints; contacts are not exposed in Znuny's standard REST web service
// Unavailable: user    — GenericTicketConnectorREST has no agent/user list or get endpoints; no User namespace exists in the standard connector
// Unavailable: tag     — GenericTicketConnectorREST has no tag list or get endpoints; ticket tags are inline strings only, not a queryable resource
// Unavailable: team    — GenericTicketConnectorREST has no queue/team list or get endpoints; queue data only appears as fields on tickets
// Unavailable: macro   — Znuny has no canned-response/macro concept exposed via any REST API endpoint

import type { Credentials, CredentialField, QueryParams } from '@opensteward/shared'
import { pageLocally, pageOffset, reportUpstreamPage } from '@opensteward/shared'
import type { CustomerSupportAdapter } from '../../adapter/interface'
import type { Ticket } from '../../schema/ticket'
import type { Message } from '../../schema/message'

import { credentialFields as adapterCredentialFields, exchangeCredentials as adapterExchangeCredentials, getAuthUrlUnsupported } from './auth'
import { ZnunyClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'

import { transformTicket, type RawZnunyTicket } from './transform/ticket'
import { transformMessage } from './transform/message'

// ── Znuny REST response envelopes ──────────────────────────────────────────

interface TicketSearchResponse {
  /** TicketSearch returns an array of numeric IDs */
  TicketID?: Array<string | number>
}

interface TicketGetResponse {
  Ticket?: RawZnunyTicket[]
}

// ── Adapter config ─────────────────────────────────────────────────────────

// Znuny has no OAuth config; config object is kept for structural parity.
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface ZnunyAdapterConfig {
  // intentionally empty — all per-tenant config lives in Credentials.extra
}

// ── Adapter class ──────────────────────────────────────────────────────────

export class ZnunyAdapter implements CustomerSupportAdapter {
  readonly platform = 'znuny'
  readonly version = '0.1.0'

   
  constructor(_config?: ZnunyAdapterConfig) {}

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
    throw new Error('znuny uses static credential auth; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // Credentials are long-lived UserLogin/Password — no token refresh needed.
    return credentials
  }

  private client(credentials: Credentials): ZnunyClient {
    return new ZnunyClient(credentials)
  }

  // ── Tickets ──────────────────────────────────────────────────────────────

  /**
   * List tickets via TicketSearch (returns IDs) followed by one TicketGet for
   * the caller's page of them.
   *
   * TicketSearch has no offset or page parameter: it reads `Limit` and
   * returns the first `Limit` matching TicketIDs in `SortBy`/`OrderBy` order
   * (Kernel/GenericInterface/Operation/Ticket/TicketSearch.pm:
   * `$Self->{SearchLimit} = $Param{Data}->{Limit} || $Self->{Config}->{SearchLimit} || 500;`).
   * So page N asks for the first N × limit IDs and serves the last `limit`
   * of them. The `Offset` this used to send is not a TicketSearch parameter
   * and was ignored, so page 2 repeated page 1.
   *
   * No end signal comes back beyond the count: fewer IDs than asked for is
   * the end; a full window may or may not be (reported as more, so the next
   * page is asked for and comes back empty at an exact boundary).
   */
  async listTickets(credentials: Credentials, params: QueryParams): Promise<Ticket[]> {
    const size = Math.max(1, Math.floor(params.limit ?? DEFAULT_PAGE_SIZE))
    const offset = pageOffset(params, size)
    const window = offset + size

    // TicketSearch returns an array of TicketIDs matching the query.
    const searchRes = await this.client(credentials).get<TicketSearchResponse>('/Ticket', {
      Limit: window,
      SortBy: 'Changed',
      OrderBy: 'Down',
      // Return all tickets regardless of state
      StateType: ['new', 'open', 'pending reminder', 'pending auto close+', 'pending auto close-', 'closed successful', 'closed unsuccessful', 'removed', 'merged'],
    })

    const all = searchRes.TicketID ?? []
    reportUpstreamPage(params, { hasMore: all.length >= window })
    const ids = all.slice(offset, window)
    if (ids.length === 0) return []

    // Fetch the page's tickets in a single TicketGet call (supports comma-separated IDs)
    const ticketRes = await this.client(credentials).get<TicketGetResponse>('/Ticket/' + ids.join(','), {
      AllArticles: 0,
    })

    return (ticketRes.Ticket ?? []).map(transformTicket)
  }

  async getTicket(credentials: Credentials, id: string): Promise<Ticket> {
    const res = await this.client(credentials).get<TicketGetResponse>(`/Ticket/${id}`, {
      AllArticles: 0,
    })
    const ticket = res.Ticket?.[0]
    if (!ticket) throw new Error(`Znuny ticket ${id} not found`)
    return transformTicket(ticket)
  }

  // ── Messages ─────────────────────────────────────────────────────────────

  /**
   * Articles are embedded inside TicketGet when AllArticles=1 is requested.
   * There is no separate article list endpoint in GenericTicketConnectorREST.
   */
  async listMessages(credentials: Credentials, ticketId: string, params: QueryParams): Promise<Message[]> {
    // Without ArticleLimit, TicketGet returns every article of the ticket in
    // one response: the whole collection, sliced to the caller's page here.
    const res = await this.client(credentials).get<TicketGetResponse>(`/Ticket/${ticketId}`, {
      AllArticles: 1,
    })
    const articles = res.Ticket?.[0]?.Article ?? []
    return pageLocally(articles, params).map((article) => transformMessage(article, ticketId))
  }

  async getMessage(credentials: Credentials, id: string): Promise<Message> {
    // Znuny articles are ticket-scoped; we cannot fetch a single article without the ticketId.
    // The id is expected in the form "ticketId:articleId" when called directly.
    const [ticketId, articleId] = id.split(':')
    if (!ticketId || !articleId) {
      throw new Error(
        `Znuny articles are ticket-scoped. Pass id as "ticketId:articleId". Received: ${id}`,
      )
    }
    const res = await this.client(credentials).get<TicketGetResponse>(`/Ticket/${ticketId}`, {
      AllArticles: 1,
    })
    const ticket = res.Ticket?.[0]
    if (!ticket) throw new Error(`Znuny ticket ${ticketId} not found`)
    const article = (ticket.Article ?? []).find((a) => String(a.ArticleID) === articleId)
    if (!article) throw new Error(`Znuny article ${articleId} not found in ticket ${ticketId}`)
    return transformMessage(article, ticketId)
  }
}
