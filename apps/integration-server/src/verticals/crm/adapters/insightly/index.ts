import { pageOffset, reportUpstreamPage, simpleApiKey } from '@opensteward/shared'
/**
 * Insightly adapter for the CRM vertical.
 *
 * Maps the Insightly REST API v3.1 to canonical CRM resources.
 * Docs: https://api.insightly.com/v3.1/Help
 *
 * ── Auth ──────────────────────────────────────────────────────────────────────
 *
 * HTTP Basic — `api_key:` (API key + colon) base64-encoded.
 *   credentials.accessToken = API key
 *
 * ── Coverage ─────────────────────────────────────────────────────────────────
 *
 * Implemented (32):
 *   Contacts:   list, get, create, update, delete
 *   Companies:  list, get, create, update, delete
 *   Deals:      list, get, create, update, delete
 *   Pipelines:  list, get
 *   Activities: list, get, create, update, delete  (Tasks)
 *   Notes:      list, get, create, update, delete
 *   Auth:       getAuthUrl (N/A — API key), exchangeCode (N/A), refreshCredentials (N/A)
 *   Webhooks:   verifyWebhook (always true — enterprise only), parseWebhookEvents
 *
 * Omitted (registry returns HTTP 501 automatically):
 *   (none — full coverage)
 */

import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { WebhookEvent } from '../../schema/webhook'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'
import type { Deal } from '../../schema/deal'
import type { Pipeline } from '../../schema/pipeline'
import type { Activity } from '../../schema/activity'
import type { Note } from '../../schema/note'

import { InsightlyClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'
import { verifyWebhook, parseWebhookEvents } from './webhook'
import {
  transformContact, untransformContact, type RawInsightlyContact,
} from './transform/contact'
import {
  transformCompany, untransformCompany, type RawInsightlyCompany,
} from './transform/company'
import {
  transformDeal, untransformDeal, type RawInsightlyDeal,
} from './transform/deal'
import {
  transformPipeline, type RawInsightlyPipeline,
} from './transform/pipeline'
import {
  transformActivity, untransformActivity, type RawInsightlyActivity,
} from './transform/activity'
import {
  transformNote, untransformNote, type RawInsightlyNote,
} from './transform/note'

export interface InsightlyAdapterConfig {
  /** API key (also credentials.accessToken at runtime). */
  apiKey?: string
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class InsightlyAdapter implements CrmAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  readonly platform = 'insightly'
  readonly version = '0.1.0'

  constructor(_config: InsightlyAdapterConfig = {}) {
    // Config values are provided at call time via credentials.
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    // API key auth — no OAuth redirect needed
    return '#insightly-api-key'
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('Insightly uses API key auth — exchangeCode is not applicable')
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

  private client(credentials: Credentials): InsightlyClient {
    return new InsightlyClient(credentials)
  }

  /**
   * One caller page of a v3.1 list endpoint: `top` is the caller's limit
   * clamped to the documented 1..500, `skip` is derived from the 1-based
   * `page` at that size, and `count_total=true` asks for X-Total-Count so
   * the end is exact. Without the header a short page is the end.
   */
  private async listPage<T>(
    credentials: Credentials,
    path: string,
    params: QueryParams,
  ): Promise<T[]> {
    const requested = params.limit ?? DEFAULT_PAGE_SIZE
    const top = Math.max(1, Math.min(Math.floor(requested), MAX_PAGE_SIZE))
    const skip = pageOffset(params, top)
    const { items, total } = await this.client(credentials).list<T>(path, {
      skip,
      top,
      count_total: true,
    })
    reportUpstreamPage(params, {
      pageSize: top,
      ...(total !== undefined
        ? { totalCount: total, hasMore: skip + items.length < total }
        : { hasMore: items.length >= top }),
    })
    return items
  }

  // ── Contacts ──────────────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const items = await this.listPage<RawInsightlyContact>(credentials, '/Contacts', params)
    return items.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const raw = await this.client(credentials).get<RawInsightlyContact>(`/Contacts/${id}`)
    return transformContact(raw)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const raw = await this.client(credentials).post<RawInsightlyContact>(
      '/Contacts',
      untransformContact(data),
    )
    return transformContact(raw)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const body = { ...untransformContact(data), CONTACT_ID: Number(id) }
    const raw = await this.client(credentials).put<RawInsightlyContact>(`/Contacts`, body)
    return transformContact(raw)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/Contacts/${id}`)
  }

  // ── Companies ─────────────────────────────────────────────────────────────

  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    const items = await this.listPage<RawInsightlyCompany>(credentials, '/Organisations', params)
    return items.map(transformCompany)
  }

  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    const raw = await this.client(credentials).get<RawInsightlyCompany>(`/Organisations/${id}`)
    return transformCompany(raw)
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const raw = await this.client(credentials).post<RawInsightlyCompany>(
      '/Organisations',
      untransformCompany(data),
    )
    return transformCompany(raw)
  }

  async updateCompany(
    credentials: Credentials,
    id: string,
    data: Partial<Company>,
  ): Promise<Company> {
    const body = { ...untransformCompany(data), ORGANISATION_ID: Number(id) }
    const raw = await this.client(credentials).put<RawInsightlyCompany>(`/Organisations`, body)
    return transformCompany(raw)
  }

  async deleteCompany(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/Organisations/${id}`)
  }

  // ── Deals ─────────────────────────────────────────────────────────────────

  async listDeals(credentials: Credentials, params: QueryParams): Promise<Deal[]> {
    const items = await this.listPage<RawInsightlyDeal>(credentials, '/Opportunities', params)
    return items.map(transformDeal)
  }

  async getDeal(credentials: Credentials, id: string): Promise<Deal> {
    const raw = await this.client(credentials).get<RawInsightlyDeal>(`/Opportunities/${id}`)
    return transformDeal(raw)
  }

  async createDeal(credentials: Credentials, data: Partial<Deal>): Promise<Deal> {
    const raw = await this.client(credentials).post<RawInsightlyDeal>(
      '/Opportunities',
      untransformDeal(data),
    )
    return transformDeal(raw)
  }

  async updateDeal(
    credentials: Credentials,
    id: string,
    data: Partial<Deal>,
  ): Promise<Deal> {
    const body = { ...untransformDeal(data), OPPORTUNITY_ID: Number(id) }
    const raw = await this.client(credentials).put<RawInsightlyDeal>(`/Opportunities`, body)
    return transformDeal(raw)
  }

  async deleteDeal(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/Opportunities/${id}`)
  }

  // ── Pipelines ─────────────────────────────────────────────────────────────

  async listPipelines(credentials: Credentials, params: QueryParams): Promise<Pipeline[]> {
    const items = await this.listPage<RawInsightlyPipeline>(credentials, '/Pipelines', params)
    return items.map(transformPipeline)
  }

  async getPipeline(credentials: Credentials, id: string): Promise<Pipeline> {
    const raw = await this.client(credentials).get<RawInsightlyPipeline>(`/Pipelines/${id}`)
    return transformPipeline(raw)
  }

  // ── Activities ────────────────────────────────────────────────────────────

  async listActivities(credentials: Credentials, params: QueryParams): Promise<Activity[]> {
    const items = await this.listPage<RawInsightlyActivity>(credentials, '/Tasks', params)
    return items.map(transformActivity)
  }

  async getActivity(credentials: Credentials, id: string): Promise<Activity> {
    const raw = await this.client(credentials).get<RawInsightlyActivity>(`/Tasks/${id}`)
    return transformActivity(raw)
  }

  async createActivity(credentials: Credentials, data: Partial<Activity>): Promise<Activity> {
    const raw = await this.client(credentials).post<RawInsightlyActivity>(
      '/Tasks',
      untransformActivity(data),
    )
    return transformActivity(raw)
  }

  async updateActivity(
    credentials: Credentials,
    id: string,
    data: Partial<Activity>,
  ): Promise<Activity> {
    const body = { ...untransformActivity(data), TASK_ID: Number(id) }
    const raw = await this.client(credentials).put<RawInsightlyActivity>(`/Tasks`, body)
    return transformActivity(raw)
  }

  async deleteActivity(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/Tasks/${id}`)
  }

  // ── Notes ─────────────────────────────────────────────────────────────────

  async listNotes(credentials: Credentials, params: QueryParams): Promise<Note[]> {
    const items = await this.listPage<RawInsightlyNote>(credentials, '/Notes', params)
    return items.map(transformNote)
  }

  async getNote(credentials: Credentials, id: string): Promise<Note> {
    const raw = await this.client(credentials).get<RawInsightlyNote>(`/Notes/${id}`)
    return transformNote(raw)
  }

  async createNote(credentials: Credentials, data: Partial<Note>): Promise<Note> {
    const raw = await this.client(credentials).post<RawInsightlyNote>(
      '/Notes',
      untransformNote(data),
    )
    return transformNote(raw)
  }

  async updateNote(
    credentials: Credentials,
    id: string,
    data: Partial<Note>,
  ): Promise<Note> {
    const body = { ...untransformNote(data), NOTE_ID: Number(id) }
    const raw = await this.client(credentials).put<RawInsightlyNote>(`/Notes`, body)
    return transformNote(raw)
  }

  async deleteNote(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/Notes/${id}`)
  }
}
