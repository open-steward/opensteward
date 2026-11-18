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
import type { Order } from '../../schema/order'
import type { SalesOrder } from '../../schema/salesorder'
import type { PurchaseOrder } from '../../schema/purchaseorder'
import type { Organization } from '../../schema/organization'

import { buildAuthUrl, exchangeCode as exchangeCreds, refreshCredentials as refreshCreds } from './auth'
import { MeritaktivaClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, type MeritaktivaInvoice } from './transform/invoice'
import { transformBill, type MeritaktivaBill } from './transform/bill'
import { transformContact, type MeritaktivaContact } from './transform/contact'
import { transformAccount, type MeritaktivaAccount } from './transform/account'
import { transformJournal, type MeritaktivaJournal } from './transform/journal'
import { transformTransaction, type MeritaktivaTransaction } from './transform/transaction'
import { transformTaxRate, type MeritaktivaTaxRate } from './transform/taxrate'
import { transformExpense, type MeritaktivaExpense } from './transform/expense'
import { transformCreditMemo, type MeritaktivaCreditMemo } from './transform/creditmemo'
import { transformOrder, type MeritaktivaOrder } from './transform/order'
import { transformSalesOrder, type MeritaktivaSalesOrder } from './transform/salesorder'
import { transformPurchaseOrder, type MeritaktivaPurchaseOrder } from './transform/purchaseorder'
import { transformOrganization, type MeritaktivaOrganization } from './transform/organization'
const SIMPLE_API_KEY_FORM = simpleApiKey()


export class MeritaktivaAdapter implements AccountingAdapter {

  // Connect Link support — single API-key form.

  credentialFields = SIMPLE_API_KEY_FORM.credentialFields

  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  readonly platform = 'meritaktiva'
  readonly version = '0.1.0'

  getAuthUrl(_state: string): string {
    return buildAuthUrl(_state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return exchangeCreds(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return refreshCreds(credentials)
  }

  private paginationParams(params: QueryParams): Record<string, unknown> {
    return {
      page: params.page ?? 1,
      per_page: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    }
  }

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new MeritaktivaClient(credentials)
    // Merit Aktiva: GET company info
    const res = await client.get<MeritaktivaOrganization>('getcompany')
    return transformOrganization(res)
  }

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new MeritaktivaClient(credentials)
    // Merit Aktiva: GET list of sales invoices
    const res = await client.get<MeritaktivaInvoice[] | { data: MeritaktivaInvoice[] }>('getinvoices', this.paginationParams(params))
    return (Array.isArray(res) ? res : (res?.data ?? [])).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new MeritaktivaClient(credentials)
    // Merit Aktiva: GET single sales invoice by Id
    const res = await client.get<MeritaktivaInvoice>('getinvoice', { Id: id })
    return transformInvoice(res)
  }

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new MeritaktivaClient(credentials)
    // Merit Aktiva: GET list of purchase invoices
    const res = await client.get<MeritaktivaBill[] | { data: MeritaktivaBill[] }>('getpurchorders', this.paginationParams(params))
    return (Array.isArray(res) ? res : (res?.data ?? [])).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new MeritaktivaClient(credentials)
    const res = await client.get<MeritaktivaBill>('getpurchorder', { Id: id })
    return transformBill(res)
  }

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new MeritaktivaClient(credentials)
    // Merit Aktiva: GET customers/vendors list
    const res = await client.get<MeritaktivaContact[] | { data: MeritaktivaContact[] }>('getcustomers', this.paginationParams(params))
    return (Array.isArray(res) ? res : (res?.data ?? [])).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new MeritaktivaClient(credentials)
    const res = await client.get<MeritaktivaContact>('getcustomer', { Id: id })
    return transformContact(res)
  }

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new MeritaktivaClient(credentials)
    // Merit Aktiva: GET chart of accounts
    const res = await client.get<MeritaktivaAccount[] | { data: MeritaktivaAccount[] }>('getaccounts', this.paginationParams(params))
    return (Array.isArray(res) ? res : (res?.data ?? [])).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new MeritaktivaClient(credentials)
    const res = await client.get<MeritaktivaAccount>('getaccount', { Id: id })
    return transformAccount(res)
  }

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new MeritaktivaClient(credentials)
    // Merit Aktiva: GET general ledger transactions
    const res = await client.get<MeritaktivaJournal[] | { data: MeritaktivaJournal[] }>('getgltransactions', this.paginationParams(params))
    return (Array.isArray(res) ? res : (res?.data ?? [])).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new MeritaktivaClient(credentials)
    const res = await client.get<MeritaktivaJournal>('getgltransaction', { Id: id })
    return transformJournal(res)
  }

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new MeritaktivaClient(credentials)
    // Merit Aktiva: GET bank/payment transactions
    const res = await client.get<MeritaktivaTransaction[] | { data: MeritaktivaTransaction[] }>('getpayments', this.paginationParams(params))
    return (Array.isArray(res) ? res : (res?.data ?? [])).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new MeritaktivaClient(credentials)
    const res = await client.get<MeritaktivaTransaction>('getpayment', { Id: id })
    return transformTransaction(res)
  }

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new MeritaktivaClient(credentials)
    // Merit Aktiva: GET VAT codes
    const res = await client.get<MeritaktivaTaxRate[] | { data: MeritaktivaTaxRate[] }>('gettaxes', this.paginationParams(params))
    return (Array.isArray(res) ? res : (res?.data ?? [])).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new MeritaktivaClient(credentials)
    const res = await client.get<MeritaktivaTaxRate>('gettax', { Id: id })
    return transformTaxRate(res)
  }

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new MeritaktivaClient(credentials)
    const res = await client.get<MeritaktivaExpense[] | { data: MeritaktivaExpense[] }>('getpurchorders', this.paginationParams(params))
    return (Array.isArray(res) ? res : (res?.data ?? [])).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new MeritaktivaClient(credentials)
    const res = await client.get<MeritaktivaExpense>('getpurchorder', { Id: id })
    return transformExpense(res)
  }

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new MeritaktivaClient(credentials)
    // Credit invoices in Merit Aktiva are fetched via getinvoices with type filter
    const res = await client.get<MeritaktivaCreditMemo[] | { data: MeritaktivaCreditMemo[] }>('getinvoices', { ...this.paginationParams(params), InvoiceType: 'CREDIT' })
    return (Array.isArray(res) ? res : (res?.data ?? [])).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new MeritaktivaClient(credentials)
    const res = await client.get<MeritaktivaCreditMemo>('getinvoice', { Id: id })
    return transformCreditMemo(res)
  }

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new MeritaktivaClient(credentials)
    // Merit Aktiva: GET sales offers (closest to orders)
    const res = await client.get<MeritaktivaOrder[] | { data: MeritaktivaOrder[] }>('getoffers', this.paginationParams(params))
    return (Array.isArray(res) ? res : (res?.data ?? [])).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new MeritaktivaClient(credentials)
    const res = await client.get<MeritaktivaOrder>('getoffer', { Id: id })
    return transformOrder(res)
  }

  async listSalesOrders(credentials: Credentials, params: QueryParams): Promise<SalesOrder[]> {
    const client = new MeritaktivaClient(credentials)
    const res = await client.get<MeritaktivaSalesOrder[] | { data: MeritaktivaSalesOrder[] }>('getoffers', this.paginationParams(params))
    return (Array.isArray(res) ? res : (res?.data ?? [])).map(transformSalesOrder)
  }

  async getSalesOrder(credentials: Credentials, id: string): Promise<SalesOrder> {
    const client = new MeritaktivaClient(credentials)
    const res = await client.get<MeritaktivaSalesOrder>('getoffer', { Id: id })
    return transformSalesOrder(res)
  }

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const client = new MeritaktivaClient(credentials)
    const res = await client.get<MeritaktivaPurchaseOrder[] | { data: MeritaktivaPurchaseOrder[] }>('getpurchorders', this.paginationParams(params))
    return (Array.isArray(res) ? res : (res?.data ?? [])).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const client = new MeritaktivaClient(credentials)
    const res = await client.get<MeritaktivaPurchaseOrder>('getpurchorder', { Id: id })
    return transformPurchaseOrder(res)
  }
}
