import {
  simpleApiKey,
  pageByCursor,
  cursorPagerKey,
  connectionScope,
  reportUpstreamPage,
} from '@opensteward/shared'
/**
 * Twenty CRM adapter for the CRM vertical.
 *
 * Maps the Twenty Core REST API (`/rest/<object>`) to canonical CRM resources.
 * Docs: https://docs.twenty.com/developers/extend/api.md,
 *   https://api.twenty.com/open-api/core (paging contract; the per-workspace
 *   schema is only in Settings → API & Webhooks, so record shapes follow
 *   Twenty's standard objects in github.com/twentyhq/twenty)
 *
 * Auth: Bearer token (API key) via Authorization header
 * Base URL: credentials.extra.instanceUrl (default: https://api.twenty.com)
 * Reads page by cursor: `limit` (max 200) and `starting_after` =
 * `pageInfo.endCursor`, ending on `pageInfo.hasNextPage`.
 * Notable:
 *   - Open-source CRM, European (France) origin
 *   - people → contacts, companies → companies, opportunities → deals
 *   - Activities and notes have polymorphic "targets" linking to objects
 *   - Amount stored as amountMicros (int64)
 *
 * ── Coverage ─────────────────────────────────────────────────────────────
 *
 * Implemented (20):
 *   Contacts (people): list, get, create, update, delete
 *   Companies: list, get, create, update, delete
 *   Deals (opportunities): list, get, create, update, delete
 *   Pipelines: list refuses (501) — Twenty has no pipeline object
 *   Activities (tasks): list, get; create (legacy path, unverified)
 *   Notes: list, get, create
 *   Webhooks: verifyWebhook (stub), parseWebhookEvents (stub)
 */

import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { WebhookEvent } from '../../schema/webhook'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'
import type { Deal } from '../../schema/deal'
import type { Pipeline } from '../../schema/pipeline'
import type { Activity } from '../../schema/activity'
import type { Note } from '../../schema/note'

import { TwentyClient } from './client'
import { verifyWebhook, parseWebhookEvents } from './webhook'
import { MAX_PAGE_SIZE } from './constants'
import { transformContact, untransformContact, type RawTwentyPerson } from './transform/contact'
import { transformCompany, untransformCompany, type RawTwentyCompany } from './transform/company'
import { transformDeal, untransformDeal, type RawTwentyOpportunity } from './transform/deal'
import {
  transformActivity,
  untransformActivity,
  type RawTwentyActivity,
  type RawTwentyTask,
} from './transform/activity'
import { transformNote, untransformNote, type RawTwentyNote } from './transform/note'

export interface TwentyAdapterConfig {
  apiKey?: string
}
const SIMPLE_API_KEY_FORM = simpleApiKey()

export class TwentyAdapter implements CrmAdapter {
  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'twenty'
  readonly version = '0.1.0'
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  constructor(_config: TwentyAdapterConfig = {}) {}

  // ── Auth (API key — no OAuth flow) ────────────────────────────────────────

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

  private client(credentials: Credentials): TwentyClient {
    return new TwentyClient(credentials)
  }

  /**
   * One caller page of `GET /rest/<plural>`.
   *
   * "All list endpoints use cursor-based pagination. - Use **limit** to cap
   * page size (default: 60, max: 200). - Use **starting_after** to fetch the
   * next page (forward). ... - Responses include **pageInfo** with
   * `hasNextPage`, `hasPreviousPage`, `startCursor`, and `endCursor`."
   * (https://api.twenty.com/open-api/core)
   */
  private async pageRest<T>(
    credentials: Credentials,
    plural: string,
    params: QueryParams,
  ): Promise<T[]> {
    const asked = params.limit
    const limit =
      typeof asked === 'number' && Number.isFinite(asked) && asked >= 1
        ? Math.min(Math.floor(asked), MAX_PAGE_SIZE)
        : undefined
    const client = this.client(credentials)
    const key = cursorPagerKey(connectionScope(client.baseUrl, credentials), plural, { limit })
    let totalCount: number | undefined
    const { items, hasMore } = await pageByCursor<T>(key, params.page, async (cursor) => {
      const res = await client.findMany<T>(plural, { limit, starting_after: cursor })
      totalCount = res.totalCount
      const { hasNextPage, endCursor } = res.pageInfo
      if (hasNextPage && !endCursor) {
        throw new Error(`Twenty GET /rest/${plural} reported hasNextPage without an endCursor`)
      }
      return { items: res.records, next: hasNextPage ? endCursor : undefined }
    })
    reportUpstreamPage(params, {
      hasMore,
      ...(totalCount !== undefined ? { totalCount } : {}),
      ...(limit !== undefined && typeof asked === 'number' && limit < asked
        ? { pageSize: limit }
        : {}),
    })
    return items
  }

  // ── Contacts (people) ─────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const items = await this.pageRest<RawTwentyPerson>(credentials, 'people', params)
    return items.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const res = await this.client(credentials).findOne<RawTwentyPerson>('people', 'person', id)
    return transformContact(res)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const body = untransformContact(data)
    const res = await this.client(credentials).post<RawTwentyPerson>('/api/people', body)
    return transformContact(res)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const body = untransformContact(data)
    const res = await this.client(credentials).patch<RawTwentyPerson>(`/api/people/${id}`, body)
    return transformContact(res)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/api/people/${id}`)
  }

  // ── Companies ─────────────────────────────────────────────────────────────

  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    const items = await this.pageRest<RawTwentyCompany>(credentials, 'companies', params)
    return items.map(transformCompany)
  }

  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    const res = await this.client(credentials).findOne<RawTwentyCompany>('companies', 'company', id)
    return transformCompany(res)
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const body = untransformCompany(data)
    const res = await this.client(credentials).post<RawTwentyCompany>('/api/companies', body)
    return transformCompany(res)
  }

  async updateCompany(
    credentials: Credentials,
    id: string,
    data: Partial<Company>,
  ): Promise<Company> {
    const body = untransformCompany(data)
    const res = await this.client(credentials).patch<RawTwentyCompany>(`/api/companies/${id}`, body)
    return transformCompany(res)
  }

  async deleteCompany(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/api/companies/${id}`)
  }

  // ── Deals (opportunities) ─────────────────────────────────────────────────

  async listDeals(credentials: Credentials, params: QueryParams): Promise<Deal[]> {
    const items = await this.pageRest<RawTwentyOpportunity>(credentials, 'opportunities', params)
    return items.map(transformDeal)
  }

  async getDeal(credentials: Credentials, id: string): Promise<Deal> {
    const res = await this.client(credentials).findOne<RawTwentyOpportunity>(
      'opportunities',
      'opportunity',
      id,
    )
    return transformDeal(res)
  }

  async createDeal(credentials: Credentials, data: Partial<Deal>): Promise<Deal> {
    const body = untransformDeal(data)
    const res = await this.client(credentials).post<RawTwentyOpportunity>(
      '/api/opportunities',
      body,
    )
    return transformDeal(res)
  }

  async updateDeal(credentials: Credentials, id: string, data: Partial<Deal>): Promise<Deal> {
    const body = untransformDeal(data)
    const res = await this.client(credentials).patch<RawTwentyOpportunity>(
      `/api/opportunities/${id}`,
      body,
    )
    return transformDeal(res)
  }

  async deleteDeal(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/api/opportunities/${id}`)
  }

  // ── Pipelines ─────────────────────────────────────────────

  async listPipelines(_credentials: Credentials, _params: QueryParams): Promise<Pipeline[]> {
    // The Core API serves records of objects. "Twenty comes with standard
    // objects out of the box:" Companies, People, Opportunities ("**Opportunities**
    // — Deals in your pipeline"), Tasks and Notes
    // (https://docs.twenty.com/getting-started/core-concepts/data-model.md).
    // A pipeline is not one of them: an opportunity's stage is a SELECT field
    // (`stage: string`) whose options live in the Metadata API.
    throw Object.assign(
      new Error(
        'Twenty cannot list pipelines: it has no pipeline object. Its standard objects are ' +
          'Companies, People, Opportunities ("Deals in your pipeline"), Tasks and Notes, ' +
          "and an opportunity's stage is a select field",
      ),
      { statusCode: 501, code: 'NOT_SUPPORTED' },
    )
  }

  // ── Activities (tasks) ────────────────────────────────────────────────────────────

  async listActivities(credentials: Credentials, params: QueryParams): Promise<Activity[]> {
    // Of Twenty's standard objects (Companies, People, Opportunities, Tasks,
    // Notes), "**Tasks** — Action items for your team"
    // (https://docs.twenty.com/getting-started/core-concepts/data-model.md)
    // are the activities it keeps.
    const items = await this.pageRest<RawTwentyTask>(credentials, 'tasks', params)
    return items.map(transformActivity)
  }

  async getActivity(credentials: Credentials, id: string): Promise<Activity> {
    const res = await this.client(credentials).findOne<RawTwentyTask>('tasks', 'task', id)
    return transformActivity(res)
  }

  async createActivity(credentials: Credentials, data: Partial<Activity>): Promise<Activity> {
    const body = untransformActivity(data)
    const res = await this.client(credentials).post<RawTwentyActivity>('/api/activities', body)
    return transformActivity(res)
  }

  // ── Notes ─────────────────────────────────────────────────────────────────

  async listNotes(credentials: Credentials, params: QueryParams): Promise<Note[]> {
    const items = await this.pageRest<RawTwentyNote>(credentials, 'notes', params)
    return items.map(transformNote)
  }

  async getNote(credentials: Credentials, id: string): Promise<Note> {
    const res = await this.client(credentials).findOne<RawTwentyNote>('notes', 'note', id)
    return transformNote(res)
  }

  async createNote(credentials: Credentials, data: Partial<Note>): Promise<Note> {
    const body = untransformNote(data)
    const res = await this.client(credentials).post<RawTwentyNote>('/api/notes', body)
    return transformNote(res)
  }
}
