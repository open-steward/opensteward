/**
 * RealBooks accounting adapter.
 *
 * RealBooks (realbooks.in) is an Indian cloud ERP / accounting platform for MSMEs.
 *
 * Auth model: API key — credentials are supplied as secretKey + accessKey +
 * emailid embedded in every POST request body.  The company (cid) and segment
 * (segid) identifiers are also required and are stored in `credentials.extra`.
 *
 * Supported resources (POST-based API):
 *   - Organization   — segment master details
 *   - Invoices       — inventory vouchers (transactionType = Sales)
 *   - Bills          — inventory vouchers (transactionType = Purchase)
 *   - Contacts       — ledger master records
 *   - Accounts       — ledger master records (non-party)
 *   - Journals       — account vouchers
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unverified:  creditmemo    — device-specific Sale Return APIs (saleReturnMultiple /
 *                              saleReturnNew) require deviceId/deviceOs credentials not
 *                              available in a server-side context; no server-side list
 *                              or read endpoint for sale-return vouchers is documented.
 * Unavailable: expense       — no dedicated expense endpoint; payment vouchers are
 *                              write-only (vcreate) with no server-side list/read API.
 * Unavailable: order         — no order resource; orderNo is a field within inventory
 *                              vouchers only, not a separate listable endpoint.
 * Unavailable: purchaseorder — no purchase order endpoint; purchaseOrderNumber /
 *                              purchaseOrderDate are fields within inventory vouchers only.
 * Unavailable: salesorder    — no sales order endpoint; order identifiers appear only
 *                              as a field (orderNo) within inventory vouchers.
 * Unavailable: taxrate       — no tax rate list endpoint; GST/tax rates appear only as
 *                              embedded itemTax/taxLedger arrays within vouchers.
 * Unavailable: transaction   — no account-level transaction list endpoint; account
 *                              vouchers (payments, receipts) have no list/read API.
 */

import { pageLocally, simpleApiKey } from '@opensteward/shared'
import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Invoice } from '../../schema/invoice'
import type { Bill } from '../../schema/bill'
import type { Contact } from '../../schema/contact'
import type { Account } from '../../schema/account'
import type { Journal } from '../../schema/journal'
import type { Organization } from '../../schema/organization'

import {
  getAuthUrl,
  exchangeCode as doExchangeCode,
  refreshCredentials as doRefreshCredentials,
} from './auth'
import { RealBooksClient } from './client'
import {
  REALBOOKS_INV_VOUCHER_CREATE,
  REALBOOKS_INV_VOUCHER_UPDATE,
  REALBOOKS_ACC_VOUCHER_CREATE,
  REALBOOKS_LEDGER_CREATE_UPDATE,
  REALBOOKS_LEDGER_FETCH,
  REALBOOKS_SEGMENT_DETAILS,
  REALBOOKS_DAYBOOK_BILL_DETAILS,
  DEFAULT_PAGE_SIZE,
  WHOLE_HISTORY_FROM_DATE,
  WHOLE_HISTORY_TO_DATE,
} from './constants'

import {
  transformInvoice,
  untransformInvoice,
  type RealBooksInvoice,
} from './transform/invoice'
import { transformBill, untransformBill } from './transform/bill'
import {
  transformContact,
  untransformContact,
  type RealBooksLedger,
} from './transform/contact'
import { transformAccount } from './transform/account'
import {
  transformJournal,
  untransformJournal,
  type RealBooksAccountVoucher,
} from './transform/journal'
import { transformOrganization, type RealBooksSegment } from './transform/organization'

// ── Credential form ───────────────────────────────────────────────────────────

const SIMPLE_API_KEY_FORM = simpleApiKey()

// ── Response envelope helpers ─────────────────────────────────────────────────

interface RealBooksListResponse<T> {
  data?: T[]
  list?: T[]
  result?: T[]
  [key: string]: unknown
}

function extractList<T>(res: RealBooksListResponse<T>): T[] {
  return res.data ?? res.list ?? res.result ?? []
}

// ── Report date window ────────────────────────────────────────────────────────

/** UTC−12, the last zone on Earth to reach any calendar date. */
const EARLIEST_ZONE_OFFSET_MS = -12 * 60 * 60 * 1000

/**
 * The calendar date at instant `d` in the earliest zone on Earth, as
 * DD-MM-YYYY. Every zone's date at that instant is this one or later, so a
 * voucher made after `d` is never dated before it, whichever zone the
 * business keeps its books in and whichever zone this process runs in.
 */
function earliestCalendarDate(d: Date): string {
  const t = new Date(d.getTime() + EARLIEST_ZONE_OFFSET_MS)
  const dd = String(t.getUTCDate()).padStart(2, '0')
  const mm = String(t.getUTCMonth() + 1).padStart(2, '0')
  return `${dd}-${mm}-${t.getUTCFullYear()}`
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export class RealbooksAdapter implements AccountingAdapter {
  readonly platform = 'realbooks'
  readonly version = '0.1.0'

  // Connect Link support — single API-key form
  credentialFields = SIMPLE_API_KEY_FORM.credentialFields
  exchangeCredentials = SIMPLE_API_KEY_FORM.exchangeCredentials

  getAuthUrl(_state: string): string {
    return getAuthUrl(_state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return doExchangeCode(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefreshCredentials(credentials)
  }

  // ── Report date window ──────────────────────────────────────────────────────
  //
  // A list is every voucher the report returns for this window, sliced into
  // pages, so the window has to cover the whole collection and be the same on
  // every page. It is therefore fixed rather than read from the clock: the
  // whole history, or from the caller's updatedAfter onwards. (The last 30
  // days to today hid every older voucher from an unfiltered list and from
  // sync while reporting the total as complete, and moved at midnight between
  // one page and the next, which skipped rows.)
  //
  // The report filters on voucher date ("transaction Date = voucher Date" in
  // the PDF), a calendar date in a zone the PDF does not state, so updatedAfter
  // is sent as the earliest calendar date anywhere at that instant. It is still
  // a voucher-date bound, not a modification time: the report has no
  // modified-since field, so a voucher dated before updatedAfter and edited
  // after it is not returned.

  private dateRange(params: QueryParams): { fromDate: string; toDate: string } {
    return {
      fromDate: params.updatedAfter
        ? earliestCalendarDate(params.updatedAfter)
        : WHOLE_HISTORY_FROM_DATE,
      toDate: WHOLE_HISTORY_TO_DATE,
    }
  }

  // ── Organization ────────────────────────────────────────────────────────────

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new RealBooksClient(credentials)
    // Fetch segment list — returns details for the connected segment
    const res = await client.fetch<RealBooksListResponse<RealBooksSegment>>(
      REALBOOKS_SEGMENT_DETAILS,
      {},
    )
    const segments = extractList<RealBooksSegment>(res)
    const segment = segments[0] ?? (res as unknown as RealBooksSegment)
    return transformOrganization(segment)
  }

  // ── Invoices ────────────────────────────────────────────────────────────────
  //
  // fetchBillDetails is a date-window report with no paging field: the API
  // PDF (https://www.realbooks.in/wp-content/uploads/2024/03/api_documentation.pdf,
  // "20. fetch daybook billdetails") documents only cid, segid, the keys,
  // fromDate, toDate, ledgerName, ledgerGroupName and billRefNo. Every request
  // returns the whole window, so the window is sliced here, and only the
  // page's own rows are transformed. No `limit` is sent:
  // none is documented, and one the server honoured would cut the window short
  // of the rows behind page 1.

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new RealBooksClient(credentials)
    const { fromDate, toDate } = this.dateRange(params)
    const res = await client.fetch<RealBooksListResponse<RealBooksInvoice>>(
      REALBOOKS_DAYBOOK_BILL_DETAILS,
      {
        fromDate,
        toDate,
        ledgerGroupName: 'sundry debtors',
        ledgerName: '',
        billRefNo: '',
      },
    )
    return pageLocally(extractList<RealBooksInvoice>(res), params).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new RealBooksClient(credentials)
    // RealBooks does not have a single-record fetch by id for vouchers;
    // fetch a wide range and find by id / transactionNumber
    const res = await client.fetch<RealBooksListResponse<RealBooksInvoice>>(
      REALBOOKS_DAYBOOK_BILL_DETAILS,
      {
        fromDate: WHOLE_HISTORY_FROM_DATE,
        toDate: WHOLE_HISTORY_TO_DATE,
        ledgerGroupName: 'sundry debtors',
        ledgerName: '',
        billRefNo: id,
      },
    )
    const records = extractList<RealBooksInvoice>(res)
    const found = records.find(
      (r) => String(r.id) === id || r.transactionNumber === id,
    )
    if (!found) throw new Error(`RealBooks invoice not found: ${id}`)
    return transformInvoice(found)
  }

  async createInvoice(credentials: Credentials, data: Partial<Invoice>): Promise<Invoice> {
    const client = new RealBooksClient(credentials)
    const res = await client.post<{ json_obj?: RealBooksInvoice }>(
      `${REALBOOKS_INV_VOUCHER_CREATE}/{cid}/{segid}`,
      { json_obj: untransformInvoice(data) },
    )
    return transformInvoice(res.json_obj ?? (res as unknown as RealBooksInvoice))
  }

  async updateInvoice(
    credentials: Credentials,
    _id: string,
    data: Partial<Invoice>,
  ): Promise<Invoice> {
    const client = new RealBooksClient(credentials)
    const body = untransformInvoice(data)
    const res = await client.post<{ json_obj?: RealBooksInvoice }>(
      `${REALBOOKS_INV_VOUCHER_UPDATE}/{cid}/{segid}`,
      { json_obj: body },
    )
    return transformInvoice(res.json_obj ?? (res as unknown as RealBooksInvoice))
  }

  // ── Bills ───────────────────────────────────────────────────────────────────

  // Same whole-window report as listInvoices, for the creditors' group.
  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new RealBooksClient(credentials)
    const { fromDate, toDate } = this.dateRange(params)
    const res = await client.fetch<RealBooksListResponse<RealBooksInvoice>>(
      REALBOOKS_DAYBOOK_BILL_DETAILS,
      {
        fromDate,
        toDate,
        ledgerGroupName: 'sundry creditors',
        ledgerName: '',
        billRefNo: '',
      },
    )
    return pageLocally(extractList<RealBooksInvoice>(res), params).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new RealBooksClient(credentials)
    const res = await client.fetch<RealBooksListResponse<RealBooksInvoice>>(
      REALBOOKS_DAYBOOK_BILL_DETAILS,
      {
        fromDate: WHOLE_HISTORY_FROM_DATE,
        toDate: WHOLE_HISTORY_TO_DATE,
        ledgerGroupName: 'sundry creditors',
        ledgerName: '',
        billRefNo: id,
      },
    )
    const records = extractList<RealBooksInvoice>(res)
    const found = records.find(
      (r) => String(r.id) === id || r.transactionNumber === id,
    )
    if (!found) throw new Error(`RealBooks bill not found: ${id}`)
    return transformBill(found)
  }

  async createBill(credentials: Credentials, data: Partial<Bill>): Promise<Bill> {
    const client = new RealBooksClient(credentials)
    const res = await client.post<{ json_obj?: RealBooksInvoice }>(
      `${REALBOOKS_INV_VOUCHER_CREATE}/{cid}/{segid}`,
      { json_obj: untransformBill(data) },
    )
    return transformBill(res.json_obj ?? (res as unknown as RealBooksInvoice))
  }

  async updateBill(
    credentials: Credentials,
    _id: string,
    data: Partial<Bill>,
  ): Promise<Bill> {
    const client = new RealBooksClient(credentials)
    const res = await client.post<{ json_obj?: RealBooksInvoice }>(
      `${REALBOOKS_INV_VOUCHER_UPDATE}/{cid}/{segid}`,
      { json_obj: untransformBill(data) },
    )
    return transformBill(res.json_obj ?? (res as unknown as RealBooksInvoice))
  }

  // ── Contacts (Ledger Masters) ───────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new RealBooksClient(credentials)
    // Fetch debtors and creditors in parallel
    const [debtorRes, creditorRes] = await Promise.all([
      client.fetch<RealBooksListResponse<RealBooksLedger>>(REALBOOKS_LEDGER_FETCH, {
        srchlName: 'Sundry Debtors',
        lgName: '',
        limit: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, 500),
      }),
      client.fetch<RealBooksListResponse<RealBooksLedger>>(REALBOOKS_LEDGER_FETCH, {
        srchlName: 'Sundry Creditors',
        lgName: '',
        limit: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, 500),
      }),
    ])
    const debtors = extractList<RealBooksLedger>(debtorRes).map(transformContact)
    const creditors = extractList<RealBooksLedger>(creditorRes).map(transformContact)
    return [...debtors, ...creditors]
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new RealBooksClient(credentials)
    const res = await client.fetch<RealBooksListResponse<RealBooksLedger>>(
      REALBOOKS_LEDGER_FETCH,
      { lid: Number(id) || 0, lgName: id, srchlName: '' },
    )
    const records = extractList<RealBooksLedger>(res)
    const found =
      records.find((r) => String(r.id) === id) ??
      records.find((r) => r.ledgerName === id) ??
      records[0]
    if (!found) throw new Error(`RealBooks contact not found: ${id}`)
    return transformContact(found)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const client = new RealBooksClient(credentials)
    const res = await client.post<{ ledger?: RealBooksLedger }>(
      `${REALBOOKS_LEDGER_CREATE_UPDATE}/{cid}/{segid}`,
      { ledger: untransformContact(data) },
    )
    return transformContact(res.ledger ?? (res as unknown as RealBooksLedger))
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const client = new RealBooksClient(credentials)
    const body = untransformContact(data)
    ;(body as Record<string, unknown>)['id'] = Number(id) || 0
    const res = await client.post<{ ledger?: RealBooksLedger }>(
      `${REALBOOKS_LEDGER_CREATE_UPDATE}/{cid}/{segid}`,
      { ledger: body },
    )
    return transformContact(res.ledger ?? (res as unknown as RealBooksLedger))
  }

  // ── Accounts (Ledger Masters — non-party) ───────────────────────────────────

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new RealBooksClient(credentials)
    const res = await client.fetch<RealBooksListResponse<RealBooksLedger>>(
      REALBOOKS_LEDGER_FETCH,
      {
        lgName: '',
        srchlName: '',
        limit: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, 500),
      },
    )
    return extractList<RealBooksLedger>(res)
      .filter((l) => l.ledgerGroupName && !['Sundry Debtors', 'Sundry Creditors'].includes(l.ledgerGroupName ?? ''))
      .map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new RealBooksClient(credentials)
    const res = await client.fetch<RealBooksListResponse<RealBooksLedger>>(
      REALBOOKS_LEDGER_FETCH,
      { lid: Number(id) || 0, lgName: id, srchlName: '' },
    )
    const records = extractList<RealBooksLedger>(res)
    const found =
      records.find((r) => String(r.id) === id) ??
      records.find((r) => r.ledgerName === id) ??
      records[0]
    if (!found) throw new Error(`RealBooks account not found: ${id}`)
    return transformAccount(found)
  }

  // ── Journals (Account Vouchers) ─────────────────────────────────────────────
  //
  // NOTE: The RealBooks public API does NOT expose a read/list endpoint for
  // account voucher transactions.  `listJournals` and `getJournal` are
  // intentionally absent so the router returns 501 for those operations.
  // Only `createJournal` is supported (POST /AMSSERVICE/api/accv/v2/vcreate).

  async createJournal(credentials: Credentials, data: Partial<Journal>): Promise<Journal> {
    const client = new RealBooksClient(credentials)
    const res = await client.post<{ json_obj?: RealBooksAccountVoucher }>(
      `${REALBOOKS_ACC_VOUCHER_CREATE}/{cid}/{segid}`,
      { json_obj: untransformJournal(data) },
    )
    return transformJournal(res.json_obj ?? (res as unknown as RealBooksAccountVoucher))
  }
}
