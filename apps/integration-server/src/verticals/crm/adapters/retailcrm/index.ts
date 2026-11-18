import { simpleApiKey } from '@opensteward/shared'
/**
 * RetailCRM adapter for the CRM vertical.
 *
 * Maps the RetailCRM REST API v5 to canonical CRM resources.
 * Docs: https://docs.retailcrm.ru/Developers/API/APIVersions/APIv5
 *
 * ── Coverage ─────────────────────────────────────────────────────────────
 *
 * Implemented (7):
 *   Contacts:  list, get
 *   Companies: list, get
 *   Deals:     list, get  (mapped from orders)
 *
 * Omitted — not standard in RetailCRM API:
 *   Contacts create/update/delete
 *   Companies create/update/delete
 *   Deals create/update/delete
 *   Pipelines (all)
 *   Activities (all)
 *   Notes (all)
 *
 * Auth: API key sent as `X-API-Key` header
 * Tenant: base URL from `credentials.extra.instanceUrl`
 */

import type { CrmAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Contact } from '../../schema/contact'
import type { Company } from '../../schema/company'
import type { Deal } from '../../schema/deal'
import type { WebhookEvent } from '../../schema/webhook'

import { RetailCrmClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'
import { verifyWebhook as _verifyWebhook, parseWebhookEvents as _parseWebhookEvents } from './webhook'
import { transformContact, type RawRetailCrmContact } from './transform/contact'
import { transformCompany, type RawRetailCrmCompany } from './transform/company'
import { transformDeal, type RawRetailCrmOrder } from './transform/deal'

export interface RetailCrmAdapterConfig {
  apiKey?: string
  instanceUrl?: string
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class RetailCrmAdapter implements CrmAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'retailcrm'
  readonly version = '0.1.0'

  private apiKey: string | undefined
  private instanceUrl: string | undefined

  constructor(config: RetailCrmAdapterConfig = {}) {
    this.apiKey = config.apiKey
    this.instanceUrl = config.instanceUrl
  }

  // ── Auth ───────────────────────────────────────────────────────────────────

  getAuthUrl(_state: string): string {
    return ''
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    if (!this.apiKey) throw new Error('RetailCRM: apiKey required')
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

  private c(creds: Credentials): RetailCrmClient {
    if (this.apiKey) {
      return new RetailCrmClient({
        accessToken: this.apiKey,
        extra: { instanceUrl: this.instanceUrl ?? (creds.extra?.['instanceUrl'] as string | undefined) },
      })
    }
    return new RetailCrmClient(creds)
  }

  private listParams(params: QueryParams): Record<string, unknown> {
    return {
      limit: params['limit'] ?? DEFAULT_PAGE_SIZE,
      page: params['page'] ?? 1,
    }
  }

  // ── Contacts ──────────────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const { items } = await this.c(credentials).list<RawRetailCrmContact>(
      'customers',
      '/customers',
      this.listParams(params),
    )
    return items.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const res = await this.c(credentials).get<{ customer: RawRetailCrmContact }>(`/customers/${id}`)
    return transformContact(res.customer)
  }

  // ── Companies ─────────────────────────────────────────────────────────────

  async listCompanies(credentials: Credentials, params: QueryParams): Promise<Company[]> {
    const { items } = await this.c(credentials).list<RawRetailCrmCompany>(
      'companies',
      '/companies',
      this.listParams(params),
    )
    return items.map(transformCompany)
  }

  async getCompany(credentials: Credentials, id: string): Promise<Company> {
    const res = await this.c(credentials).get<{ company: RawRetailCrmCompany }>(`/companies/${id}`)
    return transformCompany(res.company)
  }

  // ── Deals (Orders) ────────────────────────────────────────────────────────

  async listDeals(credentials: Credentials, params: QueryParams): Promise<Deal[]> {
    const { items } = await this.c(credentials).list<RawRetailCrmOrder>(
      'orders',
      '/orders',
      this.listParams(params),
    )
    return items.map(transformDeal)
  }

  async getDeal(credentials: Credentials, id: string): Promise<Deal> {
    const res = await this.c(credentials).get<{ order: RawRetailCrmOrder }>(`/orders/${id}`)
    return transformDeal(res.order)
  }
}
