import { simpleApiKey } from '@opensteward/shared'
import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Invoice } from '../../schema/invoice'
import type { Contact } from '../../schema/contact'
import type { Account } from '../../schema/account'
import type { Organization } from '../../schema/organization'

import { buildAuthUrl, exchangeCode as doExchangeCode, refreshCredentials as doRefresh } from './auth'
import { EBoekhoudenClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'

import { transformInvoice, type EBoekhoudenInvoice } from './transform/invoice'
import { transformContact, type EBoekhoudenContact } from './transform/contact'
import { transformAccount, type EBoekhoudenAccount } from './transform/account'
import { transformOrganization, type EBoekhoudenOrg } from './transform/organization'

interface EBoekhoudenListResponse<T> {
  items: T[]
  totalCount: number
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class EBoekhoudenAdapter implements AccountingAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'eboekhouden'
  readonly version = '0.1.0'

  getAuthUrl(state: string): string {
    return buildAuthUrl('', '', [], state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return doExchangeCode(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefresh(credentials)
  }

  // --- Organization ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new EBoekhoudenClient(credentials)
    const res = await client.get<EBoekhoudenOrg>('auth/profile')
    return transformOrganization(res)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new EBoekhoudenClient(credentials)
    const pageSize = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, 1000)
    const offset = ((params.page ?? 1) - 1) * pageSize
    const res = await client.get<EBoekhoudenListResponse<EBoekhoudenInvoice>>('invoice', {
      pageSize,
      offset,
    })
    return (res.items ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new EBoekhoudenClient(credentials)
    const res = await client.get<EBoekhoudenInvoice>(`invoice/${id}`)
    return transformInvoice(res)
  }

  // --- Contacts ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new EBoekhoudenClient(credentials)
    const pageSize = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, 1000)
    const offset = ((params.page ?? 1) - 1) * pageSize
    const res = await client.get<EBoekhoudenListResponse<EBoekhoudenContact>>('relation', {
      pageSize,
      offset,
    })
    return (res.items ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new EBoekhoudenClient(credentials)
    const res = await client.get<EBoekhoudenContact>(`relation/${id}`)
    return transformContact(res)
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new EBoekhoudenClient(credentials)
    const pageSize = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, 1000)
    const offset = ((params.page ?? 1) - 1) * pageSize
    const res = await client.get<EBoekhoudenListResponse<EBoekhoudenAccount>>('ledger', {
      pageSize,
      offset,
    })
    return (res.items ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new EBoekhoudenClient(credentials)
    const res = await client.get<EBoekhoudenAccount>(`ledger/${id}`)
    return transformAccount(res)
  }
}
