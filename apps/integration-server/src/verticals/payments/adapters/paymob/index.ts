/**
 * Paymob (Accept) adapter — payments vertical (MENA anchor, Egypt-first).
 *
 * Paymob is the leading payment gateway across Egypt and the wider MENA region
 * (also live in KSA, UAE, Pakistan, Oman). Its Accept API is transaction- and
 * order-centric: a merchant creates an order/intention, the shopper pays via a
 * hosted checkout, and the resulting `transaction` is the canonical charge.
 * You retrieve a transaction by id, refund a settled transaction, or void an
 * authorised-but-unsettled one.
 *
 * Resource coverage (what the Accept API actually exposes here):
 *   - Charges:  get (GET /acceptance/transactions/{id}),
 *               cancel  (POST /acceptance/void_refund/void — void an auth)
 *   - Refunds:  create (POST /acceptance/void_refund/refund — full or partial)
 *
 * Methods deliberately left off (auto-501 at the router): all list* surfaces
 * (Paymob has no cursor/list endpoint on the merchant key), customers (no
 * standalone customer object — contact details ride on the order's
 * `billing_data`), payment methods, subscriptions, invoices, payouts, disputes,
 * plans/prices/products, and balance transactions — the Accept API does not
 * model them.
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: balance-transaction — no balance-transaction ledger in the Accept merchant-key API
 * Unavailable: customer — no standalone customer object; contact data rides on order.billing_data
 * Unavailable: dispute — webhook events only; no REST query/list endpoint in the Accept API
 * Unavailable: invoice — no invoice resource in the Accept (Intention) API
 * Unavailable: payment-method — card tokens are per-subscription only; Secret Key auth does not reach that endpoint
 * Unavailable: payout — separate Paymob Payouts product with its own OAuth; not part of Accept API
 * Unavailable: plan — subscription-plan endpoints require legacy API-Key→Bearer-Token auth, incompatible with this adapter's Secret Key model
 * Unavailable: subscription — subscription endpoints require legacy API-Key→Bearer-Token auth, incompatible with this adapter's Secret Key model
 *
 * Auth: `api_key` model — a single merchant Secret Key (`egy_sk_test_…` /
 * `egy_sk_live_…`) sent as `Authorization: Token <secret_key>`. No OAuth.
 *
 * Webhooks: transaction callbacks carry an `hmac` query parameter, an
 * HMAC-SHA512 over a fixed subset of the `obj` fields keyed by the merchant
 * HMAC secret — verified in webhook.ts.
 *
 * Docs: https://developers.paymob.com/paymob-docs/integration-paths/apis
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

import { TRANSACTION_PATH, REFUND_PATH, VOID_PATH } from './constants'
import { PaymobCredentialForm } from './auth'
import { PaymobClient } from './client'
import { parsePaymobWebhookEvents, verifyPaymobWebhook } from './webhook'

import { transformCharge, type RawPaymobTransaction } from './transform/charge'
import { transformRefund, type RawPaymobRefund } from './transform/refund'

export class PaymobAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'paymob'
  readonly version = '0.1.0'

  getAuthUrl(): string {
    throw new Error('Paymob uses an API key; submit the Secret Key via the Connect Link form.')
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('Paymob uses an API key; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return PaymobCredentialForm.credentialFields()
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return PaymobCredentialForm.exchangeCredentials(fields)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyPaymobWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parsePaymobWebhookEvents(payload)
  }

  private client(credentials: Credentials): PaymobClient {
    return new PaymobClient(credentials)
  }

  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const res = await this.client(credentials).get<RawPaymobTransaction>(
      `${TRANSACTION_PATH}/${id}`,
    )
    return transformCharge(res ?? {})
  }

  /** Void an authorised-but-unsettled transaction. */
  async cancelCharge(credentials: Credentials, id: string): Promise<Charge> {
    const res = await this.client(credentials).post<RawPaymobTransaction>(VOID_PATH, {
      transaction_id: id,
    })
    return transformCharge(res ?? {})
  }

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    if (!data.chargeId) throw new Error('chargeId (Paymob transaction_id) required for refund')
    if (data.amount == null) throw new Error('amount (amount_cents) required for Paymob refund')
    const res = await this.client(credentials).post<RawPaymobRefund>(REFUND_PATH, {
      transaction_id: data.chargeId,
      amount_cents: data.amount,
    })
    return transformRefund(res ?? {})
  }
}
