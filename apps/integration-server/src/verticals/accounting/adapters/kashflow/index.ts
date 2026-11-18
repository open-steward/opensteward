/**
 * KashFlow accounting adapter.
 *
 * Auth: api_key model — username + password are collected via customForm,
 * exchanged for a KashFlow session token (`Authorization: KfToken <token>`),
 * and stored in `credentials.accessToken`. The original credentials are
 * base64-encoded in `credentials.refreshToken` for re-auth on expiry.
 *
 * REST API base: https://api.kashflow.com/v2/
 * Docs: https://www.kashflow.com/developers/rest-api/
 */

import { customForm, pageLocally } from '@opensteward/shared'
import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Invoice } from '../../schema/invoice'
import type { Bill } from '../../schema/bill'
import type { Contact } from '../../schema/contact'
import type { Account } from '../../schema/account'
import type { TaxRate } from '../../schema/taxrate'
import type { Organization } from '../../schema/organization'
import type { CreditMemo } from '../../schema/creditmemo'
import type { Transaction } from '../../schema/transaction'

import { exchangeCredentials, refreshCredentials as doRefreshCredentials } from './auth'
import { KashflowClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, untransformInvoice, type KashflowInvoice } from './transform/invoice'
import { transformBill, type KashflowPurchase } from './transform/bill'
import {
  transformCustomer,
  transformSupplier,
  type KashflowCustomer,
  type KashflowSupplier,
} from './transform/contact'
import { transformAccount, type KashflowBankAccount } from './transform/account'
import { kashflowTaxId, transformTaxRate, type KashflowTax } from './transform/taxrate'
import { transformOrganization, type KashflowSettings } from './transform/organization'
import { transformCreditMemo, isCreditNote } from './transform/creditmemo'
import { transformTransaction, type KashflowBankTransaction } from './transform/transaction'

// ── Resource coverage ──────────────────────────────────────────────────────────
// Unavailable: expense        — KashFlow REST API v2 has no expense/receipt endpoint; receipts exist only in the SOAP API (InsertReceipt/GetReceipts).
// Unavailable: journal        — KashFlow REST API v2 has no journal endpoint; journals exist only in the SOAP API (GetJournals/InsertJournal).
// Unavailable: order          — KashFlow has no order concept in REST v2; Quotes (/quotes) are estimates, not orders.
// Unavailable: purchaseorder  — KashFlow REST API v2 has no purchase-order endpoint; POs are a UI-only feature.
// Unavailable: salesorder     — KashFlow REST API v2 has no sales-order endpoint; Quotes (/quotes) are not equivalent to sales orders.

// ── Credential form ───────────────────────────────────────────────────────────

const KASHFLOW_FORM = customForm({
  fields: [
    {
      name: 'username',
      label: 'KashFlow username',
      type: 'text',
      required: true,
      helpText: 'The email address you use to log in to KashFlow.',
    },
    {
      name: 'password',
      label: 'KashFlow password',
      type: 'password',
      required: true,
    },
  ],
  async exchange(input) {
    const username = (input['username'] ?? '').trim()
    const password = input['password'] ?? ''
    if (!username || !password) throw new Error('Username and password are required.')
    return exchangeCredentials(username, password)
  },
})

// ── Pagination envelope ───────────────────────────────────────────────────────

/**
 * Extract the array from a KashFlow list response.
 *
 * KashFlow v2 list endpoints wrap the array under a generic `Data` key (with a
 * sibling `MetaData` holding pagination). Some endpoints/older shapes use a
 * resource-named key (e.g. `Invoices`) or return a bare array. We try all three
 * so the adapter is robust to the exact shape.
 */
function extractList<T>(res: unknown, resourceKey: string): T[] {
  if (Array.isArray(res)) return res as T[]
  const obj = (res ?? {}) as Record<string, unknown>
  const arr = obj['Data'] ?? obj[resourceKey]
  return Array.isArray(arr) ? (arr as T[]) : []
}

/** The two values of GET /taxes' `type` parameter. */
const TAX_TYPES = ['supply', 'purchase'] as const
type TaxType = (typeof TAX_TYPES)[number]

/**
 * A listed tax, tagged with the `type` lists it came back on. The tag lands in
 * the canonical row's metadata, which is the only place a consumer can tell a
 * sales tax from a purchase tax: the upstream row carries no type.
 */
type ListedTax = KashflowTax & { kashflowTypes: TaxType[] }

// ── Adapter ───────────────────────────────────────────────────────────────────

export class KashflowAdapter implements AccountingAdapter {
  readonly platform = 'kashflow'
  readonly version = '0.1.0'

  // Connect Link support — username/password form
  credentialFields = KASHFLOW_FORM.credentialFields
  exchangeCredentials = KASHFLOW_FORM.exchangeCredentials

  getAuthUrl(_state: string): string {
    // KashFlow has no OAuth redirect flow; direct the user to the docs page
    return 'https://www.kashflow.com/developers/rest-api/authentication/'
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    // Not used for api_key adapters; treat code as base64 "username:password"
    try {
      const decoded = Buffer.from(code, 'base64').toString('utf-8')
      const colonIdx = decoded.indexOf(':')
      if (colonIdx !== -1) {
        const username = decoded.slice(0, colonIdx)
        const password = decoded.slice(colonIdx + 1)
        return exchangeCredentials(username, password)
      }
    } catch {
      // fall through
    }
    return { accessToken: code }
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefreshCredentials(credentials)
  }

  private paginationParams(params: QueryParams): Record<string, unknown> {
    return {
      perpage: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
      page: params.page ?? 1,
    }
  }

  // --- Organization ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new KashflowClient(credentials)
    const res = await client.get<{ CompanySettings?: KashflowSettings } & KashflowSettings>(
      'settings',
    )
    // The response may nest settings under `CompanySettings` or return them flat
    const settings: KashflowSettings = res.CompanySettings ?? res
    return transformOrganization(settings)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new KashflowClient(credentials)
    const res = await client.get<unknown>('invoices', this.paginationParams(params))
    return extractList<KashflowInvoice>(res, 'Invoices').map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new KashflowClient(credentials)
    const res = await client.get<KashflowInvoice>(`invoices/${id}`)
    return transformInvoice(res)
  }

  async createInvoice(credentials: Credentials, data: Partial<Invoice>): Promise<Invoice> {
    const client = new KashflowClient(credentials)
    const res = await client.post<KashflowInvoice>('invoices', untransformInvoice(data))
    return transformInvoice(res)
  }

  async updateInvoice(
    credentials: Credentials,
    id: string,
    data: Partial<Invoice>,
  ): Promise<Invoice> {
    const client = new KashflowClient(credentials)
    const res = await client.put<KashflowInvoice>(`invoices/${id}`, untransformInvoice(data))
    return transformInvoice(res)
  }

  // --- Bills (Purchases / Supplier Invoices) ---

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new KashflowClient(credentials)
    const res = await client.get<unknown>('purchases', this.paginationParams(params))
    return extractList<KashflowPurchase>(res, 'Purchases').map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new KashflowClient(credentials)
    const res = await client.get<KashflowPurchase>(`purchases/${id}`)
    return transformBill(res)
  }

  // --- Contacts (Customers + Suppliers) ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new KashflowClient(credentials)
    const [custRes, suppRes] = await Promise.all([
      client.get<unknown>('customers', this.paginationParams(params)),
      client.get<unknown>('suppliers', this.paginationParams(params)),
    ])
    const customers = extractList<KashflowCustomer>(custRes, 'Customers').map(transformCustomer)
    const suppliers = extractList<KashflowSupplier>(suppRes, 'Suppliers').map(transformSupplier)
    return [...customers, ...suppliers]
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new KashflowClient(credentials)
    if (id.startsWith('cust_')) {
      const code = id.slice(5)
      const res = await client.get<KashflowCustomer>(`customers/${code}`)
      return transformCustomer(res)
    }
    if (id.startsWith('supp_')) {
      const code = id.slice(5)
      const res = await client.get<KashflowSupplier>(`suppliers/${code}`)
      return transformSupplier(res)
    }
    throw new Error(`Invalid contact id format: ${id}. Expected cust_<code> or supp_<code>`)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const client = new KashflowClient(credentials)
    if (data.isSupplier && !data.isCustomer) {
      const res = await client.post<KashflowSupplier>('suppliers', {
        Name: data.name,
        VatNumber: data.taxNumber,
        Contacts: data.emails?.[0]
          ? [{ Email: data.emails[0].email, Telephone: data.telephones?.[0]?.telephone }]
          : undefined,
        Address: data.billingAddress
          ? {
              Line1: data.billingAddress.address1,
              Line2: data.billingAddress.address2,
              Line3: data.billingAddress.city,
              Line4: data.billingAddress.region,
              PostCode: data.billingAddress.postalCode,
              CountryCode: data.billingAddress.country,
            }
          : undefined,
      })
      return transformSupplier(res)
    }
    const res = await client.post<KashflowCustomer>('customers', {
      Name: data.name,
      VatNumber: data.taxNumber,
      Contacts: data.emails?.[0]
        ? [{ Email: data.emails[0].email, Telephone: data.telephones?.[0]?.telephone }]
        : undefined,
      // KashFlow customer addresses are an array, not a single object.
      Addresses: data.billingAddress
        ? [
            {
              Line1: data.billingAddress.address1,
              Line2: data.billingAddress.address2,
              Line3: data.billingAddress.city,
              Line4: data.billingAddress.region,
              PostCode: data.billingAddress.postalCode,
              CountryCode: data.billingAddress.country,
            },
          ]
        : undefined,
    })
    return transformCustomer(res)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const client = new KashflowClient(credentials)
    if (id.startsWith('supp_')) {
      const code = id.slice(5)
      const res = await client.put<KashflowSupplier>(`suppliers/${code}`, {
        Name: data.name,
        Contacts: data.emails?.[0]
          ? [{ Email: data.emails[0].email, Telephone: data.telephones?.[0]?.telephone }]
          : undefined,
      })
      return transformSupplier(res)
    }
    if (!id.startsWith('cust_')) {
      throw new Error(`Invalid contact id format: ${id}. Expected cust_<code> or supp_<code>`)
    }
    const code = id.slice(5)
    const res = await client.put<KashflowCustomer>(`customers/${code}`, {
      Name: data.name,
      Contacts: data.emails?.[0]
        ? [{ Email: data.emails[0].email, Telephone: data.telephones?.[0]?.telephone }]
        : undefined,
    })
    return transformCustomer(res)
  }

  // --- Accounts (Bank Accounts) ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new KashflowClient(credentials)
    const res = await client.get<KashflowBankAccount[]>('bankaccounts', this.paginationParams(params))
    return (Array.isArray(res) ? res : []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new KashflowClient(credentials)
    const res = await client.get<KashflowBankAccount>(`bankaccounts/${id}`)
    return transformAccount(res)
  }

  // --- Tax Rates ---

  /**
   * Every tax on the account: supply-side, then purchase-side, once each.
   *
   * https://www.kashflow.com/developers/rest-api/tax-list/: "GET of taxes
   * returns list of all taxes setup for user account", wrapped under a `Tax`
   * key. Its one parameter is `type`, 'supply' or 'purchase', "to indicate
   * whether the taxes to be fetched are associated with supply or purchase
   * respectively", and it defaults to 'supply'. Sending no `type` listed only
   * the supply-side taxes, so both lists are fetched.
   *
   * A tax on both lists is kept once, by the id the adapter returns for it
   * (its Code, else its Id), and tagged with both types. Keying on the
   * upstream Id instead would drop purchase taxes if each list numbers its own
   * Ids, which the docs leave open: their example lists purchase codes (TX7,
   * IM) at Ids 1 and 2. A tax with neither Code nor Id is kept as it is.
   *
   * Both requests must succeed. The merged list is served as the whole
   * collection, with its total, so serving one half when the other request
   * failed would have that half cached as complete.
   */
  private async fetchAllTaxes(client: KashflowClient): Promise<ListedTax[]> {
    const lists = await Promise.all(
      TAX_TYPES.map(async (type) => ({
        type,
        taxes: extractList<KashflowTax>(await client.get<unknown>('taxes', { type }), 'Tax'),
      })),
    )
    const byId = new Map<string, ListedTax>()
    const merged: ListedTax[] = []
    for (const { type, taxes } of lists) {
      for (const tax of taxes) {
        const id = kashflowTaxId(tax)
        const seen = id === undefined ? undefined : byId.get(id)
        if (seen) {
          if (!seen.kashflowTypes.includes(type)) seen.kashflowTypes.push(type)
          continue
        }
        const listed: ListedTax = { ...tax, kashflowTypes: [type] }
        if (id !== undefined) byId.set(id, listed)
        merged.push(listed)
      }
    }
    return merged
  }

  /**
   * The documented endpoint has no page or perpage: every request returns the
   * whole list, so the caller's page is cut from it here.
   */
  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new KashflowClient(credentials)
    const taxes = await this.fetchAllTaxes(client)
    return pageLocally(taxes.map(transformTaxRate), params)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new KashflowClient(credentials)
    // No single-tax endpoint; fetch all and find by id/code
    const found = (await this.fetchAllTaxes(client)).find(
      (t) => t.Code === id || (t.Id !== undefined && String(t.Id) === id),
    )
    if (!found) throw new Error(`KashFlow tax rate not found: ${id}`)
    return transformTaxRate(found)
  }

  // --- Credit Memos (Credit Notes) ---
  // KashFlow has no separate credit-note resource. A credit note IS an invoice
  // with a negative total (see invoice-settings `CreditNoteName`). We list
  // invoices and keep the negative ones; a single credit memo is fetched via
  // the invoices endpoint and validated to be negative.

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new KashflowClient(credentials)
    const res = await client.get<unknown>('invoices', this.paginationParams(params))
    return extractList<KashflowInvoice>(res, 'Invoices')
      .filter(isCreditNote)
      .map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new KashflowClient(credentials)
    const res = await client.get<KashflowInvoice>(`invoices/${id}`)
    if (!isCreditNote(res)) {
      throw new Error(`KashFlow invoice ${id} is not a credit note (non-negative total)`)
    }
    return transformCreditMemo(res)
  }

  // --- Transactions (Bank Transactions) ---
  // KashFlow bank transactions are scoped to a bank account.
  // Use the first bank account when no accountId is provided.

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new KashflowClient(credentials)
    // Fetch bank accounts to resolve the account id
    const accounts = await client.get<KashflowBankAccount[]>('bankaccounts', {})
    const accountList = Array.isArray(accounts) ? accounts : []
    const accountId = params['accountId']
      ? String(params['accountId'])
      : accountList[0]?.Id !== undefined
        ? String(accountList[0].Id)
        : undefined
    if (!accountId) return []
    const res = await client.get<unknown>(
      `bankaccounts/${accountId}/transactions`,
      this.paginationParams(params),
    )
    return extractList<KashflowBankTransaction>(res, 'Transactions').map((txn) =>
      transformTransaction({ ...txn, AccountId: accountId }),
    )
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new KashflowClient(credentials)
    // id format: "<accountId>:<transactionId>"
    const [accountId, txnId] = id.includes(':') ? id.split(':') : [id, id]
    const res = await client.get<KashflowBankTransaction>(
      `bankaccounts/${accountId}/transactions/${txnId}`,
    )
    return transformTransaction({ ...res, AccountId: accountId })
  }
}
