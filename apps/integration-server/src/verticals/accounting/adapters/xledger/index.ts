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

import { connectionScope, cursorPagerKey, pageByRows } from '@opensteward/shared'

import { buildAuthUrl, exchangeCode, refreshCredentials } from './auth'
import { XledgerClient } from './client'
import { DEFAULT_PAGE_SIZE } from './constants'
import {
  MAX_PAGE_SIZE,
  SUBLEDGER_TRANSACTION_FIELDS,
  connectionQuery,
  recordQuery,
  relayPage,
  subledgerKind,
  type RelayConnection,
  type XledgerSubledgerTransaction,
} from './relay'

import { transformInvoice } from './transform/invoice'
import {
  CONTACT_ID_PREFIX,
  transformContact,
  type XledgerContact,
  type XledgerContactKind,
} from './transform/contact'
import { transformAccount, type XledgerAccount } from './transform/account'
import { transformJournal, type XledgerJournal } from './transform/journal'
import { transformOrganization, type XledgerOrganization } from './transform/organization'
import { transformBill } from './transform/bill'
import { transformTaxRate, type XledgerTaxRate } from './transform/taxrate'
import { transformTransaction, type XledgerTransaction } from './transform/transaction'
import { transformExpense, type XledgerExpense } from './transform/expense'
import { transformCreditMemo } from './transform/creditmemo'

// Xledger exposes a GraphQL API only. Lists are Relay connections; see relay.ts.

interface XledgerAdapterConfig {
  clientId: string
  clientSecret?: string
  redirectUri?: string
  scopes?: string[]
}

/**
 * The shape the lists below that were NOT rebuilt still read. Their roots and
 * fields have no first-party documentation to rebuild them from (see the
 * rebuild record), so they are left as they were.
 */
interface XledgerConnection<T> {
  edges: Array<{ node: T }>
  pageInfo: { hasNextPage: boolean; endCursor: string | null }
}

/** The subledger transaction lists, and which of their rows each one serves. */
type SubledgerRoot = 'arTransactions' | 'apTransactions'

/** A position in the contact stream: the customers, then the suppliers. */
interface ContactPosition {
  list: 'customers' | 'suppliers'
  after?: string
}

const CONTACT_LISTS: Record<ContactPosition['list'], XledgerContactKind> = {
  customers: 'customer',
  suppliers: 'supplier',
}

/**
 * Node selections, each exactly the fields its first-party article queries:
 * `code description dbId companyDbId` (customers, article 8681708023698) and
 * `code description dbId` (suppliers, article 8674660344338).
 */
const CONTACT_FIELDS: Record<ContactPosition['list'], string> = {
  customers: 'code description dbId companyDbId',
  suppliers: 'code description dbId',
}

/**
 * Pager scope for one connection. An Xledger token carries no entity id the
 * adapter can read, so the connection is told apart by the fingerprint
 * `connectionScope` takes of its token, never by the token itself.
 */
function pagerScope(credentials: Credentials): string {
  return connectionScope('xledger', credentials)
}

function notFound(what: string, id: string): Error {
  return Object.assign(new Error(`Xledger: ${what} ${id} not found`), { statusCode: 404 })
}

export class XledgerAdapter implements AccountingAdapter {
  readonly platform = 'xledger'
  readonly version = '0.1.0'
  /** "Xledger's API has a limit of 10000 records per query" (GraphQL pagination, article 23685633055250). */
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  private apiToken: string

  constructor(config: XledgerAdapterConfig) {
    this.apiToken = config.clientId
  }

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(apiToken: string, _redirectUri: string): Promise<Credentials> {
    return exchangeCode(apiToken)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return refreshCredentials(credentials)
  }

  // --- Organization ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new XledgerClient(credentials)
    const result = await client.query<{ entity: XledgerOrganization }>(
      `query { entity { dbId description orgNo currencyCode address { street city postalCode countryCode } } }`,
    )
    return transformOrganization(result.entity)
  }

  // --- Subledger transactions (invoices, bills, credit notes) ---

  /**
   * The caller's page of one kind of row from `arTransactions` or
   * `apTransactions`: invoices and credit notes are both AR transactions, told
   * apart only by the sign of `invoiceAmount` (see `subledgerKind`), so the
   * rows are filtered out of upstream pages and `pageByRows` cuts the caller's
   * page from them with `hasMore` exact.
   *
   * Every upstream page asks for the documented maximum: "When asking for a lot
   * of data, (e.g., downloading all your transactions), make sure you are using
   * the biggest page size you can (10 000). The query cost does not scale
   * linearly with the number of rows" (GraphQL Documentation). Xledger bills per
   * request past an allowance ("£0.01 per additional request", article
   * 33393587744786), and the row pager keeps the last upstream page, so a
   * sequential walk costs one request per 10,000 rows whatever the caller's
   * page size.
   *
   * These lists used to call `customerInvoices`, `supplierInvoices` and
   * `creditNotes`, which no Xledger document names, and read `params.cursor`,
   * which the router never sets, so every page was page 1.
   */
  private async subledgerRows<R>(
    credentials: Credentials,
    params: QueryParams,
    root: SubledgerRoot,
    kind: 'invoice' | 'credit',
    transform: (raw: XledgerSubledgerTransaction) => R,
  ): Promise<R[]> {
    const client = new XledgerClient(credentials)
    const query = connectionQuery(root, MAX_PAGE_SIZE, SUBLEDGER_TRANSACTION_FIELDS)
    const { items } = await pageByRows<R, string>(
      cursorPagerKey(pagerScope(credentials), `${root}:${kind}`, { first: MAX_PAGE_SIZE }),
      params,
      async (after) => {
        const data = await client.query<
          Partial<Record<SubledgerRoot, RelayConnection<XledgerSubledgerTransaction>>>
        >(query, { after: after ?? null })
        const page = relayPage(root, data[root])
        return {
          items: page.items.filter((raw) => subledgerKind(raw) === kind).map(transform),
          next: page.next,
        }
      },
      { defaultLimit: DEFAULT_PAGE_SIZE },
    )
    return items
  }

  /**
   * One subledger transaction by id, when it is of the kind asked for. The
   * record roots `arTransaction` and `apTransaction` follow the documented
   * single-record form (see `recordQuery`).
   */
  private async subledgerRecord(
    credentials: Credentials,
    root: 'arTransaction' | 'apTransaction',
    kind: 'invoice' | 'credit',
    what: string,
    id: string,
  ): Promise<XledgerSubledgerTransaction> {
    const client = new XledgerClient(credentials)
    const data = await client.query<
      Partial<Record<typeof root, XledgerSubledgerTransaction | null>>
    >(recordQuery(root, SUBLEDGER_TRANSACTION_FIELDS), { dbId: id })
    const raw = data[root]
    if (!raw || subledgerKind(raw) !== kind) throw notFound(what, id)
    return raw
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    return this.subledgerRows(credentials, params, 'arTransactions', 'invoice', transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    return transformInvoice(
      await this.subledgerRecord(credentials, 'arTransaction', 'invoice', 'invoice', id),
    )
  }

  // --- Bills ---

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    return this.subledgerRows(credentials, params, 'apTransactions', 'invoice', transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    return transformBill(
      await this.subledgerRecord(credentials, 'apTransaction', 'invoice', 'bill', id),
    )
  }

  // --- Contacts ---

  /**
   * Customers, then suppliers, as one stream. Xledger keeps them in two
   * registers, each a Relay connection (`customers(...)`, `suppliers(...)` in
   * articles 8681708023698 and 8674660344338; the pagination article pages
   * `customers(first: 10)`). The list used to call `glObjects`, which in the
   * articles are only GL dimension inputs (`#glObject1: {code: ""}`), never a
   * contact register.
   *
   * No `objectStatus` is sent. The GraphQL Documentation says "For types where
   * this applies, we add an "objectStatus" field which can be either OPEN (the
   * default), CLOSED, or ALL", but no first-party page says whether customers
   * or suppliers are such types, and an argument a root does not take fails the
   * whole query. Closed customers and suppliers may therefore be missing from
   * this list until a live schema settles it.
   */
  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new XledgerClient(credentials)
    const { items } = await pageByRows<Contact, ContactPosition>(
      cursorPagerKey(pagerScope(credentials), 'contacts', { first: MAX_PAGE_SIZE }),
      params,
      async (pos) => {
        const at: ContactPosition = pos ?? { list: 'customers' }
        const data = await client.query<
          Partial<Record<ContactPosition['list'], RelayConnection<XledgerContact>>>
        >(connectionQuery(at.list, MAX_PAGE_SIZE, CONTACT_FIELDS[at.list]), {
          after: at.after ?? null,
        })
        const page = relayPage(at.list, data[at.list])
        const kind = CONTACT_LISTS[at.list]
        let next: ContactPosition | undefined
        if (page.next !== undefined) next = { list: at.list, after: page.next }
        else if (at.list === 'customers') next = { list: 'suppliers' }
        return { items: page.items.map((raw) => transformContact(raw, kind)), next }
      },
      { defaultLimit: DEFAULT_PAGE_SIZE },
    )
    return items
  }

  /** A contact id names its register (`cust_<dbId>` or `supp_<dbId>`), read with `customer(dbId:)` or `supplier(dbId:)`. */
  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const kind = (Object.keys(CONTACT_ID_PREFIX) as XledgerContactKind[]).find((k) =>
      id.startsWith(`${CONTACT_ID_PREFIX[k]}_`),
    )
    const dbId = kind ? id.slice(CONTACT_ID_PREFIX[kind].length + 1) : ''
    if (!kind || !dbId) throw notFound('contact', id)
    const list = kind === 'customer' ? 'customers' : 'suppliers'
    const client = new XledgerClient(credentials)
    const data = await client.query<Partial<Record<XledgerContactKind, XledgerContact | null>>>(
      recordQuery(kind, CONTACT_FIELDS[list]),
      { dbId },
    )
    const raw = data[kind]
    if (!raw) throw notFound('contact', id)
    return transformContact(raw, kind)
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new XledgerClient(credentials)
    const first = params.limit ?? DEFAULT_PAGE_SIZE
    const after = params.cursor ?? null
    const result = await client.query<{ accounts: XledgerConnection<XledgerAccount> }>(
      `query($first: Int, $after: String) {
        accounts(first: $first, after: $after) {
          edges { node { dbId code description accountType isActive } }
        }
      }`,
      { first, after },
    )
    return (result.accounts.edges ?? []).map((e) => transformAccount(e.node))
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new XledgerClient(credentials)
    const result = await client.query<{ account: XledgerAccount }>(
      `query($id: ID!) { account(dbId: $id) { dbId code description accountType isActive } }`,
      { id },
    )
    return transformAccount(result.account)
  }

  // --- Journals ---

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new XledgerClient(credentials)
    const first = params.limit ?? DEFAULT_PAGE_SIZE
    const after = params.cursor ?? null
    const result = await client.query<{ transactions: XledgerConnection<XledgerJournal> }>(
      `query($first: Int, $after: String) {
        transactions(first: $first, after: $after) {
          edges { node { dbId description transactionDate lines { edges { node { dbId account { dbId } description debitAmount creditAmount } } } } }
        }
      }`,
      { first, after },
    )
    return (result.transactions.edges ?? []).map((e) => transformJournal(e.node))
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new XledgerClient(credentials)
    const result = await client.query<{ transaction: XledgerJournal }>(
      `query($id: ID!) { transaction(dbId: $id) { dbId description transactionDate lines { edges { node { dbId account { dbId } description debitAmount creditAmount } } } } }`,
      { id },
    )
    return transformJournal(result.transaction)
  }

  // --- Transactions ---

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new XledgerClient(credentials)
    const first = params.limit ?? DEFAULT_PAGE_SIZE
    const after = params.cursor ?? null
    const result = await client.query<{ ledgerEntries: XledgerConnection<XledgerTransaction> }>(
      `query($first: Int, $after: String) {
        ledgerEntries(first: $first, after: $after) {
          edges { node { dbId description transactionDate amount currencyCode account { dbId } } }
        }
      }`,
      { first, after },
    )
    return (result.ledgerEntries.edges ?? []).map((e) => transformTransaction(e.node))
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new XledgerClient(credentials)
    const result = await client.query<{ ledgerEntry: XledgerTransaction }>(
      `query($id: ID!) { ledgerEntry(dbId: $id) { dbId description transactionDate amount currencyCode account { dbId } } }`,
      { id },
    )
    return transformTransaction(result.ledgerEntry)
  }

  // --- Tax Rates ---

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new XledgerClient(credentials)
    const first = params.limit ?? DEFAULT_PAGE_SIZE
    const after = params.cursor ?? null
    const result = await client.query<{ vatCodes: XledgerConnection<XledgerTaxRate> }>(
      `query($first: Int, $after: String) {
        vatCodes(first: $first, after: $after) {
          edges { node { dbId code description rate } }
        }
      }`,
      { first, after },
    )
    return (result.vatCodes.edges ?? []).map((e) => transformTaxRate(e.node))
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new XledgerClient(credentials)
    const result = await client.query<{ vatCode: XledgerTaxRate }>(
      `query($id: ID!) { vatCode(dbId: $id) { dbId code description rate } }`,
      { id },
    )
    return transformTaxRate(result.vatCode)
  }

  // --- Expenses ---

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new XledgerClient(credentials)
    const first = params.limit ?? DEFAULT_PAGE_SIZE
    const after = params.cursor ?? null
    const result = await client.query<{ expenseClaims: XledgerConnection<XledgerExpense> }>(
      `query($first: Int, $after: String) {
        expenseClaims(first: $first, after: $after) {
          edges { node { dbId description date amount currencyCode status employee { dbId } } }
        }
      }`,
      { first, after },
    )
    return (result.expenseClaims.edges ?? []).map((e) => transformExpense(e.node))
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new XledgerClient(credentials)
    const result = await client.query<{ expenseClaim: XledgerExpense }>(
      `query($id: ID!) { expenseClaim(dbId: $id) { dbId description date amount currencyCode status employee { dbId } } }`,
      { id },
    )
    return transformExpense(result.expenseClaim)
  }

  // --- Credit Memos ---

  /**
   * Customer credit notes are AR transactions with a negative `invoiceAmount`
   * (the "Customer invoices" article's credit-note examples). The list used to
   * call `creditNotes`, which no Xledger document names.
   */
  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    return this.subledgerRows(credentials, params, 'arTransactions', 'credit', transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    return transformCreditMemo(
      await this.subledgerRecord(credentials, 'arTransaction', 'credit', 'credit memo', id),
    )
  }
}
