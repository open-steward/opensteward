import { pageLocally, pageOffset, reportUpstreamPage, simpleApiKey } from '@opensteward/shared'
/**
 * Salesflare adapter — clean modern REST CRM mapped to canonical CRM resources.
 *
 * Salesflare uses standard REST conventions with Bearer token auth.
 * Full coverage: Contacts, Companies (Accounts), Deals (Opportunities),
 * Pipelines, Activities (Tasks), and Notes.
 *
 * Auth: API key passed as Bearer token. Config: { apiKey?: string }.
 * Docs: https://api.salesflare.com/docs
 */

import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { WebhookEvent } from '../../schema/webhook'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'
import type { Deal } from '../../schema/deal'
import type { Pipeline } from '../../schema/pipeline'
import type { Activity } from '../../schema/activity'
import type { Note } from '../../schema/note'

import { SalesflareClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'
import { verifySalesflareWebhook, parseSalesflareWebhookEvents } from './webhook'
import {
  transformContact,
  untransformContact,
  type RawSalesflareContact,
} from './transform/contact'
import {
  transformCompany,
  untransformCompany,
  type RawSalesflareCompany,
} from './transform/company'
import { transformDeal, untransformDeal, type RawSalesflareDeal } from './transform/deal'
import { transformPipeline, type RawSalesflarePipeline } from './transform/pipeline'
import {
  transformActivity,
  untransformActivity,
  type RawSalesflareActivity,
} from './transform/activity'
import { transformNote, untransformNote, type RawSalesflareNote } from './transform/note'

export interface SalesflareAdapterConfig {
  apiKey?: string
}
const SIMPLE_API_KEY_FORM = simpleApiKey()

export class SalesflareAdapter implements CrmAdapter {
  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'salesflare'
  readonly version = '0.1.0'

  private apiKey: string | undefined

  constructor(config: SalesflareAdapterConfig = {}) {
    this.apiKey = config.apiKey
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    // API key auth — no OAuth flow
    return '#api-key-auth'
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    return { accessToken: this.apiKey ?? '' }
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  // ── Webhooks ───────────────────────────────────────────────────────────────

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifySalesflareWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseSalesflareWebhookEvents(payload)
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private client(credentials: Credentials): SalesflareClient {
    const effective: Credentials = this.apiKey ? { accessToken: this.apiKey } : credentials
    return new SalesflareClient(effective)
  }

  /**
   * One caller page of a `limit` + `offset` collection. The spec documents no
   * maximum and answers a bare array, so a page shorter than `limit` is the
   * only end signal. Offset comes from the 1-based `page`.
   */
  private async listPage<T>(
    credentials: Credentials,
    path: string,
    params: QueryParams,
  ): Promise<T[]> {
    const limit = params.limit ?? DEFAULT_PAGE_SIZE
    const { items } = await this.client(credentials).list<T>(path, {
      limit,
      offset: pageOffset(params, limit),
    })
    reportUpstreamPage(params, { hasMore: items.length >= limit })
    return items
  }

  // ── Contacts ──────────────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const items = await this.listPage<RawSalesflareContact>(credentials, '/contacts', params)
    return items.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const raw = await this.client(credentials).get<RawSalesflareContact>(`/contacts/${id}`)
    return transformContact(raw)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const raw = await this.client(credentials).post<RawSalesflareContact>(
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
    const raw = await this.client(credentials).put<RawSalesflareContact>(
      `/contacts/${id}`,
      untransformContact(data),
    )
    return transformContact(raw)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/contacts/${id}`)
  }

  // ── Companies (Accounts) ──────────────────────────────────────────────────

  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    const items = await this.listPage<RawSalesflareCompany>(credentials, '/accounts', params)
    return items.map(transformCompany)
  }

  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    const raw = await this.client(credentials).get<RawSalesflareCompany>(`/accounts/${id}`)
    return transformCompany(raw)
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const raw = await this.client(credentials).post<RawSalesflareCompany>(
      '/accounts',
      untransformCompany(data),
    )
    return transformCompany(raw)
  }

  async updateCompany(
    credentials: Credentials,
    id: string,
    data: Partial<Company>,
  ): Promise<Company> {
    const raw = await this.client(credentials).put<RawSalesflareCompany>(
      `/accounts/${id}`,
      untransformCompany(data),
    )
    return transformCompany(raw)
  }

  async deleteCompany(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/accounts/${id}`)
  }

  // ── Deals (Opportunities) ─────────────────────────────────────────────────

  async listDeals(credentials: Credentials, params: QueryParams): Promise<Deal[]> {
    const items = await this.listPage<RawSalesflareDeal>(credentials, '/opportunities', params)
    return items.map(transformDeal)
  }

  async getDeal(credentials: Credentials, id: string): Promise<Deal> {
    const raw = await this.client(credentials).get<RawSalesflareDeal>(`/opportunities/${id}`)
    return transformDeal(raw)
  }

  async createDeal(credentials: Credentials, data: Partial<Deal>): Promise<Deal> {
    const raw = await this.client(credentials).post<RawSalesflareDeal>(
      '/opportunities',
      untransformDeal(data),
    )
    return transformDeal(raw)
  }

  async updateDeal(credentials: Credentials, id: string, data: Partial<Deal>): Promise<Deal> {
    const raw = await this.client(credentials).put<RawSalesflareDeal>(
      `/opportunities/${id}`,
      untransformDeal(data),
    )
    return transformDeal(raw)
  }

  async deleteDeal(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/opportunities/${id}`)
  }

  // ── Pipelines ─────────────────────────────────────────────────────────────

  async listPipelines(credentials: Credentials, params: QueryParams): Promise<Pipeline[]> {
    // GET /pipelines documents no paging parameters: it answers the whole
    // collection, so fetch it without limit/offset and page it here.
    const result = await this.client(credentials).get<
      RawSalesflarePipeline[] | { data?: RawSalesflarePipeline[] }
    >('/pipelines')
    const items = Array.isArray(result) ? result : (result?.data ?? [])
    return pageLocally(items.map(transformPipeline), params)
  }

  async getPipeline(credentials: Credentials, id: string): Promise<Pipeline> {
    const raw = await this.client(credentials).get<RawSalesflarePipeline>(`/pipelines/${id}`)
    return transformPipeline(raw)
  }

  // ── Activities (Tasks) ────────────────────────────────────────────────────

  async listActivities(credentials: Credentials, params: QueryParams): Promise<Activity[]> {
    const items = await this.listPage<RawSalesflareActivity>(credentials, '/tasks', params)
    return items.map(transformActivity)
  }

  async getActivity(credentials: Credentials, id: string): Promise<Activity> {
    const raw = await this.client(credentials).get<RawSalesflareActivity>(`/tasks/${id}`)
    return transformActivity(raw)
  }

  async createActivity(credentials: Credentials, data: Partial<Activity>): Promise<Activity> {
    const body = untransformActivity(data)
    if (!body.description) body.description = 'Task'
    const raw = await this.client(credentials).post<RawSalesflareActivity>('/tasks', body)
    return transformActivity(raw)
  }

  async updateActivity(
    credentials: Credentials,
    id: string,
    data: Partial<Activity>,
  ): Promise<Activity> {
    const raw = await this.client(credentials).put<RawSalesflareActivity>(
      `/tasks/${id}`,
      untransformActivity(data),
    )
    return transformActivity(raw)
  }

  async deleteActivity(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/tasks/${id}`)
  }

  // ── Notes ─────────────────────────────────────────────────────────────────

  // The spec (https://api.salesflare.com/openapi.json) has no path containing
  // "note". Internal notes are messages: "/messages":{"post":{"summary":"Create
  // an internal note" and "/messages/{message_id}" (put, delete only). The one
  // list is scoped to a single account — "/accounts/{account_id}/messages":
  // {"get":{"summary":"List an account's messages" — with an undocumented
  // response body, and there is no GET /messages/{id}. Both reads refuse before
  // sending anything.

  async listNotes(_credentials: Credentials, _params: QueryParams): Promise<Note[]> {
    throw Object.assign(
      new Error(
        'Salesflare cannot list notes: the API has no notes collection. Internal notes are ' +
          'messages, listed only per account ("List an account\'s messages", ' +
          'GET /accounts/{account_id}/messages).',
      ),
      { statusCode: 501, code: 'NOT_SUPPORTED' },
    )
  }

  async getNote(_credentials: Credentials, _id: string): Promise<Note> {
    throw Object.assign(
      new Error(
        'Salesflare cannot read a note by id: /messages/{message_id} documents only ' +
          '"Update an internal note" (PUT) and "Delete an internal note" (DELETE), no GET.',
      ),
      { statusCode: 501, code: 'NOT_SUPPORTED' },
    )
  }

  async createNote(credentials: Credentials, data: Partial<Note>): Promise<Note> {
    const raw = await this.client(credentials).post<RawSalesflareNote>(
      '/notes',
      untransformNote(data),
    )
    return transformNote(raw)
  }

  async deleteNote(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/notes/${id}`)
  }

  // updateNote is not implemented (registry returns 501). The spec does document
  // one — "/messages/{message_id}":{"put":{"summary":"Update an internal note" —
  // and createNote/deleteNote above still call /notes paths the spec lacks
  // (it has POST /messages and DELETE /messages/{message_id}). Write methods
  // were out of scope for the paging rebuild; left for a write-path fix.
}
