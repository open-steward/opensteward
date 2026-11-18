import {
  simpleApiKey,
  pageByCursor,
  cursorPagerKey,
  connectionScope,
  pageLocally,
  reportUpstreamPage,
} from '@opensteward/shared'
/**
 * AgileCRM adapter for the CRM vertical.
 *
 * Maps the AgileCRM REST API v2 to canonical CRM resources.
 * Docs: https://github.com/agilecrm/rest-api
 *
 * ── Auth ──────────────────────────────────────────────────────────────────────
 *
 * HTTP Basic — `email:api_key` base64-encoded.
 *   credentials.accessToken  = API key
 *   credentials.extra.email  = user email
 *   credentials.extra.domain = account domain (e.g. "mycompany")
 *
 * ── Coverage ─────────────────────────────────────────────────────────────────
 *
 * Implemented:
 *   Contacts:   list, get, create, update, delete
 *   Companies:  list, get, create, update, delete
 *   Deals:      list, get, create, update, delete
 *   Pipelines:  list, get (simulated by filtering list)
 *   Notes:      list, create, delete  (per-contact; no API-level get/update)
 *   Auth:       getAuthUrl (N/A — API key), exchangeCode (N/A), refreshCredentials (N/A)
 *   Webhooks:   verifyWebhook (always true — no signing), parseWebhookEvents
 *
 * Refused with 501 NOT_SUPPORTED: Activities list (no documented endpoint).
 *
 * Omitted (registry returns HTTP 501 automatically):
 *   Activities: get, create, update, delete
 *   Notes:      get, update
 */

import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { WebhookEvent } from '../../schema/webhook'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'
import type { Deal } from '../../schema/deal'
import type { Pipeline } from '../../schema/pipeline'
import type { Activity } from '../../schema/activity'
import type { Note } from '../../schema/note'

import { AgileCrmClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'
import { verifyWebhook, parseWebhookEvents } from './webhook'
import { transformContact, untransformContact, type RawAgileCrmContact } from './transform/contact'
import { transformCompany, untransformCompany, type RawAgileCrmCompany } from './transform/company'
import { transformDeal, untransformDeal, type RawAgileCrmDeal } from './transform/deal'
import { transformPipeline, type RawAgileCrmPipeline } from './transform/pipeline'
import { transformNote, untransformNote, type RawAgileCrmNote } from './transform/note'

export interface AgileCrmAdapterConfig {
  /** User email (also stored in credentials.extra.email at runtime). */
  email?: string
  /** API key (also credentials.accessToken at runtime). */
  apiKey?: string
  /** Account domain, e.g. "mycompany" for mycompany.agilecrm.com. */
  domain?: string
}
const SIMPLE_API_KEY_FORM = simpleApiKey()

export class AgileCrmAdapter implements CrmAdapter {
  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'agilecrm'
  readonly version = '0.1.0'

  constructor(_config: AgileCrmAdapterConfig = {}) {
    // Config values are provided at call time via credentials.
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    // API key auth — no OAuth redirect needed
    return '#agilecrm-api-key'
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('AgileCRM uses API key auth — exchangeCode is not applicable')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // API keys do not expire
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

  private client(credentials: Credentials): AgileCrmClient {
    return new AgileCrmClient(credentials)
  }

  /**
   * One caller page of a cursor-paged collection (contacts, deals, companies).
   *
   * Docs: "Paging can be applied using the page_size and cursor query
   * parameters. ... Cursor for the next page will be in the last contact of
   * the list. If there is no cursor, it means that it is the end of list."
   * Page 1 carries no cursor; each later page starts at the cursor the last
   * row of the page before it carried. `fetchPage` sends `page_size` and the
   * cursor the way the endpoint documents them (query string or form body).
   */
  private async cursorPage<T>(
    credentials: Credentials,
    path: string,
    params: QueryParams,
    fetchPage: (pageSize: number, cursor: string | undefined) => Promise<T[]>,
  ): Promise<T[]> {
    const pageSize = params.limit ?? DEFAULT_PAGE_SIZE
    const domain = (credentials.extra?.['domain'] as string | undefined) ?? ''
    const key = cursorPagerKey(connectionScope(`agilecrm:${domain}`, credentials), path, {
      limit: pageSize,
    })
    const { items, hasMore } = await pageByCursor<T>(key, params.page, async (cursor) => {
      const rows = await fetchPage(pageSize, cursor)
      const last = rows[rows.length - 1] as { cursor?: unknown } | undefined
      const next = typeof last?.cursor === 'string' && last.cursor !== '' ? last.cursor : undefined
      return { items: rows, next }
    })
    reportUpstreamPage(params, { hasMore })
    return items
  }

  // ── Contacts ──────────────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = this.client(credentials)
    const items = await this.cursorPage<RawAgileCrmContact>(
      credentials,
      '/contacts',
      params,
      (pageSize, cursor) => client.list('/contacts', { page_size: pageSize, cursor }),
    )
    return items.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const raw = await this.client(credentials).get<RawAgileCrmContact>(`/contacts/${id}`)
    return transformContact(raw)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const raw = await this.client(credentials).post<RawAgileCrmContact>(
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
    const body = { ...untransformContact(data), id: Number(id) }
    const raw = await this.client(credentials).put<RawAgileCrmContact>('/contacts/edit', body)
    return transformContact(raw)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/contacts/${id}`)
  }

  // ── Companies ─────────────────────────────────────────────────────────────

  /**
   * Docs 2.3 "Get list of companies": `dev/api/contacts/companies/list`,
   * Method: POST. "Page_size,global_sort_key and cursor should be sent as a
   * form parameter (Content-Type: application/x-www-form-urlencoded ).Paging
   * can be applied using the page_size and cursor form parameters. Cursor for
   * the next page will be in the last company of the list." The sort key is
   * the one the documented example sends (`global_sort_key=-created_time`).
   */
  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    const client = this.client(credentials)
    const path = '/contacts/companies/list'
    const items = await this.cursorPage<RawAgileCrmCompany>(
      credentials,
      path,
      params,
      (pageSize, cursor) =>
        client.listByForm(path, {
          page_size: String(pageSize),
          global_sort_key: '-created_time',
          ...(cursor !== undefined ? { cursor } : {}),
        }),
    )
    return items.map(transformCompany)
  }

  /**
   * Docs 2.4 "Get company by ID": `dev/api/contacts/{id}`, Method: GET.
   * Companies and people share that path; `type` "distinguishes a contact and
   * a company", so a PERSON id is not a company.
   */
  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    const raw = await this.client(credentials).get<RawAgileCrmCompany>(
      `/contacts/${encodeURIComponent(id)}`,
    )
    if (raw.type !== 'COMPANY') {
      throw Object.assign(new Error(`AgileCRM: company ${id} not found`), { statusCode: 404 })
    }
    return transformCompany(raw)
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const raw = await this.client(credentials).post<RawAgileCrmCompany>(
      '/companies',
      untransformCompany(data),
    )
    return transformCompany(raw)
  }

  async updateCompany(
    credentials: Credentials,
    id: string,
    data: Partial<Company>,
  ): Promise<Company> {
    const body = { ...untransformCompany(data), id: Number(id) }
    const raw = await this.client(credentials).put<RawAgileCrmCompany>('/companies/edit', body)
    return transformCompany(raw)
  }

  async deleteCompany(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/companies/${id}`)
  }

  // ── Deals ─────────────────────────────────────────────────────────────────

  async listDeals(credentials: Credentials, params: QueryParams): Promise<Deal[]> {
    const client = this.client(credentials)
    const items = await this.cursorPage<RawAgileCrmDeal>(
      credentials,
      '/opportunity',
      params,
      (pageSize, cursor) => client.list('/opportunity', { page_size: pageSize, cursor }),
    )
    return items.map(transformDeal)
  }

  async getDeal(credentials: Credentials, id: string): Promise<Deal> {
    const raw = await this.client(credentials).get<RawAgileCrmDeal>(`/opportunity/${id}`)
    return transformDeal(raw)
  }

  async createDeal(credentials: Credentials, data: Partial<Deal>): Promise<Deal> {
    const raw = await this.client(credentials).post<RawAgileCrmDeal>(
      '/opportunity',
      untransformDeal(data),
    )
    return transformDeal(raw)
  }

  async updateDeal(credentials: Credentials, id: string, data: Partial<Deal>): Promise<Deal> {
    const body = { ...untransformDeal(data), id: Number(id) }
    const raw = await this.client(credentials).put<RawAgileCrmDeal>('/opportunity', body)
    return transformDeal(raw)
  }

  async deleteDeal(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/opportunity/${id}`)
  }

  // ── Pipelines ─────────────────────────────────────────────────────────────

  async listPipelines(credentials: Credentials, params: QueryParams): Promise<Pipeline[]> {
    // Not paginated upstream ("Gets all the tracks."): slice the whole list.
    const items = await this.client(credentials).list<RawAgileCrmPipeline>('/milestone/pipelines')
    return pageLocally(items, params).map(transformPipeline)
  }

  async getPipeline(credentials: Credentials, id: string): Promise<Pipeline> {
    const all = await this.client(credentials).list<RawAgileCrmPipeline>('/milestone/pipelines')
    const found = all.find((p) => String(p.id) === id)
    if (!found) {
      throw Object.assign(new Error(`AgileCRM: pipeline ${id} not found`), { statusCode: 404 })
    }
    return transformPipeline(found)
  }

  // ── Activities ────────────────────────────────────────────────────────────

  /**
   * The REST API reference (github.com/agilecrm/rest-api) documents no
   * activity or activity-log resource: its sections are Contacts, Deals,
   * Notes, Tasks, Events, Track / Milestones, Campaigns, Documents, Help Desks
   * and Dynamic Filters, and "activit" occurs nowhere in it. The former
   * `/activitylog` path appears nowhere in it or in the official SDKs.
   */
  async listActivities(_credentials: Credentials, _params: QueryParams): Promise<Activity[]> {
    throw Object.assign(
      new Error(
        'AgileCRM cannot list activities: the REST API documents no activity or activity-log endpoint',
      ),
      { statusCode: 501, code: 'NOT_SUPPORTED' },
    )
  }

  // ── Notes ─────────────────────────────────────────────────────────────────

  async listNotes(credentials: Credentials, params: QueryParams): Promise<Note[]> {
    const contactId = params['contact_id']
    if (!contactId) {
      throw new Error('AgileCRM listNotes: contact_id is required')
    }
    const items = await this.client(credentials).list<RawAgileCrmNote>(
      `/contacts/${String(contactId)}/notes`,
    )
    return items.map(transformNote)
  }

  async createNote(credentials: Credentials, data: Partial<Note>): Promise<Note> {
    if (!data.contact_id) {
      throw new Error('AgileCRM createNote: contact_id is required')
    }
    const raw = await this.client(credentials).post<RawAgileCrmNote>(
      `/contacts/${data.contact_id}/notes`,
      untransformNote(data),
    )
    return transformNote(raw)
  }

  async deleteNote(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/notes/${id}`)
  }
}
