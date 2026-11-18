import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Invoice } from '../../schema/invoice'
import type { Contact } from '../../schema/contact'
import type { Account } from '../../schema/account'
import type { Organization } from '../../schema/organization'

import { buildAuthUrl, exchangeCode, refreshAccessToken } from './auth'
import { FreeAgentClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'

import { transformInvoice, type FreeAgentInvoice } from './transform/invoice'
import { transformContact, type FreeAgentContact } from './transform/contact'
import { transformAccount, type FreeAgentAccount } from './transform/account'
import { transformOrganization, type FreeAgentCompany } from './transform/organization'

interface FreeAgentAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes: string[]
}

export class FreeAgentAdapter implements AccountingAdapter {
  readonly platform = 'freeagent'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: FreeAgentAdapterConfig) {
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
    const client = new FreeAgentClient(credentials)
    const res = await client.get<{ company: FreeAgentCompany }>('company')
    return transformOrganization(res.company)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new FreeAgentClient(credentials)
    const res = await client.get<{ invoices: FreeAgentInvoice[] }>('invoices', {
      per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, 100),
      page: params.page ?? 1,
      ...(params.updatedAfter && { updated_since: params.updatedAfter.toISOString() }),
    })
    return (res.invoices ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new FreeAgentClient(credentials)
    const res = await client.get<{ invoice: FreeAgentInvoice }>(`invoices/${id}`)
    return transformInvoice(res.invoice)
  }

  // --- Contacts ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new FreeAgentClient(credentials)
    const res = await client.get<{ contacts: FreeAgentContact[] }>('contacts', {
      per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, 100),
      page: params.page ?? 1,
    })
    return (res.contacts ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new FreeAgentClient(credentials)
    const res = await client.get<{ contact: FreeAgentContact }>(`contacts/${id}`)
    return transformContact(res.contact)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const client = new FreeAgentClient(credentials)
    const res = await client.post<{ contact: FreeAgentContact }>('contacts', {
      contact: {
        organisation_name: data.companyName ?? data.name,
        first_name: data.firstName,
        last_name: data.lastName,
        email: data.emails?.[0]?.email,
        phone_number: data.telephones?.[0]?.telephone,
        address1: data.billingAddress?.address1,
        town: data.billingAddress?.city,
        postcode: data.billingAddress?.postalCode,
        country: data.billingAddress?.country,
      },
    })
    return transformContact(res.contact)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const client = new FreeAgentClient(credentials)
    const res = await client.put<{ contact: FreeAgentContact }>(`contacts/${id}`, {
      contact: {
        organisation_name: data.companyName ?? data.name,
        first_name: data.firstName,
        last_name: data.lastName,
        email: data.emails?.[0]?.email,
      },
    })
    return transformContact(res.contact)
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new FreeAgentClient(credentials)
    const res = await client.get<{ accounts: FreeAgentAccount[] }>('accounts', {
      per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, 100),
      page: params.page ?? 1,
    })
    return (res.accounts ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new FreeAgentClient(credentials)
    const res = await client.get<{ account: FreeAgentAccount }>(`accounts/${id}`)
    return transformAccount(res.account)
  }
}
