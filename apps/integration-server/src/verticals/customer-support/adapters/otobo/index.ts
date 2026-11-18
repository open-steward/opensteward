/**
 * OTOBO adapter for the customer-support vertical.
 *
 * OTOBO exposes its data through the Generic Interface. The shipped
 * GenericTicketConnectorREST web service
 * (development/webservices/GenericTicketConnectorREST.yml) routes:
 *   TicketSearch  GET /Ticket
 *   TicketGet     GET /Ticket/:TicketID
 * User/agent, queue, tag, macro and team operations are NOT part of that
 * connector — those methods are intentionally omitted here and auto-501
 * through the interface's optional contract.
 *
 * Auth: UserLogin + Password per-request (api_key model). Stored in
 * credentials.accessToken (UserLogin) and credentials.extra.{password,
 * serverUrl, websvcName}.
 *
 * Paging: TicketSearch has no offset (see listTickets); TicketGet returns
 * every article of a ticket in one response (see listMessages).
 */
import { pageLocally, pageOffset, reportUpstreamPage } from '@opensteward/shared'
import type { Credentials, CredentialField, QueryParams } from '@opensteward/shared'
import type { CustomerSupportAdapter } from '../../adapter/interface'
import type { Ticket } from '../../schema/ticket'
import type { Message } from '../../schema/message'

import {
  credentialFields as adapterCredentialFields,
  exchangeCredentials as adapterExchangeCredentials,
  getAuthUrlUnsupported,
} from './auth'
import { OtoboClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'

import { transformTicket, type RawOtoboTicket } from './transform/ticket'
import { transformMessage, type RawOtoboArticle } from './transform/message'

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface OtoboAdapterConfig {
  // No OAuth client config needed — OTOBO uses UserLogin/Password.
  // Config object is kept for structural parity with the factory signature.
}

/**
 * TicketSearch response: `Data => { TicketID => [ 1, 2, 3, 4 ] }`, or
 * `Data => {}` when nothing matches (TicketSearch.pm Run()).
 */
interface TicketSearchResponse {
  TicketID?: Array<number | string>
}

/** TicketGet response: `Data => { Ticket => [ { ... }, ... ] }` (TicketGet.pm Run()). */
interface TicketGetResponse {
  Ticket?: Array<RawOtoboTicket & { Article?: RawOtoboArticle[] }>
}

/**
 * The one ticket TicketGet returned for `id`. TicketGet splits its TicketID
 * on commas (`TicketID => '32,33', # required, could be coma separated IDs`),
 * so a response that is not exactly the ticket asked for is treated as not
 * found rather than served under the wrong id.
 */
function onlyTicket(
  res: TicketGetResponse,
  id: string,
): RawOtoboTicket & { Article?: RawOtoboArticle[] } {
  const tickets = res.Ticket ?? []
  const raw = tickets[0]
  if (tickets.length !== 1 || !raw || String(raw.TicketID) !== id) {
    throw Object.assign(new Error(`otobo ticket ${id} not found`), {
      statusCode: 404,
      code: 'NOT_FOUND',
    })
  }
  return raw
}

export class OtoboAdapter implements CustomerSupportAdapter {
  readonly platform = 'otobo'
  readonly version = '0.1.0'

  constructor(_config: OtoboAdapterConfig) {}

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
    throw new Error('otobo uses UserLogin/Password auth; use credentialFields() instead')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // UserLogin/Password credentials do not expire.
    return credentials
  }

  private client(credentials: Credentials): OtoboClient {
    return new OtoboClient(credentials)
  }

  // ── Tickets ────────────────────────────────────────────────────────────────

  /**
   * TicketSearch (GET /Ticket) returns ticket ids only and has no offset: it
   * reads `Limit` (`$Self->{SearchLimit} = $Param{Data}->{Limit} ||
   * $Self->{Config}->{SearchLimit} || 500;`) and returns the first `Limit`
   * matches in `SortBy`/`OrderBy` order. So page N asks for the first
   * N × limit ids and serves ids [(N-1) × limit, N × limit). Fewer ids than
   * asked for is the end of the collection (hasMore false, with the total);
   * a full window may or may not be, so it reports hasMore true and the next
   * page, at an exact boundary, comes back empty with hasMore false. Sorting by
   * TicketNumber (unique, `st.tn`) ascending keeps the order stable between
   * calls. The page's tickets then come from one TicketGet
   * (GET /Ticket/:TicketID), which takes `TicketID => '32,33'` ("could be
   * coma separated IDs") and returns them in that order.
   */
  async listTickets(credentials: Credentials, params: QueryParams): Promise<Ticket[]> {
    const size = params.limit ?? DEFAULT_PAGE_SIZE
    const offset = pageOffset(params, size)
    const end = offset + size
    const client = this.client(credentials)

    // TicketGet fails the whole request with TicketGet.NotValidTicketID when
    // any one of the comma-separated ids has no ticket data (TicketGet.pm
    // Run(): `if ( !IsHashRefWithData( \%TicketEntryRaw ) ) {` ...
    // `ErrorCode    => 'TicketGet.NotValidTicketID',`). On a list that means a
    // ticket was deleted between TicketSearch and TicketGet, so the page is
    // searched again once; a second failure is an upstream fault (502), never
    // a 404 for the collection.
    for (let attempt = 1; ; attempt++) {
      const searchRes = await client.get<TicketSearchResponse>('/Ticket', {
        Limit: end,
        SortBy: 'TicketNumber',
        OrderBy: 'Up',
      })

      const all = searchRes.TicketID ?? []
      const hasMore = all.length >= end
      const page = hasMore ? { hasMore } : { hasMore, totalCount: all.length }
      const ids = all.slice(offset, end)
      if (ids.length === 0) {
        reportUpstreamPage(params, page)
        return []
      }

      try {
        const res = await client.get<TicketGetResponse>(`/Ticket/${ids.join(',')}`)
        reportUpstreamPage(params, page)
        return (res.Ticket ?? []).map(transformTicket)
      } catch (err) {
        if ((err as { code?: unknown }).code !== 'TicketGet.NotValidTicketID') throw err
        if (attempt >= 2) throw Object.assign(err as Error, { statusCode: 502 })
      }
    }
  }

  async getTicket(credentials: Credentials, id: string): Promise<Ticket> {
    const res = await this.client(credentials).get<TicketGetResponse>(
      `/Ticket/${encodeURIComponent(id)}`,
    )
    return transformTicket(onlyTicket(res, id))
  }

  // ── Messages ───────────────────────────────────────────────────────────────

  /**
   * Articles come embedded in TicketGet (GET /Ticket/:TicketID) with
   * `AllArticles => 1`. Without `ArticleLimit` (the only other article-count
   * parameter; there is no offset) TicketGet returns every article of the
   * ticket, so the whole list is sliced to the caller's page here.
   */
  async listMessages(
    credentials: Credentials,
    ticketId: string,
    params: QueryParams,
  ): Promise<Message[]> {
    const res = await this.client(credentials).get<TicketGetResponse>(
      `/Ticket/${encodeURIComponent(ticketId)}`,
      { AllArticles: 1 },
    )
    // TicketGet answers a ticket it cannot read with an `Error` (thrown by the
    // client), never with an empty `Ticket` list (TicketGet.pm returns
    // TicketGet.NotTicketData when no ticket was collected); a body with no
    // ticket at all therefore holds no articles.
    const raw = res.Ticket?.length ? onlyTicket(res, ticketId) : undefined
    const articles: RawOtoboArticle[] = Array.isArray(raw?.Article) ? raw.Article : []
    return pageLocally(articles, params).map((a) => transformMessage(a, ticketId))
  }

  async getMessage(_credentials: Credentials, id: string): Promise<Message> {
    throw new Error(
      `otobo articles are ticket-scoped; call listMessages(ticketId) instead. articleId=${id}`,
    )
  }
}
