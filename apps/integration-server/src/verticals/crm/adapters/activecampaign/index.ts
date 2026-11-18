import { pageOffset, reportUpstreamPage, simpleApiKey } from '@opensteward/shared'
/**
 * ActiveCampaign adapter for the CRM vertical.
 *
 * Maps the ActiveCampaign v3 REST API to canonical CRM resources.
 * Docs: https://developers.activecampaign.com/reference
 *
 * ── Coverage ─────────────────────────────────────────────────────────────
 *
 * Implemented (6):
 *   Contacts:   list, get, create, update, delete
 *   Companies:  list, get (CRM accounts: GET /accounts, GET /accounts/:id);
 *               create, update, delete still on the deprecated /organizations
 *   Deals:      list, get, create, update, delete
 *   Pipelines:  list, get (read-only)
 *   Activities: list, get, create, update, delete  (mapped to Deal Tasks)
 *   Notes:      list, get, create, update, delete
 *   Auth:       N/A (API key via Api-Token header)
 *   Webhooks:   verifyWebhook (always true), parseWebhookEvents
 *
 * Omitted (0) — all supported resources are implemented.
 */

import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { WebhookEvent } from '../../schema/webhook'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'
import type { Deal } from '../../schema/deal'
import type { Pipeline } from '../../schema/pipeline'
import type { Activity } from '../../schema/activity'
import type { Note } from '../../schema/note'

import { ActiveCampaignClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'
import {
  verifyWebhook as _verifyWebhook,
  parseWebhookEvents as _parseWebhookEvents,
} from './webhook'
import {
  transformContact,
  untransformContact,
  type RawActiveCampaignContact,
} from './transform/contact'
import {
  transformCompany,
  untransformCompany,
  type RawActiveCampaignCompany,
} from './transform/company'
import { transformAccount, type RawActiveCampaignAccount } from './transform/account'
import { transformDeal, untransformDeal, type RawActiveCampaignDeal } from './transform/deal'
import {
  transformPipeline,
  type RawActiveCampaignPipeline,
  type RawActiveCampaignStage,
} from './transform/pipeline'
import {
  transformActivity,
  untransformActivity,
  type RawActiveCampaignTask,
} from './transform/activity'
import { transformNote, untransformNote, type RawActiveCampaignNote } from './transform/note'

export interface ActiveCampaignAdapterConfig {
  /** Static API key — stored as credentials.accessToken. */
  apiKey?: string
}
const SIMPLE_API_KEY_FORM = simpleApiKey()

/**
 * "A typical endpoint will return 20 records by default and will allow a
 * maximum of 100 records to be returned."
 * (https://developers.activecampaign.com/reference/pagination)
 *
 * Every list clamps here and reports the size it sent.
 */
const MAX_PAGE_SIZE = 100
/** Upper bound on upstream pages listAll() walks: 50 x 100 = 5,000 rows. */
const MAX_LIST_ALL_PAGES = 50

export class ActiveCampaignAdapter implements CrmAdapter {
  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'activecampaign'
  readonly version = '0.1.0'

  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  constructor(_config: ActiveCampaignAdapterConfig = {}) {}

  // ── Auth ───────────────────────────────────────────────────────────────────
  // ActiveCampaign uses API keys — no OAuth2 flow needed.

  getAuthUrl(_state: string): string {
    return '#activecampaign-api-key'
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    // API-key auth: nothing to exchange
    return { accessToken: '' }
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // API keys don't expire
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

  private client(credentials: Credentials): ActiveCampaignClient {
    return new ActiveCampaignClient(credentials)
  }

  /**
   * One caller page of an offset collection: `limit` clamped to 100, and
   * "incrementing the `offset` by the value of `limit` with each request"
   * from the 1-based `page`. Reports meta.total, so hasMore is exact, and the
   * clamped size when it is below the caller's limit.
   */
  private async listPage<T>(
    credentials: Credentials,
    path: string,
    arrayKey: string,
    params: QueryParams,
  ): Promise<T[]> {
    const raw = Number(this.limit(params))
    const asked = Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : DEFAULT_PAGE_SIZE
    const size = Math.min(asked, MAX_PAGE_SIZE)
    const offset = pageOffset(params, size)
    const { items, total } = await this.client(credentials).list<T>(path, arrayKey, {
      limit: size,
      offset,
    })
    reportUpstreamPage(params, {
      ...(total !== undefined ? { totalCount: total, hasMore: offset + items.length < total } : {}),
      ...(size < asked ? { pageSize: size } : {}),
    })
    return items
  }

  /**
   * Every row of a collection, paged at the documented maximum. Bounded, so an
   * upstream that ignores `offset` and reports no total cannot loop forever.
   */
  private async listAll<T>(
    client: ActiveCampaignClient,
    path: string,
    arrayKey: string,
  ): Promise<T[]> {
    const out: T[] = []
    for (let pages = 0; pages < MAX_LIST_ALL_PAGES; pages++) {
      const { items, total } = await client.list<T>(path, arrayKey, {
        limit: MAX_PAGE_SIZE,
        offset: out.length,
      })
      out.push(...items)
      if (items.length === 0) return out
      if (total !== undefined ? out.length >= total : items.length < MAX_PAGE_SIZE) return out
    }
    return out
  }

  private limit(params: QueryParams): number {
    return params.limit ?? DEFAULT_PAGE_SIZE
  }

  // ── Contacts ───────────────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const items = await this.listPage<RawActiveCampaignContact>(
      credentials,
      '/contacts',
      'contacts',
      params,
    )
    return items.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const raw = await this.client(credentials).get<RawActiveCampaignContact>(
      `/contacts/${id}`,
      'contact',
    )
    return transformContact(raw)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const raw = await this.client(credentials).post<RawActiveCampaignContact>(
      '/contacts',
      'contact',
      { contact: untransformContact(data) },
    )
    return transformContact(raw)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const raw = await this.client(credentials).put<RawActiveCampaignContact>(
      `/contacts/${id}`,
      'contact',
      { contact: untransformContact(data) },
    )
    return transformContact(raw)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/contacts/${id}`)
  }

  // ── Companies (CRM Accounts) ──────────────────────────────────────────────
  //
  // "Organization-Related Nodes Have Been Deprecated" and the v3 OpenAPI has
  // no /organizations path. Reads use the account endpoints, which "manage
  // CRM accounts (the organizations your contacts belong to)":
  //   GET /accounts      "Retrieve all existing account" (list-all-accounts)
  //   GET /accounts/:id  "Retrieve an existing account" (retrieve-an-account)
  // The writes below are out of this change's scope and still target
  // /organizations.

  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    const items = await this.listPage<RawActiveCampaignAccount>(
      credentials,
      '/accounts',
      'accounts',
      params,
    )
    return items.map(transformAccount)
  }

  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    const raw = await this.client(credentials).get<RawActiveCampaignAccount>(
      `/accounts/${id}`,
      'account',
    )
    return transformAccount(raw)
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const raw = await this.client(credentials).post<RawActiveCampaignCompany>(
      '/organizations',
      'organization',
      { organization: untransformCompany(data) },
    )
    return transformCompany(raw)
  }

  async updateCompany(
    credentials: Credentials,
    id: string,
    data: Partial<Company>,
  ): Promise<Company> {
    const raw = await this.client(credentials).put<RawActiveCampaignCompany>(
      `/organizations/${id}`,
      'organization',
      { organization: untransformCompany(data) },
    )
    return transformCompany(raw)
  }

  async deleteCompany(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/organizations/${id}`)
  }

  // ── Deals ─────────────────────────────────────────────────────────────────

  async listDeals(credentials: Credentials, params: QueryParams): Promise<Deal[]> {
    const items = await this.listPage<RawActiveCampaignDeal>(credentials, '/deals', 'deals', params)
    return items.map(transformDeal)
  }

  async getDeal(credentials: Credentials, id: string): Promise<Deal> {
    const raw = await this.client(credentials).get<RawActiveCampaignDeal>(`/deals/${id}`, 'deal')
    return transformDeal(raw)
  }

  async createDeal(credentials: Credentials, data: Partial<Deal>): Promise<Deal> {
    const raw = await this.client(credentials).post<RawActiveCampaignDeal>('/deals', 'deal', {
      deal: untransformDeal(data),
    })
    return transformDeal(raw)
  }

  async updateDeal(credentials: Credentials, id: string, data: Partial<Deal>): Promise<Deal> {
    const raw = await this.client(credentials).put<RawActiveCampaignDeal>(`/deals/${id}`, 'deal', {
      deal: untransformDeal(data),
    })
    return transformDeal(raw)
  }

  async deleteDeal(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/deals/${id}`)
  }

  // ── Pipelines (Deal Groups — read-only) ───────────────────────────────────

  async listPipelines(credentials: Credentials, params: QueryParams): Promise<Pipeline[]> {
    const client = this.client(credentials)
    const pipelines = await this.listPage<RawActiveCampaignPipeline>(
      credentials,
      '/dealGroups',
      'dealGroups',
      params,
    )

    // Every stage, paged at the documented maximum (limit=500 was cut to
    // 100 upstream, dropping the rest), then grouped by pipeline.
    const allStages = await this.listAll<RawActiveCampaignStage>(
      client,
      '/dealStages',
      'dealStages',
    )

    return pipelines.map((p) => {
      const pipelineId = String(p.id)
      const stages = allStages.filter(
        (s) => String((s as Record<string, unknown>)['group'] ?? '') === pipelineId,
      )
      return transformPipeline(p, stages)
    })
  }

  async getPipeline(credentials: Credentials, id: string): Promise<Pipeline> {
    const client = this.client(credentials)
    const raw = await client.get<RawActiveCampaignPipeline>(`/dealGroups/${id}`, 'dealGroup')
    const stagesRes = await client.rawGet<{ dealStages: RawActiveCampaignStage[] }>('/dealStages', {
      group: id,
      limit: 200,
    })
    const stages = stagesRes.dealStages ?? []
    return transformPipeline(raw, stages)
  }

  // ── Activities (Deal Tasks) ────────────────────────────────────────────────

  async listActivities(credentials: Credentials, params: QueryParams): Promise<Activity[]> {
    const items = await this.listPage<RawActiveCampaignTask>(
      credentials,
      '/dealTasks',
      'dealTasks',
      params,
    )
    return items.map(transformActivity)
  }

  async getActivity(credentials: Credentials, id: string): Promise<Activity> {
    const raw = await this.client(credentials).get<RawActiveCampaignTask>(
      `/dealTasks/${id}`,
      'dealTask',
    )
    return transformActivity(raw)
  }

  async createActivity(credentials: Credentials, data: Partial<Activity>): Promise<Activity> {
    const raw = await this.client(credentials).post<RawActiveCampaignTask>(
      '/dealTasks',
      'dealTask',
      { dealTask: untransformActivity(data) },
    )
    return transformActivity(raw)
  }

  async updateActivity(
    credentials: Credentials,
    id: string,
    data: Partial<Activity>,
  ): Promise<Activity> {
    const raw = await this.client(credentials).put<RawActiveCampaignTask>(
      `/dealTasks/${id}`,
      'dealTask',
      { dealTask: untransformActivity(data) },
    )
    return transformActivity(raw)
  }

  async deleteActivity(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/dealTasks/${id}`)
  }

  // ── Notes ─────────────────────────────────────────────────────────────────

  async listNotes(credentials: Credentials, params: QueryParams): Promise<Note[]> {
    const items = await this.listPage<RawActiveCampaignNote>(credentials, '/notes', 'notes', params)
    return items.map(transformNote)
  }

  async getNote(credentials: Credentials, id: string): Promise<Note> {
    const raw = await this.client(credentials).get<RawActiveCampaignNote>(`/notes/${id}`, 'note')
    return transformNote(raw)
  }

  async createNote(credentials: Credentials, data: Partial<Note>): Promise<Note> {
    const raw = await this.client(credentials).post<RawActiveCampaignNote>('/notes', 'note', {
      note: untransformNote(data),
    })
    return transformNote(raw)
  }

  async updateNote(credentials: Credentials, id: string, data: Partial<Note>): Promise<Note> {
    const raw = await this.client(credentials).put<RawActiveCampaignNote>(`/notes/${id}`, 'note', {
      note: untransformNote(data),
    })
    return transformNote(raw)
  }

  async deleteNote(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/notes/${id}`)
  }
}
