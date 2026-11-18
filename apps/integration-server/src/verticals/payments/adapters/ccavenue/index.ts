/**
 * CCAvenue adapter — payments vertical (India anchor).
 *
 * CCAvenue (Avenues India Pvt. Ltd.) is India's largest payment aggregator.
 * Its server-to-server Merchant API (v1.2) is a single `DoWebTrans` servlet:
 * the operation is chosen by a `command` field and the request/response bodies
 * are AES-128-CBC encrypted with the merchant's Working Key. There is no REST
 * resource path, no cursor pagination, no OAuth and no bearer token.
 *
 * Auth: static Merchant ID + Access Code + Working Key (api_key model). The
 * caller's public IP must also be allow-listed in the CCAvenue dashboard.
 *
 * Resource coverage (what DoWebTrans actually exposes):
 *   - Charges: get (orderStatusTracker — by CCAvenue reference_no or merchant
 *              order_no), cancel (cancelOrder — voids a pending order)
 *   - Refunds: create (refundOrder — refunds a captured transaction)
 *
 * CCAvenue has NO list/search endpoint for orders on this servlet, NO
 * standalone customer object, and NO refund-read endpoint, so listCharges /
 * createCharge / customers / listRefunds / getRefund are intentionally absent
 * and auto-501 at the router. The merchant-side payment capture happens via a
 * browser redirect (the billing/shipping page), which a server-to-server
 * adapter cannot perform.
 *
 * Docs: Merchant's API v1.2 Implementation Guide (DoWebTrans servlet).
 */

// ── Resource coverage ──────────────────────────────────────────────────────────
// Available:   charge       — getCharge (orderStatusTracker), cancelCharge (cancelOrder)
// Available:   refund       — createRefund (refundOrder)
// Unavailable: balance-transaction — no balance ledger or settlement-entry endpoint in DoWebTrans; dashboard-only
// Unavailable: customer     — no server-side customer object; billing data collected via browser redirect only
// Unavailable: dispute      — no DoWebTrans command for chargebacks/disputes; handled in M.A.R.S dashboard only
// Unavailable: invoice      — no invoice concept in the DoWebTrans API; pure payment-capture gateway
// Unavailable: payment-method — no stored payment-method (token) records exposed via DoWebTrans
// Unavailable: payout       — settlement/payout data accessible only via merchant dashboard reports
// Unavailable: plan         — subscription plan management is dashboard-only; no DoWebTrans command
// Unavailable: subscription — recurring-payment SI-mandate flow is dashboard-only; no DoWebTrans command

import type {
  BaseAdapter,
  CredentialField,
  Credentials,
} from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Charge } from '../../schema/charge'
import type { Refund } from '../../schema/refund'

import { COMMAND_CANCEL, COMMAND_ORDER_STATUS, COMMAND_REFUND } from './constants'
import { buildCredentials } from './auth'
import { CcavenueClient } from './client'

import { transformCharge, type RawCcavenueOrderStatus } from './transform/charge'
import { transformRefund, type RawCcavenueRefund } from './transform/refund'

export class CcavenueAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'ccavenue'
  readonly version = '0.1.0'

  getAuthUrl(): string {
    throw new Error(
      'CCAvenue uses Merchant ID / Access Code / Working Key; submit them via the Connect Link form.',
    )
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('CCAvenue uses API keys; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return [
      {
        name: 'merchantId',
        label: 'Merchant ID',
        type: 'text',
        required: true,
        helpText: 'Numeric account ID from M.A.R.S → Settings → API Keys.',
      },
      {
        name: 'accessCode',
        label: 'Access Code',
        type: 'password',
        required: true,
        helpText: 'Access Code from M.A.R.S → Settings → API Keys.',
      },
      {
        name: 'workingKey',
        label: 'Working Key',
        type: 'password',
        required: true,
        helpText: 'Encryption (Working) Key used to AES-encrypt API requests.',
      },
      {
        name: 'environment',
        label: 'Environment',
        type: 'select',
        required: true,
        options: [
          { value: 'sandbox', label: 'Sandbox (apitest.ccavenue.com)' },
          { value: 'production', label: 'Production (api.ccavenue.com)' },
        ],
        helpText: 'Sandbox uses apitest.ccavenue.com; production uses api.ccavenue.com.',
      },
    ]
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return buildCredentials(fields)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // Static API-key credentials never expire — nothing to refresh.
    return credentials
  }

  private client(credentials: Credentials): CcavenueClient {
    return new CcavenueClient(credentials)
  }

  // ── Charges ─────────────────────────────────────────────────────────────────

  /**
   * Look up a single order via `orderStatusTracker`. The `id` is treated as the
   * CCAvenue reference number first; if it is non-numeric it is sent as the
   * merchant `order_no` instead (CCAvenue accepts either).
   */
  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const payload: Record<string, unknown> = /^\d+$/.test(id)
      ? { reference_no: id }
      : { order_no: id }
    const res = await this.client(credentials).command<RawCcavenueOrderStatus>(
      COMMAND_ORDER_STATUS,
      payload,
    )
    return transformCharge(res ?? {})
  }

  /** Cancel a pending order via `cancelOrder`, then re-read its final status. */
  async cancelCharge(credentials: Credentials, id: string): Promise<Charge> {
    await this.client(credentials).command<Record<string, unknown>>(COMMAND_CANCEL, {
      reference_no: id,
      amount: undefined,
    })
    return this.getCharge(credentials, id)
  }

  // ── Refunds ─────────────────────────────────────────────────────────────────

  /**
   * Refund a captured transaction via `refundOrder`. CCAvenue keys the refund
   * off the transaction's `reference_no` (passed as `chargeId`). `refund_amount`
   * is in DECIMAL major units, so the canonical minor-unit amount is divided by
   * 100. `refund_ref_no` is a merchant-supplied idempotency reference.
   */
  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    if (!data.chargeId) {
      throw new Error('chargeId (CCAvenue reference_no) is required to refund.')
    }
    const refundRefNo = data.id ?? `oi_${Date.now()}`
    const refundAmount =
      data.amount != null ? (data.amount / 100).toFixed(2) : undefined
    const res = await this.client(credentials).command<RawCcavenueRefund>(COMMAND_REFUND, {
      reference_no: data.chargeId,
      refund_amount: refundAmount,
      refund_ref_no: refundRefNo,
    })
    return transformRefund(res ?? {}, {
      chargeId: data.chargeId,
      amount: data.amount ?? 0,
      currency: data.currency,
      refundRefNo,
    })
  }
}
