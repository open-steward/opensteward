import { simpleApiKey } from '@opensteward/shared'
import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Invoice } from '../../schema/invoice'
import type { Bill } from '../../schema/bill'
import type { Contact } from '../../schema/contact'
import type { Account } from '../../schema/account'
import type { Organization } from '../../schema/organization'

import { buildAuthUrl, exchangeCode, refreshCredentials } from './auth'
import { ArubaClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'

import { transformInvoice, type ArubaFattura } from './transform/invoice'
import { transformBill, type ArubaFatturaAcquisto } from './transform/bill'
import { transformContact, type ArubaContatto } from './transform/contact'
import { transformAccount, type ArubaContoConto } from './transform/account'
import { transformOrganization, type ArubaAzienda } from './transform/organization'
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class ArubaAdapter implements AccountingAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'aruba'
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

  private client(credentials: Credentials): ArubaClient {
    return new ArubaClient(credentials)
  }

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = this.client(credentials)
    const res = await client.get<{ data: ArubaAzienda }>('company')
    return transformOrganization(res.data)
  }

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = this.client(credentials)
    const res = await client.get<{ data: ArubaFattura[] }>('invoices', {
      page: params.page ?? 1,
      per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, 100),
    })
    return (res.data ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = this.client(credentials)
    const res = await client.get<{ data: ArubaFattura }>(`invoices/${id}`)
    return transformInvoice(res.data)
  }

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = this.client(credentials)
    const res = await client.get<{ data: ArubaFatturaAcquisto[] }>('purchase_invoices', {
      page: params.page ?? 1,
      per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, 100),
    })
    return (res.data ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = this.client(credentials)
    const res = await client.get<{ data: ArubaFatturaAcquisto }>(`purchase_invoices/${id}`)
    return transformBill(res.data)
  }

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = this.client(credentials)
    const res = await client.get<{ data: ArubaContatto[] }>('contacts', {
      page: params.page ?? 1,
      per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, 100),
    })
    return (res.data ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = this.client(credentials)
    const res = await client.get<{ data: ArubaContatto }>(`contacts/${id}`)
    return transformContact(res.data)
  }

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = this.client(credentials)
    const res = await client.get<{ data: ArubaContoConto[] }>('accounts', {
      page: params.page ?? 1,
      per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, 100),
    })
    return (res.data ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = this.client(credentials)
    const res = await client.get<{ data: ArubaContoConto }>(`accounts/${id}`)
    return transformAccount(res.data)
  }
}
