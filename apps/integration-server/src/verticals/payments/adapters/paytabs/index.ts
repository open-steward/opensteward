/**
 * PayTabs adapter — payments vertical (MENA anchor).
 *
 * PayTabs is a MENA payment gateway (UAE, Saudi Arabia, Egypt, Oman, Jordan,
 * Kuwait, Iraq, Qatar, Morocco, plus a global host). Its PT2 transaction API
 * is verb-oriented rather than resource-oriented: a transaction is created or
 * mutated via `POST /payment/request` (with `tran_type` sale / auth / capture /
 * void / refund) and read back via `POST /payment/query`.
 *
 * Auth: the merchant Server Key is sent verbatim as the `authorization` header;
 * the (non-secret) Profile ID rides in every request body. Collected through
 * the Connect Link form via a `customForm` template (server key + profile id +
 * region). See `auth.ts`.
 *
 * Resources implemented (only what the PT2 transaction API exposes; the rest
 * auto-501):
 *   - Charges: get (query), capture, cancel (void)
 *   - Refunds: create
 *
 * Deliberately NOT implemented:
 *   - listCharges / listRefunds / listCustomers — the PT2 API has no list or
 *     collection endpoints; transactions are addressed individually by
 *     `tran_ref` (or `cart_id`).
 *   - createCharge — a first charge requires the Hosted Payment Page redirect
 *     flow (a `return_url` + customer-facing page), which is not a synchronous
 *     server-to-server call and does not fit the canonical `createCharge`
 *     contract.
 *   - Customers — PayTabs has no customer resource; customer details are
 *     embedded inside each transaction.
 *
 * Docs: https://docs.paytabs.com/ (PT2 API Endpoints)
 */

// ── Resource coverage ──────────────────────────────────────────────
// Available:    charge, refund
// Unavailable:  balance-transaction — no balance/settlement API; account ledger is dashboard-only
// Unavailable:  customer — customer details are embedded per transaction; no standalone customer resource
// Unavailable:  dispute — chargebacks are managed dashboard-only; no dispute API
// Unavailable:  invoice — POST /payment/invoice/new returns a redirect URL (invoice_id + invoice_link) only; no list or get endpoint with queryable invoice data
// Unavailable:  payment-method — card/wallet details are embedded per transaction; no standalone payment method resource
// Unavailable:  payout — POST /payout/batch/new is a bulk B2B batch-transfer (batch_id, account_id, requests[]) not mappable to canonical Payout schema
// Unavailable:  plan — no pricing catalog; repeat-billing parameters are inline fields on /payment/request
// Unavailable:  subscription — Repeat Billing uses POST /payment/request; no list or get endpoint for agreements

import type {
  BaseAdapter,
  CredentialField,
  Credentials,
} from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Charge } from '../../schema/charge'
import type { Refund } from '../../schema/refund'
import type { WebhookEvent } from '../../schema/webhook'

import { REQUEST_PATH, QUERY_PATH } from './constants'
import { CREDENTIAL_FORM, profileId } from './auth'
import { PaytabsClient } from './client'
import { parsePaytabsWebhookEvents, verifyPaytabsWebhook } from './webhook'

import { transformCharge, type RawPaytabsTransaction } from './transform/charge'
import { transformRefund, type RawPaytabsRefund } from './transform/refund'

export class PaytabsAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'paytabs'
  readonly version = '0.1.0'

  getAuthUrl(): string {
    throw new Error('PayTabs uses a server key; submit it via the Connect Link form.')
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('PayTabs uses a server key; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return CREDENTIAL_FORM.credentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return CREDENTIAL_FORM.exchangeCredentials(fields)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyPaytabsWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parsePaytabsWebhookEvents(payload)
  }

  private client(credentials: Credentials): PaytabsClient {
    return new PaytabsClient(credentials)
  }

  // ── Charges (PT2 transaction API) ─────────────────────────────────────────

  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const res = await this.client(credentials).post<RawPaytabsTransaction>(QUERY_PATH, {
      profile_id: profileId(credentials),
      tran_ref: id,
    })
    return transformCharge(res ?? {})
  }

  /** Capture a previously authorised (`tran_type: 'auth'`) transaction. */
  async captureCharge(
    credentials: Credentials,
    id: string,
    data?: { amount?: number },
  ): Promise<Charge> {
    const body: Record<string, unknown> = {
      profile_id: profileId(credentials),
      tran_type: 'capture',
      tran_class: 'ecom',
      tran_ref: id,
    }
    if (data?.amount !== undefined) body.cart_amount = toAmountString(data.amount)
    const res = await this.client(credentials).post<RawPaytabsTransaction>(REQUEST_PATH, body)
    return transformCharge(res ?? {})
  }

  /** Cancel (void) an uncaptured authorisation. */
  async cancelCharge(credentials: Credentials, id: string): Promise<Charge> {
    const res = await this.client(credentials).post<RawPaytabsTransaction>(REQUEST_PATH, {
      profile_id: profileId(credentials),
      tran_type: 'void',
      tran_class: 'ecom',
      tran_ref: id,
    })
    return transformCharge(res ?? {})
  }

  // ── Refunds ───────────────────────────────────────────────────────────────

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    if (!data.chargeId) throw new Error('chargeId (tran_ref) required for PayTabs refund')
    if (data.amount === undefined) throw new Error('amount required for PayTabs refund')
    const body: Record<string, unknown> = {
      profile_id: profileId(credentials),
      tran_type: 'refund',
      tran_class: 'ecom',
      tran_ref: data.chargeId,
      cart_amount: toAmountString(data.amount),
      cart_currency: (data.currency ?? 'AED').toUpperCase(),
      cart_id: `refund-${data.chargeId}`,
      cart_description: 'Refund',
    }
    const res = await this.client(credentials).post<RawPaytabsRefund>(REQUEST_PATH, body)
    return transformRefund(res ?? {}, data.chargeId)
  }
}

/**
 * The canonical schema carries amounts as integer minor units; PayTabs expects
 * a decimal major-unit string (`50000` → `"500.00"`). Inverse of `toMinorUnits`.
 */
function toAmountString(minorUnits: number): string {
  return (minorUnits / 100).toFixed(2)
}
