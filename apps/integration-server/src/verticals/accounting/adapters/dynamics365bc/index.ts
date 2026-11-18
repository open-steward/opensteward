import { toCalendarDate } from '../shared/transform'
import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Invoice } from '../../schema/invoice'
import type { Contact } from '../../schema/contact'
import type { Account } from '../../schema/account'
import type { Organization } from '../../schema/organization'

import { buildAuthUrl, exchangeCode, refreshAccessToken } from './auth'
import { Dynamics365BCClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'

import { transformInvoice, type BCInvoice } from './transform/invoice'
import { transformContact, type BCCustomer } from './transform/contact'
import { transformAccount, type BCAccount } from './transform/account'
import { transformOrganization, type BCCompany } from './transform/organization'

interface Dynamics365BCAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes: string[]
  tenantId?: string
  environment?: string
  companyId?: string
}

interface ODataList<T> {
  value: T[]
  '@odata.context': string
  '@odata.nextLink'?: string
}

export class Dynamics365BCAdapter implements AccountingAdapter {
  readonly platform = 'dynamics365bc'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]
  private tenantId: string
  private environment: string
  private companyId?: string

  constructor(config: Dynamics365BCAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes
    this.tenantId = config.tenantId ?? 'common'
    this.environment = config.environment ?? 'production'
    this.companyId = config.companyId
  }

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(this.clientId, this.redirectUri, overrideScopes ?? this.scopes, state, this.tenantId)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return exchangeCode(code, this.clientId, this.clientSecret, redirectUri, this.tenantId)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    if (!credentials.refreshToken) throw new Error('No refresh token available')
    const creds = await refreshAccessToken(credentials.refreshToken, this.clientId, this.clientSecret, this.tenantId)
    creds.tenantId = credentials.tenantId
    return creds
  }

  private client(credentials: Credentials): Dynamics365BCClient {
    return new Dynamics365BCClient(credentials, this.environment)
  }

  private companyPath(credentials: Credentials): string {
    const cid = this.companyId ?? credentials.extra?.['companyId'] as string | undefined
    return cid ? `companies(${cid})` : 'companies'
  }

  // --- Organization ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = this.client(credentials)
    const res = await client.get<ODataList<BCCompany>>('companies')
    return transformOrganization(res.value[0])
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = this.client(credentials)
    const top = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, 200)
    const skip = ((params.page ?? 1) - 1) * top
    const filter = params.updatedAfter
      ? `&$filter=lastModifiedDateTime gt ${params.updatedAfter.toISOString()}`
      : ''
    const res = await client.get<ODataList<BCInvoice>>(
      `${this.companyPath(credentials)}/salesInvoices?$top=${top}&$skip=${skip}&$expand=salesInvoiceLines${filter}`,
    )
    return (res.value ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = this.client(credentials)
    const res = await client.get<BCInvoice>(`${this.companyPath(credentials)}/salesInvoices(${id})?$expand=salesInvoiceLines`)
    return transformInvoice(res)
  }

  async createInvoice(credentials: Credentials, data: Partial<Invoice>): Promise<Invoice> {
    const client = this.client(credentials)
    const body: Record<string, unknown> = {
      customerId: data.contactId,
      currencyCode: data.currency,
      invoiceDate: toCalendarDate(data.postedAt),
      dueDate: toCalendarDate(data.dueAt),
    }
    const res = await client.post<BCInvoice>(`${this.companyPath(credentials)}/salesInvoices`, body)
    return transformInvoice(res)
  }

  // --- Contacts ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = this.client(credentials)
    const top = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, 200)
    const skip = ((params.page ?? 1) - 1) * top
    const res = await client.get<ODataList<BCCustomer>>(
      `${this.companyPath(credentials)}/customers?$top=${top}&$skip=${skip}`,
    )
    return (res.value ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = this.client(credentials)
    const res = await client.get<BCCustomer>(`${this.companyPath(credentials)}/customers(${id})`)
    return transformContact(res)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const client = this.client(credentials)
    const res = await client.post<BCCustomer>(`${this.companyPath(credentials)}/customers`, {
      displayName: data.name,
      email: data.emails?.[0]?.email,
      phoneNumber: data.telephones?.[0]?.telephone,
      currencyCode: data.currency,
    })
    return transformContact(res)
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = this.client(credentials)
    const top = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, 200)
    const skip = ((params.page ?? 1) - 1) * top
    const res = await client.get<ODataList<BCAccount>>(
      `${this.companyPath(credentials)}/accounts?$top=${top}&$skip=${skip}`,
    )
    return (res.value ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = this.client(credentials)
    const res = await client.get<BCAccount>(`${this.companyPath(credentials)}/accounts(${id})`)
    return transformAccount(res)
  }
}
