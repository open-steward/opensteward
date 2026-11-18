import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Invoice } from '../../schema/invoice'
import type { Contact } from '../../schema/contact'
import type { Account } from '../../schema/account'
import type { Organization } from '../../schema/organization'

import { buildAuthUrl, exchangeCode, refreshAccessToken } from './auth'
import { MyobClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'

import { transformInvoice, type MyobInvoice } from './transform/invoice'
import { transformContact, type MyobContact } from './transform/contact'
import { transformAccount, type MyobAccount } from './transform/account'
import { transformOrganization, type MyobCompanyFile } from './transform/organization'

interface MyobAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes: string[]
  apiKey?: string
}

interface MyobList<T> {
  Count: number
  NextPageLink: string | null
  Items: T[]
}

export class MyobAdapter implements AccountingAdapter {
  readonly platform = 'myob'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]
  private apiKey: string

  constructor(config: MyobAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes
    this.apiKey = config.apiKey ?? ''
  }

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(this.clientId, this.redirectUri, (overrideScopes ?? this.scopes), state)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    const creds = await exchangeCode(code, this.clientId, this.clientSecret, redirectUri)
    creds.extra = { apiKey: this.apiKey }
    return creds
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    if (!credentials.refreshToken) throw new Error('No refresh token available')
    const creds = await refreshAccessToken(credentials.refreshToken, this.clientId, this.clientSecret)
    creds.tenantId = credentials.tenantId
    creds.extra = credentials.extra
    return creds
  }

  // --- Organization ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new MyobClient(credentials)
    const res = await client.get<MyobList<MyobCompanyFile>>('?returnBody=true')
    return transformOrganization(res.Items[0])
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new MyobClient(credentials)
    const top = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, 400)
    const skip = ((params.page ?? 1) - 1) * top
    const filter = params.updatedAfter
      ? `&$filter=LastModified gt DateTime'${params.updatedAfter.toISOString()}'`
      : ''
    const res = await client.get<MyobList<MyobInvoice>>(
      `Sale/Invoice/Service?$top=${top}&$skip=${skip}${filter}`,
    )
    return (res.Items ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new MyobClient(credentials)
    const res = await client.get<MyobInvoice>(`Sale/Invoice/Service/${id}`)
    return transformInvoice(res)
  }

  // --- Contacts ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new MyobClient(credentials)
    const top = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, 400)
    const skip = ((params.page ?? 1) - 1) * top
    const res = await client.get<MyobList<MyobContact>>(
      `Contact/Customer?$top=${top}&$skip=${skip}`,
    )
    return (res.Items ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new MyobClient(credentials)
    const res = await client.get<MyobContact>(`Contact/Customer/${id}`)
    return transformContact(res)
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new MyobClient(credentials)
    const top = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, 400)
    const skip = ((params.page ?? 1) - 1) * top
    const res = await client.get<MyobList<MyobAccount>>(
      `GeneralLedger/Account?$top=${top}&$skip=${skip}`,
    )
    return (res.Items ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new MyobClient(credentials)
    const res = await client.get<MyobAccount>(`GeneralLedger/Account/${id}`)
    return transformAccount(res)
  }
}
