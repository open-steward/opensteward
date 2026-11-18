import { simpleApiKey } from '@opensteward/shared'
import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Invoice } from '../../schema/invoice'
import type { Contact } from '../../schema/contact'
import type { Account } from '../../schema/account'
import type { Journal } from '../../schema/journal'
import type { Organization } from '../../schema/organization'
import type { CreditMemo } from '../../schema/creditmemo'

import { buildAuthUrl, exchangeCode as authExchangeCode, refreshCredentials as authRefresh } from './auth'
import { AcconomyClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, type AcconomyInvoice } from './transform/invoice'
import { transformContact, type AcconomyContact } from './transform/contact'
import { transformAccount, type AcconomyAccount } from './transform/account'
import { transformJournal, type AcconomyJournalEntry } from './transform/journal'
import { transformOrganization, type AcconomyOrganization } from './transform/organization'
import { transformCreditMemo, type AcconomyCreditMemo } from './transform/creditmemo'
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class AcconomyAdapter implements AccountingAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'acconomy'
  readonly version = '0.1.0'

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return authExchangeCode(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return authRefresh(credentials)
  }

  private paginationParams(params: QueryParams): Record<string, unknown> {
    return {
      limit: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
      page: params.page ?? 1,
    }
  }

  // --- Organization ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new AcconomyClient(credentials)
    const res = await client.get<AcconomyOrganization>('company')
    return transformOrganization(res)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new AcconomyClient(credentials)
    const res = await client.get<AcconomyInvoice[]>('invoices', this.paginationParams(params))
    return (res ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new AcconomyClient(credentials)
    const res = await client.get<AcconomyInvoice>(`invoices/${id}`)
    return transformInvoice(res)
  }

  // --- Contacts ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new AcconomyClient(credentials)
    const res = await client.get<AcconomyContact[]>('contacts', this.paginationParams(params))
    return (res ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new AcconomyClient(credentials)
    const res = await client.get<AcconomyContact>(`contacts/${id}`)
    return transformContact(res)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const client = new AcconomyClient(credentials)
    const res = await client.post<AcconomyContact>('contacts', {
      name: data.name,
      email: data.emails?.[0]?.email,
      phone: data.telephones?.[0]?.telephone,
      org_nr: data.identification,
      address: data.billingAddress?.address1,
      city: data.billingAddress?.city,
      postal_code: data.billingAddress?.postalCode,
      country: data.billingAddress?.country,
    })
    return transformContact(res)
  }

  async updateContact(credentials: Credentials, id: string, data: Partial<Contact>): Promise<Contact> {
    const client = new AcconomyClient(credentials)
    const res = await client.put<AcconomyContact>(`contacts/${id}`, {
      name: data.name,
      email: data.emails?.[0]?.email,
      phone: data.telephones?.[0]?.telephone,
      address: data.billingAddress?.address1,
      city: data.billingAddress?.city,
      postal_code: data.billingAddress?.postalCode,
      country: data.billingAddress?.country,
    })
    return transformContact(res)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    const client = new AcconomyClient(credentials)
    await client.delete(`contacts/${id}`)
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new AcconomyClient(credentials)
    const res = await client.get<AcconomyAccount[]>('accounts', this.paginationParams(params))
    return (res ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new AcconomyClient(credentials)
    const res = await client.get<AcconomyAccount>(`accounts/${id}`)
    return transformAccount(res)
  }

  // --- Journals ---

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new AcconomyClient(credentials)
    const res = await client.get<AcconomyJournalEntry[]>('journal-entries', this.paginationParams(params))
    return (res ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new AcconomyClient(credentials)
    const res = await client.get<AcconomyJournalEntry>(`journal-entries/${id}`)
    return transformJournal(res)
  }

  // --- Credit Memos ---

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new AcconomyClient(credentials)
    const res = await client.get<AcconomyCreditMemo[]>('credit-notes', this.paginationParams(params))
    return (res ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new AcconomyClient(credentials)
    const res = await client.get<AcconomyCreditMemo>(`credit-notes/${id}`)
    return transformCreditMemo(res)
  }
}
