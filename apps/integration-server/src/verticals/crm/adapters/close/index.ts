import {
  callerLimit,
  pageLocally,
  pageOffset,
  reportUpstreamPage,
  simpleApiKey,
} from '@opensteward/shared'
/**
 * Close adapter for the CRM vertical.
 *
 * Maps the Close REST API v1 to canonical CRM resources.
 * Docs: https://developer.close.com/
 *
 * ── Coverage ─────────────────────────────────────────────────────────────
 *
 * Implemented (22):
 *   Contacts:   list, get, create, update, delete
 *   Companies:  list, get, create, update, delete  (Close Lead = Company)
 *   Deals:      list, get, create, update, delete  (Close Opportunity = Deal)
 *   Pipelines:  list, get
 *   Activities: list, get                          (read-only — type-specific fields vary)
 *   Notes:      list, get, create, delete
 *
 * Omitted (6) — registry returns HTTP 501 automatically:
 *   Activities create/update/delete — each activity type (call, email, SMS,
 *     meeting, task) requires distinct request shapes; generic create is
 *     ambiguous and would produce incorrect results.
 *   Notes update — Close does not expose a PUT /activity/note/{id} endpoint.
 */

import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'
import type { Deal } from '../../schema/deal'
import type { Pipeline } from '../../schema/pipeline'
import type { Activity } from '../../schema/activity'
import type { Note } from '../../schema/note'
import type { WebhookEvent } from '../../schema/webhook'

import { CloseClient } from './client'
import { verifyWebhook as _verifyWebhook, parseWebhookEvents as _parseWebhookEvents } from './webhook'
import {
  transformContact,
  untransformContact,
  type RawCloseContact,
} from './transform/contact'
import {
  transformCompany,
  untransformCompany,
  type RawCloseLead,
} from './transform/company'
import {
  transformDeal,
  untransformDeal,
  type RawCloseOpportunity,
} from './transform/deal'
import {
  transformPipeline,
  type RawClosePipeline,
} from './transform/pipeline'
import {
  transformActivity,
  type RawCloseActivity,
} from './transform/activity'
import {
  transformNote,
  untransformNote,
  type RawCloseNote,
} from './transform/note'

export interface CloseAdapterConfig {
  /** Close API key — used as HTTP Basic auth username with an empty password. */
  apiKey?: string
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class CloseAdapter implements CrmAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'close'
  readonly version = '0.1.0'

  private apiKey: string | undefined

  constructor(config: CloseAdapterConfig = {}) {
    this.apiKey = config.apiKey
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    // Close uses API key authentication, not OAuth2.
    return '#close-api-key'
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    return { accessToken: this.apiKey ?? '' }
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

  private client(credentials: Credentials): CloseClient {
    const effective: Credentials = this.apiKey
      ? { accessToken: this.apiKey }
      : credentials
    return new CloseClient(effective)
  }

  /**
   * One caller page of an offset collection. Close documents `_limit` and
   * "`_skip` (integer, optional, default: 0) — Number of results to skip
   * before returning, for pagination." on contact, lead, opportunity, activity
   * and note, and answers `has_more` (opportunities also `total_results`).
   * No per-resource maximum `_limit` is documented, so the caller's limit is
   * sent as is.
   */
  private async listPage<T>(
    credentials: Credentials,
    path: string,
    params: QueryParams,
  ): Promise<T[]> {
    const size = callerLimit(params)
    const { items, hasMore, totalResults } = await this.client(credentials).list<T>(path, {
      _limit: size,
      _skip: pageOffset(params, size),
    })
    reportUpstreamPage(params, {
      ...(hasMore !== undefined ? { hasMore } : {}),
      ...(totalResults !== undefined ? { totalCount: totalResults } : {}),
    })
    return items
  }

  // ── Contacts ──────────────────────────────────────────────────────────────
  // Close exposes contacts at /contact/ directly (not embedded in leads)

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const items = await this.listPage<RawCloseContact>(credentials, '/contact/', params)
    return items.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const raw = await this.client(credentials).get<RawCloseContact>(`/contact/${id}/`)
    return transformContact(raw)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const body = untransformContact(data)
    if (!body.name && (data.first_name || data.last_name)) {
      body.name = [data.first_name, data.last_name].filter(Boolean).join(' ')
    }
    const raw = await this.client(credentials).post<RawCloseContact>('/contact/', body)
    return transformContact(raw)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const raw = await this.client(credentials).put<RawCloseContact>(
      `/contact/${id}/`,
      untransformContact(data),
    )
    return transformContact(raw)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/contact/${id}/`)
  }

  // ── Companies (Leads) ─────────────────────────────────────────────────────
  // In Close, a Lead is the top-level entity and maps to canonical Company.

  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    const items = await this.listPage<RawCloseLead>(credentials, '/lead/', params)
    return items.map(transformCompany)
  }

  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    const raw = await this.client(credentials).get<RawCloseLead>(`/lead/${id}/`)
    return transformCompany(raw)
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const raw = await this.client(credentials).post<RawCloseLead>(
      '/lead/',
      untransformCompany(data),
    )
    return transformCompany(raw)
  }

  async updateCompany(
    credentials: Credentials,
    id: string,
    data: Partial<Company>,
  ): Promise<Company> {
    const raw = await this.client(credentials).put<RawCloseLead>(
      `/lead/${id}/`,
      untransformCompany(data),
    )
    return transformCompany(raw)
  }

  async deleteCompany(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/lead/${id}/`)
  }

  // ── Deals (Opportunities) ─────────────────────────────────────────────────

  async listDeals(credentials: Credentials, params: QueryParams): Promise<Deal[]> {
    const items = await this.listPage<RawCloseOpportunity>(credentials, '/opportunity/', params)
    return items.map(transformDeal)
  }

  async getDeal(credentials: Credentials, id: string): Promise<Deal> {
    const raw = await this.client(credentials).get<RawCloseOpportunity>(`/opportunity/${id}/`)
    return transformDeal(raw)
  }

  async createDeal(credentials: Credentials, data: Partial<Deal>): Promise<Deal> {
    const raw = await this.client(credentials).post<RawCloseOpportunity>(
      '/opportunity/',
      untransformDeal(data),
    )
    return transformDeal(raw)
  }

  async updateDeal(
    credentials: Credentials,
    id: string,
    data: Partial<Deal>,
  ): Promise<Deal> {
    const raw = await this.client(credentials).put<RawCloseOpportunity>(
      `/opportunity/${id}/`,
      untransformDeal(data),
    )
    return transformDeal(raw)
  }

  async deleteDeal(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/opportunity/${id}/`)
  }

  // ── Pipelines ─────────────────────────────────────────────────────────────

  async listPipelines(credentials: Credentials, params: QueryParams): Promise<Pipeline[]> {
    // GET /pipeline/ documents no query parameters: it returns every pipeline,
    // so it is fetched whole and paged here. The response still carries
    // has_more; if it is ever true the list is not whole, and a local slice
    // would silently drop rows, so fail loudly instead.
    const { items, hasMore } = await this.client(credentials).list<RawClosePipeline>('/pipeline/')
    if (hasMore) {
      throw Object.assign(
        new Error('Close /pipeline/ answered has_more=true, but documents no paging parameters'),
        { statusCode: 502, code: 'UPSTREAM_ERROR' },
      )
    }
    return pageLocally(items.map(transformPipeline), params)
  }

  async getPipeline(credentials: Credentials, id: string): Promise<Pipeline> {
    const raw = await this.client(credentials).get<RawClosePipeline>(`/pipeline/${id}/`)
    return transformPipeline(raw)
  }

  // ── Activities ────────────────────────────────────────────────────────────
  // List and get only — create/update/delete omitted due to type-specific complexity.

  async listActivities(credentials: Credentials, params: QueryParams): Promise<Activity[]> {
    const items = await this.listPage<RawCloseActivity>(credentials, '/activity/', params)
    return items.map(transformActivity)
  }

  async getActivity(credentials: Credentials, id: string): Promise<Activity> {
    const raw = await this.client(credentials).get<RawCloseActivity>(`/activity/${id}/`)
    return transformActivity(raw)
  }

  // ── Notes ─────────────────────────────────────────────────────────────────
  // Notes in Close live under /activity/note/. Update is not supported by the API.

  async listNotes(credentials: Credentials, params: QueryParams): Promise<Note[]> {
    const items = await this.listPage<RawCloseNote>(credentials, '/activity/note/', params)
    return items.map(transformNote)
  }

  async getNote(credentials: Credentials, id: string): Promise<Note> {
    const raw = await this.client(credentials).get<RawCloseNote>(`/activity/note/${id}/`)
    return transformNote(raw)
  }

  async createNote(credentials: Credentials, data: Partial<Note>): Promise<Note> {
    const raw = await this.client(credentials).post<RawCloseNote>(
      '/activity/note/',
      untransformNote(data),
    )
    return transformNote(raw)
  }

  async deleteNote(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/activity/note/${id}/`)
  }
}
