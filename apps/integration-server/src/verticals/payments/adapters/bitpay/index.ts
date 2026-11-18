/**
 * BitPay adapter — payments vertical (cryptocurrency checkout).
 *
 * BitPay is invoice-centric: an **Invoice** carries the requested amount,
 * settlement currency, lifecycle status and buyer details, so it maps onto the
 * canonical **Charge**. **Refunds** are taken against an invoice
 * (`POST /refunds` with `invoiceId`) and listed per invoice
 * (`GET /refunds?invoiceId=…`).
 *
 * Auth: a single `pos`-facade API token, sent inline (body for POST, `token`
 * query param for GET) with no ECDSA request signing. The customer also picks
 * the environment (production vs test) the token was minted for. No OAuth, no
 * refresh.
 *
 * Webhooks (IPN): HMAC-SHA-256 of the whitespace-stripped JSON body keyed by
 * the resource token, base64 in the `x-signature` header (see webhook.ts).
 *
 * Resources deliberately left off (auto-501): customers, payment methods,
 * subscriptions, invoices-as-billing, payouts, disputes, plans/prices/products
 * and balance transactions — the BitPay POS facade either does not expose them
 * as first-class REST resources or models them differently enough to need
 * their own pass. The canonical "invoice" resource is intentionally not mapped
 * here: BitPay "invoices" are crypto-checkout charges, not AR billing
 * documents.
 */

// ── Resource coverage ──────────────────────────────────────────────
// Unavailable: balance-transaction — GET /ledgers/{currency} requires the merchant facade token, not the POS facade token this adapter uses.
// Unavailable: customer            — BitPay has no customer management API; it is a cryptocurrency checkout gateway.
// Unavailable: dispute             — BitPay has no disputes REST API; chargebacks are handled via support tickets.
// Unavailable: invoice             — BitPay has no billing-invoice resource; its "invoice" is a crypto-checkout charge (→ Charge).
// Unavailable: payment-method      — BitPay accepts cryptocurrency only and has no stored payment-method API.
// Unavailable: payout              — GET /payouts requires the payout facade token, separate from the POS facade token.
// Unavailable: plan                — BitPay has no subscription plan, price, or product catalog API.
// Unavailable: subscription        — BitPay has no subscription API.

import type {
  BaseAdapter,
  CredentialField,
  Credentials,
  QueryParams,
} from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Charge } from '../../schema/charge'
import type { Refund } from '../../schema/refund'
import type { WebhookEvent } from '../../schema/webhook'

import { DEFAULT_PAGE_SIZE, INVOICES_PATH, REFUNDS_PATH } from './constants'
import { BITPAY_AUTH } from './auth'
import {
  BitpayClient,
  type BitpayListResponse,
  type BitpayObjectResponse,
} from './client'
import { parseBitpayWebhookEvents, verifyBitpayWebhook } from './webhook'

import { transformCharge, type RawBitpayInvoice } from './transform/charge'
import { transformRefund, type RawBitpayRefund } from './transform/refund'
import { toMajorUnits } from './transform/shared'

/** Default lookback window for the date-bounded invoice listing (30 days). */
const LIST_WINDOW_MS = 30 * 24 * 60 * 60 * 1000

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10)
}

export class BitpayAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'bitpay'
  readonly version = '0.1.0'

  getAuthUrl(): string {
    throw new Error('BitPay uses an API token; submit it via the Connect Link form.')
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('BitPay uses an API token; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return BITPAY_AUTH.credentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return BITPAY_AUTH.exchangeCredentials(fields)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyBitpayWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseBitpayWebhookEvents(payload)
  }

  private client(credentials: Credentials): BitpayClient {
    return new BitpayClient(credentials)
  }

  // ── Charges (BitPay Invoices) ──────────────────────────────────────────────
  async listCharges(credentials: Credentials, params: QueryParams): Promise<Charge[]> {
    // BitPay's invoice listing is date-bounded (dateStart..dateEnd, YYYY-MM-DD)
    // and paginated with limit/offset.
    const end = new Date()
    const start =
      params.updatedAfter instanceof Date
        ? params.updatedAfter
        : new Date(end.getTime() - LIST_WINDOW_MS)
    const query: Record<string, unknown> = {
      dateStart: isoDate(start),
      dateEnd: isoDate(end),
      limit: params.limit ?? DEFAULT_PAGE_SIZE,
    }
    if (typeof params.page === 'number' && params.page > 1) {
      query.offset = (params.page - 1) * (params.limit ?? DEFAULT_PAGE_SIZE)
    }
    if (typeof params.status === 'string') query.status = params.status
    const res = await this.client(credentials).get<BitpayListResponse<RawBitpayInvoice>>(
      INVOICES_PATH,
      query,
    )
    return (res.data ?? []).map(transformCharge)
  }

  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const res = await this.client(credentials).get<BitpayObjectResponse<RawBitpayInvoice>>(
      `${INVOICES_PATH}/${id}`,
    )
    return transformCharge(res.data ?? {})
  }

  // ── Refunds ─────────────────────────────────────────────────────────────────
  /**
   * BitPay refunds are scoped to an invoice — pass the invoice id via
   * `params.invoiceId`. Without it there is nothing to list, so we return [].
   */
  async listRefunds(credentials: Credentials, params: QueryParams): Promise<Refund[]> {
    const invoiceId = typeof params.invoiceId === 'string' ? params.invoiceId : undefined
    if (!invoiceId) return []
    const res = await this.client(credentials).get<BitpayListResponse<RawBitpayRefund>>(
      REFUNDS_PATH,
      { invoiceId },
    )
    return (res.data ?? []).map(transformRefund)
  }

  async getRefund(credentials: Credentials, id: string): Promise<Refund> {
    const res = await this.client(credentials).get<BitpayObjectResponse<RawBitpayRefund>>(
      `${REFUNDS_PATH}/${id}`,
    )
    return transformRefund(res.data ?? {})
  }

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    if (!data.chargeId) throw new Error('chargeId (BitPay invoice id) is required for a refund')
    // Canonical `amount` is integer minor units; BitPay's refund `amount` is the
    // fiat major-unit value in the invoice's currency.
    const amount = toMajorUnits(data.amount, data.currency ?? 'USD')
    const res = await this.client(credentials).post<BitpayObjectResponse<RawBitpayRefund>>(
      REFUNDS_PATH,
      {
        invoiceId: data.chargeId,
        amount,
        reference: data.metadata?.reference,
      },
    )
    return transformRefund(res.data ?? {})
  }
}
