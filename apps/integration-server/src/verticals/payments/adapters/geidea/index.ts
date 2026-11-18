/**
 * Geidea adapter — payments vertical (MENA anchor: Egypt, UAE, KSA).
 *
 * Geidea is order-centric: an **Order** carries amount, currency, customer
 * email and payment status, so it maps onto the canonical **Charge**. The
 * direct API exposes a single order endpoint for both search (Skip/Take) and
 * retrieval (by orderId / merchantReferenceId), a Pay endpoint to create a
 * charge, and a Refund endpoint taken against an order.
 *
 * Auth: HTTP Basic — merchant public key as the username, merchant API password
 * as the password. The key pair selects the environment (test vs live) and the
 * `region` field selects the regional host (Egypt/UAE vs KSA). No OAuth, no
 * refresh.
 *
 * Webhooks: HMAC-SHA-256 signature over a fixed field concatenation, keyed on
 * the API password, delivered Base64-encoded in the callback's `signature`
 * field (see webhook.ts).
 *
 * ── Resource coverage ──────────────────────────────────────────────────────
 * Available:   charge, refund, invoice (eInvoice/Pay-by-Link), subscription
 * Unavailable: balance-transaction — no balance/ledger API in Geidea Direct API
 * Unavailable: customer — customer data is embedded in orders; no listable customer resource
 * Unavailable: dispute — chargeback handling is internal; no dispute API endpoint
 * Unavailable: payment-method — only card tokenization; no listable payment-method resource
 * Unavailable: payout — settlement payouts are pushed to merchant bank accounts; no API
 * Unavailable: plan — no plan/product/price catalog API; billing uses inline cycle params
 */

import type {
  BaseAdapter,
  CredentialField,
  Credentials,
  QueryParams,
} from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Charge } from '../../schema/charge'
import type { Refund } from '../../schema/refund'
import type { Invoice } from '../../schema/invoice'
import type { Subscription } from '../../schema/subscription'
import type { WebhookEvent } from '../../schema/webhook'

import { DEFAULT_PAGE_SIZE, PAY_PATH, REFUND_PATH, ORDER_PATH, EINVOICE_PATH, SUBSCRIPTION_PATH } from './constants'
import { buildCredentials } from './auth'
import { GeideaClient } from './client'
import { parseGeideaWebhookEvents, verifyGeideaWebhook } from './webhook'

import { transformCharge, type RawGeideaOrder } from './transform/charge'
import { transformRefund, extractRefundTransaction } from './transform/refund'
import { transformInvoice, type RawGeideaEInvoice } from './transform/invoice'
import { transformSubscription, type RawGeideaSubscription } from './transform/subscription'
import { fromMinorUnits } from './transform/shared'

/** Geidea order-search envelope. */
interface GeideaOrderListResponse {
  orders?: RawGeideaOrder[]
  totalCount?: number
  totalAmount?: number
  responseCode?: string
  detailedResponseCode?: string
}

/** Single-order responses wrap the order under `order`. */
interface GeideaOrderResponse {
  order?: RawGeideaOrder
  responseCode?: string
  detailedResponseCode?: string
  responseMessage?: string
  detailedResponseMessage?: string
}

/** eInvoice list response envelope (GET /payment-intent/api/v1/direct/eInvoice). */
interface GeideaEInvoiceListResponse {
  paymentIntents?: RawGeideaEInvoice[]
  totalCount?: number
  responseCode?: string
  detailedResponseCode?: string
}

/** Single eInvoice response wraps under `paymentIntent`. */
interface GeideaEInvoiceResponse {
  paymentIntent?: RawGeideaEInvoice
  responseCode?: string
  detailedResponseCode?: string
  responseMessage?: string
  detailedResponseMessage?: string
}

/** Subscription response — single record. */
interface GeideaSubscriptionResponse {
  subscription?: RawGeideaSubscription
  responseCode?: string
  detailedResponseCode?: string
  responseMessage?: string
  detailedResponseMessage?: string
}

export class GeideaAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'geidea'
  readonly version = '0.1.0'

  getAuthUrl(): string {
    throw new Error('Geidea uses an API key; submit it via the Connect Link form.')
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('Geidea uses an API key; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return [
      {
        name: 'merchantPublicKey',
        label: 'Merchant public key',
        type: 'text',
        required: true,
        placeholder: '40225a89-be31-4f2e-a10a-27b2bbc4e3b3',
        helpText:
          'Your Geidea merchant public key (Merchant Portal → Developers). The key pair selects test vs live.',
      },
      {
        name: 'apiPassword',
        label: 'API password',
        type: 'password',
        required: true,
        helpText: 'Your Geidea API password (Merchant Portal → Developers). Also signs callbacks.',
      },
      {
        name: 'region',
        label: 'Region',
        type: 'select',
        required: false,
        helpText: 'Regional host. Choose KSA for Saudi-provisioned accounts; otherwise Egypt/UAE.',
        options: [
          { value: 'default', label: 'Egypt / UAE' },
          { value: 'ksa', label: 'Saudi Arabia (KSA)' },
        ],
      },
    ]
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return buildCredentials(fields)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    return credentials
  }

  verifyWebhook(payload: Buffer, headers: Record<string, string>, secret: string): boolean {
    return verifyGeideaWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseGeideaWebhookEvents(payload)
  }

  private client(credentials: Credentials): GeideaClient {
    return new GeideaClient(credentials)
  }

  /** Geidea order search paginates with Skip/Take and filters by date range. */
  private pageParams(params: QueryParams): Record<string, unknown> {
    const out: Record<string, unknown> = {
      Take: params.limit ?? DEFAULT_PAGE_SIZE,
      Skip: typeof params.page === 'number' ? (params.page - 1) * (params.limit ?? DEFAULT_PAGE_SIZE) : 0,
      SortBy: 'CreatedDate',
      SortOrder: 'DESC',
    }
    if (params.updatedAfter instanceof Date) out.FromDate = params.updatedAfter.toISOString()
    return out
  }

  // ── Charges (Geidea Orders) ──────────────────────────────────────────────
  async listCharges(credentials: Credentials, params: QueryParams): Promise<Charge[]> {
    const res = await this.client(credentials).get<GeideaOrderListResponse>(
      ORDER_PATH,
      this.pageParams(params),
    )
    return (res.orders ?? []).map(transformCharge)
  }

  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const res = await this.client(credentials).get<GeideaOrderResponse>(
      `${ORDER_PATH}/${encodeURIComponent(id)}`,
    )
    return transformCharge(res.order ?? {})
  }

  async createCharge(credentials: Credentials, data: Partial<Charge>): Promise<Charge> {
    const currency = (data.currency ?? 'EGP').toUpperCase()
    const res = await this.client(credentials).post<GeideaOrderResponse>(PAY_PATH, {
      orderId: data.id,
      amount: data.amount !== undefined ? fromMinorUnits(data.amount, currency) : undefined,
      currency,
      paymentOperation: 'Pay',
      merchantReferenceId: data.metadata?.merchantReferenceId,
    })
    return transformCharge(res.order ?? {})
  }

  // ── Refunds (POST /pgw/api/v2/direct/refund) ─────────────────────────────
  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    const orderId = data.chargeId
    if (!orderId) throw new Error('chargeId (Geidea orderId) is required for a refund')
    const currency = (data.currency ?? 'EGP').toUpperCase()
    const res = await this.client(credentials).post<GeideaOrderResponse>(REFUND_PATH, {
      orderId,
      refundAmount: data.amount !== undefined ? fromMinorUnits(data.amount, currency) : undefined,
    })
    const order = res.order ?? { orderId, currency, amount: data.amount }
    return transformRefund(order, extractRefundTransaction(order))
  }

  // ── Invoices (Geidea eInvoice / Pay-by-Link) ──────────────────────────────
  async listInvoices(credentials: Credentials, params: QueryParams): Promise<Invoice[]> {
    const res = await this.client(credentials).get<GeideaEInvoiceListResponse>(
      EINVOICE_PATH,
      this.pageParams(params),
    )
    return (res.paymentIntents ?? []).map(transformInvoice)
  }

  async getInvoice(credentials: Credentials, id: string): Promise<Invoice> {
    const res = await this.client(credentials).get<GeideaEInvoiceResponse>(
      `${EINVOICE_PATH}/${encodeURIComponent(id)}`,
    )
    return transformInvoice(res.paymentIntent ?? {})
  }

  // ── Subscriptions ─────────────────────────────────────────────────────────
  async getSubscription(credentials: Credentials, id: string): Promise<Subscription> {
    const res = await this.client(credentials).get<GeideaSubscriptionResponse>(
      `${SUBSCRIPTION_PATH}/${encodeURIComponent(id)}`,
    )
    return transformSubscription(res.subscription ?? {})
  }
}
