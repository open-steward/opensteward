/**
 * AFAS Software accounting adapter.
 *
 * AFAS Profit REST API:
 *   Base URL: https://{environmentId}.rest.afas.online/profitrestservices/connectors/
 *   Auth:     AfasToken <base64('<token><version>1</version><data>{apiKey}</data></token>')>
 *   Pagination: skip (offset) + take (page size); responses contain `rows[]`
 *
 * Credentials shape:
 *   accessToken      — raw AFAS API token (the <data> value)
 *   extra.environmentId — 5-digit AFAS company/environment number
 *
 * Resources supported via standard GetConnectors:
 *   - Organization  (Profit_Employers)
 *   - Invoice       (Profit_SalesInvoices)
 *   - Bill          (Profit_PurchaseInvoices)
 *   - Contact       (Profit_Debtors + Profit_Creditors)
 *   - Account       (Profit_FinancialAccounts)
 *   - Transaction   (Profit_Transactions)
 *   - TaxRate       (Profit_VAT_code)
 *   - CreditMemo    (Profit_CreditNotes)
 *
 * Resources supported via standard GetConnectors (additional):
 *   - Expense       (Profit_Declaraties)
 *   - Journal       (Profit_Journals)
 *   - Order         (Profit_DeliveryOrders)
 *   - PurchaseOrder (Profit_PurchaseOrders)
 *   - SalesOrder    (Profit_SalesOrders)
 */
import { customForm } from '@opensteward/shared'
import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Invoice } from '../../schema/invoice'
import type { Bill } from '../../schema/bill'
import type { Contact } from '../../schema/contact'
import type { Account } from '../../schema/account'
import type { Transaction } from '../../schema/transaction'
import type { TaxRate } from '../../schema/taxrate'
import type { CreditMemo } from '../../schema/creditmemo'
import type { Organization } from '../../schema/organization'
import type { Expense } from '../../schema/expense'
import type { Journal } from '../../schema/journal'
import type { Order } from '../../schema/order'
import type { PurchaseOrder } from '../../schema/purchaseorder'
import type { SalesOrder } from '../../schema/salesorder'

import { getAuthUrl, exchangeCode as doExchangeCode, refreshCredentials as doRefreshCredentials } from './auth'
import { AfasClient, type AfasListResponse } from './client'
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  CONNECTOR_SALES_INVOICES,
  CONNECTOR_PURCHASE_INVOICES,
  CONNECTOR_CREDIT_NOTES,
  CONNECTOR_DEBTORS,
  CONNECTOR_CREDITORS,
  CONNECTOR_FINANCIAL_ACCOUNTS,
  CONNECTOR_EMPLOYERS,
  CONNECTOR_TRANSACTIONS,
  CONNECTOR_VAT_CODES,
  CONNECTOR_DECLARATIONS,
  CONNECTOR_JOURNALS,
  CONNECTOR_DELIVERY_ORDERS,
  CONNECTOR_PURCHASE_ORDERS,
  CONNECTOR_SALES_ORDERS,
} from './constants'

import { transformInvoice, type AfasSalesInvoice } from './transform/invoice'
import { transformBill, type AfasPurchaseInvoice } from './transform/bill'
import { transformDebtor, transformCreditor, type AfasDebtor, type AfasCreditor } from './transform/contact'
import { transformAccount, type AfasFinancialAccount } from './transform/account'
import { transformOrganization, type AfasEmployer } from './transform/organization'
import { transformTransaction, type AfasTransaction } from './transform/transaction'
import { transformTaxRate, type AfasVatCode } from './transform/taxrate'
import { transformCreditMemo, type AfasCreditNote } from './transform/creditmemo'
import { transformExpense, type AfasExpenseClaim } from './transform/expense'
import { transformJournal, type AfasJournal } from './transform/journal'
import { transformOrder, type AfasOrder } from './transform/order'
import { transformPurchaseOrder, type AfasPurchaseOrder } from './transform/purchaseorder'
import { transformSalesOrder, type AfasSalesOrder } from './transform/salesorder'

// ── Credential form ─────────────────────────────────────────────────────────

const AFAS_FORM = customForm({
  fields: [
    {
      name: 'environmentId',
      label: 'Environment ID',
      type: 'text',
      placeholder: '12345',
      helpText: 'Your 5-digit AFAS company/environment number.',
      required: true,
    },
    {
      name: 'apiKey',
      label: 'API token',
      type: 'password',
      helpText: 'The token value from your AFAS App Connector configuration.',
      required: true,
    },
  ],
  async exchange(fields) {
    const environmentId = (fields['environmentId'] ?? '').trim()
    const apiKey = (fields['apiKey'] ?? '').trim()
    if (!environmentId) throw new Error('Environment ID is required.')
    if (!apiKey) throw new Error('API token is required.')
    return { accessToken: apiKey, extra: { environmentId } }
  },
})

// ── Adapter ──────────────────────────────────────────────────────────────────

export class AfasAdapter implements AccountingAdapter {
  readonly platform = 'afas'
  readonly version = '0.1.0'

  // Connect Link support — custom two-field form
  credentialFields = AFAS_FORM.credentialFields
  exchangeCredentials = AFAS_FORM.exchangeCredentials

  getAuthUrl(_state: string): string {
    return getAuthUrl(_state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return doExchangeCode(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefreshCredentials(credentials)
  }

  /** Builds AFAS skip/take pagination params from canonical QueryParams */
  private paginationParams(params: QueryParams): Record<string, unknown> {
    const take = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const page = params.page ?? 1
    const skip = (page - 1) * take
    return { skip, take }
  }

  // --- Organization ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new AfasClient(credentials)
    const res = await client.get<AfasListResponse<AfasEmployer>>(CONNECTOR_EMPLOYERS, { skip: 0, take: 1 })
    const employer = res.rows?.[0]
    if (!employer) throw new Error('No employer record found in AFAS Profit_Employers')
    return transformOrganization(employer)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new AfasClient(credentials)
    const res = await client.get<AfasListResponse<AfasSalesInvoice>>(
      CONNECTOR_SALES_INVOICES,
      this.paginationParams(params),
    )
    return (res.rows ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new AfasClient(credentials)
    // Filter by invoice number using AFAS filterfieldids / filtervalues parameters
    const res = await client.get<AfasListResponse<AfasSalesInvoice>>(CONNECTOR_SALES_INVOICES, {
      filterfieldids: 'InvoiceNr',
      filtervalues: id,
      operatortypes: '1',
      skip: 0,
      take: 1,
    })
    const row = res.rows?.[0]
    if (!row) throw new Error(`Invoice not found: ${id}`)
    return transformInvoice(row)
  }

  // --- Bills (Purchase Invoices) ---

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new AfasClient(credentials)
    const res = await client.get<AfasListResponse<AfasPurchaseInvoice>>(
      CONNECTOR_PURCHASE_INVOICES,
      this.paginationParams(params),
    )
    return (res.rows ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new AfasClient(credentials)
    const res = await client.get<AfasListResponse<AfasPurchaseInvoice>>(CONNECTOR_PURCHASE_INVOICES, {
      filterfieldids: 'InvoiceNr',
      filtervalues: id,
      operatortypes: '1',
      skip: 0,
      take: 1,
    })
    const row = res.rows?.[0]
    if (!row) throw new Error(`Bill not found: ${id}`)
    return transformBill(row)
  }

  // --- Contacts (Debtors + Creditors) ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new AfasClient(credentials)
    const pagination = this.paginationParams(params)
    const [debtorRes, creditorRes] = await Promise.all([
      client.get<AfasListResponse<AfasDebtor>>(CONNECTOR_DEBTORS, pagination),
      client.get<AfasListResponse<AfasCreditor>>(CONNECTOR_CREDITORS, pagination),
    ])
    return [
      ...(debtorRes.rows ?? []).map(transformDebtor),
      ...(creditorRes.rows ?? []).map(transformCreditor),
    ]
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new AfasClient(credentials)
    if (id.startsWith('deb_')) {
      const relId = id.slice(4)
      const res = await client.get<AfasListResponse<AfasDebtor>>(CONNECTOR_DEBTORS, {
        filterfieldids: 'DbId',
        filtervalues: relId,
        operatortypes: '1',
        skip: 0,
        take: 1,
      })
      const row = res.rows?.[0]
      if (!row) throw new Error(`Debtor not found: ${id}`)
      return transformDebtor(row)
    }
    if (id.startsWith('crd_')) {
      const relId = id.slice(4)
      const res = await client.get<AfasListResponse<AfasCreditor>>(CONNECTOR_CREDITORS, {
        filterfieldids: 'CrId',
        filtervalues: relId,
        operatortypes: '1',
        skip: 0,
        take: 1,
      })
      const row = res.rows?.[0]
      if (!row) throw new Error(`Creditor not found: ${id}`)
      return transformCreditor(row)
    }
    throw new Error(`Invalid contact id format: ${id}. Expected deb_<n> or crd_<n>`)
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new AfasClient(credentials)
    const res = await client.get<AfasListResponse<AfasFinancialAccount>>(
      CONNECTOR_FINANCIAL_ACCOUNTS,
      this.paginationParams(params),
    )
    return (res.rows ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new AfasClient(credentials)
    const res = await client.get<AfasListResponse<AfasFinancialAccount>>(CONNECTOR_FINANCIAL_ACCOUNTS, {
      filterfieldids: 'AccountNr',
      filtervalues: id,
      operatortypes: '1',
      skip: 0,
      take: 1,
    })
    const row = res.rows?.[0]
    if (!row) throw new Error(`Account not found: ${id}`)
    return transformAccount(row)
  }

  // --- Transactions ---

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new AfasClient(credentials)
    const res = await client.get<AfasListResponse<AfasTransaction>>(
      CONNECTOR_TRANSACTIONS,
      this.paginationParams(params),
    )
    return (res.rows ?? []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new AfasClient(credentials)
    const res = await client.get<AfasListResponse<AfasTransaction>>(CONNECTOR_TRANSACTIONS, {
      filterfieldids: 'TransactionNr',
      filtervalues: id,
      operatortypes: '1',
      skip: 0,
      take: 1,
    })
    const row = res.rows?.[0]
    if (!row) throw new Error(`Transaction not found: ${id}`)
    return transformTransaction(row)
  }

  // --- Tax Rates ---

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new AfasClient(credentials)
    const res = await client.get<AfasListResponse<AfasVatCode>>(
      CONNECTOR_VAT_CODES,
      this.paginationParams(params),
    )
    return (res.rows ?? []).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new AfasClient(credentials)
    const res = await client.get<AfasListResponse<AfasVatCode>>(CONNECTOR_VAT_CODES, {
      filterfieldids: 'VatCode',
      filtervalues: id,
      operatortypes: '1',
      skip: 0,
      take: 1,
    })
    const row = res.rows?.[0]
    if (!row) throw new Error(`TaxRate not found: ${id}`)
    return transformTaxRate(row)
  }

  // --- Credit Memos ---

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new AfasClient(credentials)
    const res = await client.get<AfasListResponse<AfasCreditNote>>(
      CONNECTOR_CREDIT_NOTES,
      this.paginationParams(params),
    )
    return (res.rows ?? []).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new AfasClient(credentials)
    const res = await client.get<AfasListResponse<AfasCreditNote>>(CONNECTOR_CREDIT_NOTES, {
      filterfieldids: 'CrNoteNr',
      filtervalues: id,
      operatortypes: '1',
      skip: 0,
      take: 1,
    })
    const row = res.rows?.[0]
    if (!row) throw new Error(`CreditMemo not found: ${id}`)
    return transformCreditMemo(row)
  }

  // --- Expenses (Declaraties) ---

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new AfasClient(credentials)
    const res = await client.get<AfasListResponse<AfasExpenseClaim>>(
      CONNECTOR_DECLARATIONS,
      this.paginationParams(params),
    )
    return (res.rows ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new AfasClient(credentials)
    const res = await client.get<AfasListResponse<AfasExpenseClaim>>(CONNECTOR_DECLARATIONS, {
      filterfieldids: 'DeclarationNr',
      filtervalues: id,
      operatortypes: '1',
      skip: 0,
      take: 1,
    })
    const row = res.rows?.[0]
    if (!row) throw new Error(`Expense not found: ${id}`)
    return transformExpense(row)
  }

  // --- Journals ---

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new AfasClient(credentials)
    const res = await client.get<AfasListResponse<AfasJournal>>(
      CONNECTOR_JOURNALS,
      this.paginationParams(params),
    )
    return (res.rows ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new AfasClient(credentials)
    const res = await client.get<AfasListResponse<AfasJournal>>(CONNECTOR_JOURNALS, {
      filterfieldids: 'JournalNr',
      filtervalues: id,
      operatortypes: '1',
      skip: 0,
      take: 1,
    })
    const row = res.rows?.[0]
    if (!row) throw new Error(`Journal not found: ${id}`)
    return transformJournal(row)
  }

  // --- Orders (Delivery Orders) ---

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new AfasClient(credentials)
    const res = await client.get<AfasListResponse<AfasOrder>>(
      CONNECTOR_DELIVERY_ORDERS,
      this.paginationParams(params),
    )
    return (res.rows ?? []).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new AfasClient(credentials)
    const res = await client.get<AfasListResponse<AfasOrder>>(CONNECTOR_DELIVERY_ORDERS, {
      filterfieldids: 'OrderNr',
      filtervalues: id,
      operatortypes: '1',
      skip: 0,
      take: 1,
    })
    const row = res.rows?.[0]
    if (!row) throw new Error(`Order not found: ${id}`)
    return transformOrder(row)
  }

  // --- Purchase Orders ---

  async listPurchaseOrders(credentials: Credentials, params: QueryParams): Promise<PurchaseOrder[]> {
    const client = new AfasClient(credentials)
    const res = await client.get<AfasListResponse<AfasPurchaseOrder>>(
      CONNECTOR_PURCHASE_ORDERS,
      this.paginationParams(params),
    )
    return (res.rows ?? []).map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const client = new AfasClient(credentials)
    const res = await client.get<AfasListResponse<AfasPurchaseOrder>>(CONNECTOR_PURCHASE_ORDERS, {
      filterfieldids: 'OrderNr',
      filtervalues: id,
      operatortypes: '1',
      skip: 0,
      take: 1,
    })
    const row = res.rows?.[0]
    if (!row) throw new Error(`PurchaseOrder not found: ${id}`)
    return transformPurchaseOrder(row)
  }

  // --- Sales Orders ---

  async listSalesOrders(credentials: Credentials, params: QueryParams): Promise<SalesOrder[]> {
    const client = new AfasClient(credentials)
    const res = await client.get<AfasListResponse<AfasSalesOrder>>(
      CONNECTOR_SALES_ORDERS,
      this.paginationParams(params),
    )
    return (res.rows ?? []).map(transformSalesOrder)
  }

  async getSalesOrder(credentials: Credentials, id: string): Promise<SalesOrder> {
    const client = new AfasClient(credentials)
    const res = await client.get<AfasListResponse<AfasSalesOrder>>(CONNECTOR_SALES_ORDERS, {
      filterfieldids: 'OrderNr',
      filtervalues: id,
      operatortypes: '1',
      skip: 0,
      take: 1,
    })
    const row = res.rows?.[0]
    if (!row) throw new Error(`SalesOrder not found: ${id}`)
    return transformSalesOrder(row)
  }
}
