/**
 * VosFactures accounting adapter.
 *
 * Auth model: static API token passed as `api_token` query-string parameter.
 * The tenant subdomain is stored in `credentials.extra.accountName`.
 *
 * Supported resources:
 *   - Organization  (GET /departments — first department = main seller entity)
 *   - Invoices      (GET/POST/PUT /invoices, income=1 = AR)
 *   - Bills         (GET/POST/PUT /invoices, income=0 = AP / expense docs)
 *   - Contacts      (GET/POST/PUT /clients)
 *   - CreditMemos   (GET /invoices, kind=correction&income=1 — sales credit notes)
 *   - Orders        (GET /invoices, kind=client_order — customer orders)
 *   - SalesOrders   (GET /invoices, kind=client_order — same source as Order)
 *   - Transactions  (GET /banking/payments — settlement records)
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: account      — no chart-of-accounts API; /account.json only creates new tenants
 * Unavailable: expense      — no employee expense / claim endpoint; supplier costs use income=0 invoices (Bill)
 * Unavailable: journal      — no general-ledger journal entry endpoint; documents carry accounting_status flag only
 * Unavailable: purchaseorder — no dedicated purchase-order document kind; supplier invoices use income=0 (Bill)
 * Unavailable: taxrate      — no standalone tax-rate endpoint; rates are embedded strings in invoice positions
 *
 * Docs: https://github.com/vosfactures/API
 */
import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Invoice } from '../../schema/invoice'
import type { Bill } from '../../schema/bill'
import type { Contact } from '../../schema/contact'
import type { Organization } from '../../schema/organization'
import type { CreditMemo } from '../../schema/creditmemo'
import type { Order } from '../../schema/order'
import type { SalesOrder } from '../../schema/salesorder'
import type { Transaction } from '../../schema/transaction'

import {
  VOSFACTURES_CREDENTIAL_FORM,
  buildAuthUrl,
  exchangeCode as doExchangeCode,
  refreshCredentials as doRefreshCredentials,
} from './auth'
import { VosfacturesClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, untransformInvoice, type VosFacturesInvoice } from './transform/invoice'
import { transformBill } from './transform/bill'
import { transformContact, type VosFacturesClient as VFClient } from './transform/contact'
import { transformOrganization, type VosFacturesDepartment } from './transform/organization'
import { isRevenueCorrection, transformCreditMemo } from './transform/creditmemo'
import { transformOrder } from './transform/order'
import { transformSalesOrder } from './transform/salesorder'
import { transformTransaction, type VosFacturesPayment } from './transform/transaction'

// ── Billing-document helpers ──────────────────────────────────────────────

function badGateway(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 502, code: 'UPSTREAM_ERROR' })
}

function notFound(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 404, code: 'NOT_FOUND' })
}

/**
 * Query for one page of `GET /invoices.json` ("Paramètres additionnels des
 * téléchargements (filtres)", https://github.com/vosfactures/API#list_params).
 *
 *   - `page`: 1-based ("Par défaut, il prend la valeur `1`").
 *   - `per_page`: the caller's limit, "valeur maximale 100".
 *   - `period=all`: the documented default is `last_12_months`, so without it
 *     every list silently stopped at documents from the last twelve months.
 *   - `filters`: the documented `income` (1 = sales, 0 = expenses) and
 *     `kind` (one document type) filters, applied upstream so each page is
 *     one upstream page of the resource's own rows.
 *
 * `updatedAfter` is not sent. `search_date_type` is documented only with
 * `issue_date`, `sell_date` and `paid_date` (the adapter used to send an
 * undocumented `updated_at`), and none of those is a modification date, so
 * filtering by one could drop a document edited after it was issued. The
 * list is a superset of the documents modified since then.
 */
function documentListParams(
  params: QueryParams,
  filters: { income?: 0 | 1; kind?: string },
): Record<string, unknown> {
  const page =
    typeof params.page === 'number' && Number.isFinite(params.page) && params.page >= 1
      ? Math.floor(params.page)
      : 1
  const limit =
    typeof params.limit === 'number' && Number.isFinite(params.limit) && params.limit >= 1
      ? Math.floor(params.limit)
      : DEFAULT_PAGE_SIZE
  return { page, per_page: Math.min(limit, MAX_PAGE_SIZE), period: 'all', ...filters }
}

/** `GET /invoices.json` answers a JSON array of documents; anything else is not a page. */
function documentRows(res: unknown): VosFacturesInvoice[] {
  if (!Array.isArray(res)) {
    throw badGateway('VosFactures GET /invoices.json did not return an array of documents')
  }
  return res as VosFacturesInvoice[]
}

/**
 * The document in a `GET /invoices/{id}.json`, `POST /invoices.json` or
 * `PUT /invoices/{id}.json` response. The README shows no response body for
 * any of them; its other JSON responses (price lists, for one) are the record
 * itself, and its request bodies wrap a document as `{ invoice }`, so both are
 * read. A body that is neither is not a document: 502, rather than the
 * TypeError that reading `.invoice.id` off a bare document used to throw.
 */
function documentFrom(res: unknown, call = 'GET /invoices/{id}.json'): VosFacturesInvoice {
  if (res && typeof res === 'object') {
    const wrapped = (res as { invoice?: unknown }).invoice
    if (wrapped && typeof wrapped === 'object' && (wrapped as { id?: unknown }).id != null) {
      return wrapped as VosFacturesInvoice
    }
    if ((res as { id?: unknown }).id != null) return res as VosFacturesInvoice
  }
  throw badGateway(`VosFactures ${call} did not return a document`)
}

// ── Credential form (api_key model) ──────────────────────────────────────

export class VosfacturesAdapter implements AccountingAdapter {
  readonly platform = 'vosfactures'
  readonly version = '0.1.0'
  /** `per_page` "valeur maximale 100" on every paged list (README list_params). */
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  // Expose the credential form for the Connect Link flow
  readonly credentialFields = VOSFACTURES_CREDENTIAL_FORM.credentialFields
  readonly exchangeCredentials = VOSFACTURES_CREDENTIAL_FORM.exchangeCredentials

  // BaseAdapter interface stubs — VosFactures uses static API tokens, not OAuth
  getAuthUrl(_state: string): string {
    return buildAuthUrl(_state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return doExchangeCode(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefreshCredentials(credentials)
  }

  // ── Pagination helpers ──────────────────────────────────────────────────

  private paginationParams(params: QueryParams): Record<string, unknown> {
    const perPage = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const out: Record<string, unknown> = {
      page: params.page ?? 1,
      per_page: perPage,
    }
    if (params.updatedAfter) {
      // VosFactures supports date range filtering via date_from + search_date_type
      out['date_from'] = params.updatedAfter.toISOString().split('T')[0]
      out['period'] = 'more'
      out['search_date_type'] = 'updated_at'
    }
    return out
  }

  // ── Organization ────────────────────────────────────────────────────────

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new VosfacturesClient(credentials)
    // /departments returns the list of seller entities; the first is the main company
    const res = await client.get<VosFacturesDepartment[]>('/departments.json')
    const dept = Array.isArray(res) ? res[0] : res
    return transformOrganization(dept ?? {})
  }

  // ── Invoices (income = 1, AR) ───────────────────────────────────────────

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new VosfacturesClient(credentials)
    const res = await client.get<unknown>(
      '/invoices.json',
      documentListParams(params, { income: 1 }),
    )
    return documentRows(res).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new VosfacturesClient(credentials)
    const res = await client.get<unknown>(`/invoices/${encodeURIComponent(id)}.json`)
    return transformInvoice(documentFrom(res))
  }

  async createInvoice(credentials: Credentials, data: Partial<Invoice>): Promise<Invoice> {
    const client = new VosfacturesClient(credentials)
    const res = await client.post<unknown>('/invoices.json', {
      invoice: untransformInvoice(data),
    })
    return transformInvoice(documentFrom(res, 'POST /invoices.json'))
  }

  async updateInvoice(
    credentials: Credentials,
    id: string,
    data: Partial<Invoice>,
  ): Promise<Invoice> {
    const client = new VosfacturesClient(credentials)
    const res = await client.put<unknown>(`/invoices/${encodeURIComponent(id)}.json`, {
      invoice: untransformInvoice(data),
    })
    return transformInvoice(documentFrom(res, 'PUT /invoices/{id}.json'))
  }

  // ── Bills (income = 0, AP / expense documents) ──────────────────────────

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new VosfacturesClient(credentials)
    const res = await client.get<unknown>(
      '/invoices.json',
      documentListParams(params, { income: 0 }),
    )
    return documentRows(res).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new VosfacturesClient(credentials)
    const res = await client.get<unknown>(`/invoices/${encodeURIComponent(id)}.json`)
    return transformBill(documentFrom(res))
  }

  // ── Contacts (clients) ──────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new VosfacturesClient(credentials)
    const res = await client.get<VFClient[]>('/clients.json', this.paginationParams(params))
    return (Array.isArray(res) ? res : []).map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new VosfacturesClient(credentials)
    const res = await client.get<{ client: VFClient }>(`/clients/${id}.json`)
    return transformContact(res.client)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const client = new VosfacturesClient(credentials)
    const res = await client.post<{ client: VFClient }>('/clients.json', {
      client: {
        name: data.companyName || data.name,
        first_name: data.firstName,
        last_name: data.lastName,
        company: data.companyName ? true : false,
        tax_no: data.taxNumber,
        email: data.emails?.[0]?.email,
        phone: data.telephones?.find((t) => t.type === 'WORK')?.telephone,
        mobile_phone: data.telephones?.find((t) => t.type === 'MOBILE')?.telephone,
        street: data.billingAddress?.address1,
        city: data.billingAddress?.city,
        post_code: data.billingAddress?.postalCode,
        country: data.billingAddress?.country,
      },
    })
    return transformContact(res.client)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const client = new VosfacturesClient(credentials)
    const res = await client.put<{ client: VFClient }>(`/clients/${id}.json`, {
      client: {
        name: data.companyName || data.name,
        first_name: data.firstName,
        last_name: data.lastName,
        tax_no: data.taxNumber,
        email: data.emails?.[0]?.email,
        phone: data.telephones?.find((t) => t.type === 'WORK')?.telephone,
        mobile_phone: data.telephones?.find((t) => t.type === 'MOBILE')?.telephone,
        street: data.billingAddress?.address1,
        city: data.billingAddress?.city,
        post_code: data.billingAddress?.postalCode,
        country: data.billingAddress?.country,
      },
    })
    return transformContact(res.client)
  }

  // ── Credit Memos (kind = correction, income = 1) ────────────────────────
  //
  // A customer credit note is a billing document of `kind` "correction"
  // ("facture d'avoir") on the revenue side (`income` "1"). Both are
  // documented list filters ("Le paramètre `kind =` permet de rechercher un
  // seul type de document", "Le paramètre `income =` vous permet d'obtenir
  // soit la liste des documents de vente (avec la valeur `1`) soit la liste
  // des dépenses (avec la valeur `0`)"), so each page is one upstream page of
  // credit notes and a short page is the last one. Expense-side corrections
  // credit supplier documents, which this adapter serves as Bills.

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new VosfacturesClient(credentials)
    const res = await client.get<unknown>(
      '/invoices.json',
      documentListParams(params, { income: 1, kind: 'correction' }),
    )
    return documentRows(res).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new VosfacturesClient(credentials)
    // Every billing document is read from /invoices/{id}.json, so an invoice,
    // an estimate or a supplier correction id answers too: only a revenue-side
    // correction is a credit memo.
    const doc = documentFrom(await client.get<unknown>(`/invoices/${encodeURIComponent(id)}.json`))
    if (!isRevenueCorrection(doc)) {
      throw notFound(
        `VosFactures document ${id} is not a sales credit note (kind "correction", income "1")`,
      )
    }
    return transformCreditMemo(doc)
  }

  // ── Orders (kind = client_order) ────────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new VosfacturesClient(credentials)
    const res = await client.get<unknown>(
      '/invoices.json',
      documentListParams(params, { kind: 'client_order' }),
    )
    return documentRows(res).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new VosfacturesClient(credentials)
    const res = await client.get<{ invoice: VosFacturesInvoice }>(`/invoices/${id}.json`)
    return transformOrder(res.invoice)
  }

  // ── Sales Orders (kind = client_order, sales view) ──────────────────────

  async listSalesOrders(credentials: Credentials, params: QueryParams): Promise<SalesOrder[]> {
    const client = new VosfacturesClient(credentials)
    const res = await client.get<unknown>(
      '/invoices.json',
      documentListParams(params, { kind: 'client_order' }),
    )
    return documentRows(res).map(transformSalesOrder)
  }

  async getSalesOrder(credentials: Credentials, id: string): Promise<SalesOrder> {
    const client = new VosfacturesClient(credentials)
    const res = await client.get<{ invoice: VosFacturesInvoice }>(`/invoices/${id}.json`)
    return transformSalesOrder(res.invoice)
  }

  // ── Transactions (banking/payments) ─────────────────────────────────────

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new VosfacturesClient(credentials)
    const res = await client.get<VosFacturesPayment[]>('/banking/payments.json', {
      ...this.paginationParams(params),
    })
    return (Array.isArray(res) ? res : []).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new VosfacturesClient(credentials)
    const res = await client.get<{ payment: VosFacturesPayment }>(`/banking/payments/${id}.json`)
    return transformTransaction(res.payment)
  }
}
