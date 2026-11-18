import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Invoice } from '../../schema/invoice'
import type { Contact } from '../../schema/contact'
import type { Account } from '../../schema/account'
import type { Organization } from '../../schema/organization'

import { oauth2ClientCredentials } from '@opensteward/shared'
import { buildAuthUrl, exchangeCode, refreshAccessToken } from './auth'
import { PowerOfficeClient } from './client'
import { DEFAULT_PAGE_SIZE, POWEROFFICE_TOKEN_URL } from './constants'

const CREDENTIAL_FORM = oauth2ClientCredentials({ tokenUrl: POWEROFFICE_TOKEN_URL })

import { transformInvoice, type PowerOfficeInvoice } from './transform/invoice'
import { transformContact, type PowerOfficeContact } from './transform/contact'
import { transformAccount, type PowerOfficeAccount } from './transform/account'
import { transformOrganization, type PowerOfficeOrganization } from './transform/organization'

interface PowerOfficeAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri?: string
  scopes?: string[]
}

interface PowerOfficePage<T> {
  data: T[]
  success: boolean
}

export class PowerOfficeAdapter implements AccountingAdapter {
  readonly platform = 'poweroffice'
  readonly version = '0.1.0'

  credentialFields = CREDENTIAL_FORM.credentialFields
  exchangeCredentials = CREDENTIAL_FORM.exchangeCredentials

  private clientId: string
  private clientSecret: string

  constructor(config: PowerOfficeAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
  }

  getAuthUrl(state: string): string {
    return buildAuthUrl(this.clientId, '', [], state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return exchangeCode(code, this.clientId, this.clientSecret)
  }

  async refreshCredentials(_credentials: Credentials): Promise<Credentials> {
    return refreshAccessToken(this.clientId, this.clientSecret)
  }

  // --- Organization ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new PowerOfficeClient(credentials)
    const res = await client.get<{ data: PowerOfficeOrganization}>('Organization')
    return transformOrganization(res.data)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new PowerOfficeClient(credentials)
    const pageSize = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, 5000)
    const page = params.page ?? 1
    const res = await client.get<PowerOfficePage<PowerOfficeInvoice>>('CustomerInvoice', {
      pageSize,
      page,
    })
    return (res.data ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new PowerOfficeClient(credentials)
    const res = await client.get<{ data: PowerOfficeInvoice }>(`CustomerInvoice/${id}`)
    return transformInvoice(res.data)
  }

  // --- Contacts ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new PowerOfficeClient(credentials)
    const pageSize = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, 5000)
    const res = await client.get<PowerOfficePage<PowerOfficeContact>>('Customer', {
      pageSize,
      page: params.page ?? 1,
    })
    return (res.data ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new PowerOfficeClient(credentials)
    const res = await client.get<{ data: PowerOfficeContact }>(`Customer/${id}`)
    return transformContact(res.data)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const client = new PowerOfficeClient(credentials)
    const res = await client.post<{ data: PowerOfficeContact }>('Customer', {
      name: data.name,
      emailAddress: data.emails?.[0]?.email,
      phoneNumber: data.telephones?.[0]?.telephone,
      currencyCode: data.currency,
    })
    return transformContact(res.data)
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new PowerOfficeClient(credentials)
    const res = await client.get<PowerOfficePage<PowerOfficeAccount>>('GeneralLedgerAccount', {
      pageSize: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, 5000),
      page: params.page ?? 1,
    })
    return (res.data ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new PowerOfficeClient(credentials)
    const res = await client.get<{ data: PowerOfficeAccount }>(`GeneralLedgerAccount/${id}`)
    return transformAccount(res.data)
  }
}
