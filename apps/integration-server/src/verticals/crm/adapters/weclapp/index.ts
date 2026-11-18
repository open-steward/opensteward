/**
 * weclapp CRM adapter for the CRM vertical.
 *
 * Maps the weclapp REST API v1 to canonical CRM resources.
 * Docs: https://www.weclapp.com/api/
 *
 * ── Coverage ─────────────────────────────────────────────────────────────
 *
 * Implemented (12):
 *   Contacts:  list, get, create, update, delete   (partyType=PERSON)
 *   Companies: list, get, create, update, delete   (partyType=ORGANIZATION)
 *   Deals:     list, get, create, update, delete   (salesOpportunity)
 *   Pipelines: list                                (synthetic from salesStage)
 *
 * Omitted — not available in weclapp CRM API:
 *   Activities (all)
 *   Notes (all)
 *   Pipelines get
 *
 * Auth: API key sent as `AuthenticationToken` header
 * Tenant: base URL from `credentials.extra.instanceUrl`
 */

import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'
import type { Deal } from '../../schema/deal'
import type { Pipeline } from '../../schema/pipeline'
import type { WebhookEvent } from '../../schema/webhook'

import { CREDENTIAL_FORM } from './auth'
import { WeclappClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'
import { pageLocally } from '@opensteward/shared'
import { verifyWebhook as _verifyWebhook, parseWebhookEvents as _parseWebhookEvents } from './webhook'
import { transformContact, untransformContact, type RawWeclappCustomer } from './transform/contact'
import { transformCompany, untransformCompany, type RawWeclappOrganization } from './transform/company'
import { transformDeal, untransformDeal, type RawWeclappSalesOpportunity } from './transform/deal'
import { transformPipelineFromStages, type RawWeclappSalesStage } from './transform/pipeline'

/** weclapp: pageSize "is usually limited 1000"; salesStage notes no exception. */
const MAX_PAGE_SIZE = 1000
/** Bounds the stage drain: 50,000 stages is far past any real tenant. */
const MAX_STAGE_PAGES = 50

export interface WeclappAdapterConfig {
  apiKey?: string
  instanceUrl?: string
}


export class WeclappAdapter implements CrmAdapter {

  // Connect Link support — per-customer form (see ./auth.ts).

  credentialFields = CREDENTIAL_FORM.credentialFields

  exchangeCredentials = CREDENTIAL_FORM.exchangeCredentials

  readonly platform = 'weclapp'
  readonly version = '0.1.0'

  private apiKey: string | undefined
  private instanceUrl: string | undefined

  constructor(config: WeclappAdapterConfig = {}) {
    this.apiKey = config.apiKey
    this.instanceUrl = config.instanceUrl
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    return ''
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    if (!this.apiKey) throw new Error('weclapp: apiKey required')
    return {
      accessToken: this.apiKey,
      extra: { instanceUrl: this.instanceUrl },
    }
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

  private c(creds: Credentials): WeclappClient {
    if (this.apiKey) {
      return new WeclappClient({
        accessToken: this.apiKey,
        extra: { instanceUrl: this.instanceUrl ?? (creds.extra?.['instanceUrl'] as string | undefined) },
      })
    }
    return new WeclappClient(creds)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    return {
      pageSize: params['limit'] ?? DEFAULT_PAGE_SIZE,
      page: params['page'] ?? 1,
    }
  }

  // ── Contacts (partyType=PERSON) ───────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const { items } = await this.c(credentials).list<RawWeclappCustomer>(
      '/customer',
      { ...this.listParams(params), 'partyType-eq': 'PERSON' },
    )
    return items.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const raw = await this.c(credentials).get<RawWeclappCustomer>(`/customer/id/${id}`)
    return transformContact(raw)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const raw = await this.c(credentials).post<RawWeclappCustomer>('/customer', untransformContact(data))
    return transformContact(raw)
  }

  async updateContact(credentials: Credentials, id: string, data: Partial<Contact>): Promise<Contact> {
    const raw = await this.c(credentials).put<RawWeclappCustomer>(`/customer/id/${id}`, untransformContact(data))
    return transformContact(raw)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    await this.c(credentials).delete(`/customer/id/${id}`)
  }

  // ── Companies (partyType=ORGANIZATION) ───────────────────────────────────

  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    const { items } = await this.c(credentials).list<RawWeclappOrganization>(
      '/customer',
      { ...this.listParams(params), 'partyType-eq': 'ORGANIZATION' },
    )
    return items.map(transformCompany)
  }

  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    const raw = await this.c(credentials).get<RawWeclappOrganization>(`/customer/id/${id}`)
    return transformCompany(raw)
  }

  async createCompany(credentials: Credentials, data: Partial<Company>): Promise<Company> {
    const raw = await this.c(credentials).post<RawWeclappOrganization>('/customer', untransformCompany(data))
    return transformCompany(raw)
  }

  async updateCompany(credentials: Credentials, id: string, data: Partial<Company>): Promise<Company> {
    const raw = await this.c(credentials).put<RawWeclappOrganization>(`/customer/id/${id}`, untransformCompany(data))
    return transformCompany(raw)
  }

  async deleteCompany(credentials: Credentials, id: string): Promise<void> {
    await this.c(credentials).delete(`/customer/id/${id}`)
  }

  // ── Deals (salesOpportunity) ─────────────────────────────────────────────

  async listDeals(credentials: Credentials, params: QueryParams): Promise<Deal[]> {
    const { items } = await this.c(credentials).list<RawWeclappSalesOpportunity>(
      '/salesOpportunity',
      this.listParams(params),
    )
    return items.map(transformDeal)
  }

  async getDeal(credentials: Credentials, id: string): Promise<Deal> {
    const raw = await this.c(credentials).get<RawWeclappSalesOpportunity>(`/salesOpportunity/id/${id}`)
    return transformDeal(raw)
  }

  async createDeal(credentials: Credentials, data: Partial<Deal>): Promise<Deal> {
    const raw = await this.c(credentials).post<RawWeclappSalesOpportunity>('/salesOpportunity', untransformDeal(data))
    return transformDeal(raw)
  }

  async updateDeal(credentials: Credentials, id: string, data: Partial<Deal>): Promise<Deal> {
    const raw = await this.c(credentials).put<RawWeclappSalesOpportunity>(`/salesOpportunity/id/${id}`, untransformDeal(data))
    return transformDeal(raw)
  }

  async deleteDeal(credentials: Credentials, id: string): Promise<void> {
    await this.c(credentials).delete(`/salesOpportunity/id/${id}`)
  }

  // ── Pipelines (synthetic from salesStage) ────────────────────────────────

  /**
   * Every stage, drained page by page. weclapp: "pageSize cannot be arbitrarily
   * high it is usually limited 1000 [...] To get further results it is
   * necessary to skip entity instances, this is done using the page query
   * parameter" (https://www.weclapp.com/api/openapi_v1.yaml). The {result}
   * envelope carries no total, so a short page is the end.
   */
  private async allStages(credentials: Credentials): Promise<RawWeclappSalesStage[]> {
    const client = this.c(credentials)
    const stages: RawWeclappSalesStage[] = []
    for (let page = 1; page <= MAX_STAGE_PAGES; page++) {
      const { items } = await client.list<RawWeclappSalesStage>('/salesStage', {
        pageSize: MAX_PAGE_SIZE,
        page,
      })
      stages.push(...items)
      if (items.length < MAX_PAGE_SIZE) break
    }
    return stages
  }

  async listPipelines(credentials: Credentials, params: QueryParams): Promise<Pipeline[]> {
    // One synthetic pipeline built from every stage: page 2 is empty, not a
    // second pipeline under the same id.
    const stages = await this.allStages(credentials)
    return pageLocally(stages.length === 0 ? [] : [transformPipelineFromStages(stages)], params)
  }
}
