/**
 * Nimble adapter for the CRM vertical.
 *
 * Maps the Nimble v1 REST API to canonical CRM resources.
 * Docs: https://nimble.readthedocs.io/en/latest/
 *
 * ── Coverage ─────────────────────────────────────────────────────────────
 *
 * Implemented (5):
 *   Contacts:   list, get, create, update, delete
 *   Companies:  list, get, create, update, delete
 *   Deals:      create, update, delete (list and get refuse with 501, see below)
 *   Pipelines:  list, get (read-only), on GET /api/v2/deals/pipelines
 *   Notes:      list (walks contacts), get, create, delete
 *   Auth:       getAuthUrl, exchangeCode, refreshCredentials
 *   Webhooks:   verifyWebhook (always true), parseWebhookEvents (empty)
 *
 * Omitted (1) — registry returns HTTP 501 automatically:
 *   Activities: not available in Nimble API
 */

import { connectionScope, cursorPagerKey, pageByRows, pageLocally } from '@opensteward/shared'
import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { WebhookEvent } from '../../schema/webhook'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'
import type { Deal } from '../../schema/deal'
import type { Pipeline } from '../../schema/pipeline'
import type { Note } from '../../schema/note'

import { NimbleClient } from './client'
import { CONTACTS_PAGE_SIZE, DEFAULT_PAGE_SIZE } from './constants'
import { buildAuthUrl, exchangeCode as _exchangeCode, refreshToken } from './auth'
import {
  verifyWebhook as _verifyWebhook,
  parseWebhookEvents as _parseWebhookEvents,
} from './webhook'
import { transformContact, untransformContact, type RawNimbleContact } from './transform/contact'
import { transformCompany, untransformCompany, type RawNimbleCompany } from './transform/company'
import { transformDeal, untransformDeal, type RawNimbleDeal } from './transform/deal'
import { transformPipeline, type RawNimblePipeline } from './transform/pipeline'
import { transformNote, untransformNote, type RawNimbleNote } from './transform/note'

/** GET /api/v1/contacts: `meta` is Commons.PaginationMeta (page, pages, per_page, total). */
interface NimbleContactsPage {
  meta?: { page?: number; pages?: number }
  resources?: Array<{ id: string }>
}

/**
 * GET /api/v1/contact/{contact_id}/notes: meta { has_more, page, pages,
 * per_page, total } (all required in the current spec), resources of
 * ContactNote. The legacy reference's example meta has page and pages but no
 * has_more, so paging ends on page reaching pages, which both sources carry.
 */
interface NimbleNotesPage {
  meta?: { page?: number; pages?: number }
  resources?: RawNimbleNote[]
}

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

export interface NimbleAdapterConfig {
  /** OAuth2 client ID. */
  clientId?: string
  /** OAuth2 client secret. */
  clientSecret?: string
  /** OAuth2 redirect URI. */
  redirectUri?: string
}

export class NimbleAdapter implements CrmAdapter {
  readonly platform = 'nimble'
  readonly version = '0.1.0'

  private clientId: string | undefined
  private clientSecret: string | undefined
  private redirectUri: string | undefined

  constructor(config: NimbleAdapterConfig = {}) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(state: string, _overrideScopes?: string[]): string {
    return buildAuthUrl(
      this.clientId ??
        ((): never => {
          throw new Error('Nimble: clientId required')
        })(),
      this.redirectUri ?? '',
      state,
    )
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    if (!this.clientId || !this.clientSecret) {
      throw new Error('Nimble exchangeCode: clientId and clientSecret required')
    }
    return _exchangeCode(code, this.clientId, this.clientSecret, redirectUri)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    const clientId = this.clientId ?? (credentials.extra?.['client_id'] as string | undefined)
    const clientSecret =
      this.clientSecret ?? (credentials.extra?.['client_secret'] as string | undefined)
    if (!clientId || !clientSecret) return credentials
    return refreshToken(credentials, clientId, clientSecret)
  }

  // ── Webhooks ───────────────────────────────────────────────────────────────

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return _verifyWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return _parseWebhookEvents(payload)
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private client(credentials: Credentials): NimbleClient {
    return new NimbleClient(credentials)
  }

  private page(params: QueryParams): number {
    const raw = params['page'] ?? params['cursor']
    return raw != null ? Number(raw) : 1
  }

  private perPage(params: QueryParams): number {
    return params.limit ?? DEFAULT_PAGE_SIZE
  }

  // ── Contacts ───────────────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const { items } = await this.client(credentials).list<RawNimbleContact>(
      '/contacts',
      'resources',
      { record_type: 'person', per_page: this.perPage(params), page: this.page(params) },
    )
    return items.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const raw = await this.client(credentials).get<RawNimbleContact>(`/contacts/${id}`)
    return transformContact(raw)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const raw = await this.client(credentials).post<RawNimbleContact>(
      '/contacts',
      untransformContact(data),
    )
    return transformContact(raw)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const raw = await this.client(credentials).put<RawNimbleContact>(
      `/contacts/${id}`,
      untransformContact(data),
    )
    return transformContact(raw)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/contacts/${id}`)
  }

  // ── Companies ─────────────────────────────────────────────────────────────

  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    const { items } = await this.client(credentials).list<RawNimbleCompany>(
      '/contacts',
      'resources',
      { record_type: 'company', per_page: this.perPage(params), page: this.page(params) },
    )
    return items.map(transformCompany)
  }

  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    const raw = await this.client(credentials).get<RawNimbleCompany>(`/contacts/${id}`)
    return transformCompany(raw)
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const raw = await this.client(credentials).post<RawNimbleCompany>(
      '/contacts',
      untransformCompany(data),
    )
    return transformCompany(raw)
  }

  async updateCompany(
    credentials: Credentials,
    id: string,
    data: Partial<Company>,
  ): Promise<Company> {
    const raw = await this.client(credentials).put<RawNimbleCompany>(
      `/contacts/${id}`,
      untransformCompany(data),
    )
    return transformCompany(raw)
  }

  async deleteCompany(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/contacts/${id}`)
  }

  // ── Deals ─────────────────────────────────────────────────────────────────

  /**
   * Nimble documents deals only under /api/v2. Its list, GET /api/v2/deals
   * ("Retrieves list of all user deals"), takes two query parameters, `sort`
   * (required) and `limit`, and no page or cursor, so rows past the first
   * `limit` cannot be reached. The /api/v1/deals path this method used is not
   * in the API reference. Refused before any request.
   */
  async listDeals(_credentials: Credentials, _params: QueryParams): Promise<Deal[]> {
    throw notSupported(
      "Nimble cannot list deals: the documented GET /api/v2/deals takes only 'sort' and 'limit' query parameters, with no page parameter, so deals past the first 'limit' cannot be reached",
    )
  }

  /**
   * GET /api/v1/deals/{id} is not in Nimble's API reference. The documented
   * read is GET /api/v2/deals/{deal_id} (Deals.DealView: deal_id,
   * fields_values_with_names, currency, …), which this adapter's deal
   * transform does not map. Refused before any request.
   */
  async getDeal(_credentials: Credentials, _id: string): Promise<Deal> {
    throw notSupported(
      'Nimble cannot get deals: GET /api/v1/deals/{id} is not in the API reference, and the documented GET /api/v2/deals/{deal_id} returns a DealView this adapter does not map',
    )
  }

  async createDeal(credentials: Credentials, data: Partial<Deal>): Promise<Deal> {
    const raw = await this.client(credentials).post<RawNimbleDeal>('/deals', untransformDeal(data))
    return transformDeal(raw)
  }

  async updateDeal(credentials: Credentials, id: string, data: Partial<Deal>): Promise<Deal> {
    const raw = await this.client(credentials).put<RawNimbleDeal>(
      `/deals/${id}`,
      untransformDeal(data),
    )
    return transformDeal(raw)
  }

  async deleteDeal(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/deals/${id}`)
  }

  // ── Pipelines (read-only) ─────────────────────────────────────────────────

  /**
   * GET /api/v2/deals/pipelines ("List deals pipelines"): no query
   * parameters, 200 "Success executing of retrieving all user pipelines"
   * with body { pipelines: [...] }. The whole collection in one response,
   * so it is paged locally.
   */
  async listPipelines(credentials: Credentials, params: QueryParams): Promise<Pipeline[]> {
    const res = await this.client(credentials).getV2<{ pipelines?: RawNimblePipeline[] }>(
      '/deals/pipelines',
    )
    const rows = Array.isArray(res.pipelines) ? res.pipelines : []
    return pageLocally(rows.map(transformPipeline), params)
  }

  /** GET /api/v2/deals/pipelines/{pipeline_id} ("Get deals' pipeline by id"). */
  async getPipeline(credentials: Credentials, id: string): Promise<Pipeline> {
    const raw = await this.client(credentials).getV2<RawNimblePipeline>(
      `/deals/pipelines/${encodeURIComponent(id)}`,
    )
    return transformPipeline(raw)
  }

  // ── Notes ─────────────────────────────────────────────────────────────────

  /**
   * Nimble has no account-wide note list. Notes are listed per contact:
   * GET /api/v1/contact/{contact_id}/notes ("Returns a list of notes for the
   * specified contact", query `page` and `per_page`, ended by `meta.page` reaching `meta.pages`).
   * So this walks GET /api/v1/contacts (every record type, `page` /
   * `per_page`, ended by `meta.page` reaching `meta.pages`) and, for each
   * contact on a page, every page of its notes. One upstream page of the
   * row pager is one page of contacts, and its cursor is that page number.
   *
   * A note linked to several contacts is listed under each of them; it is
   * served once, under the first contact in its `contacts` list.
   */
  async listNotes(credentials: Credentials, params: QueryParams): Promise<Note[]> {
    const client = this.client(credentials)
    const contactQuery = { record_type: 'all', per_page: CONTACTS_PAGE_SIZE }
    const key = cursorPagerKey(
      connectionScope(this.platform, credentials),
      'notes-by-contact',
      contactQuery,
    )
    const { items } = await pageByRows<Note, number>(key, params, async (cursor) => {
      const page = cursor ?? 1
      const contacts = await client.rawGet<NimbleContactsPage>('/contacts', {
        ...contactQuery,
        page,
      })
      const notes: Note[] = []
      for (const contact of contacts.resources ?? []) {
        for (let notePage = 1; ; notePage++) {
          const res = await client.rawGet<NimbleNotesPage>(
            `/contact/${encodeURIComponent(contact.id)}/notes`,
            { page: notePage },
          )
          const rows = res.resources ?? []
          for (const raw of rows) {
            const home = raw.contacts?.[0]?.id ?? contact.id
            if (home === contact.id) notes.push(transformNote(raw))
          }
          const { page: at, pages } = res.meta ?? {}
          // An empty page that still claims more pages ends the walk too.
          if (at === undefined || pages === undefined || at >= pages || rows.length === 0) break
        }
      }
      const { page: at, pages } = contacts.meta ?? {}
      return {
        items: notes,
        next: at !== undefined && pages !== undefined && at < pages ? page + 1 : undefined,
      }
    })
    return items
  }

  /** GET /api/v1/contacts/notes/{note_id} ("Returns note by id."). */
  async getNote(credentials: Credentials, id: string): Promise<Note> {
    const raw = await this.client(credentials).get<RawNimbleNote>(
      `/contacts/notes/${encodeURIComponent(id)}`,
    )
    return transformNote(raw)
  }

  async createNote(credentials: Credentials, data: Partial<Note>): Promise<Note> {
    const raw = await this.client(credentials).post<RawNimbleNote>('/notes', untransformNote(data))
    return transformNote(raw)
  }

  async deleteNote(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/notes/${id}`)
  }
}
