/**
 * Cellulant (Tingg) adapter — payments vertical (Africa anchor).
 *
 * Tingg is Cellulant's pan-African checkout platform: a single collection
 * "request" carries an amount, currency, customer reference (`account_number`)
 * and a lifecycle status, so it maps onto the canonical **Charge**. The
 * checkout-api exposes three operations we model:
 *
 *   - createCharge  → POST /v3/checkout-api/checkout/request   (raise a request)
 *   - getCharge     → GET  /v3/checkout-api/query/{service}/{tx} (query status)
 *   - createRefund  → POST /v3/checkout-api/refund/request       (refund a payment)
 *
 * Auth: an `api_key`-style flow with a static `apiKey` header plus an OAuth2
 * `client_credentials` pair exchanged for a short-lived JWT bearer. Both the
 * JWT and the static key go on every request (see client.ts / auth.ts).
 *
 * Tingg has no cursor/page list endpoints (each request is queried by its own
 * id) and no first-class customer, payment-method, subscription, invoice,
 * payout, dispute, plan/price/product or balance-transaction resources, so
 * those methods are deliberately left off and auto-501.
 *
 * Webhooks: Tingg POSTs JSON payment notifications to the merchant's
 * `callback_url`, but the documented contract carries no signature / HMAC /
 * checksum, so there is nothing to verify; no webhook handler is implemented.
 *
 * Docs: https://docs.tingg.africa/reference/authenticate-requests
 */

// ── Resource coverage ──────────────────────────────────────────────
// Available:    charge, refund
// Unavailable:  balance-transaction — Tingg checkout API has no balance-transaction ledger endpoint; only per-request status queries are available.
// Unavailable:  customer — Tingg has no customer management resource; payers are identified inline per request via account_number/msisdn.
// Unavailable:  dispute — Tingg checkout API exposes no dispute or chargeback endpoints.
// Unavailable:  invoice — The "Create Bill" endpoint lives on a separate paybylink-apis host not integrated here; no list/get invoice endpoints are documented.
// Unavailable:  payment-method — Tingg has no tokenised payment-method management API; payment channel is selected at checkout time.
// Unavailable:  payout — Tingg Payouts is a separate product on a different API (v1/global-api/payments) with its own credentials; not part of the checkout-api integrated here.
// Unavailable:  plan — Tingg has no plan, price, or product catalogue API.
// Unavailable:  subscription — Tingg has no recurring-subscription API.

import type {
  BaseAdapter,
  CredentialField,
  Credentials,
} from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Charge } from '../../schema/charge'
import type { Refund } from '../../schema/refund'

import { CHECKOUT_REQUEST_PATH, REFUND_REQUEST_PATH, queryStatusPath } from './constants'
import { exchangeCredentials } from './auth'
import { CellulantClient } from './client'

import {
  transformCharge,
  untransformCharge,
  transformCheckoutResponse,
  type RawCellulantRequest,
  type RawCellulantCheckoutResponse,
} from './transform/charge'
import { transformRefund, type RawCellulantRefund } from './transform/refund'

export class CellulantAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'cellulant'
  readonly version = '0.1.0'

  getAuthUrl(): string {
    throw new Error('Cellulant (Tingg) uses an API key; submit it via the Connect Link form.')
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('Cellulant (Tingg) uses an API key; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return [
      {
        name: 'apiKey',
        label: 'API key',
        type: 'password',
        required: true,
        helpText:
          'Static Tingg API key (Developer Portal → API keys). Sent as the apikey header on every request.',
      },
      {
        name: 'clientId',
        label: 'Client ID',
        type: 'text',
        required: true,
        helpText: 'OAuth2 client ID used for the client_credentials grant.',
      },
      {
        name: 'clientSecret',
        label: 'Client secret',
        type: 'password',
        required: true,
        helpText: 'OAuth2 client secret used for the client_credentials grant.',
      },
      {
        name: 'environment',
        label: 'Environment',
        type: 'select',
        required: true,
        options: [
          { value: 'production', label: 'Production (api.tingg.africa)' },
          { value: 'sandbox', label: 'Sandbox / approval (api-approval.tingg.africa)' },
        ],
        helpText: 'Tingg uses separate hosts per environment.',
      },
    ]
  }

  async exchangeCredentials(fields: Record<string, string>): Promise<Credentials> {
    return exchangeCredentials(fields)
  }

  async refreshCredentials(credentials: Credentials): Promise<Credentials> {
    // The client transparently re-mints the JWT from the stored
    // client-credentials pair when it expires, so nothing to do here.
    return credentials
  }

  private client(credentials: Credentials): CellulantClient {
    return new CellulantClient(credentials)
  }

  // ── Charges (Tingg collection requests) ──────────────────────────────────────

  /**
   * Query a previously raised request by its `service_code` and
   * `merchant_transaction_id`. The router passes a single `id`; we accept the
   * composite form `service_code:merchant_transaction_id` so both identifiers
   * survive the round-trip.
   */
  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const sep = id.indexOf(':')
    if (sep === -1) {
      throw new Error(
        'Cellulant (Tingg) getCharge id must be "service_code:merchant_transaction_id".',
      )
    }
    const serviceCode = id.slice(0, sep)
    const merchantTransactionId = id.slice(sep + 1)
    const res = await this.client(credentials).get<RawCellulantRequest>(
      queryStatusPath(serviceCode, merchantTransactionId),
    )
    return transformCharge(res ?? {})
  }

  /** Raise a new collection request (hosted checkout). */
  async createCharge(credentials: Credentials, data: Partial<Charge>): Promise<Charge> {
    const body = untransformCharge(data)
    const res = await this.client(credentials).post<RawCellulantCheckoutResponse>(
      CHECKOUT_REQUEST_PATH,
      body,
    )
    return transformCheckoutResponse(res ?? {}, data)
  }

  // ── Refunds (POST /v3/checkout-api/refund/request) ───────────────────────────

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    const merchantTransactionId = data.chargeId
    if (!merchantTransactionId) {
      throw new Error('chargeId (Tingg merchant_transaction_id) is required for a refund.')
    }
    const md = data.metadata ?? {}
    const body: Record<string, unknown> = {
      merchant_transaction_id: merchantTransactionId,
      service_code: md.service_code,
      payment_id: md.payment_id,
      refund_type: md.refund_type ?? 'FULL',
      amount: data.amount != null ? (data.amount / 100).toFixed(2) : undefined,
      currency_code: data.currency?.toUpperCase(),
      refund_narration: md.refund_narration ?? data.reason ?? 'Customer refund',
      refund_reference: md.refund_reference ?? merchantTransactionId,
    }
    const res = await this.client(credentials).post<RawCellulantRefund>(
      REFUND_REQUEST_PATH,
      body,
    )
    return transformRefund(res ?? {}, {
      chargeId: merchantTransactionId,
      amount: data.amount,
      currency: data.currency,
    })
  }
}
