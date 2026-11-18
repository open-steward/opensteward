import { customForm, pageOffset, reportUpstreamPage } from '@opensteward/shared'
/**
 * EspoCRM adapter for the CRM vertical.
 *
 * Maps the EspoCRM REST API to canonical CRM resources.
 * Docs: https://docs.espocrm.com/development/api/
 *
 * Auth: API key via X-Api-Key header (self-hosted)
 * Base URL: {credentials.extra.instanceUrl}/api/v1 (self-hosted; no default host)
 * Notable:
 *   - Open-source, self-hosted CRM (European community)
 *   - Contact → Contact, Account → Company, Opportunity → Deal
 *   - Pagination: offset + maxSize query params (maxSize maximum 200)
 *   - Response: { list: [...], total: N }
 *
 * ── Coverage ─────────────────────────────────────────────────────────────
 *
 * Implemented (20):
 *   Contacts: list, get, create, update, delete
 *   Companies (Accounts): list, get, create, update, delete
 *   Deals (Opportunities): list, get, create, update, delete
 *   Pipelines: list (Pipeline entity, v10.0+, with its stages)
 *   Activities (Tasks): list, get, create
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

import { EspoCrmClient } from './client'
import { verifyWebhook, parseWebhookEvents } from './webhook'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'
import { transformContact, untransformContact, type RawEspoCrmContact } from './transform/contact'
import { transformCompany, untransformCompany, type RawEspoCrmAccount } from './transform/company'
import { transformDeal, untransformDeal, type RawEspoCrmOpportunity } from './transform/deal'
import {
  transformPipeline,
  type RawEspoCrmPipeline,
  type RawEspoCrmPipelineStage,
} from './transform/pipeline'
import { transformActivity, untransformActivity, type RawEspoCrmTask } from './transform/activity'
import { transformNote, untransformNote, type RawEspoCrmNote } from './transform/note'

export interface EspoCrmAdapterConfig {
  apiKey?: string
}
/**
 * https://docs.espocrm.com/development/api/: "Client implementations require
 * specifying the Site URL. It's an URL that you open in the browser to use
 * EspoCRM." and "Authentication header: X-Api-Key:
 * API_KEY_COPIED_FROM_THE_USER_DETAIL_VIEW".
 */
const CRED_FORM = customForm({
  fields: [
    {
      name: 'instanceUrl',
      label: 'Site URL',
      type: 'url',
      placeholder: 'https://crm.example.com',
      helpText: 'The URL you open in the browser to use EspoCRM, without /api/v1.',
      required: true,
    },
    {
      name: 'apiKey',
      label: 'API key',
      type: 'password',
      helpText:
        'From Administration > API Users: an API User with the API Key authentication method.',
      required: true,
    },
  ],
  exchange: async (fields: Record<string, string>): Promise<Credentials> => {
    const instanceUrl = (fields['instanceUrl'] ?? '').trim().replace(/\/+$/, '')
    const apiKey = (fields['apiKey'] ?? '').trim()
    if (!instanceUrl) throw new Error('Site URL is required.')
    if (!apiKey) throw new Error('API key is required.')
    return { accessToken: apiKey, extra: { instanceUrl } }
  },
})

/**
 * Pipelines of Opportunities only: the canonical Pipeline is a deal pipeline,
 * and https://docs.espocrm.com/general/pipelines/ says "The Pipelines feature
 * can be enabled for: Leads, Opportunities, Custom entity types ...".
 * Where item shape from https://docs.espocrm.com/development/api-search-params/.
 */
const OPPORTUNITY_PIPELINES = [{ type: 'equals', attribute: 'entityType', value: 'Opportunity' }]

export class EspoCrmAdapter implements CrmAdapter {
  // Connect Link support — site URL + API key.
  credentialFields = CRED_FORM.credentialFields
  exchangeCredentials = CRED_FORM.exchangeCredentials

  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  readonly platform = 'espocrm'
  readonly version = '0.1.0'

  constructor(_config: EspoCrmAdapterConfig = {}) {}

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

  private client(credentials: Credentials): EspoCrmClient {
    return new EspoCrmClient(credentials)
  }

  /**
   * The caller's page as EspoCRM's `offset` + `maxSize`
   * (https://docs.espocrm.com/development/api/crud/: "maxSize – int – max
   * size." / "offset – int – offset."), clamped to the documented maximum of 200.
   */
  private pageWindow(params: QueryParams): { offset: number; maxSize: number; asked: number } {
    const raw = Number(params.limit ?? DEFAULT_PAGE_SIZE)
    const asked = Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : DEFAULT_PAGE_SIZE
    const maxSize = Math.min(asked, MAX_PAGE_SIZE)
    return { offset: pageOffset(params, maxSize), maxSize, asked }
  }

  /**
   * The end of the collection from `total`. From the CRUD doc: "if the record
   * count is disabled for the entity type, -1 or -2 will be returned instead of
   * the actual total number of records. -1 means that there are more records";
   * the API reference adds "-2 – there are no more records".
   */
  private reportPage(
    params: QueryParams,
    window: { offset: number; maxSize: number; asked: number },
    rows: number,
    total: number | undefined,
  ): void {
    const size = window.maxSize < window.asked ? { pageSize: window.maxSize } : {}
    if (total === undefined) {
      reportUpstreamPage(params, size)
    } else if (total >= 0) {
      reportUpstreamPage(params, {
        ...size,
        totalCount: total,
        hasMore: window.offset + rows < total,
      })
    } else if (total === -1) {
      reportUpstreamPage(params, { ...size, hasMore: true })
    } else if (total === -2) {
      reportUpstreamPage(params, { ...size, hasMore: false })
    } else {
      reportUpstreamPage(params, size)
    }
  }

  /** One caller page of `GET {entityType}`. */
  private async listPage<T>(
    credentials: Credentials,
    path: string,
    params: QueryParams,
  ): Promise<T[]> {
    const window = this.pageWindow(params)
    const { items, total } = await this.client(credentials).list<T>(path, {
      offset: window.offset,
      maxSize: window.maxSize,
    })
    this.reportPage(params, window, items.length, total)
    return items
  }

  /**
   * Every stage of one pipeline, through the documented related-records list
   * (https://docs.espocrm.com/development/api/relationships/): "GET
   * {entityType}/{id}/{link}" with maxSize, offset, orderBy, order. The link
   * is `stages` (Pipeline.json: "stages": {"type": "hasMany", "entity":
   * "PipelineStage", ... "orderBy": "order"}).
   */
  private async allStages(
    client: EspoCrmClient,
    pipelineId: string,
  ): Promise<RawEspoCrmPipelineStage[]> {
    const out: RawEspoCrmPipelineStage[] = []
    for (;;) {
      const offset = out.length
      const { items, total } = await client.list<RawEspoCrmPipelineStage>(
        `/Pipeline/${encodeURIComponent(pipelineId)}/stages`,
        { offset, maxSize: MAX_PAGE_SIZE, orderBy: 'order', order: 'asc' },
      )
      out.push(...items)
      if (items.length === 0 || total === -2) return out
      if (total === -1) continue
      if (total !== undefined && out.length >= total) return out
      if (total === undefined && items.length < MAX_PAGE_SIZE) return out
    }
  }

  // ── Contacts ──────────────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const items = await this.listPage<RawEspoCrmContact>(credentials, '/Contact', params)
    return items.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const res = await this.client(credentials).get<RawEspoCrmContact>(`/Contact/${id}`)
    return transformContact(res)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const body = untransformContact(data)
    const res = await this.client(credentials).post<RawEspoCrmContact>('/Contact', body)
    return transformContact(res)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const body = untransformContact(data)
    const res = await this.client(credentials).put<RawEspoCrmContact>(`/Contact/${id}`, body)
    return transformContact(res)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/Contact/${id}`)
  }

  // ── Companies (Accounts) ──────────────────────────────────────────────────

  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    const items = await this.listPage<RawEspoCrmAccount>(credentials, '/Account', params)
    return items.map(transformCompany)
  }

  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    const res = await this.client(credentials).get<RawEspoCrmAccount>(`/Account/${id}`)
    return transformCompany(res)
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const body = untransformCompany(data)
    const res = await this.client(credentials).post<RawEspoCrmAccount>('/Account', body)
    return transformCompany(res)
  }

  async updateCompany(
    credentials: Credentials,
    id: string,
    data: Partial<Company>,
  ): Promise<Company> {
    const body = untransformCompany(data)
    const res = await this.client(credentials).put<RawEspoCrmAccount>(`/Account/${id}`, body)
    return transformCompany(res)
  }

  async deleteCompany(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/Account/${id}`)
  }

  // ── Deals (Opportunities) ─────────────────────────────────────────────────

  async listDeals(credentials: Credentials, params: QueryParams): Promise<Deal[]> {
    const items = await this.listPage<RawEspoCrmOpportunity>(credentials, '/Opportunity', params)
    return items.map(transformDeal)
  }

  async getDeal(credentials: Credentials, id: string): Promise<Deal> {
    const res = await this.client(credentials).get<RawEspoCrmOpportunity>(`/Opportunity/${id}`)
    return transformDeal(res)
  }

  async createDeal(credentials: Credentials, data: Partial<Deal>): Promise<Deal> {
    const body = untransformDeal(data)
    const res = await this.client(credentials).post<RawEspoCrmOpportunity>('/Opportunity', body)
    return transformDeal(res)
  }

  async updateDeal(credentials: Credentials, id: string, data: Partial<Deal>): Promise<Deal> {
    const body = untransformDeal(data)
    const res = await this.client(credentials).put<RawEspoCrmOpportunity>(
      `/Opportunity/${id}`,
      body,
    )
    return transformDeal(res)
  }

  async deleteDeal(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/Opportunity/${id}`)
  }

  // ── Pipelines ─────────────────────────────────────────────────────────────

  /**
   * GET Pipeline (v10.0+) through the generic list
   * (https://docs.espocrm.com/development/api/crud/: "GET {entityType} Returns
   * a list of records of a specific entity type."), filtered to Opportunity
   * pipelines. The filter goes in `searchParams`: "It's also possible to pass
   * all search parameters in JSON format in a single query parameter
   * searchParams" (https://docs.espocrm.com/development/api-search-params/),
   * so offset and maxSize travel inside it too.
   *
   * There is no OpportunityStage entity type: the old call 404'd on every
   * instance and was swallowed into "no pipelines".
   */
  async listPipelines(credentials: Credentials, params: QueryParams): Promise<Pipeline[]> {
    const client = this.client(credentials)
    const window = this.pageWindow(params)
    const { items, total } = await client.list<RawEspoCrmPipeline>('/Pipeline', {
      searchParams: JSON.stringify({
        offset: window.offset,
        maxSize: window.maxSize,
        where: OPPORTUNITY_PIPELINES,
      }),
    })
    this.reportPage(params, window, items.length, total)
    const out: Pipeline[] = []
    for (const raw of items) {
      out.push(transformPipeline(raw, await this.allStages(client, raw.id)))
    }
    return out
  }

  // ── Activities (Tasks) ────────────────────────────────────────────────────

  async listActivities(credentials: Credentials, params: QueryParams): Promise<Activity[]> {
    const items = await this.listPage<RawEspoCrmTask>(credentials, '/Task', params)
    return items.map(transformActivity)
  }

  async getActivity(credentials: Credentials, id: string): Promise<Activity> {
    const res = await this.client(credentials).get<RawEspoCrmTask>(`/Task/${id}`)
    return transformActivity(res)
  }

  async createActivity(credentials: Credentials, data: Partial<Activity>): Promise<Activity> {
    const body = untransformActivity(data)
    const res = await this.client(credentials).post<RawEspoCrmTask>('/Task', body)
    return transformActivity(res)
  }

  // ── Notes ─────────────────────────────────────────────────────────────────

  async listNotes(credentials: Credentials, params: QueryParams): Promise<Note[]> {
    const items = await this.listPage<RawEspoCrmNote>(credentials, '/Note', params)
    return items.map(transformNote)
  }

  async getNote(credentials: Credentials, id: string): Promise<Note> {
    const res = await this.client(credentials).get<RawEspoCrmNote>(`/Note/${id}`)
    return transformNote(res)
  }

  async createNote(credentials: Credentials, data: Partial<Note>): Promise<Note> {
    const body = untransformNote(data)
    const res = await this.client(credentials).post<RawEspoCrmNote>('/Note', body)
    return transformNote(res)
  }
}
