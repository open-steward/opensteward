/**
 * pawaPay adapter — payments vertical.
 *
 * Auth: API key (Bearer token).
 */

// ── Resource coverage ──────────────────────────────────────────────
// Available:   refund (createRefund only)
// Not listable: charge (deposit), payout, refund — pawaPay's v2 OpenAPI
//              (https://docs.pawapay.io/v2/api-reference/openapi_v2.yaml) defines
//              /v2/deposits, /v2/payouts and /v2/refunds as POST-only; every GET is a
//              single-id status check. The list methods, and the get methods that
//              sat on fabricated paths, throw 501 NOT_SUPPORTED before any request.
// Unavailable: customer — the API has no customer resource
// Unavailable: balance-transaction — no historical ledger; GET /v2/wallet-balances returns only a current snapshot per wallet
// Unavailable: dispute — mobile-money payments have no chargeback/dispute mechanism
// Unavailable: invoice — pawaPay has no invoicing system
// Unavailable: payment-method — no stored payment-method objects; payments routed by phone number (MSISDN)
// Unavailable: plan — no subscription billing catalogue
// Unavailable: subscription — no subscription management concept

import type { BaseAdapter, CredentialField, Credentials, QueryParams } from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Charge } from '../../schema/charge'
import type { Customer } from '../../schema/customer'
import type { Payout } from '../../schema/payout'
import type { Refund } from '../../schema/refund'
import type { WebhookEvent } from '../../schema/webhook'

import { buildCredentials } from './auth'
import { PawapayClient } from './client'
import { verifyPawapayWebhook, parsePawapayWebhookEvents } from './webhook'

import { transformRefund, type RawPawaPayRefund } from './transform/refund'

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

export class PawapayAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'pawapay'
  readonly version = '0.1.0'

  getAuthUrl(): string {
    throw new Error('pawaPay uses an API key; submit it via the Connect Link form.')
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('pawaPay uses an API key; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return [
      {
        name: 'apiKey',
        label: 'API Token',
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
    return verifyPawapayWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parsePawapayWebhookEvents(payload)
  }

  private client(credentials: Credentials): PawapayClient {
    return new PawapayClient(credentials)
  }

  async listCustomers(_credentials: Credentials, _params: QueryParams): Promise<Customer[]> {
    throw notSupported(
      'pawaPay cannot list customers: the API has no customer resource (payments are routed by phone number).',
    )
  }

  async getCustomer(_credentials: Credentials, _id: string): Promise<Customer> {
    throw notSupported(
      'pawaPay cannot get a customer: the API has no customer resource (payments are routed by phone number).',
    )
  }

  async listCharges(_credentials: Credentials, _params: QueryParams): Promise<Charge[]> {
    throw notSupported(
      'pawaPay cannot list deposits: /v2/deposits is POST-only ("Initiate deposit"); the only read is GET /v2/deposits/{depositId}, "Get the current status of a deposit based on its `depositId`."',
    )
  }

  async getCharge(_credentials: Credentials, _id: string): Promise<Charge> {
    throw notSupported(
      'pawaPay getCharge is not wired to the documented lookup GET /v2/deposits/{depositId}; the previous GET /charges/{id} does not exist.',
    )
  }

  async listRefunds(_credentials: Credentials, _params: QueryParams): Promise<Refund[]> {
    throw notSupported(
      'pawaPay cannot list refunds: /v2/refunds is POST-only ("Initiate refund"); the only read is GET /v2/refunds/{refundId}, "Get the current status of the refund based on its `refundId`."',
    )
  }

  // Write method, out of this rebuild's scope. NOTE: posts a non-vendor body to the
  // unversioned /refunds; the documented request is POST /v2/refunds keyed by
  // refundId and depositId.
  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    const res = await this.client(credentials).post<{ data?: RawPawaPayRefund }>('/refunds', {
      chargeId: data.chargeId,
      amount: data.amount,
    })
    return transformRefund(res.data ?? {})
  }

  // ── Payouts ────────────────────────────────────────────────────────────

  async listPayouts(_credentials: Credentials, _params: QueryParams): Promise<Payout[]> {
    throw notSupported(
      'pawaPay cannot list payouts: /v2/payouts is POST-only ("Initiate payout"); the only read is GET /v2/payouts/{payoutId}, "Get the current status of the payout based on its `payoutId`."',
    )
  }

  async getPayout(_credentials: Credentials, _id: string): Promise<Payout> {
    throw notSupported(
      'pawaPay getPayout is not wired to the documented lookup GET /v2/payouts/{payoutId}; the previous GET /disbursements/{id} does not exist.',
    )
  }
}
