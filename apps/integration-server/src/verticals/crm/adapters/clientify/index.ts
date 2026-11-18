import { connectionScope, cursorPagerKey, pageByRows, simpleApiKey } from '@opensteward/shared'
/**
 * Clientify CRM adapter for the CRM vertical.
 *
 * Maps the Clientify REST API v1 to canonical CRM resources.
 * Docs: https://developer.clientify.com/ (a Postman collection; the JSON
 * behind it is
 * https://developer.clientify.com/api/collections/29281481/2s9Y5VV4wj).
 *
 * Auth: API token sent as `Authorization: Token <token>` header
 * Base URL: https://api.clientify.net/v1
 */

import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { WebhookEvent } from '../../schema/webhook'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'
import type { Deal } from '../../schema/deal'
import type { Pipeline } from '../../schema/pipeline'
import type { Activity } from '../../schema/activity'
import type { Note } from '../../schema/note'

import { ClientifyClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'
import {
  verifyWebhook as _verifyWebhook,
  parseWebhookEvents as _parseWebhookEvents,
} from './webhook'
import { transformContact, untransformContact, type RawClientifyContact } from './transform/contact'
import { transformCompany, untransformCompany, type RawClientifyCompany } from './transform/company'
import { transformDeal, untransformDeal, type RawClientifyDeal } from './transform/deal'
import { transformPipeline, type RawClientifyPipeline } from './transform/pipeline'
import {
  transformActivity,
  untransformActivity,
  type RawClientifyActivity,
} from './transform/activity'
import { transformNote, untransformNote, type RawClientifyNote } from './transform/note'

export interface ClientifyAdapterConfig {
  apiToken?: string
}
const SIMPLE_API_KEY_FORM = simpleApiKey()

/**
 * The next upstream page, read from a DRF `next` link
 * ("https://api.clientify.net/v1/wall-entries/?page=2"), or null on the last
 * page (`"next": null`). A link without a page number further on is not
 * something the docs describe, so it is an error rather than a guess.
 */
function nextPage(next: string | null, page: number): number | null {
  if (next === null) return null
  let n: number
  try {
    n = Number(new URL(next).searchParams.get('page'))
  } catch {
    n = NaN
  }
  if (!Number.isInteger(n) || n <= page) {
    throw Object.assign(
      new Error(`Clientify API error: unexpected next link after page ${page}: ${next}`),
      { statusCode: 502 },
    )
  }
  return n
}

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

export class ClientifyAdapter implements CrmAdapter {
  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'clientify'
  readonly version = '0.1.0'

  constructor(_config: ClientifyAdapterConfig = {}) {}

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    return '#api-key-auth'
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('Clientify: use API token auth — set accessToken directly')
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

  private c(creds: Credentials): ClientifyClient {
    return new ClientifyClient(creds)
  }

  /**
   * The caller's page of a documented list endpoint. Clientify pages by
   * `page` at a server-chosen size (no page-size parameter is documented;
   * "A paginated list of contacts will be returned to you, with a maximum of
   * 100 contacts per page", List Contacts), so the caller's page is cut from
   * the upstream pages by `pageByRows`, which reports hasMore itself. The
   * walk ends where `next` is null.
   */
  private async pageRows<R, T>(
    credentials: Credentials,
    path: string,
    params: QueryParams,
    map: (raw: R) => T,
  ): Promise<T[]> {
    const client = this.c(credentials)
    const key = cursorPagerKey(connectionScope('clientify', credentials), path, {})
    const { items } = await pageByRows<T, number>(
      key,
      params,
      async (cursor) => {
        const page = cursor ?? 1
        const { results, next } = await client.page<R>(path, page)
        return { items: results.map(map), next: nextPage(next, page) }
      },
      { defaultLimit: DEFAULT_PAGE_SIZE },
    )
    return items
  }

  // ── Contacts ──────────────────────────────────────────────────────────────

  /** GET /v1/contacts/ ("List Contacts"). */
  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    return this.pageRows<RawClientifyContact, Contact>(
      credentials,
      '/contacts/',
      params,
      transformContact,
    )
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const raw = await this.c(credentials).get<RawClientifyContact>(`/contacts/${id}/`)
    return transformContact(raw)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const raw = await this.c(credentials).post<RawClientifyContact>(
      '/contacts/',
      untransformContact(data),
    )
    return transformContact(raw)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const raw = await this.c(credentials).patch<RawClientifyContact>(
      `/contacts/${id}/`,
      untransformContact(data),
    )
    return transformContact(raw)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    await this.c(credentials).delete(`/contacts/${id}/`)
  }

  // ── Companies ─────────────────────────────────────────────────────────────

  /** GET /v1/companies/ ("List Companies"). */
  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    return this.pageRows<RawClientifyCompany, Company>(
      credentials,
      '/companies/',
      params,
      transformCompany,
    )
  }

  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    const raw = await this.c(credentials).get<RawClientifyCompany>(`/companies/${id}/`)
    return transformCompany(raw)
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const raw = await this.c(credentials).post<RawClientifyCompany>(
      '/companies/',
      untransformCompany(data),
    )
    return transformCompany(raw)
  }

  async updateCompany(
    credentials: Credentials,
    id: string,
    data: Partial<Company>,
  ): Promise<Company> {
    const raw = await this.c(credentials).patch<RawClientifyCompany>(
      `/companies/${id}/`,
      untransformCompany(data),
    )
    return transformCompany(raw)
  }

  async deleteCompany(credentials: Credentials, id: string): Promise<void> {
    await this.c(credentials).delete(`/companies/${id}/`)
  }

  // ── Deals ─────────────────────────────────────────────────────────────────

  /** GET /v1/deals/ ("List Deals"). */
  async listDeals(credentials: Credentials, params: QueryParams): Promise<Deal[]> {
    return this.pageRows<RawClientifyDeal, Deal>(credentials, '/deals/', params, transformDeal)
  }

  /** GET /v1/deals/:deal_id/ ("Deal Details"). */
  async getDeal(credentials: Credentials, id: string): Promise<Deal> {
    const raw = await this.c(credentials).get<RawClientifyDeal>(`/deals/${encodeURIComponent(id)}/`)
    return transformDeal(raw)
  }

  async createDeal(credentials: Credentials, data: Partial<Deal>): Promise<Deal> {
    const raw = await this.c(credentials).post<RawClientifyDeal>(
      '/opportunities/',
      untransformDeal(data),
    )
    return transformDeal(raw)
  }

  async updateDeal(credentials: Credentials, id: string, data: Partial<Deal>): Promise<Deal> {
    const raw = await this.c(credentials).patch<RawClientifyDeal>(
      `/opportunities/${id}/`,
      untransformDeal(data),
    )
    return transformDeal(raw)
  }

  async deleteDeal(credentials: Credentials, id: string): Promise<void> {
    await this.c(credentials).delete(`/opportunities/${id}/`)
  }

  // ── Pipelines ─────────────────────────────────────────────────────────────

  /** GET /v1/deals/pipelines/ ("List Deal Pipelines"). */
  async listPipelines(credentials: Credentials, params: QueryParams): Promise<Pipeline[]> {
    return this.pageRows<RawClientifyPipeline, Pipeline>(
      credentials,
      '/deals/pipelines/',
      params,
      transformPipeline,
    )
  }

  /** GET /v1/deals/pipelines/:deal_pipeline_id/ ("Deal Pipeline Details"). */
  async getPipeline(credentials: Credentials, id: string): Promise<Pipeline> {
    const raw = await this.c(credentials).get<RawClientifyPipeline>(
      `/deals/pipelines/${encodeURIComponent(id)}/`,
    )
    return transformPipeline(raw)
  }

  // ── Activities ────────────────────────────────────────────────────────────

  /** GET /v1/tasks/ ("List Tasks"). Clientify documents no /activities/ route. */
  async listActivities(credentials: Credentials, params: QueryParams): Promise<Activity[]> {
    return this.pageRows<RawClientifyActivity, Activity>(
      credentials,
      '/tasks/',
      params,
      transformActivity,
    )
  }

  /** GET /v1/tasks/:task_id/ ("Task Details"). */
  async getActivity(credentials: Credentials, id: string): Promise<Activity> {
    const raw = await this.c(credentials).get<RawClientifyActivity>(
      `/tasks/${encodeURIComponent(id)}/`,
    )
    return transformActivity(raw)
  }

  async createActivity(credentials: Credentials, data: Partial<Activity>): Promise<Activity> {
    const raw = await this.c(credentials).post<RawClientifyActivity>(
      '/activities/',
      untransformActivity(data),
    )
    return transformActivity(raw)
  }

  async updateActivity(
    credentials: Credentials,
    id: string,
    data: Partial<Activity>,
  ): Promise<Activity> {
    const raw = await this.c(credentials).patch<RawClientifyActivity>(
      `/activities/${id}/`,
      untransformActivity(data),
    )
    return transformActivity(raw)
  }

  async deleteActivity(credentials: Credentials, id: string): Promise<void> {
    await this.c(credentials).delete(`/activities/${id}/`)
  }

  // ── Notes ─────────────────────────────────────────────────────────────────

  /**
   * Clientify documents no way to read notes back. Notes are only written,
   * through "Add note to contact" (POST /v1/contacts/:contact_id/note/),
   * "Add Note to Company" and "Add Note to Deal"; the collection has no
   * GET route for notes (https://developer.clientify.com/).
   */
  async listNotes(_credentials: Credentials, _params: QueryParams): Promise<Note[]> {
    throw notSupported(
      'Clientify cannot list notes: the API documents notes only as POST /contacts/:contact_id/note/, /companies/:company_id/note/ and /deals/:deal_id/note/, with no GET route',
    )
  }

  async getNote(_credentials: Credentials, _id: string): Promise<Note> {
    throw notSupported(
      'Clientify cannot read a note by id: the API documents notes only as POST /contacts/:contact_id/note/, /companies/:company_id/note/ and /deals/:deal_id/note/, with no GET route',
    )
  }

  async createNote(credentials: Credentials, data: Partial<Note>): Promise<Note> {
    const raw = await this.c(credentials).post<RawClientifyNote>('/notes/', untransformNote(data))
    return transformNote(raw)
  }

  async updateNote(credentials: Credentials, id: string, data: Partial<Note>): Promise<Note> {
    const raw = await this.c(credentials).patch<RawClientifyNote>(
      `/notes/${id}/`,
      untransformNote(data),
    )
    return transformNote(raw)
  }

  async deleteNote(credentials: Credentials, id: string): Promise<void> {
    await this.c(credentials).delete(`/notes/${id}/`)
  }
}
