/**
 * Octopus accounting adapter.
 *
 * Octopus is a Belgian online accounting package developed by Inaras NV.
 * REST API: https://service.inaras.be/octopus-rest-api/
 * Docs:     https://login.octopus.be/manual/NL/manual-api.htm
 *
 * Auth model: api_key (dossier token).
 * The dossier token is a short-lived bearer token scoped to a single
 * accounting dossier.  It is stored as credentials.accessToken and sent
 * as "Authorization: Bearer <token>" on every request.
 *
 * Supported resources: Organization, Invoice, Bill, Contact, Account,
 *   Journal, Transaction, TaxRate. Credit memos are refused with 501: the
 *   spec's credit notes are unreachable through this adapter's connection
 *   (see the Credit Memos section).
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: expense      — Octopus REST API has no expense/onkosten endpoint
 * Unavailable: creditmemo   — documented source unreachable (no dossierId / dossierToken)
 * Unavailable: order        — Octopus REST API has no generic order endpoint
 * Unavailable: salesorder   — Octopus REST API has no salesOrders endpoint
 * Unavailable: purchaseorder — Octopus REST API has no purchaseOrders endpoint
 */
import { OCTOPUS_API_KEY_FORM } from './auth'
import { OctopusClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'

import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Invoice } from '../../schema/invoice'
import type { Bill } from '../../schema/bill'
import type { Contact } from '../../schema/contact'
import type { Account } from '../../schema/account'
import type { Journal } from '../../schema/journal'
import type { Transaction } from '../../schema/transaction'
import type { TaxRate } from '../../schema/taxrate'
import type { Organization } from '../../schema/organization'
import type { CreditMemo } from '../../schema/creditmemo'

import { transformInvoice, type OctopusSalesInvoice } from './transform/invoice'
import { transformBill, type OctopusPurchaseInvoice } from './transform/bill'
import { transformRelation, type OctopusRelation } from './transform/contact'
import { transformAccount, type OctopusAccount } from './transform/account'
import { transformJournal, type OctopusBooking } from './transform/journal'
import { transformTransaction, type OctopusPayment } from './transform/transaction'
import { transformTaxRate, type OctopusVatCode } from './transform/taxrate'
import { transformOrganization, type OctopusDossier } from './transform/organization'

// Octopus pages from 1; default page size matches the API default.
interface OctopusPage<T> {
  data?: T[]
  items?: T[]
  result?: T[]
  totalCount?: number
  page?: number
  pageSize?: number
}

const CREDIT_MEMO_REFUSAL =
  'Octopus credit notes are negative-total sales invoices under /dossiers/{dossierId}/invoices ' +
  '(https://service.inaras.be/octopus-rest-api/v1/openapi.json), which need a dossierId and a dossierToken ' +
  'header; this adapter collects neither, so it cannot read them.'

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

function unwrapList<T>(res: OctopusPage<T> | T[]): T[] {
  if (Array.isArray(res)) return res
  return res.data ?? res.items ?? res.result ?? []
}

export class OctopusAdapter implements AccountingAdapter {
  readonly platform = 'octopus'
  readonly version = '0.1.0'

  // Connect Link: single dossier-token field (api_key model).
  credentialFields = OCTOPUS_API_KEY_FORM.credentialFields
  exchangeCredentials = OCTOPUS_API_KEY_FORM.exchangeCredentials

  // api_key adapters do not use OAuth flows.
  getAuthUrl(_state: string): string {
    throw new Error('Octopus uses dossier-token auth. Call exchangeCredentials instead.')
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('Octopus uses dossier-token auth. Call exchangeCredentials instead.')
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // Dossier tokens are static API keys; return as-is.
    return credentials
  }

  private pageParams(params: QueryParams): Record<string, unknown> {
    return {
      page: params.page ?? 1,
      pageSize: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
      ...(params.updatedAfter && {
        modifiedAfter: params.updatedAfter.toISOString().split('T')[0],
      }),
    }
  }

  // --- Organization ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new OctopusClient(credentials)
    const res = await client.get<OctopusDossier | { dossier: OctopusDossier }>('dossier')
    const raw = (res as { dossier: OctopusDossier }).dossier ?? (res as OctopusDossier)
    return transformOrganization(raw)
  }

  // --- Invoices (sales invoices) ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new OctopusClient(credentials)
    const res = await client.get<OctopusPage<OctopusSalesInvoice> | OctopusSalesInvoice[]>(
      'salesInvoices',
      this.pageParams(params),
    )
    return unwrapList(res).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new OctopusClient(credentials)
    const res = await client.get<OctopusSalesInvoice | { salesInvoice: OctopusSalesInvoice }>(
      `salesInvoices/${id}`,
    )
    const raw =
      (res as { salesInvoice: OctopusSalesInvoice }).salesInvoice ?? (res as OctopusSalesInvoice)
    return transformInvoice(raw)
  }

  // --- Bills (purchase invoices) ---

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new OctopusClient(credentials)
    const res = await client.get<OctopusPage<OctopusPurchaseInvoice> | OctopusPurchaseInvoice[]>(
      'purchaseInvoices',
      this.pageParams(params),
    )
    return unwrapList(res).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new OctopusClient(credentials)
    const res = await client.get<
      OctopusPurchaseInvoice | { purchaseInvoice: OctopusPurchaseInvoice }
    >(`purchaseInvoices/${id}`)
    const raw =
      (res as { purchaseInvoice: OctopusPurchaseInvoice }).purchaseInvoice ??
      (res as OctopusPurchaseInvoice)
    return transformBill(raw)
  }

  // --- Contacts (relations) ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new OctopusClient(credentials)
    const res = await client.get<OctopusPage<OctopusRelation> | OctopusRelation[]>(
      'relations',
      this.pageParams(params),
    )
    return unwrapList(res).map(transformRelation)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new OctopusClient(credentials)
    const res = await client.get<OctopusRelation | { relation: OctopusRelation }>(`relations/${id}`)
    const raw = (res as { relation: OctopusRelation }).relation ?? (res as OctopusRelation)
    return transformRelation(raw)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const client = new OctopusClient(credentials)
    const body: Record<string, unknown> = {
      name: data.companyName || data.name,
      firstName: data.firstName,
      lastName: data.lastName,
      companyName: data.companyName,
      vatNumber: data.taxNumber,
      enterpriseNumber: data.identification,
      isCustomer: data.isCustomer ?? true,
      isSupplier: data.isSupplier ?? false,
      currency: data.currency,
      email: data.emails?.[0]?.email,
      phone: data.telephones?.find((t) => t.type === 'WORK')?.telephone,
      address: data.billingAddress?.address1,
      address2: data.billingAddress?.address2,
      city: data.billingAddress?.city,
      postalCode: data.billingAddress?.postalCode,
      countryCode: data.billingAddress?.country,
    }
    const res = await client.post<OctopusRelation | { relation: OctopusRelation }>(
      'relations',
      body,
    )
    const raw = (res as { relation: OctopusRelation }).relation ?? (res as OctopusRelation)
    return transformRelation(raw)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const client = new OctopusClient(credentials)
    const body: Record<string, unknown> = {
      name: data.companyName || data.name,
      firstName: data.firstName,
      lastName: data.lastName,
      companyName: data.companyName,
      email: data.emails?.[0]?.email,
      phone: data.telephones?.find((t) => t.type === 'WORK')?.telephone,
      address: data.billingAddress?.address1,
      address2: data.billingAddress?.address2,
      city: data.billingAddress?.city,
      postalCode: data.billingAddress?.postalCode,
      countryCode: data.billingAddress?.country,
    }
    const res = await client.put<OctopusRelation | { relation: OctopusRelation }>(
      `relations/${id}`,
      body,
    )
    const raw = (res as { relation: OctopusRelation }).relation ?? (res as OctopusRelation)
    return transformRelation(raw)
  }

  // --- Accounts (general ledger) ---

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new OctopusClient(credentials)
    const res = await client.get<OctopusPage<OctopusAccount> | OctopusAccount[]>(
      'generalAccounts',
      this.pageParams(params),
    )
    return unwrapList(res).map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new OctopusClient(credentials)
    const res = await client.get<OctopusAccount | { account: OctopusAccount }>(
      `generalAccounts/${id}`,
    )
    const raw = (res as { account: OctopusAccount }).account ?? (res as OctopusAccount)
    return transformAccount(raw)
  }

  // --- Journals (bookings) ---

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new OctopusClient(credentials)
    const res = await client.get<OctopusPage<OctopusBooking> | OctopusBooking[]>(
      'bookings',
      this.pageParams(params),
    )
    return unwrapList(res).map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new OctopusClient(credentials)
    const res = await client.get<OctopusBooking | { booking: OctopusBooking }>(`bookings/${id}`)
    const raw = (res as { booking: OctopusBooking }).booking ?? (res as OctopusBooking)
    return transformJournal(raw)
  }

  // --- Transactions (payments) ---

  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new OctopusClient(credentials)
    const res = await client.get<OctopusPage<OctopusPayment> | OctopusPayment[]>(
      'payments',
      this.pageParams(params),
    )
    return unwrapList(res).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new OctopusClient(credentials)
    const res = await client.get<OctopusPayment | { payment: OctopusPayment }>(`payments/${id}`)
    const raw = (res as { payment: OctopusPayment }).payment ?? (res as OctopusPayment)
    return transformTransaction(raw)
  }

  // --- Tax Rates (VAT codes) ---

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new OctopusClient(credentials)
    const res = await client.get<OctopusPage<OctopusVatCode> | OctopusVatCode[]>(
      'vatCodes',
      this.pageParams(params),
    )
    return unwrapList(res).map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new OctopusClient(credentials)
    const res = await client.get<OctopusVatCode | { vatCode: OctopusVatCode }>(`vatCodes/${id}`)
    const raw = (res as { vatCode: OctopusVatCode }).vatCode ?? (res as OctopusVatCode)
    return transformTaxRate(raw)
  }

  // --- Credit Memos ---
  //
  // Refused before any request. The previous methods called
  // `GET salesInvoices?creditNote=true` and `GET salesInvoices/{id}`, which
  // Octopus does not publish. The published OpenAPI 3.0.1 spec
  // (https://service.inaras.be/octopus-rest-api/v1/openapi.json, the document
  // https://service.inaras.be/octopus-rest-api/swagger/ loads; fetched
  // 2026-09-29) does document credit notes, but only as a sign convention:
  // POST /dossiers/{dossierId}/invoices says "To create a credit note, the
  // total amount and the lines have to be negative", and POST
  // /buysellbookings says "To book a credit note, the total amount should be
  // negative". They are read like any sales invoice: GET
  // /dossiers/{dossierId}/invoices by bookyearId + journalKey + documentSeqNr,
  // or GET /invoices/modified by bookyearId + journalKey + modifiedTimeStamp,
  // every call with a `dossierToken` header.
  //
  // This adapter cannot make any of those calls: it collects no dossierId,
  // sends the token as `Authorization: Bearer`, and targets
  // `…/octopus-rest-api/api/` instead of the spec's `…/v1` server (see
  // README.md). Rebuilding credit memos means rebuilding that connection
  // first, so they are refused rather than sent to another undocumented path.
  // Even then `appliedTo` would stay empty: the only reference to another
  // invoice is the Peppol `billingReferences[].invoiceDocumentReference.id`,
  // a free-text document number, not an id in this adapter's Invoice space.

  async listCreditMemos(_credentials: Credentials, _params: QueryParams): Promise<CreditMemo[]> {
    throw notSupported(CREDIT_MEMO_REFUSAL)
  }

  async getCreditMemo(_credentials: Credentials, _id: string): Promise<CreditMemo> {
    throw notSupported(CREDIT_MEMO_REFUSAL)
  }
}
