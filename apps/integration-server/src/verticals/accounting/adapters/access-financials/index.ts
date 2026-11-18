/**
 * Access Financials accounting adapter.
 *
 * API: GraphQL at https://api.erp.accessacloud.com/financials-graphql
 *
 * Auth: Long-lived Bearer token + Ocp-Apim-Subscription-Key header.
 * Credentials are entered via the Connect Link form (customForm below).
 *
 * Supported resources:
 *   - Contacts      (customers via debtors.masterRecords, suppliers via creditors.masterRecords)
 *   - Invoices      (sales transaction enquiry, transactionType Invoice)
 *   - Bills         (purchase transaction enquiry, transactionType Invoice)
 *   - Accounts      (nominal accounts via financials.masterRecords)
 *   - Journals      (nominal transaction enquiry lines, grouped by audit number)
 *   - Sales orders  (selling.transactions.outstandingSalesOrders.header, orderType Order)
 *   - Purchase orders (purchasing.transactions.outstandingPurchaseOrders.header, orderType Order)
 *   - Credit memos  (sales transaction enquiry, transactionType CreditNote)
 *   - Transactions  (sales transaction enquiry, every transactionType)
 *
 * Every query document below uses only fields, arguments and input types of
 * the live schema, which the endpoint serves by introspection. Paging is
 * documented once for the whole API on
 * https://developer.erp.accessacloud.com/docs/financials/operations-types/queries:
 * "The page size is set to 100. When data is returned we also include
 * whether there is another page and the cursor to use to get that page."
 * "after ... expects a cursor which is returned after a request or null if
 * this is the initial request." "endCursor the value to send into after to
 * request the next page, null if no subsequent page". Every list asks for
 * that page of 100 and cuts the caller's rows out with `pageByRows`.
 *
 * `updatedAfter` is not forwarded. The enquiries do carry
 * `lastUpdatedDateTime`/`dateEdited` filters, but no page says whether a
 * row that was never edited has them set (the selling example answers
 * `"dateEdited": null`), so filtering on them could drop new rows. A full
 * list is a superset of what the caller asked for.
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: taxrate — no dedicated tax rate master record in Financials GraphQL; tax codes appear only as inline fields on transaction lines
 * Unavailable: order — no generic order endpoint; platform only exposes salesorder and purchaseorder separately
 * Unverified:  expense — Expense API exists at a separate base URL (expensews.accessacloud.com) requiring an additional X-Email admin header not collected by this adapter's credential form
 *
 * Webhooks: not documented in Access Financials API
 */
import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Invoice } from '../../schema/invoice'
import type { Bill } from '../../schema/bill'
import type { Contact } from '../../schema/contact'
import type { Account } from '../../schema/account'
import type { Journal } from '../../schema/journal'
import type { SalesOrder } from '../../schema/salesorder'
import type { PurchaseOrder } from '../../schema/purchaseorder'
import type { Organization } from '../../schema/organization'
import type { CreditMemo } from '../../schema/creditmemo'
import type { Transaction } from '../../schema/transaction'

import { connectionScope, cursorPagerKey, customForm, pageByRows } from '@opensteward/shared'
import { buildAuthUrl, exchangeCode as doExchangeCode, passthrough } from './auth'
import { AccessFinancialsClient } from './client'
import { UPSTREAM_PAGE_SIZE } from './constants'

import { transformInvoice, type AFSalesHeader } from './transform/invoice'
import { transformBill, type AFPurchaseHeader } from './transform/bill'
import {
  transformCustomer,
  transformSupplier,
  type AFCustomer,
  type AFSupplier,
} from './transform/contact'
import { transformAccount, type AFAccount } from './transform/account'
import { transformJournal, type AFNominalLine } from './transform/journal'
import { transformSalesOrder, type AFSalesOrderHeader } from './transform/salesorder'
import { transformPurchaseOrder, type AFPurchaseOrderHeader } from './transform/purchaseorder'
import { transformOrganization, type AFOrganization } from './transform/organization'
import { transformCreditMemo } from './transform/creditmemo'
import { transformTransaction } from './transform/transaction'

// ── Connect Link form ──────────────────────────────────────────────────────────

const FORM = customForm({
  fields: [
    {
      name: 'accessToken',
      label: 'Access Token',
      type: 'password',
      helpText:
        'Generate via the ERP Token Generator in the Subscription Manager workspace. Tokens last up to 365 days.',
      required: true,
    },
    {
      name: 'subscriptionKey',
      label: 'API Subscription Key',
      type: 'password',
      helpText: 'Obtain via the ERP Subscription Manager workspace application.',
      required: true,
    },
  ],
  async exchange(fields) {
    const accessToken = (fields['accessToken'] ?? '').trim()
    const subscriptionKey = (fields['subscriptionKey'] ?? '').trim()
    if (!accessToken) throw new Error('Access Token is required.')
    if (!subscriptionKey) throw new Error('API Subscription Key is required.')
    return {
      accessToken,
      extra: { subscriptionKey },
    }
  },
})

// ── GraphQL query strings ──────────────────────────────────────────────────────

/** `CustomerDetails` / `SuppliersDetails` fields, as the record list pages select them. */
const RECORD_DETAILS = `
  primaryKey code name onStop
  contactDetails { title firstName surname jobTitle }
  addressDetails { address town county country postCode email telephone mobile }
`

/**
 * One page of customers: "Example Customer Record List GraphQL Query" on
 * https://developer.erp.accessacloud.com/docs/financials/business-entities/records/customer,
 * plus `first`, which `CustomersMasterRecordQueries.records` takes.
 */
const GQL_LIST_CUSTOMERS = `
  query ($after: String, $first: Int) {
    debtors {
      masterRecords {
        customers {
          records(after: $after, first: $first) {
            pageInfo { hasNextPage endCursor }
            items { customerDetails { ${RECORD_DETAILS} } }
          }
        }
      }
    }
  }
`

/** The customer whose `customerDetails.code` equals `$code`. */
const GQL_GET_CUSTOMER = `
  query ($filter: CustomerFilterInput) {
    debtors {
      masterRecords {
        customers {
          records(filter: $filter) {
            items { customerDetails { ${RECORD_DETAILS} } }
          }
        }
      }
    }
  }
`

/** One page of suppliers: "Example Supplier Record List GraphQL Query" on .../records/supplier. */
const GQL_LIST_SUPPLIERS = `
  query ($after: String, $first: Int) {
    creditors {
      masterRecords {
        suppliers {
          records(after: $after, first: $first) {
            pageInfo { hasNextPage endCursor }
            items { supplierDetails { ${RECORD_DETAILS} } }
          }
        }
      }
    }
  }
`

/** The supplier whose `supplierDetails.code` equals `$code`. */
const GQL_GET_SUPPLIER = `
  query ($filter: SupplierFilterInput) {
    creditors {
      masterRecords {
        suppliers {
          records(filter: $filter) {
            items { supplierDetails { ${RECORD_DETAILS} } }
          }
        }
      }
    }
  }
`

/**
 * One page of nominal accounts: `first` rows after the cursor `after` (null
 * for the first page). `NominalAccountsQueries.records(after: String, first: Int)`.
 */
const GQL_LIST_ACCOUNTS = `
  query ($after: String, $first: Int) {
    financials {
      masterRecords {
        accounts {
          records(after: $after, first: $first) {
            pageInfo { hasNextPage endCursor }
            items {
              details { primaryKey accountCode accountName accountType majorHeadingCode compulsoryCosting }
              summaryData { balance turnoverYtd currencyBalance }
            }
          }
        }
      }
    }
  }
`

/**
 * One page of the sales transaction enquiry: "Query Transaction Headers" on
 * https://developer.erp.accessacloud.com/docs/financials/business-entities/transactions/sales-transactions.
 * The page's example names its filter type `SalesTransactionEnquiryFilterInput`,
 * which the live schema does not have: the argument is
 * `SalesTransactionEnquiryHeaderFilterInput`.
 */
const GQL_LIST_SALES_HEADERS = `
  query ($after: String, $first: Int, $filter: SalesTransactionEnquiryHeaderFilterInput) {
    debtors {
      transactions {
        allTransactions {
          header(after: $after, first: $first, filter: $filter) {
            pageInfo { hasNextPage endCursor }
            items {
              auditNo headerRef accountCode accountName customerRef
              transactionType transactionDescription transactionDate dueDate batched
              net tax gross outstanding
              currencySymbol currencyNet currencyTax currencyGross currencyOutstanding
            }
          }
        }
      }
    }
  }
`

/**
 * One page of the purchase transaction enquiry: "Query Transaction Headers"
 * on .../transactions/purchase-transactions, whose example declares
 * `$filter: PurchaseTransactionEnquiryHeaderFilterInput!`.
 */
const GQL_LIST_PURCHASE_HEADERS = `
  query ($after: String, $first: Int, $filter: PurchaseTransactionEnquiryHeaderFilterInput) {
    creditors {
      transactions {
        allTransactions {
          header(after: $after, first: $first, filter: $filter) {
            pageInfo { hasNextPage endCursor }
            items {
              auditNo headerRef accountCode accountName
              transactionType description date dueDate batched
              net tax gross outstanding
              currencySymbol currencyNet currencyTax currencyGross currencyOutstanding
            }
          }
        }
      }
    }
  }
`

/**
 * One page of nominal transaction lines, in audit-number order: "Query
 * Transaction Details" on .../transactions/nominal-transactions. The edges
 * carry each line's cursor, so a page can end after the last whole journal.
 */
const GQL_LIST_NOMINAL_LINES = `
  query (
    $after: String
    $first: Int
    $sort: [NominalTransactionEnquiryDetailSortSortByInput!]
    $filter: NominalTransactionEnquiryDetailFilterInput
  ) {
    financials {
      transactions {
        allTransactions {
          details(after: $after, first: $first, sort: $sort, filter: $filter) {
            pageInfo { hasNextPage endCursor }
            edges {
              cursor
              node {
                primaryKey auditNo headerRef date detail description journalType
                nominalCode nominalPrimaryKey debit credit
                currencySymbol currencyDebit currencyCredit batched
              }
            }
          }
        }
      }
    }
  }
`

/**
 * One page of outstanding sales order headers: "Get Outstanding Sales
 * Orders" on .../transactions/selling-transactions, whose example is
 * `selling { transactions { outstandingSalesOrders { header { items { ... } } } } }`.
 */
const GQL_LIST_SALES_ORDERS = `
  query ($after: String, $first: Int, $filter: OutstandingSalesOrderHeaderFilterInput) {
    selling {
      transactions {
        outstandingSalesOrders {
          header(after: $after, first: $first, filter: $filter) {
            pageInfo { hasNextPage endCursor }
            items {
              orderNumber orderType orderStatus accountCode accountName customerRef
              orderDate requiredDate orderGross netOutstanding
              currencyGross currencyNetOutstanding currencySymbol
            }
          }
        }
      }
    }
  }
`

/**
 * One page of outstanding purchase order headers: "Get Outstanding Purchase
 * Orders" on .../transactions/purchasing-transactions.
 */
const GQL_LIST_PURCHASE_ORDERS = `
  query ($after: String, $first: Int, $filter: OutstandingPurchaseOrderHeaderFilterInput) {
    purchasing {
      transactions {
        outstandingPurchaseOrders {
          header(after: $after, first: $first, filter: $filter) {
            pageInfo { hasNextPage endCursor }
            items {
              orderNumber orderType orderStatus accountCode accountName
              orderDate requiredDate orderGross netOutstanding
              currencyGross currencyNetOutstanding currencySymbol
            }
          }
        }
      }
    }
  }
`

/** Exported for the schema check in the tests. */
export const QUERY_DOCUMENTS = {
  GQL_LIST_CUSTOMERS,
  GQL_GET_CUSTOMER,
  GQL_LIST_SUPPLIERS,
  GQL_GET_SUPPLIER,
  GQL_LIST_ACCOUNTS,
  GQL_LIST_SALES_HEADERS,
  GQL_LIST_PURCHASE_HEADERS,
  GQL_LIST_NOMINAL_LINES,
  GQL_LIST_SALES_ORDERS,
  GQL_LIST_PURCHASE_ORDERS,
} as const

// ── Filters ────────────────────────────────────────────────────────────────────
// Enum filters take `eq` with a value of the live schema's enum
// (`SalesTransactionTypeEnumFilterInput { eq: SalesTransactionType }`, and so
// on). The Queries page lists the actions: "Eq - Field is equal to filter value".

const SALES_INVOICES = { transactionType: { eq: 'Invoice' } }
const SALES_CREDIT_NOTES = { transactionType: { eq: 'CreditNote' } }
const PURCHASE_INVOICES = { transactionType: { eq: 'Invoice' } }
const SALES_ORDERS = { orderType: { eq: 'Order' } }
const PURCHASE_ORDERS = { orderType: { eq: 'Order' } }

/**
 * Sort for the nominal lines: audit number, then line key, so the lines of
 * one transaction arrive together. `{ field, order }` per the Queries page:
 * "field an enum for choosing the field to apply sorting to / order an enum
 * indicating the direction of the sort"; `AuditNo` and `PrimaryKey` are
 * values of `NominalTransactionEnquiryDetailSort`.
 */
const NOMINAL_SORT = [
  { field: 'AuditNo', order: 'Ascending' },
  { field: 'PrimaryKey', order: 'Ascending' },
]

// ── GraphQL response types ─────────────────────────────────────────────────────

interface PageInfo {
  hasNextPage: boolean
  endCursor: string | null
}

interface GqlPage<T> {
  pageInfo: PageInfo
  items: T[] | null
}

interface GqlEdgePage<T> {
  pageInfo: PageInfo
  edges: Array<{ cursor: string; node: T }> | null
}

/** Where the contact stream is: which ledger, and the cursor within it. */
interface ContactCursor {
  ledger: 'customers' | 'suppliers'
  after: string | null
}

function notFound(what: string, id: string): Error {
  return Object.assign(new Error(`Access Financials: ${what} "${id}" not found`), {
    statusCode: 404,
  })
}

/** The cursor that starts the next page, or undefined on the last page. */
function nextCursor(pageInfo: PageInfo, where: string): string | undefined {
  if (!pageInfo.hasNextPage) return undefined
  if (!pageInfo.endCursor) {
    throw new Error(`Access Financials: ${where} says it has a next page but gives no endCursor`)
  }
  return pageInfo.endCursor
}

/** A whole number id, or a 404: the enquiries key rows by integers. */
function intId(what: string, id: string): number {
  if (!/^\d+$/.test(id)) throw notFound(what, id)
  return Number(id)
}

// ── Adapter ────────────────────────────────────────────────────────────────────

export class AccessFinancialsAdapter implements AccountingAdapter {
  readonly platform = 'access-financials'
  readonly version = '0.1.0'

  // Connect Link support — custom form (access token + subscription key).
  credentialFields = FORM.credentialFields
  exchangeCredentials = FORM.exchangeCredentials

  getAuthUrl(state: string): string {
    return buildAuthUrl(state)
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    return doExchangeCode(_code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return passthrough(credentials)
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  /**
   * The caller's page of a documented connection, cut by `pageByRows` out of
   * upstream pages of the documented 100.
   *
   * The key names the connection by `connectionScope` (never the token), the
   * collection, the upstream page size and the filter. The caller's limit is
   * left out: it does not size the upstream page.
   */
  private async pageConnection<R>(
    credentials: Credentials,
    params: QueryParams,
    collection: string,
    query: string,
    filter: Record<string, unknown> | undefined,
    pick: (data: unknown) => GqlPage<R>,
  ): Promise<R[]> {
    const first = UPSTREAM_PAGE_SIZE
    const client = new AccessFinancialsClient(credentials)
    const { items } = await pageByRows<R, string>(
      cursorPagerKey(connectionScope('access-financials', credentials), collection, {
        first,
        filter,
      }),
      params,
      async (after) => {
        const data = await client.graphql<unknown>(query, {
          after: after ?? null,
          first,
          ...(filter ? { filter } : {}),
        })
        const page = pick(data)
        return { items: page.items ?? [], next: nextCursor(page.pageInfo, collection) }
      },
    )
    return items
  }

  /** Every row of a filtered connection, for a lookup by key. */
  private async readAll<R>(
    client: AccessFinancialsClient,
    query: string,
    variables: Record<string, unknown>,
    pick: (data: unknown) => GqlPage<R>,
  ): Promise<R[]> {
    const out: R[] = []
    let after: string | undefined
    do {
      const data = await client.graphql<unknown>(query, {
        ...variables,
        after: after ?? null,
        first: UPSTREAM_PAGE_SIZE,
      })
      const page = pick(data)
      out.push(...(page.items ?? []))
      after = nextCursor(page.pageInfo, 'lookup')
    } while (after)
    return out
  }

  // ── Organization ─────────────────────────────────────────────────────────────

  async getOrganization(credentials: Credentials): Promise<Organization> {
    // Access Financials does not expose a company-info endpoint.
    // Return a stub populated from the tenant context held in credentials.
    const raw: AFOrganization = {
      id: credentials.tenantId,
      name: (credentials.extra as Record<string, unknown> | undefined)?.['companyName'] as
        string | undefined,
    }
    return transformOrganization(raw)
  }

  // ── Invoices (sales transaction enquiry, transactionType Invoice) ────────────

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const rows = await this.pageConnection<AFSalesHeader>(
      credentials,
      params,
      'sales-transactions',
      GQL_LIST_SALES_HEADERS,
      SALES_INVOICES,
      pickSalesHeaders,
    )
    return rows.map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    return transformInvoice(await this.getSalesHeader(credentials, 'invoice', id, SALES_INVOICES))
  }

  /** The sales enquiry row with `auditNo` = id, under `filter`. */
  private async getSalesHeader(
    credentials: Credentials,
    what: string,
    id: string,
    filter: Record<string, unknown>,
  ): Promise<AFSalesHeader> {
    const auditNo = intId(what, id)
    const rows = await this.readAll<AFSalesHeader>(
      new AccessFinancialsClient(credentials),
      GQL_LIST_SALES_HEADERS,
      { filter: { ...filter, auditNo: { eq: auditNo } } },
      pickSalesHeaders,
    )
    const row = rows.find((r) => r.auditNo === auditNo)
    if (!row) throw notFound(what, id)
    return row
  }

  // ── Bills (purchase transaction enquiry, transactionType Invoice) ────────────

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const rows = await this.pageConnection<AFPurchaseHeader>(
      credentials,
      params,
      'purchase-transactions',
      GQL_LIST_PURCHASE_HEADERS,
      PURCHASE_INVOICES,
      pickPurchaseHeaders,
    )
    return rows.map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const auditNo = intId('bill', id)
    const rows = await this.readAll<AFPurchaseHeader>(
      new AccessFinancialsClient(credentials),
      GQL_LIST_PURCHASE_HEADERS,
      { filter: { ...PURCHASE_INVOICES, auditNo: { eq: auditNo } } },
      pickPurchaseHeaders,
    )
    const row = rows.find((r) => r.auditNo === auditNo)
    if (!row) throw notFound('bill', id)
    return transformBill(row)
  }

  // ── Contacts (customers, then suppliers) ─────────────────────────────────────

  /**
   * Customers, then suppliers, as one stream: each ledger is walked by its
   * own cursor in pages of 100, and the suppliers start where the customers
   * end. `pageByRows` cuts the caller's page out of that stream, so a page
   * never holds more than `limit` rows.
   */
  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const first = UPSTREAM_PAGE_SIZE
    const client = new AccessFinancialsClient(credentials)
    const { items } = await pageByRows<Contact, ContactCursor>(
      cursorPagerKey(connectionScope('access-financials', credentials), 'contacts', { first }),
      params,
      async (cursor) => {
        const at = cursor ?? { ledger: 'customers', after: null }
        if (at.ledger === 'customers') {
          const data = await client.graphql<unknown>(GQL_LIST_CUSTOMERS, { after: at.after, first })
          const page = pickCustomers(data)
          const after = nextCursor(page.pageInfo, 'customers')
          return {
            items: (page.items ?? []).map(transformCustomer),
            next: after ? { ledger: 'customers', after } : { ledger: 'suppliers', after: null },
          }
        }
        const data = await client.graphql<unknown>(GQL_LIST_SUPPLIERS, { after: at.after, first })
        const page = pickSuppliers(data)
        const after = nextCursor(page.pageInfo, 'suppliers')
        return {
          items: (page.items ?? []).map(transformSupplier),
          next: after ? { ledger: 'suppliers', after } : undefined,
        }
      },
    )
    return items
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new AccessFinancialsClient(credentials)
    if (id.startsWith('cust_') && id.length > 5) {
      const code = id.slice(5)
      const data = await client.graphql<unknown>(GQL_GET_CUSTOMER, {
        filter: { customerDetails: { code: { eq: code } } },
      })
      const item = pickCustomers(data)?.items?.find((c) => c.customerDetails?.code === code)
      if (!item) throw notFound('contact', id)
      return transformCustomer(item)
    }
    if (id.startsWith('supp_') && id.length > 5) {
      const code = id.slice(5)
      const data = await client.graphql<unknown>(GQL_GET_SUPPLIER, {
        filter: { supplierDetails: { code: { eq: code } } },
      })
      const item = pickSuppliers(data)?.items?.find((s) => s.supplierDetails?.code === code)
      if (!item) throw notFound('contact', id)
      return transformSupplier(item)
    }
    throw notFound('contact', id)
  }

  // ── Accounts (nominal) ────────────────────────────────────────────────────────

  /**
   * Page `page` of the nominal accounts at the caller's `limit`.
   *
   * The API pages by cursor over pages of a fixed size. "The page size is set
   * to 100." `after` "expects a cursor which is returned after a request or
   * null if this is the initial request", and pageInfo's endCursor is "the
   * value to send into after to request the next page, null if no subsequent
   * page". Every request asks for that documented page of 100
   * (`UPSTREAM_PAGE_SIZE`), and `pageByRows` cuts exactly the caller's rows
   * out of the pages. It counts the rows each page really holds, so a page
   * of any other size still serves every row once, with `hasMore` exact.
   * That covers fewer rows, and more if `first` is ignored. Nothing depends
   * on a `first` below 100, which first-party docs never describe for master
   * records. On a sequential walk that is one request per 100 rows, at any
   * caller limit. The pager reports `hasMore` and `pagedLocally` itself.
   *
   * The next cursor is the endCursor only while `hasNextPage` is true. A
   * GraphQL.NET connection (which this schema is) can carry the last row's
   * cursor on the last page too. Following it would cost an extra, empty
   * request at the end of every walk.
   *
   * The key names the connection: the pager keeps rows, so it uses
   * `connectionScope`, never the raw token. It also names the collection and
   * the upstream page size. There are no filters. It leaves out the caller's
   * limit, which does not size the upstream page, so walks at different
   * limits share their positions.
   *
   * It used to read `params.cursor`, which the router never sets, so every
   * page was the first 100 accounts cut to `limit`. No `maxPageSize` is
   * declared, because the other list methods here still ignore `page`.
   */
  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const first = UPSTREAM_PAGE_SIZE
    const client = new AccessFinancialsClient(credentials)
    const { items } = await pageByRows<AFAccount, string>(
      cursorPagerKey(connectionScope('access-financials', credentials), 'accounts', { first }),
      params,
      async (after) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = await client.graphql<any>(GQL_LIST_ACCOUNTS, { after: after ?? null, first })
        const page: GqlPage<AFAccount> | undefined =
          data?.financials?.masterRecords?.accounts?.records
        const next = page?.pageInfo?.hasNextPage ? page.pageInfo.endCursor : null
        return { items: page?.items ?? [], next: next || undefined }
      },
    )
    return items.map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new AccessFinancialsClient(credentials)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = await client.graphql<any>(
      `query ($filter: NominalAccountFilterInput) {
        financials {
          masterRecords {
            accounts {
              records(filter: $filter) {
                items {
                  details { primaryKey accountCode accountName accountType majorHeadingCode compulsoryCosting }
                  summaryData { balance turnoverYtd currencyBalance }
                }
              }
            }
          }
        }
      }`,
      { filter: { primaryKey: { equals: Number(id) } } },
    )
    const item: AFAccount = data?.financials?.masterRecords?.accounts?.records?.items?.[0]
    return transformAccount(item)
  }

  // ── Journals (nominal transaction lines, grouped by audit number) ────────────

  /**
   * Journals built from the nominal transaction lines, which are all the API
   * lists for nominal transactions.
   *
   * The lines come sorted by audit number, 100 to a request. Each upstream
   * "page" handed to `pageByRows` holds whole journals only: every group of
   * lines but the last, whose lines may go on in the next request. The next
   * page starts after the last line served, by that line's edge cursor
   * ("A cursor for use in pagination" in the schema). When a request holds
   * one journal only and more lines follow, the fetch keeps reading until
   * that journal ends, so a journal of more than 100 lines is still whole.
   */
  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const first = UPSTREAM_PAGE_SIZE
    const client = new AccessFinancialsClient(credentials)
    const read = async (after: string | null): Promise<GqlEdgePage<AFNominalLine>> => {
      const data = await client.graphql<unknown>(GQL_LIST_NOMINAL_LINES, {
        after,
        first,
        sort: NOMINAL_SORT,
      })
      const page = pickNominalLines(data)
      return page
    }
    const { items } = await pageByRows<Journal, string>(
      cursorPagerKey(connectionScope('access-financials', credentials), 'journals', {
        first,
        sort: NOMINAL_SORT,
      }),
      params,
      async (cursor) => {
        const edges: Array<{ cursor: string; node: AFNominalLine }> = []
        let page = await read(cursor ?? null)
        edges.push(...(page.edges ?? []))
        let more = nextCursor(page.pageInfo, 'nominal lines')
        let groups = groupJournals(edges)
        // At most one journal so far and more lines to come: read on until a
        // second journal starts, so the first is known to be whole.
        while (more && groups.length < 2) {
          page = await read(more)
          edges.push(...(page.edges ?? []))
          more = nextCursor(page.pageInfo, 'nominal lines')
          groups = groupJournals(edges)
        }
        if (!more) return { items: groups.map((g) => transformJournal(g.lines)), next: undefined }
        // The last group may go on in the next request: hold it back.
        const whole = groups.slice(0, -1)
        return {
          items: whole.map((g) => transformJournal(g.lines)),
          next: whole[whole.length - 1]!.lastCursor,
        }
      },
    )
    return items
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const auditNo = intId('journal', id)
    const client = new AccessFinancialsClient(credentials)
    const lines: AFNominalLine[] = []
    let after: string | undefined
    do {
      const data = await client.graphql<unknown>(GQL_LIST_NOMINAL_LINES, {
        after: after ?? null,
        first: UPSTREAM_PAGE_SIZE,
        sort: NOMINAL_SORT,
        filter: { auditNo: { eq: auditNo } },
      })
      const page = pickNominalLines(data)
      lines.push(...(page.edges ?? []).map((e) => e.node).filter((l) => l.auditNo === auditNo))
      after = nextCursor(page.pageInfo, 'nominal lines')
    } while (after)
    if (lines.length === 0) throw notFound('journal', id)
    return transformJournal(lines)
  }

  // ── Sales Orders ──────────────────────────────────────────────────────────────

  async listSalesOrders(credentials: Credentials, params: QueryParams): Promise<SalesOrder[]> {
    const rows = await this.pageConnection<AFSalesOrderHeader>(
      credentials,
      params,
      'sales-orders',
      GQL_LIST_SALES_ORDERS,
      SALES_ORDERS,
      pickSalesOrders,
    )
    return rows.map(transformSalesOrder)
  }

  async getSalesOrder(credentials: Credentials, id: string): Promise<SalesOrder> {
    const orderNumber = intId('sales order', id)
    const rows = await this.readAll<AFSalesOrderHeader>(
      new AccessFinancialsClient(credentials),
      GQL_LIST_SALES_ORDERS,
      { filter: { ...SALES_ORDERS, orderNumber: { eq: orderNumber } } },
      pickSalesOrders,
    )
    const row = rows.find((r) => r.orderNumber === orderNumber)
    if (!row) throw notFound('sales order', id)
    return transformSalesOrder(row)
  }

  // ── Purchase Orders ───────────────────────────────────────────────────────────

  async listPurchaseOrders(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<PurchaseOrder[]> {
    const rows = await this.pageConnection<AFPurchaseOrderHeader>(
      credentials,
      params,
      'purchase-orders',
      GQL_LIST_PURCHASE_ORDERS,
      PURCHASE_ORDERS,
      pickPurchaseOrders,
    )
    return rows.map(transformPurchaseOrder)
  }

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const rows = await this.readAll<AFPurchaseOrderHeader>(
      new AccessFinancialsClient(credentials),
      GQL_LIST_PURCHASE_ORDERS,
      { filter: { ...PURCHASE_ORDERS, orderNumber: { eq: id } } },
      pickPurchaseOrders,
    )
    const row = rows.find((r) => r.orderNumber === id)
    if (!row) throw notFound('purchase order', id)
    return transformPurchaseOrder(row)
  }

  // ── Credit Memos (sales transaction enquiry, transactionType CreditNote) ─────

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const rows = await this.pageConnection<AFSalesHeader>(
      credentials,
      params,
      'sales-transactions',
      GQL_LIST_SALES_HEADERS,
      SALES_CREDIT_NOTES,
      pickSalesHeaders,
    )
    return rows.map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    return transformCreditMemo(
      await this.getSalesHeader(credentials, 'credit memo', id, SALES_CREDIT_NOTES),
    )
  }

  // ── Transactions (sales transaction enquiry, every transactionType) ──────────

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const rows = await this.pageConnection<AFSalesHeader>(
      credentials,
      params,
      'sales-transactions',
      GQL_LIST_SALES_HEADERS,
      undefined,
      pickSalesHeaders,
    )
    return rows.map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    return transformTransaction(await this.getSalesHeader(credentials, 'transaction', id, {}))
  }
}

// ── Response pickers ───────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Loose = any

/**
 * A response without the connection reads as an empty last page, as
 * `listAccounts` has always read it. A GraphQL error never gets here: the
 * client throws on `errors`.
 */
const EMPTY_PAGE = Object.freeze({
  pageInfo: Object.freeze({ hasNextPage: false, endCursor: null }),
  items: Object.freeze([]),
  edges: Object.freeze([]),
}) as unknown as GqlPage<never> & GqlEdgePage<never>

const pickSalesHeaders = (d: unknown): GqlPage<AFSalesHeader> =>
  (d as Loose)?.debtors?.transactions?.allTransactions?.header ?? EMPTY_PAGE

const pickPurchaseHeaders = (d: unknown): GqlPage<AFPurchaseHeader> =>
  (d as Loose)?.creditors?.transactions?.allTransactions?.header ?? EMPTY_PAGE

const pickCustomers = (d: unknown): GqlPage<AFCustomer> =>
  (d as Loose)?.debtors?.masterRecords?.customers?.records ?? EMPTY_PAGE

const pickSuppliers = (d: unknown): GqlPage<AFSupplier> =>
  (d as Loose)?.creditors?.masterRecords?.suppliers?.records ?? EMPTY_PAGE

const pickNominalLines = (d: unknown): GqlEdgePage<AFNominalLine> =>
  (d as Loose)?.financials?.transactions?.allTransactions?.details ?? EMPTY_PAGE

const pickSalesOrders = (d: unknown): GqlPage<AFSalesOrderHeader> =>
  (d as Loose)?.selling?.transactions?.outstandingSalesOrders?.header ?? EMPTY_PAGE

const pickPurchaseOrders = (d: unknown): GqlPage<AFPurchaseOrderHeader> =>
  (d as Loose)?.purchasing?.transactions?.outstandingPurchaseOrders?.header ?? EMPTY_PAGE

// ── Journal grouping ───────────────────────────────────────────────────────────

/**
 * Two lines of one journal: the same audit number. A line with none is a
 * journal of its own, never merged with a neighbour.
 */
function sameJournal(a: AFNominalLine, b: AFNominalLine): boolean {
  return a.auditNo != null && a.auditNo === b.auditNo
}

/** Consecutive lines of one audit number, with the cursor of each group's last line. */
function groupJournals(
  edges: ReadonlyArray<{ cursor: string; node: AFNominalLine }>,
): Array<{ lines: AFNominalLine[]; lastCursor: string }> {
  const groups: Array<{ lines: AFNominalLine[]; lastCursor: string }> = []
  for (const edge of edges) {
    const last = groups[groups.length - 1]
    if (last && sameJournal(last.lines[0]!, edge.node)) {
      last.lines.push(edge.node)
      last.lastCursor = edge.cursor
    } else {
      groups.push({ lines: [edge.node], lastCursor: edge.cursor })
    }
  }
  return groups
}
