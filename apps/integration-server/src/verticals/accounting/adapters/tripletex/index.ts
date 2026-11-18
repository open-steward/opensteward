import { simpleApiKey } from '@opensteward/shared'
import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Invoice } from '../../schema/invoice'
import type { Contact } from '../../schema/contact'
import type { Account } from '../../schema/account'
import type { Organization } from '../../schema/organization'

import {
  buildAuthUrl,
  exchangeCode as doExchangeCode,
  refreshCredentials as doRefreshCredentials,
} from './auth'
import { TripletexClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'

import { transformInvoice, type TripletexInvoice } from './transform/invoice'
import { transformContact, type TripletexCustomer } from './transform/contact'
import { transformAccount, type TripletexAccount } from './transform/account'
import { transformOrganization, type TripletexCompany } from './transform/organization'

interface TripletexAdapterConfig {
  // No clientId/Secret in OAuth sense. Tokens come from the platform admin panel.
  redirectUri?: string
  scopes?: string[]
}

interface TripletexListResponse<T> {
  fullResultSize: number
  from: number
  count: number
  values: T[]
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class TripletexAdapter implements AccountingAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'tripletex'
  readonly version = '0.1.0'

  constructor(_config: TripletexAdapterConfig = {}) {}

  getAuthUrl(state: string): string {
    return buildAuthUrl('', '', [], state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return doExchangeCode(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefreshCredentials(credentials)
  }

  // --- Organization ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new TripletexClient(credentials)
    const res = await client.get<{ value: TripletexCompany }>('company')
    return transformOrganization(res.value)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new TripletexClient(credentials)
    const count = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, 1000)
    const from = ((params.page ?? 1) - 1) * count
    const res = await client.get<TripletexListResponse<TripletexInvoice>>('invoice', {
      from,
      count,
      invoiceDateFrom: params.updatedAfter?.toISOString().split('T')[0],
    })
    return (res.values ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new TripletexClient(credentials)
    const res = await client.get<{ value: TripletexInvoice }>(`invoice/${id}`)
    return transformInvoice(res.value)
  }

  // --- Contacts ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new TripletexClient(credentials)
    const count = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, 1000)
    const from = ((params.page ?? 1) - 1) * count
    const res = await client.get<TripletexListResponse<TripletexCustomer>>('customer', {
      from,
      count,
      fields: 'id,name,organizationNumber,email,phoneNumber,phoneNumberMobile,isCustomer,isSupplier,isInactive,currency,physicalAddress',
    })
    return (res.values ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new TripletexClient(credentials)
    const res = await client.get<{ value: TripletexCustomer }>(`customer/${id}`)
    return transformContact(res.value)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const client = new TripletexClient(credentials)
    const res = await client.post<{ value: TripletexCustomer }>('customer', {
      name: data.name,
      organizationNumber: data.identification,
      email: data.emails?.[0]?.email,
      phoneNumber: data.telephones?.[0]?.telephone,
      isCustomer: data.isCustomer ?? true,
      isSupplier: data.isSupplier ?? false,
    })
    return transformContact(res.value)
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new TripletexClient(credentials)
    const count = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, 1000)
    const from = ((params.page ?? 1) - 1) * count
    const res = await client.get<TripletexListResponse<TripletexAccount>>('ledger/account', {
      from,
      count,
    })
    return (res.values ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new TripletexClient(credentials)
    const res = await client.get<{ value: TripletexAccount }>(`ledger/account/${id}`)
    return transformAccount(res.value)
  }
}
