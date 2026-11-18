import { toCalendarDate } from '../shared/transform'
/**
 * YukiAdapter — OpenSteward accounting adapter for Yuki.
 *
 * API style: SOAP over HTTPS
 * Base URL:  https://api.yukiworks.nl/ws/<Service>.asmx
 *
 * Auth model (api_key):
 *   credentials.accessToken             = WebserviceAccessKey
 *   credentials.extra.administrationId  = AdministrationID (Connect Link form)
 *   credentials.tenantId                = AdministrationID (legacy exchangeCode only)
 *
 * Supported resources (limited by Yuki SOAP API surface):
 *   - Organization  (Accounting.asmx → Administrations)
 *   - Invoices      (Sales.asmx → ProcessSalesInvoices — write-only create)
 *   - Contacts      (Contact.asmx → SearchContacts / UpdateContact)
 *   - Accounts      (AccountingInfo.asmx → GetGLAccountScheme)
 *   - Journals      (Accounting.asmx → ProcessJournal — write-only create)
 *   - Transactions  (AccountingInfo.asmx → GetTransactionDetails)
 *   - TaxRates      (static well-known Dutch/Belgian VAT rates)
 *
 * Not supported (no standard SOAP endpoint):
 *   Bills, Expenses, CreditMemos, Orders, SalesOrders, PurchaseOrders
 *   → auto-501 via framework default (methods simply not declared).
 *
 * Webhooks: Yuki does not document a webhook system — not implemented.
 */

import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Invoice } from '../../schema/invoice'
import type { Contact } from '../../schema/contact'
import type { Account } from '../../schema/account'
import type { Journal } from '../../schema/journal'
import type { Transaction } from '../../schema/transaction'
import type { TaxRate } from '../../schema/taxrate'
import type { Organization } from '../../schema/organization'

import { CREDENTIAL_FORM, getAuthUrl, exchangeCode as doExchangeCode, refreshCredentials as doRefreshCredentials } from './auth'
import { YukiSoapClient, extractFirst, unescapeXml } from './client'

import { transformInvoice, untransformInvoice, type YukiInvoiceResult } from './transform/invoice'
import { transformContact, parseContactsXml, untransformContact, type YukiContact } from './transform/contact'
import { transformAccount, parseGLAccountsXml } from './transform/account'
import { transformJournal, untransformJournal } from './transform/journal'
import { transformTransaction, parseTransactionsXml } from './transform/transaction'
import { transformOrganization, parseAdministrationsXml, organizationFromCredentials } from './transform/organization'
import { transformTaxRate, YUKI_VAT_RATES } from './transform/taxrate'

import { DEFAULT_PAGE_SIZE } from './constants'

// ── Config ────────────────────────────────────────────────────────────────────

interface YukiAdapterConfig {
  apiKey: string
  administrationId: string
}


// ── Adapter ───────────────────────────────────────────────────────────────────

export class YukiAdapter implements AccountingAdapter {
  readonly platform = 'yuki'
  readonly version = '0.1.0'

  // Connect Link support — per-customer form (see ./auth.ts).
  credentialFields = CREDENTIAL_FORM.credentialFields
  exchangeCredentials = CREDENTIAL_FORM.exchangeCredentials

  private apiKey: string
  private administrationId: string

  constructor(config: YukiAdapterConfig) {
    this.apiKey = config.apiKey
    this.administrationId = config.administrationId
  }

  getAuthUrl(_state: string): string {
    return getAuthUrl(_state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return doExchangeCode(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefreshCredentials(credentials)
  }

  private makeCredentials(): Credentials {
    return {
      accessToken: this.apiKey,
      tenantId: this.administrationId,
    }
  }

  // ── Organization ───────────────────────────────────────────────────────────

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new YukiSoapClient(credentials)
    try {
      // Use a dummy getGLAccountScheme call — Administrations() shares the same
      // Accounting.asmx endpoint but returns administration metadata.
      const xml = await this.callAdministrations(client)
      const admins = parseAdministrationsXml(xml)
      const matched = admins.find((a) => a.AdministrationID === client.administrationId) ?? admins[0]
      if (matched) return transformOrganization(matched)
    } catch {
      // best-effort
    }
    return organizationFromCredentials(client.administrationId)
  }

  /** Calls Accounting.asmx Administrations() which lists accessible domains */
  private async callAdministrations(client: YukiSoapClient): Promise<string> {
    const xml = await client.administrations()
    // The result is wrapped in <AdministrationsResult>...</AdministrationsResult>
    return extractFirst(xml, 'AdministrationsResult')
  }

  // ── Invoices (write-only) ──────────────────────────────────────────────────

  async createInvoice(credentials: Credentials, data: Partial<Invoice>): Promise<Invoice> {
    const client = new YukiSoapClient(credentials)
    const xmlDoc = untransformInvoice(data, client.administrationId)
    const responseXml = await client.processSalesInvoices(xmlDoc)
    // Yuki returns a result with the created invoice reference
    const resultInner = unescapeXml(extractFirst(responseXml, 'ProcessSalesInvoicesResult'))
    const result: YukiInvoiceResult = {
      Reference: data.invoiceNumber ?? data.reference ?? extractFirst(resultInner, 'Reference'),
      Date: toCalendarDate(data.postedAt) ?? '',
      DueDate: data.dueAt ? toCalendarDate(data.dueAt) : undefined,
      Currency: data.currency,
      ContactCode: data.contactId,
      Subject: data.notes,
      Lines: (data.lineItems ?? []).map((li) => ({
        Description: li.itemDescription ?? li.itemName ?? '',
        ProductQuantity: li.unitQuantity ?? 1,
        SalesPrice: li.unitAmount ?? 0,
        VATPercentage: 0,
        VATIncluded: false,
        GLAccountCode: li.accountId ?? undefined,
      })),
    }
    return transformInvoice(result)
  }

  // ── Contacts ───────────────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new YukiSoapClient(credentials)
    const pageNumber = params.page ?? 1
    const modifiedAfter = params.updatedAfter
      ? params.updatedAfter.toISOString().split('T')[0]
      : '2000-01-01'
    const xml = await client.searchContacts({ pageNumber, modifiedAfter })
    const resultInner = extractFirst(xml, 'SearchContactsResult')
    const contacts = parseContactsXml(resultInner)
    return contacts.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new YukiSoapClient(credentials)
    const xml = await client.searchContacts({
      searchOption: 'Code',
      searchValue: id,
      pageNumber: 1,
    })
    const resultInner = extractFirst(xml, 'SearchContactsResult')
    const contacts = parseContactsXml(resultInner)
    const raw = contacts.find((c) => c.ContactCode === id) ?? contacts[0]
    if (!raw) throw new Error(`Yuki: contact not found for id ${id}`)
    return transformContact(raw)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const client = new YukiSoapClient(credentials)
    const xmlDoc = untransformContact(data, client.administrationId)
    await client.updateContact(xmlDoc)
    // Yuki UpdateContact does not return the created record; reconstruct from input
    const raw: YukiContact = {
      ContactCode: data.id ?? '',
      FullName: data.name ?? data.companyName ?? [data.firstName, data.lastName].filter(Boolean).join(' '),
      FirstName: data.firstName ?? '',
      MiddleName: '',
      LastName: data.lastName ?? '',
      Gender: '',
      CountryCode: data.billingAddress?.country ?? '',
      City: data.billingAddress?.city ?? '',
      Zipcode: data.billingAddress?.postalCode ?? '',
      AddressLine_1: data.billingAddress?.address1 ?? '',
      AddressLine_2: data.billingAddress?.address2 ?? '',
      Website: '',
      CoCNumber: data.identification ?? '',
      VATNumber: data.taxNumber ?? '',
      ContactType: data.companyName ? 'Company' : 'Person',
      PhoneHome: data.telephones?.find((t) => t.type === 'WORK' || t.type === 'HOME')?.telephone ?? '',
      MobileHome: data.telephones?.find((t) => t.type === 'MOBILE')?.telephone ?? '',
      EmailAddress: data.emails?.[0]?.email ?? '',
    }
    return transformContact(raw)
  }

  async updateContact(credentials: Credentials, id: string, data: Partial<Contact>): Promise<Contact> {
    return this.createContact(credentials, { ...data, id })
  }

  // ── Accounts ───────────────────────────────────────────────────────────────

  async listAccounts(credentials: Credentials, _params: QueryParams): Promise<Account[]> {
    const client = new YukiSoapClient(credentials)
    const xml = await client.getGLAccountScheme()
    const resultInner = extractFirst(xml, 'GetGLAccountSchemeResult')
    const accounts = parseGLAccountsXml(resultInner)
    return accounts.map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const accounts = await this.listAccounts(credentials, {})
    const account = accounts.find((a) => a.id === id)
    if (!account) throw new Error(`Yuki: account not found for code ${id}`)
    return account
  }

  // ── Journals (write-only create) ───────────────────────────────────────────

  async createJournal(credentials: Credentials, data: Partial<Journal>): Promise<Journal> {
    const client = new YukiSoapClient(credentials)
    const xmlDoc = untransformJournal(data, client.administrationId)
    await client.processJournal(xmlDoc)
    // ProcessJournal does not return the created record; reconstruct from input
    return transformJournal({
      DocumentSubject: data.description ?? '',
      JournalType: 'GeneralJournal',
      AdministrationID: client.administrationId,
      Entries: (data.lineItems ?? []).map((li) => ({
        GLAccount: li.accountId ?? '',
        Amount: String((li.debitAmount ?? 0) > 0 ? (li.debitAmount ?? 0) : -(li.creditAmount ?? 0)),
        Description: li.description ?? '',
        ContactCode: li.contactId ?? '',
        EntryDate: toCalendarDate(data.postedAt) ?? '',
      })),
    })
  }

  // ── Transactions ───────────────────────────────────────────────────────────

  /**
   * GetTransactionDetails requires a GLAccountCode + date range.
   * We use a broad date range when no updatedAfter is set.
   * The params.page is not meaningful here (Yuki returns all results for the range).
   */
  async listTransactions(credentials: Credentials, params: QueryParams): Promise<Transaction[]> {
    const client = new YukiSoapClient(credentials)
    const endDate = new Date().toISOString().split('T')[0]
    const startDate = params.updatedAfter
      ? params.updatedAfter.toISOString().split('T')[0]
      : '2000-01-01'
    // Without a specific GLAccountCode we fetch the GL scheme first to iterate,
    // but that is expensive. Instead we use empty string which Yuki interprets
    // as all accounts (behaviour varies by version).
    const xml = await client.getTransactionDetails({
      glAccountCode: '',
      startDate,
      endDate,
    })
    const resultInner = extractFirst(xml, 'GetTransactionDetailsResult')
    const txns = parseTransactionsXml(resultInner)
    const limit = params.limit ?? DEFAULT_PAGE_SIZE
    return txns.slice(0, limit).map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const txns = await this.listTransactions(credentials, {})
    const txn = txns.find((t) => t.id === id)
    if (!txn) throw new Error(`Yuki: transaction not found for id ${id}`)
    return txn
  }

  // ── Tax Rates (static) ─────────────────────────────────────────────────────

  async listTaxRates(_credentials: Credentials, _params: QueryParams): Promise<TaxRate[]> {
    return YUKI_VAT_RATES.map(transformTaxRate)
  }

  async getTaxRate(_credentials: Credentials, id: string): Promise<TaxRate> {
    const rate = YUKI_VAT_RATES.find((r) => `vat_${r.code}` === id)
    if (!rate) throw new Error(`Yuki: tax rate not found for id ${id}`)
    return transformTaxRate(rate)
  }
}
