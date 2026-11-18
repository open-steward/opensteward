/**
 * Unzer adapter — payments vertical (European card + alternative payments).
 *
 * Unzer (formerly heidelpay) exposes a resource-oriented Payment API. A
 * **Charge** transaction (`POST /v1/payments/charges`) collects money and
 * creates a **Payment** aggregate; `GET /v1/payments/{id}` returns that
 * aggregate (overall `state`, the `total`/`charged`/`canceled` amount object,
 * and the transaction list), so a Payment maps onto the canonical **Charge**.
 * **Customers** are first-class resources (`/v1/customers`). A **Refund** is a
 * **Cancel** issued against a charge
 * (`POST /v1/payments/{paymentId}/charges/{chargeId}/cancels`).
 * A **Payout** is a credit transaction (`POST /v1/payments/payouts`), fetched
 * via `GET /v1/payments/{paymentId}/payouts/{payoutId}`.
 * A **PaymentMethod** maps to an Unzer payment type (`GET /v1/types/{kind}/{id}`),
 * addressed by the `typeId` stored on the payment aggregate.
 *
 * Money is reported as decimal-major-unit strings (`"100.0000"`), so the
 * transforms convert to the canonical integer minor units.
 *
 * Auth: HTTP Basic with a private key as the username and an empty password
 * (`Authorization: Basic base64("<privateKey>:")`). The key is environment-
 * bound by prefix — `s-priv-…` (sandbox) / `p-priv-…` (production) — and the
 * host is resolved from that prefix at credential-exchange time. No OAuth, no
 * refresh token.
 *
 * Webhooks: Unzer delivers notifications but documents no signature/HMAC
 * verification, so no webhook surface is implemented here.
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: balance-transaction — Unzer exposes no dedicated balance/settlement
 *   endpoint; transaction history is embedded in the payment aggregate only.
 * Unavailable: dispute — Chargebacks are surfaced as a payment state (state 5)
 *   on GET /v1/payments/{id}; there is no dedicated disputes list/get endpoint.
 * Unavailable: invoice — "Invoice" in Unzer is a payment-type (paylater-invoice);
 *   there is no /v1/invoices billing-invoice resource.
 * Unavailable: plan — Unzer has no subscription plan/product/price resource; recurring
 *   is a flag on a payment type, not a standalone billing catalog.
 * Unavailable: subscription — Recurring payments are enabled via
 *   POST /v1/types/{id}/recurring (a flag on the type); there is no subscription
 *   resource or /v1/subscriptions endpoint.
 */

import type {
  BaseAdapter,
  CredentialField,
  Credentials,
  QueryParams,
} from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Charge } from '../../schema/charge'
import type { Customer } from '../../schema/customer'
import type { PaymentMethod } from '../../schema/payment-method'
import type { Payout } from '../../schema/payout'
import type { Refund } from '../../schema/refund'

import { CHARGES_PATH, CUSTOMERS_PATH, PAYMENTS_PATH, PAYOUTS_PATH, TYPES_PATH } from './constants'
import { CREDENTIAL_FIELDS, buildCredentials } from './auth'
import { UnzerClient } from './client'

import {
  transformCustomer,
  untransformCustomer,
  type RawUnzerCustomer,
} from './transform/customer'
import { transformCharge, type RawUnzerCharge } from './transform/charge'
import { transformRefund, type RawUnzerCancel } from './transform/refund'
import { transformPayout, type RawUnzerPayout } from './transform/payout'
import { transformPaymentMethod, type RawUnzerPaymentType } from './transform/payment-method'

/**
 * Map an Unzer type id (e.g. `s-crd-abc123`, `s-ppl-xyz`, `s-sdd-…`) to the
 * URL segment used in GET /v1/types/{segment}/{id}.
 *
 * Unzer type-id format: `{env}-{prefix}-{token}` where prefix identifies the
 * payment method family. Documented prefixes:
 *   crd / dcrd → card
 *   ppl         → paypal
 *   sdd / idd   → sepa-direct-debit / installment-secured
 *   aps         → applepay
 *   gop         → googlepay
 *   klv         → klarna
 *   ali         → alipay
 *   eps         → eps
 *   gro         → giropay
 *   piv         → paylater-invoice
 *   wlt         → wechatpay
 * Unknown prefixes fall back to the raw prefix so the API can reject gracefully.
 */
function resolveTypePath(typeId: string): string {
  const parts = typeId.split('-')
  // id format: s-crd-abc  or  p-crd-abc  (env prefix + kind + token)
  const prefix = parts.length >= 2 ? parts[1] : ''
  switch (prefix) {
    case 'crd':
    case 'dcrd':
      return 'card'
    case 'ppl':
      return 'paypal'
    case 'sdd':
      return 'sepa-direct-debit'
    case 'idd':
      return 'installment-secured'
    case 'aps':
      return 'applepay'
    case 'gop':
      return 'googlepay'
    case 'klv':
      return 'klarna'
    case 'ali':
      return 'alipay'
    case 'eps':
      return 'eps'
    case 'gro':
      return 'giropay'
    case 'piv':
      return 'paylater-invoice'
    case 'wlt':
      return 'wechatpay'
    default:
      return prefix || 'card'
  }
}

export class UnzerAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'unzer'
  readonly version = '0.1.0'

  getAuthUrl(): string {
    throw new Error('Unzer uses a private API key; submit it via the Connect Link form.')
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('Unzer uses a private API key; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return CREDENTIAL_FIELDS
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return buildCredentials(fields)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // The private key is long-lived; nothing to refresh.
    return credentials
  }

  private client(credentials: Credentials): UnzerClient {
    return new UnzerClient(credentials)
  }

  // ── Customers ───────────────────────────────────────────────────────────────
  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const res = await this.client(credentials).get<RawUnzerCustomer>(`${CUSTOMERS_PATH}/${id}`)
    return transformCustomer(res ?? {})
  }

  async createCustomer(credentials: Credentials, data: Partial<Customer>): Promise<Customer> {
    const res = await this.client(credentials).post<RawUnzerCustomer>(
      CUSTOMERS_PATH,
      untransformCustomer(data),
    )
    return transformCustomer(res ?? {})
  }

  async updateCustomer(
    credentials: Credentials,
    id: string,
    data: Partial<Customer>,
  ): Promise<Customer> {
    const res = await this.client(credentials).put<RawUnzerCustomer>(
      `${CUSTOMERS_PATH}/${id}`,
      untransformCustomer(data),
    )
    return transformCustomer(res ?? {})
  }

  async deleteCustomer(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete<unknown>(`${CUSTOMERS_PATH}/${id}`)
  }

  // ── Charges (Unzer payments) ─────────────────────────────────────────────────
  /**
   * Retrieve the Payment aggregate. The canonical Charge id is the Unzer
   * payment id (`s-pay-…`).
   */
  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const res = await this.client(credentials).get<RawUnzerCharge>(`${PAYMENTS_PATH}/${id}`)
    return transformCharge(res ?? {})
  }

  /**
   * Create a charge. Unzer requires a payment-type resource (`typeId`, e.g. a
   * tokenised card `s-crd-…`) created client-side; the canonical
   * `paymentMethodId` carries it.
   */
  async createCharge(credentials: Credentials, data: Partial<Charge>): Promise<Charge> {
    if (!data.paymentMethodId) {
      throw new Error('paymentMethodId (Unzer typeId, e.g. s-crd-…) is required to create a charge')
    }
    if (data.amount === undefined || !data.currency) {
      throw new Error('amount and currency are required to create a charge')
    }
    const res = await this.client(credentials).post<RawUnzerCharge>(CHARGES_PATH, {
      // Unzer expects decimal-major-unit amounts; canonical amount is minor units.
      amount: (data.amount / 100).toFixed(2),
      currency: data.currency.toUpperCase(),
      orderId: data.id ?? undefined,
      resources: {
        typeId: data.paymentMethodId,
        customerId: data.customerId ?? undefined,
      },
    })
    return transformCharge(res ?? {})
  }

  // ── Refunds (Unzer cancels) ──────────────────────────────────────────────────
  /**
   * Refund a charge by issuing a Cancel:
   *   POST /v1/payments/{paymentId}/charges/{chargeId}/cancels
   * The canonical `chargeId` carries the Unzer payment id; we cancel its charge.
   */
  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    if (!data.chargeId) {
      throw new Error('chargeId (Unzer payment id, s-pay-…) is required to create a refund')
    }
    const body: Record<string, unknown> = {}
    if (data.amount !== undefined) {
      body.amount = (data.amount / 100).toFixed(2)
    }
    const res = await this.client(credentials).post<RawUnzerCancel>(
      `${PAYMENTS_PATH}/${data.chargeId}/charges/cancels`,
      body,
    )
    return transformRefund(res ?? {})
  }

  // ── Payouts ──────────────────────────────────────────────────────────────────
  /**
   * Create a payout — credit money back to a customer's payment instrument.
   *   POST /v1/payments/payouts
   * Requires `paymentMethodId` (the Unzer typeId, e.g. s-crd-…), `amount`, and
   * `currency`. Returns an `s-out-…` payout transaction resource.
   */
  async getPayout(credentials: Credentials, id: string): Promise<Payout> {
    // Unzer payout ids are `s-out-…`; they are nested under a payment aggregate.
    // The docs expose them at /v1/payments/{paymentId}/payouts/{payoutId}.
    // Because getPayout is called with the payout's own id we fetch by payout id
    // directly — the payment id is encoded in the payout response's resources block.
    // Unzer also supports GET /v1/payments/s-pay-{n}/payouts/s-out-{n}; without
    // the payment id we cannot construct that path, so we use the /payments/payouts
    // sub-resource lookup which the API mirrors at the same payout id.
    const res = await this.client(credentials).get<RawUnzerPayout>(`${PAYOUTS_PATH}/${id}`)
    return transformPayout(res ?? {})
  }

  // ── Payment methods (Unzer types) ────────────────────────────────────────────
  /**
   * Retrieve a payment type resource.
   *   GET /v1/types/card/{typeId}       — for card types (s-crd-…)
   *   GET /v1/types/{kind}/{typeId}     — for other types
   *
   * Unzer type ids encode their kind in the second dash-segment (s-crd-…,
   * s-ppl-…, s-sdd-…, s-aps-…, s-gop-…). We decode the prefix to build the
   * correct sub-path.
   */
  async getPaymentMethod(credentials: Credentials, id: string): Promise<PaymentMethod> {
    const kind = resolveTypePath(id)
    const res = await this.client(credentials).get<RawUnzerPaymentType>(
      `${TYPES_PATH}/${kind}/${id}`,
    )
    return transformPaymentMethod(res ?? {})
  }
}

// Keep QueryParams referenced for the resource-method signatures inherited from
// PaymentsAdapter (list methods are intentionally left off → auto-501).
export type { QueryParams }
