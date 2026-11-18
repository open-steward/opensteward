/**
 * Computop Paygate adapter — payments vertical.
 *
 * Computop Paygate is a German/European omnichannel payment service provider
 * (Computop GmbH) supporting 350+ payment methods. This adapter targets the
 * Paygate REST API v2.
 *
 * Auth: HTTP Basic — Merchant ID (username) + API key (password), packed into
 * a single Base64 token (see `auth.ts`). Submitted via the Connect Link form.
 *
 * Resource coverage maps to what the Paygate REST API actually exposes:
 *   - Payments → canonical Charges: retrieve (by payId / transId), create,
 *     capture, reverse (cancel an authorisation), refund.
 *   - Customer vault → Customers: list, get, update, delete.
 *   - Stored payment methods → Payment methods: list / get / detach (per
 *     customer; the parent `customerId` rides on `QueryParams`).
 *
 * The API has no global "list payments" / "list refunds" endpoints, so those
 * resource methods are intentionally omitted and the router auto-returns 501.
 *
 * Webhooks: Computop's Enhanced Webhook is HMAC-signed, but the exact header
 * name and algorithm are not in the public REST spec, so `verifyWebhook` is
 * not implemented. `parseWebhookEvents` handles the documented payload shape
 * (a `payId` plus, for the Enhanced variant, the full payment object).
 *
 * Docs: https://developer.computop.com / https://computop-docs.redocly.app
 */

// ── Resource coverage ──────────────────────────────────────────────
// Available:   charge, customer, payment-method, refund
// Unavailable: balance-transaction — settlement data is CSV/SFTP only; no REST endpoint.
// Unavailable: dispute            — no chargeback/dispute endpoint in Paygate REST API v2.
// Unavailable: invoice            — no invoice endpoint in Paygate REST API v2.
// Unavailable: payout             — payout/settlement data is CSV/SFTP only; no REST endpoint.
// Unverified:  plan               — /payment-plans endpoints exist but response schema is inaccessible (Redocly sub-pages 404, developer.computop.com requires login).
// Unverified:  subscription       — recurring billing uses /payment-plans; response schema inaccessible for same reason as plan.

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
import type {
  WebhookEvent,
  WebhookResourceType,
  WebhookAction,
} from '../../schema/webhook'

import { DEFAULT_PAGE } from './constants'
import { buildCredentials } from './auth'
import { ComputopClient, type ComputopPage } from './client'

import { transformCharge, type RawComputopPayment } from './transform/charge'
import { transformCustomer, type RawComputopCustomer } from './transform/customer'
import {
  transformPaymentMethod,
  type RawComputopPaymentMethod,
} from './transform/payment-method'
import { transformRefund, type RawComputopRefund } from './transform/refund'

function requireParam(params: QueryParams, key: string, label: string): string {
  const value = params[key]
  if (typeof value !== 'string' || !value) {
    throw new Error(`Computop ${label} requires a "${key}" query parameter.`)
  }
  return value
}

export class ComputopAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'computop'
  readonly version = '0.1.0'

  // ── Auth ────────────────────────────────────────────────────────────────

  getAuthUrl(): string {
    throw new Error('Computop uses Basic-auth credentials; submit them via the Connect Link form.')
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('Computop uses Basic-auth credentials; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return [
      {
        name: 'merchantId',
        label: 'Merchant ID',
        type: 'text',
        required: true,
        helpText: 'Your Computop Paygate MerchantID (used as the Basic-auth username).',
      },
      {
        name: 'apiKey',
        label: 'API key',
        type: 'password',
        required: true,
        helpText: 'Your Computop Paygate API key (used as the Basic-auth password).',
      },
    ]
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return buildCredentials(fields)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  // ── Webhooks ──────────────────────────────────────────────────────────────

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    const data =
      (payload['data'] as Record<string, unknown> | undefined) ??
      (payload['payment'] as Record<string, unknown> | undefined) ??
      payload
    const payId = String(data['payId'] ?? payload['payId'] ?? '')
    const status = String(data['status'] ?? payload['status'] ?? '').toUpperCase()
    const eventType = String(payload['eventType'] ?? payload['type'] ?? `payment.${status || 'updated'}`)
    return [
      {
        platform: 'computop',
        type: eventType,
        resourceType: 'charges' satisfies WebhookResourceType,
        action: mapWebhookAction(status),
        resourceId: payId,
        payload,
      },
    ]
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private client(credentials: Credentials): ComputopClient {
    return new ComputopClient(credentials)
  }

  // ── Charges (payments) ──────────────────────────────────────────────────

  /**
   * Retrieve a payment. By default `id` is treated as a Paygate `payId`; pass
   * `?by=transId` to look up by the merchant transaction id instead.
   */
  async getCharge(credentials: Credentials, id: string, params?: QueryParams): Promise<Charge> {
    const byTransId = params?.['by'] === 'transId'
    const path = byTransId ? `/payments/getByTransId/${id}` : `/payments/getByPayId/${id}`
    const raw = await this.client(credentials).get<RawComputopPayment>(path)
    return transformCharge(raw)
  }

  async createCharge(credentials: Credentials, data: Partial<Charge>): Promise<Charge> {
    const body: Record<string, unknown> = {
      transId: data.externalId ?? data.id,
      amount: { value: data.amount, currency: data.currency },
    }
    if (data.statementDescriptor) body.statementDescriptor = data.statementDescriptor
    if (data.customerId || data.receiptEmail) {
      body.customerInfo = {
        gatewayCustomerId: data.customerId,
        email: data.receiptEmail,
      }
    }
    if (data.metadata) body.metadata = data.metadata
    const raw = await this.client(credentials).post<RawComputopPayment>('/payments', body)
    return transformCharge(raw)
  }

  /** Capture an authorised payment. `id` is the Paygate `payId`. */
  async captureCharge(
    credentials: Credentials,
    id: string,
    data?: { amount?: number },
  ): Promise<Charge> {
    const body: Record<string, unknown> = { payId: id }
    if (data?.amount !== undefined) body.amount = { value: data.amount }
    const raw = await this.client(credentials).post<RawComputopPayment>(
      `/payments/${id}/captures`,
      body,
    )
    return transformCharge(raw)
  }

  /** Reverse (cancel) an uncaptured authorisation. `id` is the Paygate `payId`. */
  async cancelCharge(credentials: Credentials, id: string): Promise<Charge> {
    const raw = await this.client(credentials).post<RawComputopPayment>(
      `/payments/${id}/reversals`,
      { payId: id },
    )
    return transformCharge(raw)
  }

  // ── Refunds ────────────────────────────────────────────────────────────

  /** Refund a captured payment. `data.chargeId` is the original `payId`. */
  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    if (!data.chargeId) throw new Error('chargeId (payId) is required for a Computop refund.')
    const body: Record<string, unknown> = {
      transId: data.chargeId,
      amount: { value: data.amount, currency: data.currency },
    }
    if (data.metadata) body.metadata = data.metadata
    const raw = await this.client(credentials).post<RawComputopRefund>(
      `/payments/${data.chargeId}/refunds`,
      body,
    )
    return transformRefund(raw, data.chargeId)
  }

  // ── Customers ──────────────────────────────────────────────────────────

  async listCustomers(credentials: Credentials, params: QueryParams): Promise<Customer[]> {
    const res = await this.client(credentials).get<ComputopPage<RawComputopCustomer>>('/customers', {
      page: typeof params.page === 'number' ? params.page : DEFAULT_PAGE,
    })
    return (res.data ?? []).map(transformCustomer)
  }

  async getCustomer(credentials: Credentials, id: string): Promise<Customer> {
    const raw = await this.client(credentials).get<RawComputopCustomer>(`/customers/${id}`)
    return transformCustomer(raw)
  }

  async updateCustomer(
    credentials: Credentials,
    id: string,
    data: Partial<Customer>,
  ): Promise<Customer> {
    const body: Record<string, unknown> = {}
    if (data.email !== undefined) body.email = data.email
    if (data.name) {
      const [firstName, ...rest] = data.name.split(' ')
      body.firstName = firstName
      if (rest.length) body.lastName = rest.join(' ')
    }
    const raw = await this.client(credentials).patch<RawComputopCustomer>(`/customers/${id}`, body)
    return transformCustomer(raw)
  }

  async deleteCustomer(credentials: Credentials, id: string): Promise<void> {
    await this.client(credentials).delete(`/customers/${id}`)
  }

  // ── Payment methods (per customer) ───────────────────────────────────────

  async listPaymentMethods(
    credentials: Credentials,
    params: QueryParams,
  ): Promise<PaymentMethod[]> {
    const customerId = requireParam(params, 'customerId', 'listPaymentMethods')
    const res = await this.client(credentials).get<RawComputopPaymentMethod[] | ComputopPage<RawComputopPaymentMethod>>(
      `/customers/${customerId}/paymentMethods`,
    )
    const list = Array.isArray(res) ? res : (res.data ?? [])
    return list.map((pm) => transformPaymentMethod(pm, customerId))
  }

  async getPaymentMethod(
    credentials: Credentials,
    id: string,
    params?: QueryParams,
  ): Promise<PaymentMethod> {
    const customerId = requireParam(params ?? {}, 'customerId', 'getPaymentMethod')
    const raw = await this.client(credentials).get<RawComputopPaymentMethod>(
      `/customers/${customerId}/paymentMethods/${id}`,
    )
    return transformPaymentMethod(raw, customerId)
  }

  async detachPaymentMethod(
    credentials: Credentials,
    id: string,
    params?: QueryParams,
  ): Promise<void> {
    const customerId = requireParam(params ?? {}, 'customerId', 'detachPaymentMethod')
    await this.client(credentials).delete(`/customers/${customerId}/paymentMethods/${id}`)
  }
}

function mapWebhookAction(status: string): WebhookAction {
  switch (status) {
    case 'OK':
    case 'CAPTURED':
    case 'SUCCESS':
      return 'paid'
    case 'AUTHORIZED':
    case 'AUTHORISED':
      return 'succeeded'
    case 'REFUNDED':
      return 'refunded'
    case 'FAILED':
    case 'ERROR':
      return 'failed'
    case 'VOID':
    case 'CANCELLED':
    case 'CANCELED':
      return 'cancelled'
    default:
      return 'unknown'
  }
}
