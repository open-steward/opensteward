import { simpleApiKey } from '@opensteward/shared'
import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Invoice } from '../../schema/invoice'
import type { Contact } from '../../schema/contact'
import type { Account } from '../../schema/account'
import type { Journal } from '../../schema/journal'
import type { Organization } from '../../schema/organization'
import type { CreditMemo } from '../../schema/creditmemo'

import { buildAuthUrl, exchangeCode, refreshAccessToken } from './auth'
import { BrioxClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, type BrioxInvoice } from './transform/invoice'
import { transformContact, type BrioxContact } from './transform/contact'
import { transformAccount, type BrioxAccount } from './transform/account'
import { transformJournal, type BrioxJournal } from './transform/journal'
import { transformOrganization, type BrioxOrganization } from './transform/organization'
import { transformCreditMemo, type BrioxCreditNote } from './transform/creditmemo'

interface BrioxAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes: string[]
}
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class BrioxAdapter implements AccountingAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'briox'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: BrioxAdapterConfig) {
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

  private paginationParams(params: QueryParams): Record<string, unknown> {
    return {
      limit: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
      page: params.page ?? 1,
    }
  }

  // --- Organization ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new BrioxClient(credentials)
    const res = await client.get<BrioxOrganization>('company')
    return transformOrganization(res)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new BrioxClient(credentials)
    const res = await client.get<BrioxInvoice[]>('invoices', this.paginationParams(params))
    return (res ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new BrioxClient(credentials)
    const res = await client.get<BrioxInvoice>(`invoices/${id}`)
    return transformInvoice(res)
  }

  // --- Contacts ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new BrioxClient(credentials)
    const res = await client.get<BrioxContact[]>('contacts', this.paginationParams(params))
    return (res ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new BrioxClient(credentials)
    const res = await client.get<BrioxContact>(`contacts/${id}`)
    return transformContact(res)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const client = new BrioxClient(credentials)
    const res = await client.post<BrioxContact>('contacts', {
      name: data.name,
      org_number: data.identification,
      email: data.emails?.[0]?.email,
      phone: data.telephones?.[0]?.telephone,
      address: data.billingAddress?.address1,
      city: data.billingAddress?.city,
      zip: data.billingAddress?.postalCode,
      country: data.billingAddress?.country,
      is_customer: data.isCustomer,
      is_supplier: data.isSupplier,
    })
    return transformContact(res)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const client = new BrioxClient(credentials)
    const res = await client.put<BrioxContact>(`contacts/${id}`, {
      name: data.name,
      email: data.emails?.[0]?.email,
      phone: data.telephones?.[0]?.telephone,
      address: data.billingAddress?.address1,
      city: data.billingAddress?.city,
      zip: data.billingAddress?.postalCode,
      country: data.billingAddress?.country,
    })
    return transformContact(res)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    const client = new BrioxClient(credentials)
    await client.delete(`contacts/${id}`)
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new BrioxClient(credentials)
    const res = await client.get<BrioxAccount[]>('accounts', this.paginationParams(params))
    return (res ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new BrioxClient(credentials)
    const res = await client.get<BrioxAccount>(`accounts/${id}`)
    return transformAccount(res)
  }

  // --- Journals ---

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new BrioxClient(credentials)
    const res = await client.get<BrioxJournal[]>('journal-entries', this.paginationParams(params))
    return (res ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new BrioxClient(credentials)
    const res = await client.get<BrioxJournal>(`journal-entries/${id}`)
    return transformJournal(res)
  }

  // --- Credit Memos ---

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new BrioxClient(credentials)
    const res = await client.get<BrioxCreditNote[]>('credit-notes', this.paginationParams(params))
    return (res ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new BrioxClient(credentials)
    const res = await client.get<BrioxCreditNote>(`credit-notes/${id}`)
    return transformCreditMemo(res)
  }
}
