import { toCalendarDate } from '../shared/transform'
import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Invoice } from '../../schema/invoice'
import type { Contact } from '../../schema/contact'
import type { Account } from '../../schema/account'
import type { Organization } from '../../schema/organization'

import { buildAuthUrl, exchangeCode, refreshAccessToken } from './auth'
import { MoneybirdClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'

import { transformInvoice, type MoneybirdInvoice } from './transform/invoice'
import { transformContact, type MoneybirdContact } from './transform/contact'
import { transformAccount, type MoneybirdAccount } from './transform/account'
import { transformOrganization, type MoneybirdAdmin } from './transform/organization'

interface MoneybirdAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes: string[]
}

export class MoneybirdAdapter implements AccountingAdapter {
  readonly platform = 'moneybird'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: MoneybirdAdapterConfig) {
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
    const creds = await refreshAccessToken(credentials.refreshToken, this.clientId, this.clientSecret)
    creds.tenantId = credentials.tenantId
    return creds
  }

  // --- Organization ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new MoneybirdClient(credentials)
    const res = await client.get<MoneybirdAdmin>('administration')
    return transformOrganization(res)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new MoneybirdClient(credentials)
    const perPage = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, 100)
    const page = params.page ?? 1
    const res = await client.get<MoneybirdInvoice[]>('sales_invoices', {
      per_page: perPage,
      page,
      ...(params.updatedAfter && { filter: `updated_after:${params.updatedAfter.toISOString()}` }),
    })
    return (res ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new MoneybirdClient(credentials)
    const res = await client.get<MoneybirdInvoice>(`sales_invoices/${id}`)
    return transformInvoice(res)
  }

  async createInvoice(credentials: Credentials, data: Partial<Invoice>): Promise<Invoice> {
    const client = new MoneybirdClient(credentials)
    const res = await client.post<MoneybirdInvoice>('sales_invoices', {
      sales_invoice: {
        contact_id: data.contactId,
        currency: data.currency,
        invoice_date: toCalendarDate(data.postedAt),
        due_date: toCalendarDate(data.dueAt),
        details_attributes: data.lineItems?.map((li) => ({
          description: li.itemDescription,
          amount: String(li.unitQuantity ?? 1),
          price: li.unitAmount,
        })),
      },
    })
    return transformInvoice(res)
  }

  // --- Contacts ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new MoneybirdClient(credentials)
    const res = await client.get<MoneybirdContact[]>('contacts', {
      per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, 100),
      page: params.page ?? 1,
    })
    return (res ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new MoneybirdClient(credentials)
    const res = await client.get<MoneybirdContact>(`contacts/${id}`)
    return transformContact(res)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const client = new MoneybirdClient(credentials)
    const res = await client.post<MoneybirdContact>('contacts', {
      contact: {
        company_name: data.companyName,
        firstname: data.firstName,
        lastname: data.lastName,
        email: data.emails?.[0]?.email,
        phone: data.telephones?.[0]?.telephone,
        address1: data.billingAddress?.address1,
        city: data.billingAddress?.city,
        zipcode: data.billingAddress?.postalCode,
        country: data.billingAddress?.country,
      },
    })
    return transformContact(res)
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new MoneybirdClient(credentials)
    const res = await client.get<MoneybirdAccount[]>('ledger_accounts', {
      per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, 100),
      page: params.page ?? 1,
    })
    return (res ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new MoneybirdClient(credentials)
    const res = await client.get<MoneybirdAccount>(`ledger_accounts/${id}`)
    return transformAccount(res)
  }
}
