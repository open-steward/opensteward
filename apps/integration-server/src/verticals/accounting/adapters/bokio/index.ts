/**
 * Bokio Company API adapter.
 *
 * Every path, parameter and field below comes from the Company API reference
 * at https://docs.bokio.se (index: https://docs.bokio.se/llms.txt; each page
 * is Markdown with the OpenAPI document embedded, fetched as
 * https://docs.bokio.se/reference/<page>.md). Base URL
 * https://api.bokio.se/v1, every path under /companies/{companyId}. The scope
 * each call needs is the "**Scope:**" line of its page.
 *
 *  - Organization  GET company-information            get-company-information-with-id  company-information:read
 *                  GET fiscal-years                   get-fiscal-years                 fiscal-years:read
 *  - Invoices      GET invoices, invoices/{id}        get-invoice, get-invoices-invoiceid  invoices:read
 *  - Contacts      GET customers, customers/{id}      get-customer, get-customers-customerid  customers:read
 *                  PUT, DELETE customers/{id}         put-customer, delete-customer    customers:write
 *                  GET suppliers, suppliers/{id}      get-suppliers, get-supplier-by-id  suppliers:read
 *                  POST suppliers, PUT/DELETE …/{id}  post-, put-, delete-supplier     suppliers:write
 *  - Journals      GET journal-entries, …/{id}        get-journalentry, get-journalentries-journalid  journal-entries:read
 *                  POST journal-entries               post-journalentry                journal-entries:write
 *  - Credit memos  GET credit-notes, credit-notes/{id} list-credit-notes-v1, get-credit-note-v1  credit-notes:read
 *                  POST invoices/{id}/credit          post-invoices-invoiceid-credit   invoices:write
 *  - Accounts      GET chart-of-accounts, …/{account} get-chart-of-accounts, get-account-with-number  chart-of-accounts:read
 *  - Bills         GET supplier-invoices, …/{id}      get-supplier-invoices, get-supplier-invoice-by-id  supplier-invoices:read
 *                  POST, PUT, DELETE                  post-, put-, delete-supplier-invoice  supplier-invoices:write
 *                  (supplier invoices and suppliers are [Preview] APIs)
 *
 * Bill attachments link to GET uploads/{id}/download (download-upload,
 * `uploads:read`) without calling it; see transform/bill.ts.
 *
 * ── Paging ─────────────────────────────────────────────────────────
 * Invoices, customers, suppliers, journal entries, credit notes, supplier
 * invoices and fiscal years take `page` (default 1) and `pageSize` (default
 * 25, "maximum": 100) and answer the envelope `pagedResponse` + `items`:
 * { totalItems, totalPages, currentPage, items } (e.g. the 200 schema on
 * get-invoice.md and get-suppliers.md; https://docs.bokio.se/reference/pagination.md
 * states the same maximum). `capabilities.maxPageSize` declares that 100, so
 * the router and sync worker ask for at most 100 and judge short pages
 * against it; the totals are reported as the platform sent them.
 *
 * Contacts are two collections, customers then suppliers, streamed as one
 * list through the shared `pageByRows`: each upstream page is asked for at
 * the caller's size (clamped to 100), the customers are walked to their
 * `totalPages`, then the suppliers to theirs, and the caller's page is cut
 * from that stream with `hasMore` exact. See listContacts.
 *
 * GET chart-of-accounts takes no paging parameters and answers a plain array
 * of the whole chart, so listAccounts pages it locally (`pageLocally`).
 *
 * ── updated_after ──────────────────────────────────────────────────
 * Not forwarded, and exempt from refusing: every one of these lists is an
 * ordinary paged collection that Bokio serves whole without a date window, so
 * a call with `updatedAfter` is served the unfiltered list, a superset of the
 * changed rows and never a gap. The `query` filter of invoices, journal
 * entries, credit notes, suppliers and the chart of accounts lists no
 * modification timestamp (invoices: type, customerRef.id,
 * customerRef.customerNumber, orderNumberReference, projectReference,
 * buyerReference, contractReference, currency, totalAmount, status,
 * invoiceDate, dueDate, metadata; supplier invoices: supplierRef.id,
 * invoiceNumber, totalAmount, currency, invoiceDate, dueDate; suppliers:
 * name, vatNumber, orgNumber), and a supplier invoice or supplier carries no
 * timestamp at all. Customers do list `modifiedDateTime`, but get-customer.md
 * says it "Returns null for customers that were changed before this field was
 * introduced", so a `modifiedDateTime>=` filter would drop rows changed
 * before an unknown date and is not sent either.
 *
 * ── Refused (501 NOT_SUPPORTED, before any request) ─────────────────
 * createInvoice / updateInvoice: every `salesItem` line requires
 * `productType` ("goods" | "services") and `taxRate`, which no canonical
 * Lineitem field carries, and PUT "will update all fields of the invoice"
 * (put-invoice.md). createContact for a customer: `type` ("company" |
 * "private") is required (post-customer.md) and has no canonical source; a
 * supplier (isSupplier true, isCustomer not true) is created.
 */
import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Invoice } from '../../schema/invoice'
import type { Contact } from '../../schema/contact'
import type { Account } from '../../schema/account'
import type { Journal } from '../../schema/journal'
import type { Organization } from '../../schema/organization'
import type { CreditMemo } from '../../schema/creditmemo'
import type { Bill } from '../../schema/bill'

import {
  connectionScope,
  cursorPagerKey,
  pageByRows,
  pageLocally,
  reportUpstreamPage,
} from '@opensteward/shared'
import { buildAuthUrl, exchangeCode, refreshAccessToken } from './auth'
import { BokioClient } from './client'
import { BOKIO_DEFAULT_SCOPES, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, type BokioInvoice } from './transform/invoice'
import { transformContact, type BokioCustomer } from './transform/contact'
import { transformSupplier, untransformSupplier, type BokioSupplier } from './transform/supplier'
import { transformAccount, type BokioAccount } from './transform/account'
import { transformJournal, untransformJournal, type BokioJournal } from './transform/journal'
import {
  transformOrganization,
  type BokioCompanyInfo,
  type BokioFiscalYear,
} from './transform/organization'
import { transformCreditMemo, type BokioCreditNote } from './transform/creditmemo'
import { transformBill, untransformBill, type BokioSupplierInvoice } from './transform/bill'

interface BokioAdapterConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
  scopes?: string[]
}

/** `pagedResponse` + `items`, the 200 body of every paged list. */
interface BokioPage<T> {
  totalItems?: number
  totalPages?: number
  currentPage?: number
  items?: T[]
  /** The row key of the general Pagination page's example; see `pageRows`. */
  result?: T[]
}

/**
 * The rows of a paged body. Every endpoint's own 200 schema names them
 * `items` (get-invoice.md, get-customer.md, get-journalentry.md,
 * list-credit-notes-v1.md, get-supplier-invoices.md, get-suppliers.md,
 * get-fiscal-years.md), and that key is read first. The general
 * Pagination page (https://docs.bokio.se/reference/pagination.md) shows the
 * same envelope with the rows under `result` instead; both are documented,
 * so a body carrying `result` is read rather than failed. A body with neither
 * array is not the envelope.
 */
function pageRows<T>(res: BokioPage<T>): T[] | undefined {
  if (Array.isArray(res.items)) return res.items
  if (Array.isArray(res.result)) return res.result
  return undefined
}

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

function badGateway(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 502, code: 'UPSTREAM_ERROR' })
}

function validationError(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 400, code: 'VALIDATION_ERROR' })
}

/** Bokio's documented 404 ("not-found") on a GET by id (get-customers-customerid.md, get-supplier-by-id.md). */
function isNotFound(err: unknown): boolean {
  return (err as { response?: { status?: number } })?.response?.status === 404
}

/**
 * Bokio's 403 on a request the token has no scope for. A connection made
 * before 2026-09-29 was not granted `suppliers:read` or `fiscal-years:read`;
 * those two reads degrade on it instead of failing (README, "Reconnect after
 * upgrading").
 */
function isForbidden(err: unknown): boolean {
  return (err as { response?: { status?: number } })?.response?.status === 403
}

/** Logged once per call that absorbed a 403: the connection should reconnect. */
function warnMissingScope(scope: string, what: string): void {
  console.warn(
    `[bokio] 403 on ${what}: the connection was not granted ${scope}. ` +
      `Serving without it; reconnect the connection to grant ${scope}.`,
  )
}

function isCount(n: unknown): n is number {
  return typeof n === 'number' && Number.isInteger(n) && n >= 0
}

/** 1-based page; a missing, zero, negative or non-numeric page is the first. */
function pageNumber(params: QueryParams): number {
  const page = params.page
  return typeof page === 'number' && Number.isFinite(page) && page >= 1 ? Math.floor(page) : 1
}

/** The caller's limit, clamped to the documented maximum of 100. */
function pageSize(params: QueryParams): number {
  const limit = params.limit
  const size =
    typeof limit === 'number' && Number.isFinite(limit) && limit >= 1
      ? Math.floor(limit)
      : DEFAULT_PAGE_SIZE
  return Math.min(size, MAX_PAGE_SIZE)
}

/** One upstream page of a paged list, with the envelope required. */
async function fetchPage<T>(
  client: BokioClient,
  path: string,
  page: number,
  size: number,
): Promise<{ rows: T[]; res: BokioPage<T> }> {
  const res = await client.get<BokioPage<T> | undefined>(path, { page, pageSize: size })
  const rows = res && typeof res === 'object' ? pageRows(res) : undefined
  if (!res || !rows) {
    throw badGateway(
      `Bokio GET ${path} did not return the documented paged envelope ` +
        '({ totalItems, totalPages, currentPage, items[] })',
    )
  }
  return { rows, res }
}

/**
 * Where the contacts stream stands: which of the two collections, and which
 * of its 1-based pages. Customers come first, suppliers after.
 */
interface ContactCursor {
  list: 'customers' | 'suppliers'
  page: number
}

/**
 * GET customers/{id}, and on Bokio's documented 404 GET suppliers/{id}.
 * Both ids are uuids (`format: uuid` on get-customers-customerid.md and
 * get-supplier-by-id.md), so an id names at most one of the two.
 *
 * A connection without `suppliers:read` gets a 403 on the supplier GET. The
 * id is then not found among the customers, as before suppliers were read:
 * the customer 404 is rethrown, with a warning to reconnect.
 */
async function findContact(
  client: BokioClient,
  id: string,
): Promise<{ kind: 'customer'; raw: BokioCustomer } | { kind: 'supplier'; raw: BokioSupplier }> {
  let customerNotFound: unknown
  try {
    const raw = await client.get<BokioCustomer>(`customers/${encodeURIComponent(id)}`)
    return { kind: 'customer', raw }
  } catch (err) {
    if (!isNotFound(err)) throw err
    customerNotFound = err
  }
  try {
    const raw = await client.get<BokioSupplier>(`suppliers/${encodeURIComponent(id)}`)
    return { kind: 'supplier', raw }
  } catch (err) {
    if (!isForbidden(err)) throw err
    warnMissingScope('suppliers:read', `GET suppliers/${encodeURIComponent(id)}`)
    throw customerNotFound
  }
}

/** Guards a fiscal-years walk against a `totalPages` that never ends. */
const MAX_FISCAL_YEAR_PAGES = 20

/**
 * Every fiscal year, or undefined when the connection lacks
 * `fiscal-years:read` (Bokio's 403): the organization is then served without
 * its optional `fiscalYearEndMonth`, with a warning. Any other error fails.
 */
async function fiscalYearsIfGranted(client: BokioClient): Promise<BokioFiscalYear[] | undefined> {
  try {
    return await allFiscalYears(client)
  } catch (err) {
    if (!isForbidden(err)) throw err
    warnMissingScope('fiscal-years:read', 'GET fiscal-years')
    return undefined
  }
}

async function allFiscalYears(client: BokioClient): Promise<BokioFiscalYear[]> {
  const out: BokioFiscalYear[] = []
  for (let page = 1; page <= MAX_FISCAL_YEAR_PAGES; page++) {
    const { rows, res } = await fetchPage<BokioFiscalYear>(
      client,
      'fiscal-years',
      page,
      MAX_PAGE_SIZE,
    )
    out.push(...rows)
    if (!isCount(res.totalPages) || page >= res.totalPages) return out
  }
  throw badGateway(
    `Bokio GET fiscal-years reported more than ${MAX_FISCAL_YEAR_PAGES} pages of ${MAX_PAGE_SIZE}`,
  )
}

export class BokioAdapter implements AccountingAdapter {
  readonly platform = 'bokio'
  readonly version = '0.3.0'
  /** `pageSize` "maximum": 100 on every paged list. */
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private scopes: string[]

  constructor(config: BokioAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.scopes = config.scopes?.length ? config.scopes : BOKIO_DEFAULT_SCOPES
  }

  getAuthUrl(state: string, overrideScopes?: string[]): string {
    const scopes = overrideScopes?.length ? overrideScopes : this.scopes
    return buildAuthUrl(this.clientId, this.redirectUri, scopes, state)
  }

  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return exchangeCode(code, this.clientId, this.clientSecret, redirectUri)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    if (!credentials.refreshToken) throw new Error('No refresh token available')
    return refreshAccessToken(credentials.refreshToken, this.clientId, this.clientSecret)
  }

  /**
   * One page of a paged list: sends `page` and `pageSize`, requires the
   * documented envelope, and reports its totals. `hasMore` is the platform's
   * own `totalPages` compared with the page asked for, never a guess from the
   * row count.
   */
  private async listPage<T>(
    credentials: Credentials,
    path: string,
    params: QueryParams,
  ): Promise<T[]> {
    const page = pageNumber(params)
    const size = pageSize(params)
    const { rows, res } = await fetchPage<T>(new BokioClient(credentials), path, page, size)
    reportUpstreamPage(params, {
      ...(isCount(res.totalItems) && { totalCount: res.totalItems }),
      ...(isCount(res.totalPages) && {
        totalPages: res.totalPages,
        hasMore: page < res.totalPages,
      }),
      ...(isCount(res.currentPage) && { currentPage: res.currentPage }),
      pageSize: size,
    })
    return rows
  }

  // --- Organization ---

  /**
   * Company information, plus every fiscal year for `fiscalYearEndMonth`.
   * A connection without `fiscal-years:read` gets Bokio's 403 on the fiscal
   * years; `fiscalYearEndMonth` is optional, so the organization is served
   * without it and a warning asks for a reconnect. Any other error fails.
   */
  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new BokioClient(credentials)
    const [info, years] = await Promise.all([
      client.get<BokioCompanyInfo>('company-information'),
      fiscalYearsIfGranted(client),
    ])
    return transformOrganization(info, years)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const rows = await this.listPage<BokioInvoice>(credentials, 'invoices', params)
    return rows.map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new BokioClient(credentials)
    const res = await client.get<BokioInvoice>(`invoices/${encodeURIComponent(id)}`)
    return transformInvoice(res)
  }

  async createInvoice(_credentials: Credentials, _data: Partial<Invoice>): Promise<Invoice> {
    throw notSupported(
      'Bokio invoices cannot be created from a canonical invoice: every salesItem line ' +
        'requires productType ("goods" | "services") and taxRate, which the canonical ' +
        'line item does not carry (https://docs.bokio.se/reference/post-invoice.md).',
    )
  }

  async updateInvoice(
    _credentials: Credentials,
    _id: string,
    _data: Partial<Invoice>,
  ): Promise<Invoice> {
    throw notSupported(
      'Bokio invoices cannot be updated from a canonical invoice: PUT replaces every field ' +
        'of the draft, and its salesItem lines require productType and taxRate, which the ' +
        'canonical line item does not carry (https://docs.bokio.se/reference/put-invoice.md).',
    )
  }

  // --- Contacts (customers, then suppliers) ---

  /**
   * Customers, then suppliers, as one stream.
   *
   * GET customers and GET suppliers each take `page` and `pageSize` and answer
   * the paged envelope. The stream asks each at the caller's size (clamped to
   * 100), walks the customers page by page until `currentPage` reaches their
   * `totalPages`, then the suppliers the same way, and `pageByRows` cuts
   * exactly the caller's rows out of it, reporting `hasMore` exactly (a page
   * that ends on the last customer peeks at the first supplier page). Caller
   * page N is rows [(N-1)×limit, N×limit) of that stream, so a customer total
   * that is not a multiple of the limit puts customers and suppliers on one
   * page. `totalPages` is required to know where a collection ends: a page
   * without it is not the documented envelope and fails with a 502.
   *
   * A connection made before suppliers were read lacks `suppliers:read`: its
   * first supplier page gets Bokio's 403, and the supplier collection is then
   * treated as empty, with one warning to reconnect (a 403 on a later
   * supplier page still fails: rows were already served, so it is not a
   * missing scope). The list is the
   * customers alone, with `hasMore` from the customer pages, as before
   * suppliers were read. Any other supplier error fails the list.
   */
  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new BokioClient(credentials)
    const size = pageSize(params)
    const key = cursorPagerKey(
      connectionScope(`bokio:${client.companyId}`, credentials),
      'customers+suppliers',
      { pageSize: size },
    )
    const { items } = await pageByRows<Contact, ContactCursor>(
      key,
      params,
      async (at) => {
        const cursor = at ?? { list: 'customers', page: 1 }
        let fetched: { rows: Array<BokioCustomer | BokioSupplier>; res: BokioPage<unknown> }
        try {
          fetched = await fetchPage<BokioCustomer | BokioSupplier>(
            client,
            cursor.list,
            cursor.page,
            size,
          )
        } catch (err) {
          // Only the first supplier page: a 403 after supplier rows were
          // served is not a missing scope, and ending the list there would
          // report a truncated collection as complete.
          if (cursor.list !== 'suppliers' || cursor.page !== 1 || !isForbidden(err)) throw err
          warnMissingScope('suppliers:read', 'GET suppliers')
          return { items: [], next: undefined }
        }
        const { rows, res } = fetched
        if (!isCount(res.totalPages)) {
          throw badGateway(
            `Bokio GET ${cursor.list} returned no totalPages, so the end of the collection is unknown`,
          )
        }
        const more = cursor.page < res.totalPages
        if (cursor.list === 'customers') {
          return {
            items: (rows as BokioCustomer[]).map(transformContact),
            next: more
              ? { list: 'customers', page: cursor.page + 1 }
              : { list: 'suppliers', page: 1 },
          }
        }
        return {
          items: (rows as BokioSupplier[]).map(transformSupplier),
          next: more ? { list: 'suppliers', page: cursor.page + 1 } : undefined,
        }
      },
      { defaultLimit: DEFAULT_PAGE_SIZE },
    )
    return items
  }

  /** A customer, else a supplier: see findContact. */
  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new BokioClient(credentials)
    const found = await findContact(client, id)
    return found.kind === 'customer' ? transformContact(found.raw) : transformSupplier(found.raw)
  }

  /**
   * A supplier (isSupplier true, isCustomer not true) is POSTed to suppliers
   * (post-supplier.md: only `name` is required). A customer cannot be
   * created: `type` ("company" | "private") is required (post-customer.md)
   * and has no canonical source.
   */
  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    if (data.isSupplier !== true || data.isCustomer === true) {
      throw notSupported(
        'Bokio customers cannot be created from a canonical contact: the required `type` ' +
          '("company" | "private") has no canonical source ' +
          '(https://docs.bokio.se/reference/post-customer.md). A supplier can: send ' +
          'isSupplier: true without isCustomer.',
      )
    }
    const body = untransformSupplier(data)
    const client = new BokioClient(credentials)
    const res = await client.post<BokioSupplier>('suppliers', body)
    return transformSupplier(res)
  }

  /**
   * PUT customers/{id} and PUT suppliers/{id} each take the whole record, so
   * the current one is read first (customer, else supplier on a 404) and the
   * canonical fields that have a documented Bokio counterpart are laid over
   * it. Customer: name, identification → orgNumber, taxNumber → vatNumber,
   * billingAddress → address. Supplier: the same plus currency (see
   * untransformSupplier). Contact details carry their own ids and a default
   * flag, and a supplier has none, so emails and telephones are not written,
   * and a request that sets them is refused before any call. A request whose
   * isCustomer/isSupplier contradicts the record found is refused: Bokio
   * cannot turn one into the other.
   */
  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    if (data.emails !== undefined || data.telephones !== undefined) {
      throw validationError(
        'Bokio contact emails and telephones live in contactsDetails and are not writable ' +
          'through this adapter; omit emails and telephones.',
      )
    }
    const client = new BokioClient(credentials)
    const found = await findContact(client, id)
    const isSupplier = found.kind === 'supplier'
    if (
      (data.isSupplier !== undefined && data.isSupplier !== isSupplier) ||
      (data.isCustomer !== undefined && data.isCustomer === isSupplier)
    ) {
      throw validationError(
        `Bokio contact ${id} is a ${found.kind}; a Bokio customer and supplier are separate ` +
          'records and one cannot be turned into the other.',
      )
    }
    if (found.kind === 'supplier') {
      const body = untransformSupplier(data, found.raw)
      const res = await client.put<BokioSupplier>(`suppliers/${encodeURIComponent(id)}`, body)
      return transformSupplier(res)
    }
    const current = found.raw
    const addr = data.billingAddress
    // `address` is addressWithCountrySubdivision, which requires line1, city,
    // postalCode and country (put-customer.md). A canonical address that
    // names only some fields is laid over the current one field by field, so
    // a change of city alone does not blank the required street and country.
    // The two nullable fields may be cleared with an explicit null.
    const cur = current.address ?? undefined
    const body: BokioCustomer = {
      ...current,
      ...(data.name !== undefined && { name: data.name }),
      ...(data.identification != null && { orgNumber: data.identification }),
      ...(data.taxNumber != null && { vatNumber: data.taxNumber }),
      ...(addr && {
        address: {
          line1: addr.address1 ?? cur?.line1,
          line2: addr.address2 === undefined ? (cur?.line2 ?? null) : addr.address2,
          city: addr.city ?? cur?.city,
          postalCode: addr.postalCode ?? cur?.postalCode,
          country: addr.country ?? cur?.country,
          countrySubdivision:
            addr.region === undefined ? (cur?.countrySubdivision ?? null) : addr.region,
        },
      }),
    }
    const res = await client.put<BokioCustomer>(`customers/${encodeURIComponent(id)}`, body)
    return transformContact(res)
  }

  /**
   * DELETE customers/{id} or DELETE suppliers/{id}, whichever the id names.
   * delete-customer.md documents only its 204, not what a missing id
   * answers, so the kind is found first through the GETs, whose 404 is
   * documented (findContact), rather than inferred from a DELETE failing.
   */
  async deleteContact(credentials: Credentials, id: string): Promise<void> {
    const client = new BokioClient(credentials)
    const found = await findContact(client, id)
    const list = found.kind === 'customer' ? 'customers' : 'suppliers'
    await client.delete(`${list}/${encodeURIComponent(id)}`)
  }

  // --- Accounts ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new BokioClient(credentials)
    const res = await client.get<BokioAccount[] | undefined>('chart-of-accounts')
    if (!Array.isArray(res)) {
      throw badGateway('Bokio GET chart-of-accounts did not return the documented array')
    }
    // `account` (int32) is the only identifier an account has. A row without
    // one would be stored with no id, the NOT NULL resource_id failure of the
    // 2026-09-29 sync, so it fails the list instead.
    if (res.some((row) => !Number.isInteger(row?.account))) {
      throw badGateway(
        'Bokio GET chart-of-accounts returned an account without the documented integer `account`',
      )
    }
    return pageLocally(res.map(transformAccount), params)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new BokioClient(credentials)
    const res = await client.get<BokioAccount>(`chart-of-accounts/${encodeURIComponent(id)}`)
    return transformAccount(res)
  }

  // --- Journals ---

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const rows = await this.listPage<BokioJournal>(credentials, 'journal-entries', params)
    return rows.map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new BokioClient(credentials)
    const res = await client.get<BokioJournal>(`journal-entries/${encodeURIComponent(id)}`)
    return transformJournal(res)
  }

  async createJournal(credentials: Credentials, data: Partial<Journal>): Promise<Journal> {
    const body = untransformJournal(data)
    const client = new BokioClient(credentials)
    const res = await client.post<BokioJournal>('journal-entries', body)
    return transformJournal(res)
  }

  // --- Credit Memos ---

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const rows = await this.listPage<BokioCreditNote>(credentials, 'credit-notes', params)
    return rows.map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new BokioClient(credentials)
    const res = await client.get<BokioCreditNote>(`credit-notes/${encodeURIComponent(id)}`)
    return transformCreditMemo(res)
  }

  /**
   * POST invoices/{invoiceId}/credit (post-invoices-invoiceid-credit.md,
   * scope `invoices:write`, not `credit-notes:write`) takes no body: it
   * "Creates a draft credit note for the specified invoice", crediting the
   * whole invoice. The one input is the invoice, `appliedTo[0].invoiceId`.
   *
   * A partial credit is "PUT /credit-notes/{id}" (update-credit-note-v1.md),
   * whose salesItem lines require productType and taxRate like an invoice's,
   * which no canonical line carries. So a request that names lines, amounts,
   * dates, a number or anything else the draft would not take from it is
   * refused before any call instead of being silently dropped.
   */
  async createCreditMemo(credentials: Credentials, data: Partial<CreditMemo>): Promise<CreditMemo> {
    const applied = data.appliedTo ?? []
    const invoiceId = applied[0]?.invoiceId
    if (applied.length !== 1 || !invoiceId || applied[0]?.amount != null) {
      throw validationError(
        'A Bokio credit note credits one whole invoice: send appliedTo with exactly one ' +
          'entry carrying its invoiceId and no amount ' +
          '(https://docs.bokio.se/reference/post-invoices-invoiceid-credit.md).',
      )
    }
    const extra = Object.entries(data)
      .filter(
        ([k, v]) => v !== undefined && k !== 'appliedTo' && !(k === 'status' && v === 'DRAFT'),
      )
      .map(([k]) => k)
    if (extra.length) {
      throw validationError(
        `Bokio creates the credit note from the invoice alone and takes no ${extra.join(', ')}; ` +
          'a partial credit needs PUT credit-notes/{id}, whose lines require productType and ' +
          'taxRate, which the canonical line item does not carry ' +
          '(https://docs.bokio.se/reference/update-credit-note-v1.md).',
      )
    }
    const client = new BokioClient(credentials)
    const res = await client.post<BokioCreditNote>(
      `invoices/${encodeURIComponent(invoiceId)}/credit`,
      undefined,
    )
    return transformCreditMemo(res)
  }

  // --- Bills (supplier invoices, [Preview]) ---

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const companyId = credentials.tenantId ?? undefined
    const rows = await this.listPage<BokioSupplierInvoice>(credentials, 'supplier-invoices', params)
    return rows.map((row) => transformBill(row, companyId))
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new BokioClient(credentials)
    const res = await client.get<BokioSupplierInvoice>(
      `supplier-invoices/${encodeURIComponent(id)}`,
    )
    return transformBill(res, client.companyId || undefined)
  }

  /**
   * POST supplier-invoices (post-supplier-invoice.md). A supplier invoice
   * takes no currency: it is in its supplier's (`currency`, "Defaults to SEK
   * if not provided", get-supplier-by-id.md). So the supplier is read first
   * and the amounts are scaled from minor units in its currency; a canonical
   * `currency` that disagrees with it is refused rather than posted at the
   * wrong scale.
   */
  async createBill(credentials: Credentials, data: Partial<Bill>): Promise<Bill> {
    if (!data.contactId) {
      throw validationError(
        'A Bokio supplier invoice requires contactId, the supplier id (supplierRef.id) ' +
          '(https://docs.bokio.se/reference/post-supplier-invoice.md).',
      )
    }
    const client = new BokioClient(credentials)
    const supplier = await client.get<BokioSupplier>(
      `suppliers/${encodeURIComponent(data.contactId)}`,
    )
    const currency = supplier.currency || 'SEK'
    assertCurrency(data.currency, currency, 'its supplier')
    const body = untransformBill(data, currency)
    const res = await client.post<BokioSupplierInvoice>('supplier-invoices', body)
    return transformBill(res, client.companyId || undefined)
  }

  /**
   * PUT supplier-invoices/{id} (put-supplier-invoice.md) requires the whole
   * record, and removes line items left out of `lineItems`, so the current
   * supplier invoice is read first and the canonical fields are laid over it
   * (see untransformBill). Amounts are scaled in its `currency`.
   */
  async updateBill(credentials: Credentials, id: string, data: Partial<Bill>): Promise<Bill> {
    const client = new BokioClient(credentials)
    const path = `supplier-invoices/${encodeURIComponent(id)}`
    const current = await client.get<BokioSupplierInvoice>(path)
    const currency = current.currency || 'SEK'
    assertCurrency(data.currency, currency, 'the supplier invoice')
    // A supplier sets the currency of its supplier invoices (`currency` on
    // get-supplier-by-id.md: it "determines the currency used when creating
    // supplier invoices"). Moving the invoice to a supplier in another
    // currency would send the amounts, scaled in this one, under that one.
    if (data.contactId && data.contactId !== current.supplierRef?.id) {
      const next = await client.get<BokioSupplier>(
        `suppliers/${encodeURIComponent(data.contactId)}`,
      )
      assertCurrency(next.currency || 'SEK', currency, 'the supplier invoice')
    }
    const body = untransformBill(data, currency, current)
    const res = await client.put<BokioSupplierInvoice>(path, body)
    return transformBill(res, client.companyId || undefined)
  }

  /** DELETE supplier-invoices/{id} (delete-supplier-invoice.md). */
  async deleteBill(credentials: Credentials, id: string): Promise<void> {
    const client = new BokioClient(credentials)
    await client.delete(`supplier-invoices/${encodeURIComponent(id)}`)
  }
}

function assertCurrency(asked: string | undefined, actual: string, of: string): void {
  if (asked && asked.toUpperCase() !== actual.toUpperCase()) {
    throw validationError(
      `The bill currency ${asked} differs from ${of}'s ${actual}; Bokio takes a supplier ` +
        "invoice in its supplier's currency and has no currency field to change it.",
    )
  }
}
