import { simpleApiKey } from '@opensteward/shared'
import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Invoice } from '../../schema/invoice'
import type { Bill } from '../../schema/bill'
import type { Contact } from '../../schema/contact'
import type { Account } from '../../schema/account'
import type { Journal } from '../../schema/journal'
import type { Transaction } from '../../schema/transaction'
import type { TaxRate } from '../../schema/taxrate'
import type { Expense } from '../../schema/expense'
import type { CreditMemo } from '../../schema/creditmemo'
import type { Organization } from '../../schema/organization'

import {
  buildAuthUrl,
  exchangeCode as doExchangeCode,
  refreshCredentials as doRefreshCredentials,
} from './auth'
import { NetvisorClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, type NetvisorInvoice } from './transform/invoice'
import { transformBill, type NetvisorBill } from './transform/bill'
import { transformContact, type NetvisorContact } from './transform/contact'
import { transformAccount, type NetvisorAccount } from './transform/account'
import { transformJournal, type NetvisorJournalEntry } from './transform/journal'
import { transformOrganization, type NetvisorOrganization } from './transform/organization'
import { transformExpense, type NetvisorExpense } from './transform/expense'
import { transformTaxRate, type NetvisorTaxRate } from './transform/taxrate'
import { transformTransaction, type NetvisorTransaction } from './transform/transaction'
import { transformCreditMemo, type NetvisorCreditMemo } from './transform/creditmemo'
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class NetvisorAdapter implements AccountingAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'netvisor'
  readonly version = '0.1.0'

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return doExchangeCode(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefreshCredentials(credentials)
  }

  // --- Organization ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new NetvisorClient(credentials)
    const res = await client.get<{ Company: NetvisorOrganization }>('getcompanyinformation.nv')
    return transformOrganization(res.Company)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new NetvisorClient(credentials)
    const page = params.page ?? 1
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const res = await client.get<{ Records: NetvisorInvoice[]; TotalRecords: number }>(
      'salesinvoicelist.nv',
      { Page: page, PageSize: limit },
    )
    return (res.Records ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new NetvisorClient(credentials)
    const res = await client.get<{ SalesInvoice: NetvisorInvoice }>(
      `getsalesinvoice.nv?NetvisorKey=${id}`,
    )
    return transformInvoice(res.SalesInvoice)
  }

  // --- Bills ---

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new NetvisorClient(credentials)
    const page = params.page ?? 1
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const res = await client.get<{ Records: NetvisorBill[]; TotalRecords: number }>(
      'purchaseinvoicelist.nv',
      { Page: page, PageSize: limit },
    )
    return (res.Records ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new NetvisorClient(credentials)
    const res = await client.get<{ PurchaseInvoice: NetvisorBill }>(
      `getpurchaseinvoice.nv?NetvisorKey=${id}`,
    )
    return transformBill(res.PurchaseInvoice)
  }

  // --- Contacts ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new NetvisorClient(credentials)
    const page = params.page ?? 1
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const res = await client.get<{ Records: NetvisorContact[]; TotalRecords: number }>(
      'customerlist.nv',
      { Page: page, PageSize: limit },
    )
    return (res.Records ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new NetvisorClient(credentials)
    const res = await client.get<{ Customer: NetvisorContact }>(
      `getcustomer.nv?NetvisorKey=${id}`,
    )
    return transformContact(res.Customer)
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new NetvisorClient(credentials)
    const page = params.page ?? 1
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const res = await client.get<{ Records: NetvisorAccount[]; TotalRecords: number }>(
      'accountlist.nv',
      { Page: page, PageSize: limit },
    )
    return (res.Records ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new NetvisorClient(credentials)
    const res = await client.get<{ Account: NetvisorAccount }>(
      `getaccount.nv?NetvisorKey=${id}`,
    )
    return transformAccount(res.Account)
  }

  // --- Journals ---

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new NetvisorClient(credentials)
    const page = params.page ?? 1
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const res = await client.get<{ Records: NetvisorJournalEntry[]; TotalRecords: number }>(
      'accountingledger.nv',
      { Page: page, PageSize: limit },
    )
    return (res.Records ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new NetvisorClient(credentials)
    const res = await client.get<{ Voucher: NetvisorJournalEntry }>(
      `getvoucher.nv?NetvisorKey=${id}`,
    )
    return transformJournal(res.Voucher)
  }

  // --- Transactions ---

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new NetvisorClient(credentials)
    const page = params.page ?? 1
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const res = await client.get<{ Records: NetvisorTransaction[]; TotalRecords: number }>(
      'accountingtransactionlist.nv',
      { Page: page, PageSize: limit },
    )
    return (res.Records ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new NetvisorClient(credentials)
    const res = await client.get<{ Transaction: NetvisorTransaction }>(
      `getaccountingtransaction.nv?NetvisorKey=${id}`,
    )
    return transformTransaction(res.Transaction)
  }

  // --- Tax Rates ---

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new NetvisorClient(credentials)
    const page = params.page ?? 1
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const res = await client.get<{ Records: NetvisorTaxRate[]; TotalRecords: number }>(
      'taxratelist.nv',
      { Page: page, PageSize: limit },
    )
    return (res.Records ?? []).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new NetvisorClient(credentials)
    const res = await client.get<{ TaxRate: NetvisorTaxRate }>(
      `gettaxrate.nv?NetvisorKey=${id}`,
    )
    return transformTaxRate(res.TaxRate)
  }

  // --- Expenses ---

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new NetvisorClient(credentials)
    const page = params.page ?? 1
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const res = await client.get<{ Records: NetvisorExpense[]; TotalRecords: number }>(
      'expenselist.nv',
      { Page: page, PageSize: limit },
    )
    return (res.Records ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new NetvisorClient(credentials)
    const res = await client.get<{ Expense: NetvisorExpense }>(
      `getexpense.nv?NetvisorKey=${id}`,
    )
    return transformExpense(res.Expense)
  }

  // --- Credit Memos ---

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new NetvisorClient(credentials)
    const page = params.page ?? 1
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const res = await client.get<{ Records: NetvisorCreditMemo[]; TotalRecords: number }>(
      'creditnotelist.nv',
      { Page: page, PageSize: limit },
    )
    return (res.Records ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new NetvisorClient(credentials)
    const res = await client.get<{ CreditNote: NetvisorCreditMemo }>(
      `getcreditnote.nv?NetvisorKey=${id}`,
    )
    return transformCreditMemo(res.CreditNote)
  }
}
