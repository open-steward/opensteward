import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Invoice } from '../../schema/invoice'
import type { Bill } from '../../schema/bill'
import type { Contact } from '../../schema/contact'
import type { Account } from '../../schema/account'
import type { Organization } from '../../schema/organization'

import { buildAuthUrl, exchangeCode, refreshAccessToken } from './auth'
import { TeamSystemClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'

import { transformInvoice, type TeamSystemInvoice } from './transform/invoice'
import { transformBill, type TeamSystemBill } from './transform/bill'
import { transformContact, type TeamSystemContact } from './transform/contact'
import { transformAccount, type TeamSystemAccount } from './transform/account'
import { transformOrganization, type TeamSystemCompany } from './transform/organization'

interface TeamSystemAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes: string[]
}

export class TeamSystemAdapter implements AccountingAdapter {
  readonly platform = 'teamsystem'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: TeamSystemAdapterConfig) {
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

  private client(credentials: Credentials): TeamSystemClient {
    return new TeamSystemClient(credentials)
  }

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = this.client(credentials)
    const res = await client.get<{ data: TeamSystemCompany }>('company')
    return transformOrganization(res.data)
  }

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = this.client(credentials)
    const res = await client.get<{ data: TeamSystemInvoice[] }>('invoices', {
      page: params.page ?? 1,
      pageSize: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, 100),
    })
    return (res.data ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = this.client(credentials)
    const res = await client.get<{ data: TeamSystemInvoice }>(`invoices/${id}`)
    return transformInvoice(res.data)
  }

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = this.client(credentials)
    const res = await client.get<{ data: TeamSystemBill[] }>('purchase_invoices', {
      page: params.page ?? 1,
      pageSize: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, 100),
    })
    return (res.data ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = this.client(credentials)
    const res = await client.get<{ data: TeamSystemBill }>(`purchase_invoices/${id}`)
    return transformBill(res.data)
  }

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = this.client(credentials)
    const res = await client.get<{ data: TeamSystemContact[] }>('contacts', {
      page: params.page ?? 1,
      pageSize: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, 100),
    })
    return (res.data ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = this.client(credentials)
    const res = await client.get<{ data: TeamSystemContact }>(`contacts/${id}`)
    return transformContact(res.data)
  }

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = this.client(credentials)
    const res = await client.get<{ data: TeamSystemAccount[] }>('accounts', {
      page: params.page ?? 1,
      pageSize: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, 100),
    })
    return (res.data ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = this.client(credentials)
    const res = await client.get<{ data: TeamSystemAccount }>(`accounts/${id}`)
    return transformAccount(res.data)
  }
}
