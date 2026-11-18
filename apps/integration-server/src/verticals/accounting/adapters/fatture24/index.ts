import { simpleApiKey } from '@opensteward/shared'
import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Invoice } from '../../schema/invoice'
import type { Bill } from '../../schema/bill'
import type { Contact } from '../../schema/contact'
import type { Account } from '../../schema/account'
import type { Organization } from '../../schema/organization'

import { buildAuthUrl, exchangeCode, refreshCredentials } from './auth'
import { Fatture24Client } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'

import { transformInvoice } from './transform/invoice'
import { transformBill } from './transform/bill'
import { transformContact } from './transform/contact'
import { transformAccount } from './transform/account'
import { transformOrganization } from './transform/organization'
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class Fatture24Adapter implements AccountingAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'fatture24'
  readonly version = '0.1.0'



  getAuthUrl(_state: string): string {
    return buildAuthUrl(_state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return exchangeCode(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return refreshCredentials(credentials)
  }

  private makeClient(credentials: Credentials): Fatture24Client {
    return new Fatture24Client(credentials)
  }

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = this.makeClient(credentials)
    const res = await client.get<{ data: Parameters<typeof transformOrganization>[0] }>('company')
    return transformOrganization(res.data)
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
