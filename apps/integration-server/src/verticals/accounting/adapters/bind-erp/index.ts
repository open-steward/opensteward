import { toIsoDateTime } from '../shared/transform'
/**
 * Bind ERP accounting adapter.
 *
 * Auth model: api_key — the caller populates `credentials.accessToken` with
 * the raw API key from Settings → Profile → Integrations in Bind ERP.
 *
 * Supported resources:
 *   - Organization  (GET /api/UserProfile)
 *   - Invoices      (GET /api/Invoices, GET /api/Invoices/{id}, POST /api/Invoices)
 *   - Contacts      (GET /api/Clients + /api/Providers, GET /api/Clients/{id}, POST+PUT)
 *   - Accounts      (GET /api/Accounts, GET /api/Accounts/{id})
 *   - Journals      (GET /api/AccountingJournals)
 *   - Bills         (GET /api/Expenses/{id}  — get by ID only; no list endpoint)
 *   - Expenses      (GET /api/Expenses/{id}  — get by ID only; no list endpoint)
 *   - Orders        (GET /api/Orders/{id}    — Bind ERP "pedidos" = sales orders)
 *   - SalesOrders   (GET /api/Orders/{id}    — same source as Orders)
 *   - CreditMemos   (POST /api/CreditNotes   — create only; no list/get endpoint)
 *
 * ── Resource coverage ──────────────────────────────────────────────────────
 * Unavailable: taxrate     — No tax-rate endpoint exists in the Bind ERP API
 * Unavailable: transaction — No dedicated transaction endpoint; payments are
 *                            sub-resources of invoices/expenses only
 * Unavailable: purchaseorder — No purchase-order endpoint; supplier bills are
 *                              accessed via /api/Expenses/{id} (mapped to Bill)
 */

import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Invoice } from '../../schema/invoice'
import type { Bill } from '../../schema/bill'
import type { Contact } from '../../schema/contact'
import type { Account } from '../../schema/account'
import type { Journal } from '../../schema/journal'
import type { Organization } from '../../schema/organization'
import type { Expense } from '../../schema/expense'
import type { Order } from '../../schema/order'
import type { SalesOrder } from '../../schema/salesorder'
import type { CreditMemo } from '../../schema/creditmemo'

import { buildAuthUrl, exchangeCode as doExchangeCode, refreshCredentials as doRefreshCredentials } from './auth'
import { BindErpClient, type BindListResponse } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import {
  transformInvoiceDetails,
  transformInvoiceListItem,
  type BindInvoiceDetails,
  type BindInvoiceListItem,
} from './transform/invoice'
import {
  transformClientListItem,
  transformClientDetails,
  transformProviderListItem,
  type BindClientListItem,
  type BindClientDetails,
  type BindProviderListItem,
} from './transform/contact'
import { transformAccount, type BindAccount } from './transform/account'
import { transformJournal, type BindAccountingJournal } from './transform/journal'
import { transformOrganization, type BindUserProfile } from './transform/organization'
import { transformBill } from './transform/bill'
import { transformExpense, type BindExpenseDetails } from './transform/expense'
import { transformOrder, transformSalesOrder, type BindOrderDetails } from './transform/order'
import { buildCreditMemoFromCreate } from './transform/creditmemo'

// ── Adapter ──────────────────────────────────────────────────────────────────

export class BindErpAdapter implements AccountingAdapter {
  readonly platform = 'bind-erp'
  readonly version = '0.1.0'

  getAuthUrl(state: string): string { return buildAuthUrl(state) }
  async exchangeCode(code: string): Promise<Credentials> { return doExchangeCode(code) }
  async refreshCredentials(credentials: Credentials): Promise<Credentials> { return doRefreshCredentials(credentials) }

  private oDataParams(params: QueryParams): Record<string, unknown> {
    const top = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const skip = params.page && params.page > 1 ? (params.page - 1) * top : undefined
    return {
      $top: top,
      ...(skip !== undefined && { $skip: skip }),
    }
  }

  // ── Organization ────────────────────────────────────────────────────────────

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new BindErpClient(credentials)
    const raw = await client.get<BindUserProfile>('api/UserProfile')
    return transformOrganization(raw)
  }

  // ── Invoices ────────────────────────────────────────────────────────────────

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new BindErpClient(credentials)
    const res = await client.get<BindListResponse<BindInvoiceListItem>>(
      'api/Invoices',
      this.oDataParams(params),
    )
    return (res.value ?? []).map(transformInvoiceListItem)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new BindErpClient(credentials)
    const raw = await client.get<BindInvoiceDetails>(`api/Invoices/${encodeURIComponent(id)}`)
    return transformInvoiceDetails(raw)
  }

  async createInvoice(credentials: Credentials, data: Partial<Invoice>): Promise<Invoice> {
    const client = new BindErpClient(credentials)
    const body: Record<string, unknown> = {
      ClientID: data.contactId,
      CurrencyID: data.currency,
      InvoiceDate: toIsoDateTime(data.postedAt),
      Comments: data.notes,
      PurchaseOrder: data.reference,
    }
    const raw = await client.post<BindInvoiceDetails>('api/Invoices', body)
    return transformInvoiceDetails(raw)
  }

  // ── Contacts (Clients + Providers) ─────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new BindErpClient(credentials)
    const odata = this.oDataParams(params)
    const [clientsRes, providersRes] = await Promise.all([
      client.get<BindListResponse<BindClientListItem>>('api/Clients', odata),
      client.get<BindListResponse<BindProviderListItem>>('api/Providers', odata),
    ])
    const clients = (clientsRes.value ?? []).map(transformClientListItem)
    const providers = (providersRes.value ?? []).map(transformProviderListItem)
    return [...clients, ...providers]
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new BindErpClient(credentials)
    // Providers are prefixed with 'prov_'; clients use their raw ID
    if (id.startsWith('prov_')) {
      const rawId = id.slice(5)
      const res = await client.get<BindListResponse<BindProviderListItem>>(
        'api/Providers',
        { $filter: `ID eq '${rawId}'` },
      )
      const item = res.value?.[0]
      if (!item) throw new Error(`Provider not found: ${rawId}`)
      return transformProviderListItem(item)
    }
    const raw = await client.get<BindClientDetails>(`api/Clients/${encodeURIComponent(id)}`)
    return transformClientDetails(raw)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const client = new BindErpClient(credentials)
    if (data.isSupplier && !data.isCustomer) {
      const body: Record<string, unknown> = {
        LegalName: data.name ?? data.companyName,
        RFC: data.taxNumber ?? data.identification,
        Email: data.emails?.[0]?.email,
        Phone: data.telephones?.[0]?.telephone,
      }
      const raw = await client.post<BindProviderListItem>('api/Providers', body)
      return transformProviderListItem(raw)
    }
    const body: Record<string, unknown> = {
      LegalName: data.name ?? data.companyName,
      CommercialName: data.name,
      RFC: data.taxNumber ?? data.identification,
      Email: data.emails?.[0]?.email,
      Telephone: data.telephones?.[0]?.telephone,
    }
    const raw = await client.post<BindClientDetails>('api/Clients', body)
    return transformClientDetails(raw)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const client = new BindErpClient(credentials)
    if (id.startsWith('prov_')) {
      const rawId = id.slice(5)
      const body: Record<string, unknown> = {
        ID: rawId,
        LegalName: data.name ?? data.companyName,
        RFC: data.taxNumber ?? data.identification,
        Email: data.emails?.[0]?.email,
        Phone: data.telephones?.[0]?.telephone,
      }
      const raw = await client.put<BindProviderListItem>('api/Providers', body)
      return transformProviderListItem(raw)
    }
    const body: Record<string, unknown> = {
      ID: id,
      LegalName: data.name ?? data.companyName,
      CommercialName: data.name,
      RFC: data.taxNumber ?? data.identification,
      Email: data.emails?.[0]?.email,
      Telephone: data.telephones?.[0]?.telephone,
    }
    const raw = await client.put<BindClientDetails>('api/Clients', body)
    return transformClientDetails(raw)
  }

  // ── Accounts ────────────────────────────────────────────────────────────────

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new BindErpClient(credentials)
    const res = await client.get<BindListResponse<BindAccount>>(
      'api/Accounts',
      this.oDataParams(params),
    )
    return (res.value ?? []).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new BindErpClient(credentials)
    const raw = await client.get<BindAccount>(`api/Accounts/${encodeURIComponent(id)}`)
    return transformAccount(raw)
  }

  // ── Journals ────────────────────────────────────────────────────────────────

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new BindErpClient(credentials)
    const res = await client.get<BindListResponse<BindAccountingJournal>>(
      'api/AccountingJournals',
      this.oDataParams(params),
    )
    return (res.value ?? []).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new BindErpClient(credentials)
    // AccountingJournals GET returns a list; filter by ID using OData
    const res = await client.get<BindListResponse<BindAccountingJournal>>(
      'api/AccountingJournals',
      { $filter: `ID eq '${id}'` },
    )
    const item = res.value?.[0]
    if (!item) throw new Error(`Journal not found: ${id}`)
    return transformJournal(item)
  }

  // ── Bills ────────────────────────────────────────────────────────────────────
  // Bind ERP surfaces supplier purchase documents at GET /api/Expenses/{id}.
  // There is no list endpoint for expenses/bills; only get-by-ID is supported.

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new BindErpClient(credentials)
    const raw = await client.get<BindExpenseDetails>(`api/Expenses/${encodeURIComponent(id)}`)
    return transformBill(raw)
  }

  // ── Expenses ─────────────────────────────────────────────────────────────────
  // Same underlying endpoint as Bills; mapped to the Expense canonical schema.

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new BindErpClient(credentials)
    const raw = await client.get<BindExpenseDetails>(`api/Expenses/${encodeURIComponent(id)}`)
    return transformExpense(raw)
  }

  // ── Orders ───────────────────────────────────────────────────────────────────
  // Bind ERP "pedidos" (GET /api/Orders/{id}) are sales orders.
  // There is no paginated list endpoint; only get-by-ID is available.

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new BindErpClient(credentials)
    const raw = await client.get<BindOrderDetails>(`api/Orders/${encodeURIComponent(id)}`)
    return transformOrder(raw)
  }

  // ── Sales Orders ─────────────────────────────────────────────────────────────
  // Bind ERP Orders are sales orders; mapped to the SalesOrder canonical schema.

  async getSalesOrder(credentials: Credentials, id: string): Promise<SalesOrder> {
    const client = new BindErpClient(credentials)
    const raw = await client.get<BindOrderDetails>(`api/Orders/${encodeURIComponent(id)}`)
    return transformSalesOrder(raw)
  }

  // ── Credit Memos ─────────────────────────────────────────────────────────────
  // POST /api/CreditNotes is the only CreditNotes endpoint — no list or get.
  // The API returns only the new document's GUID; we echo input data + ID back.

  async createCreditMemo(credentials: Credentials, data: Partial<CreditMemo>): Promise<CreditMemo> {
    const client = new BindErpClient(credentials)
    const body: Record<string, unknown> = {
      Amount: data.totalAmount,
      VAT: data.taxAmount,
      Comments: data.notes,
      // InvoiceID, PaymentMethod, PaymentTerms, Type are required by the API
      // but are not part of the canonical CreditMemo schema; callers must
      // pass them via metadata if needed.
      ...(data.metadata ?? {}),
    }
    const newId = await client.post<string>('api/CreditNotes', body)
    return buildCreditMemoFromCreate(newId, data)
  }
}
