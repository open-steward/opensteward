/**
 * LedgerSMB accounting adapter.
 *
 * LedgerSMB is a self-hosted, open-source double-entry accounting system.
 * Authentication: session cookie obtained by POSTing credentials to login.pl.
 * REST API base: {instanceUrl}/erp/api/v0/
 *
 * Supported resources (LedgerSMB v0 REST API):
 *   - Invoices (customer)  : GET /invoices/{id}, POST /invoices
 *   - Bills (vendor invoices): fetched via /invoices/{id} with type='vendor'
 *   - Accounts             : GET /accounts/
 *   - Orders               : GET /orders/{id}, POST /orders
 *   - SalesOrders          : derived — /orders where eca.type='customer'
 *   - PurchaseOrders       : derived — /orders where eca.type='vendor'
 *
 * NOT supported (endpoints not implemented in LedgerSMB v0):
 *   - listInvoices, listBills — GET /invoices is not implemented
 *   - listOrders              — GET /orders is not implemented
 *   - Contacts CRUD           — no /contacts entity endpoint in v0
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: journal      — GeneralLedger.pm only exposes /gl/gifi (GIFI codes), not GL journal entry transactions
 * Unavailable: taxrate      — no tax-rate endpoint in LedgerSMB v0 REST API
 * Unavailable: expense      — no expense endpoint in LedgerSMB v0 REST API
 * Unavailable: creditmemo   — no credit memo endpoint in LedgerSMB v0 REST API
 * Unavailable: transaction  — no general transaction endpoint in LedgerSMB v0 REST API
 *
 * Docs: https://book.ledgersmb.org/dev/full-book/
 * Repo: https://github.com/ledgersmb/LedgerSMB
 */

import { pageLocally } from '@opensteward/shared'
import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Invoice } from '../../schema/invoice'
import type { Bill } from '../../schema/bill'
import type { Account } from '../../schema/account'
import type { Order } from '../../schema/order'
import type { SalesOrder } from '../../schema/salesorder'
import type { PurchaseOrder } from '../../schema/purchaseorder'
import type { Organization } from '../../schema/organization'

import {
  LEDGERSMB_CREDENTIAL_FIELDS,
  exchangeCredentials as _exchangeCredentials,
  refreshCredentials as _refreshCredentials,
} from './auth'
import { LedgerSMBClient } from './client'

import { transformInvoice, untransformInvoice, type LedgerSMBInvoice } from './transform/invoice'
import { transformBill } from './transform/bill'
import { transformAccount, type LedgerSMBAccount } from './transform/account'
import { transformOrder, untransformOrder, type LedgerSMBOrder } from './transform/order'
import { transformSalesOrder, untransformSalesOrder } from './transform/salesorder'
import { transformPurchaseOrder, untransformPurchaseOrder } from './transform/purchaseorder'
import {
  transformOrganization,
  type LedgerSMBCompanyInfo,
} from './transform/organization'

export class LedgersmbAdapter implements AccountingAdapter {
  readonly platform = 'ledgersmb'
  readonly version = '0.1.0'
  /** Honours `params.search`; see AdapterCapabilities. Declared so the
   *  router can refuse the parameter on adapters that would drop it. */
  readonly capabilities = { search: true }

  // ── Credential form (local auth — no OAuth) ───────────────────────────────

  credentialFields = () => LEDGERSMB_CREDENTIAL_FIELDS

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return _exchangeCredentials(fields)
  }

  // ── Auth stubs (not used — local form auth only) ──────────────────────────
  // BaseAdapter requires these; they throw because LedgerSMB uses local auth.

  getAuthUrl(_state: string): string {
    throw new Error('LedgerSMB uses local username/password auth, not OAuth.')
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('LedgerSMB uses local username/password auth, not OAuth.')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return _refreshCredentials(credentials)
  }

  // ── Organization ──────────────────────────────────────────────────────────
  // LedgerSMB has no /organization endpoint; we derive company info from the
  // credentials `extra` fields captured at login time.

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const extra = credentials.extra as Record<string, string> | undefined
    const info: LedgerSMBCompanyInfo = {
      company: extra?.company,
    }
    return transformOrganization(info)
  }

  // ── Invoices ──────────────────────────────────────────────────────────────
  // GET /invoices (list) is not implemented in LedgerSMB v0 API.

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new LedgerSMBClient(credentials)
    const raw = await client.get<LedgerSMBInvoice>(`invoices/${encodeURIComponent(id)}`)
    return transformInvoice(raw)
  }

  async createInvoice(credentials: Credentials, data: Partial<Invoice>): Promise<Invoice> {
    const client = new LedgerSMBClient(credentials)
    const raw = await client.post<LedgerSMBInvoice>('invoices', untransformInvoice(data))
    return transformInvoice(raw)
  }

  // ── Bills (vendor invoices) ───────────────────────────────────────────────
  // Vendor invoices are fetched via the same /invoices/{id} endpoint.
  // GET /invoices (list) is not implemented in LedgerSMB v0 API.

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new LedgerSMBClient(credentials)
    const raw = await client.get<LedgerSMBInvoice>(`invoices/${encodeURIComponent(id)}`)
    return transformBill(raw)
  }

  // ── Accounts ──────────────────────────────────────────────────────────────
  // GET /accounts/ returns a flat array. GET /accounts/{id} is not implemented.

  /**
   * Every account matching `search`, in one request. The route reads no
   * paging parameter and returns the whole chart: Accounts.pm reads only
   * "my $label = $req->parameters->{label} // '';", and the spec says
   * "filtering, sorting and pagination are to be specified and implemented."
   * https://raw.githubusercontent.com/ledgersmb/LedgerSMB/master/lib/LedgerSMB/Routes/ERP/API/Accounts.pm
   */
  private async fetchAllAccounts(credentials: Credentials, search?: string): Promise<Account[]> {
    const client = new LedgerSMBClient(credentials)
    // The API accepts an optional ?label= search filter
    const queryParams: Record<string, unknown> = {}
    if (search) queryParams['label'] = search
    const raw = await client.get<LedgerSMBAccount[] | { items?: LedgerSMBAccount[] }>(
      'accounts/',
      queryParams,
    )
    // Accounts.pm answers with a bare JSON array; a body wrapped in { items }
    // is read the same way. A body that is not JSON at all, such as a login or
    // proxy page that axios leaves as a string, is not an empty chart:
    // listAccounts would report it as a complete collection of zero, so it is
    // refused here. An object without `items` still reads as an empty wrapper:
    // check:paging-contract answers every probe with such an object, and a
    // throw on it would leave this method unmeasured by that gate.
    if (!Array.isArray(raw) && (raw === null || typeof raw !== 'object')) {
      throw new Error('LedgerSMB GET accounts/ returned a body that is not a JSON account list')
    }
    const items: LedgerSMBAccount[] = Array.isArray(raw) ? raw : (raw.items ?? [])
    return items.map(transformAccount)
  }

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    // The upstream answers every request with the whole collection, so one
    // caller page is sliced from it here.
    return pageLocally(await this.fetchAllAccounts(credentials, params.search), params)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    // GET /accounts/{id} is a stub in v0; we list all and find by accno
    const accounts = await this.fetchAllAccounts(credentials)
    const found = accounts.find((a) => a.id === id || a.customerDefinedCode === id)
    if (!found) throw new Error(`LedgerSMB account not found: ${id}`)
    return found
  }

  // ── Orders ────────────────────────────────────────────────────────────────
  // GET /orders (list) is not implemented in LedgerSMB v0 API.
  // POST /orders creates a sales order.

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new LedgerSMBClient(credentials)
    const raw = await client.get<LedgerSMBOrder>(`orders/${encodeURIComponent(id)}`)
    return transformOrder(raw)
  }

  async createOrder(credentials: Credentials, data: Partial<Order>): Promise<Order> {
    const client = new LedgerSMBClient(credentials)
    const raw = await client.post<LedgerSMBOrder>('orders', untransformOrder(data))
    return transformOrder(raw)
  }

  // ── Sales Orders ──────────────────────────────────────────────────────────
  // Derived from /orders — a sales order is an order with eca.type='customer'.
  // GET /orders (list) is not implemented in LedgerSMB v0 API.

  async getSalesOrder(credentials: Credentials, id: string): Promise<SalesOrder> {
    const client = new LedgerSMBClient(credentials)
    const raw = await client.get<LedgerSMBOrder>(`orders/${encodeURIComponent(id)}`)
    return transformSalesOrder(raw)
  }

  async createSalesOrder(credentials: Credentials, data: Partial<SalesOrder>): Promise<SalesOrder> {
    const client = new LedgerSMBClient(credentials)
    const raw = await client.post<LedgerSMBOrder>('orders', untransformSalesOrder(data))
    return transformSalesOrder(raw)
  }

  // ── Purchase Orders ───────────────────────────────────────────────────────
  // Derived from /orders — a purchase order is an order with eca.type='vendor'.
  // GET /orders (list) is not implemented in LedgerSMB v0 API.

  async getPurchaseOrder(credentials: Credentials, id: string): Promise<PurchaseOrder> {
    const client = new LedgerSMBClient(credentials)
    const raw = await client.get<LedgerSMBOrder>(`orders/${encodeURIComponent(id)}`)
    return transformPurchaseOrder(raw)
  }

  async createPurchaseOrder(
    credentials: Credentials,
    data: Partial<PurchaseOrder>,
  ): Promise<PurchaseOrder> {
    const client = new LedgerSMBClient(credentials)
    const raw = await client.post<LedgerSMBOrder>('orders', untransformPurchaseOrder(data))
    return transformPurchaseOrder(raw)
  }

  // ── Contacts ──────────────────────────────────────────────────────────────
  // LedgerSMB v0 REST API has no dedicated contacts/entities CRUD endpoint.
  // The ECA (Entity Credit Account) id used by callers is NOT a transaction id,
  // so passing it to /invoices/{id} would 404 or return an unrelated document.
  // getContact is intentionally omitted; callers check for optional-method absence.
}
