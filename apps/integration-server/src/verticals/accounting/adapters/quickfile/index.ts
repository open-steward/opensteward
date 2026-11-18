/**
 * QuickFile accounting adapter.
 *
 * Auth: API key — credentials are supplied as "accNumber:apiKey:applicationId".
 * The accessToken field stores the apiKey; extra stores accNumber and applicationId.
 *
 * QuickFile uses POST for all operations with a JSON envelope containing a signed
 * Header block and a resource-specific Body block.
 *
 * Supported resources: Organization, Invoices, Bills (Purchases), Contacts
 * (Clients + Suppliers), Accounts (Nominal Ledgers), Credit Memos (negative-value
 * invoices; see README.md, which also lists the known issues in the other methods).
 */
import { customForm, pageOffset, reportUpstreamPage } from '@opensteward/shared'
import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { Invoice } from '../../schema/invoice'
import type { Bill } from '../../schema/bill'
import type { Contact } from '../../schema/contact'
import type { Account } from '../../schema/account'
import type { CreditMemo } from '../../schema/creditmemo'
import type { Organization } from '../../schema/organization'

import {
  getAuthUrl,
  exchangeCode as doExchangeCode,
  refreshCredentials as doRefreshCredentials,
} from './auth'
import { QuickFileClient } from './client'
import { DEFAULT_PAGE_SIZE, INVOICE_SEARCH_MAX_RETURN, MAX_PAGE_SIZE } from './constants'

import { transformInvoice, untransformInvoice, type QuickFileInvoice } from './transform/invoice'
import { transformBill, type QuickFilePurchase } from './transform/bill'
import {
  transformClient,
  transformSupplier,
  type QuickFileClient as QuickFileClientModel,
  type QuickFileSupplier,
} from './transform/contact'
import { transformAccount, type QuickFileNominalLedger } from './transform/account'
import {
  asArray,
  isCreditNote,
  type OneOrMany,
  transformCreditMemo,
  type QuickFileInvoiceDetails,
  type QuickFileInvoiceSearchRecord,
} from './transform/creditmemo'
import { transformOrganization, type QuickFileAccountDetails } from './transform/organization'
import { quickfileWebhook } from './webhook'

// ── Connect Link credential form ──────────────────────────────────────────────

const CREDENTIAL_FORM = customForm({
  fields: [
    {
      name: 'accNumber',
      label: 'Account Number',
      type: 'text',
      placeholder: '123456789',
      helpText: 'Your QuickFile account number (shown in Account Settings).',
      required: true,
    },
    {
      name: 'apiKey',
      label: 'API Key',
      type: 'password',
      placeholder: 'AAA3321-12BH-A22',
      helpText: 'Generated in QuickFile > Account Settings > API.',
      required: true,
    },
    {
      name: 'applicationId',
      label: 'Application ID',
      type: 'text',
      placeholder: 'my-integration',
      helpText: 'Register your application in QuickFile to obtain this ID.',
      required: true,
    },
  ],
  async exchange(fields): Promise<Credentials> {
    const accNumber = (fields['accNumber'] ?? '').trim()
    const apiKey = (fields['apiKey'] ?? '').trim()
    const applicationId = (fields['applicationId'] ?? '').trim()
    if (!accNumber || !apiKey || !applicationId) {
      throw new Error('Account Number, API Key and Application ID are all required.')
    }
    return {
      accessToken: apiKey,
      extra: { accNumber, applicationId },
    }
  },
})

// ── Adapter response envelopes ────────────────────────────────────────────────

/**
 * Standard search-endpoint response from QuickFile v1.2.
 * All Invoice_Search, Purchase_Search, Client_Search, Supplier_Search
 * responses return the result array under Body.Record (confirmed from
 * official MCP implementation source). RecordsetCount is the total
 * count; ReturnCount is the count in this page.
 */
interface QuickFileListResponse<T> {
  payload?: {
    Body?: {
      Record?: T[]
      RecordsetCount?: number
      ReturnCount?: number
    }
    Header?: { TotalResults?: number; PageNumber?: number }
  }
}

/**
 * Ledger_GetNominalLedgers uses a different nesting:
 *   Body.Nominals.Nominal[]
 */
interface QuickFileLedgerResponse<T> {
  payload?: {
    Body?: {
      Nominals?: {
        Nominal?: T[]
      }
    }
  }
}

interface QuickFileSingleResponse<T> {
  payload?: {
    Body?: T
  }
}

/**
 * The documented response envelope: the method name keys `{ Header, Body }`
 * (e.g. `{ "Invoice_Search": { "Header": {…}, "Body": {…} } }`). Used by
 * the credit-memo methods; the other methods still read `payload` (see README).
 */
type QuickFileMethodResponse<B> = Record<string, { Header?: unknown; Body?: B } | undefined>

interface QuickFileSearchBody {
  RecordsetCount?: number | string
  ReturnCount?: number | string
  /** An array, or a bare object when exactly one row matched (t/16824). */
  Record?: OneOrMany<QuickFileInvoiceSearchRecord> | null
}

function notFound(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 404, code: 'NOT_FOUND' })
}

function badGateway(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 502, code: 'UPSTREAM_ERROR' })
}

/** A non-negative integer count; counts arrive as numbers or numeric strings (t/16824). */
function count(val: number | string | undefined): number | undefined {
  const n = typeof val === 'string' && val.trim() !== '' ? Number(val) : val
  return typeof n === 'number' && Number.isInteger(n) && n >= 0 ? n : undefined
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export class QuickfileAdapter implements AccountingAdapter {
  readonly platform = 'quickfile'
  readonly version = '0.1.0'

  // Connect Link support
  credentialFields = CREDENTIAL_FORM.credentialFields
  exchangeCredentials = CREDENTIAL_FORM.exchangeCredentials

  getAuthUrl(_state: string): string {
    return getAuthUrl(_state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return doExchangeCode(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return doRefreshCredentials(credentials)
  }

  // Webhook support
  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return quickfileWebhook.verifyWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>) {
    return quickfileWebhook.parseWebhookEvents(payload)
  }

  private paginationBody(params: QueryParams): Record<string, unknown> {
    const offset =
      ((params.page ?? 1) - 1) * Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    return {
      ReturnCount: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
      Offset: offset,
      ...(params.updatedAfter && {
        IssueDateFrom: params.updatedAfter.toISOString().split('T')[0],
      }),
    }
  }

  // --- Organization ---

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new QuickFileClient(credentials)
    const res = await client.post<QuickFileSingleResponse<QuickFileAccountDetails>>(
      'system/getaccountdetails',
      {
        SearchParameters: {
          ReturnVariables: [
            'CompanyName',
            'CompanyNumber',
            'Address',
            'CountryIso',
            'BaseCurrency',
            'VatRegNumber',
            'Web',
            'Tel',
            'BusinessType',
            'YearEndDate',
          ],
        },
      },
    )
    const details = res.payload?.Body ?? {}
    return transformOrganization(details as QuickFileAccountDetails)
  }

  // --- Invoices ---

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new QuickFileClient(credentials)
    const res = await client.post<QuickFileListResponse<QuickFileInvoice>>('invoice/search', {
      SearchParameters: {
        InvoiceType: 'INVOICE',
        ...this.paginationBody(params),
        ShowNetAmount: true,
        ShowVatAmount: true,
      },
    })
    return (res.payload?.Body?.Record ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new QuickFileClient(credentials)
    const res = await client.post<QuickFileSingleResponse<{ InvoiceData: QuickFileInvoice }>>(
      'invoice/get',
      { InvoiceID: Number(id) },
    )
    const data = res.payload?.Body?.InvoiceData ?? ({ InvoiceID: Number(id) } as QuickFileInvoice)
    return transformInvoice(data)
  }

  async createInvoice(credentials: Credentials, data: Partial<Invoice>): Promise<Invoice> {
    const client = new QuickFileClient(credentials)
    const res = await client.post<QuickFileSingleResponse<{ InvoiceData: QuickFileInvoice }>>(
      'invoice/create',
      { InvoiceData: untransformInvoice(data) },
    )
    const created = res.payload?.Body?.InvoiceData ?? ({ InvoiceID: 0 } as QuickFileInvoice)
    return transformInvoice(created)
  }

  // --- Bills (Purchase Invoices) ---

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const client = new QuickFileClient(credentials)
    const res = await client.post<QuickFileListResponse<QuickFilePurchase>>('purchase/search', {
      SearchParameters: {
        ...this.paginationBody(params),
        ShowNetAmount: true,
        ShowVatAmount: true,
      },
    })
    return (res.payload?.Body?.Record ?? []).map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new QuickFileClient(credentials)
    const res = await client.post<QuickFileSingleResponse<{ PurchaseData: QuickFilePurchase }>>(
      'purchase/get',
      { PurchaseID: Number(id) },
    )
    const data =
      res.payload?.Body?.PurchaseData ?? ({ PurchaseID: Number(id) } as QuickFilePurchase)
    return transformBill(data)
  }

  // --- Contacts (Clients + Suppliers) ---

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const client = new QuickFileClient(credentials)
    const pagination = this.paginationBody(params)
    const [clientRes, supplierRes] = await Promise.all([
      client.post<QuickFileListResponse<QuickFileClientModel>>('client/search', {
        SearchParameters: pagination,
      }),
      client.post<QuickFileListResponse<QuickFileSupplier>>('supplier/search', {
        SearchParameters: pagination,
      }),
    ])
    const clients = (clientRes.payload?.Body?.Record ?? []).map(transformClient)
    const suppliers = (supplierRes.payload?.Body?.Record ?? []).map(transformSupplier)
    return [...clients, ...suppliers]
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new QuickFileClient(credentials)
    if (id.startsWith('supp_')) {
      const suppId = Number(id.slice(5))
      const res = await client.post<QuickFileSingleResponse<{ SupplierData: QuickFileSupplier }>>(
        'supplier/get',
        { SupplierID: suppId },
      )
      const data = res.payload?.Body?.SupplierData ?? ({ SupplierID: suppId } as QuickFileSupplier)
      return transformSupplier(data)
    }
    const clientId = Number(id.startsWith('cust_') ? id.slice(5) : id)
    const res = await client.post<QuickFileSingleResponse<{ ClientData: QuickFileClientModel }>>(
      'client/get',
      { ClientID: clientId },
    )
    const data = res.payload?.Body?.ClientData ?? ({ ClientID: clientId } as QuickFileClientModel)
    return transformClient(data)
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const client = new QuickFileClient(credentials)
    if (data.isSupplier && !data.isCustomer) {
      const res = await client.post<QuickFileSingleResponse<{ SupplierData: QuickFileSupplier }>>(
        'supplier/create',
        {
          SupplierData: {
            CompanyName: data.companyName ?? data.name,
            FirstName: data.firstName,
            Surname: data.lastName,
            VatNumber: data.taxNumber,
            Email: data.emails?.[0]?.email,
            Telephone: data.telephones?.[0]?.telephone,
            AddressLine1: data.billingAddress?.address1,
            Town: data.billingAddress?.city,
            Postcode: data.billingAddress?.postalCode,
            CountryISO: data.billingAddress?.country,
          },
        },
      )
      const created = res.payload?.Body?.SupplierData ?? ({ SupplierID: 0 } as QuickFileSupplier)
      return transformSupplier(created)
    }
    const res = await client.post<QuickFileSingleResponse<{ ClientData: QuickFileClientModel }>>(
      'client/create',
      {
        ClientData: {
          CompanyName: data.companyName ?? data.name,
          FirstName: data.firstName,
          Surname: data.lastName,
          VatNumber: data.taxNumber,
          DefaultCurrency: data.currency,
          Email: data.emails?.[0]?.email,
          Telephone: data.telephones?.[0]?.telephone,
          AddressLine1: data.billingAddress?.address1,
          Town: data.billingAddress?.city,
          Postcode: data.billingAddress?.postalCode,
          CountryISO: data.billingAddress?.country,
        },
      },
    )
    const created = res.payload?.Body?.ClientData ?? ({ ClientID: 0 } as QuickFileClientModel)
    return transformClient(created)
  }

  // --- Accounts (Nominal Ledgers) ---

  async listAccounts(credentials: Credentials, _params: QueryParams): Promise<Account[]> {
    const client = new QuickFileClient(credentials)
    const res = await client.post<QuickFileLedgerResponse<QuickFileNominalLedger>>(
      'ledger/getnominalledgers',
      {
        SearchParameters: {
          StartNominalCode: 1,
          EndNominalCode: 9999,
          ReturnFullDescription: true,
        },
      },
    )
    const ledgers = res.payload?.Body?.Nominals?.Nominal ?? []
    return ledgers.map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new QuickFileClient(credentials)
    const code = Number(id)
    const res = await client.post<QuickFileLedgerResponse<QuickFileNominalLedger>>(
      'ledger/getnominalledgers',
      {
        SearchParameters: {
          StartNominalCode: code,
          EndNominalCode: code,
          ReturnFullDescription: true,
        },
      },
    )
    const ledgers = res.payload?.Body?.Nominals?.Nominal ?? []
    const ledger = ledgers[0] ?? ({ NominalCode: code } as QuickFileNominalLedger)
    return transformAccount(ledger)
  }

  // --- Credit Memos ---
  //
  // A QuickFile credit note is an INVOICE of negative value; there is no
  // credit-note endpoint or InvoiceType (see ./transform/creditmemo.ts for the
  // citations). Both methods read the documented response envelope, which is
  // keyed by the method name ({ "Invoice_Search": { Header, Body } }), not
  // `payload` — from the vendor's JSON samples (POST
  // https://api.quickfile.co.uk/GetJsonSample/Invoice_Search/1_2 and
  // …/Invoice_Get/1_2) and a user's live response in
  // https://community.quickfile.co.uk/t/16824.

  /**
   * POST 1_2/invoice/search (https://api.quickfile.co.uk/d/v1_2/Invoice_Search).
   *
   * Mandatory SearchParameters: ReturnCount (int, 1–200), Offset, OrderResultsBy
   * (InvoiceNumber | IssueDate | ClientName | Total), OrderDirection (ASC |
   * DESC) and InvoiceType (INVOICE | ESTIMATE | RECURRING). Offset is a ROW
   * offset: "call again with the same search options but add Offset set to the
   * total number of records you have retrieved so far ... Once your running
   * total reaches RecordsetCount then you know you've got everything"
   * (https://community.quickfile.co.uk/t/4234). The response Body carries
   * `RecordsetCount` (total matches), `ReturnCount` (this page) and `Record[]`,
   * which is absent when nothing matched (https://community.quickfile.co.uk/t/2500).
   *
   * `Record` is a bare object, not an array, when one row matched
   * (https://community.quickfile.co.uk/t/16824), so it goes through asArray.
   *
   * There is no credit-note filter, but Invoice_Search documents an amount
   * range (`AmountFrom` / `AmountTo`, "double"), and the community answer to
   * "list my credit notes" is an invoice search whose amount range ends at
   * 0 (https://community.quickfile.co.uk/t/5264). So `AmountTo: 0` is sent
   * and the search returns non-positive invoices only; no `AmountFrom` is
   * sent, since any lower bound would be a guess. Whether the bound is
   * inclusive is not documented, so each page is still filtered here to the
   * strictly negative ones (a zero-value invoice is not a credit note). A
   * filtered page can therefore be short and still not be the last, so
   * `hasMore` is reported from the search page's own position against
   * `RecordsetCount`, and `totalCount` is not reported.
   *
   * `updatedAfter` is not sent: Invoice_Search has no modified-date filter,
   * and IssueDateFrom would drop a note issued before the watermark but
   * changed after it. Serving the unfiltered set is a superset, never a loss.
   */
  async listCreditMemos(credentials: Credentials, params: QueryParams): Promise<CreditMemo[]> {
    const client = new QuickFileClient(credentials)
    const size = Math.min(
      Math.max(1, Math.floor(params.limit ?? DEFAULT_PAGE_SIZE)),
      INVOICE_SEARCH_MAX_RETURN,
    )
    const offset = pageOffset(params, size)
    const res = await client.post<QuickFileMethodResponse<QuickFileSearchBody>>('invoice/search', {
      SearchParameters: {
        ReturnCount: size,
        Offset: offset,
        OrderResultsBy: 'InvoiceNumber',
        OrderDirection: 'ASC',
        InvoiceType: 'INVOICE',
        AmountTo: 0,
        AdditionalParameters: { ShowVatAmount: true },
      },
    })
    const body = res?.Invoice_Search?.Body
    const total = count(body?.RecordsetCount)
    if (!body || total === undefined) {
      throw badGateway(
        'QuickFile invoice/search did not return the documented { Invoice_Search: { Body: { RecordsetCount } } } envelope',
      )
    }
    const rows = asArray(body.Record)
    reportUpstreamPage(params, {
      hasMore: offset + rows.length < total && rows.length > 0,
      ...(params.limit !== undefined && size < params.limit && { pageSize: size }),
    })
    return rows.filter(isCreditNote).map(transformCreditMemo)
  }

  /**
   * POST 1_2/invoice/get (https://api.quickfile.co.uk/d/v1_2/Invoice_Get),
   * Body `{ InvoiceID }` (int), answered with `Invoice_Get.Body.InvoiceDetails`.
   * An invoice that is not negative-value is not a credit note: 404.
   */
  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const invoiceId = Number(id)
    if (!Number.isSafeInteger(invoiceId) || invoiceId <= 0) {
      throw notFound(`QuickFile credit note ids are positive integer InvoiceIDs (got "${id}")`)
    }
    const client = new QuickFileClient(credentials)
    const res = await client.post<
      QuickFileMethodResponse<{ InvoiceDetails?: QuickFileInvoiceDetails }>
    >('invoice/get', { InvoiceID: invoiceId })
    const details = res?.Invoice_Get?.Body?.InvoiceDetails
    if (!details || details.InvoiceID == null) {
      throw badGateway(
        'QuickFile invoice/get did not return the documented { Invoice_Get: { Body: { InvoiceDetails } } } envelope',
      )
    }
    if (!isCreditNote(details)) {
      throw notFound(`QuickFile invoice ${id} is not a credit note (a negative-value invoice)`)
    }
    return transformCreditMemo(details)
  }
}
