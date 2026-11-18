import { simpleApiKey } from '@opensteward/shared'
import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Invoice } from '../../schema/invoice'
import type { Bill } from '../../schema/bill'
import type { Contact } from '../../schema/contact'
import type { Account } from '../../schema/account'
import type { Journal } from '../../schema/journal'
import type { Organization } from '../../schema/organization'
import type { TaxRate } from '../../schema/taxrate'
import type { Expense } from '../../schema/expense'
import type { CreditMemo } from '../../schema/creditmemo'
import type { Transaction } from '../../schema/transaction'

import { buildAuthUrl, exchangeCode, refreshCredentials as doRefreshCredentials } from './auth'
import { FactusolClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, type FactusolInvoice } from './transform/invoice'
import { transformBill, type FactusolBill } from './transform/bill'
import { transformContact, type FactusolContact } from './transform/contact'
import { transformAccount, type FactusolAccount } from './transform/account'
import { transformJournal, type FactusolJournal } from './transform/journal'
import { transformOrganization, type FactusolOrganization } from './transform/organization'
import { transformTaxRate, type FactusolTaxRate } from './transform/taxrate'
import { transformExpense, type FactusolExpense } from './transform/expense'
import { transformCreditMemo, type FactusolCreditMemo } from './transform/creditmemo'
import { transformTransaction, type FactusolTransaction } from './transform/transaction'
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class FactusolAdapter implements AccountingAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'factusol'
  readonly version = '0.1.0'

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return exchangeCode(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefreshCredentials(credentials)
  }

  private paginationParams(params: QueryParams): Record<string, unknown> {
    return {
      limit: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
      page: params.page ?? 1,
    }
  }

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new FactusolClient(credentials)
    const res = await client.get<FactusolOrganization>('empresa')
    return transformOrganization(res)
  }

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new FactusolClient(credentials)
    const res = await client.get<FactusolInvoice[]>('facturas', this.paginationParams(params))
    return (res ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new FactusolClient(credentials)
    const res = await client.get<FactusolInvoice>(`facturas/${id}`)
    return transformInvoice(res)
  }

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new FactusolClient(credentials)
    const res = await client.get<FactusolBill[]>('facturas-recibidas', this.paginationParams(params))
    return (res ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new FactusolClient(credentials)
    const res = await client.get<FactusolBill>(`facturas-recibidas/${id}`)
    return transformBill(res)
  }

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new FactusolClient(credentials)
    const res = await client.get<FactusolContact[]>('contactos', this.paginationParams(params))
    return (res ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new FactusolClient(credentials)
    const res = await client.get<FactusolContact>(`contactos/${id}`)
    return transformContact(res)
  }

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new FactusolClient(credentials)
    const res = await client.get<FactusolAccount[]>('cuentas', this.paginationParams(params))
    return (res ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new FactusolClient(credentials)
    const res = await client.get<FactusolAccount>(`cuentas/${id}`)
    return transformAccount(res)
  }

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new FactusolClient(credentials)
    const res = await client.get<FactusolJournal[]>('asientos', this.paginationParams(params))
    return (res ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new FactusolClient(credentials)
    const res = await client.get<FactusolJournal>(`asientos/${id}`)
    return transformJournal(res)
  }

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new FactusolClient(credentials)
    const res = await client.get<FactusolTaxRate[]>('tipos-iva', this.paginationParams(params))
    return (res ?? []).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new FactusolClient(credentials)
    const res = await client.get<FactusolTaxRate>(`tipos-iva/${id}`)
    return transformTaxRate(res)
  }

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new FactusolClient(credentials)
    const res = await client.get<FactusolExpense[]>('gastos', this.paginationParams(params))
    return (res ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new FactusolClient(credentials)
    const res = await client.get<FactusolExpense>(`gastos/${id}`)
    return transformExpense(res)
  }

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new FactusolClient(credentials)
    const res = await client.get<FactusolCreditMemo[]>('facturas-rectificativas', this.paginationParams(params))
    return (res ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new FactusolClient(credentials)
    const res = await client.get<FactusolCreditMemo>(`facturas-rectificativas/${id}`)
    return transformCreditMemo(res)
  }

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new FactusolClient(credentials)
    const res = await client.get<FactusolTransaction[]>('movimientos', this.paginationParams(params))
    return (res ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new FactusolClient(credentials)
    const res = await client.get<FactusolTransaction>(`movimientos/${id}`)
    return transformTransaction(res)
  }
}
