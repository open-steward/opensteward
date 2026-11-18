import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Invoice } from '../../schema/invoice'
import type { Contact } from '../../schema/contact'
import type { Account } from '../../schema/account'
import type { Organization } from '../../schema/organization'

import { CREDENTIAL_FORM, buildAuthUrl, exchangeCode as doExchangeCode, refreshCredentials as doRefresh } from './auth'
import { SapB1Client } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'

import { transformInvoice, type SapB1Invoice } from './transform/invoice'
import { transformContact, type SapB1BusinessPartner } from './transform/contact'
import { transformAccount, type SapB1Account } from './transform/account'
import { transformOrganization, type SapB1Company } from './transform/organization'

interface SapB1AdapterConfig {
  host?: string
  redirectUri?: string
  scopes?: string[]
}

interface ODataList<T> {
  value: T[]
  'odata.count'?: number
}


export class SapB1Adapter implements AccountingAdapter {

  // Connect Link support — per-customer form (see ./auth.ts).

  credentialFields = CREDENTIAL_FORM.credentialFields

  exchangeCredentials = CREDENTIAL_FORM.exchangeCredentials

  readonly platform = 'sapb1'
  readonly version = '0.1.0'

  private host: string

  constructor(config: SapB1AdapterConfig = {}) {
    this.host = config.host ?? ''
  }

  getAuthUrl(state: string): string {
    return buildAuthUrl('', '', [], state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return doExchangeCode(code, this.host)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  private client(credentials: Credentials): SapB1Client {
    return new SapB1Client(credentials)
  }

  // --- Organization ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = this.client(credentials)
    const res = await client.get<SapB1Company>('Company')
    return transformOrganization(res)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = this.client(credentials)
    const top = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, 100)
    const skip = ((params.page ?? 1) - 1) * top
    const filter = params.updatedAfter
      ? `&$filter=UpdateDate ge '${params.updatedAfter.toISOString().split('T')[0]}'`
      : ''
    const res = await client.get<ODataList<SapB1Invoice>>(
      `Invoices?$top=${top}&$skip=${skip}${filter}`,
    )
    return (res.value ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = this.client(credentials)
    const res = await client.get<SapB1Invoice>(`Invoices(${id})`)
    return transformInvoice(res)
  }

  // --- Contacts ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = this.client(credentials)
    const top = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, 100)
    const skip = ((params.page ?? 1) - 1) * top
    const res = await client.get<ODataList<SapB1BusinessPartner>>(
      `BusinessPartners?$top=${top}&$skip=${skip}`,
    )
    return (res.value ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = this.client(credentials)
    const res = await client.get<SapB1BusinessPartner>(`BusinessPartners('${id}')`)
    return transformContact(res)
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = this.client(credentials)
    const top = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, 100)
    const skip = ((params.page ?? 1) - 1) * top
    const res = await client.get<ODataList<SapB1Account>>(
      `ChartOfAccounts?$top=${top}&$skip=${skip}`,
    )
    return (res.value ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = this.client(credentials)
    const res = await client.get<SapB1Account>(`ChartOfAccounts('${id}')`)
    return transformAccount(res)
  }
}
