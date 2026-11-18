/**
 * HyperPay adapter — payments vertical.
 *
 * HyperPay (https://hyperpay.com), powered by the OPPWA / ACI "Open Payment
 * Platform", is a leading MENA-region gateway (KSA, UAE, …) supporting cards,
 * Apple Pay, STC Pay, mada and other local brands. Its REST API models all
 * money movement around a single **payment** object: created with
 * `paymentType` DB (debit) or PA (preauthorization), then acted on by reference
 * with CP (capture), RF (refund) or RV (reversal).
 *
 * We map the payment object onto the canonical `Charge`, and refunds/reversals
 * (which are themselves payment objects) onto the canonical `Refund`.
 *
 * Auth: Bearer access token + an `entityId` scoping every request, both
 * collected through the Connect Link form (see `auth.ts`). There is no OAuth
 * flow.
 *
 * Resources implemented (only what the synchronous payments API exposes — the
 * rest of the PaymentsAdapter surface auto-501s):
 *   - Charges: get, create, capture (CP), cancel/reverse (RV)
 *   - Refunds: get, create (RF)
 *   - PaymentMethods: get (via GET /v1/secureRegistrations/{id})
 *
 * There is no list endpoint (back-office reads are by-id only) and no
 * standalone customer / subscription / invoice / payout / dispute / plan
 * object, so those methods are intentionally omitted.
 *
 * Docs: https://hyperpay.docs.oppwa.com/reference/parameters
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: balance-transaction — HyperPay/OPPWA has no balance or ledger
 *              transaction API; settlement data is accessed via merchant portal reports only
 * Unavailable: customer — no customer object endpoint; customer data is
 *              embedded in payment request/response fields only
 * Unavailable: dispute — chargeback handling is operational (merchant portal
 *              only) with no REST API endpoint for dispute objects
 * Unavailable: invoice — HyperBill invoicing is a separate product with no
 *              public REST API exposed through the OPPWA payment gateway
 * Unavailable: payout — HyperSplits payout system is a separate product with
 *              no public REST API exposed through the OPPWA payment gateway
 * Unavailable: plan — HyperPay has no subscription billing plan objects;
 *              recurring payments use stored registrations, not plan records
 * Unavailable: subscription — HyperPay has no subscription objects;
 *              recurring payments are handled via token re-use, not subscriptions
 */

import type {
  BaseAdapter,
  CredentialField,
  Credentials,
} from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Charge } from '../../schema/charge'
import type { PaymentMethod } from '../../schema/payment-method'
import type { Refund } from '../../schema/refund'
import type { WebhookEvent } from '../../schema/webhook'

import { PAYMENTS_PATH, PAYMENT_TYPE } from './constants'
import { CREDENTIAL_FORM } from './auth'
import { HyperpayClient } from './client'
import { verifyHyperpayWebhook, parseHyperpayWebhookEvents } from './webhook'

import { transformCharge, type RawHyperpayPayment } from './transform/charge'
import { transformPaymentMethod, type RawHyperpayRegistration } from './transform/payment-method'
import { transformRefund, type RawHyperpayRefund } from './transform/refund'
import { toDecimalString } from './transform/shared'

export class HyperpayAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'hyperpay'
  readonly version = '0.1.0'

  getAuthUrl(): string {
    throw new Error('HyperPay uses an access token + entityId; submit them via the Connect Link form.')
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('HyperPay uses an access token + entityId; call exchangeCredentials instead.')
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
    return verifyHyperpayWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseHyperpayWebhookEvents(payload)
  }

  private client(credentials: Credentials): HyperpayClient {
    return new HyperpayClient(credentials)
  }

  // ── Charges ────────────────────────────────────────────────────────────────

  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const res = await this.client(credentials).get<RawHyperpayPayment>(`${PAYMENTS_PATH}/${id}`)
    return transformCharge(res ?? {})
  }

  /**
   * Create a payment. Defaults to a debit (DB) — set
   * `metadata.paymentType = 'PA'` to preauthorize instead. A `paymentBrand`
   * (e.g. VISA, MASTER) plus a tokenized instrument are required by HyperPay;
   * callers pass the token via `paymentMethodId` (a registration id) and the
   * brand via `metadata.paymentBrand`.
   */
  async createCharge(credentials: Credentials, data: Partial<Charge>): Promise<Charge> {
    if (data.amount === undefined) throw new Error('amount required to create a HyperPay payment')
    if (!data.currency) throw new Error('currency required to create a HyperPay payment')
    const body: Record<string, unknown> = {
      paymentType: data.metadata?.['paymentType'] ?? PAYMENT_TYPE.DEBIT,
      amount: toDecimalString(data.amount),
      currency: data.currency.toUpperCase(),
    }
    const brand = data.metadata?.['paymentBrand']
    if (brand) body.paymentBrand = brand
    if (data.paymentMethodId) body['registrationId'] = data.paymentMethodId
    if (data.description) body.descriptor = data.description
    if (data.receiptEmail) body['customer.email'] = data.receiptEmail
    const res = await this.client(credentials).post<RawHyperpayPayment>(PAYMENTS_PATH, body)
    return transformCharge(res ?? {})
  }

  /**
   * Capture a preauthorized (PA) payment via `POST /v1/payments/{id}` with
   * `paymentType=CP`. Captures the full amount by default, or a partial `amount`
   * when supplied. Returns the resulting (capture) payment object.
   */
  async captureCharge(
    credentials: Credentials,
    id: string,
    data?: { amount?: number },
  ): Promise<Charge> {
    const body: Record<string, unknown> = { paymentType: PAYMENT_TYPE.CAPTURE }
    if (data?.amount !== undefined) body.amount = toDecimalString(data.amount)
    const res = await this.client(credentials).post<RawHyperpayPayment>(
      `${PAYMENTS_PATH}/${id}`,
      body,
    )
    return transformCharge(res ?? {})
  }

  /**
   * Cancel an uncaptured authorization by reversing it (`paymentType=RV`).
   * Returns the resulting reversal payment object mapped onto the canonical
   * charge (status `cancelled`).
   */
  async cancelCharge(credentials: Credentials, id: string): Promise<Charge> {
    const res = await this.client(credentials).post<RawHyperpayPayment>(`${PAYMENTS_PATH}/${id}`, {
      paymentType: PAYMENT_TYPE.REVERSAL,
    })
    return transformCharge(res ?? {})
  }

  // ── Refunds ────────────────────────────────────────────────────────────────

  /**
   * A HyperPay refund is itself a payment object; read it back by its id. The
   * canonical `chargeId` (the original payment) is not present on a bare GET, so
   * we leave it empty here — webhook/create paths supply it.
   */
  async getRefund(credentials: Credentials, id: string): Promise<Refund> {
    const res = await this.client(credentials).get<RawHyperpayRefund>(`${PAYMENTS_PATH}/${id}`)
    return transformRefund(res ?? {})
  }

  /**
   * Refund a charge via `POST /v1/payments/{chargeId}` with `paymentType=RF`.
   * Refunds the full charged amount by default, or a partial `amount` when
   * supplied. The original payment id is threaded into the transform as the
   * canonical `chargeId`.
   */
  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    if (!data.chargeId) throw new Error('chargeId required for HyperPay refund')
    if (!data.currency) throw new Error('currency required for HyperPay refund')
    const body: Record<string, unknown> = {
      paymentType: PAYMENT_TYPE.REFUND,
      currency: data.currency.toUpperCase(),
    }
    if (data.amount !== undefined) body.amount = toDecimalString(data.amount)
    const res = await this.client(credentials).post<RawHyperpayRefund>(
      `${PAYMENTS_PATH}/${data.chargeId}`,
      body,
    )
    return transformRefund({ ...(res ?? {}), referencedId: data.chargeId })
  }

  // ── Payment Methods ────────────────────────────────────────────────────────

  /**
   * Retrieve a stored card registration via `GET /v1/secureRegistrations/{id}`.
   * Returns the tokenized card details (last4, brand, expiry, holder) mapped
   * onto the canonical PaymentMethod. Rate-limited to 100 requests/hour per
   * registrationId by HyperPay.
   */
  async getPaymentMethod(credentials: Credentials, id: string): Promise<PaymentMethod> {
    const res = await this.client(credentials).get<RawHyperpayRegistration>(
      `/v1/secureRegistrations/${id}`,
    )
    return transformPaymentMethod(res ?? {})
  }
}
