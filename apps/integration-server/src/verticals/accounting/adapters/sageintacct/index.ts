import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Invoice } from '../../schema/invoice'
import type { Contact } from '../../schema/contact'
import type { Account } from '../../schema/account'
import type { Organization } from '../../schema/organization'

import { buildAuthUrl, exchangeCode, refreshAccessToken } from './auth'
import { SageIntacctClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'

import { transformInvoice, type IntacctInvoice } from './transform/invoice'
import { transformContact, type IntacctContact } from './transform/contact'
import { transformAccount, type IntacctAccount } from './transform/account'
import { transformOrganization, type IntacctOrganization } from './transform/organization'

interface SageIntacctAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes: string[]
  companyId?: string
}

interface IntacctListResponse<T> {
  data: { count: string; totalcount: string } & Record<string, T[]>
}

export class SageIntacctAdapter implements AccountingAdapter {
  readonly platform = 'sageintacct'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: SageIntacctAdapterConfig) {
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

  private client(credentials: Credentials): SageIntacctClient {
    return new SageIntacctClient(credentials)
  }

  // --- Organization ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = this.client(credentials)
    const res = await client.get<{ data: { company: IntacctOrganization } }>('company')
    return transformOrganization(res.data.company)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = this.client(credentials)
    const pageSize = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, 1000)
    const offset = ((params.page ?? 1) - 1) * pageSize
    const res = await client.get<IntacctListResponse<IntacctInvoice>>('arinvoice', {
      'fields[]': ['RECORDNO', 'RECORDID', 'CUSTOMERID', 'TOTALENTERED', 'TOTALPAID', 'TOTALDUE', 'CURRENCY', 'WHENCREATED', 'WHENDUE', 'STATE'],
      pagesize: pageSize,
      offset,
    })
    const invoices = (res.data.arinvoice ?? []) as IntacctInvoice[]
    return invoices.map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = this.client(credentials)
    const res = await client.get<{ data: { arinvoice: IntacctInvoice } }>(`arinvoice/${id}`)
    return transformInvoice(res.data.arinvoice)
  }

  // --- Contacts ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = this.client(credentials)
    const pageSize = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, 1000)
    const offset = ((params.page ?? 1) - 1) * pageSize
    const res = await client.get<IntacctListResponse<IntacctContact>>('customer', {
      pagesize: pageSize,
      offset,
    })
    const contacts = (res.data.customer ?? []) as IntacctContact[]
    return contacts.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = this.client(credentials)
    const res = await client.get<{ data: { customer: IntacctContact } }>(`customer/${id}`)
    return transformContact(res.data.customer)
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = this.client(credentials)
    const pageSize = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, 1000)
    const offset = ((params.page ?? 1) - 1) * pageSize
    const res = await client.get<IntacctListResponse<IntacctAccount>>('glaccount', {
      pagesize: pageSize,
      offset,
    })
    const accounts = (res.data.glaccount ?? []) as IntacctAccount[]
    return accounts.map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = this.client(credentials)
    const res = await client.get<{ data: { glaccount: IntacctAccount } }>(`glaccount/${id}`)
    return transformAccount(res.data.glaccount)
  }
}
