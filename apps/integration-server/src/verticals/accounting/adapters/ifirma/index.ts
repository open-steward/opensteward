/**
 * iFirma accounting adapter.
 *
 * Auth: HMAC-SHA1 API key (symmetric key from the iFirma panel).
 * Credentials are stored as JSON: { login: string; apiKey: string }.
 *
 * Resources supported:
 *   - Organization (subscriber profile built from credentials.extra)
 *   - Invoices     (list + get + create)
 *   - Contacts     (list/search + get + create)
 *   - Expenses     (create only — no list endpoint in public API)
 *   - TaxRates     (list — EU VAT rates dictionary, key: PL for Polish rates)
 *   - CreditMemos  (create + get — corrective invoices; no list endpoint)
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: account      — no chart-of-accounts / general-ledger endpoint in iFirma public API
 * Unavailable: bill         — no vendor bill list/get endpoint; expense endpoints are write-only
 * Unavailable: journal      — no journal-entry endpoint in iFirma public API
 * Unavailable: order        — hub write-only endpoint (/hub/user/platform/.../orders/order); no list/get; different auth scheme
 * Unavailable: purchaseorder — not documented anywhere in iFirma public API
 * Unavailable: salesorder   — not documented anywhere in iFirma public API
 * Unavailable: transaction  — no payment/transaction list endpoint in iFirma public API
 */

import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import type { CredentialField } from '@opensteward/shared'
import { pageLocally } from '@opensteward/shared'
import type { Invoice } from '../../schema/invoice'
import type { Contact } from '../../schema/contact'
import type { Expense } from '../../schema/expense'
import type { Organization } from '../../schema/organization'
import type { TaxRate } from '../../schema/taxrate'
import type { CreditMemo } from '../../schema/creditmemo'

import { IfirmaClient } from './client'
import { KEY_NAME_FAKTURA, KEY_NAME_WYDATEK, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'
import {
  getAuthUrl,
  exchangeCode,
  refreshCredentials,
  encodeCredentials,
} from './auth'

import { transformInvoice, untransformInvoice, type IfirmaInvoice } from './transform/invoice'
import { transformContact, untransformContact, type IfirmaKontrahent } from './transform/contact'
import { transformExpense, untransformExpense, type IfirmaWydatek } from './transform/expense'
import { transformOrganization, type IfirmaAbonent } from './transform/organization'
import { transformTaxRate, type IfirmaStawkiVatWynik } from './transform/taxrate'
import {
  transformCreditMemo,
  untransformCreditMemo,
  type IfirmaKorekta,
} from './transform/creditmemo'

// ── Response envelope types ───────────────────────────────────────────────────

interface IfirmaResponse<T> {
  response: {
    Kod: number
    Informacja: string
    Wynik?: T
    Identyfikator?: string | number
  }
}

/**
 * The VAT-rate dictionary's response: documented with the rates directly in
 * `response`, and accepted inside a `Wynik` wrapper too (see listTaxRates).
 * `Kod` / `Informacja` are iFirma's error channel (https://api.ifirma.pl/faq/).
 */
interface IfirmaStawkiVatResponse {
  response?: Partial<IfirmaStawkiVatWynik> & {
    Kod?: number
    Informacja?: string
    Wynik?: IfirmaStawkiVatWynik
  }
}

/** The rates whose id, name or description contain `search`, ignoring case. */
function matchingSearch(rates: TaxRate[], search: string | undefined): TaxRate[] {
  const term = search?.trim().toLowerCase()
  if (!term) return rates
  return rates.filter((r) =>
    [r.id, r.name, r.description].some((f) => f?.toLowerCase().includes(term)),
  )
}

// ── Adapter config ────────────────────────────────────────────────────────────

type IfirmaAdapterConfig = Record<string, never>

// ── Credential form (Connect Link) ────────────────────────────────────────────

const CREDENTIAL_FIELDS: CredentialField[] = [
  {
    name: 'login',
    label: 'iFirma login (username)',
    type: 'text',
    placeholder: 'your@email.pl',
    helpText: 'Your ifirma.pl account username / email address.',
    required: true,
  },
  {
    name: 'apiKey',
    label: 'API key (hex)',
    type: 'password',
    placeholder: 'EAB0D8ACF3308F3B...',
    helpText:
      'Hexadecimal API key from the ifirma.pl panel → Settings → API. ' +
      'Activate the API first if you have not done so already.',
    required: true,
  },
]

// ── Adapter class ─────────────────────────────────────────────────────────────

export class IfirmaAdapter implements AccountingAdapter {
  readonly platform = 'ifirma'
  readonly version = '0.1.0'
  /** Honours `params.search`; see AdapterCapabilities. Declared so the
   *  router can refuse the parameter on adapters that would drop it. */
  readonly capabilities = { search: true }

  constructor(_config?: IfirmaAdapterConfig) {}

  // ── Auth stubs (api_key — no OAuth) ────────────────────────────────────────

  getAuthUrl(state: string): string {
    return getAuthUrl(state)
  }

  async exchangeCode(code: string, _redirectUri: string): Promise<Credentials> {
    return exchangeCode(code)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return refreshCredentials(credentials)
  }

  // ── Connect Link (direct credential entry) ─────────────────────────────────

  credentialFields(): CredentialField[] {
    return CREDENTIAL_FIELDS
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    const login = (fields['login'] ?? '').trim()
    const apiKey = (fields['apiKey'] ?? '').trim()
    if (!login) throw new Error('iFirma login is required.')
    if (!apiKey) throw new Error('API key is required.')
    return encodeCredentials(login, apiKey)
  }

  // ── Pagination helpers ──────────────────────────────────────────────────────

  private paginationParams(params: QueryParams): Record<string, unknown> {
    const limit = Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE)
    const page = params.page ?? 1
    const out: Record<string, unknown> = {
      iloscNaStronie: limit,
      strona: page,
    }
    if (params.updatedAfter) {
      out['dataOd'] = params.updatedAfter.toISOString().split('T')[0]
    } else {
      // dataOd is required — default to 1 year ago
      const yearAgo = new Date()
      yearAgo.setFullYear(yearAgo.getFullYear() - 1)
      out['dataOd'] = yearAgo.toISOString().split('T')[0]
    }
    return out
  }

  // ── Organization ────────────────────────────────────────────────────────────

  async getOrganization(credentials: Credentials): Promise<Organization> {
    // iFirma does not expose a company-info endpoint in the public API.
    // Construct from the stored credentials.extra or return minimal data.
    const extra = (credentials.extra ?? {}) as Record<string, unknown>
    const raw: IfirmaAbonent = {
      Login: (extra['login'] as string | undefined) ?? '',
      NazwaFirmy: extra['company'] as string | undefined,
      NIP: extra['nip'] as string | undefined,
    }
    return transformOrganization(raw)
  }

  // ── Invoices ────────────────────────────────────────────────────────────────

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const client = new IfirmaClient(credentials)
    const res = await client.get<IfirmaResponse<IfirmaInvoice[]>>(
      'faktury.json',
      KEY_NAME_FAKTURA,
      this.paginationParams(params),
    )
    const items = Array.isArray(res.response?.Wynik) ? res.response.Wynik : []
    return items.map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new IfirmaClient(credentials)
    const res = await client.get<IfirmaResponse<IfirmaInvoice[]>>(
      `faktura/${id}.json`,
      KEY_NAME_FAKTURA,
    )
    const items = Array.isArray(res.response?.Wynik) ? res.response.Wynik : []
    if (!items[0]) throw new Error(`Invoice ${id} not found`)
    return transformInvoice(items[0])
  }

  async createInvoice(credentials: Credentials, data: Partial<Invoice>): Promise<Invoice> {
    const client = new IfirmaClient(credentials)
    const body = untransformInvoice(data)
    const res = await client.post<IfirmaResponse<never>>(
      'fakturakraj.json',
      KEY_NAME_FAKTURA,
      body,
    )
    const newId = res.response?.Identyfikator
    if (!newId) throw new Error('iFirma did not return an invoice ID after creation')
    // Fetch the created invoice to return canonical form
    return this.getInvoice(credentials, String(newId))
  }

  // ── Contacts ────────────────────────────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    // iFirma search endpoint: GET /iapi/kontrahenci/{phrase}.json
    // With empty string search we pass a dot to get all contractors.
    const search = (params.search as string | undefined) ?? '.'
    const client = new IfirmaClient(credentials)
    const res = await client.get<IfirmaResponse<IfirmaKontrahent[]>>(
      `kontrahenci/${encodeURIComponent(search)}.json`,
      KEY_NAME_FAKTURA,
      {
        iloscNaStronie: Math.min(params.limit ?? DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
        strona: params.page ?? 1,
      },
    )
    const items = Array.isArray(res.response?.Wynik) ? res.response.Wynik : []
    return items.map(transformContact)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new IfirmaClient(credentials)
    const res = await client.get<IfirmaResponse<IfirmaKontrahent[]>>(
      `kontrahenci/id/${encodeURIComponent(id)}.json`,
      KEY_NAME_FAKTURA,
    )
    const items = Array.isArray(res.response?.Wynik) ? res.response.Wynik : []
    if (!items[0]) throw new Error(`Contact ${id} not found`)
    return transformContact(items[0])
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const client = new IfirmaClient(credentials)
    const body = untransformContact(data)
    const res = await client.post<IfirmaResponse<string>>(
      'kontrahenci.json',
      KEY_NAME_FAKTURA,
      body,
    )
    const newId = res.response?.Wynik ?? res.response?.Identyfikator
    if (!newId) throw new Error('iFirma did not return a contact ID after creation')
    return this.getContact(credentials, String(newId))
  }

  // ── Tax Rates ───────────────────────────────────────────────────────────────

  /**
   * Returns VAT rates for Poland (PL) from iFirma's EU VAT-rates dictionary.
   * Endpoint: GET /iapi/slownik/stawki_vat/PL.json  (key: faktura)
   *
   * https://api.ifirma.pl/stawki-vat-w-krajach-unii-europejskiej/ documents
   * no paging parameter (only an optional `data` date): the response is every
   * rate for the country, so the caller's page is cut from it locally.
   *
   * The documented response puts KodKraju / NazwaKraju / StawkiVat directly
   * in `response`, with no Kod / Informacja / Wynik wrapper. Reading only
   * `Wynik` listed no rates for that shape; the wrapper, which the invoice and
   * contractor endpoints use, is still accepted.
   *
   * A non-zero `Kod` is an error (https://api.ifirma.pl/faq/: 0 is "poprawne
   * przetworzenie", 100 a technical problem, 400-403 authorisation, 500 "brak
   * uprawnień do danego zasobu"). Its body holds no rates, and cut locally it
   * would report an empty, complete collection, so it is thrown instead.
   *
   * The adapter declares `search`, so the term is applied here, before the
   * cut: the total reported is the number of rates that match.
   */
  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const client = new IfirmaClient(credentials)
    const res = await client.get<IfirmaStawkiVatResponse>(
      'slownik/stawki_vat/PL.json',
      KEY_NAME_FAKTURA,
    )
    const kod = res.response?.Kod
    if (typeof kod === 'number' && kod !== 0) {
      const info = res.response?.Informacja
      throw Object.assign(
        new Error(
          `iFirma GET slownik/stawki_vat/PL.json answered Kod ${kod}` +
            `${info ? `: ${info}` : ''} (codes: https://api.ifirma.pl/faq/).`,
        ),
        { statusCode: 502, code: 'UPSTREAM_ERROR' },
      )
    }
    const body = res.response?.Wynik ?? res.response
    const rates = Array.isArray(body?.StawkiVat) ? body.StawkiVat : []
    const country = body?.KodKraju || 'PL'
    return pageLocally(
      matchingSearch(
        rates.map((r) => transformTaxRate(r, country)),
        params.search,
      ),
      params,
    )
  }

  // ── Expenses ────────────────────────────────────────────────────────────────

  async createExpense(credentials: Credentials, data: Partial<Expense>): Promise<Expense> {
    const client = new IfirmaClient(credentials)
    const body = untransformExpense(data)
    const res = await client.post<IfirmaResponse<never>>(
      'kosztdzialalnoscivat.json',
      KEY_NAME_WYDATEK,
      body,
    )
    const newId = res.response?.Identyfikator
    // iFirma has no GET for expenses — reconstruct from what we sent + new id
    const raw: IfirmaWydatek = {
      Identyfikator: newId,
      NumerFaktury: (body['NumerFaktury'] as string) ?? '',
      NazwaWydatku: (body['NazwaWydatku'] as string) ?? '',
      DataWystawienia: (body['DataWystawienia'] as string) ?? '',
      IdentyfikatorKontrahenta: (body['IdentyfikatorKontrahenta'] as string | undefined),
      KwotaNetto23: body['KwotaNetto23'] as number | undefined,
      KwotaVat23: body['KwotaVat23'] as number | undefined,
    }
    return transformExpense(raw)
  }

  // ── Credit Memos (corrective invoices) ──────────────────────────────────────

  /**
   * Returns a single corrective invoice by ID.
   * Endpoint: GET /iapi/fakturakraj/korekta/{id}.json  (key: faktura)
   * There is no list endpoint for corrective invoices in the iFirma public API.
   */
  async getCreditMemo(credentials: Credentials, id: string): Promise<CreditMemo> {
    const client = new IfirmaClient(credentials)
    const res = await client.get<IfirmaResponse<IfirmaKorekta[]>>(
      `fakturakraj/korekta/${encodeURIComponent(id)}.json`,
      KEY_NAME_FAKTURA,
    )
    const items = Array.isArray(res.response?.Wynik) ? res.response.Wynik : []
    if (!items[0]) throw new Error(`Credit memo ${id} not found`)
    return transformCreditMemo(items[0])
  }

  async createCreditMemo(
    credentials: Credentials,
    data: Partial<CreditMemo>,
  ): Promise<CreditMemo> {
    const client = new IfirmaClient(credentials)
    // The original invoice ID is required to create a corrective invoice.
    // Pass it via data.metadata.originalInvoiceId or fall back to data.id.
    const meta = (data.metadata ?? {}) as Record<string, unknown>
    const originalId =
      (meta['originalInvoiceId'] as string | undefined) ?? data.id ?? ''
    if (!originalId) throw new Error('originalInvoiceId is required to create a credit memo')
    const body = untransformCreditMemo(data)
    const res = await client.post<IfirmaResponse<never>>(
      `fakturakraj/korekta/${encodeURIComponent(originalId)}.json`,
      KEY_NAME_FAKTURA,
      body,
    )
    const newId = res.response?.Identyfikator
    if (!newId) throw new Error('iFirma did not return a credit memo ID after creation')
    return this.getCreditMemo(credentials, String(newId))
  }
}
