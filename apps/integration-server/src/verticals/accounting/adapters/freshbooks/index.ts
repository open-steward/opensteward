import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Invoice } from '../../schema/invoice'
import type { Contact } from '../../schema/contact'
import type { Organization } from '../../schema/organization'

import { buildAuthUrl, exchangeCode, refreshAccessToken } from './auth'
import { FreshBooksClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'

import { transformInvoice, type FreshBooksInvoice } from './transform/invoice'
import { transformClient, type FreshBooksClient as FreshBooksClientModel } from './transform/contact'
import { transformOrganization, type FreshBooksBusiness } from './transform/organization'

interface FreshBooksAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes: string[]
}

interface FreshBooksListResponse<T> {
  response: {
    result: T & { page: number; pages: number; per_page: number; total: number }
  }
}

export class FreshBooksAdapter implements AccountingAdapter {
  readonly platform = 'freshbooks'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: FreshBooksAdapterConfig) {
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

  /** FreshBooks account id (stored as tenantId), matched against account_id on
   *  inbound webhook events for connection routing. */
  externalAccountId(credentials: Credentials): string | undefined {
    return credentials.tenantId || undefined
  }

  // --- Organization ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new FreshBooksClient(credentials)
    const res = await client.get<{ response: { business_memberships: Array<{ business: FreshBooksBusiness }> } }>(
      'auth/api/v1/users/me',
    )
    const business = res.response.business_memberships?.[0]?.business
    return transformOrganization(business)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new FreshBooksClient(credentials)
    const accountId = client.accountId
    const res = await client.get<FreshBooksListResponse<{ invoices: FreshBooksInvoice[] }>>(
      `accounting/account/${accountId}/invoices/invoices`,
      {
        page: params.page ?? 1,
        per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, 100),
        ...(params.updatedAfter && {
          'search[updated_since]': params.updatedAfter.toISOString(),
        }),
      },
    )
    return (res.response.result.invoices ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new FreshBooksClient(credentials)
    const accountId = client.accountId
    const res = await client.get<{ response: { result: { invoice: FreshBooksInvoice } } }>(
      `accounting/account/${accountId}/invoices/invoices/${id}`,
    )
    return transformInvoice(res.response.result.invoice)
  }

  // --- Contacts ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new FreshBooksClient(credentials)
    const accountId = client.accountId
    const res = await client.get<FreshBooksListResponse<{ clients: FreshBooksClientModel[] }>>(
      `accounting/account/${accountId}/users/clients`,
      {
        page: params.page ?? 1,
        per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, 100),
      },
    )
    return (res.response.result.clients ?? []).map(transformClient)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new FreshBooksClient(credentials)
    const accountId = client.accountId
    const res = await client.get<{ response: { result: { client: FreshBooksClientModel } } }>(
      `accounting/account/${accountId}/users/clients/${id}`,
    )
    return transformClient(res.response.result.client)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const client = new FreshBooksClient(credentials)
    const accountId = client.accountId
    const res = await client.post<{ response: { result: { client: FreshBooksClientModel } } }>(
      `accounting/account/${accountId}/users/clients`,
      {
        client: {
          fname: data.firstName,
          lname: data.lastName,
          organization: data.companyName,
          email: data.emails?.[0]?.email,
          work_phone: data.telephones?.find((t) => t.type === 'WORK')?.telephone,
          mobile_phone: data.telephones?.find((t) => t.type === 'MOBILE')?.telephone,
          currency_code: data.currency,
          p_street: data.billingAddress?.address1,
          p_city: data.billingAddress?.city,
          p_code: data.billingAddress?.postalCode,
          p_country: data.billingAddress?.country,
        },
      },
    )
    return transformClient(res.response.result.client)
  }
}
