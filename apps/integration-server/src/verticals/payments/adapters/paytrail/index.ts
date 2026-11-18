/**
 * Paytrail adapter — payments vertical.
 *
 * Auth: API key (Bearer token). NOTE: the first-party docs say "All API calls
 * need to be signed using HMAC and SHA-256 or SHA-512." with checkout-account
 * (merchant ID) headers; this adapter does not sign requests yet, so the only
 * remaining network method (createRefund, a write) is unverified.
 *
 * ── Resource coverage ──────────────────────────────────────────────
 * Unavailable: customer            — no customer resource in the API; listCustomers/getCustomer throw 501
 * Unavailable: charge (read)       — no payment list (bulk data only via the async POST /payments/report callback);
 *                                    GET /payments/{transactionId} needs HMAC signing + merchant ID this adapter
 *                                    lacks; listCharges/getCharge throw 501
 * Unavailable: refund (read)       — refunds are an action on a payment only; listRefunds throws 501
 * Unavailable: payout              — GET /settlements returns id/createdAt/settledAt only (no amount or currency);
 *                                    listPayouts/getPayout throw 501
 * Unavailable: balance-transaction — no balance/ledger endpoint; settlement list returns IDs only with no fee/net breakdown
 * Unavailable: dispute             — no dispute management endpoint in Paytrail API
 * Unavailable: invoice             — activate-invoice is an action only; no GET /invoices listing endpoint
 * Unavailable: payment-method      — tokenization endpoint creates one-off tokens; no saved-card listing endpoint
 * Unavailable: plan                — no subscription plan or pricing catalog endpoint
 * Unavailable: subscription        — recurring billing uses tokenized MIT charges, no subscription resource endpoint
 *
 * Sources: https://docs.paytrail.com/paytrail-api.yaml and https://docs.paytrail.com/README.md
 */

import type { BaseAdapter, CredentialField, Credentials, QueryParams } from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Charge } from '../../schema/charge'
import type { Customer } from '../../schema/customer'
import type { Payout } from '../../schema/payout'
import type { Refund } from '../../schema/refund'
import type { WebhookEvent } from '../../schema/webhook'

import { buildCredentials } from './auth'
import { PaytrailClient } from './client'
import { verifyPaytrailWebhook, parsePaytrailWebhookEvents } from './webhook'

import { transformRefund, type RawPaytrailRefund } from './transform/refund'

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

export class PaytrailAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'paytrail'
  readonly version = '0.1.0'

  getAuthUrl(): string {
    throw new Error('Paytrail uses an API key; submit it via the Connect Link form.')
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('Paytrail uses an API key; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return [
      {
        name: 'apiKey',
        label: 'API Secret',
        type: 'password',
        required: true,
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
    return verifyPaytrailWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parsePaytrailWebhookEvents(payload)
  }

  private client(credentials: Credentials): PaytrailClient {
    return new PaytrailClient(credentials)
  }

  // ── Reads Paytrail cannot serve ─────────────────────────────────
  // Checked against the first-party spec (https://docs.paytrail.com/paytrail-api.yaml)
  // and README (https://docs.paytrail.com/README.md). Every refusal throws before a
  // client is built, so nothing is sent.

  async listCustomers(_credentials: Credentials, _params: QueryParams): Promise<Customer[]> {
    throw notSupported(
      'Paytrail cannot list customers: the Paytrail API has no customer resource (no path in paytrail-api.yaml is /customers).',
    )
  }

  async getCustomer(_credentials: Credentials, _id: string): Promise<Customer> {
    throw notSupported(
      'Paytrail cannot read customers: the Paytrail API has no customer resource (no path in paytrail-api.yaml is /customers).',
    )
  }

  async listCharges(_credentials: Credentials, _params: QueryParams): Promise<Charge[]> {
    throw notSupported(
      'Paytrail cannot list charges: the only synchronous payment read is "`HTTP GET /payments/{transactionId}` returns payment information."; bulk payment data exists only as "`HTTP POST /payments/report` results in a callback containing the payment report."',
    )
  }

  /**
   * The documented read is GET /payments/{transactionId}, which needs HMAC-signed
   * checkout-* headers including checkout-account (merchant ID) and
   * checkout-transaction-id. This adapter neither collects the merchant ID nor
   * signs requests, so it cannot call it; the old GET /charges/{id} does not exist.
   */
  async getCharge(_credentials: Credentials, _id: string): Promise<Charge> {
    throw notSupported(
      'Paytrail getCharge is not supported by this adapter: the documented read "`HTTP GET /payments/{transactionId}`" requires signed checkout-* headers ("All API calls need to be signed using HMAC and SHA-256 or SHA-512.") carrying the merchant ID, which this connection does not collect.',
    )
  }

  async listRefunds(_credentials: Credentials, _params: QueryParams): Promise<Refund[]> {
    throw notSupported(
      'Paytrail cannot list refunds: refunds exist only as an action, "`HTTP POST /payments/{transactionId}/refund` refunds a payment by transaction ID."; no endpoint lists them.',
    )
  }

  // Write method, out of scope for the read rebuild. POST /refunds is not a documented
  // path; the documented one is POST /payments/{transactionId}/refund.
  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    const res = await this.client(credentials).post<{ data?: RawPaytrailRefund }>('/refunds', {
      chargeId: data.chargeId,
      amount: data.amount,
    })
    return transformRefund(res.data ?? {})
  }

  /**
   * GET /settlements exists, but each item is SettlementIdItem {id, createdAt,
   * settledAt} (the README example adds settlementReference). No amount or currency
   * is documented, and the canonical Payout requires both, so no Payout can be
   * built without inventing values.
   */
  async listPayouts(_credentials: Credentials, _params: QueryParams): Promise<Payout[]> {
    throw notSupported(
      'Paytrail cannot list payouts: "`HTTP GET /settlements` returns merchant\'s settlement IDs and corresponding bank references." Each item carries only id, createdAt, settledAt and settlementReference, with no settled amount or currency.',
    )
  }

  async getPayout(_credentials: Credentials, _id: string): Promise<Payout> {
    throw notSupported(
      'Paytrail cannot read payouts: there is no GET /settlements/{id}; the only per-settlement endpoint is "`HTTP POST /settlements/:id/payments/report` results in a callback containing the payment report."',
    )
  }
}
