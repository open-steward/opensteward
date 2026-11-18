/**
 * Trolley adapter — payments vertical.
 *
 * Auth: access key + secret key, every request HMAC-SHA256 signed
 * (`Authorization: prsign ACCESS_KEY:SIGNATURE` + `X-PR-Timestamp`), see
 * client.ts. Docs: https://developers.trolley.com/api/ and the first-party
 * spec https://developers.trolley.com/openapi.yml.
 */

// ── Resource coverage ──────────────────────────────────────────────
// Available:   customer (recipients), payout (payments in batches), invoice
// Unavailable: charge — Trolley is a payout platform; no charge path exists in its API
// Unavailable: refund — no refund path exists in Trolley's API
// Unavailable: balance-transaction — Trolley /v1/balances returns a current account balance, not a transaction ledger
// Unavailable: dispute — Trolley is a payout platform with no dispute/chargeback concept
// Unavailable: payment-method — payment methods are nested as recipient accounts (/v1/recipients/{id}/accounts) with no flat list endpoint
// Unavailable: plan — Trolley has no subscription billing or plan objects
// Unavailable: subscription — Trolley has no subscription concept

import type { BaseAdapter, CredentialField, Credentials, QueryParams } from '@opensteward/shared'
import { connectionScope, pageByRows, reportUpstreamPage } from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Charge } from '../../schema/charge'
import type { Customer } from '../../schema/customer'
import type { Invoice } from '../../schema/invoice'
import type { Payout } from '../../schema/payout'
import type { Refund } from '../../schema/refund'
import type { WebhookEvent } from '../../schema/webhook'

import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from './constants'
import { CREDENTIAL_FIELDS, buildCredentials } from './auth'
import { TrolleyClient } from './client'
import { verifyTrolleyWebhook, parseTrolleyWebhookEvents } from './webhook'

import { transformCustomer, type RawTrolleyRecipient } from './transform/customer'
import { transformRefund, type RawTrolleyRefund } from './transform/refund'
import { transformPayout, type RawTrolleyPayout } from './transform/payout'
import { transformInvoice, type RawTrolleyInvoice } from './transform/invoice'

/** `meta` on every paged Trolley list: "Total number of pages in the result set." etc. */
interface TrolleyMeta {
  page?: number
  pages?: number
  records?: number
}

/**
 * The caller's 1-based page and its size, clamped to Trolley's documented
 * `pageSize` maximum of 1000.
 */
function pageRequest(params: QueryParams): { page: number; pageSize: number } {
  const asked = params.limit ?? DEFAULT_PAGE_SIZE
  const pageSize = Math.min(
    Math.max(Math.floor(Number.isFinite(asked) ? asked : 1), 1),
    MAX_PAGE_SIZE,
  )
  const page = params.page !== undefined && params.page >= 1 ? Math.floor(params.page) : 1
  return { page, pageSize }
}

/** Report where the result set ends, from Trolley's own `meta`. */
function reportMeta(
  params: QueryParams,
  page: number,
  pageSize: number,
  meta: TrolleyMeta | undefined,
): void {
  const m = meta ?? {}
  reportUpstreamPage(params, {
    ...(typeof m.pages === 'number' ? { hasMore: page < m.pages } : {}),
    ...(typeof m.records === 'number' ? { totalCount: m.records } : {}),
    pageSize,
  })
}

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

/**
 * Position in the flattened stream of payments: a page of batches to read
 * next, or a page of one batch's payments. Replayable: fetching it again
 * returns the same page.
 */
type PayoutCursor =
  | { kind: 'batches'; batchPage: number }
  | {
      kind: 'payments'
      batchPage: number
      batchIds: string[]
      moreBatches: boolean
      index: number
      paymentPage: number
    }

/** Whether a page is followed by another: `meta` when present, else a full page. */
function morePages(
  page: number,
  meta: TrolleyMeta | undefined,
  rows: number,
  size: number,
): boolean {
  if (meta && typeof meta.pages === 'number') return page < meta.pages
  return rows >= size
}

export class TrolleyAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'trolley'
  readonly version = '0.2.0'

  getAuthUrl(): string {
    throw new Error(
      'Trolley uses an access key and secret key; submit them via the Connect Link form.',
    )
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('Trolley uses an access key and secret key; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return CREDENTIAL_FIELDS
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return buildCredentials(fields)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyTrolleyWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseTrolleyWebhookEvents(payload)
  }

  private client(credentials: Credentials): TrolleyClient {
    return new TrolleyClient(credentials)
  }

  // ── Customers (Trolley recipients) ─────────────────────────────────────────

  /**
   * `GET /v1/recipients` — "You can retrieve details of your recipients by
   * sending a GET request to the /recipients endpoint." Query `page` ("The
   * page number (default: 1)") and `pageSize` ("Number of records in a page
   * (default: 10)"); response `{ ok, recipients, meta }`. `startDate`:
   * "Fetch records updated **after** this given date. (based on updatedAt
   * field) Date should be in ISO 8601 format." Rows are ordered by
   * `orderBy=createdAt` ("Order results by fields name , email , referenceId ,
   * payoutMethod , createdAt , updatedAt .") and `sortBy=asc` ("Sorting
   * direction asc or desc (default: desc )") so numbered pages stay stable.
   */
  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const { page, pageSize } = pageRequest(params)
    const res = await this.client(credentials).get<{
      recipients?: RawTrolleyRecipient[]
      meta?: TrolleyMeta
    }>('/recipients', {
      page,
      pageSize,
      orderBy: 'createdAt',
      sortBy: 'asc',
      startDate: params.updatedAfter ? params.updatedAfter.toISOString() : undefined,
    })
    reportMeta(params, page, pageSize, res.meta)
    return (res.recipients ?? []).map(transformCustomer)
  }

  /** `GET /v1/recipients/:id` → `{ ok, recipient }`. */
  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const res = await this.client(credentials).get<{ recipient?: RawTrolleyRecipient }>(
      `/recipients/${encodeURIComponent(id)}`,
    )
    if (!res.recipient) throw new Error(`Trolley returned no recipient for ${id}`)
    return transformCustomer(res.recipient)
  }

  // ── Charges and refunds: not in Trolley's API ──────────────────────────────

  async listCharges(_credentials: Credentials, _params: QueryParams): Promise<Charge[]> {
    throw notSupported(
      'Trolley cannot list charges: Trolley is a payout platform and its API (https://developers.trolley.com/openapi.yml) has no charge resource',
    )
  }

  async getCharge(_credentials: Credentials, _id: string): Promise<Charge> {
    throw notSupported(
      'Trolley cannot read charges: Trolley is a payout platform and its API (https://developers.trolley.com/openapi.yml) has no charge resource',
    )
  }

  async listRefunds(_credentials: Credentials, _params: QueryParams): Promise<Refund[]> {
    throw notSupported(
      'Trolley cannot list refunds: its API (https://developers.trolley.com/openapi.yml) has no refund resource',
    )
  }

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    const res = await this.client(credentials).post<{ data?: RawTrolleyRefund }>('/refunds', {
      chargeId: data.chargeId,
      amount: data.amount,
    })
    return transformRefund(res.data ?? {})
  }

  // ── Payouts (Trolley payments to recipients) ───────────────────────────────

  /**
   * Trolley has no flat list of payments: "You can retrieve all payments from
   * an existing batch by sending a GET request to the
   * /batches/:batch-id/payments endpoint." So walk `GET /v1/batches` (oldest
   * first: `orderBy=createdAt`, `sortBy=asc`, so new batches land at the end
   * and earlier rows keep their positions) and flatten each batch's payments,
   * both at the documented maximum `pageSize` of 1000, cutting the caller's
   * page out of the stream with pageByRows.
   */
  async listPayouts(credentials: Credentials, params: QueryParams): Promise<Payout[]> {
    const client = this.client(credentials)
    const key = `${connectionScope('trolley', credentials)}:payouts:batches=${MAX_PAGE_SIZE}:payments=${MAX_PAGE_SIZE}`
    const result = await pageByRows<Payout, PayoutCursor>(
      key,
      params,
      async (cursor) => {
        const c: PayoutCursor = cursor ?? { kind: 'batches', batchPage: 1 }
        if (c.kind === 'batches') {
          const res = await client.get<{ batches?: Array<{ id?: string }>; meta?: TrolleyMeta }>(
            '/batches',
            { page: c.batchPage, pageSize: MAX_PAGE_SIZE, orderBy: 'createdAt', sortBy: 'asc' },
          )
          const batches = res.batches ?? []
          const batchIds = batches.map((b) => {
            if (typeof b.id !== 'string' || b.id === '') throw new Error('Trolley batch has no id')
            return b.id
          })
          const moreBatches = morePages(c.batchPage, res.meta, batches.length, MAX_PAGE_SIZE)
          if (batchIds.length === 0) {
            return {
              items: [],
              next: moreBatches ? { kind: 'batches', batchPage: c.batchPage + 1 } : undefined,
            }
          }
          return {
            items: [],
            next: {
              kind: 'payments',
              batchPage: c.batchPage,
              batchIds,
              moreBatches,
              index: 0,
              paymentPage: 1,
            },
          }
        }
        const batchId = c.batchIds[c.index]!
        const res = await client.get<{ payments?: RawTrolleyPayout[]; meta?: TrolleyMeta }>(
          `/batches/${encodeURIComponent(batchId)}/payments`,
          { page: c.paymentPage, pageSize: MAX_PAGE_SIZE },
        )
        const payments = res.payments ?? []
        let next: PayoutCursor | undefined
        if (morePages(c.paymentPage, res.meta, payments.length, MAX_PAGE_SIZE)) {
          next = { ...c, paymentPage: c.paymentPage + 1 }
        } else if (c.index + 1 < c.batchIds.length) {
          next = { ...c, index: c.index + 1, paymentPage: 1 }
        } else if (c.moreBatches) {
          next = { kind: 'batches', batchPage: c.batchPage + 1 }
        }
        return { items: payments.map(transformPayout), next }
      },
      // A caller page can cross many small batches: one request per batch, plus
      // one per page of batches, for up to a 1000-row caller page.
      { defaultLimit: DEFAULT_PAGE_SIZE, maxUpstreamPages: 2 * MAX_PAGE_SIZE + 10 },
    )
    return result.items
  }

  /** `GET /v1/payments/:payment-id` → `{ ok, payment }` ("Retrieve a payment"). */
  async getPayout(credentials: Credentials, id: string): Promise<Payout> {
    const res = await this.client(credentials).get<{ payment?: RawTrolleyPayout }>(
      `/payments/${encodeURIComponent(id)}`,
    )
    if (!res.payment) throw new Error(`Trolley returned no payment for ${id}`)
    return transformPayout(res.payment)
  }

  // ── Invoices (Trolley payout-grouping invoices) ────────────────────────────

  /**
   * `POST /v1/invoices/search` pages by number: the body takes `page` ("The
   * page number (default: 1).") and `pageSize` ("Defaults to 10, maximum
   * 1000"), and the response's `meta: { page, pages, records }` says where the
   * result set ends (https://developers.trolley.com/api/). A limit past the
   * maximum is clamped and the page numbered at the clamped size, which is
   * reported as `pageSize` so the caller strides by it.
   */
  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const { page, pageSize } = pageRequest(params)
    const res = await this.client(credentials).post<{
      invoices?: RawTrolleyInvoice[]
      meta?: TrolleyMeta
    }>('/invoices/search', { page, pageSize })
    reportMeta(params, page, pageSize, res.meta)
    return (res.invoices ?? []).map(transformInvoice)
  }

  /** `POST /v1/invoices/get` with `{ invoiceId }` → `{ ok, invoice }`. */
  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const res = await this.client(credentials).post<{ invoice?: RawTrolleyInvoice }>(
      '/invoices/get',
      { invoiceId: id },
    )
    if (!res.invoice) throw new Error(`Trolley returned no invoice for ${id}`)
    return transformInvoice(res.invoice)
  }
}
