import { simpleApiKey, pageLocally, pageOffset, reportUpstreamPage } from '@opensteward/shared'
/**
 * Apollo adapter for the CRM vertical.
 *
 * Maps the Apollo.io v1 REST API to canonical CRM resources.
 * Docs: https://docs.apollo.io/reference/apollo-api
 *
 * ── Coverage ─────────────────────────────────────────────────────────────
 *
 * Implemented (19):
 *   Contacts:   list, get, create, update, delete
 *   Companies:  list, get, create, update, delete
 *   Deals:      list, get, create, update, delete
 *   Pipelines:  list, get (synthesised from opportunity_stages)
 *   Notes:      list (per contact, company or deal — GET /notes needs one), get, create, delete
 *   Auth:       getAuthUrl (N/A — API key), exchangeCode (N/A), refreshCredentials (N/A)
 *   Webhooks:   verifyWebhook, parseWebhookEvents
 *
 * Omitted (7) — registry returns HTTP 501 automatically:
 *   Activities: list, get, create, update, delete (Apollo has no unified activity model)
 *   Notes:      update (Apollo API does not support note updates)
 */

import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { WebhookEvent } from '../../schema/webhook'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'
import type { Deal } from '../../schema/deal'
import type { Pipeline } from '../../schema/pipeline'
import type { Note } from '../../schema/note'

import { ApolloClient, type ApolloPagination } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'
import { verifyWebhook, parseWebhookEvents } from './webhook'
import {
  transformContact, untransformContact, type RawApolloContact,
} from './transform/contact'
import {
  transformCompany, untransformCompany, type RawApolloAccount,
} from './transform/company'
import {
  transformDeal, untransformDeal, type RawApolloOpportunity,
} from './transform/deal'
import {
  transformPipeline, type RawApolloStage,
} from './transform/pipeline'
import {
  transformNote, untransformNote, type RawApolloNote,
} from './transform/note'

export interface ApolloAdapterConfig {
  /** Apollo API key — stored in credentials.accessToken. */
  apiKey?: string
}
const SIMPLE_API_KEY_FORM = simpleApiKey()

/**
 * Largest page Apollo serves on the list endpoints paged here. Contacts and
 * accounts search: "display limit of 50,000 records (100 records per page, up
 * to 500 pages)"; notes `limit`: "Maximum value is `100`".
 */
const MAX_PAGE_SIZE = 100

/**
 * Contacts and accounts search serve only their first 50,000 matches: "this
 * endpoint has a display limit of 50,000 records (100 records per page, up to
 * 500 pages)". What Apollo answers past it is undocumented, and a short or
 * empty page there would read as the end of the collection, so a page that
 * reaches it is refused instead.
 */
const SEARCH_DISPLAY_LIMIT = 50_000

/**
 * GET /notes lists the notes of a record, never all of them: "You must provide
 * at least one relation parameter". Canonical relation → Apollo parameter.
 */
const NOTE_RELATIONS = [
  ['contact_id', 'contact_id'],
  ['company_id', 'account_id'],
  ['deal_id', 'opportunity_id'],
] as const

function displayLimitError(path: string): Error {
  return Object.assign(
    new Error(
      `Apollo ${path} serves only its first ${SEARCH_DISPLAY_LIMIT} matches ("display limit ` +
        'of 50,000 records"). This page reaches past that, so the rest of the collection ' +
        'cannot be listed through it.',
    ),
    { statusCode: 422, code: 'UPSTREAM_LIMIT' },
  )
}


export class ApolloAdapter implements CrmAdapter {

  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'apollo'
  readonly version = '0.1.0'

  private staticApiKey: string | undefined

  constructor(config: ApolloAdapterConfig = {}) {
    this.staticApiKey = config.apiKey
  }

  // ── Auth (API-key — no OAuth) ──────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    return '#api-key-auth'
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    return { accessToken: this.staticApiKey ?? '' }
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  // ── Webhooks ───────────────────────────────────────────────────────────────

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseWebhookEvents(payload)
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private client(credentials: Credentials): ApolloClient {
    const effective: Credentials = this.staticApiKey
      ? { accessToken: this.staticApiKey }
      : credentials
    return new ApolloClient(effective)
  }

  /** The caller's limit as a whole number in 1..MAX_PAGE_SIZE; the default when it names none. */
  private pageSize(params: QueryParams): number {
    const n = Number(params.limit)
    return Number.isFinite(n) && n >= 1 ? Math.min(Math.floor(n), MAX_PAGE_SIZE) : DEFAULT_PAGE_SIZE
  }

  /** 1-based page; missing, below 1 or not a number is page 1. */
  private pageNumber(params: QueryParams): number {
    const n = Number(params.page)
    return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1
  }

  /**
   * One page of a contacts/accounts search: `page` (numbered from 1) +
   * `per_page`, oldest-created first so a record created or edited mid-walk
   * moves no row across a page boundary (Apollo documents no default order).
   */
  private async searchPage<T>(
    credentials: Credentials,
    path: string,
    listKey: string,
    sortField: string,
    params: QueryParams,
  ): Promise<T[]> {
    const page = this.pageNumber(params)
    const perPage = this.pageSize(params)
    const start = (page - 1) * perPage
    if (start >= SEARCH_DISPLAY_LIMIT) throw displayLimitError(path)
    const { items, pagination } = await this.client(credentials).listSearch<T>(path, {
      __listKey: listKey,
      page,
      per_page: perPage,
      sort_by_field: sortField,
      sort_ascending: true,
    })
    // Cut short at the display limit: whether more matches exist is unknowable.
    if (items.length < perPage && start + items.length >= SEARCH_DISPLAY_LIMIT) {
      throw displayLimitError(path)
    }
    if (typeof pagination?.page === 'number' && typeof pagination.total_pages === 'number') {
      reportUpstreamPage(params, { hasMore: pagination.page < pagination.total_pages })
    }
    return items
  }

  // ── Contacts ──────────────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const items = await this.searchPage<RawApolloContact>(
      credentials, '/contacts/search', 'contacts', 'contact_created_at', params,
    )
    return items.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const res = await this.client(credentials).get<{ contact: RawApolloContact }>(
      `/contacts/${id}`,
    )
    return transformContact(res.contact)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const res = await this.client(credentials).post<{ contact: RawApolloContact }>(
      '/contacts',
      untransformContact(data),
    )
    return transformContact(res.contact)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const res = await this.client(credentials).put<{ contact: RawApolloContact }>(
      `/contacts/${id}`,
      untransformContact(data),
    )
    return transformContact(res.contact)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/contacts/${id}`)
  }

  // ── Companies (Accounts) ──────────────────────────────────────────────────

  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    const items = await this.searchPage<RawApolloAccount>(
      credentials, '/accounts/search', 'accounts', 'account_created_at', params,
    )
    return items.map(transformCompany)
  }

  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    const res = await this.client(credentials).get<{ account: RawApolloAccount }>(
      `/accounts/${id}`,
    )
    return transformCompany(res.account)
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const res = await this.client(credentials).post<{ account: RawApolloAccount }>(
      '/accounts',
      untransformCompany(data),
    )
    return transformCompany(res.account)
  }

  async updateCompany(
    credentials: Credentials,
    id: string,
    data: Partial<Company>,
  ): Promise<Company> {
    const res = await this.client(credentials).put<{ account: RawApolloAccount }>(
      `/accounts/${id}`,
      untransformCompany(data),
    )
    return transformCompany(res.account)
  }

  async deleteCompany(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/accounts/${id}`)
  }

  // ── Deals (Opportunities) ─────────────────────────────────────────────────

  /**
   * GET /opportunities/search — "Use the list all deals endpoint to retrieve
   * every deal that has been created for your team's Apollo account."
   * (https://docs.apollo.io/reference/list-all-deals.md). /opportunities is
   * documented only as POST, to create a deal (create-deal.md): no GET list is
   * documented there. Pages by `page` (from 1) + `per_page`, which
   * states no maximum, so the size is clamped to the declared MAX_PAGE_SIZE. Its
   * `sort_by_field` offers only `amount`, `is_closed` and `is_won` — no stable
   * creation order to ask for — so none is sent.
   */
  async listDeals(credentials: Credentials, params: QueryParams): Promise<Deal[]> {
    const page = this.pageNumber(params)
    const res = await this.client(credentials).get<{
      opportunities?: RawApolloOpportunity[]
      pagination?: ApolloPagination
    }>('/opportunities/search', { page, per_page: this.pageSize(params) })
    const pagination = res?.pagination
    // Only what Apollo sent: no made-up last page.
    if (typeof pagination?.page === 'number' && typeof pagination.total_pages === 'number') {
      reportUpstreamPage(params, { hasMore: pagination.page < pagination.total_pages })
    }
    return (res?.opportunities ?? []).map(transformDeal)
  }

  async getDeal(credentials: Credentials, id: string): Promise<Deal> {
    const res = await this.client(credentials).get<{ opportunity: RawApolloOpportunity }>(
      `/opportunities/${id}`,
    )
    return transformDeal(res.opportunity)
  }

  async createDeal(credentials: Credentials, data: Partial<Deal>): Promise<Deal> {
    const res = await this.client(credentials).post<{ opportunity: RawApolloOpportunity }>(
      '/opportunities',
      untransformDeal(data),
    )
    return transformDeal(res.opportunity)
  }

  async updateDeal(
    credentials: Credentials,
    id: string,
    data: Partial<Deal>,
  ): Promise<Deal> {
    const res = await this.client(credentials).put<{ opportunity: RawApolloOpportunity }>(
      `/opportunities/${id}`,
      untransformDeal(data),
    )
    return transformDeal(res.opportunity)
  }

  async deleteDeal(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/opportunities/${id}`)
  }

  // ── Pipelines (synthesised from opportunity_stages) ───────────────────────

  /**
   * GET /opportunity_stages documents no parameters — "Use the list deal stages
   * endpoint to retrieve information about every deal stage that's available in
   * your team's Apollo account." (https://docs.apollo.io/reference/list-deal-stages.md)
   * — so none is sent: a `per_page` of our own would be a fixed page size.
   */
  private async stages(credentials: Credentials): Promise<RawApolloStage[]> {
    const res = await this.client(credentials).get<{ opportunity_stages?: RawApolloStage[] }>(
      '/opportunity_stages',
    )
    return res?.opportunity_stages ?? []
  }

  async listPipelines(credentials: Credentials, params: QueryParams): Promise<Pipeline[]> {
    // One pipeline built from every stage: page 2 is empty, not page 1 again.
    return pageLocally([transformPipeline(await this.stages(credentials))], params)
  }

  async getPipeline(credentials: Credentials, _id: string): Promise<Pipeline> {
    return transformPipeline(await this.stages(credentials))
  }

  // ── Notes ─────────────────────────────────────────────────────────────────

  async listNotes(credentials: Credentials, params: QueryParams): Promise<Note[]> {
    const relation: Record<string, string> = {}
    for (const [ours, theirs] of NOTE_RELATIONS) {
      const id = params[ours]
      if ((typeof id === 'string' && id !== '') || typeof id === 'number') relation[theirs] = String(id)
    }
    if (Object.keys(relation).length === 0) {
      throw Object.assign(
        new Error(
          'Apollo cannot list every note: GET /notes requires a relation parameter ("You must ' +
            'provide at least one relation parameter"). listNotes needs contact_id, company_id or deal_id.',
        ),
        { statusCode: 501, code: 'NOT_SUPPORTED' },
      )
    }
    // Pages by row offset — `skip` + `limit` — not page/per_page. Oldest first
    // (the default is `created_at` descending), so a note added mid-walk lands
    // at the end instead of pushing a row onto the next page.
    const limit = this.pageSize(params)
    const res = await this.client(credentials).get<{ notes?: RawApolloNote[] }>('/notes', {
      ...relation,
      sort_by_field: 'created_at',
      sort_direction: 'asc',
      skip: pageOffset({ page: this.pageNumber(params) }, limit),
      limit,
    })
    return (res?.notes ?? []).map(transformNote)
  }

  async getNote(credentials: Credentials, id: string): Promise<Note> {
    const res = await this.client(credentials).get<{ note: RawApolloNote }>(`/notes/${id}`)
    return transformNote(res.note)
  }

  async createNote(credentials: Credentials, data: Partial<Note>): Promise<Note> {
    const res = await this.client(credentials).post<{ note: RawApolloNote }>(
      '/notes',
      untransformNote(data),
    )
    return transformNote(res.note)
  }

  async deleteNote(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/notes/${id}`)
  }
}
