import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Invoice } from '../../schema/invoice'
import type { Contact } from '../../schema/contact'
import type { Account } from '../../schema/account'
import type { Organization } from '../../schema/organization'

import { buildAuthUrl, exchangeCode, refreshAccessToken } from './auth'
import { PennylaneClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'

import { transformInvoice, type PennylaneInvoice } from './transform/invoice'
import { transformContact, type PennylaneContact } from './transform/contact'
import { transformAccount, type PennylaneAccount } from './transform/account'
import { transformOrganization, type PennylaneOrganization } from './transform/organization'

interface PennylaneAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes: string[]
}

interface PennylanePage<T> {
  invoices?: T[]
  customers?: T[]
  chart_of_accounts?: T[]
  pagination: { total_pages: number; current_page: number; next_page: number | null }
}

export class PennylaneAdapter implements AccountingAdapter {
  readonly platform = 'pennylane'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: PennylaneAdapterConfig) {
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

  // --- Organization ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new PennylaneClient(credentials)
    const res = await client.get<{ company: PennylaneOrganization }>('company')
    return transformOrganization(res.company)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new PennylaneClient(credentials)
    const res = await client.get<PennylanePage<PennylaneInvoice>>('customer_invoices', {
      page: params.page ?? 1,
      per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, 100),
      ...(params.updatedAfter && { filter: `updated_after:${params.updatedAfter.toISOString()}` }),
    })
    return (res.invoices ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new PennylaneClient(credentials)
    const res = await client.get<{ invoice: PennylaneInvoice }>(`customer_invoices/${id}`)
    return transformInvoice(res.invoice)
  }

  // --- Contacts ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new PennylaneClient(credentials)
    const res = await client.get<PennylanePage<PennylaneContact>>('customers', {
      page: params.page ?? 1,
      per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, 100),
    })
    return (res.customers ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new PennylaneClient(credentials)
    const res = await client.get<{ customer: PennylaneContact }>(`customers/${id}`)
    return transformContact(res.customer)
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new PennylaneClient(credentials)
    const res = await client.get<PennylanePage<PennylaneAccount>>('chart_of_accounts', {
      page: params.page ?? 1,
      per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, 100),
    })
    return (res.chart_of_accounts ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new PennylaneClient(credentials)
    const res = await client.get<{ account: PennylaneAccount }>(`chart_of_accounts/${id}`)
    return transformAccount(res.account)
  }
}
