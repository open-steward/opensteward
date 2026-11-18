import { toCalendarDate } from '../shared/transform'
// ── Resource coverage ──────────────────────────────────────────────────────────
// Unavailable: journal      — Crunch public API has no journal/ledger endpoint
// Unavailable: order        — Crunch public API has no orders concept/endpoint
// Unavailable: purchaseorder — Crunch public API has no purchase orders endpoint
// Unavailable: salesorder   — Crunch public API has no sales orders endpoint

import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Invoice } from '../../schema/invoice'
import type { Bill } from '../../schema/bill'
import type { Contact } from '../../schema/contact'
import type { Account } from '../../schema/account'
import type { Organization } from '../../schema/organization'
import type { Expense } from '../../schema/expense'
import type { TaxRate } from '../../schema/taxrate'
import type { CreditMemo } from '../../schema/creditmemo'
import type { Transaction } from '../../schema/transaction'

import {
  connectionScope,
  cursorPagerKey,
  pageByRows,
  pageLocally,
  type CursorPage,
} from '@opensteward/shared'

import { buildAuthUrl, exchangeCode, refreshAccessToken } from './auth'
import { CrunchClient, type CrunchPage } from './client'
import { DEFAULT_PAGE_SIZE, DEFAULT_SCOPES, MAX_PAGE_SIZE } from './constants'

import {
  transformInvoice,
  transformInvoiceState,
  untransformInvoice,
  type CrunchInvoice,
  type CrunchInvoiceState,
} from './transform/invoice'
import {
  transformCustomer,
  transformSupplier,
  untransformCustomer,
  untransformSupplier,
  type CrunchCustomerDto,
  type CrunchSupplierDto,
} from './transform/contact'
import { transformBankAccount, type CrunchBankAccount } from './transform/account'
import { transformOrganization, type CrunchCompanyDetails } from './transform/organization'
import { transformExpense, type CrunchExpenseDto } from './transform/expense'
import { transformTaxRate, type CrunchVatType } from './transform/taxrate'
import { transformBill } from './transform/bill'
import { transformCreditNote, type CrunchCreditNoteDto } from './transform/creditmemo'
import { transformPayment, type CrunchPaymentDto } from './transform/transaction'

interface CrunchAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

/** Response wrapper used by company-details endpoint. */
interface CrunchResponseWrapper<T> {
  content?: T[]
}

/** VAT types container from /expenses/vat-types or /invoices/vat-types */
interface CrunchVatTypesDto {
  vatTypes?: CrunchVatType[]
}

/**
 * Where a walk of the bank accounts' payments stands: account `i` of the
 * account list the walk is keyed by, its `reconciled` stream, and that
 * stream's 0-based upstream `page`. Replayable: fetching it again asks for the
 * same page.
 */
interface PaymentCursor {
  i: number
  reconciled: boolean
  page: number
}

const FIRST_PAYMENT_PAGE: PaymentCursor = { i: 0, reconciled: false, page: 0 }

/**
 * Upstream pages `getTransaction` reads before it gives up: 200,000 payments.
 * There is no single-payment endpoint, so a lookup walks every account's
 * payments; the cap stops an upstream that never ends a stream from looping
 * forever, the same guard `pageByRows` applies to a list call.
 */
const PAYMENT_LOOKUP_PAGES = 1_000

export class CrunchAdapter implements AccountingAdapter {
  readonly platform = 'crunch'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: CrunchAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes ?? DEFAULT_SCOPES
  }

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    return buildAuthUrl(this.clientId, this.redirectUri, overrideScopes ?? this.scopes, state)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return exchangeCode(code, this.clientId, this.clientSecret, redirectUri)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    if (!credentials.refreshToken) throw new Error('No refresh token available')
    return refreshAccessToken(credentials.refreshToken, this.clientId, this.clientSecret)
  }

  // ── Organization ────────────────────────────────────────────────────────────

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new CrunchClient(credentials)
    const res = await client.get<CrunchResponseWrapper<CrunchCompanyDetails>>('company-details/')
    const details = res.content?.[0] ?? {}
    return transformOrganization(details)
  }

  // ── Invoices ─────────────────────────────────────────────────────────────────

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new CrunchClient(credentials)
    const size = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, 200)
    // Crunch pages are zero-indexed
    const page = Math.max((params.page ?? 1) - 1, 0)
    const res = await client.get<{ content?: CrunchInvoiceState[] }>('invoices/', {
      page,
      size,
      ...(params.clientId ? { clientId: params.clientId } : {}),
    })
    return (res.content ?? []).map(transformInvoiceState)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new CrunchClient(credentials)
    const raw = await client.get<CrunchInvoice>(`invoices/${id}`)
    return transformInvoice(raw)
  }

  async createInvoice(credentials: Credentials, data: Partial<Invoice>): Promise<Invoice> {
    const client = new CrunchClient(credentials)
    const raw = await client.post<CrunchInvoice>('invoices/', untransformInvoice(data))
    return transformInvoice(raw)
  }

  async updateInvoice(
    credentials: Credentials,
    id: string,
    data: Partial<Invoice>,
  ): Promise<Invoice> {
    const client = new CrunchClient(credentials)
    const raw = await client.put<CrunchInvoice>(`invoices/${id}`, untransformInvoice(data))
    return transformInvoice(raw)
  }

  async deleteInvoice(credentials: Credentials, id: string): Promise<void> {
    const client = new CrunchClient(credentials)
    await client.delete(`invoices/${id}`)
  }

  // ── Contacts (clients) ───────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new CrunchClient(credentials)
    const size = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, 200)
    const page = Math.max((params.page ?? 1) - 1, 0)

    const [custRes, supRes] = await Promise.all([
      client.get<{ content?: CrunchCustomerDto[] }>('clients/', { page, size }),
      client.get<{ content?: CrunchSupplierDto[] }>('expenses/suppliers', { page, size }),
    ])

    return [
      ...(custRes.content ?? []).map(transformCustomer),
      ...(supRes.content ?? []).map(transformSupplier),
    ]
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new CrunchClient(credentials)
    if (id.startsWith('sup_')) {
      const raw = await client.get<CrunchSupplierDto>(`expenses/suppliers/${id.slice(4)}`)
      return transformSupplier(raw)
    }
    const raw = await client.get<CrunchCustomerDto>(`clients/${id}`)
    return transformCustomer(raw)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const client = new CrunchClient(credentials)
    if (data.isSupplier && !data.isCustomer) {
      const raw = await client.post<CrunchSupplierDto>(
        'expenses/suppliers',
        untransformSupplier(data),
      )
      return transformSupplier(raw)
    }
    const raw = await client.post<CrunchCustomerDto>('clients/', untransformCustomer(data))
    return transformCustomer(raw)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const client = new CrunchClient(credentials)
    if (id.startsWith('sup_')) {
      const raw = await client.put<CrunchSupplierDto>(
        `expenses/suppliers/${id.slice(4)}`,
        untransformSupplier(data),
      )
      return transformSupplier(raw)
    }
    const raw = await client.put<CrunchCustomerDto>(`clients/${id}`, untransformCustomer(data))
    return transformCustomer(raw)
  }

  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    const client = new CrunchClient(credentials)
    if (id.startsWith('sup_')) {
      await client.delete(`expenses/suppliers/${id.slice(4)}`)
      return
    }
    await client.delete(`clients/${id}`)
  }

  // ── Accounts (bank accounts) ─────────────────────────────────────────────────

  /**
   * `GET /banking/bank-accounts` takes no query parameters and returns every
   * bank account (`array[BankAccountDto]`), so the caller's page is sliced
   * from the whole list. Returned whole, page 2 repeated page 1.
   */
  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new CrunchClient(credentials)
    const raw = await client.get<CrunchBankAccount[]>('banking/bank-accounts')
    return pageLocally((Array.isArray(raw) ? raw : []).map(transformBankAccount), params)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new CrunchClient(credentials)
    const raw = await client.get<CrunchBankAccount>(`banking/bank-accounts/${id}`)
    return transformBankAccount(raw)
  }

  // ── Expenses ─────────────────────────────────────────────────────────────────

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new CrunchClient(credentials)
    const size = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, 200)
    const page = Math.max((params.page ?? 1) - 1, 0)
    const res = await client.get<{ content?: CrunchExpenseDto[] }>('expenses/', { page, size })
    return (res.content ?? []).map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new CrunchClient(credentials)
    const raw = await client.get<CrunchExpenseDto>(`expenses/${id}`)
    return transformExpense(raw)
  }

  async createExpense(credentials: Credentials, data: Partial<Expense>): Promise<Expense> {
    const client = new CrunchClient(credentials)
    const body: Record<string, unknown> = {
      postingDate: toCalendarDate(data.postedAt),
      supplier: data.contactId?.startsWith('sup_')
        ? { id: Number(data.contactId.slice(4)) }
        : undefined,
    }
    const raw = await client.post<CrunchExpenseDto>('expenses/', body)
    return transformExpense(raw)
  }

  // ── Tax Rates ────────────────────────────────────────────────────────────────

  /**
   * `GET /expenses/vat-types` takes no query parameters and returns every VAT
   * type (`{ vatTypes: [...] }`), so the caller's page is sliced from the
   * whole list.
   */
  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    return pageLocally(await this.fetchAllTaxRates(credentials), params)
  }

  private async fetchAllTaxRates(credentials: Credentials): Promise<TaxRate[]> {
    const client = new CrunchClient(credentials)
    const res = await client.get<CrunchVatTypesDto>('expenses/vat-types')
    return (res.vatTypes ?? []).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    // Crunch provides no single-resource endpoint for VAT types; search the
    // whole list, not one page of it.
    const all = await this.fetchAllTaxRates(credentials)
    const found = all.find((t) => t.id === id)
    if (!found) throw new Error(`TaxRate '${id}' not found in Crunch`)
    return found
  }

  // ── Bills ────────────────────────────────────────────────────────────────────
  // Derived: Crunch's expenses (GET /expenses/) represent supplier bills.
  // There is no dedicated "bills" endpoint; we re-use the same ExpenseDto.

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new CrunchClient(credentials)
    const size = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, 200)
    const page = Math.max((params.page ?? 1) - 1, 0)
    const res = await client.get<{ content?: CrunchExpenseDto[] }>('expenses/', { page, size })
    return (res.content ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new CrunchClient(credentials)
    const raw = await client.get<CrunchExpenseDto>(`expenses/${id}`)
    return transformBill(raw)
  }

  // ── Credit Memos ─────────────────────────────────────────────────────────────
  // Derived: Credit notes are embedded in Crunch invoice responses as
  // `creditNotes[]`. We expand them into individual CreditMemo records.

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new CrunchClient(credentials)
    const size = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, 200)
    const page = Math.max((params.page ?? 1) - 1, 0)
    const res = await client.get<{ content?: CrunchInvoiceState[] }>('invoices/', { page, size })
    const invoiceStates = res.content ?? []

    // Fetch full invoice details to access the creditNotes array
    const memos: CreditMemo[] = []
    await Promise.all(
      invoiceStates.map(async (state) => {
        if (!state.id) return
        const inv = await client.get<CrunchInvoice>(`invoices/${state.id}`)
        const contactId = inv.customer?.id !== undefined ? String(inv.customer.id) : undefined
        const invoiceId = String(state.id)
        for (const cn of inv.creditNotes ?? []) {
          memos.push(transformCreditNote(cn as CrunchCreditNoteDto, invoiceId, contactId))
        }
      }),
    )
    return memos
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    // Crunch has no single credit-note endpoint; search across recent invoices.
    const all = await this.listCreditMemos(credentials, { limit: 200 })
    const found = all.find((cm) => cm.id === id)
    if (!found) throw new Error(`CreditMemo '${id}' not found in Crunch`)
    return found
  }

  // ── Transactions ─────────────────────────────────────────────────────────────
  // Built: GET /banking/bank-accounts/{id}/payments returns paginated
  // PaymentDto records per account. We aggregate across all bank accounts.

  /**
   * Payments are per bank account, so the list is rows flattened out of
   * every account: account by account, in the order `GET
   * /banking/bank-accounts` lists them, each account's unreconciled payments
   * then its reconciled ones, each stream in the documented default order
   * (`date,asc`). `pageByRows` cuts exactly the caller's rows out of that
   * stream, with `hasMore` exact.
   *
   * It used to ask every account for page N at the caller's size at once:
   * up to accounts × limit rows, which the router truncated, and page 2
   * started past them, so the rows in between were never served.
   *
   * `reconciled` is documented as a required parameter with no description,
   * and was never sent. Reading it as the boolean filter its name says, both
   * values are walked so every payment is listed once.
   *
   * Every call reads the account list first, and the walk is keyed by it. A
   * row's position depends on which accounts come before it, so a changed
   * list starts a new walk rather than reusing positions recorded under the
   * old one, where a page jump would serve another account's rows.
   *
   * Upstream pages are read at the documented maximum `size` of 200 whatever
   * the caller's limit, so the walk's key leaves the limit out and a sync and
   * an API walk share it.
   */
  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new CrunchClient(credentials)
    const accounts = await this.bankAccountIds(client)
    const { items } = await pageByRows<Transaction, PaymentCursor>(
      cursorPagerKey(
        connectionScope('crunch', credentials),
        'banking/bank-accounts/{id}/payments',
        { accounts, size: MAX_PAGE_SIZE },
      ),
      params,
      (cursor) => this.paymentPage(client, accounts, cursor ?? FIRST_PAYMENT_PAGE),
      { defaultLimit: DEFAULT_PAGE_SIZE },
    )
    return items
  }

  /** Every bank account's id, in the order `GET /banking/bank-accounts` lists them. */
  private async bankAccountIds(client: CrunchClient): Promise<string[]> {
    const raw = await client.get<CrunchBankAccount[]>('banking/bank-accounts')
    return (Array.isArray(raw) ? raw : [])
      .filter((a) => a.id !== undefined && a.id !== null)
      .map((a) => String(a.id))
  }

  /**
   * One upstream page of one account's `reconciled` stream, 0-based. The
   * stream ends on the page envelope's `last` (else `totalPages`, else a short
   * page), and on an empty page whatever the envelope says: nothing follows an
   * empty page of an offset-paged list, and a stream that never reported
   * `last` would otherwise be walked forever.
   */
  private async paymentPage(
    client: CrunchClient,
    accounts: readonly string[],
    cursor: PaymentCursor,
  ): Promise<CursorPage<Transaction, PaymentCursor>> {
    const accountId = accounts[cursor.i]
    if (accountId === undefined) return { items: [] }
    const res = await client.get<Partial<CrunchPage<CrunchPaymentDto>>>(
      `banking/bank-accounts/${accountId}/payments`,
      { page: cursor.page, size: MAX_PAGE_SIZE, reconciled: cursor.reconciled },
    )
    const rows = res.content ?? []
    const more =
      rows.length > 0 &&
      (typeof res.last === 'boolean'
        ? !res.last
        : typeof res.totalPages === 'number'
          ? cursor.page + 1 < res.totalPages
          : rows.length >= MAX_PAGE_SIZE)
    const next: PaymentCursor | undefined = more
      ? { ...cursor, page: cursor.page + 1 }
      : !cursor.reconciled
        ? { ...cursor, reconciled: true, page: 0 }
        : cursor.i + 1 < accounts.length
          ? { i: cursor.i + 1, reconciled: false, page: 0 }
          : undefined
    return { items: rows.map((pmt) => transformPayment(pmt, accountId)), next }
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    // No single-transaction endpoint; walk every account's payments, every
    // page of them, until it turns up.
    const client = new CrunchClient(credentials)
    const accounts = await this.bankAccountIds(client)
    let cursor: PaymentCursor | undefined = FIRST_PAYMENT_PAGE
    for (let read = 0; cursor !== undefined; read++) {
      if (read >= PAYMENT_LOOKUP_PAGES)
        throw new Error(
          `Transaction '${id}': gave up after ${PAYMENT_LOOKUP_PAGES} pages of Crunch payments`,
        )
      const page = await this.paymentPage(client, accounts, cursor)
      const found = page.items.find((t) => t.id === id)
      if (found) return found
      cursor = page.next ?? undefined
    }
    throw new Error(`Transaction '${id}' not found in Crunch`)
  }
}
