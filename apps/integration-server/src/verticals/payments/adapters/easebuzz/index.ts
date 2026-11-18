/**
 * Easebuzz adapter — payments vertical (India anchor).
 *
 * Easebuzz is an Indian payment aggregator (cards, UPI, net-banking, wallets,
 * EMI). Its post-payment API is verb-oriented rather than resource-oriented and
 * has no token auth: every server-to-server call POSTs a form-encoded body to
 * the dashboard host carrying the merchant `key` plus a per-request SHA-512
 * `hash` derived from an ordered field sequence + the merchant `salt`.
 *
 * Auth: merchant key + salt + environment, collected via the Connect Link form
 * (`customForm`). The key rides in every request body; the salt signs requests
 * and verifies webhooks. See `auth.ts` / `client.ts`.
 *
 * Resources implemented (only what Easebuzz's server-to-server API exposes; the
 * rest auto-501):
 *   - Charges: get  (POST /transaction/v2/retrieve, keyed by txnid)
 *   - Refunds: create (POST /transaction/v2/refund), get (POST /refund/v1/retrieve)
 *
 * Deliberately NOT implemented:
 *   - listCharges / listRefunds — Easebuzz has no id-paginated collection
 *     endpoint; transactions are addressed individually by txnid, and the only
 *     bulk read is a date-range export that doesn't fit the canonical
 *     `QueryParams` list contract.
 *   - createCharge — a first charge requires the hosted-checkout redirect flow
 *     (`/payment/initiateLink` → `pay.easebuzz.in/pay/<access_key>` with a
 *     customer-facing page + surl/furl), which is not a synchronous
 *     server-to-server call and does not fit `createCharge`.
 *   - Customers — Easebuzz has no customer resource; customer details
 *     (firstname / email / phone) are embedded in each transaction.
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: balance-transaction — no itemized ledger; only aggregate date-keyed settlement data
 * Unavailable: customer — no customer object; details embedded in each transaction
 * Unavailable: invoice — no invoice resource; EasyCollect is hosted/UI only
 * Unavailable: payment-method — no payment method vault; card/UPI details are transaction metadata
 * Unavailable: plan — no plan catalog; Recurri billing is a hosted product with no server-to-server CRUD
 * Unavailable: subscription — no subscription API; recurring payments via hosted Recurri/AutoCollect
 * Unverified:  dispute — DRS documented at docs.easebuzz.in/docs/dispute-resolution-system/ but docs pages returned only headings; no endpoint paths or field names confirmed
 * Unverified:  payout — API exists (docs.easebuzz.in/docs/payment-gateway/5a8fa194122c7-payout-api) but docs page returned only a heading; no paths or response fields confirmed
 *
 * Docs: https://docs.easebuzz.in/docs/payment-gateway
 */

import type {
  BaseAdapter,
  CredentialField,
  Credentials,
} from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Charge } from '../../schema/charge'
import type { Refund } from '../../schema/refund'
import type { WebhookEvent } from '../../schema/webhook'

import { TRANSACTION_RETRIEVE_PATH, REFUND_PATH, REFUND_RETRIEVE_PATH } from './constants'
import { CREDENTIAL_FORM } from './auth'
import { EasebuzzClient } from './client'
import { parseEasebuzzWebhookEvents, verifyEasebuzzWebhook } from './webhook'

import { transformCharge, type RawEasebuzzTransaction } from './transform/charge'
import { transformRefund, type RawEasebuzzRefund } from './transform/refund'

export class EasebuzzAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'easebuzz'
  readonly version = '0.1.0'

  getAuthUrl(): string {
    throw new Error('Easebuzz uses a merchant key + salt; submit them via the Connect Link form.')
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('Easebuzz uses a merchant key + salt; call exchangeCredentials instead.')
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
    return verifyEasebuzzWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseEasebuzzWebhookEvents(payload)
  }

  private client(credentials: Credentials): EasebuzzClient {
    return new EasebuzzClient(credentials)
  }

  // ── Charges ─────────────────────────────────────────────────────────────

  /** Retrieve a single transaction by its merchant `txnid`. */
  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const res = await this.client(credentials).signedPost<RawEasebuzzTransaction>(
      'transaction',
      TRANSACTION_RETRIEVE_PATH,
      { txnid: id },
    )
    return transformCharge(res.data ?? {})
  }

  // ── Refunds ─────────────────────────────────────────────────────────────

  /**
   * Initiate a full or partial refund against a settled transaction. The
   * canonical `chargeId` is Easebuzz's `easebuzz_id` (the transaction's
   * easepayid). `amount` is required; metadata may carry `merchant_refund_id`.
   */
  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    if (!data.chargeId) throw new Error('chargeId (easebuzz_id) required for Easebuzz refund')
    if (data.amount === undefined) throw new Error('amount required for Easebuzz refund')
    const merchantRefundId = data.metadata?.merchant_refund_id ?? `refund-${data.chargeId}-${Date.now()}`
    const res = await this.client(credentials).signedPost<RawEasebuzzRefund>(
      'refund',
      REFUND_PATH,
      {
        easebuzz_id: data.chargeId,
        merchant_refund_id: merchantRefundId,
        refund_amount: toAmountString(data.amount),
      },
    )
    return transformRefund({ ...(res.data ?? {}), merchant_refund_id: merchantRefundId }, data.chargeId)
  }

  /** Look up a refund's status by the parent transaction's `easebuzz_id`. */
  async getRefund(credentials: Credentials, id: string): Promise<Refund> {
    const res = await this.client(credentials).signedPost<RawEasebuzzRefund | RawEasebuzzRefund[]>(
      'refund_status',
      REFUND_RETRIEVE_PATH,
      { easebuzz_id: id },
    )
    const raw = Array.isArray(res.data) ? (res.data[0] ?? {}) : (res.data ?? {})
    return transformRefund(raw, id)
  }
}

/**
 * The canonical schema carries amounts as integer minor units; Easebuzz expects
 * a decimal major-unit (rupees) string (`12500` → `"125.00"`). Inverse of
 * `toMinorUnits`.
 */
function toAmountString(minorUnits: number): string {
  return (minorUnits / 100).toFixed(2)
}
