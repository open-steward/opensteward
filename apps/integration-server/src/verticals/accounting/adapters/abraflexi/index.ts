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

import { pageOffset } from '@opensteward/shared'
import {
  buildAuthUrl,
  credentialForm,
  exchangeCode,
  refreshCredentials as doRefreshCredentials,
} from './auth'
import { AbraflexiClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, type AbraflexiInvoice } from './transform/invoice'
import { transformBill, type AbraflexiBill } from './transform/bill'
import { transformContact, type AbraflexiContact } from './transform/contact'
import { transformAccount, type AbraflexiAccount } from './transform/account'
import { transformJournal, type AbraflexiJournal } from './transform/journal'
import { transformTransaction, type AbraflexiTransaction } from './transform/transaction'
import { transformTaxRate, type AbraflexiTaxRate } from './transform/taxrate'
import { transformExpense, type AbraflexiExpense } from './transform/expense'
import { transformCreditMemo, type AbraflexiCreditMemo } from './transform/creditmemo'
import { transformOrder, type AbraflexiOrder } from './transform/order'
import { transformSalesOrder, type AbraflexiSalesOrder } from './transform/salesorder'
import { transformPurchaseOrder, type AbraflexiPurchaseOrder } from './transform/purchaseorder'
import { transformOrganization, type AbraflexiOrganization } from './transform/organization'

interface AbraflexiAdapterConfig {
  clientId?: string
  clientSecret?: string
  redirectUri?: string
  scopes?: string[]
}

export class AbraflexiAdapter implements AccountingAdapter {
  readonly platform = 'abraflexi'
  readonly version = '0.1.0'

  constructor(_config: AbraflexiAdapterConfig = {}) {}

  getAuthUrl(_state: string): string { return buildAuthUrl(_state) }
  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> { return exchangeCode(code) }
  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefreshCredentials(credentials)
  }

  // Connect Link support — direct credential entry via the shared
  // customForm helper (multi-field: instance URL + basic auth pair).
  credentialFields = credentialForm.credentialFields
  exchangeCredentials = credentialForm.exchangeCredentials

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new AbraflexiClient(credentials)
    // AbraFlexi evidence for company info
    const res = await client.get<AbraflexiOrganization>('nastaveni')
    return transformOrganization(res)
  }

  // Only listCreditMemos still uses this: `dobropis` is not an AbraFlexi
  // evidence (the vendor's demo answers 404), so it is not paging-fixed.
  private pagination(params: QueryParams) {
    return { start: ((params.page ?? 1) - 1) * DEFAULT_PAGE_SIZE, limit: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE) }
  }

  // https://podpora.flexibee.eu/en/articles/4722193-pagination — `start` is
  // "How many records to skip"; `limit` has no documented maximum and "The
  // value 0 returns all records without limit", so only a positive whole number
  // is sent (the vendor's demo also reads a negative limit as "all", and
  // answers a fractional or non-numeric one with a 400).
  private offsetPage(params: QueryParams) {
    const asked = Math.floor(params.limit ?? Number.NaN)
    const limit = Number.isFinite(asked) && asked > 0 ? asked : DEFAULT_PAGE_SIZE
    return { start: pageOffset(params, limit), limit }
  }

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new AbraflexiClient(credentials)
    // AbraFlexi evidence: faktura-vydana (issued/sales invoices)
    const res = await client.get<{ winstrom: { 'faktura-vydana': AbraflexiInvoice[] } }>('faktura-vydana', this.offsetPage(params))
    const items = res?.winstrom?.['faktura-vydana'] ?? []
    return items.map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new AbraflexiClient(credentials)
    const res = await client.get<{ winstrom: { 'faktura-vydana': AbraflexiInvoice[] } }>(`faktura-vydana/${id}`)
    return transformInvoice(res?.winstrom?.['faktura-vydana']?.[0] ?? (res as unknown as AbraflexiInvoice))
  }

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new AbraflexiClient(credentials)
    // AbraFlexi evidence: faktura-prijata (received/purchase invoices)
    const res = await client.get<{ winstrom: { 'faktura-prijata': AbraflexiBill[] } }>('faktura-prijata', this.offsetPage(params))
    const items = res?.winstrom?.['faktura-prijata'] ?? []
    return items.map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new AbraflexiClient(credentials)
    const res = await client.get<{ winstrom: { 'faktura-prijata': AbraflexiBill[] } }>(`faktura-prijata/${id}`)
    return transformBill(res?.winstrom?.['faktura-prijata']?.[0] ?? (res as unknown as AbraflexiBill))
  }

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new AbraflexiClient(credentials)
    // AbraFlexi evidence: adresar (address book / contacts)
    const res = await client.get<{ winstrom: { adresar: AbraflexiContact[] } }>('adresar', this.offsetPage(params))
    const items = res?.winstrom?.adresar ?? []
    return items.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new AbraflexiClient(credentials)
    const res = await client.get<{ winstrom: { adresar: AbraflexiContact[] } }>(`adresar/${id}`)
    return transformContact(res?.winstrom?.adresar?.[0] ?? (res as unknown as AbraflexiContact))
  }

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new AbraflexiClient(credentials)
    // AbraFlexi evidence: ucet ("Účtový rozvrh", the company's chart of
    // accounts). Not ucetni-osnova: that is the statutory template.
    const res = await client.get<{ winstrom: { ucet: AbraflexiAccount[] } }>('ucet', this.offsetPage(params))
    const items = res?.winstrom?.ucet ?? []
    return items.map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new AbraflexiClient(credentials)
    const res = await client.get<{ winstrom: { ucet: AbraflexiAccount[] } }>(`ucet/${id}`)
    return transformAccount(res?.winstrom?.ucet?.[0] ?? (res as unknown as AbraflexiAccount))
  }

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new AbraflexiClient(credentials)
    // AbraFlexi evidence: interni-doklad (internal documents / journal entries)
    const res = await client.get<{ winstrom: { 'interni-doklad': AbraflexiJournal[] } }>('interni-doklad', this.offsetPage(params))
    const items = res?.winstrom?.['interni-doklad'] ?? []
    return items.map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new AbraflexiClient(credentials)
    const res = await client.get<{ winstrom: { 'interni-doklad': AbraflexiJournal[] } }>(`interni-doklad/${id}`)
    return transformJournal(res?.winstrom?.['interni-doklad']?.[0] ?? (res as unknown as AbraflexiJournal))
  }

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new AbraflexiClient(credentials)
    // AbraFlexi evidence: banka (bank transactions)
    const res = await client.get<{ winstrom: { banka: AbraflexiTransaction[] } }>('banka', this.offsetPage(params))
    const items = res?.winstrom?.banka ?? []
    return items.map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new AbraflexiClient(credentials)
    const res = await client.get<{ winstrom: { banka: AbraflexiTransaction[] } }>(`banka/${id}`)
    return transformTransaction(res?.winstrom?.banka?.[0] ?? (res as unknown as AbraflexiTransaction))
  }

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new AbraflexiClient(credentials)
    // AbraFlexi evidence: sazba-dph (VAT rates)
    const res = await client.get<{ winstrom: { 'sazba-dph': AbraflexiTaxRate[] } }>('sazba-dph', this.offsetPage(params))
    const items = res?.winstrom?.['sazba-dph'] ?? []
    return items.map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new AbraflexiClient(credentials)
    const res = await client.get<{ winstrom: { 'sazba-dph': AbraflexiTaxRate[] } }>(`sazba-dph/${id}`)
    return transformTaxRate(res?.winstrom?.['sazba-dph']?.[0] ?? (res as unknown as AbraflexiTaxRate))
  }

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new AbraflexiClient(credentials)
    const res = await client.get<{ winstrom: { 'faktura-prijata': AbraflexiExpense[] } }>('faktura-prijata', this.offsetPage(params))
    const items = res?.winstrom?.['faktura-prijata'] ?? []
    return items.map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new AbraflexiClient(credentials)
    const res = await client.get<{ winstrom: { 'faktura-prijata': AbraflexiExpense[] } }>(`faktura-prijata/${id}`)
    return transformExpense(res?.winstrom?.['faktura-prijata']?.[0] ?? (res as unknown as AbraflexiExpense))
  }

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new AbraflexiClient(credentials)
    // AbraFlexi evidence: dobropis (credit notes)
    const res = await client.get<{ winstrom: { dobropis: AbraflexiCreditMemo[] } }>('dobropis', this.pagination(params))
    const items = res?.winstrom?.dobropis ?? []
    return items.map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new AbraflexiClient(credentials)
    const res = await client.get<{ winstrom: { dobropis: AbraflexiCreditMemo[] } }>(`dobropis/${id}`)
    return transformCreditMemo(res?.winstrom?.dobropis?.[0] ?? (res as unknown as AbraflexiCreditMemo))
  }

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new AbraflexiClient(credentials)
    // AbraFlexi evidence: objednavka-prijata ("Přijaté objednávky", the orders
    // your customers place: sales orders, as transformOrder's type says)
    const res = await client.get<{ winstrom: { 'objednavka-prijata': AbraflexiOrder[] } }>('objednavka-prijata', this.offsetPage(params))
    const items = res?.winstrom?.['objednavka-prijata'] ?? []
    return items.map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new AbraflexiClient(credentials)
    const res = await client.get<{ winstrom: { 'objednavka-prijata': AbraflexiOrder[] } }>(`objednavka-prijata/${id}`)
    return transformOrder(res?.winstrom?.['objednavka-prijata']?.[0] ?? (res as unknown as AbraflexiOrder))
  }

  async listSalesOrders(credentials: Credentials, params: QueryParams): Promise<SalesOrder[]> {
    const client = new AbraflexiClient(credentials)
    // AbraFlexi evidence: objednavka-prijata (received orders = sales orders)
    const res = await client.get<{ winstrom: { 'objednavka-prijata': AbraflexiSalesOrder[] } }>('objednavka-prijata', this.offsetPage(params))
    const items = res?.winstrom?.['objednavka-prijata'] ?? []
    return items.map(transformSalesOrder)
  }

  async getSalesOrder(credentials: Credentials, id: string): Promise<SalesOrder> {
    const client = new AbraflexiClient(credentials)
    const res = await client.get<{ winstrom: { 'objednavka-prijata': AbraflexiSalesOrder[] } }>(`objednavka-prijata/${id}`)
    return transformSalesOrder(res?.winstrom?.['objednavka-prijata']?.[0] ?? (res as unknown as AbraflexiSalesOrder))
  }

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const client = new AbraflexiClient(credentials)
    // AbraFlexi evidence: objednavka-vydana ("Vydané objednávky", the orders
    // you place with suppliers: purchase orders)
    const res = await client.get<{ winstrom: { 'objednavka-vydana': AbraflexiPurchaseOrder[] } }>('objednavka-vydana', this.offsetPage(params))
    const items = res?.winstrom?.['objednavka-vydana'] ?? []
    return items.map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const client = new AbraflexiClient(credentials)
    const res = await client.get<{ winstrom: { 'objednavka-vydana': AbraflexiPurchaseOrder[] } }>(`objednavka-vydana/${id}`)
    return transformPurchaseOrder(res?.winstrom?.['objednavka-vydana']?.[0] ?? (res as unknown as AbraflexiPurchaseOrder))
  }
}
