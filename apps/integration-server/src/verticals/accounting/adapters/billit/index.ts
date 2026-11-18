/**
 * Billit accounting adapter.
 *
 * Auth model: API key (PartyID + Key) — no OAuth.
 *   Credentials.accessToken = API key
 *   Credentials.tenantId    = PartyID (company identifier)
 *
 * Supported resources:
 *   - Organization  (GET /v1/account/accountInformation)
 *   - Invoices      (GET/POST /v1/orders — OrderDirection: "Income", OrderType: "Invoice")
 *   - Bills         (GET /v1/orders — OrderDirection: "Cost", OrderType: "Invoice")
 *   - Contacts      (GET/POST/PATCH /v1/parties)
 *   - CreditMemos   (GET /v1/orders — OrderType: "CreditNote")
 *   - Orders        (GET /v1/orders — OrderType: "OrderForm")
 *
 * Billit uses OData pagination ($top / $skip) with a max of 120 records/page.
 *
 * Docs: https://docs.billit.be
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: account      — Billit has no chart-of-accounts or ledger-account API endpoint
 * Unavailable: expense      — No expense management endpoint in the Billit API
 * Unavailable: journal      — No journal/ledger entry endpoint in the Billit API
 * Unavailable: purchaseorder — No dedicated purchase-order endpoint; purchase invoices surface as bills
 * Unavailable: salesorder   — No dedicated sales-order endpoint; confirmed orders surface as invoices
 * Unavailable: taxrate      — Billit uses fixed ventilation codes with no list/get API endpoint
 * Unavailable: transaction  — No transaction or payment endpoint in the Billit API
 */

import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { CredentialField } from '@opensteward/shared'
import type { Invoice } from '../../schema/invoice'
import type { Bill } from '../../schema/bill'
import type { Contact } from '../../schema/contact'
import type { Organization } from '../../schema/organization'
import type { CreditMemo } from '../../schema/creditmemo'
import type { Order } from '../../schema/order'

import { BillitClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'
import {
  BILLIT_CREDENTIAL_FIELDS,
  exchangeBillitCredentials,
  refreshBillitCredentials,
} from './auth'

import { transformInvoice, untransformInvoice, type BillitOrder } from './transform/invoice'
import { transformBill } from './transform/bill'
import { transformParty, type BillitParty } from './transform/contact'
import { transformOrganization, type BillitAccountInfo } from './transform/organization'
import { transformCreditMemo } from './transform/creditmemo'
import { transformOrder } from './transform/order'

// ── OData list response envelope ──────────────────────────────────────────────

interface BillitListResponse<T> {
  value?: T[]
  NextpageLink?: string
  [key: string]: unknown
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export class BillitAdapter implements AccountingAdapter {
  readonly platform = 'billit'
  readonly version = '0.1.0'

  // ── Credential fields (API key form) ────────────────────────────────────────

  credentialFields(): CredentialField[] {
    return BILLIT_CREDENTIAL_FIELDS
  }

  exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return exchangeBillitCredentials(fields)
  }

  // ── Auth stubs — Billit does not use OAuth ──────────────────────────────────

  getAuthUrl(_state: string): string {
    throw new Error('Billit uses API key authentication. Use credentialFields/exchangeCredentials instead.')
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('Billit uses API key authentication. Use credentialFields/exchangeCredentials instead.')
  }

  refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return refreshBillitCredentials(credentials)
  }

  // ── Pagination helpers ───────────────────────────────────────────────────────

  private oDataParams(params: QueryParams): Record<string, unknown> {
    const skip = ((params.page ?? 1) - 1) * (params.limit ?? DEFAULT_PAGE_SIZE)
    const top = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const out: Record<string, unknown> = {
      $top: top,
      $skip: skip,
    }
    if (params.updatedAfter) {
      // OData datetime filter: LastModified ge DateTime'...'
      const iso = params.updatedAfter.toISOString().replace('T', ' ').split('.')[0]
      out['$filter'] = `LastModified ge DateTime'${iso}'`
    }
    return out
  }

  private extractList<T>(res: BillitListResponse<T>): T[] {
    return res.value ?? (Array.isArray(res) ? (res as unknown as T[]) : [])
  }

  // ── Organization ─────────────────────────────────────────────────────────────

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new BillitClient(credentials)
    const res = await client.get<BillitAccountInfo>('account/accountInformation')
    return transformOrganization(res)
  }

  // ── Invoices (OrderDirection = "Income") ─────────────────────────────────────

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new BillitClient(credentials)
    const baseFilter = `OrderDirection eq 'Income' and OrderType eq 'Invoice'`
    const userFilter = this.oDataParams(params)['$filter']
    const $filter = userFilter ? `${baseFilter} and ${userFilter}` : baseFilter

    const res = await client.get<BillitListResponse<BillitOrder>>('orders', {
      ...this.oDataParams(params),
      $filter,
    })
    return this.extractList(res).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new BillitClient(credentials)
    const res = await client.get<BillitOrder>(`orders/${id}`)
    return transformInvoice(res)
  }

  async createInvoice(credentials: Credentials, data: Partial<Invoice>): Promise<Invoice> {
    const client = new BillitClient(credentials)
    const orderId = await client.post<number>('orders', untransformInvoice(data))
    // Billit returns the new OrderID as a plain integer; fetch the full record
    const res = await client.get<BillitOrder>(`orders/${orderId}`)
    return transformInvoice(res)
  }

  async updateInvoice(
    credentials: Credentials,
    id: string,
    data: Partial<Invoice>,
  ): Promise<Invoice> {
    const client = new BillitClient(credentials)
    await client.patch<void>(`orders/${id}`, {
      Paid: data.paidAmount != null && data.balanceAmount === 0,
      Reference: data.reference,
    })
    const res = await client.get<BillitOrder>(`orders/${id}`)
    return transformInvoice(res)
  }

  // ── Bills (OrderDirection = "Cost") ──────────────────────────────────────────

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new BillitClient(credentials)
    const baseFilter = `OrderDirection eq 'Cost' and OrderType eq 'Invoice'`
    const userFilter = this.oDataParams(params)['$filter']
    const $filter = userFilter ? `${baseFilter} and ${userFilter}` : baseFilter

    const res = await client.get<BillitListResponse<BillitOrder>>('orders', {
      ...this.oDataParams(params),
      $filter,
    })
    return this.extractList(res).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new BillitClient(credentials)
    const res = await client.get<BillitOrder>(`orders/${id}`)
    return transformBill(res)
  }

  // ── Contacts (Parties) ────────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new BillitClient(credentials)
    const res = await client.get<BillitListResponse<BillitParty>>('parties', {
      ...this.oDataParams(params),
    })
    return this.extractList(res).map(transformParty)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new BillitClient(credentials)
    const res = await client.get<BillitParty>(`parties/${id}`)
    return transformParty(res)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const client = new BillitClient(credentials)
    const body: Record<string, unknown> = {
      Name: data.name ?? data.companyName,
      CommercialName: data.companyName,
      VATNumber: data.taxNumber,
      PartyType: data.isSupplier && !data.isCustomer ? 'Supplier' : 'Customer',
    }
    if (data.emails?.[0]?.email) body['Email'] = data.emails[0].email
    if (data.telephones?.[0]?.telephone) body['Phone'] = data.telephones[0].telephone
    if (data.billingAddress) {
      body['Addresses'] = [
        {
          AddressType: 'InvoiceAddress',
          Street: data.billingAddress.address1,
          Zipcode: data.billingAddress.postalCode,
          City: data.billingAddress.city,
          CountryCode: data.billingAddress.country,
        },
      ]
    }
    const partyId = await client.post<string>('parties', body)
    const res = await client.get<BillitParty>(`parties/${partyId}`)
    return transformParty(res)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const client = new BillitClient(credentials)
    const body: Record<string, unknown> = {}
    if (data.name ?? data.companyName) body['Name'] = data.name ?? data.companyName
    if (data.companyName) body['CommercialName'] = data.companyName
    if (data.emails?.[0]?.email) body['Email'] = data.emails[0].email
    if (data.telephones?.[0]?.telephone) body['Phone'] = data.telephones[0].telephone
    if (data.billingAddress) {
      body['Addresses'] = [
        {
          AddressType: 'InvoiceAddress',
          Street: data.billingAddress.address1,
          Zipcode: data.billingAddress.postalCode,
          City: data.billingAddress.city,
          CountryCode: data.billingAddress.country,
        },
      ]
    }
    await client.patch<void>(`parties/${id}`, body)
    const res = await client.get<BillitParty>(`parties/${id}`)
    return transformParty(res)
  }

  // ── Credit Memos (OrderType = "CreditNote") ───────────────────────────────

  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new BillitClient(credentials)
    const baseFilter = `OrderType eq 'CreditNote'`
    const userFilter = this.oDataParams(params)['$filter']
    const $filter = userFilter ? `${baseFilter} and ${userFilter}` : baseFilter

    const res = await client.get<BillitListResponse<BillitOrder>>('orders', {
      ...this.oDataParams(params),
      $filter,
    })
    return this.extractList(res).map(transformCreditMemo)
  }

  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new BillitClient(credentials)
    const res = await client.get<BillitOrder>(`orders/${id}`)
    return transformCreditMemo(res)
  }

  // ── Orders (OrderType = "OrderForm") ──────────────────────────────────────

  async listOrders(credentials: Credentials, params: QueryParams): Promise<Order[]> {
    const client = new BillitClient(credentials)
    const baseFilter = `OrderType eq 'OrderForm'`
    const userFilter = this.oDataParams(params)['$filter']
    const $filter = userFilter ? `${baseFilter} and ${userFilter}` : baseFilter

    const res = await client.get<BillitListResponse<BillitOrder>>('orders', {
      ...this.oDataParams(params),
      $filter,
    })
    return this.extractList(res).map(transformOrder)
  }

  async getOrder(credentials: Credentials, id: string): Promise<Order> {
    const client = new BillitClient(credentials)
    const res = await client.get<BillitOrder>(`orders/${id}`)
    return transformOrder(res)
  }
}
