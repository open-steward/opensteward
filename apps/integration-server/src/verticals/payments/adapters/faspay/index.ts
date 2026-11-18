/**
 * Faspay adapter — payments vertical (Indonesia anchor).
 *
 * Faspay is an Indonesian payment gateway. Its Faspay Business / Online-Debit
 * REST surface routes all operations through `/cvr/<merchant_id>/10`, where
 * `<merchant_id>` is the merchant's own numeric code. The server dispatches by
 * the `request` field in the POST body (post data, inquiry, cancel).
 * Every call authenticates with a per-request body `signature` =
 * `sha1(md5(user_id + password + bill_no))` rather than a token header.
 *
 * Auth: `api_key` model. The merchant supplies a Merchant ID, User ID, secret
 * password, and environment through the Connect Link form (a `customForm`
 * template — see `auth.ts`). Money is whole-rupiah IDR integers, which equal
 * the canonical integer minor-unit amount.
 *
 * Resources implemented (only what the Faspay REST API exposes; the rest
 * auto-501):
 *   - Charges: create (post data), get (inquiry), cancel (cancel/billing)
 *   - All three operations share the path /cvr/<merchant_id>/10; the server
 *     routes by the `request` field in the POST body.
 *
 * Deliberately NOT implemented:
 *   - listCharges / listCustomers / listRefunds — the Faspay transaction API
 *     has no list/collection endpoints; transactions are addressed individually
 *     by `trx_id` + `bill_no`.
 *   - Customers — Faspay has no customer resource; customer details (`cust_no`,
 *     `cust_name`) are embedded inside each transaction.
 *   - Refunds — Faspay has no first-class refund resource; a reversal surfaces
 *     as a `payment_status_code` of `4` on the transaction (a `refunded` charge).
 *
 * Docs: https://docs.faspay.co.id/merchant-integration/api-reference-1/debit-transaction
 */

// ── Resource coverage ──────────────────────────────────────────────────────────
// Available:    charge
// Unavailable:  balance-transaction — no settlement/fee ledger API; per-transaction inquiry only
// Unavailable:  customer            — customer details (cust_no, cust_name) embedded in each transaction; no standalone resource
// Unavailable:  dispute             — no dispute/chargeback REST API; handled via merchant dashboard only
// Unavailable:  invoice             — Faspay Billing creates payment links but exposes no retrievable invoice resource
// Unavailable:  payment-method      — payment channel is per-transaction; no stored payment-method resource
// Unavailable:  payout              — settlement is Faspay-initiated internally (D+0–D+3); no payout REST endpoint
// Unavailable:  plan                — recurring parameters specified inline per transaction; no plan/price resource
// Unavailable:  refund              — credit-card refunds via non-REST form POST on fpg host; Online-Debit API (used here) has no refund endpoint
// Unavailable:  subscription        — recurring billing registers individual member transactions; no subscription management endpoints

import type {
  BaseAdapter,
  CredentialField,
  Credentials,
} from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Charge } from '../../schema/charge'
import type { WebhookEvent } from '../../schema/webhook'

import { merchantPath, DEFAULT_CURRENCY } from './constants'
import { CREDENTIAL_FORM, merchantId, userId, password, signRequest } from './auth'
import { FaspayClient } from './client'
import { parseFaspayWebhookEvents, verifyFaspayWebhook } from './webhook'

import { transformCharge, type RawFaspayTransaction } from './transform/charge'

export class FaspayAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'faspay'
  readonly version = '0.1.0'

  getAuthUrl(): string {
    throw new Error('Faspay uses signed API credentials; submit them via the Connect Link form.')
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('Faspay uses signed API credentials; call exchangeCredentials instead.')
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
    return verifyFaspayWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseFaspayWebhookEvents(payload)
  }

  private client(credentials: Credentials): FaspayClient {
    return new FaspayClient(credentials)
  }

  /** The body fields every Faspay request shares: merchant id + signed by bill_no. */
  private signedBody(credentials: Credentials, billNo: string): Record<string, unknown> {
    return {
      merchant_id: merchantId(credentials),
      bill_no: billNo,
      signature: signRequest(userId(credentials), password(credentials), billNo),
    }
  }

  // ── Charges (Faspay transaction API) ──────────────────────────────────────

  /**
   * Create a transaction via Post Data (`/cvr/<merchant_id>/10`). The canonical
   * `Charge.id` carries the Faspay `bill_no` (the merchant's order number);
   * `amount` is the whole-rupiah IDR total.
   */
  async createCharge(credentials: Credentials, data: Partial<Charge>): Promise<Charge> {
    const billNo = String(data.id ?? data.externalId ?? '')
    if (!billNo) throw new Error('id (bill_no) required to create a Faspay transaction')
    if (data.amount === undefined) throw new Error('amount (bill_total) required for a Faspay transaction')
    const total = String(data.amount)
    const body: Record<string, unknown> = {
      ...this.signedBody(credentials, billNo),
      bill_total: total,
      bill_gross: total,
      bill_currency: (data.currency ?? DEFAULT_CURRENCY).toUpperCase(),
      bill_desc: data.description ?? `Order ${billNo}`,
    }
    const res = await this.client(credentials).post<RawFaspayTransaction>(
      merchantPath(merchantId(credentials)),
      body,
    )
    return transformCharge(res ?? {})
  }

  /**
   * Read a transaction back via Inquiry of Payment Status (`/cvr/<merchant_id>/10`).
   * `id` is the Faspay `bill_no`.
   */
  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const res = await this.client(credentials).post<RawFaspayTransaction>(
      merchantPath(merchantId(credentials)),
      this.signedBody(credentials, id),
    )
    return transformCharge(res ?? {})
  }

  /** Cancel an in-flight transaction via Cancel/Billing (`/cvr/<merchant_id>/10`). */
  async cancelCharge(credentials: Credentials, id: string): Promise<Charge> {
    const res = await this.client(credentials).post<RawFaspayTransaction>(
      merchantPath(merchantId(credentials)),
      this.signedBody(credentials, id),
    )
    return transformCharge(res ?? {})
  }
}
