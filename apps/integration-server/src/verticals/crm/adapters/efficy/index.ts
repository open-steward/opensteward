/**
 * Efficy CRM adapter for the CRM vertical.
 *
 * Reads go to the REST API that Efficy publishes on help.efficy.cloud under the
 * title "Maxo API" (not Efficy Enterprise's /crm/json RPC), an OpenAPI 3.0.2 spec at
 * https://help.efficy.cloud/api/efficyU_public_api_spec.yaml (rendered at
 * https://help.efficy.cloud/api/):
 *
 *   server:  https://customer-name.efficytest.cloud  (per customer → credentials.extra.instanceUrl)
 *   auth:    "include it in the `X-Api-Key` header in all API requests"
 *   lists:   GET /api/v1/{contacts,companies,opportunities,meetings}?offset=&limit=&order_by=
 *   reads:   GET /api/v1/{contacts,companies,opportunities,meetings}/{id}
 *
 * The spec has no pipeline, stage or note resource, so listPipelines,
 * listNotes and getNote refuse with 501 NOT_SUPPORTED before sending anything.
 *
 * The write methods (create/update/delete) still call the pre-rebuild paths
 * under /api/<entity> with Enterprise-style bodies; the spec's writes are
 * POST /api/v1/<plural> and PATCH /api/v1/<plural>/{id} and are not rebuilt here.
 */

import { callerLimit, customForm, pageOffset, reportUpstreamPage } from '@opensteward/shared'
import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { WebhookEvent } from '../../schema/webhook'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'
import type { Deal } from '../../schema/deal'
import type { Pipeline } from '../../schema/pipeline'
import type { Activity } from '../../schema/activity'
import type { Note } from '../../schema/note'

import { EfficyClient } from './client'
import { verifyWebhook, parseWebhookEvents } from './webhook'
import { transformContact, untransformContact, type RawEfficyContact } from './transform/contact'
import { transformCompany, untransformCompany, type RawEfficyCompany } from './transform/company'
import { transformDeal, untransformDeal, type RawEfficyDeal } from './transform/deal'
import {
  transformActivity,
  untransformActivity,
  type RawEfficyActivity,
} from './transform/activity'
import { transformNote, untransformNote, type RawEfficyNote } from './transform/note'

export interface EfficyAdapterConfig {
  apiKey?: string
}

/**
 * Site URL + API key. The spec's only server is per customer
 * ("https://customer-name.efficytest.cloud"), and the key comes from
 * "Admin Settings, then select API Key from the More section".
 */
const CRED_FORM = customForm({
  fields: [
    {
      name: 'instanceUrl',
      label: 'Site URL',
      type: 'url',
      helpText: 'The address of your Maxo (Efficy cloud) site, without /api/v1.',
      required: true,
    },
    {
      name: 'apiKey',
      label: 'API key',
      type: 'password',
      helpText: 'In Maxo: Admin Settings > More > API Key.',
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

function notSupported(message: string): Error {
  return Object.assign(new Error(message), {
    statusCode: 501,
    code: 'NOT_SUPPORTED',
  })
}

export class EfficyAdapter implements CrmAdapter {
  // Connect Link support — site URL + API key.
  credentialFields = CRED_FORM.credentialFields
  exchangeCredentials = CRED_FORM.exchangeCredentials

  readonly platform = 'efficy'
  readonly version = '0.1.0'

  constructor(_config: EfficyAdapterConfig = {}) {}

  // ── Auth (API key / session token — no standard OAuth flow) ───────────────

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

  private client(credentials: Credentials): EfficyClient {
    return new EfficyClient(credentials)
  }

  /**
   * One caller page of a documented list endpoint. Each list documents
   * `offset` ("Specify the starting index for pagination (default is 0).")
   * and `limit` ("Specify the maximum number of records to return (default
   * is 20).") with no maximum, so the caller's limit is sent as is. `order_by`
   * ("Specify the field(s) to order results by.") on `crm_id` keeps the order
   * stable between pages. The end is the documented `next` link ("Next page
   * of records"): no next, no more rows. A page shorter than the limit asked
   * for is the end too, whatever `next` says: an offset list cannot have rows
   * past a short page. That rule assumes the server honours `limit`: the spec
   * documents no maximum, so a silent server-side cap below the caller's limit
   * would end the walk after page 1. That gap is undocumented and recorded.
   */
  private async listPage<T>(
    credentials: Credentials,
    path: string,
    params: QueryParams,
  ): Promise<T[]> {
    const limit = callerLimit(params)
    const offset = pageOffset(params, limit)
    const { items, next } = await this.client(credentials).list<T>(path, {
      offset,
      limit,
      order_by: 'crm_id',
    })
    reportUpstreamPage(params, { hasMore: next !== undefined && items.length >= limit })
    return items
  }

  // ── Contacts (Cont) ───────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const items = await this.listPage<RawEfficyContact>(credentials, '/api/v1/contacts', params)
    return items.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const res = await this.client(credentials).get<RawEfficyContact>(
      `/api/v1/contacts/${encodeURIComponent(id)}`,
    )
    return transformContact(res)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const body = untransformContact(data)
    const res = await this.client(credentials).post<RawEfficyContact>('/api/contact', body)
    return transformContact(res)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const body = untransformContact(data)
    const res = await this.client(credentials).put<RawEfficyContact>(`/api/contact/${id}`, body)
    return transformContact(res)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/api/contact/${id}`)
  }

  // ── Companies (Comp) ──────────────────────────────────────────────────────

  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    const items = await this.listPage<RawEfficyCompany>(credentials, '/api/v1/companies', params)
    return items.map(transformCompany)
  }

  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    const res = await this.client(credentials).get<RawEfficyCompany>(
      `/api/v1/companies/${encodeURIComponent(id)}`,
    )
    return transformCompany(res)
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const body = untransformCompany(data)
    const res = await this.client(credentials).post<RawEfficyCompany>('/api/company', body)
    return transformCompany(res)
  }

  async updateCompany(
    credentials: Credentials,
    id: string,
    data: Partial<Company>,
  ): Promise<Company> {
    const body = untransformCompany(data)
    const res = await this.client(credentials).put<RawEfficyCompany>(`/api/company/${id}`, body)
    return transformCompany(res)
  }

  async deleteCompany(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/api/company/${id}`)
  }

  // ── Deals (Oppo) ──────────────────────────────────────────────────────────

  async listDeals(credentials: Credentials, params: QueryParams): Promise<Deal[]> {
    const items = await this.listPage<RawEfficyDeal>(credentials, '/api/v1/opportunities', params)
    return items.map(transformDeal)
  }

  async getDeal(credentials: Credentials, id: string): Promise<Deal> {
    const res = await this.client(credentials).get<RawEfficyDeal>(
      `/api/v1/opportunities/${encodeURIComponent(id)}`,
    )
    return transformDeal(res)
  }

  async createDeal(credentials: Credentials, data: Partial<Deal>): Promise<Deal> {
    const body = untransformDeal(data)
    const res = await this.client(credentials).post<RawEfficyDeal>('/api/opportunity', body)
    return transformDeal(res)
  }

  async updateDeal(credentials: Credentials, id: string, data: Partial<Deal>): Promise<Deal> {
    const body = untransformDeal(data)
    const res = await this.client(credentials).put<RawEfficyDeal>(`/api/opportunity/${id}`, body)
    return transformDeal(res)
  }

  async deleteDeal(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/api/opportunity/${id}`)
  }

  // ── Pipelines ─────────────────────────────────────────────────────────────

  async listPipelines(_credentials: Credentials, _params: QueryParams): Promise<Pipeline[]> {
    throw notSupported(
      'Efficy cannot list pipelines: the public API (https://help.efficy.cloud/api/efficyU_public_api_spec.yaml) publishes no pipeline or stage resource, only an opportunity "status" field',
    )
  }

  // ── Activities (Acti) ─────────────────────────────────────────────────────

  async listActivities(credentials: Credentials, params: QueryParams): Promise<Activity[]> {
    const items = await this.listPage<RawEfficyActivity>(credentials, '/api/v1/meetings', params)
    return items.map(transformActivity)
  }

  async getActivity(credentials: Credentials, id: string): Promise<Activity> {
    const res = await this.client(credentials).get<RawEfficyActivity>(
      `/api/v1/meetings/${encodeURIComponent(id)}`,
    )
    return transformActivity(res)
  }

  async createActivity(credentials: Credentials, data: Partial<Activity>): Promise<Activity> {
    const body = untransformActivity(data)
    const res = await this.client(credentials).post<RawEfficyActivity>('/api/action', body)
    return transformActivity(res)
  }

  // ── Notes ─────────────────────────────────────────────────────────────────

  async listNotes(_credentials: Credentials, _params: QueryParams): Promise<Note[]> {
    throw notSupported(
      'Efficy cannot list notes: the public API (https://help.efficy.cloud/api/efficyU_public_api_spec.yaml) publishes no note resource; its paths are companies, contacts, conversations, documents, meetings, opportunities, products and requests, and a conversation (even channel "note") is one of the "ticket Conversations stored in the CRM", "directly linked to a ticket", with no contact, company or opportunity to attach a note to',
    )
  }

  async getNote(_credentials: Credentials, _id: string): Promise<Note> {
    throw notSupported(
      'Efficy cannot read notes: the public API (https://help.efficy.cloud/api/efficyU_public_api_spec.yaml) publishes no note resource',
    )
  }

  async createNote(credentials: Credentials, data: Partial<Note>): Promise<Note> {
    const body = untransformNote(data)
    const res = await this.client(credentials).post<RawEfficyNote>('/api/note', body)
    return transformNote(res)
  }
}
