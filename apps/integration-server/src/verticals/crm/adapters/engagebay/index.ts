/**
 * EngageBay adapter for the CRM vertical.
 *
 * Maps the EngageBay REST API to canonical CRM resources.
 * Docs: https://github.com/engagebay/restapi
 *
 * ── Auth ─────────────────────────────────────────────────────────────────
 *   REST API key sent as `Authorization: {API_KEY}` header on every request.
 *   credentials.accessToken = REST API key
 *   (Account Admin Settings → API → REST API Key)
 *
 * ── Coverage ─────────────────────────────────────────────────────────────
 *
 * Implemented (18 methods across 5 resources):
 *   Contacts:  list, get, create, update, delete
 *   Companies: list, get, create, update, delete
 *   Deals:     list, get, create, delete
 *   Pipelines: list, get  (EngageBay "tracks")
 *   Activities: list, get, create, delete  (EngageBay "tasks")
 *   Notes:     create  (notes are retrieved per-contact via contacts API)
 *
 * Omitted — registry returns HTTP 501 automatically:
 *   updateDeal (EngageBay partial-update only changes track/milestone;
 *               full-field update not in public API)
 *   updateActivity (same — no documented full-update endpoint)
 *   updateNote / deleteNote / getNote / listNotes (not in public API)
 */

import {
  simpleApiKey,
  pageByCursor,
  cursorPagerKey,
  connectionScope,
  pageLocally,
  reportUpstreamPage,
} from '@opensteward/shared'
import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'
import type { Deal } from '../../schema/deal'
import type { Pipeline } from '../../schema/pipeline'
import type { Activity } from '../../schema/activity'
import type { Note } from '../../schema/note'
import type { WebhookEvent } from '../../schema/webhook'

import { EngageBayClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'
import { verifyWebhook as _verifyWebhook, parseWebhookEvents as _parseWebhookEvents } from './webhook'
import {
  transformContact,
  untransformContact,
  type RawEngageBayContact,
} from './transform/contact'
import {
  transformCompany,
  untransformCompany,
  type RawEngageBayCompany,
} from './transform/company'
import {
  transformDeal,
  untransformDeal,
  type RawEngageBayDeal,
} from './transform/deal'
import {
  transformPipeline,
  type RawEngageBayTrack,
} from './transform/pipeline'
import {
  transformActivity,
  untransformActivity,
  type RawEngageBayTask,
} from './transform/activity'
import {
  transformNote,
  untransformNote,
  type RawEngageBayNote,
} from './transform/note'

const SIMPLE_API_KEY_FORM = simpleApiKey({
  label: 'REST API Key',
  helpText: 'Found in EngageBay Account Settings → Admin Settings → API → REST API Key.',
})

export class EngagebayAdapter implements CrmAdapter {
  readonly platform = 'engagebay'
  readonly version = '0.1.0'
  /**
   * Every list either pages by cursor at the requested size (capped at the
   * documented 100) or slices the whole collection locally (tracks), so the
   * router may clamp a caller's limit to it.
   */
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  // Connect Link support — single API-key form.
  credentialFields = SIMPLE_API_KEY_FORM.credentialFields
  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    // EngageBay uses an API key, not OAuth2.
    return ''
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    // Caller passes the API key as `code`.
    return { accessToken: code }
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // API keys do not expire.
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

  private client(credentials: Credentials): EngageBayClient {
    return new EngageBayClient(credentials)
  }

  private pageSize(params: QueryParams): number {
    return Math.min(Number(params.limit ?? DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE)
  }

  /**
   * One caller page = one upstream page. Docs: "Paging can be applied using
   * the page_size and cursor query parameters. Cursor for the next page will
   * be in the last contact of the list. If there is no cursor, it means that
   * it is the end of list." Page 1 sends no cursor; page k starts at the
   * cursor the last row of page k-1 carried.
   */
  private async cursorPage<T extends Record<string, unknown>>(
    credentials: Credentials,
    path: string,
    params: QueryParams,
  ): Promise<T[]> {
    const size = this.pageSize(params)
    const key = cursorPagerKey(connectionScope('engagebay', credentials), path, { limit: size })
    const client = this.client(credentials)
    const { items, hasMore } = await pageByCursor<T>(key, params.page, async (cursor) => {
      const { items: rows, nextCursor } = await client.list<T>(path, size, cursor)
      return { items: rows, next: nextCursor }
    })
    reportUpstreamPage(params, { hasMore })
    return items
  }

  // ── Contacts ───────────────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const items = await this.cursorPage<RawEngageBayContact>(credentials, '/subscribers', params)
    return items.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const raw = await this.client(credentials).get<RawEngageBayContact>(
      `/subscribers/${id}`,
    )
    return transformContact(raw)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const raw = await this.client(credentials).post<RawEngageBayContact>(
      '/subscribers/subscriber',
      untransformContact(data),
    )
    return transformContact(raw)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const body = { id: Number(id), ...untransformContact(data) }
    const raw = await this.client(credentials).put<RawEngageBayContact>(
      '/subscribers/update-partial',
      body,
    )
    return transformContact(raw)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/subscribers/${id}`)
  }

  // ── Companies ──────────────────────────────────────────────────────────────

  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    const items = await this.cursorPage<RawEngageBayCompany>(credentials, '/companies', params)
    return items.map(transformCompany)
  }

  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    const raw = await this.client(credentials).get<RawEngageBayCompany>(
      `/companies/${id}`,
    )
    return transformCompany(raw)
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const raw = await this.client(credentials).post<RawEngageBayCompany>(
      '/companies/company',
      untransformCompany(data),
    )
    return transformCompany(raw)
  }

  async updateCompany(
    credentials: Credentials,
    id: string,
    data: Partial<Company>,
  ): Promise<Company> {
    const body = { id: Number(id), ...untransformCompany(data) }
    const raw = await this.client(credentials).put<RawEngageBayCompany>(
      '/companies/update-partial',
      body,
    )
    return transformCompany(raw)
  }

  async deleteCompany(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/companies/${id}`)
  }

  // ── Deals ──────────────────────────────────────────────────────────────────

  async listDeals(credentials: Credentials, params: QueryParams): Promise<Deal[]> {
    const items = await this.cursorPage<RawEngageBayDeal>(credentials, '/deals', params)
    return items.map(transformDeal)
  }

  async getDeal(credentials: Credentials, id: string): Promise<Deal> {
    const raw = await this.client(credentials).get<RawEngageBayDeal>(`/deals/${id}`)
    return transformDeal(raw)
  }

  async createDeal(credentials: Credentials, data: Partial<Deal>): Promise<Deal> {
    const raw = await this.client(credentials).post<RawEngageBayDeal>(
      '/deals/deal',
      untransformDeal(data),
    )
    return transformDeal(raw)
  }

  async deleteDeal(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/deals/${id}`)
  }

  // ── Pipelines (EngageBay "tracks") ─────────────────────────────────────────

  async listPipelines(credentials: Credentials, params: QueryParams): Promise<Pipeline[]> {
    // GET /tracks takes no paging parameters and returns every track: slice locally.
    const items = await this.client(credentials).get<RawEngageBayTrack[]>('/tracks')
    return pageLocally(Array.isArray(items) ? items : [], params).map(transformPipeline)
  }

  async getPipeline(credentials: Credentials, id: string): Promise<Pipeline> {
    const raw = await this.client(credentials).get<RawEngageBayTrack>(`/tracks/${id}`)
    return transformPipeline(raw)
  }

  // ── Activities (EngageBay "tasks") ─────────────────────────────────────────

  async listActivities(credentials: Credentials, params: QueryParams): Promise<Activity[]> {
    const items = await this.cursorPage<RawEngageBayTask>(credentials, '/tasks', params)
    return items.map(transformActivity)
  }

  async getActivity(credentials: Credentials, id: string): Promise<Activity> {
    const raw = await this.client(credentials).get<RawEngageBayTask>(`/tasks/${id}`)
    return transformActivity(raw)
  }

  async createActivity(credentials: Credentials, data: Partial<Activity>): Promise<Activity> {
    const raw = await this.client(credentials).post<RawEngageBayTask>(
      '/tasks',
      untransformActivity(data),
    )
    return transformActivity(raw)
  }

  async deleteActivity(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/tasks/${id}`)
  }

  // ── Notes ──────────────────────────────────────────────────────────────────
  // EngageBay notes are created globally; retrieval is per-contact via
  // GET /dev/api/panel/notes/{contactId}. Only create is exposed here.

  async createNote(credentials: Credentials, data: Partial<Note>): Promise<Note> {
    const raw = await this.client(credentials).post<RawEngageBayNote>(
      '/notes',
      untransformNote(data),
    )
    return transformNote(raw, data.contact_id)
  }
}
