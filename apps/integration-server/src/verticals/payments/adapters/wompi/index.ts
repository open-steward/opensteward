/**
 * Wompi adapter — payments vertical.
 *
 * Auth: API key (Bearer token).
 */

// ── Resource coverage ──────────────────────────────────────────────
// Available:   charge (get only), refund (create only)
// Unavailable: customer — no /customers path in the API reference
// Unavailable: charge list — GET /transactions documents no response schema
// Unavailable: refund list — GET /v1/refunds requires a merchant_id the connection does not hold
// Unavailable: balance-transaction — no per-transaction ledger endpoint; the payouts API exposes account-level balances only
// Unavailable: dispute — no disputes/chargebacks endpoint in Wompi's public API
// Unavailable: invoice — no invoice concept or endpoint in Wompi's public API
// Unavailable: payment-method — POST /v1/payment_sources exists for create/void but no GET list or read endpoint
// Unavailable: plan — merchant pricing tiers on the Wompi website; no /plans API endpoint
// Unavailable: subscription — recurring payments via tokenised payment sources; no /subscriptions endpoint
// Unverified:  payout — payouts API runs on a separate base URL (api.payouts.wompi.co/v1) with separate auth; not confirmed to wire into this adapter

import type { BaseAdapter, CredentialField, Credentials, QueryParams } from '@opensteward/shared'
import type { PaymentsAdapter } from '../../adapter/interface'
import type { Charge } from '../../schema/charge'
import type { Customer } from '../../schema/customer'
import type { Refund } from '../../schema/refund'
import type { WebhookEvent } from '../../schema/webhook'

import { buildCredentials } from './auth'
import { WompiClient } from './client'
import { verifyWompiWebhook, parseWompiWebhookEvents } from './webhook'

import { transformCharge, type RawWompiTransaction } from './transform/charge'
import { transformRefund, type RawWompiRefund } from './transform/refund'

function notSupported(message: string): Error {
  return Object.assign(new Error(message), { statusCode: 501, code: 'NOT_SUPPORTED' })
}

export class WompiAdapter implements PaymentsAdapter, BaseAdapter {
  readonly platform = 'wompi'
  readonly version = '0.1.0'

  getAuthUrl(): string {
    throw new Error('Wompi uses an API key; submit it via the Connect Link form.')
  }

  async exchangeCode(): Promise<Credentials> {
    throw new Error('Wompi uses an API key; call exchangeCredentials instead.')
  }

  credentialFields(): CredentialField[] {
    return [
      {
        name: 'apiKey',
        label: 'Private Key (prv_...)',
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
    return verifyWompiWebhook(payload, headers, secret)
  }

  parseWebhookEvents(payload: Record<string, unknown>): WebhookEvent[] {
    return parseWompiWebhookEvents(payload)
  }

  private client(credentials: Credentials): WompiClient {
    return new WompiClient(credentials)
  }

  // Wompi has no customer resource: the API reference
  // (https://api.swaggerhub.com/apis/waybox/wompi/1.2.0) lists no /customers
  // path; a customer appears only as customer_email on a transaction.
  async listCustomers(_credentials: Credentials, _params: QueryParams): Promise<Customer[]> {
    throw notSupported(
      "Wompi cannot list customers: its API reference has no /customers path; a customer exists only as a transaction's customer_email",
    )
  }

  async getCustomer(_credentials: Credentials, _id: string): Promise<Customer> {
    throw notSupported(
      "Wompi cannot read customers: its API reference has no /customers path; a customer exists only as a transaction's customer_email",
    )
  }

  // GET /transactions ("Buscar transacciones") needs from_date and until_date
  // ("Requerido si no se especifica reference"), and its 200 response is
  // documented with no schema at all ("content": {}) in every published
  // version of the spec, so neither the rows nor an end-of-list signal can be
  // read from documented fields.
  async listCharges(_credentials: Credentials, _params: QueryParams): Promise<Charge[]> {
    throw notSupported(
      'Wompi cannot list charges: GET /transactions requires from_date and until_date, and its 200 response is documented with no schema ("Transacciones que coincidan con los criterios de búsqueda", content: {})',
    )
  }

  // GET /transactions/{transaction_id}: "Dado un ID de transacción, el API
  // retorna su información", 200 = { data: Transaction }.
  async getCharge(credentials: Credentials, id: string): Promise<Charge> {
    const res = await this.client(credentials).get<{ data?: RawWompiTransaction }>(
      `/transactions/${encodeURIComponent(id)}`,
    )
    if (!res.data) throw new Error(`Wompi returned no data for transaction ${id}`)
    return transformCharge(res.data)
  }

  // https://docs.wompi.co/docs/colombia/reembolsos/: "GET
  // /v1/refunds?merchant_id={merchant_id}&region=CO. Los parámetros merchant_id
  // y region son obligatorios". The connection holds only the private key.
  async listRefunds(_credentials: Credentials, _params: QueryParams): Promise<Refund[]> {
    throw notSupported(
      'Wompi cannot list refunds for this connection: GET /v1/refunds requires merchant_id ("Los parámetros merchant_id y region son obligatorios"), and the connection stores only the private key',
    )
  }

  async createRefund(credentials: Credentials, data: Partial<Refund>): Promise<Refund> {
    const res = await this.client(credentials).post<{ data?: RawWompiRefund }>('/refunds', {
      chargeId: data.chargeId,
      amount: data.amount,
    })
    return transformRefund(res.data ?? {})
  }
}
