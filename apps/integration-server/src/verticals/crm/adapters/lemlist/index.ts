/**
 * lemlist adapter for the CRM vertical.
 *
 * Maps the lemlist REST API (https://api.lemlist.com/api) to canonical
 * CRM resources.
 * Docs: https://developer.lemlist.com/api-reference/getting-started/overview
 *
 * ── Auth ─────────────────────────────────────────────────────────────────
 *   HTTP Basic — empty username + API key as password.
 *   credentials.accessToken = API key
 *
 * ── Resource coverage ──────────────────────────────────────────────────
 * Unavailable: deal — lemlist is an email outreach tool with no deals/opportunities concept
 *
 * ── Coverage ─────────────────────────────────────────────────────────────
 *
 * Implemented (10):
 *   Contacts  : list, get, create, update, delete
 *   Pipelines : list, get  (mapped from lemlist Campaigns)
 *   Activities: list       (mapped from lemlist Activity history)
 *   Companies : list, get, create, update
 *   Notes     : list, create  (company-scoped; GET /companies/{id}/notes)
 */

import {
  connectionScope,
  cursorPagerKey,
  pageByRows,
  pageOffset,
  reportUpstreamPage,
  simpleApiKey,
  type UpstreamPageMeta,
} from '@opensteward/shared'
import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'
import type { Pipeline } from '../../schema/pipeline'
import type { Activity } from '../../schema/activity'
import type { Note } from '../../schema/note'
import type { WebhookEvent } from '../../schema/webhook'

import { LemlistClient } from './client'
import {
  COMPANIES_MAX_PAGE_SIZE,
  CONTACTS_MAX_PAGE_SIZE,
  DEFAULT_PAGE_SIZE,
  LIST_MAX_PAGE_SIZE,
} from './constants'
import { verifyWebhook as _verifyWebhook, parseWebhookEvents as _parseWebhookEvents } from './webhook'
import {
  transformContact,
  untransformContact,
  type RawLemlistContact,
} from './transform/contact'
import {
  transformCampaignAsPipeline,
  type RawLemlistCampaign,
} from './transform/pipeline'
import {
  transformActivity,
  type RawLemlistActivity,
} from './transform/activity'
import {
  transformCompany,
  type RawLemlistCompany,
} from './transform/company'
import {
  transformNote,
  type RawLemlistNote,
} from './transform/note'

const SIMPLE_API_KEY_FORM = simpleApiKey({
  label: 'API key',
  helpText: 'Find your API key in lemlist Settings → Integrations → API.',
})

/** Paginated companies response from GET /companies */
interface LemlistCompaniesPage {
  data: RawLemlistCompany[]
  total: number
  limit: number
  offset: number
}

/** Paginated notes response from GET /companies/{id}/notes */
interface LemlistNotesPage {
  data: RawLemlistNote[]
  total?: number
}

/**
 * A position in the flattened notes stream: a batch of company ids from
 * GET /companies at `companyOffset`, and the notes page of the first of them.
 * It carries the ids so fetching it again returns the same page.
 */
interface NotesCursor {
  companyOffset: number
  ids?: string[]
  /** More companies after this batch. */
  more?: boolean
  /** Rows the batch held: the next batch starts this far past `companyOffset`. */
  batchSize?: number
  page: number
}

export class LemlistAdapter implements CrmAdapter {
  // Connect Link support — single API-key form.
  credentialFields = SIMPLE_API_KEY_FORM.credentialFields
  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'lemlist'
  readonly version = '0.1.0'
  /**
   * The ceiling every list endpoint honours. /contacts and /companies take
   * up to 500, but /campaigns, /activities and /companies/{id}/notes each
   * document "Default: 100. Maximum: 100".
   */
  readonly capabilities = { maxPageSize: LIST_MAX_PAGE_SIZE }

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    // lemlist uses API key auth, not OAuth2.
    return ''
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    // API-key flow: code carries the API key directly.
    return { accessToken: code }
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  // ── Webhooks ───────────────────────────────────────────────────────────────

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return _verifyWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return _parseWebhookEvents(payload)
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private client(credentials: Credentials): LemlistClient {
    return new LemlistClient(credentials)
  }

  /** The caller's page size, and the size sent upstream: clamped to `max`. */
  private sizes(params: QueryParams, max: number): { asked: number; size: number } {
    const n = Math.floor(Number(params.limit ?? DEFAULT_PAGE_SIZE))
    const asked = Number.isFinite(n) && n >= 1 ? n : DEFAULT_PAGE_SIZE
    return { asked, size: Math.min(asked, max) }
  }

  /**
   * One caller page of an endpoint that pages by `offset` + `limit` and
   * answers with `{ data, total, limit, offset }` (GET /contacts, GET
   * /companies). The caller's page is one upstream page at offset
   * (page - 1) × size, and `total` makes `hasMore` exact.
   */
  private async pageEnvelope<R>(
    credentials: Credentials,
    path: string,
    params: QueryParams,
    max: number,
  ): Promise<R[]> {
    const { asked, size } = this.sizes(params, max)
    const offset = pageOffset(params, size)
    const res = await this.client(credentials).get<{ data?: R[]; total?: number } | R[]>(path, {
      limit: size,
      offset,
    })
    const items = Array.isArray(res) ? res : (res?.data ?? [])
    const total = Array.isArray(res) ? undefined : res?.total
    const meta: UpstreamPageMeta = {}
    if (typeof total === 'number') {
      meta.totalCount = total
      meta.hasMore = offset + items.length < total
    } else if (items.length < size) {
      meta.hasMore = false
    }
    if (size < asked) meta.pageSize = size
    reportUpstreamPage(params, meta)
    return items
  }

  /**
   * One caller page of an endpoint that pages by `offset` + `limit` and
   * answers with a bare array (GET /campaigns, GET /activities), so a short
   * page is the only end signal. The row pager cuts the caller's rows and
   * peeks past a page that ends exactly on a boundary, so `hasMore` is exact.
   */
  private async pageBareArray<R>(
    credentials: Credentials,
    collection: string,
    path: string,
    params: QueryParams,
    extra: Record<string, unknown> = {},
  ): Promise<R[]> {
    const { size } = this.sizes(params, LIST_MAX_PAGE_SIZE)
    const key = cursorPagerKey(connectionScope('lemlist', credentials), collection, {
      ...extra,
      limit: size,
    })
    const r = await pageByRows<R, number>(
      key,
      params,
      async (cursor) => {
        const offset = cursor ?? 0
        const res = await this.client(credentials).get<R[] | { data?: R[] }>(path, {
          limit: size,
          offset,
          ...extra,
        })
        const items = Array.isArray(res) ? res : (res?.data ?? [])
        return { items, next: items.length < size ? null : offset + size }
      },
      { defaultLimit: DEFAULT_PAGE_SIZE },
    )
    return r.items
  }

  // ── Contacts ──────────────────────────────────────────────────────────────
  // GET /contacts — paginated with offset + limit

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    // Called without idsOrEmails, the endpoint returns a paginated envelope.
    const items = await this.pageEnvelope<RawLemlistContact>(
      credentials,
      '/contacts',
      params,
      CONTACTS_MAX_PAGE_SIZE,
    )
    return items.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    // GET /contacts/{idOrEmail} returns a single Contact object.
    const raw = await this.client(credentials).get<RawLemlistContact>(`/contacts/${encodeURIComponent(id)}`)
    return transformContact(raw)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const body = untransformContact(data)
    const raw = await this.client(credentials).post<RawLemlistContact>('/contacts', body)
    return transformContact(raw)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    // lemlist uses POST /contacts as an upsert — contactId identifies the record to update.
    const body = { ...untransformContact(data), contactId: id }
    const raw = await this.client(credentials).post<RawLemlistContact>('/contacts', body)
    return transformContact(raw)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/contacts/${id}`)
  }

  // ── Pipelines (mapped from lemlist Campaigns) ─────────────────────────────
  // GET /campaigns returns an array of campaign objects.

  async listPipelines(credentials: Credentials, params: QueryParams): Promise<Pipeline[]> {
    // offset: "Offset from the start. For pagination."; limit "Maximum: 100."
    const items = await this.pageBareArray<RawLemlistCampaign>(
      credentials,
      'campaigns',
      '/campaigns',
      params,
    )
    return items.map(transformCampaignAsPipeline)
  }

  async getPipeline(credentials: Credentials, id: string): Promise<Pipeline> {
    const raw = await this.client(credentials).get<RawLemlistCampaign>(`/campaigns/${id}`)
    return transformCampaignAsPipeline(raw)
  }

  // ── Activities ────────────────────────────────────────────────────────────
  // GET /activities — paginated with offset + limit

  async listActivities(credentials: Credentials, params: QueryParams): Promise<Activity[]> {
    // version=v2 is required by the API to get the current activities schema.
    // offset: "increment offset by the limit value on each request".
    const items = await this.pageBareArray<RawLemlistActivity>(
      credentials,
      'activities',
      '/activities',
      params,
      { version: 'v2' },
    )
    return items.map(transformActivity)
  }

  // ── Companies ─────────────────────────────────────────────────────────────
  // GET /companies — paginated with offset + limit

  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    const items = await this.pageEnvelope<RawLemlistCompany>(
      credentials,
      '/companies',
      params,
      COMPANIES_MAX_PAGE_SIZE,
    )
    return items.map(transformCompany)
  }

  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    // Pass the single ID via idsOrDomains; the API returns the paginated envelope.
    const res = await this.client(credentials).get<LemlistCompaniesPage>(
      '/companies',
      { idsOrDomains: id, limit: 1 },
    )
    const raw = res.data?.[0]
    if (!raw) throw Object.assign(new Error(`lemlist company not found: ${id}`), { statusCode: 404 })
    return transformCompany(raw)
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const body: Record<string, unknown> = {}
    if (data.name !== undefined) body.name = data.name
    if (data.domain !== undefined) body.domain = data.domain
    if (data.industry !== undefined) body.industry = data.industry
    const res = await this.client(credentials).post<{ data: RawLemlistCompany }>('/companies', body)
    return transformCompany(res.data)
  }

  async updateCompany(
    credentials: Credentials,
    id: string,
    data: Partial<Company>,
  ): Promise<Company> {
    // lemlist uses POST /companies as an upsert — companyId identifies the record to update.
    const body: Record<string, unknown> = { companyId: id }
    if (data.name !== undefined) body.name = data.name
    if (data.domain !== undefined) body.domain = data.domain
    if (data.industry !== undefined) body.industry = data.industry
    const res = await this.client(credentials).post<{ data: RawLemlistCompany }>('/companies', body)
    return transformCompany(res.data)
  }

  // ── Notes (company-scoped) ────────────────────────────────────────────────
  // GET  /companies/{companyId}/notes — paginated (page + limit)
  // POST /companies/{companyId}/notes — create a note on a company
  //
  // lemlist has no standalone notes or contact-level notes endpoint.
  // We iterate over all known companies to build a flat list of notes.
  // callers may pass a `company_id` query param to scope to a single company.

  async listNotes(credentials: Credentials, params: QueryParams): Promise<Note[]> {
    const companyId = params['company_id'] as string | undefined

    if (companyId) {
      // Fast path: company scoped. page: "Page number to retrieve";
      // limit: "Maximum: 100". The 200 is { data, total }.
      const { asked, size } = this.sizes(params, LIST_MAX_PAGE_SIZE)
      const page = Number(params.page ?? 1)
      const res = await this.client(credentials).get<LemlistNotesPage>(
        `/companies/${encodeURIComponent(companyId)}/notes`,
        { page, limit: size },
      )
      const items = res?.data ?? []
      const meta: UpstreamPageMeta = {}
      if (typeof res?.total === 'number') {
        meta.totalCount = res.total
        meta.hasMore = pageOffset(params, size) + items.length < res.total
      } else if (items.length < size) {
        meta.hasMore = false
      }
      if (size < asked) meta.pageSize = size
      reportUpstreamPage(params, meta)
      return items.map(transformNote)
    }

    // Slow path: lemlist has no team-wide notes list, so walk the companies
    // (offset + limit, { data, total }) and each company's notes (page +
    // limit, { data, total }) as one stream of rows, and cut the caller's
    // page out of it. One upstream page here is one page of one company's notes.
    const key = cursorPagerKey(connectionScope('lemlist', credentials), 'notes', {
      companies: COMPANIES_MAX_PAGE_SIZE,
      notes: LIST_MAX_PAGE_SIZE,
    })
    const r = await pageByRows<Note, NotesCursor>(
      key,
      params,
      async (cursor) => {
        let at: NotesCursor = cursor ?? { companyOffset: 0, page: 1 }
        if (!at.ids) {
          const companies = await this.client(credentials).get<LemlistCompaniesPage>(
            '/companies',
            { limit: COMPANIES_MAX_PAGE_SIZE, offset: at.companyOffset },
          )
          const batch = (companies?.data ?? []).map((c) => String(c._id))
          if (batch.length === 0) return { items: [], next: null }
          const more =
            typeof companies?.total === 'number'
              ? at.companyOffset + batch.length < companies.total
              : batch.length === COMPANIES_MAX_PAGE_SIZE
          at = {
            companyOffset: at.companyOffset,
            ids: batch,
            more,
            batchSize: batch.length,
            page: 1,
          }
        }
        const ids = at.ids as string[]
        const res = await this.client(credentials).get<LemlistNotesPage>(
          `/companies/${encodeURIComponent(ids[0] as string)}/notes`,
          { page: at.page, limit: LIST_MAX_PAGE_SIZE },
        )
        const rows = res?.data ?? []
        const moreNotes =
          typeof res?.total === 'number'
            ? at.page * LIST_MAX_PAGE_SIZE < res.total && rows.length > 0
            : rows.length === LIST_MAX_PAGE_SIZE
        let next: NotesCursor | null
        if (moreNotes) next = { ...at, page: at.page + 1 }
        else if (ids.length > 1) next = { ...at, ids: ids.slice(1), page: 1 }
        else if (at.more)
          // Advance by the companies actually returned, not the size asked
          // for: a batch cut short by the server must not skip the rest.
          next = { companyOffset: at.companyOffset + (at.batchSize ?? ids.length), page: 1 }
        else next = null
        return { items: rows.map(transformNote), next }
      },
      { defaultLimit: DEFAULT_PAGE_SIZE },
    )
    return r.items
  }

  async createNote(credentials: Credentials, data: Partial<Note>): Promise<Note> {
    if (!data.company_id) {
      throw new Error('lemlist notes require company_id — lemlist only supports company-scoped notes')
    }
    const body = { note: data.content ?? '' }
    const raw = await this.client(credentials).post<RawLemlistNote>(
      `/companies/${encodeURIComponent(data.company_id)}/notes`,
      body,
    )
    return transformNote(raw)
  }
}
