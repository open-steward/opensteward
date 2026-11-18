/**
 * Abacus ERP accounting adapter (Switzerland).
 *
 * Abacus is a Swiss ERP platform for SMEs, widely used in the DACH region.
 * Each customer hosts their own Abacus server instance.  The tenant base URL
 * (e.g. "https://mycompany.abacus.ch") is stored in `credentials.tenantId`
 * so the OAuth2 endpoints and API base URL can be resolved at runtime.
 *
 * Supported resources:
 *   - Organization  (GET)
 *   - Invoices      (list, get, create, update)  — accounts receivable
 *   - Bills         (list, get)                  — accounts payable
 *   - Contacts      (list, get, create, update)  — debtors + creditors
 *   - Accounts      (list, get)                  — GL chart of accounts
 *   - TaxRates      (list, get)                  — VAT / tax codes
 *   - Journals      (list, get)                  — booking/journal entries
 *   - Expenses      (list, get)                  — employee expense claims
 *   - SalesOrders   (list, get)                  — customer orders before invoicing
 *
 * Auth:  OAuth2 authorization_code with offline_access scope for refresh tokens.
 * Docs:  https://downloads.abacus.ch/fileadmin/ablage/abaconnect/htmlfiles/docs/restapi/abacus_rest_api.html
 *        https://downloads.abacus.ch/fileadmin/ablage/abaconnect/htmlfiles/docs/restapi/abacus_authorization_rest_api.html
 *
 * ── Resource coverage ──────────────────────────────────────────────────────────
 * Unavailable: creditmemo    — Abacus REST API does not expose a CreditNotes entity set; credit notes are not accessible via the documented OData API
 * Unavailable: transaction   — Abacus REST API does not expose a Transactions entity set; financial transactions are not accessible via the documented OData API
 * Unavailable: purchaseorder — Abacus REST API does not expose a PurchaseOrders entity set; purchase orders are not accessible via the documented OData API
 * Unavailable: order         — No generic Orders entity; Abacus separates orders into SalesOrders (supported) and PurchaseOrders (unsupported) with no unified Orders endpoint
 */

import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { CredentialField } from '@opensteward/shared'
import type { Invoice } from '../../schema/invoice'
import type { Bill } from '../../schema/bill'
import type { Contact } from '../../schema/contact'
import type { Account } from '../../schema/account'
import type { Organization } from '../../schema/organization'
import type { TaxRate } from '../../schema/taxrate'
import type { Journal } from '../../schema/journal'
import type { Expense } from '../../schema/expense'
import type { SalesOrder } from '../../schema/salesorder'

import { buildAuthUrl, exchangeCode, refreshAccessToken } from './auth'
import { AbacusClient } from './client'
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE, DEFAULT_SCOPES } from './constants'

import { transformInvoice, untransformInvoice, type AbacusInvoice } from './transform/invoice'
import { transformBill, type AbacusBill } from './transform/bill'
import {
  transformContact,
  untransformContact,
  type AbacusAddress,
} from './transform/contact'
import { transformAccount, type AbacusAccount } from './transform/account'
import { transformOrganization, type AbacusMandant } from './transform/organization'
import { transformTaxRate, type AbacusTaxCode } from './transform/taxrate'
import { transformJournal, type AbacusJournal } from './transform/journal'
import { transformExpense, type AbacusExpense } from './transform/expense'
import { transformSalesOrder, type AbacusSalesOrder } from './transform/salesorder'

// ── Config ────────────────────────────────────────────────────────────────────

interface AbacusAdapterConfig {
  /** OAuth2 client ID (Abacus Service-User Client-ID). */
  clientId: string
  /** OAuth2 client secret (Abacus Service-User Clientschlüssel). */
  clientSecret: string
  /** OAuth2 redirect URI registered in Abacus User Management. */
  redirectUri: string
  /**
   * Deployment-wide fallback server URL, e.g. "https://mycompany.abacus.ch".
   * The admin UI cannot set it, so a Connect Link customer supplies their own
   * (`oauthFields`), which is then read back from
   * `credentials.extra.tenantBaseUrl`. Set it only when every connection on
   * this deployment is the same Abacus server.
   */
  tenantBaseUrl?: string
  /** OAuth2 scopes; defaults to DEFAULT_SCOPES when omitted. */
  scopes?: string[]
}

// ── OData helpers ─────────────────────────────────────────────────────────────

function odataPagination(params: QueryParams): Record<string, number> {
  const top = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
  const skip = ((params.page ?? 1) - 1) * top
  return { $top: top, $skip: skip }
}

// ── Adapter class ─────────────────────────────────────────────────────────────

export class AbacusChAdapter implements AccountingAdapter {
  readonly platform = 'abacus-ch'
  readonly version = '0.1.0'

  private clientId: string
  private clientSecret: string
  private redirectUri: string
  private tenantBaseUrl: string | undefined
  private scopes: string[]

  constructor(config: AbacusAdapterConfig) {
    this.clientId = config.clientId
    this.clientSecret = config.clientSecret
    this.redirectUri = config.redirectUri
    this.tenantBaseUrl = config.tenantBaseUrl
    this.scopes = config.scopes ?? DEFAULT_SCOPES
  }

  /** The customer's Abacus server hosts the authorize, token and API endpoints. */
  oauthFields(): CredentialField[] {
    return [
      {
        name: 'tenantBaseUrl',
        label: 'Abacus server URL',
        type: 'url',
        required: true,
        placeholder: 'https://abacus.example.ch',
        helpText: 'The address of your Abacus server, as used to sign in to Abacus.',
      },
    ]
  }

  /** Return the OAuth2 authorization URL on the customer's server. */
  getAuthUrl(
    state: string,
    overrideScopes?: string[],
    _codeChallenge?: string,
    inputs?: Record<string, string>,
  ): string {
    return buildAuthUrl(
      inputs?.['tenantBaseUrl'] ?? this.tenantBaseUrl,
      this.clientId,
      this.redirectUri,
      overrideScopes ?? this.scopes,
      state,
    )
  }

  /** Exchange the authorization code for credentials. */
  async exchangeCode(code: string, redirectUri: string): Promise<Credentials> {
    return exchangeCode(
      code,
      this.clientId,
      this.clientSecret,
      redirectUri,
      this.tenantBaseUrl,
    )
  }

  /** Exchange on the customer's server and remember it with the credentials. */
  async exchangeCodeWithInputs(
    code: string,
    redirectUri: string,
    inputs: Record<string, string>,
  ): Promise<Credentials> {
    return exchangeCode(
      code,
      this.clientId,
      this.clientSecret,
      redirectUri,
      inputs['tenantBaseUrl'] ?? this.tenantBaseUrl,
    )
  }

  /** Refresh an expired access token using the stored refresh token. */
  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    if (!credentials.refreshToken) throw new Error('No refresh token available')
    const stored = credentials.extra?.['tenantBaseUrl']
    return refreshAccessToken(
      credentials.refreshToken,
      this.clientId,
      this.clientSecret,
      (typeof stored === 'string' && stored.trim() ? stored : credentials.tenantId) ?? this.tenantBaseUrl,
    )
  }

  // ── Organization ─────────────────────────────────────────────────────────────

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new AbacusClient(credentials)
    // Abacus exposes the mandant (company) config under "Mandants".
    // We fetch the first record (there is typically one per API connection).
    const res = await client.list<AbacusMandant>('Mandants', { $top: 1 })
    const raw = res.value[0]
    if (!raw) throw new Error('No mandant record found in Abacus response')
    return transformOrganization(raw)
  }

  // ── Invoices (AR) ─────────────────────────────────────────────────────────────

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new AbacusClient(credentials)
    const query: Record<string, unknown> = { ...odataPagination(params) }
    if (params.updatedAfter) {
      query['$filter'] = `ModifiedAt gt ${params.updatedAfter.toISOString()}`
    }
    const res = await client.list<AbacusInvoice>('Invoices', query)
    return res.value.map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new AbacusClient(credentials)
    const raw = await client.get<AbacusInvoice>('Invoices', id)
    return transformInvoice(raw)
  }

  async createInvoice(credentials: Credentials, data: Partial<Invoice>): Promise<Invoice> {
    const client = new AbacusClient(credentials)
    const raw = await client.post<AbacusInvoice>('Invoices', untransformInvoice(data))
    return transformInvoice(raw)
  }

  async updateInvoice(
    credentials: Credentials,
    id: string,
    data: Partial<Invoice>,
  ): Promise<Invoice> {
    const client = new AbacusClient(credentials)
    const raw = await client.patch<AbacusInvoice>('Invoices', id, untransformInvoice(data))
    return transformInvoice(raw)
  }

  // ── Bills (AP) ────────────────────────────────────────────────────────────────

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new AbacusClient(credentials)
    const query: Record<string, unknown> = { ...odataPagination(params) }
    if (params.updatedAfter) {
      query['$filter'] = `ModifiedAt gt ${params.updatedAfter.toISOString()}`
    }
    const res = await client.list<AbacusBill>('Bills', query)
    return res.value.map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new AbacusClient(credentials)
    const raw = await client.get<AbacusBill>('Bills', id)
    return transformBill(raw)
  }

  // ── Contacts (Debtors + Creditors) ───────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new AbacusClient(credentials)
    // Abacus Addresses includes all contacts; filter to debtors/creditors only.
    const query: Record<string, unknown> = {
      ...odataPagination(params),
      $filter: '(IsDebtor eq true or IsCreditor eq true)',
    }
    if (params.updatedAfter) {
      query['$filter'] =
        `(IsDebtor eq true or IsCreditor eq true) and ModifiedAt gt ${params.updatedAfter.toISOString()}`
    }
    const res = await client.list<AbacusAddress>('Addresses', query)
    return res.value.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new AbacusClient(credentials)
    const raw = await client.get<AbacusAddress>('Addresses', id)
    return transformContact(raw)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const client = new AbacusClient(credentials)
    const raw = await client.post<AbacusAddress>('Addresses', untransformContact(data))
    return transformContact(raw)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const client = new AbacusClient(credentials)
    const raw = await client.patch<AbacusAddress>('Addresses', id, untransformContact(data))
    return transformContact(raw)
  }

  // ── Accounts (GL) ─────────────────────────────────────────────────────────────

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const client = new AbacusClient(credentials)
    const res = await client.list<AbacusAccount>('Accounts', odataPagination(params))
    return res.value.map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new AbacusClient(credentials)
    const raw = await client.get<AbacusAccount>('Accounts', id)
    return transformAccount(raw)
  }

  // ── Tax Rates (VAT codes) ─────────────────────────────────────────────────────

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new AbacusClient(credentials)
    const res = await client.list<AbacusTaxCode>('TaxCodes', odataPagination(params))
    return res.value.map(transformTaxRate)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new AbacusClient(credentials)
    const raw = await client.get<AbacusTaxCode>('TaxCodes', id)
    return transformTaxRate(raw)
  }

  // ── Journals (booking entries) ────────────────────────────────────────────────

  async listJournals(credentials: Credentials, params: QueryParams): Promise<Journal[]> {
    const client = new AbacusClient(credentials)
    const query: Record<string, unknown> = { ...odataPagination(params) }
    if (params.updatedAfter) {
      query['$filter'] = `ModifiedAt gt ${params.updatedAfter.toISOString()}`
    }
    const res = await client.list<AbacusJournal>('Journals', query)
    return res.value.map(transformJournal)
  }

  async getJournal(credentials: Credentials, id: string): Promise<Journal> {
    const client = new AbacusClient(credentials)
    const raw = await client.get<AbacusJournal>('Journals', id)
    return transformJournal(raw)
  }

  // ── Expenses ──────────────────────────────────────────────────────────────────

  async listExpenses(credentials: Credentials, params: QueryParams): Promise<Expense[]> {
    const client = new AbacusClient(credentials)
    const query: Record<string, unknown> = { ...odataPagination(params) }
    if (params.updatedAfter) {
      query['$filter'] = `ModifiedAt gt ${params.updatedAfter.toISOString()}`
    }
    const res = await client.list<AbacusExpense>('Expenses', query)
    return res.value.map(transformExpense)
  }

  async getExpense(credentials: Credentials, id: string): Promise<Expense> {
    const client = new AbacusClient(credentials)
    const raw = await client.get<AbacusExpense>('Expenses', id)
    return transformExpense(raw)
  }

  // ── Sales Orders ──────────────────────────────────────────────────────────────

  async listSalesOrders(credentials: Credentials, params: QueryParams): Promise<SalesOrder[]> {
    const client = new AbacusClient(credentials)
    const query: Record<string, unknown> = { ...odataPagination(params) }
    if (params.updatedAfter) {
      query['$filter'] = `ModifiedAt gt ${params.updatedAfter.toISOString()}`
    }
    const res = await client.list<AbacusSalesOrder>('SalesOrders', query)
    return res.value.map(transformSalesOrder)
  }

  async getSalesOrder(credentials: Credentials, id: string): Promise<SalesOrder> {
    const client = new AbacusClient(credentials)
    const raw = await client.get<AbacusSalesOrder>('SalesOrders', id)
    return transformSalesOrder(raw)
  }
}
