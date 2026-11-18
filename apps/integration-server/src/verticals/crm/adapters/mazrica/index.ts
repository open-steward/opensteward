/**
 * Mazrica Sales adapter for the CRM vertical.
 *
 * Maps the Mazrica Open API v1 to canonical CRM resources.
 * Docs: https://mazrica.com/developers/api/
 *
 * ── Auth ─────────────────────────────────────────────────────────────────
 *   API key passed as `X-Api-Key` header on every request.
 *   credentials.accessToken = Mazrica API key (generated in admin settings)
 *
 * ── Coverage ─────────────────────────────────────────────────────────────
 *
 * Implemented (9):
 *   Contacts: list, get, create, update, delete
 *   Companies (customers): list, get, create, update, delete
 *   Deals: list, get, create, update, delete
 *   Pipelines (deal types): list, get
 *   Activities (actions): list, get, create, update, delete (per-customer scoped)
 *
 * Omitted — registry returns HTTP 501 automatically:
 *   Notes — no dedicated notes endpoint in the Mazrica API
 *   Webhooks — not documented in the Mazrica Open API v1
 */

// ── Resource coverage ──────────────────────────────────────────────────────
// Unavailable: note — The Mazrica Open API v1 has no dedicated notes/memo endpoint;
//              memo text is a sub-field on action (activity) objects only.

import { pageLocally, simpleApiKey } from '@opensteward/shared'
import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'
import type { Deal } from '../../schema/deal'
import type { Pipeline } from '../../schema/pipeline'
import type { Activity } from '../../schema/activity'

import { MazricaClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'
import {
  transformContact,
  untransformContact,
  type RawMazricaContact,
} from './transform/contact'
import {
  transformCompany,
  untransformCompany,
  type RawMazricaCustomer,
} from './transform/company'
import {
  transformDeal,
  untransformDeal,
  type RawMazricaDeal,
} from './transform/deal'
import {
  transformPipeline,
  type RawMazricaDealType,
} from './transform/pipeline'
import {
  transformActivity,
  untransformActivity,
  type RawMazricaAction,
} from './transform/activity'

const SIMPLE_API_KEY_FORM = simpleApiKey({
  label: 'Mazrica API key',
  helpText: 'Generate your API key in Mazrica admin → Settings → API.',
})

export class MazricaAdapter implements CrmAdapter {
  // Connect Link support — single API-key form.
  credentialFields = SIMPLE_API_KEY_FORM.credentialFields
  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'mazrica'
  readonly version = '0.1.0'

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    // Mazrica uses API key auth, not OAuth2.
    return ''
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    // Caller passes the API key as `code`.
    return { accessToken: code }
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  // ── Private ────────────────────────────────────────────────────────────────

  private client(credentials: Credentials): MazricaClient {
    return new MazricaClient(credentials)
  }

  private pageParams(params: QueryParams): Record<string, unknown> {
    return {
      page: params['page'] ?? 1,
      limit: params.limit ?? DEFAULT_PAGE_SIZE,
    }
  }

  // ── Contacts ──────────────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const raw = await this.client(credentials).list<RawMazricaContact>(
      '/contacts',
      'contacts',
      this.pageParams(params),
    )
    return raw.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const raw = await this.client(credentials).get<RawMazricaContact>(`/contacts/${id}`)
    return transformContact(raw)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const raw = await this.client(credentials).post<RawMazricaContact>(
      '/contacts',
      untransformContact(data),
    )
    return transformContact(raw)
  }

  async updateContact(credentials: Credentials, id: string, data: Partial<Contact>): Promise<Contact> {
    const raw = await this.client(credentials).patch<RawMazricaContact>(
      `/contacts/${id}`,
      untransformContact(data),
    )
    return transformContact(raw)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/contacts/${id}`)
  }

  // ── Companies (Customers) ──────────────────────────────────────────────────

  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    const raw = await this.client(credentials).list<RawMazricaCustomer>(
      '/customers',
      'customers',
      this.pageParams(params),
    )
    return raw.map(transformCompany)
  }

  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    const raw = await this.client(credentials).get<RawMazricaCustomer>(`/customers/${id}`)
    return transformCompany(raw)
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const raw = await this.client(credentials).post<RawMazricaCustomer>(
      '/customers',
      untransformCompany(data),
    )
    return transformCompany(raw)
  }

  async updateCompany(credentials: Credentials, id: string, data: Partial<Company>): Promise<Company> {
    const raw = await this.client(credentials).patch<RawMazricaCustomer>(
      `/customers/${id}`,
      untransformCompany(data),
    )
    return transformCompany(raw)
  }

  async deleteCompany(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/customers/${id}`)
  }

  // ── Deals ──────────────────────────────────────────────────────────────────

  async listDeals(credentials: Credentials, params: QueryParams): Promise<Deal[]> {
    const raw = await this.client(credentials).list<RawMazricaDeal>(
      '/deals',
      'deals',
      this.pageParams(params),
    )
    return raw.map(transformDeal)
  }

  async getDeal(credentials: Credentials, id: string): Promise<Deal> {
    const raw = await this.client(credentials).get<RawMazricaDeal>(`/deals/${id}`)
    return transformDeal(raw)
  }

  async createDeal(credentials: Credentials, data: Partial<Deal>): Promise<Deal> {
    const raw = await this.client(credentials).post<RawMazricaDeal>(
      '/deals',
      untransformDeal(data),
    )
    return transformDeal(raw)
  }

  async updateDeal(credentials: Credentials, id: string, data: Partial<Deal>): Promise<Deal> {
    const raw = await this.client(credentials).patch<RawMazricaDeal>(
      `/deals/${id}`,
      untransformDeal(data),
    )
    return transformDeal(raw)
  }

  async deleteDeal(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/deals/${id}`)
  }

  // ── Pipelines (Deal Types) ─────────────────────────────────────────────────

  // GET /deal_setting/deal_types documents no parameters at all ("案件タイプのリスト取得",
  // https://mazrica.com/developers/api/): it returns every deal type, so page it locally.
  async listPipelines(credentials: Credentials, params: QueryParams): Promise<Pipeline[]> {
    const raw = await this.client(credentials).list<RawMazricaDealType>(
      '/deal_setting/deal_types',
      'dealTypes',
    )
    return pageLocally(raw.map(transformPipeline), params)
  }

  async getPipeline(credentials: Credentials, id: string): Promise<Pipeline> {
    const raw = await this.client(credentials).get<RawMazricaDealType>(
      `/deal_setting/deal_types/${id}`,
    )
    return transformPipeline(raw)
  }

  // ── Activities (Actions) ───────────────────────────────────────────────────
  // Mazrica actions are scoped to a customer. When listing without a customer
  // context, we page through company IDs or fall back to deal-scoped actions.
  // For list/get without context, we use the query param `customerId` if provided.

  async listActivities(credentials: Credentials, params: QueryParams): Promise<Activity[]> {
    const customerId = params['customerId'] as string | undefined
    if (customerId) {
      const raw = await this.client(credentials).list<RawMazricaAction>(
        `/customers/${customerId}/actions`,
        'actions',
        this.pageParams(params),
      )
      return raw.map(transformActivity)
    }
    // Without a customerId, query contact-scoped actions
    const contactId = params['contactId'] as string | undefined
    if (contactId) {
      const raw = await this.client(credentials).list<RawMazricaAction>(
        `/contacts/${contactId}/actions`,
        'actions',
        this.pageParams(params),
      )
      return raw.map(transformActivity)
    }
    // Without any scope, query deal-scoped actions using dealId param
    const dealId = params['dealId'] as string | undefined
    if (dealId) {
      const raw = await this.client(credentials).list<RawMazricaAction>(
        `/deals/${dealId}/actions`,
        'actions',
        this.pageParams(params),
      )
      return raw.map(transformActivity)
    }
    return []
  }

  async getActivity(credentials: Credentials, id: string): Promise<Activity> {
    // Mazrica actions require both customerId and actionId in the path.
    // The id is expected as "customerId:actionId" composite.
    const [customerId, actionId] = id.split(':')
    if (!customerId || !actionId) {
      throw Object.assign(
        new Error(`Mazrica: activity id must be "customerId:actionId", got "${id}"`),
        { statusCode: 400 },
      )
    }
    const raw = await this.client(credentials).get<RawMazricaAction>(
      `/customers/${customerId}/actions/${actionId}`,
    )
    return transformActivity(raw)
  }

  async createActivity(credentials: Credentials, data: Partial<Activity>): Promise<Activity> {
    const customerId = data.company_id
    if (!customerId) {
      throw new Error('Mazrica: company_id (customerId) is required to create an activity')
    }
    const raw = await this.client(credentials).post<RawMazricaAction>(
      `/customers/${customerId}/actions`,
      untransformActivity(data),
    )
    return transformActivity(raw)
  }

  async updateActivity(credentials: Credentials, id: string, data: Partial<Activity>): Promise<Activity> {
    const [customerId, actionId] = id.split(':')
    if (!customerId || !actionId) {
      throw Object.assign(
        new Error(`Mazrica: activity id must be "customerId:actionId", got "${id}"`),
        { statusCode: 400 },
      )
    }
    const raw = await this.client(credentials).patch<RawMazricaAction>(
      `/customers/${customerId}/actions/${actionId}`,
      untransformActivity(data),
    )
    return transformActivity(raw)
  }

  async deleteActivity(credentials: Credentials, id: string): Promise<void> {
    const [customerId, actionId] = id.split(':')
    if (!customerId || !actionId) {
      throw Object.assign(
        new Error(`Mazrica: activity id must be "customerId:actionId", got "${id}"`),
        { statusCode: 400 },
      )
    }
    await this.client(credentials).delete(`/customers/${customerId}/actions/${actionId}`)
  }
}
