import { reportUpstreamPage, simpleApiKey } from '@opensteward/shared'
/**
 * Krayin CRM adapter for the CRM vertical.
 *
 * Maps the first-party Krayin REST API package, krayin/rest-api
 * (https://github.com/krayin/rest-api), to canonical CRM resources. Every
 * path below is taken from that package's OpenAPI annotations
 * (src/Docs/Controllers/**) and route files (src/Routes/V1/**).
 *
 * Auth: Sanctum bearer token (credentials.accessToken).
 * Base URL: ${instanceUrl}/api/v1 (credentials.extra.instanceUrl = the
 *   self-hosted instance).
 *
 * Contacts = persons, Companies = organizations, Deals = leads.
 *
 * Lists page by the documented `page` ("Page number") and `limit` ("Limit")
 * query parameters; the end comes from Laravel's paginator `meta`.
 *
 * Notes: refused. The package has no notes endpoint; a note is an activity of
 * type `note`, and GET /api/v1/activities documents no type filter.
 */

import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { WebhookEvent } from '../../schema/webhook'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'
import type { Deal } from '../../schema/deal'
import type { Pipeline } from '../../schema/pipeline'
import type { Activity } from '../../schema/activity'
import type { Note } from '../../schema/note'

import { KrayinCrmClient } from './client'
import { verifyWebhook, parseWebhookEvents } from './webhook'
import { DEFAULT_PAGE_SIZE } from './constants'
import { transformContact, untransformContact, type RawKrayinContact } from './transform/contact'
import {
  transformCompany,
  untransformCompany,
  type RawKrayinOrganization,
} from './transform/company'
import { transformDeal, untransformDeal, type RawKrayinLead } from './transform/deal'
import { transformPipeline, type RawKrayinPipeline } from './transform/pipeline'
import {
  transformActivity,
  untransformActivity,
  type RawKrayinActivity,
} from './transform/activity'
import { transformNote, untransformNote, type RawKrayinNote } from './transform/note'

// no OAuth config needed — bearer token auth
export type KrayinCrmAdapterConfig = Record<string, never>
const SIMPLE_API_KEY_FORM = simpleApiKey()

export class KrayinCrmAdapter implements CrmAdapter {
  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'krayin-crm'
  readonly version = '0.1.0'

  constructor(_config: KrayinCrmAdapterConfig = {}) {}

  // ── Auth (API Key stub) ───────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    return '#api-key-auth'
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    return { accessToken: '' }
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

  private client(credentials: Credentials): KrayinCrmClient {
    return new KrayinCrmClient(credentials)
  }

  /**
   * One caller page of a Krayin list. The caller's 1-based `page` and
   * `limit` are sent as is: Krayin pages by page number and applies no
   * maximum to `limit` (`$query->paginate(request()->input('limit') ?? 10)`
   * in src/Http/Controllers/V1/Controller.php). The end of the collection is
   * Laravel's paginator state, `meta.current_page` < `meta.last_page`, and
   * `meta.total` is the row count; when `meta` is absent nothing is claimed.
   */
  private async listPage<T>(
    client: KrayinCrmClient,
    path: string,
    params: QueryParams,
  ): Promise<T[]> {
    const page =
      typeof params.page === 'number' && Number.isFinite(params.page) && params.page >= 1
        ? Math.floor(params.page)
        : 1
    const limit =
      typeof params.limit === 'number' && Number.isFinite(params.limit) && params.limit >= 1
        ? Math.floor(params.limit)
        : DEFAULT_PAGE_SIZE
    const { items, meta } = await client.list<T>(path, page, limit)
    const current = meta?.current_page
    const last = meta?.last_page
    reportUpstreamPage(params, {
      ...(typeof meta?.total === 'number' ? { totalCount: meta.total } : {}),
      ...(typeof last === 'number' ? { totalPages: last } : {}),
      ...(typeof current === 'number' ? { currentPage: current } : {}),
      ...(typeof current === 'number' && typeof last === 'number'
        ? { hasMore: current < last }
        : {}),
    })
    return items
  }

  private notesUnsupported(): never {
    throw Object.assign(
      new Error(
        'Krayin CRM cannot list or read notes: krayin/rest-api has no notes endpoint ' +
          '(src/Routes/V1/lead-routes.php registers none), and GET /api/v1/activities ' +
          'documents only the sort, order, page and limit parameters, so notes ' +
          '(activities of type "note") cannot be selected',
      ),
      { statusCode: 501, code: 'NOT_SUPPORTED' },
    )
  }

  // ── Contacts (Persons in Krayin) ───────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    // GET path="/api/v1/contacts/persons" (operationId getPersons)
    const items = await this.listPage<RawKrayinContact>(
      this.client(credentials),
      '/contacts/persons',
      params,
    )
    return items.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const res = await this.client(credentials).get<RawKrayinContact>(
      `/contacts/persons/${encodeURIComponent(id)}`,
    )
    return transformContact(res)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const body = untransformContact(data)
    const res = await this.client(credentials).post<RawKrayinContact>('/contacts/persons', body)
    return transformContact(res)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const body = untransformContact(data)
    const res = await this.client(credentials).put<RawKrayinContact>(
      `/contacts/persons/${id}`,
      body,
    )
    return transformContact(res)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/contacts/persons/${id}`)
  }

  // ── Companies (Organizations in Krayin) ───────────────────────────────────

  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    // GET path="/api/v1/contacts/organizations"
    const items = await this.listPage<RawKrayinOrganization>(
      this.client(credentials),
      '/contacts/organizations',
      params,
    )
    return items.map(transformCompany)
  }

  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    const res = await this.client(credentials).get<RawKrayinOrganization>(
      `/contacts/organizations/${encodeURIComponent(id)}`,
    )
    return transformCompany(res)
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const body = untransformCompany(data)
    const res = await this.client(credentials).post<RawKrayinOrganization>(
      '/contacts/organizations',
      body,
    )
    return transformCompany(res)
  }

  async updateCompany(
    credentials: Credentials,
    id: string,
    data: Partial<Company>,
  ): Promise<Company> {
    const body = untransformCompany(data)
    const res = await this.client(credentials).put<RawKrayinOrganization>(
      `/contacts/organizations/${id}`,
      body,
    )
    return transformCompany(res)
  }

  async deleteCompany(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/contacts/organizations/${id}`)
  }

  // ── Deals (Leads in Krayin) ───────────────────────────────────────────────

  async listDeals(credentials: Credentials, params: QueryParams): Promise<Deal[]> {
    // GET path="/api/v1/leads"
    const items = await this.listPage<RawKrayinLead>(this.client(credentials), '/leads', params)
    return items.map(transformDeal)
  }

  async getDeal(credentials: Credentials, id: string): Promise<Deal> {
    const res = await this.client(credentials).get<RawKrayinLead>(
      `/leads/${encodeURIComponent(id)}`,
    )
    return transformDeal(res)
  }

  async createDeal(credentials: Credentials, data: Partial<Deal>): Promise<Deal> {
    const body = untransformDeal(data)
    const res = await this.client(credentials).post<RawKrayinLead>('/leads', body)
    return transformDeal(res)
  }

  async updateDeal(credentials: Credentials, id: string, data: Partial<Deal>): Promise<Deal> {
    const body = untransformDeal(data)
    const res = await this.client(credentials).put<RawKrayinLead>(`/leads/${id}`, body)
    return transformDeal(res)
  }

  async deleteDeal(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/leads/${id}`)
  }

  // ── Pipelines ─────────────────────────────────────────────────────────────

  async listPipelines(credentials: Credentials, params: QueryParams): Promise<Pipeline[]> {
    // GET path="/api/v1/settings/pipelines" (operationId getPipelines)
    const items = await this.listPage<RawKrayinPipeline>(
      this.client(credentials),
      '/settings/pipelines',
      params,
    )
    return items.map(transformPipeline)
  }

  async getPipeline(credentials: Credentials, id: string): Promise<Pipeline> {
    const res = await this.client(credentials).get<RawKrayinPipeline>(
      `/settings/pipelines/${encodeURIComponent(id)}`,
    )
    return transformPipeline(res)
  }

  // ── Activities ─────────────────────────────────────────────────────────────

  async listActivities(credentials: Credentials, params: QueryParams): Promise<Activity[]> {
    // GET path="/api/v1/activities"
    const items = await this.listPage<RawKrayinActivity>(
      this.client(credentials),
      '/activities',
      params,
    )
    return items.map(transformActivity)
  }

  async getActivity(credentials: Credentials, id: string): Promise<Activity> {
    const res = await this.client(credentials).get<RawKrayinActivity>(
      `/activities/${encodeURIComponent(id)}`,
    )
    return transformActivity(res)
  }

  async createActivity(credentials: Credentials, data: Partial<Activity>): Promise<Activity> {
    const body = untransformActivity(data)
    const res = await this.client(credentials).post<RawKrayinActivity>('/activities', body)
    return transformActivity(res)
  }

  async updateActivity(
    credentials: Credentials,
    id: string,
    data: Partial<Activity>,
  ): Promise<Activity> {
    const body = untransformActivity(data)
    const res = await this.client(credentials).put<RawKrayinActivity>(`/activities/${id}`, body)
    return transformActivity(res)
  }

  async deleteActivity(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/activities/${id}`)
  }

  // ── Notes ──────────────────────────────────────────────────────────────────

  async listNotes(_credentials: Credentials, _params: QueryParams): Promise<Note[]> {
    return this.notesUnsupported()
  }

  async getNote(_credentials: Credentials, _id: string): Promise<Note> {
    return this.notesUnsupported()
  }

  async createNote(credentials: Credentials, data: Partial<Note>): Promise<Note> {
    const body = untransformNote(data)
    const res = await this.client(credentials).post<RawKrayinNote>('/leads/notes', body)
    return transformNote(res)
  }
}
