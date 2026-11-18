import { simpleApiKey } from '@opensteward/shared'
import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Invoice } from '../../schema/invoice'
import type { Bill } from '../../schema/bill'
import type { Contact } from '../../schema/contact'
import type { Account } from '../../schema/account'
import type { Transaction } from '../../schema/transaction'
import type { Organization } from '../../schema/organization'

import { buildAuthUrl, exchangeCode as doExchangeCode, refreshCredentials as doRefreshCredentials } from './auth'
import { FastBillClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, type FastbillInvoice } from './transform/invoice'
import { transformBill, type FastbillBill } from './transform/bill'
import { transformContact, type FastbillContact } from './transform/contact'
import { transformAccount, type FastbillAccount } from './transform/account'
import { transformOrganization, type FastbillOrganization } from './transform/organization'
import { transformTransaction, type FastbillTransaction } from './transform/transaction'
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class FastBillAdapter implements AccountingAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'fastbill'
  readonly version = '0.1.0'

  constructor() {}

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return doExchangeCode(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefreshCredentials(credentials)
  }

  private paginationFilter(params: QueryParams): Record<string, unknown> {
    return {
      LIMIT: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
      OFFSET: ((params.page ?? 1) - 1) * (params.limit ?? DEFAULT_PAGE_SIZE),
    }
  }

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new FastBillClient(credentials)
    const res = await client.request<{ CLIENTS: FastbillOrganization[] }>('client.get', 'get')
    return transformOrganization((res.CLIENTS ?? [])[0]!)
  }

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new FastBillClient(credentials)
    const { LIMIT, OFFSET } = this.paginationFilter(params)
    const res = await client.request<{ INVOICES: FastbillInvoice[] }>('invoice.get', 'get', {
      LIMIT,
      OFFSET,
    })
    return (res.INVOICES ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new FastBillClient(credentials)
    const res = await client.request<{ INVOICES: FastbillInvoice[] }>('invoice.get', 'get', {
      INVOICE_ID: id,
    })
    return transformInvoice((res.INVOICES ?? [])[0]!)
  }

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new FastBillClient(credentials)
    const { LIMIT, OFFSET } = this.paginationFilter(params)
    const res = await client.request<{ EXPENSES: FastbillBill[] }>('expense.get', 'get', {
      LIMIT,
      OFFSET,
    })
    return (res.EXPENSES ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new FastBillClient(credentials)
    const res = await client.request<{ EXPENSES: FastbillBill[] }>('expense.get', 'get', {
      EXPENSE_ID: id,
    })
    return transformBill((res.EXPENSES ?? [])[0]!)
  }

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new FastBillClient(credentials)
    const { LIMIT, OFFSET } = this.paginationFilter(params)
    const res = await client.request<{ CUSTOMERS: FastbillContact[] }>('customer.get', 'get', {
      LIMIT,
      OFFSET,
    })
    return (res.CUSTOMERS ?? []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new FastBillClient(credentials)
    const res = await client.request<{ CUSTOMERS: FastbillContact[] }>('customer.get', 'get', {
      CUSTOMER_ID: id,
    })
    return transformContact((res.CUSTOMERS ?? [])[0]!)
  }

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new FastBillClient(credentials)
    const { LIMIT, OFFSET } = this.paginationFilter(params)
    const res = await client.request<{ ACCOUNTS: FastbillAccount[] }>('revenue_account.get', 'get', {
      LIMIT,
      OFFSET,
    })
    return (res.ACCOUNTS ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new FastBillClient(credentials)
    const res = await client.request<{ ACCOUNTS: FastbillAccount[] }>('revenue_account.get', 'get', {
      ACCOUNT_ID: id,
    })
    return transformAccount((res.ACCOUNTS ?? [])[0]!)
  }

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new FastBillClient(credentials)
    const { LIMIT, OFFSET } = this.paginationFilter(params)
    const res = await client.request<{ PAYMENTS: FastbillTransaction[] }>('payment.get', 'get', {
      LIMIT,
      OFFSET,
    })
    return (res.PAYMENTS ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new FastBillClient(credentials)
    const res = await client.request<{ PAYMENTS: FastbillTransaction[] }>('payment.get', 'get', {
      PAYMENT_ID: id,
    })
    return transformTransaction((res.PAYMENTS ?? [])[0]!)
  }
}
