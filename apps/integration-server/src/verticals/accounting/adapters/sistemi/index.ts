import { simpleApiKey } from '@opensteward/shared'
import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Invoice } from '../../schema/invoice'
import type { Bill } from '../../schema/bill'
import type { Contact } from '../../schema/contact'
import type { Account } from '../../schema/account'
import type { Organization } from '../../schema/organization'

import { buildAuthUrl, exchangeCode, refreshAccessToken } from './auth'
import { SistemiClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'

import { transformInvoice } from './transform/invoice'
import { transformBill } from './transform/bill'
import { transformContact } from './transform/contact'
import { transformAccount } from './transform/account'
import { transformOrganization } from './transform/organization'

interface SistemiAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes: string[]
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class SistemiAdapter implements AccountingAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'sistemi'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: SistemiAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes
  }

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(this.clientId, this.redirectUri, (overrideScopes ?? this.scopes), state)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return exchangeCode(code, this.clientId, this.clientSecret, redirectUri)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    if (!credentials.refreshToken) throw new Error('No refresh token available')
    return refreshAccessToken(credentials.refreshToken, this.clientId, this.clientSecret)
  }

  private makeClient(credentials: Credentials): SistemiClient {
    return new SistemiClient(credentials)
  }

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = this.makeClient(credentials)
    const res = await client.get<{ data: Record<string, unknown> }>('company')
    return transformOrganization(res.data as Parameters<typeof transformOrganization>[0])
  }

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = this.makeClient(credentials)
    const res = await client.get<{ data: Parameters<typeof transformInvoice>[0][] }>('invoices', {
      page: params.page ?? 1,
      per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, 100),
    })
    return (res.data ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = this.makeClient(credentials)
    const res = await client.get<{ data: Parameters<typeof transformInvoice>[0] }>(`invoices/${id}`)
    return transformInvoice(res.data)
  }

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = this.makeClient(credentials)
    const res = await client.get<{ data: Parameters<typeof transformBill>[0][] }>('purchase_invoices', {
      page: params.page ?? 1,
      per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, 100),
    })
    return (res.data ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = this.makeClient(credentials)
    const res = await client.get<{ data: Parameters<typeof transformBill>[0] }>(`purchase_invoices/${id}`)
    return transformBill(res.data)
  }

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = this.makeClient(credentials)
    const res = await client.get<{ data: Parameters<typeof transformContact>[0][] }>('contacts', {
      page: params.page ?? 1,
      per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, 100),
    })
    return (res.data ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = this.makeClient(credentials)
    const res = await client.get<{ data: Parameters<typeof transformContact>[0] }>(`contacts/${id}`)
    return transformContact(res.data)
  }

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = this.makeClient(credentials)
    const res = await client.get<{ data: Parameters<typeof transformAccount>[0][] }>('accounts', {
      page: params.page ?? 1,
      per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, 100),
    })
    return (res.data ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = this.makeClient(credentials)
    const res = await client.get<{ data: Parameters<typeof transformAccount>[0] }>(`accounts/${id}`)
    return transformAccount(res.data)
  }
}
