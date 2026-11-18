/**
 * Juspay Express Checkout adapter — payments vertical (India anchor).
 *
 * Juspay is a payment orchestrator: money is modelled as an Order (the charge
 * analogue) with zero or more order-scoped Refunds. There is no global
 * "list all orders/refunds" endpoint and no standalone `GET /refunds/{id}` —
 * refunds are read back from the order's `refunds[]` array.
 *
 *   - getCharge(id)             → id is the merchant `order_id`.
 *   - createCharge(data)        → creates an order (returned as a pending charge).
 *   - createRefund({ chargeId })→ chargeId is the `order_id`.
 *   - getRefund(id)             → id is `"<order_id>:<ref>"`; resolves against
 *                                 the order's refunds[] array.
 *   - getCustomer(id)           → GET /customers/{id}
 *   - createCustomer(data)      → POST /customers
 *   - listPaymentMethods(…)     → POST /customers/{id}/payment_methods
 *   - listSubscriptions(…)      → GET /customers/{customerId}/mandates
 *                                 (mandates are Juspay's subscription analogue)
 *   - getSubscription(id)       → resolves against GET /customers/{customerId}/mandates
 *                                 where id is `"<customer_id>:<mandate_id>"`
 *
 * Auth: HTTP Basic with the API key (`Basic base64("<API_KEY>:")`) plus a
 * static `x-merchantid` header and a per-call `x-routing-id` (no OAuth, no
 * refresh).
 *
 * Money: Juspay quotes MAJOR units (rupees) as a Double; the canonical schema
 * is integer minor units (paise) — transforms scale by 100.
 *
 * Webhooks: Juspay authenticates webhook delivery at the transport layer
 * (configurable Basic auth / custom headers / JWT) rather than signing the
 * raw body, so there is no body-signature to verify here; the platform's
 * webhook plumbing handles delivery auth.
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: balance-transaction — Juspay Express Checkout has no ledger/balance transaction API
 * Unavailable: dispute — Juspay Express Checkout has no chargeback/dispute REST API
 * Unavailable: invoice — Juspay has no invoice API; orders are one-time payments
 * Unavailable: plan — Juspay has no plans/pricing catalog API; mandates carry amount directly
 * Unverified:  payout — Juspay Payouts is a separate product with encrypted request format not confirmed compatible with Express Checkout credentials
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
import type { Refund } from '../../schema/refund'
import type { Subscription } from '../../schema/subscription'

import { ORDERS_PATH } from './constants'
import { buildCredentials } from './auth'
import { JuspayClient } from './client'

import { transformCharge, type RawJuspayOrder } from './transform/charge'
import { transformRefund, type RawJuspayRefund } from './transform/refund'
import { transformCustomer, type RawJuspayCustomer } from './transform/customer'
import {
  transformPaymentMethod,
  type RawJuspayPaymentMethod,
} from './transform/payment-method'
import { transformSubscription, type RawJuspayMandate } from './transform/subscription'
import { toMajorUnits } from './transform/shared'

/** Split a `getRefund` id into its order + refund components.
 *  Accepts `"<order_id>:<ref>"`; falls back to treating the whole string as
 *  the refund ref (caller must then also know the order). */
function splitRefundId(id: string): { orderId?: string; ref: string } {
  const idx = id.indexOf(':')
  if (idx === -1) return { ref: id }
  return { orderId: id.slice(0, idx), ref: id.slice(idx + 1) }
}

/** Split a compound subscription id `"<customer_id>:<mandate_id>"`. */
function splitSubscriptionId(id: string): { customerId?: string; mandateId: string } {
  const idx = id.indexOf(':')
  if (idx === -1) return { mandateId: id }
  return { customerId: id.slice(0, idx), mandateId: id.slice(idx + 1) }
}

/** Juspay list-mandate response envelope. */
interface MandateListResponse {
  total?: number
  offset?: number
  count?: number
  object?: string
  list?: RawJuspayMandate[]
}

/** Juspay saved-payment-methods response envelope. */
interface SavedPaymentMethodsResponse {
  saved_payment_methods?: {
    payment_method_details?: Array<{
      payment_method_type?: string
      list?: RawJuspayPaymentMethod[]
    }>
  }
}

export class JuspayAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'juspay'
  readonly version = '0.1.0'

  getAuthUrl(): string {
    throw new Error(
      'Juspay uses a static API key; submit the API key + merchant id via the Connect Link form.',
    )
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('Juspay uses a static API key; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return [
      {
        name: 'environment',
        label: 'Environment',
        type: 'select',
        required: true,
        options: [
          { value: 'sandbox', label: 'Sandbox (test)' },
          { value: 'production', label: 'Production (live)' },
        ],
      },
      {
        name: 'apiKey',
        label: 'API key',
        type: 'password',
        required: true,
        helpText:
          'Sent as HTTP Basic username (password empty). Found under Settings → API Keys in the Juspay dashboard.',
      },
      {
        name: 'merchantId',
        label: 'Merchant ID',
        type: 'text',
        required: true,
        helpText: 'Sent as the x-merchantid header. Found in the Juspay dashboard.',
      },
    ]
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return buildCredentials(fields)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  private client(credentials: Credentials): JuspayClient {
    return new JuspayClient(credentials)
  }

  // ── Charges (orders) ────────────────────────────────────────────────────────

  /** Fetch an order and present it as a canonical charge. `id` = `order_id`. */
  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const raw = await this.client(credentials).get<RawJuspayOrder>(
      `${ORDERS_PATH}/${encodeURIComponent(id)}`,
      id,
    )
    return transformCharge(raw ?? {})
  }

  /** Create an order. The returned order is presented as a pending charge.
   *  Juspay requires a merchant-supplied `order_id` (≤21 alphanumerics) and a
   *  `customer_id` (empty string for guests). */
  async createCharge(credentials: Credentials, data: Partial<Charge>): Promise<Charge> {
    const orderId = data.id ?? `ord${Date.now()}`
    const customerId = data.customerId ?? ''
    const body: Record<string, unknown> = {
      order_id: orderId,
      amount: toMajorUnits(data.amount),
      currency: data.currency ?? 'INR',
      customer_id: customerId,
    }
    if (data.receiptEmail) body.customer_email = data.receiptEmail
    if (data.description) body['metadata.description'] = data.description
    const raw = await this.client(credentials).postForm<RawJuspayOrder>(
      ORDERS_PATH,
      body,
      customerId || orderId,
    )
    return transformCharge(raw ?? {})
  }

  // ── Refunds ──────────────────────────────────────────────────────────────────

  /** Fetch a single refund. `id` is `"<order_id>:<ref>"`. Juspay has no
   *  standalone refund endpoint, so we read the order and resolve the refund
   *  from its `refunds[]` array. */
  async getRefund(credentials: Credentials, id: string): Promise<Refund> {
    const { orderId, ref } = splitRefundId(id)
    if (!orderId) {
      throw new Error('Juspay refund lookup needs "<order_id>:<ref>"; order id missing.')
    }
    const order = await this.client(credentials).get<RawJuspayOrder & { refunds?: RawJuspayRefund[] }>(
      `${ORDERS_PATH}/${encodeURIComponent(orderId)}`,
      orderId,
    )
    const refunds = Array.isArray(order?.refunds) ? order.refunds : []
    const match = refunds.find((r) => r.ref === ref || r.unique_request_id === ref)
    if (!match) {
      throw new Error(`Juspay refund "${ref}" not found on order "${orderId}".`)
    }
    return transformRefund({ ...match, order_id: orderId })
  }

  /** Create a refund against an order. `data.chargeId` = `order_id`. Returns
   *  the freshly-created refund from the response's `refunds[]` array. */
  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    if (!data.chargeId) throw new Error('chargeId (Juspay order_id) required for refund')
    // Juspay requires a unique idempotency id per refund request.
    const uniqueRequestId = data.id ?? `re_${Date.now()}`
    const body: Record<string, unknown> = {
      unique_request_id: uniqueRequestId,
      amount: toMajorUnits(data.amount),
    }
    const description = data.metadata?.description
    if (description) body['metaData.description'] = description
    const order = await this.client(credentials).postForm<
      RawJuspayOrder & { refunds?: RawJuspayRefund[] }
    >(`${ORDERS_PATH}/${encodeURIComponent(data.chargeId)}/refunds`, body, data.chargeId)
    const refunds = Array.isArray(order?.refunds) ? order.refunds : []
    const created =
      refunds.find((r) => r.unique_request_id === uniqueRequestId) ?? refunds[refunds.length - 1]
    return transformRefund({ ...(created ?? {}), order_id: data.chargeId })
  }

  // ── Customers ────────────────────────────────────────────────────────────────

  /** Fetch a customer by id. `id` is the Juspay customer id or object_reference_id. */
  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const raw = await this.client(credentials).get<RawJuspayCustomer>(
      `/customers/${encodeURIComponent(id)}`,
      id,
    )
    return transformCustomer(raw ?? {})
  }

  /** Create a customer. Requires mobile_number at minimum; email and name are optional. */
  async createCustomer(credentials: Credentials, data: Partial<Customer>): Promise<Customer> {
    const objectReferenceId = data.id ?? `cus_${Date.now()}`
    const body: Record<string, unknown> = {
      object_reference_id: objectReferenceId,
    }
    if (data.phone) body.mobile_number = data.phone.replace(/^\+\d{1,3}/, '')
    if (data.email) body.email_address = data.email
    if (data.name) {
      const parts = data.name.split(' ')
      body.first_name = parts[0]
      if (parts.length > 1) body.last_name = parts.slice(1).join(' ')
    }
    const raw = await this.client(credentials).postForm<RawJuspayCustomer>(
      '/customers',
      body,
      objectReferenceId,
    )
    return transformCustomer(raw ?? {})
  }

  // ── Payment Methods ──────────────────────────────────────────────────────────

  /** List saved payment methods for a customer. `params.customerId` must be provided. */
  async listPaymentMethods(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<PaymentMethod[]> {
    const customerId = String((params as Record<string, unknown>).customerId ?? '')
    if (!customerId) throw new Error('listPaymentMethods requires params.customerId for Juspay')
    const raw = await this.client(credentials).postForm<SavedPaymentMethodsResponse>(
      `/customers/${encodeURIComponent(customerId)}/payment_methods`,
      {},
      customerId,
    )
    const details = raw?.saved_payment_methods?.payment_method_details ?? []
    const methods: PaymentMethod[] = []
    for (const group of details) {
      const list = group.list ?? []
      for (const pm of list) {
        methods.push(transformPaymentMethod({ ...pm, customer_id: customerId }))
      }
    }
    return methods
  }

  // ── Subscriptions (Mandates) ─────────────────────────────────────────────────

  /** List mandates for a customer. `params.customerId` must be provided.
   *  Mandates are Juspay's recurring-payment analogue (subscription). */
  async listSubscriptions(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<Subscription[]> {
    const customerId = String((params as Record<string, unknown>).customerId ?? '')
    if (!customerId) throw new Error('listSubscriptions requires params.customerId for Juspay')
    const raw = await this.client(credentials).get<MandateListResponse>(
      `/customers/${encodeURIComponent(customerId)}/mandates`,
      customerId,
    )
    return (raw?.list ?? []).map((m) =>
      transformSubscription({ ...m, customer_id: customerId }),
    )
  }

  /** Fetch a single mandate by compound id `"<customer_id>:<mandate_id>"`. */
  async getSubscription(credentials: Credentials, id: string): Promise<Subscription> {
    const { customerId, mandateId } = splitSubscriptionId(id)
    if (!customerId) {
      throw new Error(
        'Juspay subscription lookup needs "<customer_id>:<mandate_id>"; customer id missing.',
      )
    }
    const raw = await this.client(credentials).get<MandateListResponse>(
      `/customers/${encodeURIComponent(customerId)}/mandates`,
      customerId,
    )
    const list = raw?.list ?? []
    const match = list.find((m) => m.mandate_id === mandateId)
    if (!match) {
      throw new Error(`Juspay mandate "${mandateId}" not found for customer "${customerId}".`)
    }
    return transformSubscription({ ...match, customer_id: customerId })
  }
}
