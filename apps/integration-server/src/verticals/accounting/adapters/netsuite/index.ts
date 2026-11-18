import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Invoice } from '../../schema/invoice'
import type { Contact } from '../../schema/contact'
import type { Account } from '../../schema/account'
import type { Organization } from '../../schema/organization'

import { buildAuthUrl, exchangeCode, refreshAccessToken } from './auth'
import { NetSuiteClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'

import { transformInvoice, type NetSuiteInvoice } from './transform/invoice'
import { transformContact, type NetSuiteCustomer } from './transform/contact'
import { transformAccount, type NetSuiteAccount } from './transform/account'
import { transformOrganization, type NetSuiteCompany } from './transform/organization'

interface NetSuiteAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes: string[]
  accountId: string
}

interface SuiteQLResponse<T> {
  items: T[]
  totalResults: number
  offset: number
  count: number
  hasMore: boolean
  links: unknown[]
}

export class NetSuiteAdapter implements AccountingAdapter {
  readonly platform = 'netsuite'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]
  private accountId: string

  constructor(config: NetSuiteAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes
    this.accountId = config.accountId
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

  private client(credentials: Credentials): NetSuiteClient {
    return new NetSuiteClient(credentials, this.accountId)
  }

  // --- Organization ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = this.client(credentials)
    const res = await client.get<NetSuiteCompany>('record/v1/subsidiary/1')
    return transformOrganization(res)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = this.client(credentials)
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, 1000)
    const offset = ((params.page ?? 1) - 1) * limit
    const where = params.updatedAfter
      ? ` WHERE lastModifiedDate > '${params.updatedAfter.toISOString()}'`
      : ''
    const res = await client.post<SuiteQLResponse<NetSuiteInvoice>>('query/v1/suiteql', {
      q: `SELECT id, tranId, entity, tranDate, dueDate, total, amountRemaining, taxTotal, currency, status FROM transaction WHERE type = 'CustInvc'${where} OFFSET ${offset} LIMIT ${limit}`,
    })
    return (res.items ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = this.client(credentials)
    const res = await client.get<NetSuiteInvoice>(`record/v1/invoice/${id}?expandSubResources=true`)
    return transformInvoice(res)
  }

  // --- Contacts ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = this.client(credentials)
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, 1000)
    const offset = ((params.page ?? 1) - 1) * limit
    const res = await client.post<SuiteQLResponse<NetSuiteCustomer>>('query/v1/suiteql', {
      q: `SELECT id, companyName, firstName, lastName, email, phone, isInactive, currency FROM customer OFFSET ${offset} LIMIT ${limit}`,
    })
    return (res.items ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = this.client(credentials)
    const res = await client.get<NetSuiteCustomer>(`record/v1/customer/${id}`)
    return transformContact(res)
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = this.client(credentials)
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, 1000)
    const offset = ((params.page ?? 1) - 1) * limit
    const res = await client.post<SuiteQLResponse<NetSuiteAccount>>('query/v1/suiteql', {
      q: `SELECT id, acctNumber, acctName, description, acctType, isInactive, balance, currency FROM account OFFSET ${offset} LIMIT ${limit}`,
    })
    return (res.items ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = this.client(credentials)
    const res = await client.get<NetSuiteAccount>(`record/v1/account/${id}`)
    return transformAccount(res)
  }
}
