/**
 * EBANX adapter — payments vertical (Latin America + emerging markets).
 *
 * EBANX is a cross-border pay-in/pay-out gateway covering Brazil, Mexico,
 * Colombia, Chile, Argentina, Nigeria and others. Methods: cards, Pix,
 * boleto, OXXO, bank transfers, local wallets. Cross-border settlement is
 * the headline feature — merchants are billed in USD/EUR while local
 * customers pay in their own currency.
 *
 * API: the "Direct API" — one host, every call a POST to `/ws/*` carrying a
 * secret `integration_key` in the JSON body (no Authorization header, no
 * OAuth). Sandbox and production are separate hosts; the active one rides on
 * the connection's credentials.
 *
 * Payments are fetched one at a time by `hash`; the one list endpoint is
 * /ws/payout/search, paged by `page` + `per_page` (see listPayouts). EBANX
 * has no first-class Customer object (the payer is inline on each payment),
 * so customer methods and the other `list*` methods stay OFF this class and
 * auto-501; only the operations EBANX actually supports are implemented.
 *
 * Docs: https://docs.ebanx.com/api
 *
 * ── Resource coverage ──────────────────────────────────────────────────────
 * Unavailable: customer       — no first-class customer object; payer info is
 *                               embedded inline on each payment
 * Unavailable: payment-method — no stored/reusable payment method store;
 *                               card tokens are single-use only
 * Unavailable: balance-transaction — no ledger/transaction-history API;
 *                               /ws/payout/balance returns current balance
 *                               only, not a transaction list
 * Unavailable: dispute        — chargebacks handled via SFTP file upload,
 *                               no REST dispute list/get endpoint
 * Unavailable: invoice        — no invoice concept in EBANX Direct API
 * Unavailable: plan           — no subscription plan management API
 * Unavailable: subscription   — recurring Pix (Pix Automático) uses
 *                               enrollment webhooks, not a REST list/get API
 */

import { reportUpstreamPage } from '@opensteward/shared'
import type {
  BaseAdapter,
  CredentialField,
  Credentials,
  QueryParams,
} from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Charge } from '../../schema/charge'
import type { Payout } from '../../schema/payout'
import type { Refund } from '../../schema/refund'
import type { WebhookEvent } from '../../schema/webhook'

import { ENDPOINTS, PAYOUT_SEARCH_MAX_PAGE_SIZE } from './constants'
import { FORM } from './auth'
import { EbanxClient } from './client'
import { parseEbanxWebhookEvents, verifyEbanxWebhook } from './webhook'

import { transformCharge, type RawEbanxPayment } from './transform/charge'
import { transformRefund, type RawEbanxRefund } from './transform/refund'
import { transformPayout, type RawEbanxPayout } from './transform/payout'

/** Common EBANX response envelope: `{ status: 'SUCCESS' | 'ERROR', … }`. */
interface EbanxEnvelope {
  status?: string
  status_code?: string
  status_message?: string
  payment?: RawEbanxPayment
  refund?: RawEbanxRefund
}

/** Payout-specific response envelope (uses `type`/`message` instead of `status`). */
interface EbanxPayoutEnvelope {
  type?: string
  message?: string
  payout?: RawEbanxPayout
  payouts?: RawEbanxPayout[]
  /** /ws/payout/search paging fields; the docs' examples type them as strings. */
  records?: string | number
  total_pages?: string | number
  per_page?: string | number
  page?: string | number
}

/** A whole number ≥ 1 from `value`, or `fallback` when it is not one. */
function pageNumberOr(value: unknown, fallback: number): number {
  const n = Math.floor(Number(value))
  return Number.isFinite(n) && n >= 1 ? n : fallback
}

/** A finite number read from a numeric or numeric-string field, else undefined. */
function numericField(value: unknown): number | undefined {
  if (value === undefined || value === null || value === '') return undefined
  const n = Number(value)
  return Number.isFinite(n) ? n : undefined
}

function assertPayoutOk(res: EbanxPayoutEnvelope): void {
  if ((res.type ?? '').toLowerCase() !== 'success') {
    throw new Error(`EBANX payout error: ${res.message ?? 'request failed'}`)
  }
}

function assertOk(res: EbanxEnvelope): void {
  if ((res.status ?? '').toUpperCase() === 'ERROR') {
    throw new Error(`EBANX error ${res.status_code ?? ''}: ${res.status_message ?? 'request failed'}`)
  }
}

export class EbanxAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'ebanx'
  readonly version = '0.1.0'
  /** /ws/payout/search serves "up to 50 records" per page; it is the only list method. */
  readonly capabilities = { maxPageSize: PAYOUT_SEARCH_MAX_PAGE_SIZE }

  getAuthUrl(): string {
    throw new Error('EBANX uses an integration key; submit it via the Connect Link form.')
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('EBANX uses an integration key; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return FORM.credentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return FORM.exchangeCredentials(fields)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // Static integration key — nothing to refresh.
    return credentials
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyEbanxWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseEbanxWebhookEvents(payload)
  }

  private client(credentials: Credentials): EbanxClient {
    return new EbanxClient(credentials)
  }

  // ── Charges ────────────────────────────────────────────────────────────

  /** Retrieve a payment by its EBANX hash (or merchant_payment_code). */
  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const res = await this.client(credentials).post<EbanxEnvelope>(ENDPOINTS.query, { hash: id })
    assertOk(res)
    return transformCharge(res.payment ?? {})
  }

  /**
   * Create a direct charge. The canonical `Charge` is sparse, so the raw
   * EBANX payment object (`name`, `email`, `document`, `payment_type_code`,
   * `country`, card fields, …) is passed through `raw` and merged into the
   * request body; canonical `amount`/`currency`/`description` win when set.
   */
  async createCharge(credentials: Credentials, data: Partial<Charge>): Promise<Charge> {
    const passthrough = (data.raw as Record<string, unknown> | undefined) ?? {}
    const payment: Record<string, unknown> = {
      ...passthrough,
      ...(data.amount != null ? { amount_total: minorToDecimal(data.amount, data.currency) } : {}),
      ...(data.currency ? { currency_code: data.currency } : {}),
      ...(data.description ? { description: data.description } : {}),
      ...(data.receiptEmail ? { email: data.receiptEmail } : {}),
    }
    const res = await this.client(credentials).post<EbanxEnvelope>(ENDPOINTS.direct, { payment })
    assertOk(res)
    return transformCharge(res.payment ?? {})
  }

  /** Capture a pre-authorised card payment. */
  async captureCharge(
    credentials: Credentials,
    id: string,
    data?: { amount?: number },
  ): Promise<Charge> {
    const body: Record<string, unknown> = { hash: id }
    if (data?.amount != null) body['amount'] = minorToDecimal(data.amount)
    const res = await this.client(credentials).post<EbanxEnvelope>(ENDPOINTS.capture, body)
    assertOk(res)
    return transformCharge(res.payment ?? {})
  }

  /** Cancel an open/pending payment. */
  async cancelCharge(credentials: Credentials, id: string): Promise<Charge> {
    const res = await this.client(credentials).post<EbanxEnvelope>(ENDPOINTS.cancel, { hash: id })
    assertOk(res)
    return transformCharge(res.payment ?? {})
  }

  // ── Payouts ────────────────────────────────────────────────────────────

  /**
   * Retrieve a single payout by its EBANX uid or merchant external_reference.
   * Uses /ws/payout/retrieve which returns `{ type: 'success', payout: {...} }`.
   */
  async getPayout(credentials: Credentials, id: string): Promise<Payout> {
    const res = await this.client(credentials).post<EbanxPayoutEnvelope>(ENDPOINTS.payoutRetrieve, {
      uid: id,
    })
    assertPayoutOk(res)
    return transformPayout(res.payout ?? {})
  }

  /**
   * List payouts over a date range. EBANX /ws/payout/search accepts
   * date_from/date_to (YYYY-MM-DD) and pages by a 1-based `page` and
   * `per_page` ("up to 50 records"), answering with `records`,
   * `total_pages` and `page`:
   * https://docs.ebanx.com/docs/payout/general/consult-payout
   * Callers may pass `date_from` / `date_to` strings via the open-ended
   * QueryParams index (`params['date_from']`); otherwise reasonable defaults
   * are used.
   */
  async listPayouts(credentials: Credentials, params: QueryParams): Promise<Payout[]> {
    const today = new Date().toISOString().slice(0, 10)
    const defaultFrom = params['updatedAfter'] instanceof Date
      ? (params['updatedAfter'] as Date).toISOString().slice(0, 10)
      : (params['date_from'] as string | undefined) ?? '2010-01-01'
    const body: Record<string, unknown> = {
      date_from: defaultFrom,
      date_to: (params['date_to'] as string | undefined) ?? today,
      per_page: Math.min(
        pageNumberOr(params.limit ?? PAYOUT_SEARCH_MAX_PAGE_SIZE, 1),
        PAYOUT_SEARCH_MAX_PAGE_SIZE,
      ),
      page: pageNumberOr(params.page, 1),
    }
    const res = await this.client(credentials).post<EbanxPayoutEnvelope>(ENDPOINTS.payoutSearch, body)
    assertPayoutOk(res)
    const records = numericField(res.records)
    const totalPages = numericField(res.total_pages)
    const currentPage = numericField(res.page) ?? (body['page'] as number)
    reportUpstreamPage(params, {
      ...(records !== undefined ? { totalCount: records } : {}),
      ...(totalPages !== undefined ? { totalPages, hasMore: currentPage < totalPages } : {}),
      currentPage,
      pageSize: body['per_page'] as number,
    })
    return (res.payouts ?? []).map(transformPayout)
  }

  // ── Refunds ────────────────────────────────────────────────────────────

  /**
   * Request a refund for a confirmed payment. EBANX returns the updated
   * payment with the new refund in `payment.refunds[]`; we surface the
   * latest one. `chargeId` carries the EBANX payment hash.
   */
  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    if (!data.chargeId) throw new Error('chargeId (EBANX payment hash) required for refund')
    const body: Record<string, unknown> = {
      operation: 'request',
      hash: data.chargeId,
      ...(data.amount != null ? { amount: minorToDecimal(data.amount, data.currency) } : {}),
      ...(data.metadata?.['description'] ? { description: data.metadata['description'] } : {}),
      ...(data.metadata?.['merchant_refund_code']
        ? { merchant_refund_code: data.metadata['merchant_refund_code'] }
        : {}),
    }
    const res = await this.client(credentials).post<EbanxEnvelope>(ENDPOINTS.refund, body)
    assertOk(res)
    const refund = res.refund ?? latestRefund(res.payment)
    return transformRefund(refund ?? {}, data.chargeId)
  }
}

/** Most-recently-created refund on a payment, by request_date. */
function latestRefund(payment: RawEbanxPayment | undefined): RawEbanxRefund | undefined {
  const refunds = payment?.refunds ?? []
  if (refunds.length === 0) return undefined
  return [...refunds].sort((a, b) =>
    String(b.request_date ?? '').localeCompare(String(a.request_date ?? '')),
  )[0]
}

/**
 * Canonical minor units → EBANX decimal-major-unit string. Inverse of the
 * transform layer's `toMinorUnits`. Zero-decimal currencies (CLP, PYG) are
 * passed through whole.
 */
function minorToDecimal(amount: number, currency?: string | null): string {
  const zeroDecimal = currency != null && ['CLP', 'PYG'].includes(currency.toUpperCase())
  return zeroDecimal ? String(amount) : (amount / 100).toFixed(2)
}
