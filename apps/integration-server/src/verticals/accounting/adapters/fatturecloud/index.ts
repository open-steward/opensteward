import { toCalendarDate } from '../shared/transform'
import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Invoice } from '../../schema/invoice'
import type { Contact } from '../../schema/contact'
import type { Account } from '../../schema/account'
import type { Organization } from '../../schema/organization'

import { buildAuthUrl, exchangeCode, refreshAccessToken } from './auth'
import type { CredentialField } from '@opensteward/shared'
import { FattureCloudClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, type FattureCloudInvoice } from './transform/invoice'
import { transformContact, type FattureCloudClient as FattureCloudClientModel } from './transform/contact'
import { transformAccount, type FattureCloudAccount } from './transform/account'
import { transformOrganization, type FattureCloudCompany } from './transform/organization'

interface FattureCloudAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes: string[]
  companyId?: string
}

interface FattureCloudPage<T> {
  data: T[]
  current_page: number
  last_page: number
  per_page: number
  total: number
}

export class FattureCloudAdapter implements AccountingAdapter {
  readonly platform = 'fatturecloud'
  readonly version = '0.1.0'

  /** Every list sends at most 50 per page; the router and the sync worker ask for no more. */
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]
  /** Deployment-wide preferred company, used only when the customer names none. */
  private companyId?: string

  constructor(config: FattureCloudAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes
    this.companyId = config.companyId
  }

  /**
   * Optional: only a user who can access several companies needs to say which.
   * The company itself is discovered from `GET /user/companies` after the
   * exchange and stored as `tenantId` / `extra.companyId`.
   */
  oauthFields(): CredentialField[] {
    return [
      {
        name: 'companyId',
        label: 'Company (only if you manage several)',
        type: 'text',
        required: false,
        placeholder: 'Company name or ID',
        helpText: 'Leave blank if your Fatture in Cloud user has a single company.',
      },
    ]
  }

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(this.clientId, this.redirectUri, (overrideScopes ?? this.scopes), state)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return exchangeCode(code, this.clientId, this.clientSecret, redirectUri, this.companyId)
  }

  /** Exchange, then record the company the customer named (or their only one). */
  async exchangeCodeWithInputs(
    code: string,
    redirectUri: string,
    inputs: Record<string, string>,
  ): Promise<Credentials> {
    return exchangeCode(
      code,
      this.clientId,
      this.clientSecret,
      redirectUri,
      inputs['companyId'] || this.companyId,
    )
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    if (!credentials.refreshToken) throw new Error('No refresh token available')
    const creds = await refreshAccessToken(credentials.refreshToken, this.clientId, this.clientSecret)
    creds.tenantId = credentials.tenantId
    if (credentials.extra) creds.extra = { ...credentials.extra }
    return creds
  }

  private client(credentials: Credentials): FattureCloudClient {
    return new FattureCloudClient(credentials)
  }

  // --- Organization ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = this.client(credentials)
    const res = await client.get<{ data: FattureCloudCompany }>('info')
    return transformOrganization(res.data)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = this.client(credentials)
    const perPage = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const page = params.page ?? 1
    const res = await client.get<FattureCloudPage<FattureCloudInvoice>>('issued_documents', {
      type: 'invoice',
      page,
      per_page: perPage,
    })
    return (res.data ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = this.client(credentials)
    const res = await client.get<{ data: FattureCloudInvoice }>(`issued_documents/${id}`)
    return transformInvoice(res.data)
  }

  async createInvoice(credentials: Credentials, data: Partial<Invoice>): Promise<Invoice> {
    const client = this.client(credentials)
    const res = await client.post<{ data: FattureCloudInvoice }>('issued_documents', {
      data: {
        type: 'invoice',
        entity: data.contactId ? { id: parseInt(data.contactId) } : undefined,
        date: toCalendarDate(data.postedAt),
        currency: data.currency ? { id: data.currency } : undefined,
        items_list: data.lineItems?.map((li) => ({
          product_id: li.itemId ? parseInt(li.itemId) : undefined,
          name: li.itemDescription,
          qty: li.unitQuantity,
          cost: li.unitAmount,
          net_price: li.unitAmount,
        })),
      },
    })
    return transformInvoice(res.data)
  }

  // --- Contacts ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = this.client(credentials)
    const perPage = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const res = await client.get<FattureCloudPage<FattureCloudClientModel>>('entities/clients', {
      page: params.page ?? 1,
      per_page: perPage,
    })
    return (res.data ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = this.client(credentials)
    const res = await client.get<{ data: FattureCloudClientModel }>(`entities/clients/${id}`)
    return transformContact(res.data)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const client = this.client(credentials)
    const res = await client.post<{ data: FattureCloudClientModel }>('entities/clients', {
      data: {
        name: data.name,
        vat_number: data.taxNumber,
        email: data.emails?.[0]?.email,
        phone: data.telephones?.[0]?.telephone,
        address_street: data.billingAddress?.address1,
        address_city: data.billingAddress?.city,
        address_postal_code: data.billingAddress?.postalCode,
        address_country: data.billingAddress?.country,
        type: data.companyName ? 'company' : 'person',
      },
    })
    return transformContact(res.data)
  }

  // --- Accounts (Chart of Accounts) ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = this.client(credentials)
    const perPage = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const res = await client.get<FattureCloudPage<FattureCloudAccount>>('vat_types', {
      page: params.page ?? 1,
      per_page: perPage,
    })
    return (res.data ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = this.client(credentials)
    const res = await client.get<{ data: FattureCloudAccount }>(`vat_types/${id}`)
    return transformAccount(res.data)
  }
}
