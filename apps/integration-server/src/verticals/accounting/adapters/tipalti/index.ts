import { toCalendarDate } from '../shared/transform'
/**
 * Tipalti accounting adapter.
 *
 * Supported resources:
 *  - Organization (payer entity)
 *  - Contacts    (payees / vendors)
 *  - Bills       (invoices submitted by payees for payment)
 *  - Invoices    (same wire — Tipalti invoice = AP bill)
 *  - Accounts    (GL accounts)
 *  - Transactions (payments disbursed to payees)
 *  - TaxRates    (tax codes — GET /api/v1/tax-codes)
 *
 * Auth: OAuth 2.0 client-credentials (machine-to-machine) — no user-delegated
 *       redirect flow. Customers supply clientId + clientSecret + environment
 *       via the Connect Link form; see auth.ts.
 *
 * Token URL: https://sso.tipalti.com/connect/token  (prod)
 *            https://sso.sandbox.tipalti.com/connect/token  (sandbox)
 * API base : https://api-p.tipalti.com/api/v1  (prod)
 *            https://api-sb.tipalti.com/api/v1  (sandbox)
 *
 * Docs: https://documentation.tipalti.com/docs/getting-started
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: creditmemo  — Tipalti has no credit memo concept; AP is payee-driven (no AR credit workflow)
 * Unavailable: expense     — Tipalti has no employee expense management endpoints in REST API v1
 * Unavailable: journal     — Tipalti has no journal-entry endpoints; it syncs to external GL systems
 * Unavailable: order       — Tipalti has no general-order endpoints in REST API v1
 * Unavailable: purchaseorder — No /purchase-orders endpoint; procurement flow is invoice-based
 * Unavailable: salesorder  — Tipalti is AP/payouts only; no sales-order concept
 */

import type { AccountingAdapter, Credentials, QueryParams } from '../../adapter/interface'
import {
  connectionScope,
  cursorPagerKey,
  pageByCursor,
  reportUpstreamPage,
  type CredentialField,
} from '@opensteward/shared'
import type { Invoice } from '../../schema/invoice'
import type { Bill } from '../../schema/bill'
import type { Contact } from '../../schema/contact'
import type { Account } from '../../schema/account'
import type { Organization } from '../../schema/organization'
import type { Transaction } from '../../schema/transaction'
import type { TaxRate } from '../../schema/taxrate'

import {
  TIPALTI_CREDENTIAL_FIELDS,
  environmentOf,
  exchangeTipaltiCredentials,
  refreshTipaltiCredentials,
} from './auth'
import { TipaltiClient, type TipaltiPage } from './client'
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  PAYEES_PATH,
  PAYMENTS_PATH,
  INVOICES_PATH,
  GL_ACCOUNTS_PATH,
  ENTITIES_PATH,
  TAX_CODES_PATH,
} from './constants'

import { transformInvoice, type TipaltiInvoice } from './transform/invoice'
import { transformBill } from './transform/bill'
import { transformPayee, type TipaltiPayee } from './transform/contact'
import { transformAccount, type TipaltiGlAccount } from './transform/account'
import { transformOrganization, type TipaltiEntity } from './transform/organization'
import { transformTransaction, type TipaltiPayment } from './transform/transaction'
import { transformTaxCode, type TipaltiTaxCode } from './transform/taxrate'

// ── Pagination helpers ────────────────────────────────────────────────────────

/**
 * Pager scope for one connection: the environment and OAuth client it was
 * made with, plus the fingerprint `connectionScope` takes of its token — never
 * the token itself. Client-credentials tokens have no refresh token, so a
 * re-minted token starts a new walk: one re-walk, nothing worse.
 */
function pagerScope(credentials: Credentials): string {
  const extra = (credentials.extra ?? {}) as Record<string, unknown>
  const clientId = typeof extra.clientId === 'string' ? extra.clientId : ''
  return connectionScope(`tipalti:${environmentOf(credentials)}:${clientId}`, credentials)
}

/**
 * Where one upstream page starts: the `page-cursor` to send for it, and how
 * many rows of the walk come before it (so a page knows how far the walk has
 * got without trusting every earlier page to have been full).
 */
interface PageStart {
  token: string
  offset: number
}

/**
 * The start of the page after this one, or undefined when this page is the
 * last. `walked` counts the rows served up to and including this page.
 *
 * `hasNextPage` "Indicates whether there is another page or not"
 * (https://documentation.tipalti.com/reference/pagination-1), so false ends
 * the walk even if a stale `nextPageCursor` comes with it. Anything that says
 * there is more — `hasNextPage: true`, or, where the spec's nullable `pageInfo`
 * is missing, a `totalCount` above the rows walked — but gives no cursor to
 * reach it cannot be followed. Ending there would report the end of a
 * truncated collection, which the sync worker would then mark complete, so it
 * throws instead.
 */
function nextPageStart(
  path: string,
  res: TipaltiPage<unknown>,
  walked: number,
): PageStart | undefined {
  const info = res.pageInfo ?? undefined
  if (info?.hasNextPage === false) return undefined
  const token = info?.nextPageCursor || undefined
  if (token !== undefined) return { token, offset: walked }
  const total = typeof res.totalCount === 'number' ? res.totalCount : undefined
  if (info?.hasNextPage === true || (total !== undefined && walked < total))
    throw new Error(
      `Tipalti: ${path} reported more rows (hasNextPage ${String(info?.hasNextPage)}, ` +
        `totalCount ${String(total)}, ${walked} served) with no nextPageCursor to continue from`,
    )
  return undefined
}

/**
 * The caller's page `page` of one cursor-paged list, at `limit`.
 *
 * Every list endpoint takes `page-size` and `page-cursor` and answers
 * { totalCount, pageInfo: { hasNextPage, nextPageCursor }, items }
 * (e.g. https://documentation.tipalti.com/reference/get_api-v1-invoices:
 * page-cursor "A cursor for pagination across multiple pages of results.",
 * nextPageCursor "Page cursor to use on the next API request call to retrieve
 * next items."). One upstream page is one caller page, so `pageByCursor`
 * walks the chain to page `page` and remembers where each page starts. The
 * lists used to read `params.cursor`, which the router never sets, so page 2
 * was page 1 again.
 *
 * The size is the caller's limit, clamped to the documented maximum
 * (https://documentation.tipalti.com/reference/pagination-1: "Default value:
 * 100 Maximum value: 200"); a clamped page reports the size it sent, so it is
 * judged at it. `totalCount` is "Total count of items of a resource type or
 * as requested when using a filter", so it is reported as the total.
 */
async function cursorList<R>(
  credentials: Credentials,
  params: QueryParams,
  path: string,
): Promise<R[]> {
  const client = new TipaltiClient(credentials)
  const limit = params.limit ?? DEFAULT_PAGE_SIZE
  const size = Math.min(limit, MAX_PAGE_SIZE)
  const updatedAfter =
    params.updatedAfter instanceof Date ? params.updatedAfter.toISOString() : undefined
  let totalCount: number | undefined
  const { items, hasMore } = await pageByCursor<R, PageStart>(
    cursorPagerKey(pagerScope(credentials), path, { limit: size, updatedAfter }),
    params.page,
    async (cursor) => {
      const res = await client.list<R>(path, {
        pageSize: size,
        ...(cursor !== undefined ? { pageCursor: cursor.token } : {}),
        ...(updatedAfter !== undefined ? { updatedAfter } : {}),
      })
      totalCount = typeof res.totalCount === 'number' ? res.totalCount : undefined
      const rows = res.items ?? []
      return { items: rows, next: nextPageStart(path, res, (cursor?.offset ?? 0) + rows.length) }
    },
  )
  reportUpstreamPage(params, {
    hasMore,
    ...(totalCount !== undefined ? { totalCount } : {}),
    ...(size < limit ? { pageSize: size } : {}),
  })
  return items
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export class TipaltiAdapter implements AccountingAdapter {
  readonly platform = 'tipalti'
  readonly version = '0.1.0'
  /**
   * Every list endpoint's documented `page-size` ceiling
   * (https://documentation.tipalti.com/reference/pagination-1: "Maximum
   * value: 200"), and every list pages by cursor at the size it is asked for.
   */
  readonly capabilities = { maxPageSize: MAX_PAGE_SIZE }

  // ── Auth (client-credentials — no redirect flow) ──────────────────────────

  getAuthUrl(_state: string, _overrideScopes?: string[]): string {
    throw new Error(
      'Tipalti uses OAuth2 client credentials; submit them via the Connect Link form.',
    )
  }

  async exchangeCode(_code: string, _redirectUri: string): Promise<Credentials> {
    throw new Error('Tipalti uses OAuth2 client credentials; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return TIPALTI_CREDENTIAL_FIELDS
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return exchangeTipaltiCredentials(fields)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return refreshTipaltiCredentials(credentials)
  }

  // ── Organization ──────────────────────────────────────────────────────────

  async getOrganization(credentials: Credentials): Promise<Organization> {
    const client = new TipaltiClient(credentials)
    const res = await client.get<TipaltiEntity>(`${ENTITIES_PATH}/current`)
    return transformOrganization(res ?? {})
  }

  // ── Invoices (Tipalti invoice = AP bill) ─────────────────────────────────

  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const rows = await cursorList<TipaltiInvoice>(credentials, params, INVOICES_PATH)
    return rows.map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const client = new TipaltiClient(credentials)
    const res = await client.get<TipaltiInvoice>(`${INVOICES_PATH}/${encodeURIComponent(id)}`)
    return transformInvoice(res ?? ({ id } as TipaltiInvoice))
  }

  async createInvoice(credentials: Credentials, data: Partial<Invoice>): Promise<Invoice> {
    const client = new TipaltiClient(credentials)
    const body: Record<string, unknown> = {
      invoiceNumber: data.invoiceNumber,
      payeeId: data.contactId,
      currency: data.currency,
      totalAmount: data.totalAmount,
      description: data.notes,
      invoiceDate: data.postedAt instanceof Date
        ? toCalendarDate(data.postedAt)
        : undefined,
      dueDate: data.dueAt instanceof Date
        ? toCalendarDate(data.dueAt)
        : undefined,
      lines: data.lineItems?.map((li, i) => ({
        lineNumber: i + 1,
        description: li.itemDescription,
        quantity: li.unitQuantity ?? 1,
        unitPrice: li.unitAmount,
        totalAmount: li.totalAmount,
        glAccountId: li.accountId,
      })),
    }
    const res = await client.post<TipaltiInvoice>(INVOICES_PATH, body)
    return transformInvoice(res)
  }

  async updateInvoice(
    credentials: Credentials,
    id: string,
    data: Partial<Invoice>,
  ): Promise<Invoice> {
    const client = new TipaltiClient(credentials)
    const body: Record<string, unknown> = {
      invoiceNumber: data.invoiceNumber,
      currency: data.currency,
      totalAmount: data.totalAmount,
      description: data.notes,
      invoiceDate: data.postedAt instanceof Date
        ? toCalendarDate(data.postedAt)
        : undefined,
      dueDate: data.dueAt instanceof Date
        ? toCalendarDate(data.dueAt)
        : undefined,
    }
    const res = await client.patch<TipaltiInvoice>(`${INVOICES_PATH}/${encodeURIComponent(id)}`, body)
    return transformInvoice(res)
  }

  // ── Bills (same wire as invoices in Tipalti) ──────────────────────────────

  async listBills(credentials: Credentials, params: QueryParams): Promise<Bill[]> {
    const rows = await cursorList<TipaltiInvoice>(credentials, params, INVOICES_PATH)
    return rows.map(transformBill)
  }

  async getBill(credentials: Credentials, id: string): Promise<Bill> {
    const client = new TipaltiClient(credentials)
    const res = await client.get<TipaltiInvoice>(`${INVOICES_PATH}/${encodeURIComponent(id)}`)
    return transformBill(res ?? ({ id } as TipaltiInvoice))
  }

  async createBill(credentials: Credentials, data: Partial<Bill>): Promise<Bill> {
    const client = new TipaltiClient(credentials)
    const body: Record<string, unknown> = {
      invoiceNumber: data.billNumber,
      payeeId: data.contactId,
      currency: data.currency,
      totalAmount: data.totalAmount,
      description: data.notes,
      invoiceDate: data.postedAt instanceof Date
        ? toCalendarDate(data.postedAt)
        : undefined,
      dueDate: data.dueAt instanceof Date
        ? toCalendarDate(data.dueAt)
        : undefined,
      lines: data.lineItems?.map((li, i) => ({
        lineNumber: i + 1,
        description: li.itemDescription,
        quantity: li.unitQuantity ?? 1,
        unitPrice: li.unitAmount,
        totalAmount: li.totalAmount,
        glAccountId: li.accountId,
      })),
    }
    const res = await client.post<TipaltiInvoice>(INVOICES_PATH, body)
    return transformBill(res)
  }

  async updateBill(
    credentials: Credentials,
    id: string,
    data: Partial<Bill>,
  ): Promise<Bill> {
    const client = new TipaltiClient(credentials)
    const body: Record<string, unknown> = {
      invoiceNumber: data.billNumber,
      currency: data.currency,
      totalAmount: data.totalAmount,
      description: data.notes,
      invoiceDate: data.postedAt instanceof Date
        ? toCalendarDate(data.postedAt)
        : undefined,
      dueDate: data.dueAt instanceof Date
        ? toCalendarDate(data.dueAt)
        : undefined,
    }
    const res = await client.patch<TipaltiInvoice>(`${INVOICES_PATH}/${encodeURIComponent(id)}`, body)
    return transformBill(res)
  }

  // ── Contacts (payees / vendors) ───────────────────────────────────────────

  async listContacts(credentials: Credentials, params: QueryParams): Promise<Contact[]> {
    const rows = await cursorList<TipaltiPayee>(credentials, params, PAYEES_PATH)
    return rows.map(transformPayee)
  }

  async getContact(credentials: Credentials, id: string): Promise<Contact> {
    const client = new TipaltiClient(credentials)
    const res = await client.get<TipaltiPayee>(`${PAYEES_PATH}/${encodeURIComponent(id)}`)
    return transformPayee(res ?? ({ id } as TipaltiPayee))
  }

  async createContact(credentials: Credentials, data: Partial<Contact>): Promise<Contact> {
    const client = new TipaltiClient(credentials)
    const body: Record<string, unknown> = {
      name: data.name ?? data.companyName,
      companyName: data.companyName,
      currency: data.currency,
      taxId: data.taxNumber,
      contact: {
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.emails?.[0]?.email,
        phone: data.telephones?.[0]?.telephone,
      },
      address: data.billingAddress
        ? {
            line1: data.billingAddress.address1,
            line2: data.billingAddress.address2,
            city: data.billingAddress.city,
            state: data.billingAddress.region,
            zip: data.billingAddress.postalCode,
            country: data.billingAddress.country,
          }
        : undefined,
    }
    const res = await client.post<TipaltiPayee>(PAYEES_PATH, body)
    return transformPayee(res)
  }

  async updateContact(
    credentials: Credentials,
    id: string,
    data: Partial<Contact>,
  ): Promise<Contact> {
    const client = new TipaltiClient(credentials)
    const body: Record<string, unknown> = {
      name: data.name ?? data.companyName,
      companyName: data.companyName,
      currency: data.currency,
      taxId: data.taxNumber,
      contact: {
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.emails?.[0]?.email,
        phone: data.telephones?.[0]?.telephone,
      },
    }
    const res = await client.patch<TipaltiPayee>(`${PAYEES_PATH}/${encodeURIComponent(id)}`, body)
    return transformPayee(res)
  }

  // ── Accounts (GL accounts) ────────────────────────────────────────────────

  async listAccounts(credentials: Credentials, params: QueryParams): Promise<Account[]> {
    const rows = await cursorList<TipaltiGlAccount>(credentials, params, GL_ACCOUNTS_PATH)
    return rows.map(transformAccount)
  }

  async getAccount(credentials: Credentials, id: string): Promise<Account> {
    const client = new TipaltiClient(credentials)
    const res = await client.get<TipaltiGlAccount>(`${GL_ACCOUNTS_PATH}/${encodeURIComponent(id)}`)
    return transformAccount(res ?? ({ id } as TipaltiGlAccount))
  }

  // ── Transactions (payments) ───────────────────────────────────────────────

  async listTransactions(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Transaction[]> {
    const rows = await cursorList<TipaltiPayment>(credentials, params, PAYMENTS_PATH)
    return rows.map(transformTransaction)
  }

  async getTransaction(credentials: Credentials, id: string): Promise<Transaction> {
    const client = new TipaltiClient(credentials)
    const res = await client.get<TipaltiPayment>(`${PAYMENTS_PATH}/${encodeURIComponent(id)}`)
    return transformTransaction(res ?? ({ id } as TipaltiPayment))
  }

  // ── Tax Rates (Tipalti tax codes — GET /api/v1/tax-codes) ────────────────

  async listTaxRates(credentials: Credentials, params: QueryParams): Promise<TaxRate[]> {
    const rows = await cursorList<TipaltiTaxCode>(credentials, params, TAX_CODES_PATH)
    return rows.map(transformTaxCode)
  }

  async getTaxRate(credentials: Credentials, id: string): Promise<TaxRate> {
    const client = new TipaltiClient(credentials)
    const res = await client.get<TipaltiTaxCode>(`${TAX_CODES_PATH}/${encodeURIComponent(id)}`)
    return transformTaxCode(res ?? ({ id } as TipaltiTaxCode))
  }
}
